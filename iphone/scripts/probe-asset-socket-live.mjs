import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),page=await context.newPage(),logs=[];
page.on('console',message=>{if(message.type()==='error')logs.push(message.text());});
let result={};
try{
 await page.goto('https://music.academmix.ru/offline.html',{waitUntil:'domcontentloaded',timeout:12000});
 result=await page.evaluate(async()=>{
  const start=Date.now(),get=(offset,version)=>new Promise((resolve,reject)=>{
   const query=new URLSearchParams({path:'/app.js',offset:String(offset),encoding:'gzip',...(version?{v:version}:{})});
   const ws=new WebSocket('wss://'+location.host+'/api/asset-socket?'+query);ws.binaryType='arraybuffer';let meta,data;
   const timer=setTimeout(()=>{ws.close();reject(new Error('socket timeout at '+offset));},10000);
   ws.onmessage=e=>{if(typeof e.data==='string')meta=JSON.parse(e.data);else data=new Uint8Array(e.data);};
   ws.onerror=()=>{clearTimeout(timer);reject(new Error('socket error at '+offset));};
   ws.onclose=e=>{clearTimeout(timer);if(e.code===1000&&meta&&data)resolve({meta,data});else reject(new Error('socket closed at '+offset+': '+e.code));};
  });
  const first=await get(0),total=+first.meta.range.split('/')[1],data=new Uint8Array(total);data.set(first.data);
  const chunks=await Promise.all(Array.from({length:Math.ceil(total/8192)-1},(_,i)=>get((i+1)*8192,first.meta.version)));
  chunks.forEach((part,i)=>data.set(part.data,(i+1)*8192));
  const raw=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');
  return {bytes:raw.byteLength,compressed:total,sockets:chunks.length+1,ms:Date.now()-start,hash};
 });
 const expected=createHash('sha256').update(await readFile('public/app.js')).digest('hex');if(result.hash!==expected)throw new Error('Hash mismatch');
 console.log('PASS: browser received entire production app over short sockets '+JSON.stringify(result));
}catch(e){result.error=e.message;process.exitCode=1;console.log('FAIL: '+e.message);}
finally{await writeFile('artifacts/loading-recovery/live-socket.json',JSON.stringify({at:new Date().toISOString(),result,logs},null,2));await browser.close();}
