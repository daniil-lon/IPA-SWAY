import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,devices,webkit} from 'playwright';
import {mergeMusic,parseYandexLink} from '../public/music-sources.js';

const origin=(process.argv[2]||'http://127.0.0.1:8794').replace(/\/$/,'');
const trackLink='https://music.yandex.ru/album/419460/track/71263';
const albumLink='https://music.yandex.ru/album/419460';
const playlistLink='https://music.yandex.ru/users/yamusic-podcast/playlists/1019';
const publicPlaylist='https://music.yandex.ru/playlists/c63c7e32-e204-70e6-bdff-ba797ca3d87e';
const embed='<iframe src="https://music.yandex.ru/iframe/#track/71263/419460" style="width:100%"></iframe>';
assert.equal(parseYandexLink(embed).original,trackLink);
assert.equal(parseYandexLink(trackLink).embed,'https://music.yandex.ru/iframe/album/419460/track/71263');
assert.equal(parseYandexLink(albumLink).kind,'album');
assert.equal(parseYandexLink(playlistLink).embed,'https://music.yandex.ru/iframe/playlist/yamusic-podcast/1019');
assert.equal(parseYandexLink(publicPlaylist).embed,'https://music.yandex.ru/iframe/playlists/c63c7e32-e204-70e6-bdff-ba797ca3d87e');
assert.equal(parseYandexLink('https://music.yandex.ru/track/71263').embed,null);
assert.equal(parseYandexLink('https://music.yandex.ru.example/album/10'),null);
assert.equal(parseYandexLink('<iframe src="https://example.org/iframe/album/419460"></iframe>'),null);
const preferred={id:'local',title:'Caprice No. 5',artist:'Niccolò Paganini'};
assert.deepEqual(mergeMusic([preferred],[{id:'remote',title:'Caprice no 5',artist:'Niccolo Paganini'}]),[preferred]);

await mkdir('artifacts',{recursive:true});
const cases=[['desktop',chromium,{channel:process.env.TONIKA_BROWSER||'msedge'},{viewport:{width:1440,height:920}}],['android',chromium,{channel:process.env.TONIKA_BROWSER||'msedge'},devices['Pixel 7']]];
if(process.env.SWAY_WEBKIT)cases.push(['iphone-webkit',webkit,{},devices['iPhone 15']]);
for(const [device,engine,launch,options] of cases){
 const browser=await engine.launch(launch);
 try{
  const page=await browser.newPage({...options,locale:'ru-RU'});
  await page.addInitScript(()=>{
   if(!navigator.mediaSession)return;
   const set=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
   window.mediaActions={};
   navigator.mediaSession.setActionHandler=(action,callback)=>{
    set(action,callback);window.mediaActions[action]=callback;
   };
  });
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('.wave-light[data-ready]').waitFor();
  assert.match(await page.title(),/^Sway/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(device!=='desktop')await page.screenshot({path:'artifacts/sway-'+device+'-home.png'});
  await page.getByRole('button',{name:'Слушать волну'}).click();
  await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.2);
  // Browser dispatch is simulated; the audio element and Media Session metadata are real.
  const hooks=await page.evaluate(()=>window.mediaActions?.pause&&window.mediaActions?.seekto?true:false);
  if(hooks){
   assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata.album),'Sway');
   const art=await page.evaluate(()=>navigator.mediaSession.metadata.artwork[0].src);
   assert.equal(new URL(art).origin,new URL(origin).origin);
   assert.ok(await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return image.naturalWidth>0;},art));
   await page.evaluate(()=>window.mediaActions.pause());
   assert.ok(await page.locator('#audio').evaluate(audio=>audio.paused));
   await page.evaluate(()=>window.mediaActions.seekto({seekTime:4}));
   assert.equal(await page.locator('#audio').evaluate(audio=>audio.currentTime),4);
   await page.evaluate(()=>window.mediaActions.play());
   await page.waitForFunction(()=>document.querySelector('#audio').currentTime>4.2);
  }
  await page.goto(origin+'/#search');
  const q=page.locator('#search-query');
  await q.fill('Chopin');
  const first=page.locator('[data-row^=wm-]').first();
  await first.waitFor({timeout:12000});
  const choice=await first.getAttribute('data-row');
  await first.locator('[data-play]').click();
  await page.waitForFunction(()=>document.querySelector('#audio').currentSrc.includes('upload.wikimedia.org')&&document.querySelector('#audio').currentTime>.2);
  if(hooks)assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata.album),'Wikimedia Commons');
  if(device==='desktop'){
   await first.locator('[data-like]').click();
   await page.goto(origin+'/#search/collection');
   await page.locator('[data-row="'+choice+'"]').waitFor();
   await page.reload();await page.locator('[data-row="'+choice+'"]').waitFor();
   await page.goto(origin+'/#history');
   await page.locator('[data-row="'+choice+'"]').waitFor();
   await page.goto(origin+'/#search');await q.fill('Chopin');
   await page.locator('[data-play="'+choice+'"]').click();
  }
  if(process.env.SWAY_VERIFY_WIDGET&&device==='desktop'){
   for(const [link,type] of [[trackLink,'track'],[albumLink,'album'],[publicPlaylist,'playlist']]){
    await q.fill(link);
    await page.getByRole('button',{name:'Открыть виджет'}).click();
    assert.ok(await page.locator('#audio').evaluate(audio=>audio.paused));
    if(hooks)assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata),null);
    const frame=page.frameLocator('iframe[data-type="'+type+'"]');
    await frame.locator('button').first().waitFor({timeout:15000});
    const body=await frame.locator('body').innerText();
    console.log('Yandex '+type+' widget: '+body.trim().split('\n').filter(Boolean).slice(0,2).join(' / '));
    assert.ok(body.trim().length>0);
    await page.getByRole('link',{name:'Открыть в Яндекс Музыке'}).waitFor();
    await page.locator('#dialog .dialog-close').click();
    await page.locator('iframe').waitFor({state:'detached'});
   }
   await q.fill(trackLink);await page.getByRole('button',{name:'Сохранить ссылку'}).click();
   await page.goto(origin+'/#library/sources');await page.getByRole('button',{name:'Открыть виджет'}).waitFor();
  }
  assert.deepEqual(pageErrors,[]);
  console.log(device+': Sway and Commons playback, '+(hooks?'media controls and artwork':'native media API availability')+' passed');
 }finally{await browser.close();}
}
