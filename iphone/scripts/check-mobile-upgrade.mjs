import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {webkit,devices} from 'playwright';
import {servePlayer,track,nextTrack} from './player-fixture.mjs';
import {build} from 'esbuild';

// Keep an existing cache and controller while the deployed files change.
const current=new URL('../public/',import.meta.url);
// Reproduce the previous entry protocol without depending on a mutable release folder.
const pageSource=await readFile(new URL('index.html',current),'utf8');
const css=(await readFile(new URL('styles.css',current),'utf8')).matchAll(/@import\s+['"]([^'"]+)['"]/g);
const previousHTML=pageSource.replace(/<!-- sway:boot:start -->[\s\S]*?<!-- sway:boot:end -->/,'<script defer src="/boot.js"></script>').replace('<link data-sway-style="/sway.css">',[...css].map(m=>'<link data-sway-style="/'+m[1].replace(/^\.\//,'')+'">').join('\n'));
const previousBoot=`(async()=>{
 const r=await navigator.serviceWorker.register('/sw.js',{type:'module',updateViaCache:'none'});await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
 await Promise.all([...document.querySelectorAll('link[data-sway-style]')].map(link=>new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject;link.rel='stylesheet';link.href=link.dataset.swayStyle;})));
 await import('./app.js');
})();`;
const currentWorker=(await build({entryPoints:['service-worker.mjs'],bundle:true,format:'esm',minify:true,write:false})).outputFiles[0].text;
const previousWorker=currentWorker.replaceAll(currentWorker.match(/sway-shell-v\d+/)[0],'sway-shell-legacy-fixture');
const previous=new Map([['index.html',Buffer.from(previousHTML)],['boot.js',Buffer.from(previousBoot)],['sw.js',Buffer.from(previousWorker)]]);
const types={js:'text/javascript',css:'text/css',html:'text/html',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',webp:'image/webp',jpg:'image/jpeg'};
let upgraded=false;
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/api/catalog'||path==='/api/catalog-signals'){
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(path==='/api/catalog'?{items:[track,nextTrack],total:2,next:null}:{tracks:{},artists:{},collections:{},listenerDays:30}));return true;
 }
 if(path.startsWith('/api/')||path==='/catalog.json'||path.startsWith('/test-'))return false;
 try{
  const name=path==='/'?'index.html':path.slice(1),file=new URL(name,current);
  assert.ok(file.href.startsWith(current.href));
  const body=!upgraded&&previous.has(name)?previous.get(name):await readFile(file),headers={'Content-Type':types[path==='/'?'html':path.split('.').at(-1)]||'application/octet-stream','Cache-Control':'no-store'};
  if(path==='/')headers['Content-Security-Policy']=(await readFile(new URL('_headers',current),'utf8')).match(/Content-Security-Policy: ([^\r\n]+)/)[1];
  res.writeHead(200,headers);res.end(body);return true;
 }catch{return false;}
}});
await mkdir('artifacts/mobile-loading',{recursive:true});
const browser=await webkit.launch({headless:true}),report={errors:[]};
try{
 const context=await browser.newContext({...devices['iPhone 13'],locale:'ru-RU'}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(fixture.origin,{waitUntil:'commit'});await page.locator('.mx-start').waitFor({timeout:25000});
 report.before=await page.evaluate(async()=>({caches:await caches.keys(),controller:!!navigator.serviceWorker.controller,inline:!!document.querySelector('[data-sway-boot]')}));
 assert.ok(report.before.controller);assert.equal(report.before.inline,false);
 await page.addInitScript(()=>{window.swayControllerChanges=0;navigator.serviceWorker.addEventListener('controllerchange',()=>window.swayControllerChanges++);});
 upgraded=true;
 await page.reload({waitUntil:'commit'});await page.locator('.mx-start').waitFor({timeout:30000});
 await page.waitForFunction(()=>window.swayControllerChanges>0,{},{timeout:20000});
 // A second navigation must use the new small HTML and its matching CSP.
 await page.reload({waitUntil:'commit'});await page.locator('.mx-start').waitFor({timeout:25000});
 report.after=await page.evaluate(async()=>({caches:await caches.keys(),controller:!!navigator.serviceWorker.controller,inline:!!document.querySelector('[data-sway-boot]'),styles:[...document.querySelectorAll('[data-sway-style]')].map(l=>({href:l.dataset.swayStyle,loaded:!!l.sheet}))}));
 assert.equal(report.after.inline,true);assert.ok(report.after.styles.every(l=>l.loaded));assert.deepEqual(report.errors,[]);
 console.log('PASS: existing WebKit cache/controller updates to the bundled startup and matching CSP');
}finally{
 await writeFile('artifacts/mobile-loading/upgrade-webkit.json',JSON.stringify(report,null,2));await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));
}
