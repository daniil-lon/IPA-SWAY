import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
const origin='https://music.academmix.ru',release=JSON.parse(await readFile('artifacts/next-stage/release.json','utf8')),results=[];
for(const path of ['/api/health','/admin','/api/catalog?plan=1','/api/playback']){
 const at=Date.now(),r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,path==='/api/playback'?401:200,path);
 if(path.includes('catalog')){const d=await r.json();assert.equal(d.total,7000);assert.ok(d.pages.length>10);assert.equal(d.next,d.pages[0]);}
 else await r.arrayBuffer();results.push({path,status:r.status,ms:Date.now()-at});
}
const apk=await fetch(origin+'/downloads/Sway-Android.apk',{signal:AbortSignal.timeout(60000)});assert.equal(apk.status,200);
assert.equal(createHash('sha256').update(Buffer.from(await apk.arrayBuffer())).digest('hex'),release.assets['downloads/Sway-Android.apk']);
for(const [name,engine,profile]of [['Android',chromium,devices['Pixel 7']],['iPhone WebKit',webkit,devices['iPhone 15']]]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge',args:['--mute-audio']}:{})});
 try{
  const context=await browser.newContext({...profile,locale:'ru-RU'}),page=await context.newPage(),errors=[],pages=new Map(),at=Date.now();
  page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/catalog'&&r.status()===200){try{const d=await r.json();pages.set(new URL(r.url()).searchParams.get('offset'),d);}catch{}}});
  await page.goto(origin+'/#home',{waitUntil:'domcontentloaded',timeout:45000});await page.waitForSelector('.mx-start',{timeout:45000});const firstScreenMs=Date.now()-at;
  await page.locator('.mx-start').tap();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.3,null,{timeout:30000});
  const metadata=await page.evaluate(()=>({title:navigator.mediaSession?.metadata?.title,src:document.querySelector('#audio').src}));assert.ok(metadata.src.startsWith(origin+'/media/'));
  await page.evaluate(()=>{const a=document.querySelector('#audio');a.pause();a.currentTime=8;});await page.waitForFunction(()=>document.querySelector('#audio').paused&&Math.abs(document.querySelector('#audio').currentTime-8)<.5);
  await page.evaluate(()=>location.hash='#search');await page.locator('#search-query').fill('basta');await page.waitForFunction(()=>document.querySelector('#search-results')?.textContent.includes('Баста'),null,{timeout:90000});
  if(engine===chromium){const deadline=Date.now()+90000;while([...pages.values()].reduce((n,d)=>n+d.items.length,0)<7000&&Date.now()<deadline)await page.waitForTimeout(500);assert.equal([...pages.values()].reduce((n,d)=>n+d.items.length,0),7000,'The complete catalogue must finish in the background');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:'artifacts/next-stage/live-'+(engine===chromium?'android':'iphone')+'.png'});
  results.push({browser:name,firstScreenMs,loadedTracks:[...pages.values()].reduce((n,d)=>n+d.items.length,0),metadata:!!metadata.title,playback:'passed',pauseSeek:'passed',search:'passed',errors});
 }finally{await browser.close();}
}
await writeFile('artifacts/next-stage/live-current.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
