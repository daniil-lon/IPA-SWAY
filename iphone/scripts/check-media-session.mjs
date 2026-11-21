import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const bytes=Uint8Array.from({length:1024*1024+317},(_,i)=>(i*17)%251);
const code=await build({stdin:{contents:"import {assetSocket} from './asset-socket.mjs';export default {fetch:(req,env)=>assetSocket(req,env,{mediaAllowed:true})};",resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
let reads=0;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:code.outputFiles[0].text,compatibilityDate:'2026-10-01',serviceBindings:{ASSETS:async()=>{reads++;return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length)}});}}}));
try{
 const origin='https://media.test',headers={Upgrade:'websocket',Origin:origin};
 const response=await mf.dispatchFetch(origin+'/api/media-socket?path=%2Fmedia%2Ftest.mp3&stream=1',{headers});assert.equal(response.status,101);
 const socket=response.webSocket;const chunks=[];let meta,offset=0;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Media session timed out')),5000);
  socket.addEventListener('message',async e=>{try{
   if(typeof e.data==='string'){
    const value=JSON.parse(e.data);
    if(!meta){meta=value;assert.equal(meta.stream,1,'Media must use one persistent session');assert.equal(meta.total,bytes.length);socket.send(JSON.stringify({offset:0,count:16}));}
    else if(value.windowEnd!==undefined){assert.equal(value.windowEnd,offset);if(offset===bytes.length){clearTimeout(timer);socket.close();resolve();}else socket.send(JSON.stringify({offset,count:16}));}
   }else{const block=new Uint8Array(e.data instanceof Blob?await e.data.arrayBuffer():e.data);assert.ok(block.length<=8192);chunks.push(block);offset+=block.length;}
  }catch(error){clearTimeout(timer);reject(error);}});
  socket.addEventListener('error',reject);socket.accept();
 });
 const joined=Buffer.concat(chunks.map(x=>Buffer.from(x)));assert.deepEqual(joined,Buffer.from(bytes));assert.equal(reads,1,'A song is read and hashed once per session');
 assert.equal((await mf.dispatchFetch(origin+'/api/media-socket?path=%2Fadmin.js&stream=1',{headers})).status,404);
 assert.equal((await mf.dispatchFetch(origin+'/api/media-socket?path=%2Fmedia%2Ftest.mp3&stream=1&v=wrong',{headers})).status,412);
 assert.equal((await mf.dispatchFetch(origin+'/api/media-socket?path=%2Fmedia%2Ftest.mp3&stream=1',{headers:{...headers,Origin:'https://other.test'}})).status,403);
 console.log('PASS: exact full song over one bounded persistent media session; version, path and origin guards');
}finally{await mf.dispose();}
