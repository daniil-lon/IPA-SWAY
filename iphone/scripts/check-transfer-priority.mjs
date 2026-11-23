import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {servePlayer} from './player-fixture.mjs';

for(const engine of [chromium,webkit]){
 let background=0,foreground=0;
 const fixture=await servePlayer({handler:async(req,res,path)=>{
  if(path==='/priority-test'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Transfer priority</title>');return true;}
  if(path==='/asset-loader.js'&&process.env.SWAY_OLD_LOADER){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(execFileSync('git',['show','HEAD:iphone/public/asset-loader.js']));return true;}
  if(path==='/api/asset-part'){background++;return true;}
  if(path==='/api/media-part'){
   foreground++;res.writeHead(206,{'Content-Type':'audio/mpeg','Content-Range':'bytes 0-8191/16384','X-Sway-Version':'a'.repeat(64),'X-Sway-Type':'audio/mpeg','X-Sway-Encoding':'identity','X-Sway-Size':'16384'});res.end(Buffer.alloc(8192));return true;
  }
  return false;
 }});
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage();await page.goto(fixture.origin+'/priority-test');
  const result=await page.evaluate(async()=>{
   const {fetchAssetPart}=await import('/asset-loader.js');const jobs=new AbortController();
   const queued=Array.from({length:8},()=>fetchAssetPart(new URL('/artists.json',location.href),0,'',jobs.signal).catch(()=>null));
   await new Promise(resolve=>setTimeout(resolve,80));
   const began=performance.now();let part;
   try{part=await Promise.race([fetchAssetPart(new URL('/media/tone.mp3',location.href),0,'',jobs.signal,'media'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('audio_starved_by_metadata')),600))]);}
   finally{jobs.abort();await Promise.all(queued);}
   return {ms:performance.now()-began,bytes:part.data.length};
  });
  assert.equal(result.bytes,8192);assert.equal(foreground,1);assert.ok(background<=4,'Background concurrency stays bounded');
  console.log('PASS: '+engine.name()+' audio starts while metadata transfers are stalled; queued cancellations finish',result);
 }finally{await browser.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
}
