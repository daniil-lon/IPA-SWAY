import {createLeveler} from './loudness.js';
export const equalizerBands=[60,150,400,1000,2400,15000];
export const equalizerPresets=[
 ['Ровно',[0,0,0,0,0,0]],['Больше баса',[6,4,1,0,-1,-1]],
 ['Мягкое звучание',[3,2,0,0,-2,-4]],['Чётче',[-2,-1,0,2,4,3]]
];

export const equalizerLimit=12;
export function makeEqualizer(elements,saved){
 const Context=window.AudioContext||window.webkitAudioContext;
 const state={enabled:!!Context&&saved?.enabled===true,levels:equalizerBands.map((_,i)=>Math.max(-equalizerLimit,Math.min(equalizerLimit,Math.round(Number(saved?.levels?.[i])||0))))};
 let context, filters, responseFilters, headroom, frequencies, cachedLevels='';
 const routed=new Set();
 const channels=new Map(),targets=new Map(elements.map((el,i)=>[el,i?0:1])),levelers=new Map();let automation=false,normalize=false;
 const amplitude=new Float32Array(100), phase=new Float32Array(100);
 function update(){
  if(!filters)return;
  const levels=state.enabled?state.levels:equalizerBands.map(()=>0), key=levels.join();
  if(key===cachedLevels)return;
  cachedLevels=key;
  const response=new Float32Array(amplitude.length).fill(1);
  responseFilters.forEach((filter,i)=>{
   filter.gain.value=levels[i];filter.getFrequencyResponse(frequencies,amplitude,phase);
   for(let n=0;n<response.length;n++)response[n]*=amplitude[n];
  });
  const target=1/Math.max(1,...response);
  headroom.gain.setTargetAtTime(target,context.currentTime,target<headroom.gain.value ? .018 : .055);
  filters.forEach((filter,i)=>filter.gain.setTargetAtTime(levels[i],context.currentTime,.04));
 }
 function activate({mix=false}={}){
  if(!Context||!state.enabled&&!routed.size&&!mix)return false;
  if(!context){
   const next=new Context();
   try{
    const build=()=>equalizerBands.map((frequency,i)=>{
     const node=next.createBiquadFilter();
     node.type=i===0?'lowshelf':i===equalizerBands.length-1?'highshelf':'peaking';
     node.frequency.value=frequency;node.Q.value=1;
     return node;
    });
    const nodes=build(), input=next.createGain();
    responseFilters=build();
    frequencies=Float32Array.from(amplitude,(_,i)=>20*(Math.min(next.sampleRate*.48,20000)/20)**(i/(amplitude.length-1)));
    nodes.reduce((prior,node)=>{prior.connect(node);return node;},input).connect(next.destination);
    context=next;filters=nodes;headroom=input;
   }catch(e){next.close().catch(()=>{});throw e;}
  }
  update();
  const route=()=>{
   if(context.state!=='running')return false;
   // Creating a media source takes over the element's output. Wait until the graph can play.
   if(state.enabled||mix)for(const audio of elements){
    if(routed.has(audio))continue;
    const source=context.createMediaElementSource(audio);
    const channel=context.createGain();channel.gain.value=mix?(targets.get(audio)??1):1;
    const leveler=createLeveler(context,source);leveler.setEnabled(normalize);levelers.set(audio,leveler);
    routed.add(audio);leveler.output.connect(channel);channel.connect(headroom);channels.set(audio,channel);
    if(mix)audio.volume=1;
   }
   return routed.size>0;
  };
  if(context.state==='running')return route();
  if(context.state==='closed')return false;
  let timer;
  // Some versions of WebKit leave resume pending after the app has been backgrounded.
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1400);});
  try{return Promise.race([context.resume().then(()=>true),deadline]).then(ready=>ready&&route()).finally(()=>clearTimeout(timer));}
  catch(error){clearTimeout(timer);throw error;}
 }
 function setMixGain(audio,value){
  targets.set(audio,value);const channel=channels.get(audio);if(!channel||context.state!=='running')return false;
  audio.volume=1;if(!automation)channel.gain.setTargetAtTime(value,context.currentTime,.009);return true;
 }
 const canMix=()=>elements.every(el=>routed.has(el))&&context?.state==='running';
 function cancelMix(){
  if(!automation)return;automation=false;
  for(const channel of channels.values()){const p=channel.gain;if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(context.currentTime);else p.cancelScheduledValues(context.currentTime);}
 }
 function scheduleMix(outgoing,incoming,seconds,level,gains,from=0){
  if(!canMix()||seconds<=0)return;
  cancelMix();automation=true;
  for(const [i,el] of [outgoing,incoming].entries()){
   const curve=Float32Array.from({length:257},(_,n)=>gains(from+(1-from)*n/256,level)[i]);
   channels.get(el).gain.setValueCurveAtTime(curve,context.currentTime,Math.max(.02,seconds));
  }
 }
 function replaceElement(old,next){const i=elements.indexOf(old);if(i<0)return;levelers.get(old)?.output.disconnect();levelers.delete(old);channels.get(old)?.disconnect();channels.delete(old);routed.delete(old);targets.delete(old);targets.set(next,0);elements[i]=next;}
 function setNormalization(value){normalize=!!value;for(const leveler of levelers.values())leveler.setEnabled(normalize);}
 function measure(audio,id){const leveler=levelers.get(audio);if(!leveler)return;leveler.track(id);leveler.sample(!audio.paused&&!audio.seeking&&!audio.ended);}
 return {state,supported:!!Context,update,activate,routes:audio=>routed.has(audio),setMixGain,canMix,scheduleMix,cancelMix,replaceElement,setNormalization,measure};
}
