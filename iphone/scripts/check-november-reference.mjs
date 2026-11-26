import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer} from './player-fixture.mjs';

const out='artifacts/november-21-reference';
await mkdir(out,{recursive:true});
const source=JSON.parse(await readFile('public/catalog.json','utf8'));
const mot=source.find(t=>t.artist==='MOT'&&t.title==='День и Ночь');
const catalog=[mot,...source.filter(t=>t.artist==='MOT'&&t.id!==mot.id).slice(0,3),source.find(t=>t.id==='toxi-solido')].map((t,i)=>({...t,audio:i%2?'/media/test-next.wav':'/media/test-tone.wav',seconds:26}));
let fixtureInsets={top:0,bottom:0};
const fixture=await servePlayer({catalog,handler:async(req,res,path)=>{
 if(path==='/'){
  const css=(await readFile('public/sway.css','utf8')).replace(/env\(safe-area-inset-top(?:\s*,[^)]+)?\)/g,fixtureInsets.top+'px').replace(/env\(safe-area-inset-bottom(?:\s*,[^)]+)?\)/g,fixtureInsets.bottom+'px');
  const hash=createHash('sha256').update(css).digest('base64');
  res.writeHead(200,{'Content-Type':'text/html'});res.end((await readFile('public/index.html','utf8')).replace(/data-css-hash="[^"]+"/,'data-css-hash="'+hash+'"'));return true;
 }
 if(/^\/[a-z-]+\.css$/.test(path)){
  let body=await readFile(new URL('../public'+path,import.meta.url),'utf8');
  body=body.replace(/env\(safe-area-inset-top(?:\s*,[^)]+)?\)/g,fixtureInsets.top+'px').replace(/env\(safe-area-inset-bottom(?:\s*,[^)]+)?\)/g,fixtureInsets.bottom+'px');
  res.writeHead(200,{'Content-Type':'text/css'});res.end(body);return true;
 }
 let body;
 if(path==='/api/me')body={user:null,likes:[],loginConfigured:true,loginRequired:false};
 if(path==='/api/catalog')body={items:catalog,total:catalog.length,next:null};
 if(path==='/api/playlists')body={playlists:[]};
 if(path==='/api/catalog-signals')body={tracks:{},artists:{},collections:{},listenerDays:30};
 if(path==='/api/history')body={tracks:[]};
 if(path==='/api/taste')body={artists:[],genres:[],tracks:[]};
 if(path==='/api/collection-reactions')body={liked:[]};
 if(path==='/api/playback')body={revision:0,snapshot:null};
 if(path==='/artists.json'||path==='/albums.json')body=[];
 if(path.startsWith('/lyrics/'))body={synced:true,lines:[{at:0,text:'Первая строка'},{at:5,text:'Следующая строка'}],plain:'Первая строка\nСледующая строка'};
 if(body!==undefined){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));return true;}
 return false;
}});
const results=[];
try{
 for(const [label,engine,viewport,safeTop,safeBottom,reduced] of [
  ['Chromium',chromium,{width:393,height:852},56,34,false],
  ['WebKit',webkit,{width:393,height:852},56,34,false],
  ['Small-reduced',chromium,{width:320,height:568},20,0,true],
 ]){
  if(process.env.SWAY_REFERENCE_PROFILE&&!process.env.SWAY_REFERENCE_PROFILE.split(',').includes(label))continue;
  fixtureInsets={top:safeTop,bottom:safeBottom};
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{})});
  try{
   const context=await browser.newContext({...devices['iPhone 13'],viewport,locale:'ru-RU',reducedMotion:reduced?'reduce':'no-preference'});
   // Serve explicit iPhone insets at the fixture boundary, including requests
   // made by the service worker (which bypass WebKit page-route interception).
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   await page.goto(fixture.origin+'/#home');await page.locator('.wave-light[data-ready]').waitFor();await page.waitForTimeout(700);
   assert.equal(await page.locator('.wave-finder,[data-action=wave-related]').count(),0);
   assert.ok(await page.evaluate(()=>document.scrollingElement.scrollHeight<=innerHeight));
   const homeGeometry=await page.evaluate(()=>Object.fromEntries(['.mx-wave','.mx-head','.mx-stage','.mx-wave-bar','.wave-filter-bar','.wave-deck-frame','.mobile-nav'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return [s,{y:r.y,height:r.height,bottom:r.bottom,margin:getComputedStyle(e).margin,padding:getComputedStyle(e).padding}];})));
   assert.ok(homeGeometry['.wave-deck-frame'].bottom<=homeGeometry['.mobile-nav'].y+1,'Carousel fits above navigation: '+JSON.stringify(homeGeometry));
   // Metadata can replace the home canvas after the first ready event. Wait
   // for the current surface to paint, including its static reduced-motion frame.
   await page.waitForFunction(()=>{const c=document.querySelector('.wave-light[data-ready]');return c?.width&&c.height&&c.getContext('2d').getImageData(Math.floor(c.width/2),c.height-2,1,1).data[3]===255;});
   // The atmosphere keeps the song's colour down to the bottom (no black band) and must meet
   // the surface painted behind the navigation without a visible seam.
   const atmosphere=await page.locator('.wave-light[data-ready]').evaluate(c=>{
    const probe=document.createElement('i');probe.style.color=getComputedStyle(document.documentElement).getPropertyValue('--system-surface');document.body.append(probe);
    const surface=getComputedStyle(probe).color.match(/\d+/g).slice(0,3).map(Number);probe.remove();
    return {height:c.clientHeight,viewport:innerHeight,surface,bottom:[...c.getContext('2d').getImageData(Math.floor(c.width/2),c.height-2,1,1).data]};
   });
   assert.equal(atmosphere.height,viewport.height);assert.equal(atmosphere.bottom[3],255);
   assert.ok(atmosphere.bottom.slice(0,3).every((v,i)=>Math.abs(v-atmosphere.surface[i])<=14),'Atmosphere fades continuously into the navigation background: '+JSON.stringify(atmosphere));
   await page.screenshot({path:`${out}/after-home-${label}.png`,scale:'css'});
   await page.locator('.mx-start').click();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.2);await page.waitForTimeout(750);
   await page.screenshot({path:`${out}/after-playing-${label}.png`,scale:'css'});
   const deck=page.locator('.wave-deck');await deck.focus();
   const from=await deck.evaluate(el=>el.scrollLeft);await deck.press('ArrowRight');await page.waitForFunction(left=>Math.abs(document.querySelector('.wave-deck').scrollLeft-left)>25,from,{timeout:5000});const to=await deck.evaluate(el=>el.scrollLeft);
   assert.ok(Math.abs(to-from)>25,JSON.stringify({label,from,to,deck:await deck.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,center:el.querySelector('[data-centered]')?.dataset.deckSlot}))}));
   await page.locator('.mx-track').click();await page.locator('.mx-full-extra').waitFor();
   await page.waitForFunction(()=>document.querySelector('#dialog').getAnimations().every(animation=>animation.playState!=='running'));
   const geometry=await page.locator('.mx-full').evaluate(el=>{
    const box=s=>{const e=el.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,background:c.backgroundColor,border:c.borderWidth,filter:c.backdropFilter||c.webkitBackdropFilter};};
    return {header:box('header'),art:box('.full-artwork'),scene:box('.player-scene'),radio:box('.track-mix'),surface:getComputedStyle(el).getPropertyValue('--cover-surface').trim(),system:getComputedStyle(document.documentElement).getPropertyValue('--system-surface').trim()};
   });
   await page.screenshot({path:`${out}/after-player-${label}.png`,scale:'css'});
   assert.equal(geometry.header.y,0);assert.equal(geometry.header.height,safeTop+56);
   assert.ok(geometry.art.y>=geometry.header.height+8&&geometry.art.y<=geometry.header.height+20,JSON.stringify(geometry));
   assert.equal(geometry.surface,geometry.system,'Status area and artwork use the same sampled surface');
   assert.equal(await page.locator('.mx-full-extra>button').count(),3);
   assert.equal(await page.locator('.player-action-label').count(),0);
   assert.ok(await page.locator('.mx-full-extra').evaluate(e=>e.scrollWidth<=e.clientWidth&&[...e.querySelectorAll('button')].every(b=>!b.textContent.trim()&&!!b.getAttribute('aria-label'))));
   assert.equal(geometry.radio.border,'0px');
   if(reduced)assert.equal(await page.locator('.mx-full').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Reduced motion stops background animation');
   await page.locator('.mx-full-extra [data-action=repeat]').tap();assert.equal(await page.locator('.mx-full-extra [data-action=repeat]').getAttribute('aria-pressed'),'true');
   await page.locator('.mx-full-extra [data-offline-toggle]').click();await page.locator('.mx-full-extra .offline-toggle.saved').waitFor();assert.match(await page.locator('.mx-full-extra .offline-toggle').getAttribute('aria-label'),/^Удалить из скачанного/);
   await page.locator('[data-player-lyrics]').click();await page.locator('[data-lyric-line]').first().waitFor();assert.equal(await page.locator('[data-lyric-line]').first().evaluate(el=>getComputedStyle(el).filter),'none');await page.locator('[data-player-lyrics]').click();
   await page.evaluate(()=>{document.querySelector('#dialog').scrollTop=440;});await page.waitForFunction(()=>{const dock=document.querySelector('.full-dock');return document.querySelector('#dialog').scrollTop>100&&!dock.inert&&+getComputedStyle(dock).opacity>.99;});
   const scrolled=await page.locator('.mx-full').evaluate(el=>({scene:el.querySelector('.player-scene').getBoundingClientRect().y,header:el.querySelector('header').getBoundingClientRect().y,docked:el.hasAttribute('data-docked'),dockBottom:el.querySelector('.full-dock').getBoundingClientRect().bottom,dockTop:el.querySelector('.full-dock').getBoundingClientRect().top,scroll:document.querySelector('#dialog').scrollTop,height:document.querySelector('#dialog').scrollHeight}));
   await page.screenshot({path:`${out}/after-scrolled-${label}.png`,scale:'css'});
   assert.equal(scrolled.scene,0,'Artwork atmosphere must stay in the viewport while scrolling');assert.equal(scrolled.header,0);assert.ok(scrolled.docked,JSON.stringify(scrolled));assert.ok(scrolled.dockTop>0&&scrolled.dockBottom<=viewport.height-safeBottom,JSON.stringify(scrolled));
   await page.locator('.mx-full-utilities [data-action=open-sleep-timer]').click();await page.getByRole('heading',{name:'Таймер сна',exact:true}).waitFor();await page.locator('#sheet .dialog-close').click();
   await page.evaluate(()=>{document.querySelector('#dialog').scrollTop=0;});
   const before=await page.locator('.track-mix').getAttribute('data-track');await page.locator('.track-mix').click();await page.waitForFunction(id=>document.querySelector('.track-mix')?.dataset.track!==id,before);await page.waitForTimeout(750);
   assert.equal(await page.locator('.player-tone.is-current').getAttribute('data-cover-track'),await page.locator('.track-mix').getAttribute('data-track'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   results.push({label,viewport,safeTop,safeBottom,reduced,geometry,scrolled,atmosphere,errors});
   console.log(label+': PASS safe area, full-height atmosphere, carousel, icon-only controls, downloads, lyrics, radio, timer and fixed scene');
  }finally{await browser.close();}
 }
}finally{fixture.server.close();}
await writeFile(`${out}/validation.json`,JSON.stringify({at:new Date().toISOString(),results},null,2));
