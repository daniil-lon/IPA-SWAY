// The ranged media path must serve exact bytes with and without a Content-Length from the assets binding.
import assert from 'node:assert/strict';
import {media} from '../media.mjs';
globalThis.FixedLengthStream??=class{constructor(){const t=new TransformStream();this.readable=t.readable;this.writable=t.writable;}};
const file=new Uint8Array(1000).map((_,i)=>i%251);
for(const withLength of [true,false]){
 const env={ASSETS:{fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(file.slice(0,400));c.enqueue(file.slice(400));c.close();}}),{headers:withLength?{'Content-Length':'1000','Content-Type':'audio/mpeg'}:{'Content-Type':'audio/mpeg'}})}};
 const ask=async range=>{const r=await media(new Request('https://x/media/a.mp3',{headers:{Range:range}}),env);return {status:r.status,range:r.headers.get('Content-Range'),body:new Uint8Array(await r.arrayBuffer())};};
 let r=await ask('bytes=990-');assert.equal(r.status,206);assert.equal(r.range,'bytes 990-999/1000');assert.deepEqual(r.body,file.slice(990));
 r=await ask('bytes=100-199');assert.deepEqual(r.body,file.slice(100,200));
 r=await ask('bytes=-10');assert.deepEqual(r.body,file.slice(990));
 r=await ask('bytes=1000-');assert.equal(r.status,416);
}
console.log('PASS: exact ranged media with and without Content-Length');
