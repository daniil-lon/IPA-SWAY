import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
import {downloadPolicy,connectionAllows,downloadFits,queueSnapshot} from '../public/listening-tools.js';
import {applyWaveFiltersToPool} from '../public/wave-filters.js';
const policy=downloadPolicy({limitMB:256,wifiOnly:true});
assert.equal(connectionAllows(policy,{type:'wifi'}),true);assert.equal(connectionAllows(policy,{type:'cellular'}),false);assert.equal(connectionAllows(policy,{}),false);
assert.equal(downloadFits(policy,255*1024*1024,2*1024*1024),false);assert.equal(downloadPolicy({limitMB:-1}).limitMB,1024);
assert.equal(queueSnapshot({queue:['missing'],current:'missing'},new Set(['a'])),null);
assert.deepEqual(applyWaveFiltersToPool([{id:'calm',moods:['calm']},{id:'up',moods:['bright']}],{energy:'bright'}).map(t=>t.id),['up']);
const third={...nextTrack,id:'test-third',title:'Третий тон'},catalog=[track,nextTrack,third];
const {server,origin}=await servePlayer({catalog});
try{
 for(const [name,profile] of [['desktop',{viewport:{width:1100,height:860}}],['Android',devices['Pixel 7']]]){
  const browser=await chromium.launch({channel:'msedge'});try{
   const page=await browser.newPage({...profile,locale:'ru-RU'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/#search');await page.locator('#search-query').fill(track.title);await page.locator('[data-play="'+track.id+'"]:visible').first().click();
   await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.2);
   // Search queue contains only the matching track: explicitly append the next two.
   await page.evaluate(ids=>ids.forEach(id=>{const b=document.createElement('button');b.dataset.add=id;document.body.append(b);b.click();b.remove();}),[nextTrack.id,third.id]);
   await page.locator('#queue-open').dispatchEvent('click');await page.locator('.queue-item').first().waitFor();
   await page.locator('[data-queue-track="'+third.id+'"][data-queue-move="-1"]').click();
   assert.deepEqual(await page.locator('[data-queue-id]').evaluateAll(els=>els.map(e=>e.dataset.queueId)),[third.id,nextTrack.id]);
   const handles=page.locator('[data-queue-handle]'),a=await handles.nth(0).boundingBox(),b=await handles.nth(1).boundingBox();
   await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height-2,{steps:8});await page.mouse.up();
   assert.deepEqual(await page.locator('[data-queue-id]').evaluateAll(els=>els.map(e=>e.dataset.queueId)),[nextTrack.id,third.id]);
   await page.locator('#sheet .dialog-close').click();
   await page.evaluate(()=>{const a=document.querySelector('#audio');a.pause();a.currentTime=7;window.dispatchEvent(new Event('pagehide'));});await page.reload();
   await page.waitForFunction(()=>document.querySelector('#audio').paused&&Math.abs(document.querySelector('#audio').currentTime-7)<.4);
   await page.locator('#queue-open').dispatchEvent('click');assert.deepEqual(await page.locator('[data-queue-id]').evaluateAll(els=>els.map(e=>e.dataset.queueId)),[nextTrack.id,third.id]);
   await page.locator('#sheet .dialog-close').click();await page.evaluate(()=>location.hash='#settings');
   await page.getByRole('switch',{name:'Автозагрузка только по Wi‑Fi',exact:true}).check();await page.getByLabel('Лимит памяти для музыки').selectOption('256');
   await page.reload();assert.equal(await page.getByRole('switch',{name:'Автозагрузка только по Wi‑Fi',exact:true}).isChecked(),true);assert.equal(await page.getByLabel('Лимит памяти для музыки').inputValue(),'256');
   assert.deepEqual(errors,[]);console.log(name+': queue reorder/drag, explicit next order, paused position restore and download policy persistence passed');
  }finally{await browser.close();}
 }
 const browser=await chromium.launch({channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});try{
  const page=await browser.newPage();await page.goto(origin);await page.evaluate(async()=>{
   const {createLeveler}=await import('/loudness.js');const start=document.createElement('button');start.id='start-level-check';start.textContent='Start';start.style='position:fixed;top:20px;left:20px;z-index:99999';document.body.append(start);start.onclick=async()=>{const context=new AudioContext();await context.resume();
   window.levelCheck=[.5,.2,.02].map((amplitude,i)=>{const oscillator=context.createOscillator(),input=context.createGain();input.gain.value=amplitude;oscillator.connect(input);const level=createLeveler(context,input);const silent=context.createGain();silent.gain.value=0;level.output.connect(silent).connect(context.destination);level.setEnabled(true);level.track('test-level-'+i);oscillator.start();return level;});
   window.levelTimer=setInterval(()=>window.levelCheck.forEach(l=>l.sample(true)),210);};
  });
  await page.locator('#start-level-check').click();await page.waitForFunction(()=>window.levelCheck?.length===3,{timeout:10000});
  await page.waitForTimeout(10000);
  const gains=await page.evaluate(()=>{clearInterval(window.levelTimer);return window.levelCheck.map(l=>l.output.gain.value);});
  assert.ok(Math.abs(.5*gains[0]-.2*gains[1])<.015,JSON.stringify(gains));assert.ok(gains[2]<=1.001&&gains[2]>.99,'quiet tracks are never amplified');console.log('Adaptive leveling: two recordings converge within 0.015 amplitude; quiet material is never amplified');
 }finally{await browser.close();}
}finally{server.close();server.closeAllConnections();}
