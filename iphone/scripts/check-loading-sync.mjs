import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {servePlayer} from './player-fixture.mjs';
const fixture=await servePlayer(),browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(fixture.origin+'/offline.html');
 const fallback=await page.evaluate(async()=>{
  const {loadCatalog}=await import('/catalog-loader.js');
  const result=await loadCatalog(()=>{});await result.complete;
  return {count:result.items.length,settled:result.settled};
 });
 assert.equal(fallback.count,2);assert.equal(fallback.settled,true,'A full JSON fallback must finish queue restoration');
 const isolation=await page.evaluate(async()=>{
  const {createListeningAccount}=await import('/listening-account.js');
  let user={id:'owner-a'},finishHistory,finishPlayback;
  const histories=[],changes=[];
  const account=createListeningAccount({getUser:()=>user,getTrack:()=>({}),getSnapshot:()=>null,applySnapshot:()=>{},onHistory:ids=>histories.push(ids),onChange:()=>changes.push(account.remote),api:async path=>{
   if(user.id==='owner-a'&&path==='/api/playback')return new Promise(resolve=>finishPlayback=resolve);
   if(user.id==='owner-b'&&path==='/api/history')return new Promise(resolve=>finishHistory=resolve);
   return {revision:1,device:'another-device',snapshot:{current:'track-'+user.id}};
  }});
  const a=account.load();await new Promise(r=>setTimeout(r));user={id:'owner-b'};const b=account.load();await new Promise(r=>setTimeout(r));
  finishPlayback({revision:30,device:'old-device',snapshot:{current:'private-owner-a'}});finishHistory({tracks:['owner-b-track']});await Promise.all([a,b]);
  return {current:account.remote?.snapshot.current,histories};
 });
 assert.equal(isolation.current,'track-owner-b','A late response must never replace the new account state');assert.deepEqual(isolation.histories,[['owner-b-track']]);
 const context=await browser.newContext(),parallel=await context.newPage();let active=0,maximum=0,failed=false;
 await parallel.route('**/api/catalog?**',async route=>{
  const offset=Number(new URL(route.request().url()).searchParams.get('offset'));active++;maximum=Math.max(maximum,active);
  await new Promise(r=>setTimeout(r,offset===1?140:35));active--;
  if(offset===2&&!failed){failed=true;await route.fulfill({status:503,body:'retry'});return;}
  const data={items:[{id:'t'+offset}],total:6,next:offset===5?null:offset+1,version:'test-version',...(offset===0?{pages:[1,2,3,4,5]}:{})};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await parallel.goto(fixture.origin+'/offline.html');
 const paged=await parallel.evaluate(async()=>{const {loadCatalog}=await import('/catalog-loader.js');const result=await loadCatalog(()=>{});return {initial:result.items.length,ids:(await result.complete).map(t=>t.id)};});
 assert.equal(paged.initial,1);assert.deepEqual(paged.ids,['t0','t1','t2','t3','t4','t5']);assert.ok(maximum>1&&maximum<=4);assert.equal(failed,true);await context.close();
 console.log('PASS full catalogue fallback completion, ordered parallel loading/retry, and account-switch response isolation');
}finally{await browser.close();fixture.server.close();}
