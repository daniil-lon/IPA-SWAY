import assert from 'node:assert/strict';
import {rankWave,deckRecommendations,relatedMix} from '../public/wave.js';
import {sampleAccent} from '../public/wave-light.js';

function checkRanking(){
 const seed={id:'seed',artist:'Piano',genre:'Keys',moods:['calm']};
 const related={id:'related',artist:'Another',genre:'Keys',moods:['calm']};
 const unrelated={id:'unrelated',artist:'Synth',genre:'Beats',moods:['bright']};
 const missed={id:'missed',artist:'Someone',genre:'Keys',moods:['calm']};
 const list=[unrelated,missed,seed,related];
 const orders=options=>rankWave(list,{random:()=>.5,now:1000,...options}).map(t=>t.id);
 assert.deepEqual(orders({exclude:['seed','missed']}),['unrelated','related']);
 assert.deepEqual(orders({exclude:['seed','missed'],likes:new Set(['seed'])}),['related','unrelated']);
 assert.deepEqual(orders({exclude:['seed','missed'],history:[{id:'seed',kind:'listen',at:1000}]}),['related','unrelated']);
 assert.deepEqual(orders({exclude:['seed'],mood:'calm',history:[{id:'missed',kind:'skip',at:1000}]}),['related','missed']);
 const choices=[...list,{id:'neighbor',artist:'Pulse',genre:'Beats',moods:['bright']}];
 assert.equal(deckRecommendations(choices,{likes:new Set(['seed'])})[0].id,'missed');
 assert.equal(deckRecommendations(choices,{likes:new Set(['unrelated'])})[0].id,'neighbor');
 assert.deepEqual(relatedMix(list,seed).slice(0,3).map(t=>t.id),['missed','related'],'A related mix starts after its seed, never repeats it');
}

export async function checkWave(browser,origin,catalog){
 checkRanking();
 const decks='.wave-deck', audio='#audio';
 const scroll=p=>p.locator(decks).evaluate(el=>el.scrollLeft);
 const centered=(p,id)=>p.waitForFunction(id=>{
  const deck=document.querySelector('.wave-deck'), item=deck?.querySelector('[data-deck-item="'+id+'"]');
  if(!item)return false;
  return Math.abs(item.offsetLeft+(item.offsetWidth-deck.clientWidth)/2-deck.scrollLeft)<2;
 },id,{timeout:6000});
 const atSlot=(p,slot)=>p.waitForFunction(slot=>{
  const deck=document.querySelector('.wave-deck'), item=deck?.querySelector('[data-deck-slot="'+slot+'"]');
  return item&&Math.abs(item.offsetLeft+(item.offsetWidth-deck.clientWidth)/2-deck.scrollLeft)<2;
 },slot,{timeout:6000});
 const isPlaying=p=>p.waitForFunction(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>.12;});
 const id=p=>p.locator(audio).evaluate(el=>el.getAttribute('src')?.split('/').at(-1)?.replace(/\.mp3$/,''));
 const moodOf=(trackId,mood)=>assert.ok(catalog.find(t=>t.id===trackId)?.moods.includes(mood),trackId+' was expected in '+mood);
 const mobile=await browser.newPage({viewport:{width:393,height:786},isMobile:true,hasTouch:true});
 const desktop=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];for(const p of [mobile,desktop]){
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 }
 try{
  await mobile.goto(origin+'/#home');await centered(mobile,'calm');
  const deck=mobile.locator(decks), box=await deck.boundingBox();
  assert.ok(box.y>=540&&box.y<580,JSON.stringify(box));
  assert.equal(await mobile.locator('.mx-artist-note').count(),0);
  assert.equal(await mobile.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.match(await mobile.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).backdropFilter),/blur\(7px\)/);
  const light=mobile.locator('.wave-light[data-ready]');
  await light.waitFor();
  const timings=await mobile.evaluate(()=>fetch('/wave-pulses.json').then(response=>response.json()));
  for(const t of catalog){
   const events=timings[t.id];
   assert.ok(events?.length>12&&events.length%2===0,t.id+' should have an audio accent map');
   const peak=(events[0]+3)/100;
   assert.ok(sampleAccent(events,peak)>0,t.id+' should respond at a real audio accent');
   assert.equal(sampleAccent(events,events.at(-2)/100+.45),0);
  }
  const litFrame=await light.evaluate(canvas=>canvas.toDataURL());
  await mobile.waitForFunction(frame=>document.querySelector('.wave-light').toDataURL()!==frame,litFrame,{polling:50,timeout:4000});
  const client=await mobile.context().newCDPSession(mobile);
  const point=(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  async function swipe(dir){
   await deck.evaluate((el,dir)=>{
    el.dataset.swipeEnded='false';const start=el.scrollLeft;
    function settle(){if((el.scrollLeft-start)*dir>85){el.dataset.swipeEnded='true';el.removeEventListener('scrollend',settle);}}
    el.addEventListener('scrollend',settle);
   },dir);
   const y=Math.round(box.y+84), start=Math.round(box.x+box.width*(dir>0?.78:.22));
   await point('touchStart',start,y);
   for(let i=1;i<=10;i++)await point('touchMove',start-dir*18*i,y);
   await point('touchEnd');
   await mobile.waitForFunction(()=>document.querySelector('.wave-deck').dataset.swipeEnded==='true',null,{timeout:6000});
  }
  const start=await scroll(mobile);
  await swipe(1);assert.ok(await scroll(mobile)>start+85);
  const afterRight=await scroll(mobile);
  await swipe(-1);assert.ok(await scroll(mobile)<afterRight-85);
  assert.equal(await mobile.locator(audio).getAttribute('src'),null,'swipe must not select a mood');

  await deck.press('End');await centered(mobile,'bright');
  await deck.press('ArrowLeft');await centered(mobile,'night');
  const night=mobile.getByRole('button',{name:'После полуночи',exact:true});
  await night.tap();await centered(mobile,'night');await isPlaying(mobile);
  const first=await id(mobile);moodOf(first,'night');
  assert.equal(await night.getAttribute('aria-pressed'),'true');
  const colors=track=>mobile.locator('.mx-wave-surface.is-current').evaluate((el,track)=>el.dataset.coverTrack===track&&Number(el.style.getPropertyValue('--cover-h')),track);
  assert.equal(await colors(first),catalog.find(t=>t.id===first).palette[0]);
  const clear=mobile.getByRole('button',{name:'Сбросить настроение «После полуночи»'});
  await clear.waitFor();
  await mobile.locator('.mx-wave-surface.is-current').evaluate(el=>Promise.all(el.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished)));
  await mobile.screenshot({path:'artifacts/mobile-mood.png'});
  await mobile.locator('.mx-track').tap();
  const full=mobile.locator('#dialog[open]');await full.waitFor();
  await full.evaluate(el=>Promise.allSettled(el.getAnimations().map(a=>a.finished)));
  await point('touchStart',292,222);
  for(let i=1;i<=8;i++)await point('touchMove',292-i*17,222);
  assert.ok(await mobile.locator('.full-peek').isVisible(),'Cover for the next track should follow the gesture');
  assert.equal(await id(mobile),first,'Track should switch only after the swipe settles');
  await point('touchEnd');await isPlaying(mobile);
  const second=await id(mobile);assert.notEqual(second,first);moodOf(second,'night');
  assert.equal(await colors(second),catalog.find(t=>t.id===second).palette[0]);
  assert.equal(await mobile.evaluate(first=>JSON.parse(localStorage.getItem('tonika.wave-history')).find(t=>t.id===first)?.kind,first),'skip');
  await point('touchStart',193,34);
  for(let i=1;i<=8;i++)await point('touchMove',193,34+i*14);
  await point('touchEnd');await full.waitFor({state:'hidden'});await centered(mobile,'night');
  await mobile.locator('.mx-pause').tap();
  await mobile.waitForFunction(()=>document.querySelector('#audio').paused&&getComputedStyle(document.querySelector('.mx-idle')).opacity==='1');
  const position=()=>mobile.locator(audio).evaluate(a=>a.currentTime);
  const stoppedAt=await position();
  await mobile.waitForTimeout(230);
  assert.ok(Math.abs((await position())-stoppedAt)<.03);
  await mobile.getByRole('button',{name:'Продолжить волну'}).tap();
  await mobile.waitForFunction(before=>document.querySelector('#audio').currentTime>before+.12,stoppedAt);
  assert.equal(await id(mobile),second);
  await clear.tap();await clear.waitFor({state:'hidden'});await isPlaying(mobile);
  assert.equal(await night.getAttribute('aria-pressed'),'false');
  assert.equal(await mobile.evaluate(()=>document.body.dataset.page),'home');
  await mobile.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await mobile.locator('.mx-wave-surface.is-current').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  const frozen=await light.evaluate(async canvas=>{
   const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
   await frame();await frame();
   const before=canvas.toDataURL();
   // Cover the frame cap so a running animation cannot pass this check.
   await new Promise(resolve=>setTimeout(resolve,180));
   return before===canvas.toDataURL();
  });
  assert.ok(frozen,'The liquid light should become still when motion is reduced');

  await deck.press('End');await atSlot(mobile,3);
  for(let i=4;i<=27;i++){await deck.press('ArrowRight');await atSlot(mobile,i);}
  assert.equal(await deck.locator('[data-deck-slot]').count(),19);
  await deck.press('Home');await atSlot(mobile,0);
  for(let i=-1;i>=-24;i--){await deck.press('ArrowLeft');await atSlot(mobile,i);}
  const rec=deck.locator('[data-deck-slot="-24"] button');
  const seed=await rec.getAttribute('data-wave-seed');assert.ok(seed);
  await rec.tap();await isPlaying(mobile);assert.equal(await id(mobile),seed);
  assert.equal(await rec.getAttribute('aria-pressed'),'true');
  assert.ok(await mobile.getByRole('button',{name:/Сбросить подборку/}).isVisible());

  await desktop.goto(origin+'/#home');await centered(desktop,'calm');
  const pcDeck=await desktop.locator(decks).boundingBox(), mid=pcDeck.x+pcDeck.width*.55, y=pcDeck.y+99;
  const beforeDrag=await scroll(desktop);await desktop.mouse.move(mid,y);await desktop.mouse.down();
  await desktop.mouse.move(mid-218,y,{steps:12});await desktop.mouse.up();
  await desktop.waitForFunction(before=>document.querySelector('.wave-deck').scrollLeft>before+150,beforeDrag);
  await centered(desktop,'night');
  assert.equal(await desktop.locator(audio).getAttribute('src'),null,'drag must not select a mood');
  await desktop.getByRole('button',{name:'Предыдущая подборка'}).click();await centered(desktop,'calm');
  await desktop.getByRole('button',{name:'Спокойно',exact:true}).click();await isPlaying(desktop);
  moodOf(await id(desktop),'calm');
  assert.deepEqual(errors,[]);
  console.log('Wave: beat timing, pause/resume, player gestures, reduced motion, cover palettes and endless deck passed');
 }finally{await Promise.all([mobile.close(),desktop.close()]);}
}
