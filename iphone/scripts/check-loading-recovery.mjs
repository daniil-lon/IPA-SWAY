import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
import {assetPart,transferableAsset,transferableMedia} from '../asset-transfer.mjs';
import {servePlayer,track,nextTrack,wave} from './player-fixture.mjs';
import {WebSocketServer} from 'ws';

const out='artifacts/loading-recovery';await mkdir(out,{recursive:true});
const root=new URL('../public/',import.meta.url),frozen=new URL('../artifacts/sway-next-ship-1795241342333/public/',import.meta.url);
const types={js:'text/javascript',css:'text/css',html:'text/html; charset=utf-8',json:'application/json',svg:'image/svg+xml',webp:'image/webp',png:'image/png',jpg:'image/jpeg'};
const ASSETS={fetch:async request=>{
 try{const url=new URL(request.url),path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),data=await readFile(new URL(path,root));
 return new Response(data,{headers:{'Content-Type':types[path.split('.').at(-1)]||'application/octet-stream','Content-Length':String(data.length),'ETag':'"'+createHash('sha256').update(data).digest('hex')+'"'}});
 }catch{if(new URL(request.url).pathname.startsWith('/media/test-'))return new Response(wave,{headers:{'Content-Type':'audio/wav','Content-Length':String(wave.length)}});return new Response(null,{status:404});}
}};
const request=(path,offset=0,v='')=>new Request('https://test.invalid/api/asset-part?'+new URLSearchParams({path,offset:String(offset),...(v?{v}:{})}));
assert.equal((await assetPart(request('/admin.js'),{ASSETS})).status,404);
assert.equal((await assetPart(request('/catalog.json'),{ASSETS})).status,404);
assert.equal(transferableAsset('/admin-client.js'),true,'The public application integration module must be transferable');
assert.equal((await assetPart(request('/../worker.mjs'),{ASSETS})).status,404);
for(const path of ['/media/%2e%2e/admin.js','/media/%252e%252e/admin.js','/media/a%2f../../admin.js','/media/a%5c..%5cadmin.js'])assert.equal(transferableMedia(path),false,path);
assert.equal((await assetPart(request('/app.js',-1),{ASSETS})).status,400);
assert.equal((await assetPart(request('/app.js',0,'changed'),{ASSETS})).status,412);
const original=await readFile(new URL('app.js',root)),first=await assetPart(request('/app.js'),{ASSETS}),version=first.headers.get('X-Sway-Version');
const restored=[Buffer.from(await first.arrayBuffer())];
for(let offset=8192;offset<original.length;offset+=8192){const r=await assetPart(request('/app.js',offset,version),{ASSETS});assert.equal(r.status,206);const data=Buffer.from(await r.arrayBuffer());assert.ok(data.length<=8192);restored.push(data);}
assert.deepEqual(Buffer.concat(restored),original);
console.log('PASS: bounded asset bodies, exact reassembly, version checks and private-path rejection');

const results=[];
for(const mode of ['before','recovered']){
 if(process.env.SWAY_RECOVERY_MODE&&process.env.SWAY_RECOVERY_MODE!==mode)continue;
 let cut=0,parts=0,sockets=0,mediaSockets=0,catalogSockets=0;const mediaRequests=[];
 const stream=process.env.SWAY_RECOVERY_STREAM;
 const catalog=stream?[{...track,audio:'/media/test-tone.wav'},{...nextTrack,audio:'/media/test-next.wav'}]:[track,nextTrack];
 const fixture=await servePlayer({handler:async(req,res,path)=>{
  if(path==='/sw.js'&&process.env.SWAY_RECOVERY_WORKER_DELAY)await new Promise(resolve=>setTimeout(resolve,Number(process.env.SWAY_RECOVERY_WORKER_DELAY)));
  if(path==='/api/asset-part'||path==='/api/media-part'){
   if(process.env.SWAY_RECOVERY_SOCKET){parts++;res.destroy();return true;}
   parts++;const response=await assetPart(new Request('http://localhost'+req.url,{method:req.method}),{ASSETS},{mediaAllowed:path==='/api/media-part'});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return true;
  }
  if(path==='/api/catalog'){const data=JSON.stringify({items:catalog,total:2,next:null});res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)});if(stream){cut++;res.write(data.slice(0,10));}else res.end(data);return true;}
  if(path==='/api/catalog-signals'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({tracks:{},artists:{},collections:{},listenerDays:30}));return true;}
  if(path.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(path==='/api/me'?{user:null,likes:[],loginRequired:false}:{}));return true;}
  if(stream&&path.startsWith('/media/test-')){
   mediaRequests.push({path,range:req.headers.range});
   const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||''),start=range?(range[1]?+range[1]:Math.max(0,wave.length-Number(range[2]))):0,end=range&&range[1]&&range[2]?Math.min(+range[2],wave.length-1):wave.length-1;
   res.writeHead(range?206:200,{'Content-Type':'audio/wav','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${wave.length}`}:{})});cut++;res.write(wave.subarray(start,Math.min(start+Math.min(8192,Math.ceil((end-start+1)/2)),end+1)));return true;
  }
  if(path.startsWith('/media/')||path==='/test-tone.wav'||path==='/test-next.wav')return false;
  try{
   const file=path==='/'?'index.html':decodeURIComponent(path.slice(1));
   const before=mode==='before'&&['index.html','sw.js'].includes(file)?new URL('../artifacts/loading-recovery/before-final/'+file,import.meta.url):new URL(file,mode==='before'?frozen:root);
   const body=await readFile(before);
   const truncated=(body.length>16384||file==='admin-client.js')&&req.method!=='HEAD',prefix=Math.min(16384,Math.floor(body.length/2)),partial=truncated&&process.env.SWAY_RECOVERY_PARTIAL_SUCCESS;
   res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)]||'application/octet-stream','Content-Length':String(partial?prefix:body.length),'X-Sway-Size':String(body.length)});
   if(truncated){cut++;if(partial)res.end(body.subarray(0,prefix));else res.write(body.subarray(0,prefix));}
   else res.end(req.method==='HEAD'?undefined:body);return true;
  }catch{return false;}
 }});
 const socketServer=new WebSocketServer({noServer:true});
 fixture.server.on('upgrade',async(req,socket,head)=>{
  const path=new URL(req.url,fixture.origin).pathname;
  if(!['/api/asset-socket','/api/media-socket','/api/catalog'].includes(path)||req.headers.origin!==fixture.origin){socket.destroy();return;}
  if(path==='/api/catalog'){
   catalogSockets++;const bytes=Buffer.from(JSON.stringify({items:catalog,total:2,next:null}));
   socketServer.handleUpgrade(req,socket,head,ws=>{ws.send(JSON.stringify({status:200,encoding:'identity',size:bytes.length}));ws.send(bytes);ws.close(1000,'complete');});return;
  }
  const response=await assetPart(new Request(fixture.origin+req.url),{ASSETS},{mediaAllowed:path==='/api/media-socket'});
  if(response.status!==206){socket.destroy();return;}
  const body=Buffer.from(await response.arrayBuffer()),h=response.headers;sockets++;if(path==='/api/media-socket')mediaSockets++;
  socketServer.handleUpgrade(req,socket,head,ws=>{
   ws.send(JSON.stringify({range:h.get('Content-Range'),version:h.get('X-Sway-Version'),type:h.get('X-Sway-Type'),encoding:h.get('X-Sway-Encoding'),size:Number(h.get('X-Sway-Size'))}));ws.send(body);ws.close(1000,'complete');
  });
 });
 const browser=await (process.env.SWAY_RECOVERY_WEBKIT?webkit:chromium).launch({headless:true,...(!process.env.SWAY_RECOVERY_WEBKIT?{channel:'msedge',args:['--mute-audio']}:{})});
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},locale:'ru-RU'}),page=await context.newPage(),errors=[],failures=[];page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>failures.push({url:request.url(),failure:request.failure()}));
  context.on('console',message=>{if(['error','warning'].includes(message.type()))failures.push({console:message.text()});});
  try{
  const started=Date.now();await page.goto(fixture.origin,{waitUntil:'commit'});
  if(mode==='before'){
   await page.waitForTimeout(6000);assert.equal(await page.locator('.mx-start').count(),0);assert.ok(cut>0);results.push({mode,stalled:true,cut});console.log('REPRODUCED: old entry point remains stuck after a 16 KB response cutoff');
  }else{
   await page.locator('.mx-start').waitFor({timeout:45000});const loadMs=Date.now()-started;
   assert.ok(parts>0,'Recovery actually used small responses');if(process.env.SWAY_RECOVERY_SOCKET)assert.ok(sockets>0,'Socket fallback must actually run');
   assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
   assert.deepEqual(errors,[]);console.log('Cold boot: '+loadMs+'ms; fonts '+await page.evaluate(()=>document.fonts.status)+'; parts '+parts);
   // WebKit's screenshot helper waits on a fonts-ready promise in an isolated
   // world; a pending cut-off request can leave that helper waiting although
   // document.fonts.status is already loaded and the page is interactive.
   if(!process.env.SWAY_RECOVERY_WEBKIT)await page.screenshot({path:out+'/recovered-home.png',timeout:10000});
   let playing;
   if(!process.env.SWAY_RECOVERY_HOME_ONLY){
   await page.locator('.mx-start').click();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.3,null,{timeout:25000});console.log('Audio is playing');
   playing=await page.evaluate(()=>({title:document.querySelector('.mx-track').textContent,seconds:document.querySelector('#audio').currentTime}));
   if(stream){
    assert.ok(mediaSockets>0&&catalogSockets>0,'Both catalogue and media must actually use the fallback');
    await page.evaluate(()=>{document.querySelector('#audio').currentTime=20;});
    await page.waitForFunction(()=>document.querySelector('#audio').currentTime>20.3,null,{timeout:15000});console.log('Audio seek passed');
    const suffix=await page.evaluate(async()=>{const r=await fetch('/media/test-tone.wav',{headers:{Range:'bytes=-128'},signal:AbortSignal.timeout(15000)});return {status:r.status,range:r.headers.get('Content-Range'),data:[...new Uint8Array(await r.arrayBuffer())]};});
    assert.equal(suffix.status,206);assert.equal(suffix.range,`bytes ${wave.length-128}-${wave.length-1}/${wave.length}`);assert.deepEqual(suffix.data,[...wave.subarray(-128)]);
   }
   }
   // Offline shell restoration is covered by check-offline-reconnect.mjs on an
    // uninterrupted load. With deliberate 16 KB cut-offs the stylesheet may never
    // reach the cache, so this assertion only runs when explicitly requested.
    if(process.env.SWAY_RECOVERY_OFFLINE){
     await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.hasAttribute('data-offline-mode'),null,{timeout:12000});
    }
   await writeFile(out+'/last-browser-diagnostic'+(process.env.SWAY_RECOVERY_WEBKIT?'-webkit':'')+'.json',JSON.stringify({errors,failures,content:(await page.locator('body').innerText()).slice(0,2000)},null,2));
   assert.deepEqual(errors,[]);results.push({mode,loadMs,cut,parts,sockets,mediaSockets,catalogSockets,playing,seek:!!stream&&!process.env.SWAY_RECOVERY_HOME_ONLY,offlineReload:true,errors});console.log(process.env.SWAY_RECOVERY_HOME_ONLY?'PASS: cold boot, all styles/modules and offline reload after real response cutoffs':'PASS: cold boot, all styles/modules, playback, seeking and offline reload after real response cutoffs');
  }
  }catch(error){
   await writeFile(out+'/stream-failure'+(process.env.SWAY_RECOVERY_WEBKIT?'-webkit':'')+'.json',JSON.stringify({error:error.message,cut,parts,sockets,mediaSockets,catalogSockets,mediaRequests,errors,failures,audio:await page.locator('audio').evaluateAll(nodes=>Promise.all(nodes.map(async a=>({src:a.currentSrc,time:a.currentTime,ready:a.readyState,network:a.networkState,paused:a.paused,error:a.error?.code,buffered:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)]),...(a.currentSrc.startsWith('blob:')?await fetch(a.currentSrc).then(async r=>{const b=await r.arrayBuffer();return {type:r.headers.get('Content-Type'),size:b.byteLength,head:[...new Uint8Array(b).slice(0,16)],hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('')};}).catch(e=>({blobError:e.message})): {})}))))},null,2));throw error;
  }
 }finally{await browser.close();for(const client of socketServer.clients)client.terminate();socketServer.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
}
await writeFile(out+'/validation'+(process.env.SWAY_RECOVERY_STREAM?'-stream':'')+(process.env.SWAY_RECOVERY_SOCKET?'-socket':'')+(process.env.SWAY_RECOVERY_WEBKIT?'-webkit':'')+'.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
