export function createListeningAccount({api,getUser,getTrack,getSnapshot,applySnapshot,onHistory,onChange}){
 let uid='',revision=0,remote=null,dirty=false,saving=false,lastSave=0,elapsed=0,track='',pending=[],started=true,lastTime=null,flushing=false;
 let device=localStorage.getItem('sway.device');if(!device){device=crypto.randomUUID();localStorage.setItem('sway.device',device);}
 const key=()=>`sway.listens.${uid}`;
 function persist(){try{localStorage.setItem(key(),JSON.stringify(pending.slice(-500)));}catch{}}
 async function flush(){if(!uid||getUser()?.id!==uid||navigator.onLine===false||flushing)return;flushing=true;try{while(pending.length&&getUser()?.id===uid){await api('/api/listening','POST',pending[0]);pending.shift();persist();}}catch{}finally{flushing=false;}}
 function collect(){if(elapsed>0&&track&&uid){pending.push({id:crypto.randomUUID(),track,seconds:Math.min(90,elapsed),started,at:Date.now()});elapsed=0;started=false;persist();void flush();}}
 async function load(){collect();uid=getUser()?.id||'';if(!uid)return;try{pending=JSON.parse(localStorage.getItem(key())||'[]').filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.seconds)).slice(-500);}catch{pending=[];}void flush();
  try{const r=await api('/api/playback');revision=r.revision;remote=r.snapshot&&r.device!==device?r:null;onChange();}catch{}
  try{const r=await api('/api/history');onHistory(r.tracks||[]);}catch{}
 }
 async function save(force=false){if(!uid||!dirty||saving||remote||!force&&Date.now()-lastSave<15000)return;const snapshot=getSnapshot();if(!snapshot)return;saving=true;dirty=false;try{const r=await api('/api/playback','PUT',{device,revision,snapshot});revision=r.revision;lastSave=Date.now();}catch(e){dirty=true;if(e.status===409){try{const r=await api('/api/playback');revision=r.revision;if(r.device!==device){remote=r;onChange();}}catch{}}}finally{saving=false;}}
 function tick(id,time,playing){if(getUser()?.id!==uid){elapsed=0;lastTime=null;return;}if(id!==track){collect();track=id;started=true;lastTime=null;}if(playing&&lastTime!==null){const delta=time-lastTime;if(delta>0&&delta<2)elapsed+=delta;}lastTime=playing?time:null;if(elapsed>=15)collect();}
 window.addEventListener('online',()=>{void flush();void save();});document.addEventListener('visibilitychange',()=>{if(document.hidden){collect();void save(true);}});
 setInterval(()=>{void save();void flush();},15000);
 return {load,tick,changed(){dirty=true;void save();},get remote(){return remote;},async resume(){if(!remote)return;const snapshot=remote.snapshot;remote=null;await applySnapshot(snapshot);dirty=true;void save(true);onChange();},keep(){remote=null;dirty=true;void save(true);onChange();},async stats(period){return api('/api/stats?period='+period);}};
}
