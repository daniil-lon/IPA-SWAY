import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {WebSocketServer} from 'ws';
import {createHash} from 'node:crypto';
import {servePlayer,wave} from './player-fixture.mjs';

let recovered=0,native=0,holdFirstMs=0;
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/playback-test'){
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end('<audio id="a" preload="auto"></audio><button>Play</button><script type="module">import {installPlaybackRecovery} from "/playback-recovery.js"; window.stopRecovery=installPlaybackRecovery([a]); document.querySelector("button").onclick=()=>{a.src="/media/test-tone.wav"; a.play().catch(()=>{});};</script>');return true;
 }
 if(path==='/media/test-tone.wav'){
  res.writeHead(req.headers.range?206:200,{'Content-Type':'audio/wav','Content-Length':wave.length,'Accept-Ranges':'bytes',...(req.headers.range?{'Content-Range':`bytes 0-${wave.length-1}/${wave.length}`}:{})});
  native++;res.write(wave.subarray(0,4096));return true;
 }
}});
const version=createHash('sha256').update(wave).digest('hex');
const sockets=new WebSocketServer({server:fixture.server});
sockets.on('connection',(socket,req)=>{
 if(!req.url.includes('stream=1')){socket.close();return;}
 recovered++;let cursor=Number(new URL(req.url,'http://localhost').searchParams.get('offset')||0);
 socket.send(JSON.stringify({stream:1,total:wave.length,start:cursor,version,type:'audio/wav',encoding:'identity'}));
 socket.on('message',message=>{const delay=holdFirstMs;holdFirstMs=0;const send=()=>{const {offset,count}=JSON.parse(message);assert.equal(offset,cursor);assert.ok(count<=32);for(let i=0;i<count&&cursor<wave.length;i++){const end=Math.min(cursor+8192,wave.length);socket.send(wave.subarray(cursor,end));cursor=end;}socket.send(JSON.stringify({windowEnd:cursor}));if(cursor===wave.length)socket.close();};if(delay)setTimeout(send,delay);else send();});
});
for(const engine of [chromium,webkit]){
const browser=await engine.launch({...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{}),headless:true});
const before=recovered;
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Measure codec support independently: some Windows WebKit builds reject
 // even an unchanged WAV loaded from a healthy blob URL.
 await page.goto(fixture.origin+'/playback-test');
 const blobPlayback=await page.evaluate(async()=>{
  const probe=new Audio();probe.muted=true;probe.src=URL.createObjectURL(await(await fetch('/media/test-next.wav')).blob());
  const supported=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),2000);probe.onloadeddata=()=>{clearTimeout(timer);resolve(true);};probe.onerror=()=>{clearTimeout(timer);resolve(false);};});
  probe.pause();URL.revokeObjectURL(probe.src);return supported;
 });
 await page.goto(fixture.origin+'/playback-test');await page.locator('button').click();
 await page.waitForFunction(()=>a.currentSrc.startsWith('blob:'),null,{timeout:15000});
 const recoveredHash=await page.evaluate(async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(a.currentSrc)).arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join(''));
 assert.equal(recoveredHash,version,'Recovered audio must exactly match the original file');
 assert.ok(native>0);assert.equal(recovered-before,1);assert.equal(await page.evaluate(()=>!!navigator.serviceWorker?.controller),false,'Native recovery must work before any service worker controls the page');
 if(blobPlayback){await page.waitForFunction(()=>a.currentTime>.3);await page.evaluate(()=>{a.currentTime=20;});await page.waitForFunction(()=>a.currentTime>20.3);}
 await page.evaluate(()=>{a.src='/media/test-next.wav';a.play().catch(()=>{});});
 await page.waitForFunction(()=>a.currentSrc.endsWith('/media/test-next.wav')&&a.currentTime>.3);
 assert.equal(recovered-before,1,'A healthy replacement must keep its original stream');assert.deepEqual(errors,[]);
 await page.evaluate(()=>stopRecovery());
 if(engine===chromium){
  const race=await browser.newPage();await race.goto(fixture.origin+'/playback-test');
  holdFirstMs=1800;const opened=new Promise(resolve=>sockets.once('connection',resolve));
  await race.locator('button').click();await opened;
  await race.evaluate(()=>{a.pause();a.currentTime=.01;});
  await race.waitForFunction(()=>a.currentSrc.startsWith('blob:')&&a.readyState>=1,null,{timeout:15000});
  assert.equal(await race.evaluate(()=>a.paused),true,'A late recovery must respect a pause made while it was downloading');
  assert.ok(await race.evaluate(()=>Math.abs(a.currentTime-.01)<.025),'A late recovery must use the latest seek position');
  await race.evaluate(()=>stopRecovery());await race.close();
 }
 console.log('PASS '+(engine===webkit?'WebKit':'Chromium')+': exact audio recovery over one session without SW; healthy replacement preserved'+(blobPlayback?'; playback and seek verified':'. SKIP blob decoding: the unmodified baseline is unsupported in this Windows engine'));
}finally{await browser.close();}
}
sockets.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));
