export const transitionSeconds=10;
const bounded=(n,a,b)=>Math.max(a,Math.min(b,n));
const pulseCache=new WeakMap();

export function pulseTempo(events){
 if(!Array.isArray(events)||events.length<18)return null;
 if(pulseCache.has(events))return pulseCache.get(events);
 const beats=[];for(let i=0;i<events.length;i+=2)if(events[i+1]>=60)beats.push(events[i]/100);
 const bins=new Map();
 for(let i=0;i<beats.length-1;i++)for(let j=i+1;j<Math.min(i+5,beats.length);j++){
  const d=beats[j]-beats[i];if(d<.28||d>1.65)continue;
  let tempo=60/d;while(tempo<76)tempo*=2;while(tempo>160)tempo/=2;
  const bpm=Math.round(tempo),weight=1/(j-i);
  for(let delta=-1;delta<=1;delta++)bins.set(bpm+delta,(bins.get(bpm+delta)||0)+weight*(delta? .45:1));
 }
 const best=[...bins].sort((a,b)=>b[1]-a[1])[0];
 const result=best?{bpm:best[0],confidence:Math.min(1,best[1]/Math.max(6,beats.length*.32)),beats}:null;
 pulseCache.set(events,result);return result;
}

export function transitionPlan(outgoing,incoming,{duration,nextDuration,accents=()=>null}={}){
 const first=accents(outgoing?.id),second=accents(incoming?.id);
 const a=pulseTempo(first),b=pulseTempo(second);
 const related=a&&b&&a.confidence>.22&&b.confidence>.22&&Math.abs(Math.log2(a.bpm/b.bpm))<.19;
 const maximum=Math.min(transitionSeconds,duration*.42,Number.isFinite(nextDuration)?nextDuration*.42:transitionSeconds);
 const target=related?60/a.bpm*16:transitionSeconds;
 let length=Math.min(maximum,target),start=duration-length;
 if(related&&length>2){
  const firstBeat=b.beats.find(t=>t<=1.5)??0;
  const aligned=a.beats.map(t=>t-Math.min(firstBeat,.9)).filter(t=>t>=duration-maximum&&Math.abs(t-start)<.28);
  if(aligned.length){start=aligned.reduce((best,t)=>Math.abs(t-start)<Math.abs(best-start)?t:best);length=duration-start;}
 }
 return {at:start,seconds:Math.max(.65,length),rhythmic:!!related,bpm:related?a.bpm:null};
}

export function transitionGains(progress,level){
 const p=bounded(progress,0,1),ease=p*p*(3-2*p),angle=ease*Math.PI/2;
 const outgoing=Math.cos(angle),incoming=Math.sin(angle);
 // Equal-power curves avoid the audible dip between unrelated recordings.
 // Keep the sum below full scale even when both recordings peak together.
 const ceiling=1/Math.max(1,level*(outgoing+incoming));
 return [level*outgoing*ceiling,level*incoming*ceiling];
}

// The active element stays the source of truth until both streams are ready.
export function makeTransition(elements,{enabled=true,mixer=null,onCommit,sourceFor=t=>t.audio,getCurrent=()=>null,getAccents=()=>null}={}){
 let [active,standby]=elements,candidate=null,candidateSource='',phase='',timer=0,level=.8,muted=false,flight=0,blendAt=0,blendFor=transitionSeconds,pendingPlay,plan=null,progress=0;
 let handoffTimer=0,handoffOutgoing=null,handoffBegan=0;
 let nativeVolume=enabled;
 if(nativeVolume){
  try{const old=standby.volume;standby.volume=.37;nativeVolume=Math.abs(standby.volume-.37)<.01;standby.volume=old;}
  catch{nativeVolume=false;}
 }
 const supported=enabled&&(nativeVolume||mixer?.supported);
 const gain=(el,value)=>{if(!mixer?.setMixGain(el,value))try{el.volume=value;}catch{}};
 function setVolume(value){level=Math.min(1,Math.max(0,Number(value)||0));if(phase==='mixing')mixer?.scheduleMix(active,standby,blendFor*(1-progress),level,transitionGains,progress);mix();}
 function setMuted(value){muted=!!value;active.muted=muted;standby.muted=muted;}
 function mix(){
  if(!supported){gain(active,level);return;}
  if(handoffOutgoing){
   const gains=transitionGains((performance.now()-handoffBegan)/240,level);
   gain(handoffOutgoing,gains[0]);gain(active,gains[1]);return;
  }
  progress=phase==='mixing'&&!standby.paused&&standby.readyState>=2
   ?Math.max(progress,Math.min(1,(active.currentTime-blendAt)/blendFor,standby.currentTime/blendFor+.025)):0;
  const gains=transitionGains(progress,level);
  gain(active,gains[0]);gain(standby,gains[1]);
 }
 function release(el){el.pause();el.removeAttribute('src');el.preload='none';el.load();}
 function swap(){
  mixer?.cancelMix();
  const outgoing=active;
  [active,standby]=[standby,active];
  outgoing.id='audio-next';active.id='audio';active.preload='auto';
  mix();
 }
 function select(element){
  if(element!==standby)return;
  cancel();swap();
 }
 function cancel(){
  clearInterval(handoffTimer);handoffTimer=0;
  if(handoffOutgoing){release(handoffOutgoing);handoffOutgoing=null;}
  mixer?.cancelMix();
  clearInterval(timer);timer=0;flight++;pendingPlay=undefined;plan=null;progress=0;
  if(candidate){candidate=null;candidateSource='';phase='';release(standby);}
  mix();
 }
 function rewind(){
  if(phase!=='starting'&&phase!=='mixing')return;
  mixer?.cancelMix();
  clearInterval(timer);timer=0;flight++;phase='preloaded';pendingPlay=undefined;plan=null;progress=0;
  standby.pause();
  try{standby.currentTime=0;}catch{}
  mix();
 }
 function tick(next){
  if(handoffTimer)return;
  if(!enabled)return;
  if(!next||active.paused||!Number.isFinite(active.duration)){
   if(candidate&&!active.ended)cancel();return;
  }
  if(active.seeking||active.ended)return;
  const remaining=active.duration-active.currentTime;
  const source=sourceFor(next);
  if(candidate&&(candidate.id!==next.id||candidateSource!==source))cancel();
  if(remaining<=0||active.readyState<3)return;
  // Let the current stream start before loading the next one in the background.
  if(!candidate){
   let ahead=0;for(let i=0;i<active.buffered.length;i++)if(active.buffered.start(i)<=active.currentTime&&active.buffered.end(i)>active.currentTime)ahead=active.buffered.end(i)-active.currentTime;
   if(remaining>transitionSeconds+5&&(active.currentTime<4||ahead<12))return;
   candidate=next;candidateSource=source;phase='preloaded';standby.preload='auto';standby.src=source;
  }
  if(!supported||!nativeVolume&&!mixer?.canMix())return;
  if(phase==='mixing'){mix();return;}
  if(!timer&&remaining<=transitionSeconds+1)timer=setInterval(()=>tick(candidate),32);
  if(phase!=='preloaded'||standby.seeking||standby.readyState<3||standby.error||remaining<.65)return;
  plan??=transitionPlan(getCurrent(),candidate,{duration:active.duration,nextDuration:standby.duration,accents:getAccents});
  if(active.currentTime<plan.at||plan.seconds<1)return;
  let buffered=0;
  for(let i=0;i<standby.buffered.length;i++)if(standby.buffered.start(i)<=.1)buffered=Math.max(buffered,standby.buffered.end(i));
  if(buffered<Math.min(standby.duration,remaining+1)&&!standby.ended)return;
  phase='starting';
  const incoming=standby,ticket=++flight;
  blendAt=active.currentTime;blendFor=Math.max(.65,remaining);
  const began=()=>{
   if(incoming!==standby||flight!==ticket||phase!=='starting')return;
   phase='mixing';mixer?.scheduleMix(active,standby,blendFor,level,transitionGains);mix();if(!timer)timer=setInterval(()=>tick(candidate),32);
  };
  const rejected=()=>{
   if(incoming!==standby||flight!==ticket||phase!=='starting')return;
   phase='rejected';standby.pause();mix();
  };
  try{pendingPlay=Promise.resolve(standby.play());pendingPlay.then(began,rejected);}catch{rejected();}
 }
 function finish(next,{manual=false}={}){
  if(manual&&(standby.readyState<2||handoffTimer))return false;
  if(!supported||!next||candidate?.id!==next.id||candidateSource!==sourceFor(next)||phase==='rejected'||standby.ended||standby.error){
   cancel();return false;
  }
  // Keep the same element and request even if buffering outlasted the current track.
  const target=candidate, outgoing=active;
  let playAttempt=pendingPlay;
  try{if(!playAttempt&&standby.paused)playAttempt=Promise.resolve(standby.play());}catch{cancel();return false;}
  clearInterval(timer);timer=0;flight++;candidate=null;candidateSource='';phase='';pendingPlay=undefined;plan=null;progress=0;
  swap();
  if(manual&&!outgoing.paused){
   const incoming=active,began=performance.now();handoffOutgoing=outgoing;handoffBegan=began;
   gain(outgoing,level);gain(incoming,0);
   handoffTimer=setInterval(()=>{
    const p=bounded((performance.now()-began)/240,0,1),values=transitionGains(p,level);
    gain(outgoing,values[0]);gain(incoming,values[1]);
    if(p>=1){clearInterval(handoffTimer);handoffTimer=0;handoffOutgoing=null;release(outgoing);mix();}
   },16);
  }else release(outgoing);
  onCommit(active,target,playAttempt);return true;
 }
 const watch=el=>el.addEventListener('error',()=>{if(el===standby&&candidate){mixer?.cancelMix();phase='rejected';mix();}});
 elements.forEach(watch);
 function unlock(){
  if(!mixer||candidate||standby.getAttribute('src'))return;
  const element=standby,ticket=flight;
  // Prime the second iOS media element during the same trusted tap. The sample is silent.
  element.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
  try{Promise.resolve(element.play()).then(()=>{if(element===standby&&ticket===flight&&!candidate)release(element);},()=>{if(element===standby&&ticket===flight&&!candidate)release(element);});}catch{release(element);}
 }
 function replaceStandby(element){cancel();release(standby);standby=element;watch(element);mix();}
 return {cancel,rewind,tick,finish,select,setVolume,setMuted,unlock,replaceStandby,supported,get preparedId(){return phase==='rejected'?null:candidate?.id;}};
}
