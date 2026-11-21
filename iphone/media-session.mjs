import {mediaFile} from './asset-transfer.mjs';

// Keep the existing 8 KiB frames, but amortise the TLS/WebSocket handshake over
// a whole song. A client requests at most 256 KiB at a time; it cannot push an
// unbounded send loop or read private paths through this endpoint.
export async function mediaSession(request,env){
 const url=new URL(request.url),asset=await mediaFile(url.searchParams.get('path'),request,env);
 if(asset.error)return new Response(null,{status:asset.error});
 const expected=url.searchParams.get('v'),start=Number(url.searchParams.get('offset')||0);
 if(expected&&expected!==asset.version)return new Response(null,{status:412});
 if(!Number.isSafeInteger(start)||start<0||start>=asset.data.length)return new Response(null,{status:416});
 const [client,server]=Object.values(new WebSocketPair());server.accept();
 let cursor=start,closed=false;
 const close=(code=1000,reason='complete')=>{if(closed)return;closed=true;clearTimeout(idle);try{server.close(code,reason);}catch{}};
 let idle=setTimeout(()=>close(1008,'idle'),15000);
 server.addEventListener('message',event=>{
  try{
   if(closed||typeof event.data!=='string'||event.data.length>128)return close(1008,'request');
   const {offset,count}=JSON.parse(event.data);
   if(offset!==cursor||!Number.isSafeInteger(count)||count<1||count>32)return close(1008,'window');
   clearTimeout(idle);
   for(let i=0;i<count&&cursor<asset.data.length;i++){
    const end=Math.min(cursor+8192,asset.data.length);server.send(asset.data.slice(cursor,end));cursor=end;
   }
   server.send(JSON.stringify({windowEnd:cursor}));
   if(cursor===asset.data.length)close();else idle=setTimeout(()=>close(1008,'idle'),15000);
  }catch{close(1008,'request');}
 });
 server.addEventListener('close',()=>{closed=true;clearTimeout(idle);});
 server.addEventListener('error',()=>close(1011,'connection'));
 server.send(JSON.stringify({stream:1,total:asset.data.length,start,version:asset.version,type:asset.type,encoding:'identity'}));
 return new Response(null,{status:101,webSocket:client});
}
