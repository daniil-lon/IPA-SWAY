import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,devices,webkit} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

const {origin,server}=await servePlayer();
const catalog=JSON.parse(await readFile('public/catalog.json','utf8'));
const cover=catalog.find(t=>t.title==='Медленно')?.art||track.art;
const multi={...track,title:'Медленно',artist:'Koss, Амая',art:cover};
const items=[multi,nextTrack,...catalog.slice(0,110)];
let profile={name:'Слушатель Sway',handle:'listener',bio:'Музыка для момента',visible:true,coverZoom:110,hasCover:true,hasAvatar:true,hasYandexAvatar:false,profileTrack:multi.id,joinedAt:1794873600};
let taste={artists:[],genres:[]},savedProfile=null;const lyricsRequests=[];
let browser;
try{
 browser=process.env.SWAY_REFINEMENT_WEBKIT?await webkit.launch():await chromium.launch({channel:'msedge'});
 // Keep fixture requests in Playwright; WebKit's service-worker requests bypass page routes.
 const context=await browser.newContext({...devices['iPhone 15'],viewport:{width:393,height:852},locale:'ru-RU',serviceWorkers:'block'});
 await context.addInitScript(()=>{const AudioConstructor=window.Audio;window.__previewAudio=[];window.Audio=function(...args){const audio=new AudioConstructor(...args);window.__previewAudio.push(audio);return audio;};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const json=(route,value)=>route.fulfill({json:value});
 await page.route('**/catalog.json',route=>json(route,items));
 // An unfinished metadata entry must not prevent the playable catalogue loading.
 await page.route('**/albums.json',route=>json(route,[null]));
 await page.route('**/artists.json',route=>json(route,[null]));
 await page.route('**/api/me',route=>json(route,{user:{name:profile.name,volume:.8,autoplay:true,crossfade:true,motion:true},likes:[],loginRequired:false,loginConfigured:true,taste}));
 await page.route('**/api/profile',route=>{
  if(route.request().method()==='PATCH'){savedProfile=route.request().postDataJSON();profile={...profile,...savedProfile};}
  return json(route,profile);
 });
 await page.route('**/api/profile/cover',route=>route.fulfill({path:'public/art/mood-focus.svg',contentType:'image/svg+xml'}));
 await page.route('**/api/profile/avatar',route=>route.fulfill({path:'public/art/mood-bright.svg',contentType:'image/svg+xml'}));
 await page.route('**/api/taste',route=>{if(route.request().method()==='PUT')taste=route.request().postDataJSON();return json(route,taste);});
 await page.route(url=>url.hostname==='lrclib.net',route=>{lyricsRequests.push([route.request().method(),route.request().url()]);return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Lrclib-Client','Access-Control-Allow-Methods':'GET, OPTIONS'},json:{id:1,trackName:multi.title,artistName:multi.artist,duration:26,syncedLyrics:'[00:00.00]Начало\n[00:05.00]Вторая строка\n[00:11.00]Третья строка\n[00:18.00]Последняя строка'}});});
 await mkdir('artifacts',{recursive:true});
 await page.goto(origin+'/#home');
 const wave=page.locator('#mx-wave-root');await wave.getByRole('button',{name:'Слушать волну',exact:true}).tap();
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.08);
 await page.waitForTimeout(700);
 console.log('Wave center',await page.locator('.wave-light').evaluate(c=>[...c.getContext('2d').getImageData(c.width*.5,c.height*.31,1,1).data]));
 await page.screenshot({path:'artifacts/sway-refined-wave.png',scale:'css'});
 // Wave ranking is deliberately varied; use a known multi-artist song for the editor/lyrics checks.
 await page.goto(origin+'/#search');await page.locator('#search-query').fill(multi.title);
 await page.locator('[data-play="'+multi.id+'"]:visible').first().tap();
 await page.locator('.mobile-nav [data-nav=home]').tap();
 await wave.locator('.mx-track').tap();
 const full=page.locator('#dialog[open]');await full.waitFor();
 const artist=full.locator('.player-artist-btn');
 const style=await artist.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderWidth,font:getComputedStyle(el).fontSize}));
 assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');
 await full.locator('.mx-full-ctrl [data-action=toggle]').tap();
 await page.waitForFunction(()=>document.querySelector('#audio').paused);
 await full.getByRole('button',{name:'Текст песни',exact:true}).tap();
 try{await full.locator('.lyrics-lines button').first().waitFor({timeout:10000});}
 catch(error){console.log('Lyrics diagnostic',await full.locator('.lyrics-panel').textContent(),errors,lyricsRequests,await page.evaluate(async multi=>{const {matchingLyrics}=await import('/lyrics.js');return {expected:multi,match:matchingLyrics({trackName:multi.title,artistName:multi.artist,duration:26},multi),title:document.querySelector('.mx-full h2')?.textContent};},multi));throw error;}
 // Exercise the iPhone CSS fullscreen fallback; desktop WebKit native fullscreen changes the emulated viewport.
 await full.evaluate(el=>el.requestFullscreen=undefined);
 await full.getByRole('button',{name:'Развернуть текст',exact:true}).tap();
 await page.waitForFunction(()=>document.querySelector('.mx-full')?.dataset.lyrics==='expanded');
 assert.equal(await full.locator('.full-dock').evaluate(el=>el.inert),false);
 await full.locator('[data-lyric-line="2"]').tap();
 await page.waitForFunction(()=>Math.abs(document.querySelector('#audio').currentTime-11)<.2);
 await full.locator('[data-lyric-line="2"][aria-current=true]').waitFor();
 await page.waitForTimeout(300);
 await page.screenshot({path:'artifacts/sway-refined-lyrics.png',scale:'css'});
 await full.locator('.dialog-close').tap();
 assert.equal(await full.locator('.mx-full').getAttribute('data-lyrics'),'preview');
 await full.locator('.dialog-close').tap();await full.waitFor({state:'hidden'});

 await page.goto(origin+'/#profile');
 await page.getByRole('button',{name:'Изменить профиль',exact:true}).tap();
 const editor=page.locator('#profile-editor[open]');
 assert.equal(await editor.locator('select').count(),0);
 const zoom=editor.getByRole('slider',{name:'Масштаб обложки'});
 await editor.getByRole('button',{name:'Увеличить обложку',exact:true}).tap();assert.equal(await zoom.inputValue(),'115');
 await editor.getByRole('button',{name:'Выбрать песню профиля',exact:true}).tap();
 const search=editor.getByRole('searchbox',{name:'Найти песню в Sway'});await search.fill('следующий sway');
 assert.equal(await editor.getByRole('option').count(),1);
 await editor.getByRole('option').first().tap();assert.equal(await editor.locator('[name=profileTrack]').inputValue(),nextTrack.id);
 await editor.locator('.profile-edit-scroll').evaluate(el=>{el.scrollTop=0;});
 await page.screenshot({path:'artifacts/sway-refined-profile.png',scale:'css'});
 await editor.getByRole('button',{name:'Сохранить',exact:true}).tap();await editor.waitFor({state:'hidden'});
 assert.equal(savedProfile.profileTrack,nextTrack.id);assert.equal(savedProfile.coverZoom,115);

 await page.goto(origin+'/#settings/preferences');
 await page.locator('.taste-grid .taste-artist').first().waitFor();
 const first=page.locator('.taste-heart').first();const label=await first.getAttribute('data-taste-artist');
 await first.tap();assert.equal(await first.getAttribute('aria-pressed'),'true');
 await page.locator('.taste-portrait').first().tap();
 const preview=page.locator('.taste-preview[open]');await preview.waitFor();
 await page.waitForFunction(()=>window.__previewAudio.some(a=>!a.paused&&a.currentTime>0));
 const original=await preview.locator('h2').textContent();
 await preview.getByRole('button',{name:'Следующий исполнитель',exact:true}).tap();
 await page.waitForFunction(original=>document.querySelector('.taste-preview h2')?.textContent!==original,original);
 await page.waitForFunction(()=>window.__previewAudio.some(a=>!a.paused&&a.currentTime>0));
 assert.equal(await preview.locator('[data-taste-sound]').count(),0);
 assert.equal(await page.evaluate(()=>window.__previewAudio.filter(a=>!a.paused).every(a=>!a.muted)),true);
 await preview.getByRole('button',{name:'Назад',exact:true}).tap();
 await page.waitForFunction(()=>window.__previewAudio.every(a=>a.paused));
 await page.locator('[data-taste-save]').tap();await page.waitForFunction(()=>document.querySelector('.taste-count').textContent==='Сохранено');
 assert.ok(taste.artists.includes(label));
 await page.screenshot({path:'artifacts/sway-refined-preferences.png',scale:'css'});
 await page.reload();await page.locator('[data-taste-artist="'+label+'"][aria-pressed=true]').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 console.log('Passed: artist button, timed lyrics + expanded dock + line seek, glass profile + zoom + searchable song + save, artist picker + preview + persistence, mobile layout.');
}finally{await browser?.close();server.close();}
