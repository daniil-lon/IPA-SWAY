import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixtureWorker,fixtureAssets} from './worker-fixture.mjs';
import {recoverPublishedCatalog} from '../catalog-recovery.mjs';

const quota="D1_ERROR: Your account has exceeded D1's free tier daily row read limit.";
const brokenDB=message=>({prepare(){throw new Error(message);}});
const origin='https://catalog.test';
const worker=await fixtureWorker('catalog-quota');
const env={ASSETS:fixtureAssets,DB:brokenDB(quota),REQUIRE_YANDEX_LOGIN:'0'};
const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env);
const response=await call('/api/catalog?plan=1');
assert.equal(response.status,200,'An exhausted D1 quota must not take down the published music catalogue');
const first=await response.json();assert.ok(first.items.length&&first.next);
assert.ok(first.pages.length>10);assert.equal(first.total,7000);
const pages=await Promise.all(first.pages.map(offset=>call('/api/catalog?offset='+offset+'&v='+first.version).then(r=>r.json())));
const items=[...first.items,...pages.flatMap(p=>p.items)];
assert.equal(items.length,first.total);assert.equal(new Set(items.map(t=>t.id)).size,first.total);
assert.ok(items.every(t=>t.art&&t.audio&&Array.isArray(t.artists)));
for(const method of ['GET','HEAD']){
 const artwork=await call('/api/artwork?id='+encodeURIComponent(first.items[0].id),{method});
 assert.equal(artwork.status,200,'System artwork remains public and available when D1 has no read quota');
 assert.match(artwork.headers.get('Content-Type'),/^image\//);
 if(method==='GET')assert.ok((await artwork.arrayBuffer()).byteLength>100);
 else assert.equal((await artwork.arrayBuffer()).byteLength,0,'HEAD provides image headers without a response body');
}
const snapshot=await recoverPublishedCatalog(first.items,{custom:[],languages:[{id:first.items[0].id,language:'ru'}],overrides:[{track:first.items[0].id,metadata:{hidden:true,title:'Published correction'}}]});
assert.equal(snapshot[0].hidden,true);assert.equal(snapshot[0].title,'Published correction');assert.equal(snapshot[0].language,'ru');
assert.equal((await call('/api/catalog?v=changed')).status,409);
assert.equal((await call('/api/catalog?offset=-1')).status,400);

// A public snapshot must never replace a failed authentication check.
env.REQUIRE_YANDEX_LOGIN='1';
for(const path of ['/api/catalog','/catalog.json','/api/media-part?path=/media/test.mp3','/api/media-socket?path=/media/test.mp3']){
 const denied=await call(path);assert.equal(denied.status,401);assert.equal((await denied.json()).error,'login_required');
}
const authenticatedFailure=await call('/api/catalog',{headers:{Cookie:'tonika_session='+'x'.repeat(43)}});
assert.equal(authenticatedFailure.status,503);

// Unrelated database defects remain visible rather than silently losing edits.
const defective=await fixtureWorker('catalog-defect');
const defect=await defective.fetch(new Request(origin+'/api/catalog'),{...env,REQUIRE_YANDEX_LOGIN:'0',DB:brokenDB('D1_ERROR: no such table: catalog_overrides')});
assert.equal(defect.status,503);
assert.equal((await defective.fetch(new Request(origin+'/api/artwork?id='+encodeURIComponent(first.items[0].id)),{...env,REQUIRE_YANDEX_LOGIN:'0',DB:brokenDB('D1_ERROR: no such table: catalog_overrides')})).status,503);

// A running isolate keeps its newer successful metadata if D1 later fails.
let exhausted=false;
const cachedWorker=await fixtureWorker('catalog-last-good');
const DB={prepare(sql){if(exhausted)throw new Error(quota);return {first:async()=>null,all:async()=>({results:sql.includes('FROM catalog_overrides')?[{track:first.items[0].id,metadata:JSON.stringify({hidden:true})}]:[]})};}};
const cachedEnv={ASSETS:fixtureAssets,DB,REQUIRE_YANDEX_LOGIN:'0'};
const healthy=await cachedWorker.fetch(new Request(origin+'/api/catalog'),cachedEnv).then(r=>r.json());
assert.equal(healthy.total,6999);exhausted=true;
const clock=Date.now;Date.now=()=>clock()+11000;
try{const stale=await cachedWorker.fetch(new Request(origin+'/api/catalog'),cachedEnv).then(r=>r.json());assert.equal(stale.total,healthy.total);assert.equal(stale.version,healthy.version);assert.ok(stale.items.every(t=>t.id!==first.items[0].id));}finally{Date.now=clock;}
await writeFile('artifacts/loading-recovery/catalog-validation.json',JSON.stringify({at:new Date().toISOString(),total:items.length,unique:new Set(items.map(t=>t.id)).size,quotaFallback:true,loginGuard:true,otherDefectsVisible:true},null,2));
console.log('PASS: full catalogue and system artwork during the D1 quota failure, exact paging/version, login guard and unrelated-error rejection');
