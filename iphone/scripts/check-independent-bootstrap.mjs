import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
import {assetPart} from '../asset-transfer.mjs';

const root=new URL('../public/',import.meta.url),report=[];
const csp=(await readFile(new URL('_headers',root),'utf8')).match(/Content-Security-Policy: ([^\r\n]+)/)[1];
const ASSETS={fetch:async request=>{
 const name=new URL(request.url).pathname.slice(1),bytes=await readFile(new URL(name,root));
 return new Response(bytes,{headers:{'Content-Type':name.endsWith('.js')?'text/javascript':'text/css','ETag':'"current-'+name+'"','Content-Length':String(bytes.length)}});
}};
await mkdir('artifacts/mobile-loading',{recursive:true});
for(const engine of [chromium,webkit]){
 let recovered=0;
 const fixture=await servePlayer({handler:async(req,res,path)=>{
  if(path==='/sw.js'){res.writeHead(200,{'Content-Type':'text/javascript','Content-Length':'999999'});res.write('// stalled worker');return true;}
  if(path==='/api/catalog'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({items:[track,nextTrack],total:2,next:null}));return true;}
  if(path==='/api/asset-part'){
   recovered++;const response=await assetPart(new Request('http://localhost'+req.url),{ASSETS});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return true;
  }
  if(path==='/'){
   res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':csp});res.end(await readFile(new URL('index.html',root)));return true;
  }
  if(path==='/app-bundle.js'||path==='/sway.css'){
   const original=await readFile(new URL(path.slice(1),root));
   // Same length and successful HTTP status, but stale/corrupt content. It
   // must be recovered and must never execute under the exact build CSP.
   original[0]=original[0]===32?33:32;
   res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':'text/css','X-Sway-Size':String(original.length)});res.end(original);return true;
  }
  return false;
 }});
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage({...devices['iPhone 13'],locale:'ru-RU'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.cspFailures=[];document.addEventListener('securitypolicyviolation',e=>window.cspFailures.push(e.violatedDirective));});
  const started=Date.now();await page.goto(fixture.origin,{waitUntil:'commit'});
  await page.locator('.mx-start').waitFor({timeout:15000});
  await page.waitForFunction(()=>document.body.dataset.loadStage==='ready',null,{timeout:15000});
  const state=await page.evaluate(()=>({controller:!!navigator.serviceWorker.controller,offline:document.body.dataset.offlineStage,styles:!!document.querySelector('style[data-sway-style]')?.sheet,csp:window.cspFailures}));
  assert.equal(state.controller,false);assert.equal(state.offline,'worker-download');assert.equal(state.styles,true);assert.deepEqual(state.csp,[]);assert.deepEqual(errors,[]);assert.ok(recovered>0);
  report.push({engine:engine.name(),ms:Date.now()-started,recovered,state});
  console.log('PASS: '+engine.name()+' verified boot despite a stalled worker and same-length corrupted code/CSS');
 }finally{await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
}
await writeFile('artifacts/mobile-loading/independent-bootstrap.json',JSON.stringify(report,null,2));
