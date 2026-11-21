import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {WebSocketServer} from 'ws';
import {createHash} from 'node:crypto';
import {servePlayer,wave} from './player-fixture.mjs';

let recovered=0,native=0;
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
 socket.on('message',message=>{const {offset,count}=JSON.parse(message);assert.equal(offset,cursor);assert.ok(count<=32);for(let i=0;i<count&&cursor<wave.length;i++){const end=Math.min(cursor+8192,wave.length);socket.send(wave.subarray(cursor,end));cursor=end;}socket.send(JSON.stringify({windowEnd:cursor}));if(cursor===wave.length)socket.close();});
});
for(const engine of [chromium,webkit]){
const browser=await engine.launch({...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{}),headless:true});
const before=recovered;
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.origin+'/playback-test');await page.locator('button').click();
 try{await page.waitForFunction(()=>a.currentSrc.startsWith('blob:')&&a.currentTime>.3,null,{timeout:15000});}catch(error){console.log(JSON.stringify({engine:engine===webkit?'webkit':'chromium',recovered,native,errors,audio:await page.evaluate(()=>({src:a.currentSrc,at:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.code,preload:a.preload}))}));throw error;}
 assert.ok(native>0);assert.equal(recovered-before,1);assert.equal(await page.evaluate(()=>!!navigator.serviceWorker?.controller),false,'Native recovery must work before any service worker controls the page');
 await page.evaluate(()=>{a.currentTime=20;});await page.waitForFunction(()=>a.currentTime>20.3);
 await page.evaluate(()=>{a.src='/media/test-next.wav';a.play().catch(()=>{});});
 await page.waitForFunction(()=>a.currentSrc.endsWith('/media/test-next.wav')&&a.currentTime>.3);
 assert.equal(recovered-before,1,'A healthy replacement must keep its original stream');assert.deepEqual(errors,[]);
 await page.evaluate(()=>stopRecovery());
 console.log('PASS '+(engine===webkit?'WebKit':'Chromium')+': interrupted native audio recovers over one media session without SW, seeks and preserves healthy replacements');
}finally{await browser.close();}
}
sockets.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));
