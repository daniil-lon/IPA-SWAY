import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const {server,origin}=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/test-blank'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Playback verification</title>');return true;}return false;
}});
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
try{
 const page=await browser.newPage(),requests=[];page.on('request',r=>{if(r.url().endsWith('/test-next.wav'))requests.push(r.url());});
 await page.goto(origin+'/test-blank');
 await page.evaluate(async({track,nextTrack})=>{
  const {makeTransition}=await import('/audio-transition.js');
  window.outgoing=new Audio(track.audio);window.incoming=new Audio();document.body.append(outgoing,incoming);
  window.transition=makeTransition([outgoing,incoming],{getCurrent:()=>track,onCommit:(el,t)=>{window.committed={id:t.id,src:el.src};}});
  await outgoing.play();outgoing.currentTime=.1;await new Promise(resolve=>outgoing.addEventListener('seeked',resolve,{once:true}));transition.tick(nextTrack);
 },{track,nextTrack});
 assert.equal(requests.length,0,'The next song must not compete with the active song at startup');
 await page.evaluate(async t=>{outgoing.currentTime=4;await new Promise(resolve=>outgoing.addEventListener('seeked',resolve,{once:true}));transition.tick(t);},nextTrack);
 await page.waitForFunction(()=>incoming.readyState>=3);
 assert.equal(await page.evaluate(()=>transition.preparedId),nextTrack.id);
 const handoff=await page.evaluate(async t=>{
  const finished=transition.finish(t,{manual:true});await new Promise(resolve=>incoming.addEventListener('playing',resolve,{once:true}));
  const overlap=!outgoing.paused&&!incoming.paused;transition.setVolume(.8);
  return {finished,overlap,id:committed.id,gains:[outgoing.volume,incoming.volume]};
 },nextTrack);
 assert.equal(handoff.finished,true);assert.equal(handoff.id,nextTrack.id);assert.equal(handoff.overlap,true,'Both real streams overlap during manual handoff');
 assert.ok(handoff.gains[0]>0&&handoff.gains[1]<.8,'A playback-state refresh must preserve the current fade gains: '+handoff.gains);
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>outgoing.paused&&!outgoing.getAttribute('src')&&incoming.currentTime>.2),true);
 assert.equal(requests.length,1,'Manual next reuses the prepared media request');
 await page.evaluate(async t=>{
  const {createSystemMedia}=await import('/system-media.js');
  window.system=createSystemMedia([incoming],()=>incoming,{play:()=>incoming.play(),pause:()=>incoming.pause(),nexttrack:()=>{},previoustrack:()=>{},seekto:()=>{}});
  const value={...t,art:'/art/system/record-midnight.png'};
  system.setTrack(value);system.setTrack({...value});
 },nextTrack);
 await page.waitForFunction(()=>navigator.mediaSession.metadata?.artwork[0]?.sizes);
 const metadata=await page.evaluate(()=>({title:navigator.mediaSession.metadata.title,art:navigator.mediaSession.metadata.artwork[0]}));
 assert.equal(metadata.title,nextTrack.title);assert.equal(metadata.art.type,'image/png');assert.match(metadata.art.sizes,/^\d+x\d+$/);
 await page.evaluate(()=>system.setTrack(null));assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata),null);
 // Switching while the next stream is still opening must reuse its request.
 const slow=await browser.newPage();let nextRequests=0;
 await slow.route('**/test-next.wav',async route=>{nextRequests++;await new Promise(resolve=>setTimeout(resolve,900));await route.continue();});
 await slow.goto(origin+'/test-blank');
 const pending=await slow.evaluate(async({track,nextTrack})=>{
  const {makeTransition}=await import('/audio-transition.js');
  window.a=new Audio(track.audio);window.b=new Audio();document.body.append(a,b);
  window.t=makeTransition([a,b],{getCurrent:()=>track,onCommit:()=>{window.switched=true;}});
  await a.play();a.currentTime=4;await new Promise(resolve=>a.addEventListener('seeked',resolve,{once:true}));t.tick(nextTrack);
  return {ready:b.readyState,finished:t.finish(nextTrack,{manual:true})};
 },{track,nextTrack});
 assert.equal(pending.ready,0);assert.equal(pending.finished,true,'Manual next must retain a prepared request that has not received headers yet');
 await slow.waitForFunction(()=>switched&&b.currentTime>.2);assert.equal(nextRequests,1);
 await slow.close();
 // The OS session can fall behind the real element after a media handoff.
 await page.evaluate(async t=>{system.setTrack(t);navigator.mediaSession.playbackState='paused';incoming.dispatchEvent(new Event('timeupdate'));},nextTrack);
 assert.equal(await page.evaluate(()=>navigator.mediaSession.playbackState),'playing','A real playing element must repair a stale system play button');
 // Preparing the next stream is useful even when mixing is disabled or unavailable.
 const plain=await browser.newPage();let plainRequests=0;
 plain.on('request',r=>{if(r.url().endsWith('/test-next.wav'))plainRequests++;});
 await plain.goto(origin+'/test-blank');
 const prepared=await plain.evaluate(async({track,nextTrack})=>{
  const {makeTransition}=await import('/audio-transition.js');
  window.a=new Audio(track.audio);window.b=new Audio();document.body.append(a,b);
  window.t=makeTransition([a,b],{enabled:false,crossfade:()=>false,onCommit:()=>{window.committed=true;}});
  await a.play();a.currentTime=1.2;await new Promise(resolve=>a.addEventListener('seeked',resolve,{once:true}));t.tick(nextTrack);
  return t.preparedId;
 },{track,nextTrack});
 assert.equal(prepared,nextTrack.id,'Next-track buffering must not depend on crossfade support');
 await plain.waitForFunction(()=>b.readyState>=3);
 const plainHandoff=await plain.evaluate(async next=>{
  a.currentTime=a.duration-2;await new Promise(resolve=>a.addEventListener('seeked',resolve,{once:true}));t.tick(next);
  const paused=b.paused,finished=t.finish(next);return {paused,finished};
 },nextTrack);
 assert.deepEqual(plainHandoff,{paused:true,finished:true},'Crossfade off keeps songs separate and still reuses the prepared stream');
 await plain.waitForFunction(()=>committed&&b.currentTime>.1);assert.equal(plainRequests,1);await plain.close();
 console.log('PASS: real buffered manual next overlaps, retains one request, releases old stream; repeated track metadata retains decoded artwork and clears on stop');
}finally{await browser.close();server.close();}
