import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,devices} from 'playwright';
const origin='https://music.academmix.ru',out='artifacts/november-21-reference',r=JSON.parse(await readFile('artifacts/next-stage/release.json','utf8')),results=[];
const deployment=JSON.parse((await readFile(out+'/deployments-after.json','utf8')).replace(/^\uFEFF/,''));deployment.sort((a,b)=>a.created_on.localeCompare(b.created_on));assert.deepEqual(deployment.at(-1).versions,[{version_id:r.publishedVersion,percentage:100}]);
await Promise.all(['app.js','refinements.css','lyrics.js','lyrics.css','system-media.js','audio-transition.js','music-language.js','music-intelligence.js','wave-light.js','player-scene.js','playlists.js','admin-catalog.js','sw.js','track-languages.json','index.html'].map(async f=>{
 const response=await fetch(origin+'/'+f+'?release='+r.publishedVersion,{signal:AbortSignal.timeout(20000)}).catch(e=>{throw new Error('Published asset request failed: '+f,{cause:e});});assert.equal(response.status,200,f);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),r.assets[f],f);results.push({asset:f,sha256:'matched'});
}));
console.log('PASS: 15 published assets match the frozen release');
const started=Date.now(),signalResponse=await fetch(origin+'/api/catalog-signals',{signal:AbortSignal.timeout(25000)});assert.equal(signalResponse.status,200,await signalResponse.clone().text());const signals=await signalResponse.json();assert.equal(signals.listenerDays,30);for(const t of Object.values(signals.tracks)){assert.ok(t.plays>=0&&t.listeners>=0&&t.likes>=0);}results.push({api:'community',ms:Date.now()-started,tracksWithActivity:Object.keys(signals.tracks).length,artistsWithActivity:Object.keys(signals.artists).length});
for(const id of ['toxi-знак','village-people-y-m-c-a']){
 const image=await fetch(origin+'/api/artwork?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(20000)});assert.equal(image.status,200,id);assert.match(image.headers.get('Content-Type'),/^image\//);assert.ok((await image.arrayBuffer()).byteLength>100);results.push({artwork:id,status:200,type:image.headers.get('Content-Type')});
}
assert.equal((await fetch(origin+'/api/artwork?id=missing-recording')).status,404);
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--mute-audio'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
try{
 const context=await browser.newContext({...devices['Pixel 7'],locale:'ru-RU'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#home',{waitUntil:'domcontentloaded'});await page.waitForSelector('.mx-start',{timeout:45000});assert.ok(await page.evaluate(()=>document.scrollingElement.scrollHeight<=innerHeight));
 await page.locator('.mx-start').tap();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.3,null,{timeout:30000});
 await page.locator('.mx-track').tap();await page.waitForSelector('.mx-full-extra');
 await page.waitForFunction(()=>navigator.mediaSession?.metadata?.artwork[0]?.sizes,null,{timeout:20000});
 const metadata=await page.evaluate(()=>({title:navigator.mediaSession.metadata.title,art:navigator.mediaSession.metadata.artwork[0]}));assert.ok(metadata.title);assert.ok(metadata.art.src.includes('/api/artwork?id='));assert.match(metadata.art.sizes,/^\d+x\d+$/);assert.match(metadata.art.type,/^image\/(jpeg|png|webp)$/);
 assert.equal(await page.locator('.mx-full-extra>button').count(),3);assert.equal(await page.locator('.player-action-label,.wave-finder').count(),0);assert.ok(await page.locator('.mx-full-extra').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await page.screenshot({path:out+'/live-player.png',scale:'css'});
 await page.locator('.player-track-copy:not(.departing) :is(.player-artist-link,.player-artist-btn)').tap();
 if(await page.locator('#sheet[open] .multi-artist-row').count())await page.locator('#sheet .multi-artist-row').first().tap();
 await page.waitForSelector('.artist-hero-v2');await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.artist-hero-art').naturalWidth>0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.waitForFunction(()=>!document.querySelector('.artist-listeners')?.textContent.includes('загружается'),null,{timeout:25000});
 const stats=await page.locator('.artist-listeners').innerText();assert.ok(stats.includes('Sway'));assert.ok(!(await page.locator('main').innerText()).includes('Трейлер'));await page.screenshot({path:out+'/live-artist.png',scale:'css'});
 assert.deepEqual(errors,[]);results.push({browser:'Chromium Pixel 7',metadata,artistStatistics:stats,homeFit:true,artistNavigation:true,controls:3,errors});
}finally{await browser.close();}
await writeFile(out+'/live.json',JSON.stringify({at:new Date().toISOString(),version:r.publishedVersion,results},null,2));console.log('PASS: 100% production deployment, 15 frozen assets, real community API, artwork HTTP/MIME/dimensions, live playback, controls and artist navigation');
