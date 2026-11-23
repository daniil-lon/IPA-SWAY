import assert from 'node:assert/strict';
import {webkit,devices} from 'playwright';
import {queueSnapshot} from '../public/listening-tools.js';
import {setSleepTimer,setSleepTimerAtTrackEnd,setSleepTimerAfterTracks,cancelSleepTimer,checkTrackEndSleep,isEndOfTrackSleep,getSleepTimerStatus,sleepFadeLevel,sleepFadeSeconds} from '../public/sleep-timer.js';

// The end-of-track timer reports that it stopped playback, so the player does not advance.
let stopped=0;
assert.equal(checkTrackEndSleep({onTrigger:()=>stopped++}),false);
setSleepTimerAtTrackEnd();assert.equal(isEndOfTrackSleep(),true);
assert.equal(checkTrackEndSleep({onTrigger:()=>stopped++}),true);
assert.equal(stopped,1);assert.equal(isEndOfTrackSleep(),false);
// A timed fade always gives the player its level back.
const levels=[];setSleepTimer(5,{onFade:v=>levels.push(v)});cancelSleepTimer();
assert.deepEqual(levels,[1]);
// After N tracks: earlier tracks only count down, the last one stops and blocks the crossfade into the next.
setSleepTimerAfterTracks(3);assert.equal(getSleepTimerStatus().label,'Ещё 3 трека');
assert.equal(checkTrackEndSleep({onTrigger:()=>stopped++}),false);assert.equal(checkTrackEndSleep({onTrigger:()=>stopped++}),false);
assert.equal(isEndOfTrackSleep(),true);assert.equal(checkTrackEndSleep({onTrigger:()=>stopped++}),true);assert.equal(stopped,2);
// The long fade starts at full level and eases into near silence.
assert.ok(sleepFadeSeconds>=30&&sleepFadeSeconds<=60);
assert.equal(sleepFadeLevel(sleepFadeSeconds),1);assert.equal(sleepFadeLevel(0),.02);
assert.ok(sleepFadeLevel(sleepFadeSeconds/2)<.5&&sleepFadeLevel(sleepFadeSeconds/2)>.2);

// Saved queues: legacy boolean repeat becomes "repeat one", shuffle keeps its original order.
const ids=new Set(['a','b','c']);
assert.equal(queueSnapshot({queue:['a','b'],current:'a',repeat:true},ids).repeat,'one');
assert.equal(queueSnapshot({queue:['a','b'],current:'a',repeat:'all'},ids).repeat,'all');
assert.equal(queueSnapshot({queue:['a','b'],current:'a',repeat:'loop'},ids).repeat,'off');
assert.deepEqual(queueSnapshot({queue:['b','a'],current:'a',shuffle:true,original:['a','x','b','a']},ids).original,['a','b']);
assert.equal(queueSnapshot({queue:['b','a'],current:'a',original:['a','b']},ids).original,null);
assert.equal(queueSnapshot({queue:['a'],current:'a',source:'Чарт Sway'},ids).source,'Чарт Sway');

const origin=(process.argv[2]||'http://127.0.0.1:8794').replace(/\/$/,'');
const browser=await webkit.launch();
try{
 const page=await browser.newPage({...devices['iPhone 14']});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 await page.locator('.mx-idle h1').waitFor({timeout:60000});
 // Start a fixed list without autoplaying audio, then open the full player.
 await page.evaluate(()=>{location.hash='#discover/chart';});
 await page.locator('[data-action="play-chart"]').first().waitFor({timeout:30000});
 await page.waitForTimeout(1500);
 await page.locator('[data-action="play-chart"]').first().tap();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tonika.queue.guest')||'null')?.queue?.length>5,null,{timeout:60000});
 // Keep the check about queue order, not about audio output in a headless browser.
 await page.evaluate(()=>document.querySelector('#audio').pause());
 await page.locator('#now-open').tap();
 const full=page.locator('#dialog .full-player');await full.waitFor();
 const queueIds=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tonika.queue.guest')||'null'));
 const before=await queueIds();

 // Shuffle reorders the real queue, keeps the playing track first and restores the order when turned off.
 await page.locator('#dialog [data-action="shuffle"]').tap();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tonika.queue.guest')).shuffle===true);
 const mixed=await queueIds();
 assert.equal(mixed.queue[0],before.current);
 assert.deepEqual([...mixed.queue].sort(),[...before.queue].sort());
 assert.notDeepEqual(mixed.queue,before.queue);
 assert.deepEqual(mixed.original,before.queue);
 // Next follows the shuffled order, previous returns to the track that was playing.
 await page.locator('#dialog [data-action="next"]').tap();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tonika.queue.guest')).current===id,mixed.queue[1]);
 await page.locator('#dialog [data-action="prev"]').tap();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tonika.queue.guest')).current===id,mixed.queue[0]);
 await page.locator('#dialog [data-action="shuffle"]').tap();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tonika.queue.guest')).shuffle===false);
 assert.deepEqual((await queueIds()).queue,before.queue);

 // Repeat cycles off → queue → track → off and keeps the matching icon.
 const repeat=page.locator('#dialog [data-action="repeat"]');
 for(const [mode,pressed,iconName] of [['all','true','repeat'],['one','true','repeat-one'],['off','false','repeat']]){
  await repeat.tap();
  assert.equal(await repeat.getAttribute('data-repeat'),mode);
  assert.equal(await repeat.getAttribute('aria-pressed'),pressed);
  assert.equal(await repeat.locator('i').getAttribute('data-icon'),iconName);
 }

 // Queue sheet: where the music plays from and what played before.
 assert.equal((await page.locator('#dialog .mx-full header span').textContent()).trim(),'Чарт Sway');
 await page.locator('#dialog [data-action="next"]').tap();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tonika.queue.guest')).current===id,before.queue[1]);
 await page.locator('#dialog [data-action="queue"]').first().tap();
 await page.locator('#sheet .queue-source strong').waitFor();
 assert.equal(await page.locator('#sheet .queue-source strong').textContent(),'Чарт Sway');
 assert.equal(await page.locator('#sheet .queue-earlier [data-row]').first().getAttribute('data-row'),before.queue[0]);
 await page.evaluate(()=>{document.querySelector('#sheet').close();document.querySelector('#dialog').close();});

 // Row gestures on a list: swipe left plays next, long press opens the track menu.
 const target=before.queue[6];
 const gesture=(id,moves,hold=0)=>page.evaluate(async({id,moves,hold})=>{
  const el=document.querySelector('main [data-row="'+CSS.escape(id)+'"] .row-track'),box=el.getBoundingClientRect(),y=box.top+box.height/2;let x=box.left+box.width/2;
  const fire=(type,cx)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,isPrimary:true,pointerId:7,pointerType:'touch',button:0,clientX:cx,clientY:y}));
  fire('pointerdown',x);for(const dx of moves){x+=dx;fire('pointermove',x);await new Promise(r=>setTimeout(r,16));}
  if(hold)await new Promise(r=>setTimeout(r,hold));fire('pointerup',x);el.click();
 },{id,moves,hold});
 await gesture(target,[-20,-30,-30,-30]);
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('tonika.queue.guest')).nextUp===id,target);
 const order=await queueIds();assert.equal(order.queue[order.queue.indexOf(order.current)+1],target);
 assert.equal(order.current,before.queue[1],'a swipe must not also start the track');
 await gesture(target,[],650);
 await page.locator('#sheet .mx-info-list').waitFor();
 assert.equal(order.current,(await queueIds()).current,'a long press must not also start the track');
 assert.deepEqual(errors,[]);
 console.log('PASS: saved repeat/shuffle state, real shuffled queue with previous/next and restore, three repeat modes, playing-from and earlier tracks, row swipe and long press, sleep timer after N tracks with a long fade on iPhone WebKit');
}finally{await browser.close();}
