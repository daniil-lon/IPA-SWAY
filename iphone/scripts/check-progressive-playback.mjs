import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {chromium} from 'playwright';
import {servePlayer,wave} from './player-fixture.mjs';
import {createHash} from 'node:crypto';

const ffmpeg=process.env.SWAY_FFMPEG||homedir()+'/AppData/Local/Python/pythoncore-3.15-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';
const audio=execFileSync(ffmpeg,['-v','error','-i','pipe:0','-codec:a','libmp3lame','-b:a','192k','-write_xing','0','-f','mp3','pipe:1'],{input:wave,maxBuffer:4*1024*1024});
// Real catalog MP3s can carry almost a megabyte of embedded cover art before
// their first audio frame. It must not delay the first sound on the thin path.
const metadata=Buffer.alloc(1024*1024),header=Buffer.from([73,68,51,4,0,0,0,0,0,0]);
for(let i=0;i<4;i++)header[9-i]=(metadata.length>>>7*i)&127;
const bytes=Buffer.concat([header,metadata,audio]);
const version=createHash('sha256').update(bytes).digest('hex');
let sent=0,parts=0;
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/stream-player'){
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<audio id="a"></audio><button>Play</button><script type="module">import {createProgressivePlayback} from "/progressive-playback.js";import {markInterruptedConnection} from "/asset-loader.js";markInterruptedConnection();window.player=createProgressivePlayback([a]);document.querySelector("button").onclick=()=>{a.src=player.sourceFor(a,"/media/tone.mp3",26);a.play().catch(()=>{});};</script>');return true;
 }
 if(path==='/api/media-part'){
  parts++;const offset=Number(new URL(req.url,fixture.origin).searchParams.get('offset')||0),data=bytes.subarray(offset,offset+8192);
  await new Promise(resolve=>setTimeout(resolve,180));sent+=data.length;
  res.writeHead(206,{'Content-Type':'audio/mpeg','Content-Range':`bytes ${offset}-${offset+data.length-1}/${bytes.length}`,'Content-Length':data.length,'X-Sway-Version':version,'X-Sway-Type':'audio/mpeg','X-Sway-Encoding':'identity','X-Sway-Size':bytes.length});res.end(data);return true;
 }
 return false;
}});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.ManagedMediaSource=class extends MediaSource{constructor(){super();this.streaming=true;window.sourceProbe=this;}};});
 await page.goto(fixture.origin+'/stream-player');
 let sentAtSound;await page.exposeFunction('firstSound',()=>{sentAtSound??=sent;});
 await page.evaluate(()=>{
  document.querySelector('button').addEventListener('click',()=>{window.tapped=performance.now();},{capture:true});
  a.addEventListener('playing',()=>{window.firstPlayed=performance.now();window.partsAtSound=performance.getEntriesByType('resource').filter(item=>item.name.includes('/api/media-part')).length;void firstSound();},{once:true});
 });
 const began=Date.now();await page.locator('button').click();
 await page.waitForFunction(()=>a.currentTime>.2,null,{timeout:6000});
 const firstMs=await page.evaluate(()=>firstPlayed-tapped),clockMs=Date.now()-began;
 assert.ok(firstMs<2500,'The media playing event must arrive promptly, independently of test-runner polling');
 assert.ok(await page.evaluate(()=>partsAtSound*8192)<audio.length/2,'Sound must start before most audio is downloaded, without transferring embedded cover art');
 await page.waitForFunction(()=>a.currentTime>3,null,{timeout:5000});
 await page.evaluate(()=>{a.currentTime=20;});
 await page.waitForFunction(()=>a.currentTime>20.3,null,{timeout:5000});
 await page.evaluate(()=>{a.pause();});
 const paused=await page.evaluate(()=>a.currentTime);await page.waitForTimeout(350);
 assert.ok(Math.abs(await page.evaluate(()=>a.currentTime)-paused)<.02);
 const beforeReplay=parts;
 await page.evaluate(async()=>{
  const buffer=sourceProbe.sourceBuffers[0];buffer.remove(0,10);
  await new Promise(resolve=>buffer.addEventListener('updateend',resolve,{once:true}));
  a.currentTime=5;void a.play();
 });
 await page.waitForFunction(()=>a.currentTime>5.2,null,{timeout:3000});
 assert.equal(parts,beforeReplay,'An evicted range must be restored from already verified bytes');
 const original=await page.evaluate(()=>player.sourceFor(a,'/media/tone.mp3',26));
 assert.equal(original,await page.evaluate(()=>a.getAttribute('src')),'Resuming the same track reuses the current media source');
 await page.evaluate(()=>{a.removeAttribute('src');a.load();});
 await page.waitForTimeout(300);
 assert.deepEqual(errors,[]);
 await page.goto(fixture.origin+'/stream-player');await page.locator('button').click();
 await page.waitForFunction(()=>a.currentTime>.02,null,{timeout:6000});
 await page.evaluate(()=>{a.src='/media/test-next.wav';a.play().catch(()=>{});});
 await page.waitForFunction(()=>a.currentSrc.endsWith('/media/test-next.wav')&&a.currentTime>.1);
 const stoppedAt=parts;await page.waitForTimeout(500);
 assert.equal(parts,stoppedAt,'Replacing a track must stop requesting its remaining parts');
 console.log(JSON.stringify({result:'PASS',firstPlayingMs:Math.round(firstMs),clockMs,parts,bytes:bytes.length,checks:['progressive sound before full download','continuous playback','seek','restore evicted buffer','pause','same track resume','cancel on source replacement']}));
}finally{await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
