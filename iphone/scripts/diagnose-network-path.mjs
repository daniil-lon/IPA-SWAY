import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {ProxyAgent} from 'undici';
import WebSocket from 'ws';

const origin='https://music.academmix.ru';
const catalog=JSON.parse(await readFile('public/catalog.json','utf8'));
const track=catalog.find(t=>t.artist==='MOT'&&t.title==='День и Ночь');
const results=[];
async function probe(label,path,headers={},dispatcher){
 const started=performance.now(),job=new AbortController(),timer=setTimeout(()=>job.abort(),12000);
 let bytes=0,firstMs,status,declared,ray,error,chunks=[];
 try{
  const response=await fetch(new URL(path,origin),{headers,signal:job.signal,cache:'no-store',...(dispatcher?{dispatcher}:{})});
  status=response.status;declared=response.headers.get('content-length');ray=response.headers.get('cf-ray');
  for await(const chunk of response.body){firstMs??=performance.now()-started;bytes+=chunk.length;if(chunks.length<5)chunks.push({at:Math.round(performance.now()-started),bytes:chunk.length});}
 }catch(e){error=e.name+': '+e.message;}
 finally{clearTimeout(timer);}
 const result={label,status,declared,bytes,firstMs:Math.round(firstMs||0),ms:Math.round(performance.now()-started),ray,error,chunks};
 results.push(result);console.log(JSON.stringify(result));
}
await Promise.all([
 probe('entry','/'),probe('account','/api/me'),probe('catalog-first','/api/catalog?offset=0&plan=1'),
 probe('stylesheet','/sway.css'),probe('audio-native',track.audio,{'Range':'bytes=0-'}),
 probe('audio-small-part','/api/media-part?'+new URLSearchParams({path:track.audio,offset:'0',encoding:'identity'}))
]);
await new Promise(resolve=>{
 const started=performance.now(),socket=new WebSocket(origin.replace('https:','wss:')+'/api/media-socket?'+new URLSearchParams({path:track.audio,offset:'0',stream:'1'}),{origin});
 let bytes=0,frames=0,meta=false,window=false;const timer=setTimeout(()=>finish('deadline'),12000);
 function finish(error){clearTimeout(timer);socket.removeAllListeners();socket.on('error',()=>{});socket.terminate();const result={label:'audio-persistent-socket',bytes,frames,meta,window,ms:Math.round(performance.now()-started),error};results.push(result);console.log(JSON.stringify(result));resolve();}
 socket.on('open',()=>{});socket.on('message',(data,binary)=>{if(binary){bytes+=data.length;frames++;}else {const value=JSON.parse(data);if(value.stream===1){meta=true;socket.send(JSON.stringify({offset:0,count:16}));}else if(value.windowEnd){window=true;finish();}}});socket.on('error',e=>finish(e.message));
});
if(process.env.SWAY_COMPARE_PROXY){
 const proxy=new ProxyAgent(process.env.SWAY_COMPARE_PROXY);
 await Promise.all([probe('proxy-stylesheet','/sway.css',{},proxy),probe('proxy-audio-native',track.audio,{'Range':'bytes=0-'},proxy)]);
 await proxy.close();
}
await mkdir('artifacts/network-performance',{recursive:true});
await writeFile('artifacts/network-performance/network-before.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
