import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const script=await build({stdin:{contents:"import {assetSocket} from './asset-socket.mjs';export default {fetch:assetSocket};",resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
const bytes=await readFile('public/app.js');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:script.outputFiles[0].text,compatibilityDate:'2026-10-01',serviceBindings:{ASSETS:async()=>new Response(bytes,{headers:{'Content-Type':'text/javascript'}})}}));
try{
 const origin='https://example.test',headers={Upgrade:'websocket',Origin:origin};
 const response=await mf.dispatchFetch(origin+'/api/asset-socket?path=%2Fapp.js&encoding=gzip',{headers});
 assert.equal(response.status,101);const socket=response.webSocket;assert.ok(socket);
 const messages=await new Promise((resolve,reject)=>{const items=[],timer=setTimeout(()=>reject(new Error('Socket did not close')),3000);socket.addEventListener('message',e=>items.push(e.data));socket.addEventListener('close',()=>{clearTimeout(timer);resolve(items);});socket.accept();});
 assert.equal(messages.length,2);const meta=JSON.parse(messages[0]),data=Buffer.from(messages[1] instanceof Blob?await messages[1].arrayBuffer():messages[1]);
 const compressed=gzipSync(bytes);assert.equal(data.length,8192);assert.deepEqual(data,compressed.subarray(0,8192));
 assert.equal(meta.version,createHash('sha256').update(compressed).digest('hex'));assert.equal(meta.size,bytes.length);
 assert.equal((await mf.dispatchFetch(origin+'/api/asset-socket?path=%2Fadmin.js',{headers})).status,404);
 assert.equal((await mf.dispatchFetch(origin+'/api/asset-socket?path=%2Fapp.js',{headers:{...headers,Origin:'https://other.test'}})).status,403);
 assert.equal((await mf.dispatchFetch(origin+'/api/asset-socket?path=%2Fapp.js&v=wrong',{headers})).status,412);
 assert.equal((await mf.dispatchFetch(origin+'/api/asset-socket?path=%2Fapp.js')).status,426);
 await writeFile('artifacts/loading-recovery/socket-validation.json',JSON.stringify({at:new Date().toISOString(),bytes:data.length,closed:true,privatePath:404,foreignOrigin:403,versionMismatch:412,plainHTTP:426},null,2));
 console.log('PASS: real Worker socket, exact gzip bytes, clean close, private-path/origin/version rejection');
}finally{await mf.dispose();}

const gatewayScript=await build({entryPoints:['worker.mjs'],bundle:true,format:'esm',write:false});
const catalogue=await readFile('public/catalog.json');
const options={modules:true,script:gatewayScript.outputFiles[0].text,compatibilityDate:'2026-10-01',serviceBindings:{ASSETS:async request=>{
 const path=new URL(request.url).pathname;
 return path==='/catalog.json'?new Response(catalogue,{headers:{'Content-Type':'application/json'}}):new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length)}});
}}};
async function socketMessages(response){
 assert.equal(response.status,101);const socket=response.webSocket;
 return new Promise((resolve,reject)=>{const messages=[],timer=setTimeout(()=>reject(new Error('Gateway socket did not close')),4000);socket.addEventListener('message',e=>messages.push(e.data));socket.addEventListener('close',()=>{clearTimeout(timer);resolve(messages);});socket.accept();});
}
const gateway=new Miniflare(convertV4MiniflareOptions(options));
try{
 const origin='https://gateway.test',headers={Upgrade:'websocket',Origin:origin};
 const frame=await socketMessages(await gateway.dispatchFetch(origin+'/api/catalog?plan=1&encoding=gzip',{headers}));
 const meta=JSON.parse(frame[0]),compressed=Buffer.from(frame[1] instanceof Blob?await frame[1].arrayBuffer():frame[1]);
 assert.ok(compressed.length<14336);const page=JSON.parse(gunzipSync(compressed));assert.equal(page.total,7000);assert.ok(page.pages.length>10);assert.equal(meta.status,200);
 const media=await socketMessages(await gateway.dispatchFetch(origin+'/api/media-socket?path=%2Fmedia%2Ftest.mp3&offset=8192',{headers}));
 const block=Buffer.from(media[1] instanceof Blob?await media[1].arrayBuffer():media[1]);assert.deepEqual(block,bytes.subarray(8192,16384));
 for(const path of ['/api/media-socket?path=%2Fapp.js','/api/media-socket?path=%2Fmedia%2F%252e%252e%2Fadmin.js','/api/asset-socket?path=%2Fmedia%2Ftest.mp3'])assert.equal((await gateway.dispatchFetch(origin+path,{headers})).status,404,path);
 assert.equal((await gateway.dispatchFetch(origin+'/api/media-socket?path=%2Fmedia%2Ftest.mp3',{headers:{...headers,Origin:'https://other.test'}})).status,403);
 assert.equal((await gateway.dispatchFetch(origin+'/api/catalog',{headers:{...headers,Origin:'https://other.test'}})).status,403);
 console.log('PASS: real Worker catalogue compression, exact media bytes, route separation, traversal and foreign-origin rejection');
}finally{await gateway.dispose();}
const guarded=new Miniflare(convertV4MiniflareOptions({...options,bindings:{REQUIRE_YANDEX_LOGIN:'1'}}));
try{
 for(const path of ['/api/catalog','/api/media-socket?path=%2Fmedia%2Ftest.mp3'])assert.equal((await guarded.dispatchFetch('https://guarded.test'+path,{headers:{Upgrade:'websocket',Origin:'https://guarded.test'}})).status,401);
 console.log('PASS: catalogue and media socket endpoints retain the mandatory login guard');
}finally{await guarded.dispose();}
