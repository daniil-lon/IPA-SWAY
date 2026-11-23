import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

// Exercise the actual UI with deterministic audio; this does not simulate an
// iOS lock screen, Apple media decoding, or the production network.
const fixture=await servePlayer(),report=[];
const out='artifacts/iphone-journey';
await mkdir(out,{recursive:true});
try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{})});
  try{
   const context=await browser.newContext({...devices['iPhone 13'],locale:'ru-RU'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
   const began=Date.now();
   await page.goto(fixture.origin+'/#home');await page.locator('.mx-start').waitFor();
   const startupMs=Date.now()-began;
   await page.locator('a[href="#search"]:visible').first().tap();
   await page.locator('#search-query').fill('тон');
   const result=page.locator('[data-play="'+track.id+'"]:visible').first();await result.waitFor();
   const playAt=Date.now();await result.tap();
   await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>!a.paused&&a.currentTime>.2));
   const playingMs=Date.now()-playAt;
   // Open the full player through its persistent mini-player control.
   await page.locator('a[href="#home"]:visible').first().tap();
   await page.locator('.mx-track').tap();
   const full=page.locator('.mx-full');await full.waitFor();
   await full.locator('[data-action="toggle"]').first().tap();
   await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.paused));
   await full.locator('[data-action="toggle"]').first().tap();
   await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>!a.paused&&a.currentTime>.3));
   const seek=full.locator('.full-seek').first();
   await seek.fill('500');await seek.dispatchEvent('input');await seek.dispatchEvent('change');
   await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>!a.paused&&a.currentTime>=12));
   // Both search results form the playback queue.
   await full.locator('[data-action="next"]').first().tap();
   await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>!a.paused&&a.currentTime>.2&&a.currentSrc.endsWith('/test-next.wav')));
   assert.deepEqual(errors,[]);
   await page.screenshot({path:out+'/'+engine.name()+'.png'});
   report.push({engine:engine.name(),status:'PASS',startupMs,playingMs,checks:['search','play','pause','resume','seek','next'],physicalIPhone:false});
   console.log('PASS '+engine.name()+': search, play, pause/resume, seek, next; '+JSON.stringify({startupMs,playingMs}));
   await context.close();
  }finally{await browser.close();}
 }
}finally{
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
 fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));
}
