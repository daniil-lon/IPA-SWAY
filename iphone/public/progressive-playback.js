import {fetchMedia} from './media-loader.js';
import {interruptedConnection,markInterruptedConnection} from './asset-loader.js';

// Native audio remains the default on healthy links. On an interrupted link,
// feed validated small responses directly to the same system media element.
// Safari's managed source is feature-tested, including its actual MP3 support.
export function createProgressivePlayback(elements){
 const Source=globalThis.ManagedMediaSource||globalThis.MediaSource;
 let supported=false;try{supported=!!Source?.isTypeSupported('audio/mpeg');}catch{}
 const jobs=new Map(),descriptions=new WeakMap();
 const src=element=>element.getAttribute('src')||'';
 function dispose(element){
  const job=jobs.get(element);if(!job)return;
  jobs.delete(element);clearTimeout(job.timer);job.controller.abort();job.wake?.();URL.revokeObjectURL(job.url);
  element.disableRemotePlayback=job.remote;
 }
 const listeners=elements.map(element=>{
  const changed=()=>{const job=jobs.get(element);if(job&&src(element)!==job.url)dispose(element);};
  element.addEventListener('loadstart',changed);element.addEventListener('emptied',changed);
  return ()=>{element.removeEventListener('loadstart',changed);element.removeEventListener('emptied',changed);dispose(element);};
 });
 function sourceFor(element,original,duration,{recovery=false}={}){
  if(!element||!elements.includes(element))return original;
  if(Number.isFinite(duration)&&duration>0)descriptions.set(element,{original,duration});
  else if(descriptions.get(element)?.original===original)duration=descriptions.get(element).duration;
  const old=jobs.get(element);
  if(old?.original===original&&src(element)===old.url&&!element.error)return old.url;
  if(old)dispose(element);
  let url;try{url=new URL(original,location.href);}catch{return original;}
  if(!supported||!recovery&&!interruptedConnection()||url.origin!==location.origin||!/^\/media\/[^/]+\.mp3$/i.test(url.pathname))return original;
  if(recovery)markInterruptedConnection();
  let media,objectURL;try{media=new Source();objectURL=URL.createObjectURL(media);}catch{supported=false;return original;}
  const controller=new AbortController(),remote=element.disableRemotePlayback;
  const job={media,controller,original,url:objectURL,remote,wake:null,timer:0};jobs.set(element,job);
  // Required by ManagedMediaSource when there is no alternative AirPlay URL.
  element.disableRemotePlayback=true;
  const active=()=>!controller.signal.aborted&&src(element)===job.url;
  job.timer=setTimeout(()=>{
   if(!active())return;
   // Some WebKit builds expose the API but cannot attach it to audio. Do not
   // leave a permanently pending play(); the native recovery path stays usable.
   const at=element.currentTime,resume=!element.paused;supported=false;dispose(element);element.src=original;
   if(at>0)element.addEventListener('loadedmetadata',()=>{if(src(element)===original&&at<element.duration)element.currentTime=at;},{once:true});
   if(resume)void element.play().catch(()=>{});
  },3000);
  const until=()=>new Promise(resolve=>{job.wake=()=>{job.wake=null;resolve();};});
  const wake=()=>job.wake?.();
  for(const event of ['timeupdate','seeking','play','pause'])element.addEventListener(event,wake,{signal:controller.signal});
  media.addEventListener('startstreaming',wake,{signal:controller.signal});
  media.addEventListener('sourceopen',async()=>{
   clearTimeout(job.timer);
   let reader,buffer,appending=true,loaded=0,replaying=false,complete=false;
   const chunks=[];
   const append=data=>new Promise((resolve,reject)=>{
    const finish=error=>{buffer.removeEventListener('updateend',done);buffer.removeEventListener('error',errorEvent);controller.signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
    const done=()=>finish(),errorEvent=()=>finish(new Error('audio_append')),cancel=()=>finish(controller.signal.reason);
    controller.signal.addEventListener('abort',cancel,{once:true});buffer.addEventListener('updateend',done,{once:true});buffer.addEventListener('error',errorEvent,{once:true});
    try{controller.signal.throwIfAborted();buffer.appendBuffer(data);}catch(error){finish(error);}
   });
   const ahead=()=>{for(let i=0;i<element.buffered.length;i++)if(element.buffered.start(i)<=element.currentTime+.1&&element.buffered.end(i)>=element.currentTime)return element.buffered.end(i)-element.currentTime;return 0;};
   const restore=async()=>{
    if(!active()||!buffer||buffer.updating||replaying||!element.seeking||ahead()>.05||!chunks.length)return;
    // A managed source may evict an earlier range. Recreate it from the exact
    // already received bytes; seeking never estimates byte offsets in a VBR MP3.
    if(element.currentTime>loaded+.1)return;
    replaying=true;
    try{
     buffer.abort();buffer.timestampOffset=0;
     await append(new Uint8Array(await new Blob(chunks).arrayBuffer()));
     if(complete&&media.readyState==='open')media.endOfStream();
    }catch{appending=false;}finally{replaying=false;wake();}
   };
   element.addEventListener('seeking',()=>{void restore();},{signal:controller.signal});
   try{
    if(!active())return;
    buffer=media.addSourceBuffer('audio/mpeg');
    if(Number.isFinite(duration)&&duration>0)media.duration=duration;
    const response=await fetchMedia(new Request(url,{signal:controller.signal,credentials:'same-origin'}),{recovery:true,skipMetadata:true});
    if(!response.ok||Number(response.headers.get('Content-Length'))>32*1024*1024)throw new Error('media_unavailable');
    reader=response.body.getReader();let bytes=0;
    for(;;){
     controller.signal.throwIfAborted();
     while(active()&&appending&&(replaying||ahead()>45||media.streaming===false))await until();
     controller.signal.throwIfAborted();
     const part=await reader.read();if(part.done)break;
     bytes+=part.value.length;if(bytes>32*1024*1024)throw new Error('media_size');chunks.push(part.value);
     if(appending){try{await append(part.value);loaded=buffer.buffered.length?buffer.buffered.end(buffer.buffered.length-1):loaded;}catch(error){if(controller.signal.aborted)throw error;supported=false;appending=false;}}
    }
    complete=true;
    if(!active())return;
    if(appending){if(media.readyState==='open')media.endOfStream();}
    else{
     // Keep older/partially supported WebKit builds usable if their decoder
     // rejects a source after the advertised capability check succeeds.
     const position=element.currentTime,resume=!element.paused,blobURL=URL.createObjectURL(new Blob(chunks,{type:'audio/mpeg'}));
     URL.revokeObjectURL(job.url);job.url=blobURL;element.src=blobURL;
     element.addEventListener('loadedmetadata',()=>{if(active()&&position<element.duration)element.currentTime=position;},{once:true});
     if(resume)void element.play().catch(()=>{});
    }
   }catch(error){
    if(active()&&media.readyState==='open'){try{media.endOfStream('network');}catch{}}
   }finally{reader?.releaseLock();}
  },{once:true,signal:controller.signal});
  return job.url;
 }
 return {sourceFor,dispose(){listeners.forEach(stop=>stop());}};
}
