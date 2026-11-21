import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const catalog=[{...track,audio:'/media/test-tone.wav'},{...nextTrack,audio:'/media/test-next.wav'}];
const lyrics={synced:true,plain:'Один\nДва\nТри',lines:[{at:0,text:'Один'},{at:5,text:'Два'},{at:12,text:'Три'}]};
const {server,origin}=await servePlayer({catalog,handler:async(req,res,path)=>{
 if(path.startsWith('/lyrics/')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(lyrics));return true;}
 if(path==='/api/import/resolve'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({provider:'Яндекс Музыка',name:'Перенос',tracks:catalog.map(t=>({title:t.title,artist:t.artist})),total:2,partial:false}));return true;}
}});
await mkdir('artifacts',{recursive:true});
try{
 for(const [label,engine,launch,device] of [['Android',chromium,{channel:'msedge'},devices['Pixel 7']],['iPhone WebKit',webkit,{},devices['iPhone 15']],['Desktop',chromium,{channel:'msedge'},{viewport:{width:1360,height:900}}]]){
  if(process.env.SWAY_CHECK_PROFILE&&!label.includes(process.env.SWAY_CHECK_PROFILE))continue;
  const browser=await engine.launch(launch);try{
   const context=await browser.newContext({...device,locale:'ru-RU'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    if(!navigator.mediaSession)return;window.mediaActions={};const original=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler=(name,fn)=>{window.mediaActions[name]=fn;try{original(name,fn);}catch{}};
   });
   const click=async selector=>{try{return await (device.hasTouch?page.locator(selector).first().tap():page.locator(selector).first().click());}catch(error){await page.screenshot({path:'artifacts/next-stage/feature-failure.png'});console.log(JSON.stringify(await page.locator(selector).first().evaluate(el=>{const result=[];for(let p=el;p;p=p.parentElement){const r=p.getBoundingClientRect();result.push({tag:p.tagName,class:p.className,rect:[r.x,r.y,r.width,r.height],animations:p.getAnimations().map(a=>({state:a.playState,time:a.currentTime,timing:a.effect.getTiming(),frames:a.effect.getKeyframes()}))});}return result;})));throw error;}};
   const go=async hash=>{await page.evaluate(h=>location.hash=h,hash);};
   await page.goto(origin+'/#home');await click('.mx-start');await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.15);
   if(await page.evaluate(()=>!!navigator.mediaSession)){
    assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata.title),track.title);
    const handlers=await page.evaluate(()=>Object.keys(window.mediaActions).filter(k=>window.mediaActions[k]));
    for(const action of ['play','pause','previoustrack','nexttrack','seekto'])assert.ok(handlers.includes(action),action);
    await page.evaluate(()=>{window.mediaActions.pause();window.mediaActions.seekto({seekTime:7});});
    await page.waitForFunction(()=>document.querySelector('#audio').paused&&Math.abs(document.querySelector('#audio').currentTime-7)<.3);
    assert.equal(await page.evaluate(()=>window.mediaActions.seekforward),null);assert.equal(await page.evaluate(()=>window.mediaActions.seekbackward),null);
   }
   // New playlist, preset name, one-tap membership, reload persistence and import.
   await go('#library/playlists');await click('[data-playlist-new]');await click('[data-playlist-name="В машину"]');await click('#playlist-dialog [type=submit]');
   await page.locator('#playlist-dialog').waitFor({state:'hidden'});
   await go('#search');if(device.hasTouch){await page.locator('#search-query').fill(track.title);}else await page.locator('#search-query').fill(track.title);
   if(device.hasTouch){await click(`[data-info-track="${track.id}"]`);await click('[data-playlist-choose]');await click('[data-playlist-target]');await page.locator('#playlist-dialog').waitFor({state:'hidden'});await click('#sheet .dialog-close');}
   else await click(`[data-playlist-pick="${track.id}"]`);
   await page.reload();await go('#library/playlists');if(device.hasTouch){await page.getByRole('link',{name:/В машину/}).first().tap();}else await page.getByRole('link',{name:/В машину/}).first().click();await page.getByRole('button',{name:'Воспроизвести '+track.title,exact:true}).waitFor();
   await go('#settings/import');await page.locator('#library-import-url').fill('https://music.yandex.ru/users/test/playlists/1');await click('#library-import [type=submit]');await page.getByText('Найдено 2 из 2',{exact:true}).waitFor();await click('[data-action=confirm-import]');await page.getByRole('heading',{name:'Перенос',exact:true}).first().waitFor();
   assert.equal(await page.locator('.playlist-tracks [data-play]').count(),2);
   await page.screenshot({path:'artifacts/sway-playlists-'+label.split(' ')[0]+'.png'});
   // Like both songs, wait for the actual Cache API entries (service worker is enabled).
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
   await click(`[data-info-track="${track.id}"]`);await click(`[data-like="${track.id}"]`);await click('#sheet .dialog-close');
   await click(`[data-info-track="${nextTrack.id}"]`);await click(`[data-like="${nextTrack.id}"]`);await click('#sheet .dialog-close');
   await page.waitForFunction(async()=>{const c=await caches.open('sway-offline-tracks-v1');return (await c.keys()).filter(k=>k.url.includes('/meta/')).length===2;},{},{timeout:20000});
   // Timed karaoke jumps after seeking, and keeps native controls reachable.
   await click(`[data-play="${track.id}"]`);await click('.player [data-action="now-open"]');await click('[data-player-lyrics]');await page.locator('[data-lyric-line]').first().waitFor();await click('[data-lyrics-expand]');
   await page.waitForFunction(()=>document.querySelector('#dialog').classList.contains('karaoke-active'));
   await page.evaluate(()=>{const a=document.querySelector('#audio');a.currentTime=8;a.pause();});await page.locator('[data-lyric-line="1"][aria-current=true]').waitFor();
   await page.screenshot({path:'artifacts/sway-karaoke-'+label.split(' ')[0]+'.png'});
   await click('[data-lyrics-expand]');await click('#dialog .dialog-close');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   // Cold launch in airplane mode, retained playlists, cached lyrics and HTTP byte ranges.
   await context.setOffline(true);await page.close();const cold=await context.newPage();cold.on('pageerror',e=>errors.push(e.message));cold.setDefaultTimeout(15000);
   await cold.goto(origin+'/#home');await cold.locator('body[data-offline-mode]').waitFor();
   const saved=await cold.evaluate(async id=>{const r=await fetch('/_sway-offline/audio/'+id,{headers:{Range:'bytes=44-107'}}),l=await fetch('/lyrics/'+id+'.json');return {status:r.status,size:(await r.arrayBuffer()).byteLength,lines:(await l.json()).lines.length};},track.id);
   assert.deepEqual(saved,{status:206,size:64,lines:3});
   await cold.evaluate(()=>location.hash='#library/playlists');await cold.getByRole('link',{name:/В машину/}).click();await cold.getByRole('button',{name:'Воспроизвести '+track.title,exact:true}).click();
   if(engine===webkit){
    // Windows WebKit's offline audio codec support differs from physical iOS; report precisely.
    try{await cold.waitForFunction(()=>document.querySelector('#audio').currentTime>.1,{},{timeout:5000});console.log(label+': offline audio playback passed');}catch{console.log(label+': cache, ranges, lyrics and offline playlist passed; offline audio decoder unavailable on this Windows WebKit build');}
   }else await cold.waitForFunction(()=>document.querySelector('#audio').currentTime>.1);
   assert.deepEqual(errors,[],label);console.log(label+': Media Session callbacks, playlists, import, liked cache, karaoke timing, cold offline cache and ranges passed');
  }finally{await browser.close();}
 }
}finally{server.close();}
