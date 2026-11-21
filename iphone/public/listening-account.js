export function createListeningAccount({api,getUser,getSnapshot,applySnapshot,onHistory,onChange}){
 let uid='',epoch=0,revision=0,remote=null,dirty=false,saving=null,lastSave=0,elapsed=0,track='',pending=[],started=true,lastTime=null,lastTick=0,flushing=null;
 let device;try{device=localStorage.getItem('sway.device');if(!device){device=crypto.randomUUID();localStorage.setItem('sway.device',device);}}catch{device=crypto.randomUUID();}
 const current=token=>token===epoch&&uid&&getUser()?.id===uid;
 function persist(){try{if(uid)localStorage.setItem(`sway.listens.${uid}`,JSON.stringify(pending.slice(-500)));}catch{}}
 async function flush(){
  const token=epoch;if(!current(token)||navigator.onLine===false||flushing===token)return;flushing=token;
  try{while(pending.length&&current(token)){const event=pending[0];await api('/api/listening','POST',event);if(!current(token))return;if(pending[0]?.id===event.id)pending.shift();persist();}}
  catch{}finally{if(flushing===token)flushing=null;}
 }
 function collect(){if(elapsed>0&&track&&uid){pending.push({id:crypto.randomUUID(),track,seconds:Math.min(90,elapsed),started,at:Date.now()});elapsed=0;started=false;persist();void flush();}}
 async function refresh(token=epoch){
  if(!current(token))return;
  try{const r=await api('/api/playback');if(!current(token))return;revision=r.revision;remote=r.snapshot&&r.device!==device?r:null;onChange();}catch{}
 }
 async function load(){
  collect();++epoch;uid=getUser()?.id||'';revision=0;remote=null;dirty=false;saving=null;flushing=null;elapsed=0;track='';lastTime=null;lastTick=0;lastSave=0;pending=[];started=true;onChange();
  const token=epoch;if(!uid)return;
  try{const saved=JSON.parse(localStorage.getItem(`sway.listens.${uid}`)||'[]');pending=Array.isArray(saved)?saved.filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.seconds)).slice(-500):[];}catch{}
  void flush();await refresh(token);if(!current(token))return;
  try{const r=await api('/api/history');if(current(token))onHistory(r.tracks||[]);}catch{}
 }
 async function save(force=false){
  const token=epoch;if(!current(token)||!dirty||saving===token||remote||!force&&Date.now()-lastSave<15000)return;
  const snapshot=getSnapshot();if(!snapshot)return;saving=token;dirty=false;
  try{const r=await api('/api/playback','PUT',{device,revision,snapshot});if(!current(token))return;revision=r.revision;lastSave=Date.now();}
  catch(e){if(!current(token))return;dirty=true;if(e.status===409)await refresh(token);}
  finally{if(saving===token)saving=null;}
 }
 function tick(id,time,playing){
  if(!current(epoch)){elapsed=0;lastTime=null;return;}
  if(id!==track){collect();track=id;started=true;lastTime=null;}
  const now=performance.now();
  if(playing&&lastTime!==null){const delta=time-lastTime,wall=(now-lastTick)/1000;if(delta>0&&delta<=90&&Math.abs(delta-wall)<Math.max(1.5,wall*.25))elapsed+=delta;}
  lastTime=playing?time:null;lastTick=now;if(elapsed>=15)collect();
 }
 window.addEventListener('online',()=>{void flush();void save();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){collect();void save(true);}else if(!dirty&&saving!==epoch)void refresh();});
 setInterval(()=>{void save();void flush();},15000);
 return {load,tick,changed(){dirty=true;void save();},get remote(){return remote;},async resume(){if(!remote)return;const token=epoch,snapshot=remote.snapshot;remote=null;await applySnapshot(snapshot);if(!current(token))return;dirty=true;void save(true);onChange();},keep(){remote=null;dirty=true;void save(true);onChange();},async stats(period){return api('/api/stats?period='+period);}};
}
