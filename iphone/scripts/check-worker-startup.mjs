import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startupWorker} from '../worker-startup.mjs';
const body=await readFile('public/sw.js'),request=method=>new Request('https://sway.test/sw.js',{method});
let fetched;
const env={ASSETS:{fetch:async req=>{fetched=req;return new Response(body,{headers:{'Content-Type':'text/javascript','X-Sway-Size':String(body.length),'Content-Security-Policy':"default-src 'self'"}});}}};
for(const method of ['GET','HEAD']){
 const response=await startupWorker(request(method),env);
 assert.equal(response.status,200);assert.equal(fetched.headers.get('Accept-Encoding'),'identity');
 assert.equal(response.headers.get('Content-Encoding'),'identity');assert.equal(response.headers.get('Content-Length'),String(body.length));assert.ok(response.headers.get('Cache-Control').includes('no-transform'));
 assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'self'");
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):body);
}
assert.equal((await startupWorker(request('POST'),env)).status,405);
assert.equal((await startupWorker(new Request('https://sway.test/admin.js'),env)).status,404);
assert.equal((await startupWorker(new Request('https://sway.test/sw-part-0cf49f59c7108c1b.js'),env)).status,404);
assert.equal((await startupWorker(request('GET'),{ASSETS:{fetch:async()=>new Response('prefix',{headers:{'X-Sway-Size':String(body.length)}})}})).status,502);
assert.equal((await startupWorker(request('GET'),{ASSETS:{fetch:async()=>new Response(null,{status:404})}})).status,404);
const compressed=await startupWorker(new Request('https://sway.test/sw.js',{headers:{'Accept-Encoding':'gzip, deflate, br'}}),env);
assert.equal(compressed.headers.get('Content-Encoding'),'gzip');
assert.equal(compressed.headers.get('X-Sway-Size'),String(body.length));
const encoded=await compressed.arrayBuffer();assert.ok(encoded.byteLength<8192);
assert.deepEqual(Buffer.from(await new Response(new Blob([encoded]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),body);
const identity=await startupWorker(new Request('https://sway.test/sw.js',{headers:{'Accept-Encoding':'gzip;q=0, identity'}}),env);
assert.equal(identity.headers.get('Content-Encoding'),'identity');
console.log('PASS: buffered identity startup script, exact length, preserved CSP, HEAD, method and truncation guards');
