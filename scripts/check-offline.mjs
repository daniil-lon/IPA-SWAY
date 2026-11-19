import assert from 'node:assert/strict';
import {chromium, devices, webkit} from 'playwright';

const origin=new URL(process.argv[2]||'http://127.0.0.1:8794').origin;
const sample=(await fetch(origin+'/catalog.json').then(r=>r.json())).filter(t=>t.audio.startsWith('/media/')).slice(0,2);
assert.equal(sample.length,2);
const [first,second]=sample;
const cases=[
 ['Android layout / Edge',chromium,{channel:process.env.TONIKA_BROWSER||'msedge'},devices['Pixel 7']],
 ...(process.env.SWAY_OFFLINE_WEBKIT?[['iPhone layout / WebKit',webkit,{},devices['iPhone 15']]]:[])
];
for(const [label,engine,launch,device] of cases){
 const browser=await engine.launch(launch);
 try{
  const context=await browser.newContext(device);
  await context.route(origin+'/catalog.json',route=>route.fulfill({json:sample}));
  let externalDownloads=0;
  const errors=[];
  const page=await context.newPage();page.setDefaultTimeout(18000);
  page.on('download',()=>externalDownloads++);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/#home',{waitUntil:'commit'});
  await page.getByRole('button',{name:'Слушать волну',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('#audio').currentTime>0);
  await page.locator('.mx-track-control .mx-track').tap();
  await page.locator('.mx-full [data-offline-toggle]').tap();
  await page.locator('.mx-full [data-offline-toggle].saved').waitFor();
  assert.equal(externalDownloads,0,'download must stay inside the app');
  await page.locator('#dialog .dialog-close').tap();
  await page.locator('#dialog').waitFor({state:'hidden'});
  await page.goto(origin+'/#library/offline',{waitUntil:'commit'});
  await page.getByText(first.title,{exact:true}).first().waitFor();
  await page.getByRole('button',{name:/^Скачать каталог/}).tap();
  await page.getByText('Сохранено: 1 из 1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Воспроизвести '+second.title,exact:true}).waitFor();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.close();
  const cold=await context.newPage();cold.setDefaultTimeout(18000);
  cold.on('pageerror',error=>errors.push(error.message));
  await cold.goto(origin+'/#home',{waitUntil:'commit'});
  await cold.locator('body[data-offline-mode]').waitFor();
  await cold.getByRole('heading',{name:'Музыка без интернета'}).waitFor();
  assert.equal(new URL(cold.url()).hash,'#library/offline');
  const byteRange=await cold.evaluate(async id=>{
   const url='/_sway-offline/audio/'+encodeURIComponent(id);
   const range=await fetch(url,{headers:{Range:'bytes=40-71'}});
   const tail=await fetch(url,{headers:{Range:'bytes=-10'}});
   const invalid=await fetch(url,{headers:{Range:'bytes=999999999-'}});
   return [range.status,range.headers.get('Content-Range'),(await range.arrayBuffer()).byteLength,tail.status,(await tail.arrayBuffer()).byteLength,invalid.status];
  },first.id);
  assert.deepEqual(byteRange,[206,'bytes 40-71/'+first.bytes,32,206,10,416]);
  await cold.getByRole('button',{name:'Воспроизвести '+first.title,exact:true}).tap();
  try{await cold.waitForFunction(()=>{const a=document.querySelector('#audio');return !navigator.onLine&&(a.currentSrc.includes('/_sway-offline/audio/')||a.currentSrc.startsWith('blob:'))&&!a.paused&&a.currentTime>.1;});}
  catch(error){console.log('Offline audio diagnostic',label,await cold.evaluate(()=>{const a=document.querySelector('#audio');return {online:navigator.onLine,src:a.currentSrc,paused:a.paused,time:a.currentTime,ready:a.readyState,error:a.error?.code,notice:document.querySelector('#notice')?.textContent};}));throw error;}
  await cold.locator('.player [data-action="now-open"]').tap();
  const range=cold.locator('.full-seek');await range.scrollIntoViewIfNeeded();
  const box=await range.boundingBox();
  await cold.touchscreen.tap(box.x+box.width*.62,box.y+7);
  await cold.waitForFunction(()=>{const a=document.querySelector('#audio');return a.currentTime/a.duration>.57&&a.currentTime/a.duration<.7;});
  await cold.locator('#dialog .dialog-close').tap();
  await cold.getByRole('button',{name:'Удалить из скачанного: '+second.title,exact:true}).tap();
  await cold.getByRole('button',{name:'Воспроизвести '+second.title,exact:true}).waitFor({state:'detached'});
  await cold.reload({waitUntil:'commit'});
  await cold.getByRole('button',{name:'Воспроизвести '+first.title,exact:true}).waitFor();
  assert.equal(await cold.getByRole('button',{name:'Воспроизвести '+second.title,exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log(label+': in-app save, bulk download, cold offline launch, HTTP ranges, playback, touch seek and removal passed');
 }finally{await browser.close();}
}
