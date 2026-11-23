export const nativeAndroid=!!window.SwayAndroid?.postMessage;
const send=(action,data={})=>{if(nativeAndroid)window.SwayAndroid.postMessage(JSON.stringify({action,...data}));};
const channels=new Map();
export function connectNativeAudio(elements){
 if(!nativeAndroid)return;
 elements.forEach((el,channel)=>{
  const state={channel,src:'',currentTime:0,duration:NaN,paused:true,ended:false,readyState:0,volume:channel?0:1,muted:false,seeking:false,buffered:0,loaded:''};channels.set(el,state);
  for(const key of ['currentTime','volume','muted'])Object.defineProperty(el,key,{configurable:true,get:()=>state[key],set:value=>{state[key]=value;send(key,{channel,value});}});
  for(const key of ['duration','paused','ended','readyState','seeking'])Object.defineProperty(el,key,{configurable:true,get:()=>state[key]});
  Object.defineProperty(el,'buffered',{configurable:true,get:()=>({length:state.readyState?1:0,start:()=>0,end:()=>state.buffered})});
  Object.defineProperty(el,'src',{configurable:true,get:()=>state.src,set:value=>{state.src=value?new URL(value,location.origin).href:'';state.readyState=0;state.currentTime=0;state.loaded='';if(el.preload!=='none')queueMicrotask(()=>el.load());}});
  const remove=el.removeAttribute.bind(el);el.removeAttribute=name=>{if(name==='src'){state.src='';state.loaded='';send('clear',{channel});}remove(name);};
  const get=el.getAttribute.bind(el);el.getAttribute=name=>name==='src'?state.src||null:get(name);
  el.load=()=>{if(state.src&&state.loaded!==state.src){state.loaded=state.src;send('load',{channel,url:state.src});}};
  el.play=()=>{el.load();state.paused=false;send('play',{channel});return Promise.resolve();};
  el.pause=()=>{state.paused=true;send('pause',{channel});el.dispatchEvent(new Event('pause'));};
 });
 window.addEventListener('sway-native-state',e=>{
  const d=e.detail,entry=[...channels].find(([,s])=>s.channel===d.channel);if(!entry)return;const [el,state]=entry,wasReady=state.readyState,wasPaused=state.paused,oldId=state.trackId;
  Object.assign(state,d,{duration:d.duration>0?d.duration:NaN});
  if(!wasReady&&state.readyState>=2)for(const type of ['loadedmetadata','loadeddata','canplay','canplaythrough'])el.dispatchEvent(new Event(type));
  if(wasPaused!==state.paused)el.dispatchEvent(new Event(state.paused?'pause':'playing'));
  if(d.error)el.dispatchEvent(new Event('error'));
  if(d.ended&&!state.sentEnded)el.dispatchEvent(new Event('ended'));
  state.sentEnded=d.ended;
  if(oldId&&d.trackId&&oldId!==d.trackId)window.dispatchEvent(new CustomEvent('sway-native-track',{detail:d}));
  el.dispatchEvent(new Event('timeupdate'));
 });
}
export function nativeQueue(element,items){const s=channels.get(element);if(!s)return;send('queue',{channel:s.channel,items:items.slice(0,1000).map(t=>({id:t.id,title:t.title,artist:t.artist,art:new URL(t.provider?t.art:'/api/artwork?id='+encodeURIComponent(t.id),location.origin).href,url:new URL(t.audio,location.origin).href}))});}
// The service loops the queue itself, so repeat-all also receives the tracks before the current one.
let repeatSent='';
export function nativeRepeat(mode){if(!nativeAndroid||mode===repeatSent)return;repeatSent=mode;send('repeat',{value:mode});}
export function nativeEqualizer(elements,saved){
 const state={enabled:!!saved?.enabled,levels:[0,1,2,3,4,5].map(i=>Math.max(-12,Math.min(12,Number(saved?.levels?.[i])||0)))};
 const update=()=>send('equalizer',state),setMixGain=(el,value)=>{const s=channels.get(el);if(!s)return false;send('gain',{channel:s.channel,value});return true;};
 return {state,supported:true,update,activate(){update();return true;},routes:()=>true,setMixGain,canMix:()=>true,scheduleMix(){},cancelMix(){},replaceElement(){},setNormalization(value){send('normalize',{value:!!value});},measure(){}};
}
