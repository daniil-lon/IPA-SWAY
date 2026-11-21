import {webkit,devices} from 'playwright';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

await mkdir('artifacts/mobile-loading',{recursive:true});
const browser=await webkit.launch({headless:true,...(process.env.SWAY_MOBILE_PROXY?{proxy:{server:process.env.SWAY_MOBILE_PROXY}}:{})});
const context=await browser.newContext({...devices['iPhone 13'],locale:'ru-RU'});
const page=await context.newPage(),requests=[],errors=[],logs=[],workers=[];
const hash=body=>createHash('sha256').update(body).digest('hex'),expectedWorker=hash(await readFile('public/sw.js'));
context.on('response',response=>{
 if(!response.url().endsWith('/sw.js'))return;
 const record={status:response.status(),encoding:response.headers()['content-encoding'],sizeHeader:response.headers()['x-sway-size']};workers.push(record);
 console.log('Startup worker headers: '+JSON.stringify(record));
 response.body().then(body=>{record.size=body.length;record.hash=hash(body);record.complete=record.hash===expectedWorker;console.log('Startup worker: '+body.length+' bytes; verified '+record.complete);}).catch(e=>record.error=e.message);
});
page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
context.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text());});
context.on('request',r=>requests.push({url:r.url(),kind:r.resourceType(),at:Date.now(),state:'pending'}));
context.on('requestfinished',r=>{const t=requests.findLast(t=>t.url===r.url()&&t.state==='pending');if(t){t.state='complete';t.ms=Date.now()-t.at;}});
context.on('requestfailed',r=>{const t=requests.findLast(t=>t.url===r.url()&&t.state==='pending');if(t){t.state='failed';t.ms=Date.now()-t.at;t.error=r.failure();}});
let result={},started=Date.now();
const progress=setInterval(()=>{page.evaluate(()=>({stage:document.body?.dataset.loadStage,error:document.body?.dataset.workerError})).then(state=>console.log('Progress: '+JSON.stringify(state))).catch(()=>{});},10000);
try{
 const response=await page.goto('https://music.academmix.ru/',{waitUntil:'commit',timeout:20000});result.csp=response.headers()['content-security-policy'];
 result.currentBootstrap=(await page.locator('script[data-sway-boot]').textContent()).includes('worker-download');
 assert.equal(result.currentBootstrap,true,'The check must receive the published Safari startup fix');
 await page.locator('.mx-start').waitFor({timeout:60000});await page.locator('#sway-splash').waitFor({state:'hidden',timeout:10000});result.homeMs=Date.now()-started;
 result.layout=await page.evaluate(()=>({inline:!!document.querySelector('[data-sway-boot]'),sidebar:getComputedStyle(document.querySelector('.sidebar')).display,nav:getComputedStyle(document.querySelector('.mobile-nav')).display,style:!!document.querySelector('[data-sway-style]')?.sheet,application:!!document.querySelector('[data-sway-app]')}));
 assert.equal(result.layout.inline,true);assert.equal(result.layout.sidebar,'none');assert.notEqual(result.layout.nav,'none');assert.equal(result.layout.style,true);assert.equal(result.layout.application,true);assert.deepEqual(errors,[]);
 await page.screenshot({path:'artifacts/mobile-loading/live-webkit-home.png'});
 console.log('PASS: mobile WebKit production home loaded in '+result.homeMs+' ms');
}catch(e){result.error=e.message;process.exitCode=1;console.log('FAIL: '+e.message);}
finally{
 clearInterval(progress);
 result.dom=await page.evaluate(async()=>({body:document.body?.innerText.slice(0,1200),stage:document.body?.dataset.loadStage,workerError:document.body?.dataset.workerError,loadError:document.body?.dataset.loadError,registration:await navigator.serviceWorker?.getRegistration().then(r=>r?{active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state}:null),styles:[...document.querySelectorAll('[data-sway-style]')].map(l=>({href:l.dataset.swayStyle,loaded:!!l.sheet})),serviceWorker:!!navigator.serviceWorker,controller:navigator.serviceWorker?.controller?.scriptURL,support:{socket:typeof WebSocket,decompress:typeof DecompressionStream,timeout:typeof AbortSignal.timeout},state:document.readyState})).catch(e=>({error:e.message}));
 const tag=process.env.SWAY_MOBILE_TAG||'before';if(!/^[a-z0-9-]+$/.test(tag))throw new Error('Invalid diagnostic tag');
 await writeFile('artifacts/mobile-loading/webkit-live-'+tag+'.json',JSON.stringify({at:new Date().toISOString(),result,requests,errors,logs,workers},null,2));await browser.close();
}
