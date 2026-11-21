import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,devices} from 'playwright';
const manifestArg=process.argv.indexOf('--manifest'),manifestPath=manifestArg>=0?process.argv[manifestArg+1]:'artifacts/sway-refinement-release.json';
const release=JSON.parse(await readFile(manifestPath,'utf8'));
const prefix=manifestPath.includes('polish')?'sway-polish':'sway-refinement';
const staged=join(release.destination,'public'),items=JSON.parse(await readFile(join(staged,'catalog.json'),'utf8'));
const baseArg=process.argv.indexOf('--base'),base=(baseArg>=0?process.argv[baseArg+1]:'https://music.academmix.ru').replace(/\/$/,''),preflight=process.argv.includes('--preflight'),interactiveSearch=process.argv.includes('--interactive-search');
if(preflight){
 const metadata=['catalog.json','albums.json','artists.json','wave-pulses.json','track-moods.json','chart.json'];
 for(const file of metadata){
  console.log('Checking published metadata:',file);
  const response=await fetch(base+'/'+file,{cache:'no-store',signal:AbortSignal.timeout(45000)});assert.equal(response.status,200,file);
  const live=await response.json(),expected=JSON.parse(await readFile(join(staged,file),'utf8'));
  assert.equal(createHash('sha256').update(JSON.stringify(live)).digest('hex'),createHash('sha256').update(JSON.stringify(expected)).digest('hex'),file+' preserves current published metadata');
  if(file==='catalog.json')console.log('Catalogue guard:',live.length,'live;',items.length,'staged. No published tracks omitted.');
 }
 console.log('Verified all six published catalogue metadata files.');
 process.exit(0);
}
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage({...devices['iPhone 15'],viewport:{width:393,height:852},locale:'ru-RU'});
 await page.addInitScript(()=>{const NativeAudio=window.Audio;window.__swayPreviewAudio=[];window.Audio=function(...args){const a=new NativeAudio(...args);window.__swayPreviewAudio.push(a);return a;};});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const loaded=new Map();page.on('response',r=>{
  const url=new URL(r.url());if(url.origin===base&&r.ok())loaded.set(url.pathname==='/'?'index.html':url.pathname.slice(1),r);
 });
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/catalog.json'&&r.ok(),{timeout:45000});
 response.catch(()=>{}); // Preserve the original navigation error if cleanup closes the pending response watcher.
 await page.goto(base+'/#home',{waitUntil:'domcontentloaded'});
 const live=await(await response).json(),ids=new Set(items.map(t=>t.id));
 assert.equal(live.every(t=>ids.has(t.id)),true,'the release must contain every currently published track');
 console.log('Catalogue guard:',live.length,'live;',items.length,'staged. No published tracks omitted.');
 const metadata=['catalog.json','albums.json','artists.json','wave-pulses.json','track-moods.json','chart.json'];
 const liveMetadata=await page.evaluate(async files=>Promise.all(files.map(async file=>{
  const response=await fetch('/'+file,{cache:'reload'});if(!response.ok)throw new Error(file+': '+response.status);
  const bytes=new TextEncoder().encode(JSON.stringify(await response.json())),hash=await crypto.subtle.digest('SHA-256',bytes);
  return [file,[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')];
 })),metadata);
 for(const [file,hash] of liveMetadata){
  const expected=createHash('sha256').update(JSON.stringify(JSON.parse(await readFile(join(staged,file),'utf8')))).digest('hex');
  assert.equal(hash,expected,file+' must preserve the latest published metadata');
 }
 console.log('Verified all six published catalogue metadata files.');
 if(preflight)process.exitCode=0;
 else{
  assert.equal(live.length,items.length);
  const health=await(await page.request.get(base+'/api/health')).json();assert.equal(health.tracks,items.length);
 const files=['collection.css','playlists.js','playlist-match.js','discovery.js','cover-colors.js','system-media.js','equalizer.js','offline-storage.js','app.js','browse.css','profile-ui.js','player.css','sway-glass.css','sway-reference.css','wave-light.js','wave-deck.js','art/wave-symbols.svg',...['party','flower','bolt','rap','night'].map(name=>'art/wave-'+name+'.svg'),'audio-transition.js','wave.js','taste-ui.js','taste.css','lyrics.js','lyrics.css','sw.js','index.html'];
  files.push('listening-tools.js','loudness.js','wave-filters.js','pwa-prompt.js','manifest.webmanifest','art/logo.svg','art/logo-burst.webp','art/icon-180.png','art/icon-192.png','art/icon-512.png','art/icon-maskable-512.png','art/system/logo.png');
  for(const file of Object.keys(release.assets||{}))if(!files.includes(file))files.push(file);
  const sha=body=>createHash('sha256').update(body).digest('hex');
  for(const file of files){
   let body;
   if(loaded.has(file))body=await loaded.get(file).body();
   else{
    const remote=await page.evaluate(async file=>{const r=await fetch('/'+file,{cache:'reload'});return {status:r.status,body:[...new Uint8Array(await r.arrayBuffer())]};},file);
    assert.equal(remote.status,200,file);body=Buffer.from(remote.body);
   }
   assert.equal(sha(body),sha(await readFile(join(staged,file))),file+' matches the tested snapshot');
  }
  console.log('Verified',files.length,'published assets against the release snapshot.');
  const glassNav=page.locator('.mobile-nav.glass');
  await glassNav.waitFor();
  const glassStyle=await glassNav.evaluate(el=>({blur:getComputedStyle(el).backdropFilter,radius:parseFloat(getComputedStyle(el).borderRadius)}));
  assert.match(glassStyle.blur,/blur\(7px\)/);assert.ok(glassStyle.radius>100);
  for(const [name,index] of [['discover',1],['library',2],['home',0]]){
   await glassNav.locator('[data-nav="'+name+'"]').tap();
   await page.waitForFunction(({name,index})=>{const nav=document.querySelector('.mobile-nav');return nav.querySelector('[data-nav="'+name+'"]').getAttribute('aria-current')==='page'&&Number(nav.style.getPropertyValue('--dock-index'))===index;},{name,index});
  }
  await page.waitForTimeout(400);
  await page.screenshot({path:'artifacts/'+prefix+'-production-home.png',scale:'css'});
  await page.locator('#mx-wave-root').getByRole('button',{name:'Слушать волну',exact:true}).tap();
  await page.waitForFunction(()=>{const a=document.querySelector('#audio');return a&&!a.paused&&a.currentTime>.2;},{timeout:30000});
  await page.locator('.mx-track').tap();
  const full=page.locator('#dialog[open]');await full.locator('.mx-full-ctrl [data-action=toggle]').tap();
  await page.waitForFunction(()=>document.querySelector('#audio').paused&&getComputedStyle(document.querySelector('.full-cover')).scale==='0.846');
  await page.screenshot({path:'artifacts/'+prefix+'-production.png',scale:'css'});
  await full.locator('.dialog-close').tap();await full.waitFor({state:'hidden'});
  const lyricsFiles=await readdir(join(staged,'lyrics'));let lyricSong=null,lyricCount=0;
  for(const file of lyricsFiles){
   const t=items.find(t=>file===t.id+'.json');if(!t)continue;
   const data=JSON.parse(await readFile(join(staged,'lyrics',file),'utf8'));
   if(data.lines?.length>6){lyricSong=t;lyricCount=data.lines.length;break;}
  }
  if(lyricSong){
   await page.goto(base+'/#search'+(interactiveSearch?'':'/'+encodeURIComponent(lyricSong.id)),{waitUntil:'domcontentloaded'});
   if(interactiveSearch)await page.locator('#search-query').fill(lyricSong.title);
   await page.locator('#search-results').waitFor();
   await page.waitForFunction(()=>!document.querySelector('#main').getAnimations().some(a=>a.playState==='running'));
   await page.locator('#search-results [data-play="'+lyricSong.id+'"]').first().tap();
   await page.waitForFunction(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>.1;});
   await page.locator('.now-text').tap();
   await full.getByRole('button',{name:'Текст песни',exact:true}).tap();
   await full.locator('.lyrics-lines button').first().waitFor();
   assert.equal(await full.locator('.lyrics-lines button').count(),lyricCount);
   await full.locator('.mx-full-ctrl [data-action=toggle]').tap();
   await full.getByRole('button',{name:'Развернуть текст',exact:true}).tap();
   await page.screenshot({path:'artifacts/'+prefix+'-production-lyrics.png',scale:'css'});
   await full.locator('.dialog-close').tap();await full.locator('.dialog-close').tap();
   await full.waitFor({state:'hidden'});
  }
  await page.goto(base+'/#settings/preferences',{waitUntil:'domcontentloaded'});
  await page.locator('.taste-portrait').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('#main').getAnimations().some(a=>a.playState==='running'));
  await page.waitForTimeout(600);
  await page.locator('.taste-portrait').first().tap();
  const preview=page.locator('.taste-preview[open]');await preview.waitFor();
  await page.waitForFunction(()=>window.__swayPreviewAudio.some(a=>!a.paused&&a.readyState>=2&&a.currentTime>.2),null,{timeout:45000});
  const previewTime=await page.evaluate(()=>window.__swayPreviewAudio.find(a=>!a.paused&&a.readyState>=2).currentTime);
  await page.waitForFunction(time=>window.__swayPreviewAudio.some(a=>!a.paused&&a.readyState>=2&&a.currentTime>time+.15),previewTime);
  await page.screenshot({path:'artifacts/'+prefix+'-production-preview.png',scale:'css'});
  assert.equal(await preview.locator('[data-taste-sound]').count(),0);
  assert.equal(await page.evaluate(()=>window.__swayPreviewAudio.filter(a=>!a.paused).every(a=>!a.muted)),true);
  await preview.getByRole('button',{name:'Назад',exact:true}).tap();
  await page.waitForFunction(()=>window.__swayPreviewAudio.every(a=>a.paused));
  assert.deepEqual(errors,[]);
  const result={version:release.version||null,tracks:live.length,assetsVerified:files.length,glassNavigation:true,slidingNavigationHighlight:true,actualAudio:true,pausedArtwork:true,artistPreviewActualAudio:true,searchMode:interactiveSearch?'interactive search':'shared track link',lyricsTrack:lyricSong?.id,lyricsLines:lyricCount,pageErrors:errors,browser:'Edge with iPhone emulation; physical iPhone not tested'};
  await writeFile('artifacts/'+prefix+'-production-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }
}finally{await browser.close();}
