import assert from "node:assert/strict";
import test from "node:test";
import {readApprovedNativeMenu, type NativeMenuOptions} from "../../../services/native-menu-client";
const item={id:"approved-menu",name:"Nasi Lemak",description:"Disemak",section:"makanan",category:"Sarapan",price:9.5,currency:"MYR",available:false,imageUrl:"",sortOrder:0};
const options:NativeMenuOptions={enabled:true,url:"https://native.supabase.co",key:"public-key",allowDestination:()=>true,fetchImpl:async()=>Response.json({canonicalPlaceId:"canonical-a",menuItems:[item]})};
test("approved native menu preserves price and sold-out availability",async()=>{assert.deepEqual(await readApprovedNativeMenu("canonical-a",options),[item]);});
test("disabled native integration and denied egress never contact a backend",async()=>{
 let called=false;const fetchImpl=async()=>{called=true;throw new Error("must not contact");};
 assert.equal(await readApprovedNativeMenu("canonical-a",{...options,enabled:false,fetchImpl}),null);
 await assert.rejects(readApprovedNativeMenu("canonical-a",{...options,allowDestination:()=>false,fetchImpl}));assert.equal(called,false);
});
test("withdrawal is an empty authoritative menu, while no publication preserves legacy",async()=>{
 assert.deepEqual(await readApprovedNativeMenu("canonical-a",{...options,fetchImpl:async()=>Response.json({canonicalPlaceId:"canonical-a",menuItems:[]})}),[]);
 assert.equal(await readApprovedNativeMenu("canonical-a",{...options,fetchImpl:async()=>Response.json({}, {status:404})}),null);
 await assert.rejects(readApprovedNativeMenu("canonical-a",{...options,fetchImpl:async()=>Response.json({}, {status:503})}));
});
test("canonical mismatch and external media fail closed",async()=>{
 for(const body of [{canonicalPlaceId:"wrong",menuItems:[item]},{canonicalPlaceId:"canonical-a",menuItems:[{...item,imageUrl:"https://external.example/x"}]}]){
  await assert.rejects(readApprovedNativeMenu("canonical-a",{...options,fetchImpl:async()=>Response.json(body)}));
 }
});
