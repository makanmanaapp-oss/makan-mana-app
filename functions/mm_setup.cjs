const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'makanmana-c59f3' });
const db = getFirestore();
const API_KEY='AIzaSyB_xtQQsF4eIDZILzRf-Xbm1xX76JPWs28';
const url=(fn)=>`https://asia-southeast1-makanmana-c59f3.cloudfunctions.net/${fn}`;
const DEVICE='bLGKMVwZ0OOMlQwGhPTBdZDRZ8i2'; // QA-B (phone)
async function signUp(tag){const email=`qa_ginv_${tag}_${Date.now()}@makanmanaqa.test`;const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'QaGinv!2026x',returnSecureToken:true})});const j=await r.json();if(!j.idToken)throw new Error('signup '+JSON.stringify(j));await db.collection('users').doc(j.localId).set({displayName:'QA '+tag},{merge:true});return {idToken:j.idToken,uid:j.localId};}
async function call(fn,tok,data){const r=await fetch(url(fn),{method:'POST',headers:{'Authorization':`Bearer ${tok}`,'Content-Type':'application/json'},body:JSON.stringify({data})});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j={raw:t.slice(0,200)}}return {status:r.status,body:(j.result??j)};}
function mask(s){return s?String(s).slice(0,6)+'…':s;}
(async()=>{
  const A=await signUp('A'); const C=await signUp('C');
  console.log('QA-A',mask(A.uid),'QA-C',mask(C.uid),'QA-B(device)',mask(DEVICE));
  const g=await call('createGroupV2',A.idToken,{name:'QA Invite Test Group',emoji:'🍜',privacy:'private'});
  const groupId=g.body.groupId||g.body.id||g.body.group?.id;
  console.log('createGroup status',g.status,'groupId',mask(groupId), groupId?'':JSON.stringify(g.body).slice(0,150));
  if(!groupId){process.exit(1);}
  const inv=await call('inviteToGroup',A.idToken,{groupId,targetUid:DEVICE});
  console.log('inviteToGroup status',inv.status,'inviteId',mask(inv.body.inviteId));
  // verify notification created for device, not for QA-C
  await new Promise(r=>setTimeout(r,1500));
  const bn=await db.collection('users').doc(DEVICE).collection('notifications').where('type','==','group_invite').get();
  const cn=await db.collection('users').doc(C.uid).collection('notifications').where('type','==','group_invite').get();
  console.log('QA-B(device) group_invite notifications:',bn.size);
  bn.docs.forEach(d=>{const x=d.data();console.log('   entityType='+x.entityType,'entityId='+mask(x.entityId),'parentEntityId='+mask(x.parentEntityId),'isRead='+x.isRead);});
  console.log('QA-C group_invite notifications:',cn.size,'(must be 0)');
  console.log('GROUP_ID',groupId,'INVITE_ID',inv.body.inviteId);
  // save state for later verification/cleanup
  require('fs').writeFileSync('mm_qa_state.json',JSON.stringify({A:A.uid,C:C.uid,groupId,inviteId:inv.body.inviteId}));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
