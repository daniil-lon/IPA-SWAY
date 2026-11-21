import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const out='artifacts/loading-recovery',requests=[],errors=[],logs=[],workerState=[];
const suffix=process.env.SWAY_LIVE_TAG|| (process.env.SWAY_HTTP1?'http1':'');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio',...(process.env.SWAY_HTTP1?['--disable-http2']:[])],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const context=await browser.newContext({viewport:{width:393,height:852},locale:'ru-RU'}),page=await context.newPage();
page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack}));
context.on('request',request=>requests.push({url:request.url(),kind:request.resourceType(),worker:!!request.serviceWorker(),at:Date.now(),state:'started'}));
context.on('requestfinished',request=>{const record=requests.findLast(r=>r.url===request.url()&&r.state==='started');if(record){record.state='complete';record.ms=Date.now()-record.at;}});
context.on('requestfailed',request=>{const record=requests.findLast(r=>r.url===request.url()&&r.state==='started');if(record){record.state='failed';record.ms=Date.now()-record.at;record.error=request.failure();}});
context.on('console',message=>{if(message.type()==='error'||message.type()==='warning')logs.push({type:message.type(),text:message.text()});});
context.on('serviceworker',worker=>workerState.push({url:worker.url(),at:Date.now()}));
let result={};const start=Date.now();
try{
 await page.goto('https://music.academmix.ru/',{waitUntil:'commit'});
 await page.locator('.mx-start').waitFor({timeout:60000});result.homeMs=Date.now()-start;
 await page.screenshot({path:out+'/live-home.png',timeout:10000});
 await page.locator('.mx-start').click();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.3,null,{timeout:25000});
 result.playback=await page.evaluate(()=>({time:document.querySelector('#audio').currentTime,title:document.querySelector('.mx-track')?.textContent}));
 if(process.env.SWAY_LIVE_EXTENDED){
  await page.waitForFunction(()=>document.querySelector('#audio').currentTime>12,null,{timeout:25000});
  result.continuous=await page.evaluate(()=>({time:document.querySelector('#audio').currentTime,buffered:Array.from({length:document.querySelector('#audio').buffered.length},(_,i)=>document.querySelector('#audio').buffered.end(i))}));
  await page.waitForFunction(async()=>{
   const count=await new Promise(resolve=>{const request=indexedDB.open('sway-catalog',1);request.onerror=()=>resolve(0);request.onsuccess=()=>{const db=request.result;try{const value=db.transaction('cache').objectStore('cache').get('catalog');value.onsuccess=()=>{const n=value.result?.items?.length||0;db.close();resolve(n);};value.onerror=()=>{db.close();resolve(0);};}catch{db.close();resolve(0);}};});return count===7000;
  },null,{timeout:90000});result.fullCatalog=7000;
 }
 await page.locator('.mx-track').click();await page.locator('.mx-full-extra').waitFor({timeout:10000});await page.screenshot({path:out+'/live-player.png',timeout:10000});result.player=true;
 console.log('PASS: live home, actual audio playback and full player');
}catch(error){result.error=error.message;process.exitCode=1;console.log('FAIL: '+error.message);}
finally{
 result.dom=await page.evaluate(()=>({ready:document.readyState,message:document.querySelector('.splash-sub')?.textContent,body:document.body.textContent.slice(0,500),styles:[...document.querySelectorAll('link[data-sway-style]')].map(l=>({path:l.getAttribute('href'),loaded:!!l.sheet}))})).catch(()=>null);
 result.worker=await page.evaluate(()=>({controller:navigator.serviceWorker.controller?.scriptURL})).catch(()=>null);
 result.audio=await page.locator('audio').evaluateAll(nodes=>nodes.map(a=>({src:a.currentSrc,time:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.code,buffered:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)])}))).catch(()=>[]);
 await writeFile(out+'/live-browser'+(suffix?'-'+suffix:'')+'.json',JSON.stringify({at:new Date().toISOString(),result,errors,requests,logs,workerState},null,2));await browser.close();
}
