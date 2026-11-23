import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

const saved={...track,audio:'/media/test-tone.wav'},catalog=[saved,nextTrack];
const report=[];
await mkdir('artifacts/mobile-loading',{recursive:true});
for(const engine of process.env.SWAY_OFFLINE_WEBKIT?[webkit]:[chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 try{
  for(const scenario of ['profile-error','profile-timeout','reconnect','restored-offline-route','auth-gate','manual-offline']){
   if(process.env.SWAY_OFFLINE_SCENARIO&&process.env.SWAY_OFFLINE_SCENARIO!==scenario)continue;
   let state=scenario==='reconnect'?'offline':scenario==='auth-gate'?'auth':'public';
   const requests=[];
   const fixture=await servePlayer({catalog,handler:async(req,res,path)=>{
    if(path==='/api/me'){
     requests.push(path);
     if(scenario==='profile-timeout'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');return true;}
     res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"temporarily_unavailable"}');return true;
    }
    if(path==='/api/catalog'||path==='/catalog.json'){
     requests.push(path);
     if(state==='offline'){res.destroy();return true;}
     res.writeHead(state==='auth'?401:200,{'Content-Type':'application/json'});
     res.end(JSON.stringify(state==='auth'?{error:'login_required'}:path==='/catalog.json'?catalog:{items:catalog,total:2,next:null}));return true;
    }
    return false;
   }});
   const context=await browser.newContext({...devices['iPhone 13'],locale:'ru-RU'}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(fixture.origin+'/offline.html',{waitUntil:'domcontentloaded'});
    await page.evaluate(async({saved,manual})=>{
     await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
     const cache=await caches.open('sway-offline-tracks-v1');
     await cache.put('/_sway-offline/audio/'+saved.id,new Response(new Uint8Array(44),{headers:{'Content-Type':'audio/wav','Content-Length':'44'}}));
     await cache.put('/_sway-offline/meta/'+saved.id,Response.json({track:saved,size:44,savedAt:Date.now(),cover:false}));
     localStorage.setItem('tonika.offline-likes',JSON.stringify([saved.id]));
     if(manual)localStorage.setItem('tonika.offline-mode','true');
    },{saved,manual:scenario==='manual-offline'});
    const began=Date.now();
    await page.goto(fixture.origin+(scenario==='restored-offline-route'?'/#library/offline':''),{waitUntil:'commit'});
    if(scenario==='reconnect'){
     const connect=page.locator('[data-action="retry-account"]');await connect.waitFor({timeout:35000});
     state='public';await connect.click();
     await page.locator('.mx-start').waitFor({timeout:15000});
     assert.equal(new URL(page.url()).hash,'#home','A successful connection must leave the automatic offline route');
    }else if(scenario==='auth-gate'){
     await page.waitForFunction(()=>document.body.dataset.page==='login'&&document.body.dataset.loadStage==='ready',{},{timeout:15000});
     assert.ok(requests.includes('/api/catalog'),'The server must actually reject the live catalogue request');
     assert.equal(await page.locator('.mx-start').count(),0,'An unavailable profile must not bypass required sign-in');
    }else{
     await page.locator('.mx-start').waitFor({timeout:15000});
     assert.equal(await page.locator('body').getAttribute('data-offline-mode'),null,'Profile errors must not hide the public catalogue');
     if(scenario==='restored-offline-route')assert.equal(new URL(page.url()).hash,'#home');
     if(scenario==='manual-offline')assert.equal(await page.evaluate(()=>localStorage.getItem('tonika.offline-mode')),'true');
    }
    const stored=await page.evaluate(async()=>({keys:await caches.keys(),items:(await (await caches.open('sway-offline-tracks-v1')).keys()).map(r=>r.url)}));
    assert.ok(stored.items.some(url=>url.endsWith('/_sway-offline/audio/test-audio')),JSON.stringify(stored));
    assert.deepEqual(errors,[]);
    report.push({engine:engine.name(),scenario,ms:Date.now()-began,requests});
    console.log('PASS: '+engine.name()+' '+scenario);
   }finally{await context.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
  }
 }finally{await browser.close();await writeFile('artifacts/mobile-loading/offline-reconnect.json',JSON.stringify(report,null,2));}
}
