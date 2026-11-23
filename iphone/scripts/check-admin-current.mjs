import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fixtureWorker,fixtureAssets} from './worker-fixture.mjs';
const db=new DatabaseSync(':memory:');
for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile('migrations/'+file,'utf8'));
function prepare(sql,...args){const s=db.prepare(sql);return {bind:(...values)=>prepare(sql,...values),first:async()=>s.get(...args),all:async()=>({results:s.all(...args)}),run:async()=>s.run(...args)};}
const DB={prepare,batch:async statements=>{db.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());db.exec('COMMIT');return values;}catch(error){db.exec('ROLLBACK');throw error;}}};
const worker=await fixtureWorker('admin'),origin='https://sway.test';
const env={DB,ASSETS:fixtureAssets,REQUIRE_YANDEX_LOGIN:'0',PUBLIC_ORIGIN:origin,ADMIN_SETUP_TOKEN:'local-audit-setup-token'};
let cookie='';
const call=(path,body,extra={})=>worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})}),env);
const cookieOf=response=>response.headers.getSetCookie().find(c=>c.startsWith('sway_admin_token='))?.split(';')[0];
try{
 assert.deepEqual(await (await call('/api/admin/status')).json(),{authenticated:false,configured:false});
 assert.equal((await call('/api/admin/overview')).status,401);
 for(const path of ['/api/admin/login','/api/admin/setup'])for(const password of [123,[],{},null]){
  const response=await call(path,{password},{'X-Admin-Setup-Token':env.ADMIN_SETUP_TOKEN});
  assert.equal(response.status,400,path+' rejects non-string password');
 }
 const setup=await call('/api/admin/setup',{password:'AuditPassword2026!'},{'X-Admin-Setup-Token':env.ADMIN_SETUP_TOKEN});
 assert.equal(setup.status,200);cookie=cookieOf(setup);assert.ok(cookie);
 assert.deepEqual(await (await call('/api/admin/status')).json(),{authenticated:true,configured:true});
 for(const path of ['/api/admin/promo','/api/admin/editorial-playlists','/api/admin/broadcasts']){
  const invalid=[null,{title:123,message:123},path.endsWith('editorial-playlists')?{title:'Test',slug:123}:path.endsWith('broadcasts')?{title:'Test',message:123}:{title:'Test',subtitle:123}];
  for(const body of invalid){
   const response=await call(path,body);assert.equal(response.status,400,path+' rejects malformed content');
  }
 }
 const upload=(type='audio/mpeg',name='audit.mp3')=>{const form=new FormData();form.set('file',new File([new Uint8Array([73,68,51,4,0,0,0,0,0,0,255,251,144,0])],name,{type}));form.set('title','Audit track');form.set('artist','Audit');form.set('seconds','10');return form;};
 assert.equal((await call('/api/admin/uploads',upload('audio/wav','audit.wav'))).status,415,'Do not disguise WAV as MP3');
 db.exec("CREATE TRIGGER audit_reject_upload BEFORE INSERT ON custom_tracks BEGIN SELECT RAISE(FAIL, 'audit metadata failure'); END");
 assert.equal((await call('/api/admin/uploads',upload())).status,500);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_audio_chunks').get().n,0,'Failed metadata must not leave orphan audio chunks');
 db.exec('DROP TRIGGER audit_reject_upload');
 const response=await call('/api/admin/uploads',upload());assert.equal(response.status,200);const saved=await response.json();assert.ok(saved.id);
 const media=await call(saved.audio);assert.equal(media.status,200);assert.equal((await media.arrayBuffer()).byteLength,14);
 const removed=await worker.fetch(new Request(origin+'/api/admin/uploads?id='+saved.id,{method:'DELETE',headers:{Origin:origin,Cookie:cookie}}),env);assert.equal(removed.status,200);
 assert.equal((await call(saved.audio)).status,404);
 assert.equal((await call('/api/admin/logout',{})).status,200);assert.equal((await call('/api/admin/overview')).status,401);
 console.log('PASS: current admin contract, setup/session/logout, malformed credentials/content, MP3 uploads, failed-upload cleanup, streaming and deletion');
}finally{db.close();}
