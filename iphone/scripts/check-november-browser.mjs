import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const catalog=[
 {...track,audio:'/media/test-tone.wav',artist:'Seed Artist',artists:['Seed Artist'],genre:'Рэп',language:'ru',albumId:'seed-album',albumTitle:'Seed album',albumReleaseDate:'2026-11-20',releaseDateVerified:true},
 {...nextTrack,audio:'/media/test-next.wav',artist:'Similar Artist',artists:['Similar Artist'],genre:'Рэп',language:'ru'},
 {...nextTrack,id:'foreign',title:'Русское название',artist:'Foreign Artist',artists:['Foreign Artist'],genre:'Рэп',language:'en'},
 {...track,id:'unknown',artist:'Unknown Artist',artists:['Unknown Artist'],language:''},
];
await mkdir('artifacts/november-21',{recursive:true});
for(const [name,engine,device] of [['Chromium',chromium,'Pixel 7'],['WebKit',webkit,'iPhone 13']]){
 let reactionCount=0;
 const fixture=await servePlayer({catalog,handler:async(req,res,path)=>{
  if(path==='/api/artwork'){res.writeHead(200,{'Content-Type':'image/png'});res.end(await readFile('public/art/system/record-midnight.png'));return true;}
  let value;
  if(path==='/api/me')value={user:{id:'november',name:'Тест',volume:.8,autoplay:true,motion:true,crossfade:true,wavePattern:'ribbons'},likes:[],loginRequired:false};
  if(path==='/api/catalog')value={items:catalog,next:null,total:catalog.length};
  if(path==='/artists.json'||path==='/albums.json')value=[];
  if(path==='/api/playlists')value={playlists:[]};
  if(path==='/api/playback')value={revision:0,snapshot:null};
  if(path==='/api/catalog-signals')value={tracks:{[track.id]:{plays:7,likes:2,listeners:3}},artists:{'seed artist':{plays:7,listeners:3}},collections:{},listenerDays:30};
  if(path==='/api/collection-reactions'){
   if(req.method==='GET')value={liked:[]};else{let body='';for await(const part of req)body+=part;const {kind,ref}=JSON.parse(body);reactionCount=req.method==='PUT'?1:0;value={kind,ref,liked:!!reactionCount,likes:reactionCount};}
  }
  if(path==='/api/history')value={tracks:[]};
  if(path==='/api/taste')value={artists:[],genres:[],tracks:[]};
  if(path.startsWith('/lyrics/'))value={synced:true,lines:[{at:0,text:'Один — два, три!'},{at:5,text:'Следующая строка'},{at:12,text:'Третья строка'}],plain:'Один — два, три!\nСледующая строка\nТретья строка'};
  if(value!==undefined){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));return true;}return false;
 }});
 const browser=await engine.launch({headless:true,...(name==='Chromium'?{channel:'msedge'}:{})});
 try{
  const context=await browser.newContext({...devices[device],locale:'ru-RU'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(fixture.origin);await page.waitForSelector('#mx-wave-root');
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollHeight>innerHeight),false,'Home must fit without vertical scroll');
  assert.equal(await page.locator('.sway-editorial-slot').count(),0);
  const filter=await page.locator('.wave-filter-bar').boundingBox(),capsule=await page.locator('.mx-wave-bar').boundingBox();assert.ok(filter.y>=capsule.y+capsule.height-1,'Settings below capsule');
  await page.screenshot({path:`artifacts/november-21/home-${name}.png`});
  await page.locator('[data-action="open-wave-filters"]').click();
  await page.locator('[data-set-filter-lang="ru"]').click();
  assert.equal(await page.locator('[data-set-filter-lang="ru"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>localStorage.getItem('tonika.wave-filters')),null,'Draft is not committed by chip selection');
  await page.screenshot({path:`artifacts/november-21/filters-${name}.png`});
  await page.locator('[data-action="apply-wave-filters"]').click();
  await page.waitForFunction(()=>document.querySelector('#audio')?.currentTime>.2);
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('tonika.wave-filters')).language==='ru'));
  assert.equal(await page.locator('#mobile-wave-title').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
  await page.locator('[data-action="mobile-play"]').first().click();await page.waitForSelector('.mx-full-extra');
  const controls=await page.locator('.mx-full-extra').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,n:el.querySelectorAll(':scope > button').length,inside:[...el.querySelectorAll(':scope > button')].every(b=>b.getBoundingClientRect().right<=innerWidth)}));
  assert.equal(controls.n,3);assert.ok(controls.inside&&controls.scroll<=controls.width+1,JSON.stringify(controls));
  assert.equal(await page.locator('.player-action-label').count(),0);
  await page.locator('.mx-full-extra [data-offline-toggle]').click();await page.waitForSelector('.mx-full-extra .offline-toggle.saved');assert.match(await page.locator('.mx-full-extra .offline-toggle').getAttribute('aria-label'),/^Удалить из скачанного/);
  assert.equal(await page.locator('.canvas-shot-bg').count(),0);
  if(name==='Chromium'){
   await page.waitForFunction(()=>navigator.mediaSession?.metadata?.artwork[0]?.sizes);
   const artwork=await page.evaluate(()=>navigator.mediaSession.metadata.artwork[0]);
   assert.ok(artwork.src.includes('/api/artwork?id='));assert.equal(artwork.type,'image/png');assert.match(artwork.sizes,/^\d+x\d+$/);
  }

  await page.screenshot({path:`artifacts/november-21/player-${name}.png`});
  await page.locator('[data-player-lyrics]').click();await page.waitForSelector('[data-lyric-line]');
  assert.equal(await page.locator('[data-lyric-line]').first().textContent(),'Один — два, три!');
  assert.equal(await page.locator('[data-lyric-line]').first().evaluate(el=>getComputedStyle(el).filter),'none');
  assert.equal(await page.locator('[data-lyric-line]').first().evaluate(el=>el.tagName),'DIV');
  await page.locator('[data-lyric-line]').nth(1).press('Enter');
  assert.ok(await page.evaluate(()=>document.querySelector('#audio').currentTime>=4.9));
  await page.screenshot({path:`artifacts/november-21/lyrics-${name}.png`});
  const old=await page.locator('.track-mix').getAttribute('data-track');
  await page.locator('.track-mix').click();await page.waitForFunction(id=>document.querySelector('.track-mix').dataset.track!==id,old);
  assert.notEqual(await page.locator('.track-mix').getAttribute('data-track'),old,'Radio opens another song');
  await page.locator('.player-track-copy:not(.departing) .player-artist-link').click();await page.locator('#dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>location.hash='#artist/seed-artist');await page.waitForSelector('.artist-v2');
  await page.waitForFunction(()=>document.querySelector('.artist-listeners')?.textContent.includes('3'));
  assert.equal(await page.locator('[data-action*="trailer"]').count(),0);await page.waitForFunction(()=>document.querySelector('.artist-hero-art')?.naturalWidth>0);await page.waitForTimeout(600);
  assert.ok(!(await page.locator('main').innerText()).includes('Знакомое вам'));
  assert.ok(!(await page.locator('main').innerText()).includes('Плейлисты, где встречается'));
  const row=await page.locator('.artist-track-row').first().boundingBox();assert.ok(row.width<=page.viewportSize().width);
  await page.screenshot({path:`artifacts/november-21/artist-${name}.png`,fullPage:true});
  await page.locator('.new-release-card').click();await page.waitForSelector('[data-collection-kind="album"]');await page.locator('[data-collection-kind="album"]').click();await page.waitForFunction(()=>document.querySelector('[data-collection-kind="album"]').getAttribute('aria-pressed')==='true');assert.equal(await page.locator('[data-collection-count]').first().textContent(),'1');await page.evaluate(()=>location.hash='#artist/seed-artist');await page.waitForSelector('.artist-about-card');
  await page.locator('.artist-about-card').click();await page.waitForSelector('.artist-facts');assert.ok((await page.locator('.artist-facts').innerText()).includes('7'));
  await page.locator('#sheet .dialog-close').click();
  await page.locator('[data-action="play-artist-wave"]').click();await page.waitForTimeout(800);
  await page.locator('#now-open').click();await page.waitForSelector('.mx-full');
  assert.ok(!(await page.locator('.player-track-lines').innerText()).includes('Seed Artist'),'Artist radio excludes that artist');
  assert.deepEqual(errors,[]);
  console.log(name+': PASS home fit, filter draft/apply/language, compact controls, lyric rendering/keyboard, track/artist radio, real artist metrics and facts');
 }finally{await browser.close();fixture.server.close();}
}
