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
  await outgoing.play();outgoing.currentTime=2;await new Promise(resolve=>outgoing.addEventListener('seeked',resolve,{once:true}));transition.tick(nextTrack);
 },{track,nextTrack});
 await page.waitForFunction(()=>incoming.readyState>=3);
 assert.equal(await page.evaluate(()=>transition.preparedId),nextTrack.id);
 assert.equal(await page.evaluate(t=>transition.finish(t,{manual:true}),nextTrack),true);
 assert.equal(await page.evaluate(()=>committed.id),nextTrack.id);
 await page.waitForTimeout(65);assert.equal(await page.evaluate(()=>!outgoing.paused&&!incoming.paused),true,'Both real streams overlap during manual handoff');
 const gains=await page.evaluate(()=>{transition.setVolume(.8);return [outgoing.volume,incoming.volume];});
 assert.ok(gains[0]>.15&&gains[1]<.79,'A playback-state refresh must preserve the current fade gains: '+gains);
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
 console.log('PASS: real buffered manual next overlaps, retains one request, releases old stream; repeated track metadata retains decoded artwork and clears on stop');
}finally{await browser.close();server.close();}
