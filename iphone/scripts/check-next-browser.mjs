import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
const tests=[];
for(const [name,browserType,device] of [['Chromium',chromium,'Pixel 7'],['WebKit',webkit,'iPhone 13']]){
 let revision=1,reads=0;
 const list={id:'11111111-1111-1111-1111-111111111111',name:'Вместе',role:'viewer',tracks:[track.id],addedBy:{[track.id]:'Друг'}};
 const fixture=await servePlayer({catalog:[{...track,artist:'Баста'},nextTrack],handler:async(req,res,path)=>{
  let value;
  if(path==='/api/me')value={user:{id:'browser-user',name:'Тест',volume:.8,autoplay:true,motion:true,crossfade:true,wavePattern:'ribbons',waveMark:''},likes:[],loginRequired:false};
  if(path==='/api/catalog'){reads++;const offset=new URL(req.url,'http://x').searchParams.get('offset');if(offset==='0')value={items:[{...track,artist:'Баста'}],next:1,total:2};else{await new Promise(r=>setTimeout(r,500));value={items:[nextTrack],next:null,total:2};}}
  if(path==='/api/playlists')value={playlists:[list]};
  if(path==='/api/history')value={tracks:[]};
  if(path==='/api/playback')value=req.method==='GET'?{revision:1,device:'other-device',snapshot:{queue:[track.id],current:track.id,position:9,mode:'wave'}}:{revision:++revision};
  if(path==='/api/stats')value={period:'week',days:7,seconds:1800,plays:9,discoveries:3,tracks:[{track:track.id}],artists:[{name:'Баста',seconds:1800}],daily:[{day:'2026-11-18',seconds:1800}]};
  if(value!==undefined){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));return true;}return false;
 }});
 let browser;try{
  browser=await browserType.launch({headless:true,...(name==='Chromium'?{channel:'msedge'}:{})});const context=await browser.newContext({...devices[device]}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fixture.origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('#mx-wave-root',{timeout:15000});
  await page.waitForSelector('.account-resume');await page.locator('[data-account-keep]').click();
  await page.goto(fixture.origin+'/#search');await page.locator('#search-query').fill('basta');await page.waitForTimeout(350);assert.ok((await page.locator('#search-results').innerText()).includes('Тестовый тон'));
  await page.goto(fixture.origin+'/#library/playlists/'+list.id);await page.waitForSelector('[data-playlist-leave]');assert.equal(await page.locator('[data-playlist-remove]').count(),0);assert.ok((await page.locator('main').innerText()).includes('Добавил: Друг'));
  await page.goto(fixture.origin+'/#stats/week');await page.waitForSelector('[data-stats-share]');assert.ok((await page.locator('.stats-card').innerText()).includes('30'));await page.screenshot({path:'artifacts/next-stage/stats-'+name+'.png',fullPage:true});
  await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
  const downloading=page.waitForEvent('download');await page.locator('[data-stats-share]').click();const download=await downloading;assert.equal(download.suggestedFilename(),'sway-my-music.png');
  await download.saveAs('artifacts/next-stage/stats-card-'+name+'.png');const png=await readFile('artifacts/next-stage/stats-card-'+name+'.png');assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1350);
  assert.deepEqual(errors,[]);assert.ok(reads>=2);tests.push(name+': PASS progressive loading, transliteration, remote resume prompt, viewer permissions, attribution, statistics');
 }finally{await browser?.close();fixture.server.close();}
}
console.log(tests.join('\n'));
