import {restoreCommonsTrack} from './music-sources.js';

export const offlineCache='sway-offline-tracks-v1';
export const offlineRoot='/_sway-offline/';
export const offlineURL=(kind,id)=>offlineRoot+kind+'/'+encodeURIComponent(id);
export const supportsOffline=()=>typeof caches!=='undefined'&&!!navigator.serviceWorker;
const validId=id=>typeof id==='string'&&id!=='.'&&id!=='..'&&/^[\p{L}\p{N}_.-]{1,180}$/u.test(id);
const maxAudio=32*1024*1024;

export function downloadableAudio(track,canPlay){
 if(!validId(track?.id)||track.offline===false)return null;
 if(track.provider)return track.provider==='commons'?restoreCommonsTrack(track,canPlay)?.audio||null:null;
 try{
  const url=new URL(track.audio,location.origin);
  const internal=url.pathname.startsWith('/media/')&&/\.(mp3|ogg|oga|opus|m4a|wav|flac|aac|webm)$/i.test(url.pathname);
  if(url.origin!==location.origin||!(internal||url.pathname==='/api/custom-media/'+encodeURIComponent(track.id)+'.mp3'))return null;
  url.hash='';return url.href;
 }catch{return null;}
}

async function readBlob(response,limit,{signal,progress}={}){
 const length=Number(response.headers.get('Content-Length'))||0;
 if(length>limit)throw new Error('too_large');
 const reader=response.body?.getReader();
 if(!reader)throw new Error('unavailable');
 const chunks=[];let received=0;
 try{
  for(;;){
   signal?.throwIfAborted();
   const {done,value}=await reader.read();
   if(done)break;
   received+=value.byteLength;
   if(received>limit)throw new Error('too_large');
   chunks.push(value);progress?.(received,length);
  }
 }catch(error){reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 if(!received)throw new Error('unavailable');
 return new Blob(chunks,{type:response.headers.get('Content-Type')||''});
}

async function saveArt(cache,track,signal){
 try{
  const url=new URL(track.art,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/art/'))return false;
  const result=await fetch(url,{signal,redirect:'error'});
  if(!result.ok||!result.headers.get('Content-Type')?.startsWith('image/'))return false;
  const blob=await readBlob(result,640*1024,{signal});
  await cache.put(offlineURL('art',track.id),new Response(blob, {headers:{'Content-Type':blob.type,'X-Content-Type-Options':'nosniff'}}));
  return true;
 }catch{return false;}
}
async function saveLyrics(cache,track,signal){
 try{
  const deadline=AbortSignal.timeout(8000),requestSignal=signal&&AbortSignal.any?AbortSignal.any([signal,deadline]):signal||deadline;
  const response=await fetch('/lyrics/'+encodeURIComponent(track.id)+'.json',{signal:requestSignal,redirect:'error'});
  if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))return;
  const blob=await readBlob(response,512*1024,{signal}),data=JSON.parse(await blob.text());
  if(data&&((Array.isArray(data.lines)&&data.lines.length)||typeof data.plain==='string'&&data.plain))await cache.put(offlineURL('lyrics',track.id),Response.json(data));
 }catch{}
}

export async function readOfflineTracks(canPlay){
 if(!supportsOffline())return [];
 const cache=await caches.open(offlineCache),keys=await cache.keys(),urls=new Set(keys.map(k=>k.url));
 const items=await Promise.allSettled(keys.filter(k=>new URL(k.url).pathname.startsWith(offlineRoot+'meta/')).map(async key=>{
  const item=await (await cache.match(key))?.json();
  const track=item?.track;
  if(!downloadableAudio(track,canPlay)||!urls.has(new URL(offlineURL('audio',track.id),location.origin).href))return null;
  return item;
 }));
 return items.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value).sort((a,b)=>b.savedAt-a.savedAt);
}

export async function readOfflineAudio(id){
 const cache=await caches.open(offlineCache),response=await cache.match(offlineURL('audio',id));
 return response?.blob();
}

export async function saveOfflineTrack(track,canPlay,{signal,progress}={}){
 const url=downloadableAudio(track,canPlay);
 if(!url||!supportsOffline())throw new Error('unavailable');
 const estimate=await navigator.storage?.estimate?.().catch(()=>null);
 if(estimate?.quota&&estimate.quota-estimate.usage<Math.max(2*1024*1024,Number(track.bytes)||0))throw new DOMException('Storage full','QuotaExceededError');
 try{navigator.storage?.persist?.().catch(()=>{});}catch{}
 const response=await fetch(url,{signal,redirect:'error',credentials:new URL(url).origin===location.origin?'same-origin':'omit'});
 const mime=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
 if(response.status!==200||response.headers.has('Content-Range')||!(mime==='application/ogg'||(mime.startsWith('audio/')&&!/mpegurl/.test(mime))))throw new Error('unavailable');
 const blob=await readBlob(response,maxAudio,{signal,progress});
 signal?.throwIfAborted();
 const cache=await caches.open(offlineCache);
 const audioKey=offlineURL('audio',track.id);
 await cache.put(audioKey,new Response(blob,{headers:{'Content-Type':blob.type,'Content-Length':String(blob.size),'Accept-Ranges':'bytes'}}));
 try{
  const cover=await saveArt(cache,track,signal);
  await saveLyrics(cache,track,signal);
  signal?.throwIfAborted();
  const saved={track,size:blob.size,savedAt:Date.now(),cover};
  await cache.put(offlineURL('meta',track.id),Response.json(saved));
  return saved;
 }catch(error){
  await Promise.allSettled([cache.delete(audioKey),cache.delete(offlineURL('art',track.id)),cache.delete(offlineURL('lyrics',track.id))]);throw error;
 }
}

export async function removeOfflineTrack(id){
 if(!validId(id))return;
 const cache=await caches.open(offlineCache);
 await cache.delete(offlineURL('meta',id));
 await Promise.all([cache.delete(offlineURL('audio',id)),cache.delete(offlineURL('art',id)),cache.delete(offlineURL('lyrics',id))]);
}
