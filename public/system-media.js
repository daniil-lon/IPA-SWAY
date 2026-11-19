export const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

export function createSystemMedia(elements,getAudio,actions){
 const session=navigator.mediaSession;
 let track=null, suspended=false, lastState;
 const handlers=actions;
 const safe=fn=>{try{fn();}catch{}};
 function sync(){
  if(!session)return;
  const audio=getAudio();
  const state=!track||suspended?'none':audio.paused||audio.ended||audio.error?'paused':'playing';
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
  for(const [action,handler] of Object.entries(handlers))safe(()=>session.setActionHandler(action,track&&!suspended?handler:null));
  safe(()=>{
   const cover=/^\/art\/([a-z0-9_-]+)\.svg$/i.exec(track?.art||'');
   let original=null;try{const u=new URL(track?.art||'',location.origin);if((u.origin===location.origin||u.protocol==='https:')&&!u.pathname.endsWith('.svg'))original=u.href;}catch{}
   const photos=cover?[{src:'/art/system/'+cover[1]+'.png',sizes:'256x256',type:'image/png'}]:original?[{src:original}]:[];
   session.metadata=track&&!suspended?new MediaMetadata({title:track.title,artist:track.artist,album:track.albumTitle||'Sway',artwork:[{src:new URL('/art/icon-512.png',location.origin).href,sizes:'512x512',type:'image/png'},...photos.map(p=>({...p,src:new URL(p.src,location.origin).href}))].reverse()}):null;
  });
  if(suspended)safe(()=>session.setPositionState());else position();
  sync();
 }
 function attach(el){
  for(const ev of ['loadedmetadata','durationchange','timeupdate','seeked','ratechange','emptied'])el.addEventListener(ev,()=>{if(el===getAudio())position();});
  for(const ev of ['play','playing','pause','ended','error'])el.addEventListener(ev,()=>{if(el===getAudio())sync();});
 }
 elements.forEach(attach);
 document.addEventListener('visibilitychange',()=>{position();sync();});
 return {sync,attach,setTrack(value){if(track!==value){track=value;publish();}},suspend(value){if(suspended!==value){suspended=value;publish();}},prepare(){safe(()=>{if(navigator.audioSession)navigator.audioSession.type='playback';});}};
}
