import {chromium} from 'playwright';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const mode=process.env.SWAY_DIAG_MODE||'chunk-first',out='artifacts/loading-recovery';
const variant=await build({entryPoints:['service-worker.mjs'],bundle:true,minify:true,format:'esm',write:false,plugins:[{name:'chunk-first-diagnostic',setup(b){b.onLoad({filter:/asset-loader\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('let interrupted=false','let interrupted=true'),loader:'js'}));}}]});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio',...(process.env.SWAY_HTTP1?['--disable-http2']:[])]});
const context=await browser.newContext({viewport:{width:393,height:852},locale:'ru-RU'}),page=await context.newPage(),requests=[],errors=[];let substituted=0,result={mode};
page.on('pageerror',e=>errors.push(e.message));
context.on('request',r=>requests.push({url:r.url(),worker:!!r.serviceWorker(),at:Date.now(),state:'started'}));
context.on('requestfinished',r=>{const v=requests.findLast(v=>v.url===r.url()&&v.state==='started');if(v){v.state='complete';v.ms=Date.now()-v.at;}});
context.on('requestfailed',r=>{const v=requests.findLast(v=>v.url===r.url()&&v.state==='started');if(v){v.state='failed';v.error=r.failure();v.ms=Date.now()-v.at;}});
await context.route('**/sw.js',async route=>{substituted++;await route.fulfill({status:200,contentType:'text/javascript',body:variant.outputFiles[0].text});});
if(mode==='no-images')await context.route('**/art/**',route=>route.abort());
try{
 const start=Date.now();await page.goto('https://music.academmix.ru/'+(mode==='parts'?'offline.html':''),{waitUntil:'commit'});
 if(mode==='parts'){
  result.parts=await page.evaluate(async()=>Promise.all(Array.from({length:7},async(_,i)=>{try{const r=await fetch('/api/asset-part?path=%2Fapp.js&offset='+(i*8192)+'&encoding=gzip',{signal:AbortSignal.timeout(8000)});return {status:r.status,range:r.headers.get('content-range'),bytes:(await r.arrayBuffer()).byteLength};}catch(e){return {error:e.message};}})));
  if(result.parts.some(p=>p.status!==206||!p.bytes))throw new Error('Small response failed');console.log('PASS '+JSON.stringify(result));
 }else{
 await page.locator('.mx-start').waitFor({timeout:45000});result.homeMs=Date.now()-start;
 await page.locator('.mx-start').click();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.3,null,{timeout:20000});
 result.playing=await page.evaluate(()=>({time:document.querySelector('#audio').currentTime,title:document.querySelector('.mx-track').textContent}));
 console.log('PASS '+JSON.stringify(result));
 }
}catch(e){result.error=e.message;console.log('FAIL '+e.message);process.exitCode=1;}
finally{
 result.substituted=substituted;result.message=await page.evaluate(()=>document.querySelector('.splash-sub')?.textContent).catch(()=>null);
 await writeFile(out+'/diagnose-'+mode+(process.env.SWAY_HTTP1?'-http1':'')+'.json',JSON.stringify({at:new Date().toISOString(),result,errors,requests},null,2));await browser.close();
}
