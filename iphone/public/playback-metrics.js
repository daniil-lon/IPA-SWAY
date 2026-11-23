export function createPlaybackMetrics(elements,getActive,{clock=()=>performance.now(),send=(...args)=>fetch(...args),platform=/iPhone|iPad|iPod/.test(navigator.userAgent)?'ios':/Android/.test(navigator.userAgent)?'android':'desktop'}={}){
 let pending=null,waiting=null,started=false,timer=0,flight=null,sending=false;
 const queue=[],recent=[];
 function record(metric,ms){
  if(!Number.isFinite(ms)||ms<0||ms>300000)return;
  const sample={metric,ms:Math.round(ms),platform};queue.push(sample);recent.push(sample);
  if(queue.length>40)queue.shift();if(recent.length>10)recent.shift();schedule();
 }
 function schedule(){if(!timer)timer=setTimeout(()=>{timer=0;flush();},15000);}
 async function flush(){
  if(sending||(!queue.length&&!flight))return;sending=true;
  flight??={id:crypto.randomUUID(),samples:queue.splice(0,20)};
  try{
   const result=await send('/api/performance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(flight),credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(6000)});
   if(result.ok)flight=null;
  }catch{}finally{sending=false;if(queue.length&&!flight)schedule();}
 }
 const onSound=()=>{
  const el=getActive();if(el.paused||el.seeking)return;
  if(pending){record(pending.metric,clock()-pending.at);pending=null;}
  if(waiting!==null){const delay=clock()-waiting;waiting=null;if(delay>=250)record('rebuffer',delay);}
 };
 for(const el of elements){
  el.addEventListener('playing',()=>{if(el===getActive())onSound();});
  el.addEventListener('waiting',()=>{if(el===getActive()&&!el.paused&&!el.seeking&&el.currentTime>0&&!pending&&waiting===null)waiting=clock();});
  for(const event of ['pause','seeking','ended'])el.addEventListener(event,()=>{if(el===getActive())waiting=null;});
 }
 addEventListener('pagehide',()=>{clearTimeout(timer);timer=0;flush();});addEventListener('online',flush);
 return {
  begin(metric='first_audio'){waiting=null;pending={metric,at:clock()};},
  committed(){if(!pending)pending={metric:'next_audio',at:clock()};if(getActive().readyState>=2)onSound();},
  cancel(){pending=null;waiting=null;},
  ready(){if(!started){started=true;record('startup',clock());}},
  snapshot:()=>recent.map(e=>({...e})),flush
 };
}
