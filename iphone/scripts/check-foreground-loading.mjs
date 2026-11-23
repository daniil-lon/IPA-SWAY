import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';

for(const engine of [chromium,webkit]){
 const requests=[];
 const fixture=await servePlayer({handler:async(req,res,path)=>{
  requests.push(path);
  if(path==='/api/catalog'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({items:[track,nextTrack],total:2,next:null}));return true;}
  return false;
 }});
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage({...devices['iPhone 13']});
  await page.goto(fixture.origin,{waitUntil:'commit'});
  await page.locator('.mx-start').waitFor({timeout:10000});
  await page.waitForTimeout(500);
  assert.ok(!requests.includes('/wave-pulses.json'),'Opening the home screen must not fetch beat data for all 7000 songs');
  const result=await page.evaluate(async()=>{
   const {getTrackAccents}=await import('/wave-light.js');getTrackAccents('test-audio');
   await new Promise(resolve=>setTimeout(resolve,200));return true;
  });
  assert.equal(result,true);assert.ok(requests.some(p=>/^\/wave-pulses-[0-9a-f]{3}\.json$/.test(p)));
  console.log('PASS: '+engine.name()+' loads a small per-track beat group instead of the entire beat catalog');
 }finally{await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
}
