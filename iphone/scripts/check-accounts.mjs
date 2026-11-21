import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fixtureWorker,fixtureAssets} from './worker-fixture.mjs';
const origin='https://tonika.test';
const expected=new Map();
const db=new DatabaseSync(':memory:');
const worker=await fixtureWorker('accounts');
function prepare(sql,...params){
 const statement=db.prepare(sql);
 return {bind:(...values)=>prepare(sql,...values),first:async()=>statement.get(...params),all:async()=>({results:statement.all(...params)}),run:async()=>statement.run(...params)};
}
const DB={prepare,batch:async statements=>{
 db.exec('BEGIN');
 try{for(const statement of statements)await statement.run();db.exec('COMMIT');}
 catch(e){db.exec('ROLLBACK');throw e;}
}};
const ASSETS=fixtureAssets;
const env={DB,ASSETS,REQUIRE_YANDEX_LOGIN:'1',PUBLIC_ORIGIN:origin,YANDEX_CLIENT_ID:'local-test-id',YANDEX_CLIENT_SECRET:'local-test-secret'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,init)=>{
 const req=new Request(url,init),u=new URL(req.url);
 assert.equal(req.redirect,'manual','Workers supports manual redirects; OAuth credentials must not follow a redirect');
 if(u.hostname==='oauth.yandex.ru'&&u.pathname==='/token'){
  const body=new URLSearchParams(await req.text()),code=body.get('code'),challenge=createHash('sha256').update(body.get('code_verifier')||'').digest('base64url');
  assert.equal(body.get('client_id'),'local-test-id');
  assert.equal(body.get('grant_type'),'authorization_code');
  assert.equal(challenge,expected.get(code));
  if(code==='fixture-rejected')return Response.json({error:'invalid_grant',error_description:'fixture-detail'},{status:400});
  return Response.json({access_token:code});
 }
 if(u.hostname==='login.yandex.ru'&&u.pathname==='/info'){
  const id=req.headers.get('authorization')?.slice(6);
  assert.ok(expected.has(id));
  return Response.json({id,display_name:'Слушатель '+id,...portraits.get(id)});
 }
 throw new Error('Unexpected outbound request');
};
const call=(path,opts={})=>worker.fetch(new Request(origin+path,{redirect:'manual',...opts}),env);
const oneCookie=(r,name)=>r.headers.getSetCookie().find(c=>c.startsWith(name+'=')).split(';')[0];
const portraits=new Map([['user-a',{default_avatar_id:'42/a-valid-id',is_avatar_empty:false}],['user-b',{default_avatar_id:'42/placeholder',is_avatar_empty:true}]]);
async function login(id){
 const start=await call('/auth/yandex');
 assert.equal(start.status,303);assert.match(start.headers.get('set-cookie'),/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
 const redirect=new URL(start.headers.get('location'));
 assert.equal(redirect.origin,'https://oauth.yandex.ru');
 assert.equal(redirect.searchParams.get('redirect_uri'),origin+'/auth/yandex/callback');
 assert.equal(redirect.searchParams.get('scope'),'login:info');
 assert.equal(redirect.searchParams.get('optional_scope'),'login:avatar');
 assert.equal(redirect.searchParams.get('code_challenge_method'),'S256');
 expected.set(id,redirect.searchParams.get('code_challenge'));
 const tx=oneCookie(start,'tonika_oauth'), state=redirect.searchParams.get('state');
 const cancel=await call('/auth/yandex/callback?code='+id+'&state=wrong',{headers:{Cookie:tx}});
 assert.match(cancel.headers.get('location'),/login=canceled/);
 if(id==='user-a'){
  const denied=await call('/auth/yandex/callback?error=unauthorized_client&state='+state,{headers:{Cookie:tx}});
  assert.equal(denied.headers.get('location'),'/?login=provider_config#settings');
  expected.set('fixture-rejected',redirect.searchParams.get('code_challenge'));
  const rejected=await call('/auth/yandex/callback?code=fixture-rejected&state='+state,{headers:{Cookie:tx}});
  assert.equal(rejected.headers.get('location'),'/?login=code_rejected#settings');
  assert.equal(rejected.headers.getSetCookie().some(c=>c.startsWith('tonika_session=')),false);
 }
 const done=await call('/auth/yandex/callback?code='+id+'&state='+state,{headers:{Cookie:tx}});
 assert.equal(done.headers.get('location'),'/#home');
 assert.match(done.headers.getSetCookie().join('; '),/tonika_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
 return oneCookie(done,'tonika_session');
}
const me=async cookie=>call('/api/me',{headers:{Cookie:cookie}}).then(r=>r.json());
const mutate=(cookie,method,path,body={},requestOrigin=origin)=>call(path,{method,headers:{Origin:requestOrigin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
try{

 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile('migrations/'+file,'utf8'));
 const get=(path,cookie)=>call(path,cookie?{headers:{Cookie:cookie}}:{});
 for(const path of ['/catalog.json','/media/example.mp3','/api/profile','/api/profiles/example'])assert.equal((await get(path)).status,401,path);
 assert.equal((await get('/')).status,200);
 assert.deepEqual(await (await get('/api/me')).json(),{user:null,loginConfigured:true,loginRequired:true});
 const a=await login('user-a'),b=await login('user-b');
 const taste={artists:['Sway','Другой исполнитель'],genres:['Эмбиент']};
 assert.equal((await mutate(a,'PUT','/api/taste',taste,'https://other.test')).status,403);
 assert.equal((await mutate(a,'PUT','/api/taste',{...taste,genres:Array(6).fill('Поп')})).status,400);
 assert.equal((await mutate(a,'PUT','/api/taste',taste)).status,200);
 assert.deepEqual(await (await get('/api/taste',a)).json(),taste);
 assert.deepEqual(await (await get('/api/taste',b)).json(),{artists:[],genres:[]});
 const yandexImage='/api/profile/yandex-avatar';
 assert.equal((await get(yandexImage)).status,401);
 const portrait=await get(yandexImage,a);
 assert.equal(portrait.status,302);
 assert.equal(portrait.headers.get('location'),'https://avatars.yandex.net/get-yapic/42/a-valid-id/islands-200');
 assert.equal((await get(yandexImage,b)).status,404);
 assert.equal((await me(a)).user.name,'Слушатель user-a');
 assert.equal((await me(b)).user.name,'Слушатель user-b');
 const entitledAsset=await get('/catalog.json',a);
 assert.equal(entitledAsset.status,200);assert.equal(entitledAsset.headers.get('cache-control'),'private, no-store');
 assert.equal((await get('/media/example.mp3',a)).status,404,'Authenticated requests reach the real assets binding');
 const preferences={name:'Студия',volume:.36,autoplay:false,motion:false,crossfade:false,wavePattern:'petals',waveMark:'🎧🌙✧'};
 assert.equal((await mutate(a,'PATCH','/api/me',preferences)).status,200);
 assert.deepEqual((await me(a)).user,{id:'user-a',...preferences});
 assert.equal((await mutate(a,'PATCH','/api/me',preferences,'https://other.test')).status,403);
 assert.equal((await mutate(a,'PATCH','/api/me',{...preferences,wavePattern:'unknown'})).status,400);
 assert.equal((await mutate(a,'PATCH','/api/me',{...preferences,waveMark:'abcdef'})).status,400);
 const targetTrack = 'morgenshtern-aristocrat';
 const p={name:'Студия',handle:'studio',bio:'Мой профиль',visible:false,profileTrack:targetTrack,coverZoom:145};
 const jpeg=Buffer.alloc(60);jpeg[0]=255;jpeg[1]=216;jpeg[2]=255;jpeg[58]=255;jpeg[59]=217;
 const avatar='data:image/jpeg;base64,'+jpeg.toString('base64');
 assert.equal((await mutate(a,'PATCH','/api/profile',{...p,avatar:'data:text/html,invalid'})).status,400);
 assert.equal((await mutate(a,'PATCH','/api/profile',{...p,profileTrack:'made-up'})).status,400);
 assert.equal((await mutate(a,'PATCH','/api/profile',{...p,avatar,cover:avatar},'https://other.test')).status,403);
 const edited=await mutate(a,'PATCH','/api/profile',{...p,avatar,cover:avatar});
 assert.equal(edited.status,200);
 assert.deepEqual({...await edited.json(),joinedAt:0},{...p,joinedAt:0,hasAvatar:true,hasCover:true,hasYandexAvatar:true});
 assert.equal((await get('/api/profiles/studio',b)).status,404);
 assert.equal((await get('/api/profiles/studio/avatar',b)).status,404);
 assert.equal((await mutate(b,'PATCH','/api/profile',{...p,name:'Дубль'})).status,409);
 assert.equal((await me(b)).user.name,'Слушатель user-b','name update should roll back if the handle was taken');
 assert.equal((await mutate(a,'PATCH','/api/profile',{...p,visible:true,cover:null})).status,200);
 const shared=await (await get('/api/profiles/studio',b)).json();
 assert.equal(shared.visible,true);assert.equal(shared.hasAvatar,true);assert.equal(shared.hasCover,false);
 const art=await get('/api/profiles/studio/avatar',b);
 assert.equal(art.headers.get('content-type'),'image/jpeg');assert.equal(art.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(Buffer.from(await art.arrayBuffer()),jpeg);
 assert.equal((await get('/api/profile/avatar',b)).status,404);
 assert.equal((await (await mutate(a,'PATCH','/api/profile',{...p,visible:true,avatar:null})).json()).hasYandexAvatar,true);
 assert.equal((await get('/api/profiles/studio/avatar',b)).status,404);
 assert.equal((await (await get('/api/profiles/studio',b)).json()).hasYandexAvatar,undefined);
 db.prepare("INSERT INTO subscriptions(uid,plan,status) VALUES(?,?,?)").run('user-a','future','pending');
 assert.equal((await mutate(a,'PUT','/api/likes/'+targetTrack)).status,200);
 assert.deepEqual((await me(a)).likes,[targetTrack]);
 assert.deepEqual((await me(b)).likes,[]);
 assert.equal((await mutate(a,'POST','/api/logout')).status,204);
 assert.equal((await me(a)).user,null);
 portraits.delete('user-a');
 const aAgain=await login('user-a');
 assert.equal((await get(yandexImage,aAgain)).status,404);
 assert.deepEqual((await me(aAgain)).user,{id:'user-a',...preferences});
 assert.deepEqual((await me(aAgain)).likes,[targetTrack]);
 assert.deepEqual((await me(aAgain)).taste,taste,'artist preferences survive logout and login');
 assert.equal((await mutate(aAgain,'DELETE','/api/me')).status,204);
 assert.equal((await me(aAgain)).user,null);
 assert.equal((await me(b)).user.name,'Слушатель user-b');
 assert.equal((db.prepare('SELECT count(*) AS n FROM likes').get()).n,0);
 assert.equal((db.prepare('SELECT count(*) AS n FROM subscriptions').get()).n,0);
 assert.equal((db.prepare('SELECT count(*) AS n FROM user_taste').get()).n,0,'deletion removes artist preferences');
 assert.equal((await get('/api/profiles/studio',b)).status,404);
 console.log('OAuth fixture: redirect, PKCE and state. Passed: mandatory login, persistence, private images, sharing, isolation and account deletion.');
}finally{globalThis.fetch=originalFetch;db.close();}
