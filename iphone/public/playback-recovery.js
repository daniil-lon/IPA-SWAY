import {fetchMedia} from './media-loader.js';
// WebKit can load media outside the service worker. If that native request
// stops progressing, fetch the same file through the recoverable fetch path
// and keep playback, seeking and system controls on the same audio element.
export function installPlaybackRecovery(elements,{progressive}={}){
 const cleanups=elements.map(element=>{
  let source='',objectURL='',controller,timer=0,last=0,position=-1,buffered=-1,failed=false;
  const current=()=>element.getAttribute('src')||'';
  const clear=()=>{clearInterval(timer);timer=0;controller?.abort();controller=null;};
  const eligible=()=>{try{const u=new URL(current(),location.href);return u.origin===location.origin&&/^\/media\/[^/]+\.(mp3|m4a|ogg|opus|flac|wav)$/i.test(u.pathname);}catch{return false;}};
  function changed(){
   const next=current();if(next===source)return;
   clear();source=next;failed=false;last=performance.now();position=-1;buffered=-1;
   if(objectURL&&next!==objectURL){URL.revokeObjectURL(objectURL);objectURL='';}
  }
  async function recover(){
   const original=source;
   const job=new AbortController();controller=job;const deadline=setTimeout(()=>job.abort(),90000);
   try{
    const streaming=progressive?.sourceFor(element,original,element.duration,{recovery:true});
    if(streaming&&streaming!==original){
     const at=element.currentTime,resume=!element.paused;source=streaming;clearInterval(timer);timer=0;element.src=streaming;
     if(at>0)element.addEventListener('loadedmetadata',()=>{if(current()===streaming&&at<element.duration)element.currentTime=at;},{once:true});
     if(resume)await element.play().catch(()=>{});return;
    }
    const response=await fetchMedia(new Request(new URL(original,location.href),{signal:job.signal,credentials:'same-origin'}),{recovery:true,skipMetadata:/\.mp3(?:$|\?)/i.test(original)});
    if(!response.ok||Number(response.headers.get('Content-Length'))>32*1024*1024)throw new Error('media_recovery');
    const blob=await response.blob();if(!blob.size||blob.size>32*1024*1024)throw new Error('media_size');
    if(job.signal.aborted||current()!==original)return;
    // The original stream may continue or the listener may pause/seek while
    // recovery downloads. Commit the current position and intent, not its start.
    const at=element.currentTime,resume=!element.paused;
    objectURL=URL.createObjectURL(blob);source=objectURL;clearInterval(timer);timer=0;
    element.src=objectURL;
    if(at>0)element.addEventListener('loadedmetadata',()=>{if(current()===objectURL&&at<element.duration)element.currentTime=at;},{once:true});
    if(resume)await element.play().catch(()=>{});
   }catch(error){if(!job.signal.aborted&&current()===original)failed=true;}
   finally{clearTimeout(deadline);if(controller===job)controller=null;}
  }
  function tick(){
   changed();
   if(!eligible()||failed||controller)return;
   if(element.paused&&(element.preload!=='auto'||element.readyState>=3)){last=performance.now();return;}
   const end=element.buffered.length?element.buffered.end(element.buffered.length-1):0;
   position=element.currentTime;
   if(end!==buffered){buffered=end;last=performance.now();}
   const complete=Number.isFinite(element.duration)&&end>=element.duration-.15;
   if(!complete&&!element.seeking&&end-position<5&&performance.now()-last>1500&&(!element.paused||element.preload==='auto'))void recover();
  }
  function watch(event){
   changed();if(event.type==='play'&&failed){failed=false;last=performance.now();}
   if(event.type==='pause'&&element.preload!=='auto'){controller?.abort();controller=null;}
   if(eligible()&&!timer)timer=setInterval(tick,500);
  }
  const events=['loadstart','play','pause','waiting','stalled','emptied'];events.forEach(type=>element.addEventListener(type,watch));
  return ()=>{clear();events.forEach(type=>element.removeEventListener(type,watch));if(objectURL)URL.revokeObjectURL(objectURL);};
 });
 return ()=>cleanups.forEach(cleanup=>cleanup());
}
