import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

const {origin,server}=await servePlayer();
let browser;
try{
 browser=await chromium.launch({channel:'msedge'});
 const page=await browser.newPage({...devices['iPhone 15'],viewport:{width:393,height:852},locale:'ru-RU'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const wave=page.locator('#mx-wave-root'), full=page.locator('#dialog[open][data-view=full]');
 const button=(root,name)=>root.getByRole('button',{name,exact:true});
 const mediaTime=()=>page.locator('#audio').evaluate(a=>a.currentTime);
 const waitForTone=warm=>page.waitForFunction(warm=>{
  const canvas=document.querySelector('.mx-wave .wave-light[data-ready]');
  if(!canvas)return false;
  const [r,g,b]=canvas.getContext('2d').getImageData(Math.round(canvas.width*.5),Math.round(canvas.height*.31),1,1).data;
  return warm?r>200&&g>125&&b<110:g>r*1.27&&b>r*1.12;
 },warm);
 const waitPlaying=(item,playing)=>page.waitForFunction(({src,playing})=>{
  const a=document.querySelector('#audio');return a.currentSrc.endsWith(src)&&a.paused!==playing&&(playing?a.currentTime>.08:a.readyState>=1);
 },{src:item.audio,playing});
 await mkdir('artifacts',{recursive:true});
 await page.goto(origin+'/#home',{waitUntil:'domcontentloaded'});
 await waitForTone(true);
 await page.screenshot({path:'artifacts/sway-wave-paused.png',scale:'css'});
 await button(wave,'Слушать волну').tap();
 await waitPlaying(track,true);await waitForTone(false);
 await page.screenshot({path:'artifacts/sway-wave-playing.png',scale:'css'});
 await button(wave,'Пауза').tap();
 await waitPlaying(track,false);await waitForTone(false);
 await button(wave,'Продолжить волну').tap();
 await waitPlaying(track,true);await waitForTone(false);
 console.log('Wave: the initial warm glow changes to the cover palette, which stays calm and colored on repeated pauses.');

 await wave.locator('.mx-track').tap();
 await full.evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));
 const cover=full.locator('.full-cover:not(.departing)');
 const box=await cover.boundingBox();
 assert.ok(Math.abs(box.width-345)<=2&&Math.abs(box.x-24)<=2,JSON.stringify(box));
 assert.ok(Math.abs(box.width-box.height)<1,'cover must be square');
 await page.waitForFunction(()=>{const img=document.querySelector('.mx-full .mx-full-artists img');return img?.complete&&img.naturalWidth>0;});
 const toggle=full.locator('.mx-full-ctrl [data-action=toggle]');
 await toggle.tap();await waitPlaying(track,false);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.mx-full .full-cover')).scale==='0.846');
 const small=await cover.boundingBox();
 assert.ok(Math.abs(small.width/box.width-.846)<.02);
 assert.ok(Math.abs(small.y+small.height/2-box.y-box.height/2)<1,'pause keeps the artwork centered');

 const seek=full.getByRole('slider',{name:'Перемотка',exact:true}), bounds=await seek.boundingBox();
 const cdp=await page.context().newCDPSession(page);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:typeof x==='number'?[{x,y}]:[]});
 const x=f=>bounds.x+4+(bounds.width-8)*f,y=bounds.y+bounds.height/2;
 const before=await mediaTime();
 await touch('touchStart',x(.17),y);
 await touch('touchMove',x(.63),y);
 const preview=full.locator('.mx-seek-wrap[data-scrubbing] .seek-preview');
 assert.equal(await preview.textContent(),'0:16');
 assert.ok(Math.abs(await mediaTime()-before)<.1,'scrubbing must not seek until release');
 await touch('touchCancel');
 await preview.waitFor({state:'detached'});
 assert.ok(Math.abs(await mediaTime()-before)<.1,'cancel restores playback position');
 await touch('touchStart',x(.21),y);await touch('touchMove',x(.61),y);await touch('touchEnd');
 await page.waitForFunction(()=>Math.abs(document.querySelector('#audio').currentTime-26*.61)<.35);
 assert.equal(await full.locator('#mx-left').textContent(),'0:26');
 await waitPlaying(track,false);
 await toggle.tap();await waitPlaying(track,true);
 await toggle.tap();await waitPlaying(track,false);
 await button(full,'Следующий трек').tap();await waitPlaying(nextTrack,false);
 assert.equal(await full.locator('.player-track-copy:not(.departing) h2').textContent(),nextTrack.title);
 console.log('Full player: pause shrinks the cover around its center. Seeking commits once, cancel is safe, and next track preserves pause.');

 await page.waitForFunction(()=>!document.querySelector('.full-cover.departing'));
 const artwork=await full.locator('.full-artwork').boundingBox();
 const swipeX=artwork.x+artwork.width/2, swipeY=artwork.y+artwork.height*.72;
 await touch('touchStart',swipeX,swipeY);
 for(let step=1;step<=8;step++){
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await touch('touchMove',swipeX,swipeY-step*20);
 }
 await touch('touchEnd');
 await page.waitForFunction(()=>document.querySelector('#dialog').scrollTop>35);
 await full.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const dock=full.locator('.full-dock:not([inert])');await dock.waitFor();
 assert.ok((await full.locator('header').boundingBox()).y<4,'top controls stay in place while scrolling');
 assert.ok((await dock.boundingBox()).y>730,'compact controls remain near the bottom');
 await button(dock,'Воспроизвести').tap();await waitPlaying(nextTrack,true);
 await button(dock,'Вернуться к плееру').tap();
 await page.waitForFunction(()=>document.querySelector('#dialog').scrollTop<5);
 assert.deepEqual(errors,[]);
 console.log('Touch: a vertical swipe on the artwork scrolls the player, and the bottom dock controls the same track.');
}finally{await browser?.close();server.close();}
