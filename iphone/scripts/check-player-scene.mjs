import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

const {origin,server}=await servePlayer();
let browser;
try{
 browser=await chromium.launch({channel:'msedge'});
 await mkdir('artifacts',{recursive:true});
 for(const [name,profile] of [['mobile',devices['iPhone 15']],['desktop',{viewport:{width:1100,height:860}}]]){
  const page=await browser.newPage({...profile,locale:'ru-RU'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const player=page.locator('#dialog[open][data-view=full]');
  const tone=player.locator('.player-tone.is-current');
  const art=player.locator('.full-cover:not(.departing)');
  const title=player.locator('.player-track-copy:not(.departing) h2');
  const click=control=>profile.hasTouch?control.tap():control.click();
  const button=name=>player.getByRole('button',{name,exact:true});
  const settle=()=>page.waitForFunction(()=>!document.querySelector('#dialog .departing'));
  const plays=t=>page.waitForFunction(src=>{
   const audio=document.querySelector('#audio');return !audio.paused&&audio.currentTime>.10&&audio.currentSrc.endsWith(src);
  },t.audio);
  const shown=async t=>{
   await tone.locator('img').evaluate(img=>img.decode());
   assert.equal(await tone.locator('img').getAttribute('src'),t.art);
   assert.equal(await art.getAttribute('src'),t.art);
   assert.equal(await title.textContent(),t.title);
   assert.match(await tone.locator('img').evaluate(el=>getComputedStyle(el).filter),/blur\(/);
  };
  await page.goto(origin+'/#home',{waitUntil:'domcontentloaded'});
  await click(page.getByRole('button',{name:'Слушать волну',exact:true}));
  await plays(track);await click(page.locator('.mx-wave .mx-track'));
  await player.waitFor();await player.evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));
  await shown(track);
  const a=await tone.evaluate(el=>el.style.getPropertyValue('--cover-h'));
  await page.screenshot({path:'artifacts/sway-player-scene-'+name+'.png'});
  if(profile.hasTouch){
   const client=await page.context().newCDPSession(page);
   const send=(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
   const drag=async delta=>{
    const box=await art.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
    await send('touchStart',x,y);
    await send('touchMove',x+delta,y);
    return ()=>send('touchEnd');
   };
   const peek=player.locator('.player-tone.is-peek');
   const cancel=await drag(-27);
   await peek.waitFor();
   assert.equal(await peek.locator('img').getAttribute('src'),nextTrack.art);
   assert.ok(Number(await peek.evaluate(el=>getComputedStyle(el).opacity))>0,'neighbor color appears during the swipe');
   assert.equal(await title.textContent(),track.title);
   await cancel();
   await page.waitForFunction(()=>+getComputedStyle(document.querySelector('#dialog .player-tone.is-peek')).opacity<.005);
   await shown(track);
   const next=await drag(-137);
   assert.equal(await player.locator('.full-peek').getAttribute('src'),nextTrack.art);
   await next();
   await player.locator('.full-cover.departing').waitFor({state:'attached'});
   assert.equal(await player.locator('.player-track-copy.departing h2').textContent(),track.title);
   await shown(nextTrack);await plays(nextTrack);await settle();
   assert.notEqual(await tone.evaluate(el=>el.style.getPropertyValue('--cover-h')),a);
   const prev=await drag(126);await prev();
   await shown(track);await plays(track);await settle();
   console.log('Touch: short swipe returned to the current track; both directions switched artwork, color, title and audio together.');
  }else{
   await click(button('Следующий трек'));
   await player.locator('.player-tone.departing').waitFor({state:'attached'});
   await shown(nextTrack);await plays(nextTrack);await settle();
   assert.notEqual(await tone.evaluate(el=>el.style.getPropertyValue('--cover-h')),a);
   await page.emulateMedia({reducedMotion:'reduce'});
   await click(button('Предыдущий трек'));
   await shown(track);
   assert.equal(await player.locator('.departing').count(),0);
   console.log('Desktop: track buttons change the full scene; reduced motion keeps it static.');
  }
  assert.deepEqual(errors,[]);
  await page.close();
 }
}finally{await browser?.close();server.close();}
