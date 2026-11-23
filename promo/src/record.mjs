// Records a short real walkthrough on iPhone 15 Pro WebKit and lays it over promo/video-bg.png.
// Usage (local server on 8794): node promo/src/record.mjs <ffmpeg.exe>
import {webkit,devices} from 'playwright';
import {mkdir,readdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url)),promo=join(here,'..'),raw=join(promo,'shots','video-raw');
const ffmpeg=process.argv[2]||'ffmpeg';
await rm(raw,{recursive:true,force:true});await mkdir(raw,{recursive:true});
const browser=await webkit.launch();
const context=await browser.newContext({...devices['iPhone 15 Pro'],viewport:{width:393,height:852},recordVideo:{dir:raw,size:{width:786,height:1704}}});
const page=await context.newPage();
const wait=ms=>page.waitForTimeout(ms);
const tapIn=async selector=>page.evaluate(s=>document.querySelector(s)?.click(),selector);
await page.goto('http://127.0.0.1:8794');await page.locator('.mx-idle h1').waitFor({timeout:90000});await wait(2500);
await tapIn('.mx-start');
for(let i=0;i<30&&!await page.evaluate(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>0.5;});i++)await wait(500);
for(let i=0;i<12&&await page.evaluate(()=>document.querySelector('.mx-artist-photo')?.hidden!==false);i++){await tapIn('#next');await wait(1800);}
await wait(2500);
await tapIn('#now-open');await page.locator('#dialog .full-player').waitFor();await wait(10000);
await page.evaluate(()=>{document.querySelector('#sheet')?.close();document.querySelector('#dialog')?.close();});await wait(800);
await page.evaluate(()=>{location.hash='#discover';});await wait(3000);
await page.evaluate(()=>window.scrollBy({top:500,behavior:'smooth'}));await wait(2500);
await page.close();await context.close();await browser.close();
const clip=join(raw,(await readdir(raw)).find(n=>n.endsWith('.webm')));
// Skip the splash while the app loads, scale the phone to 1500 px high and centre it on the branded background.
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-loop','1','-i',join(promo,'video-bg.png'),'-ss','3.5','-i',clip,
 '-filter_complex','[1:v]scale=-2:1500,format=yuva420p,geq=lum=\'p(X,Y)\':a=\'if(gt(abs(X-W/2),W/2-46)*gt(abs(Y-H/2),H/2-46),if(lte(hypot(abs(X-W/2)-(W/2-46),abs(Y-H/2)-(H/2-46)),46),255,0),255)\'[phone];[0:v][phone]overlay=(W-w)/2:250:shortest=1,format=yuv420p[v]',
 '-map','[v]','-r','30','-c:v','libx264','-preset','medium','-crf','20','-movflags','+faststart',join(promo,'sway-reel.mp4')]);
console.log('wrote promo/sway-reel.mp4');
