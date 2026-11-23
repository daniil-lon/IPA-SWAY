import {fetchAssetPart,interruptedConnection,markInterruptedConnection} from './asset-loader.js';
import {openMediaSession} from './media-session.js';
const wait=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('media_timeout')),ms);})]).finally(()=>clearTimeout(timer));};

// Healthy audio stays progressive. Interrupted native/SW streams resume at the
// exact offset on one persistent connection, without a handshake per 8 KiB.
export async function fetchMedia(request,{recovery:recoverOnly=false,skipMetadata=false}={}){
 const url=new URL(request.url),network=new AbortController(),recovery=new AbortController();
 let session,sessionFailed=interruptedConnection(),reader,total,start=0,end,response,first;
 const cleanup=()=>{request.signal.removeEventListener('abort',abort);network.abort();recovery.abort();session?.close();reader?.cancel().catch(()=>{});};
 const abort=()=>cleanup();request.signal.addEventListener('abort',abort,{once:true});
 try{
  request.signal.throwIfAborted();
  try{
   if(recoverOnly||sessionFailed)throw new Error('recover_media');
   response=await wait(fetch(new Request(request,{signal:network.signal})),3500);
   if(!response.ok||!response.body){request.signal.removeEventListener('abort',abort);return response;}
   const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
   total=Number(range?.[3]||response.headers.get('Content-Length'));start=Number(range?.[1]||0);end=range?Number(range[2]):total-1;
   if(!Number.isSafeInteger(total)||total<1){request.signal.removeEventListener('abort',abort);return response;}
   reader=response.body.getReader();
  }catch(error){
   request.signal.throwIfAborted();network.abort();
   let info;
   try{if(sessionFailed)throw new Error('bounded_media');session=await openMediaSession(url,0,'',recovery.signal);info=session;}
   catch(error){request.signal.throwIfAborted();sessionFailed=true;first=await fetchAssetPart(url,0,'',recovery.signal,'media');info=first;}
   total=info.total;end=total-1;
   const range=request.headers.get('Range'),match=/^bytes=(\d{0,16})-(\d{0,16})$/.exec(range||'');
   if(range){
    if(!match||(!match[1]&&!match[2])){cleanup();return new Response(null,{status:416});}
    start=match[1]?Number(match[1]):Math.max(0,total-Number(match[2]));end=match[1]&&match[2]?Math.min(total-1,Number(match[2])):total-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=total||!match[1]&&Number(match[2])===0){cleanup();return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+total}});}
   }
   if(skipMetadata&&!range&&first?.data.length>=10){
    const tag=first.data;
    if(tag[0]===73&&tag[1]===68&&tag[2]===51&&[2,3,4].includes(tag[3])&&!(tag[6]&128||tag[7]&128||tag[8]&128||tag[9]&128)){
     const size=10+tag[6]*2097152+tag[7]*16384+tag[8]*128+tag[9]+(tag[3]===4&&tag[5]&16?10:0);
     if(size<total)start=size;
    }
   }
   if(start&&session){session.close();session=null;}
   const headers=new Headers({'Content-Type':info.type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store'});
   if(range)headers.set('Content-Range',`bytes ${start}-${end}/${total}`);
   response={headers,status:range?206:200};
  }
  let position=start,version=session?.version||first?.version||'',next=start;const pending=new Map();
  const fill=()=>{while(pending.size<8&&next<=end){const offset=next;next+=8192;
   const promise=first&&offset===0?Promise.resolve(first):fetchAssetPart(url,offset,version,recovery.signal,'media');
   promise.catch(()=>{});pending.set(offset,promise);
  }};
  const body=new ReadableStream({
   async pull(controller){
    try{
     if(position>end){cleanup();controller.close();return;}
     if(reader){
      try{
       const chunk=await wait(reader.read(),3500);
       if(!chunk.done){const data=chunk.value.subarray(0,end-position+1);position+=data.length;controller.enqueue(data);return;}
       if(position>end){cleanup();controller.close();return;}
      }catch(error){request.signal.throwIfAborted();}
      reader.cancel().catch(()=>{});reader=null;network.abort();next=position;
     }
     if(!sessionFailed){
      try{
       session??=await openMediaSession(url,position,version,recovery.signal);
       if(session.total!==total||version&&session.version!==version)throw new Error('media_changed');
       version=session.version;const block=await session.read();if(!block)throw new Error('incomplete_media');
       const data=block.subarray(0,end-position+1);position+=data.length;controller.enqueue(data);return;
      }catch(error){request.signal.throwIfAborted();markInterruptedConnection();session?.close();session=null;sessionFailed=true;next=position;}
     }
     if(!pending.has(position)){
      const part=first&&position===0?first:await fetchAssetPart(url,position,version,recovery.signal,'media');
      if(part.total!==total||part.encoding!=='identity'||version&&part.version!==version)throw new Error('media_changed');
      version=part.version;pending.set(position,Promise.resolve(part));next=position+8192;
     }
     fill();const part=await pending.get(position);pending.delete(position);
     if(part.total!==total||part.version!==version||part.encoding!=='identity')throw new Error('media_changed');
     const data=part.data.subarray(0,end-position+1);position+=data.length;fill();controller.enqueue(data);
    }catch(error){cleanup();controller.error(error);}
   },cancel(){cleanup();}
  });
  return new Response(body,{status:response.status,headers:response.headers});
 }catch(error){cleanup();throw error;}
}
