import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {WebSocketServer} from 'ws';
import {servePlayer} from './player-fixture.mjs';

const bytes=Buffer.from(Uint8Array.from({length:768*1024+317},(_,i)=>i*31%251));
const version=createHash('sha256').update(bytes).digest('hex'),connections=[];
const fixture=await servePlayer({handler:async(req,res,path)=>{
 if(path==='/stream-test'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Media transport verification</title>');return true;}
 if(!['/media/healthy.mp3','/media/stalled.mp3'].includes(path))return false;
 res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length)});res.write(bytes.subarray(0,8192));
 if(path.includes('healthy'))setTimeout(()=>res.end(bytes.subarray(8192)),200);
 return true;
}});
const sockets=new WebSocketServer({server:fixture.server});
sockets.on('connection',(socket,request)=>{
 const url=new URL(request.url,fixture.origin),start=Number(url.searchParams.get('offset')||0),expected=url.searchParams.get('v');
 const item={start,sent:0,closed:false};connections.push(item);socket.on('close',()=>{item.closed=true;});
 socket.send(JSON.stringify({stream:1,total:bytes.length,start,version,type:'audio/mpeg',encoding:'identity'}));
 if(expected&&expected!==version)return;
 let cursor=start;
 socket.on('message',message=>{
  const {offset,count}=JSON.parse(message);assert.equal(offset,cursor);assert.ok(count<=32);
  for(let i=0;i<count&&cursor<bytes.length;i++){const end=Math.min(cursor+8192,bytes.length);socket.send(bytes.subarray(cursor,end));item.sent+=end-cursor;cursor=end;}
  socket.send(JSON.stringify({windowEnd:cursor}));if(cursor===bytes.length)socket.close();
 });
});
try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
  try{
   const page=await browser.newPage();await page.goto(fixture.origin+'/stream-test');
   const start=connections.length;
   const healthy=await page.evaluate(async()=>{
    const {fetchMedia}=await import('/media-loader.js');const response=await fetchMedia(new Request(location.origin+'/media/healthy.mp3'));
    const reader=response.body.getReader();const part=await reader.read(),chunks=[part.value];let length=part.value.length;
    for(;;){const next=await reader.read();if(next.done)break;chunks.push(next.value);length+=next.value.length;}
    const joined=new Uint8Array(length);let at=0;for(const c of chunks){joined.set(c,at);at+=c.length;}
    return {first:part.value.length,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',joined))].map(x=>x.toString(16).padStart(2,'0')).join('')};
   });
   assert.equal(healthy.hash,version);assert.ok(healthy.first<bytes.length,'A healthy song stays progressive');assert.equal(connections.length,start);
   const resumed=await page.evaluate(async()=>{const {fetchMedia}=await import('/media-loader.js');const response=await fetchMedia(new Request(location.origin+'/media/stalled.mp3'));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');});
   assert.equal(resumed,version);assert.equal(connections.length,start+1);assert.equal(connections.at(-1).start,8192,'Continue at the last successfully read byte');
   for(const range of ['bytes=10000-19999','bytes=-4096','bytes=9999999-']){
    const result=await page.evaluate(async range=>{const {fetchMedia}=await import('/media-loader.js');const r=await fetchMedia(new Request(location.origin+'/media/stalled.mp3',{headers:{Range:range}}),{recovery:true});return {status:r.status,range:r.headers.get('Content-Range'),bytes:[...new Uint8Array(await r.arrayBuffer())]};},range);
    if(range==='bytes=9999999-'){assert.equal(result.status,416);assert.equal(result.range,'bytes */'+bytes.length);}
    else{const first=range==='bytes=-4096'?bytes.length-4096:10000,last=range==='bytes=-4096'?bytes.length:20000;assert.equal(result.status,206);assert.deepEqual(Buffer.from(result.bytes),bytes.subarray(first,last));}
   }
   const before=connections.length;
   const bounded=await page.evaluate(async version=>{
    const {openMediaSession}=await import('/media-session.js');const signal=new AbortController();
    const session=await openMediaSession(new URL('/media/stalled.mp3',location.href),0,'',signal.signal);
    await new Promise(resolve=>setTimeout(resolve,300));signal.abort();
    let aborted=false;try{await session.read();}catch{aborted=true;}
    let rejected=false;try{await openMediaSession(new URL('/media/stalled.mp3',location.href),0,version.replace(/^./,version[0]==='a'?'b':'a'));}catch{rejected=true;}
    return {aborted,rejected};
   },version);
   assert.equal(bounded.aborted,true);assert.equal(bounded.rejected,true);assert.ok(connections[before].sent<=32*8192,'Paused reading must bound the queued audio');
   await page.waitForTimeout(50);assert.equal(connections[before].closed,true);
   console.log(`PASS: ${engine.name()} progressive audio, byte-exact stalled-stream resume, ranges, suffix, 416, bounded buffering, cancellation and version mismatch`);
  }finally{await browser.close();}
 }
}finally{for(const client of sockets.clients)client.terminate();sockets.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));}
