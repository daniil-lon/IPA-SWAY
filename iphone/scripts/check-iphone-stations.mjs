import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track} from './player-fixture.mjs';
import {stationTracks,availableStations} from '../public/wave-stations.js';
import {tagCatalog} from '../public/discovery.js';

const catalog=[];
for(const [family,genre] of Object.entries({rap:'Рэп / Хип-хоп',pop:'Поп',rock:'Рок',indie:'Инди',dance:'Танцевальная',rnb:'R&B / Соул'})){
 for(const language of ['ru','en'])for(const mood of ['bright','calm','focus','night']){
  catalog.push({...track,id:`${family}-${language}-${mood}`,artist:`Артист ${family} ${language}`,title:language==='ru'?'English title':'Русское название',genre,language,moods:[mood],audio:'/media/test-tone.wav'});
 }
}
assert.ok(stationTracks(catalog,'russian-pop').every(t=>t.language==='ru'&&t.genre==='Поп'));
assert.ok(stationTracks(catalog,'english-rap').every(t=>t.language==='en'&&t.genre.includes('Рэп')));
assert.equal(stationTracks([{...track,title:'Песня на русском'}],'russian-pop').length,0,'A title is not language evidence');
assert.equal(availableStations([catalog[0],catalog[1]]).length,0,'Do not offer an empty or one-song station');
const real=tagCatalog(JSON.parse(await readFile('public/catalog.json','utf8')),JSON.parse(await readFile('public/track-moods.json','utf8')),JSON.parse(await readFile('public/track-languages.json','utf8')));
const stations=availableStations(real);
assert.ok(stations.length>=18,'The real Sway catalog must support a useful deck');
const pools=stations.map(s=>({key:s.key,count:stationTracks(real,s.key).length}));
assert.ok(new Set(pools.map(s=>s.count)).size>10,'Station names must resolve to distinct selections');

const fixture=await servePlayer({catalog,handler:async(req,res,path)=>{
 let body;
 if(path==='/api/catalog')body={items:catalog,total:catalog.length,next:null};
 if(path==='/track-moods.json'||path==='/track-languages.json')body={};
 if(path==='/api/catalog-signals')body={tracks:{},artists:{},collections:{},listenerDays:30};
 if(path==='/artists.json'||path==='/albums.json')body=[];
 if(path.startsWith('/lyrics/'))body={synced:true,lines:[{at:0,text:'Первая строка'},{at:5,text:'Следующая строка'}],plain:'Первая строка\nСледующая строка'};
 if(body===undefined)return false;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));return true;
}});
const out='artifacts/iphone-reference';await mkdir(out,{recursive:true});const report=[];
try{
 for(const engine of process.env.SWAY_STATIONS_WEBKIT?[webkit]:[chromium,webkit]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{})});
  try{
   const page=await browser.newPage({...devices['iPhone 13'],viewport:{width:393,height:852},serviceWorkers:'block',locale:'ru-RU'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   await page.addInitScript(()=>{window.deckTrace=[];document.addEventListener('keydown',e=>{if(!e.target.matches('.wave-deck'))return;const d=e.target;window.deckTrace.push({key:e.key,prevented:e.defaultPrevented,center:d.querySelector('[data-centered]')?.dataset.deckSlot,left:d.scrollLeft});});});
   await page.addInitScript(()=>{localStorage.setItem('sway.playlists.guest',JSON.stringify([{id:'drive',name:'В машину',tracks:[]}]))});
   await page.goto(fixture.origin+'/#home');await page.locator('.mx-start').waitFor();
   const deck=page.locator('.wave-deck');
   const centered=()=>deck.locator('[data-centered]');
   const snap=async()=>{try{await page.waitForFunction(()=>{const d=document.querySelector('.wave-deck'),c=d.querySelector('[data-centered]');return c&&Math.abs(c.offsetLeft+(c.offsetWidth-d.clientWidth)/2-d.scrollLeft)<=2;});}catch(error){console.log('Unsettled deck',JSON.stringify(await deck.evaluate(d=>({scroll:d.scrollLeft,width:d.clientWidth,selection:d.parentElement.dataset.selection,active:document.activeElement?.outerHTML,nodes:[...d.children].map(c=>({key:c.dataset.deckItem,slot:c.dataset.deckSlot,centered:c.hasAttribute('data-centered'),offset:c.offsetLeft+(c.offsetWidth-d.clientWidth)/2}))}))));await page.screenshot({path:`${out}/unsettled-${engine.name()}.png`});throw error;}};
   const advance=async()=>{const from=await centered().getAttribute('data-deck-item');await deck.press('ArrowRight');try{await page.waitForFunction(from=>document.querySelector('.wave-deck [data-centered]')?.dataset.deckItem!==from,from,{timeout:5000});await snap();}catch(error){console.log('Deck did not advance',from,JSON.stringify(await deck.evaluate(el=>({from:el.querySelector('[data-centered]')?.dataset,snap:getComputedStyle(el).scrollSnapType,scroll:el.scrollLeft,width:el.clientWidth,total:el.scrollWidth,trace:window.deckTrace.slice(-8),nodes:[...el.children].map(n=>({key:n.dataset.deckItem,slot:n.dataset.deckSlot,x:n.offsetLeft,width:n.offsetWidth}))}))));throw error;}};
   const choose=async key=>{
    for(let step=0;step<28;step++){
     if(await centered().getAttribute('data-deck-item')==='station-'+key){await centered().locator('button').tap();return;}
     await advance();
    }
    throw new Error('Station not reachable: '+key);
   };
   await snap();
   for(let i=0;i<4;i++)await advance();
   if(engine===chromium){
    const touch=await page.context().newCDPSession(page),box=await deck.boundingBox(),from=await centered().getAttribute('data-deck-item'),y=box.y+box.height*.6;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:310,y}]});
    for(let x=290;x>=90;x-=20){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await page.waitForTimeout(20);}
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(600);await snap();
    assert.notEqual(await centered().getAttribute('data-deck-item'),from,'A native finger swipe must move the deck');await touch.detach();
   }
   assert.equal(await page.locator('#audio').getAttribute('src'),null,'Browsing the deck must not play anything');
   await choose('english-pop');
   await page.waitForFunction(()=>!document.querySelector('#audio').paused&&document.querySelector('#audio').currentTime>.2);
   await snap();
   const active=()=>page.locator('#mx-wave-root').getAttribute('data-track');
   const first=await active();assert.match(first,/^pop-en-/);
   assert.equal(await deck.evaluate(el=>el.scrollTop),0,'Focusing a station must not clip its raised glyph');
   assert.equal(await page.locator('.wave-selection span').textContent(),'Поп на английском');
   assert.deepEqual(await deck.locator('[data-deck-shortcut]').allTextContents(),['Назад к привычному','Встряхнуть Мою волну']);
   const commands=await deck.locator('[data-deck-shortcut] button').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,viewport:innerWidth})));
   assert.ok(commands.every(el=>el.left>=0&&el.right<=el.viewport),'Both station commands must fit beside the selected card: '+JSON.stringify(commands));
   const order=await deck.locator(':scope>div').evaluateAll(nodes=>nodes.map(n=>n.dataset.deckItem));
   const at=order.indexOf('station-english-pop');assert.deepEqual(order.slice(at-2,at),['usual','shake']);
   await page.locator('.mx-pause').click();const before=await page.locator('#audio').evaluate(a=>a.currentTime);
   await centered().locator('button').tap();await page.waitForFunction(p=>document.querySelector('#audio').currentTime>p+.1,before);
   assert.equal(await active(),first,'Tapping the active station resumes the same position');
   await page.locator('.mx-pause').click();await page.reload();await page.locator('.wave-selection:not([hidden])').waitFor();await snap();
   assert.equal(await centered().getAttribute('data-deck-item'),'station-english-pop','Selection must survive closing the app');
   assert.equal(await active(),first);await centered().locator('button').tap();
   await page.waitForFunction(()=>!document.querySelector('#audio').paused&&document.querySelector('#audio').currentTime>.2);
   for(let n=0;n<3;n++){
    const beforeShake=await active();await page.locator('[data-action=wave-shake]').tap();
    await page.waitForFunction(id=>document.querySelector('#mx-wave-root').dataset.track!==id,beforeShake,{timeout:6000});await snap();
   }
   assert.match(await active(),/^pop-en-/,'Shake stays within the chosen station');
   await page.locator('.mx-pause').click();
   await page.waitForFunction(()=>document.querySelector('#audio').paused);
   for(let step=0;step<34;step++)await advance();
   const rendered=await deck.locator('[data-deck-item]:not([data-deck-shortcut])').count();assert.ok(rendered>=9&&rendered<=61,'The infinite deck must keep a bounded DOM');
   const farKeys=await deck.locator('[data-deck-item]:not([data-deck-shortcut])').evaluateAll(nodes=>nodes.map(n=>n.dataset.deckItem));
   assert.equal(new Set(farKeys).size,rendered,'An asynchronous refresh must not duplicate neighbors');
   await centered().locator('button').tap();await snap();
   const far=await centered().getAttribute('data-deck-item');assert.equal(await page.locator('.wave-deck-frame').getAttribute('data-selection'),far);
   assert.equal(await deck.evaluate(el=>el.scrollTop),0);
   const farOrder=await deck.locator(':scope>div').evaluateAll(nodes=>nodes.map(n=>n.dataset.deckItem));
   assert.deepEqual(farOrder.slice(farOrder.indexOf(far)-2,farOrder.indexOf(far)),['usual','shake'],'Commands must follow the selection after virtualizing');
   await page.screenshot({path:`${out}/station-${engine.name()}.png`,scale:'css'});
   // The 26-second fixture may end while the long deck exercise is running.
   // Keep one track selected while testing duplicate playlist additions.
   await page.locator('.mx-pause').tap();
   await page.waitForFunction(()=>document.querySelector('#audio').paused);
   await page.locator('.mx-track').tap();await page.locator('.mx-full-extra').waitFor();
   await page.waitForFunction(()=>document.querySelector('#dialog').getAnimations().every(animation=>animation.playState!=='running'));
   assert.equal(await page.locator('.mx-full-extra>button').count(),3);
   assert.equal(await page.locator('.mx-full-extra>button').evaluateAll(buttons=>buttons.every(b=>!b.textContent.trim()&&!!b.getAttribute('aria-label'))),true);
   await page.locator('[data-inline-playlist=drive]').tap();await page.locator('[data-inline-playlist=drive][aria-pressed=true]').waitFor();
   await page.locator('[data-inline-playlist=drive]').tap();
   const added=await page.evaluate(()=>JSON.parse(localStorage.getItem('sway.playlists.guest'))[0].tracks);
   assert.equal(added.length,1,'Repeated taps must not duplicate a playlist entry');
   await page.locator('[data-player-lyrics]').tap();await page.locator('[data-lyric-line]').first().waitFor();
   assert.equal(await page.locator('.full-artwork').evaluate(el=>el.hasAttribute('data-lyrics')),true);
   await page.screenshot({path:`${out}/player-${engine.name()}.png`,scale:'css'});
   assert.deepEqual(errors,[]);report.push({engine:engine.name(),far,playlist:added,pools});
   console.log(`PASS: ${engine.name()} real station queries, non-playing swipe, persistent selection, resume, shake, infinite deck, inline playlists and lyrics`);
  }finally{await browser.close();}
 }
}finally{fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
await writeFile(`${out}/stations-validation.json`,JSON.stringify({at:new Date().toISOString(),report},null,2));
