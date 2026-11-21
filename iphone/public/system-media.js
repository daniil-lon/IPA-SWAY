export const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export function systemArtworkURL(track){
 if(track?.id&&!track.provider)return new URL('/api/artwork?id='+encodeURIComponent(track.id),location.origin).href;
 try{return new URL(track?.art||'/art/icon-512.png',location.origin).href;}catch{return new URL('/art/icon-512.png',location.origin).href;}
}
const artworkCache=new Map();
async function readableArtwork(track){
 const source=systemArtworkURL(track);
 if(artworkCache.has(source))return artworkCache.get(source);
 const job=(async()=>{
  let url=source,mime='';
  try{const response=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!response.ok)throw new Error('artwork');mime=response.headers.get('Content-Type')?.split(';')[0]||'';if(!mime.startsWith('image/'))throw new Error('artwork');}
  catch{
   const svg=/^\/art\/([a-z0-9_-]+)\.svg$/i.exec(track.art||'');
   url=new URL(svg?'/art/system/'+svg[1]+'.png':track.art||'/art/icon-512.png',location.origin).href;
   mime=/\.png(?:\?|$)/i.test(url)?'image/png':/\.webp(?:\?|$)/i.test(url)?'image/webp':'image/jpeg';
  }
  const dimensions=await new Promise(resolve=>{
   const image=new Image();let settled=false;
   const done=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value);}};
   const timer=setTimeout(()=>done(null),6000);
   image.onload=()=>done({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>done(null);image.src=url;
  });
  if(!dimensions)return [];
  return [{src:url,sizes:dimensions.width+'x'+dimensions.height,type:mime}];
 })();
 artworkCache.set(source,job);if(artworkCache.size>24)artworkCache.delete(artworkCache.keys().next().value);
 return job;
}
export function createSystemMedia(elements,getAudio,actions){
 const session=navigator.mediaSession;
 let track=null,suspended=false,lastState,ticket=0,artwork=[];
 const safe=fn=>{try{fn();}catch{}};
 function metadata(){
  if(!session||typeof MediaMetadata==='undefined')return;
  safe(()=>{session.metadata=track&&!suspended?new MediaMetadata({title:track.title,artist:track.artist,album:track.albumTitle||track.album||'Sway',artwork}):null;});
 }
 function sync(){
  if(!session)return;
  const audio=getAudio(),state=!track||suspended?'none':audio.paused||audio.ended||audio.error?'paused':'playing';
  if(lastState!==state){lastState=state;safe(()=>session.playbackState=state);}
 }
 function position(){
  if(!session||suspended||!track||!session.setPositionState)return;
  const {duration,currentTime,playbackRate}=getAudio();
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(currentTime)||!playbackRate){safe(()=>session.setPositionState());return;}
  safe(()=>session.setPositionState({duration,position:Math.max(0,Math.min(currentTime,duration)),playbackRate}));
 }
 function publish(){
  if(!session)return;
  // Music uses track navigation; seek-forward/backward can select podcast-style controls on iOS.
  for(const name of ['seekbackward','seekforward'])safe(()=>session.setActionHandler(name,null));
  for(const [name,handler] of Object.entries(actions))if(!['seekbackward','seekforward'].includes(name))safe(()=>session.setActionHandler(name,track&&!suspended?handler:null));
  metadata();position();sync();
 }
 function attach(el){
  for(const event of ['loadedmetadata','durationchange','timeupdate','seeked','ratechange','emptied'])el.addEventListener(event,()=>{if(el===getAudio())position();});
  for(const event of ['play','playing','pause','ended','error'])el.addEventListener(event,()=>{if(el===getAudio()){if(event==='playing')publish();else sync();}});
 }
 elements.forEach(attach);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)metadata();position();sync();});
 return {sync,attach,
  setTrack(value){
   if(track?.id===value?.id&&track?.art===value?.art)return;
   track=value;artwork=[];const request=++ticket;
   if(value&&!value.provider&&/\.(?:jpe?g|png|webp)$/i.test(value.art||''))artwork=[{src:systemArtworkURL(value),type:/\.png$/i.test(value.art)?'image/png':/\.webp$/i.test(value.art)?'image/webp':'image/jpeg'}];
   publish();
   if(value&&session)void readableArtwork(value).then(images=>{if(request===ticket&&track===value){artwork=images;publish();}});
  },suspend(value){if(suspended!==value){suspended=value;publish();}},
  prepare(){safe(()=>{if(navigator.audioSession)navigator.audioSession.type='playback';});}
 };
}
