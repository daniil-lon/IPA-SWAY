// Promo screenshots: iPhone 15 Pro WebKit at 3x from the local server. Usage: node promo/src/capture.mjs promo/shots
import {webkit,devices} from 'playwright';
import {mkdir} from 'node:fs/promises';
const out=process.argv[2];await mkdir(out,{recursive:true});
const b=await webkit.launch();
const p=await b.newPage({...devices['iPhone 15 Pro'],viewport:{width:393,height:852}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const imagesReady=()=>p.waitForFunction(()=>[...document.images].filter(i=>i.offsetParent&&i.getAttribute('src')).every(i=>i.complete&&i.naturalWidth),null,{timeout:20000}).catch(()=>console.log('images still loading'));
const shot=async(name,wait=1200)=>{await p.waitForTimeout(wait);await imagesReady();await p.waitForTimeout(400);await p.screenshot({path:out+'/'+name+'.png'});console.log('shot',name);};
const playing=()=>p.evaluate(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>0.5;});
await p.goto('http://127.0.0.1:8794');await p.locator('.mx-idle h1').waitFor({timeout:90000});await p.waitForTimeout(2500);
await shot('home-idle');
await p.evaluate(()=>document.querySelector('.mx-start').click());
for(let i=0;i<30&&!await playing();i++)await p.waitForTimeout(1000);
// Fill «Мне нравится» with a few wave tracks so the collection is not empty.
for(let i=0;i<7;i++){await p.evaluate(()=>{document.querySelector('#like-now')?.click();document.querySelector('#next')?.click();});await p.waitForTimeout(1800);}
for(let i=0;i<14&&await p.evaluate(()=>document.querySelector('.mx-artist-photo')?.hidden!==false);i++){await p.evaluate(()=>document.querySelector('#next').click());await p.waitForTimeout(2200);}
await p.waitForTimeout(3000);await shot('home-wave');
await p.evaluate(()=>document.querySelector('#now-open').click());await p.locator('#dialog .full-player').waitFor();
await shot('player',2200);
await p.evaluate(()=>document.querySelector('#dialog [data-player-lyrics]')?.click());await p.waitForFunction(()=>document.querySelectorAll('#dialog .lyrics-lines > *').length>3,null,{timeout:20000}).catch(()=>console.log('lyrics not loaded'));await shot('lyrics',1500);
await p.evaluate(()=>document.querySelector('#dialog .dialog-close,#dialog [data-action="close-player"]')?.click());await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelector('#sheet')?.close();document.querySelector('#dialog')?.close();});await p.waitForTimeout(1500);
for(const [name,hash] of [['collection','#library'],['liked','#liked'],['discover','#discover'],['chart','#discover/chart'],['settings','#settings'],['equalizer','#settings/equalizer']]){
 await p.evaluate(h=>{location.hash=h;},hash);await shot(name,2200);
}
console.log('errors',JSON.stringify(errors));
await b.close();
// The equalizer needs Web Audio, which iOS native playback skips; show it from Edge at the same phone size.
{
 const {chromium}=await import('playwright');
 const eb=await chromium.launch({channel:'msedge',args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
 const ep=await eb.newPage({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await ep.goto('http://127.0.0.1:8794');await ep.locator('.mx-idle h1').waitFor({timeout:90000});await ep.waitForTimeout(1500);
 await ep.evaluate(()=>document.querySelector('.mx-start').click());await ep.waitForTimeout(5000);
 await ep.evaluate(()=>{location.hash='#settings/equalizer';});await ep.waitForTimeout(2000);
 await ep.evaluate(()=>{const t=document.querySelector('.equalizer-view input[type=checkbox],[role=switch]');if(t&&!t.checked)t.click();});await ep.waitForTimeout(600);
 await ep.evaluate(()=>document.querySelectorAll('[data-eq-preset]')[1]?.click());await ep.waitForTimeout(1500);
 await ep.screenshot({path:out+'/equalizer-edge.png'});console.log('shot equalizer-edge');
 await eb.close();
}
