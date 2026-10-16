// Copied verbatim to the existing app backend. No Firebase or Supabase SDK is
// required: this reads only the public approved Supabase projection.
export type NativeMenuOptions={enabled:boolean;url:string;key:string;allowDestination:(url:string)=>boolean;fetchImpl?:typeof fetch};
export type NativeMenuItem={id:string;section:"makanan"|"minuman";category:string;name:string;description:string;price:number;currency:"MYR";available:boolean;imageUrl:string;sortOrder:number};
export async function readApprovedNativeMenu(canonicalPlaceId:string,options:NativeMenuOptions):Promise<NativeMenuItem[]|null>{
 if(!options.enabled)return null;
 const base=new URL(options.url);
 const local=['127.0.0.1','localhost'].includes(base.hostname)&&base.protocol==='http:';
 if(!local&&(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')))throw new Error('Invalid native menu origin');
 if(base.username||base.password||base.pathname!=='/'||base.search||base.hash||!options.key||!canonicalPlaceId||canonicalPlaceId.length>300)throw new Error('Invalid native menu configuration');
 if(!options.allowDestination(base.href))throw new Error('Native menu egress denied');
 const response=await (options.fetchImpl??fetch)(new URL('/functions/v1/merchant-api',base),{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',apikey:options.key},
  body:JSON.stringify({action:'public_menu',canonical_place_id:canonicalPlaceId}),
 });
 // No native publication yet: the existing curated public menu remains valid.
 if(response.status===404)return null;
 if(!response.ok)throw new Error('Native menu read unavailable');
 const body=await response.json() as {canonicalPlaceId?:unknown;menuItems?:unknown};
 if(body.canonicalPlaceId!==canonicalPlaceId||!Array.isArray(body.menuItems)||body.menuItems.length>200)throw new Error('Invalid native menu response');
 return body.menuItems.map((value:unknown)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid menu item');
  const item=value as Record<string,unknown>;
  if(typeof item.id!=='string'||typeof item.name!=='string'||item.name.length>120||typeof item.description!=='string'||item.description.length>400||
   !['makanan','minuman'].includes(String(item.section))||item.currency!=='MYR'||typeof item.price!=='number'||!Number.isFinite(item.price)||item.price<0||item.price>100000||typeof item.available!=='boolean'||typeof item.category!=='string'||item.category.length>80||!Number.isInteger(item.sortOrder)||Number(item.sortOrder)<0||Number(item.sortOrder)>100000)throw new Error('Invalid menu item');
  let imageUrl='';
  if(item.imageUrl){const signed=new URL(String(item.imageUrl),base);if(signed.origin!==base.origin||!signed.pathname.startsWith('/storage/v1/object/sign/merchant-media/'))throw new Error('Invalid menu image');imageUrl=signed.href;}
  return {id:item.id,name:item.name,description:item.description,section:item.section as 'makanan'|'minuman',category:item.category,price:item.price,currency:'MYR' as const,available:item.available,imageUrl,sortOrder:item.sortOrder as number};
 });
}
