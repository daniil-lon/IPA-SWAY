import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const next={...nextTrack,art:'/art/scene-next.svg'},fixture=await servePlayer({catalog:[track,next]});
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--mute-audio']});
let release;
try{
 const page=await browser.newPage({...devices['iPhone 13'],serviceWorkers:'block'});page.setDefaultTimeout(15000);
 const imageReady=new Promise(resolve=>{release=resolve;});
 await page.route('**/art/scene-next.svg',async route=>{await imageReady;await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#e06755"/></svg>'});});
 await page.goto(fixture.origin+'/#home');await page.locator('.mx-start').waitFor();
 await page.locator('a[href="#search"]:visible').first().tap();await page.locator('#search-query').fill('тон');await page.locator('[data-play="'+track.id+'"]:visible').first().tap();
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.1);
 await page.locator('a[href="#home"]:visible').first().tap();await page.locator('.mx-track').tap();
 await page.locator('.mx-full .full-cover').waitFor();await page.waitForFunction(()=>document.querySelector('.mx-full .full-cover').naturalWidth>0);
 await page.evaluate(id=>{
  let at=0;const stamp=event=>{if(event.target.closest('[data-action="next"]')){at=performance.now();document.removeEventListener('click',stamp,true);}};
  document.addEventListener('click',stamp,true);
  const observer=new MutationObserver(()=>{if(at&&document.querySelector('.mx-full')?.dataset.coverTrack===id){window.metadataPaintMs=performance.now()-at;observer.disconnect();}});
  observer.observe(document.querySelector('#dialog-body'),{childList:true,subtree:true,attributes:true});
 },next.id);
 await page.locator('.mx-full [data-action="next"]').first().tap();
 await page.waitForFunction(id=>document.querySelector('.mx-full')?.dataset.coverTrack===id,next.id,{timeout:400});
 const metadataMs=await page.evaluate(()=>metadataPaintMs);assert.ok(metadataMs<400,'Metadata must not wait for artwork');
 assert.match(await page.locator('.mx-full .player-track-copy:not(.departing)').innerText(),/Следующий тон/);
 const held=page.locator('.mx-full [data-cover-hold]');assert.equal(await held.count(),1);assert.equal(await held.evaluate(el=>el.naturalWidth>0),true,'A decoded old cover remains while the new artwork is unavailable');
 await mkdir('artifacts/experience',{recursive:true});await page.screenshot({path:'artifacts/experience/slow-cover.png'});
 release();await page.waitForFunction(()=>document.querySelector('.mx-full .full-cover:not(.departing)').naturalWidth>0&&document.querySelector('.mx-full .full-cover:not(.departing)').getAttribute('src')==='/art/scene-next.svg');
 await page.waitForFunction(()=>!document.querySelector('.mx-full [data-cover-hold]'));
 await page.screenshot({path:'artifacts/experience/player-ready.png'});
 await writeFile('artifacts/experience/player-paint.json',JSON.stringify({metadataMs,artworkHeld:true,physicalIPhone:false},null,2));
 console.log('PASS: metadata updated in '+metadataMs+' ms while next cover was blocked; decoded cover held and cleanly released');
}finally{release?.();await browser.close();fixture.server.closeAllConnections();fixture.server.close();}
