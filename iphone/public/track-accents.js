export function accentGroup(id){
 let value=2166136261;
 for(const character of String(id)){value=Math.imul(value^character.codePointAt(0),16777619);}
 return (value>>>0&511).toString(16).padStart(3,'0');
}
const groups=new Map();
export function loadTrackAccents(id){
 if(!id)return Promise.resolve();
 const key=accentGroup(id);
 if(groups.get(key)?.retryAt<Date.now())groups.delete(key);
 if(!groups.has(key)){
  const entry={data:null};groups.set(key,entry);
  entry.pending=fetch('/wave-pulses-'+key+'.json',{signal:AbortSignal.timeout(6000)}).then(response=>{
   if(!response.ok)throw new Error('accents_unavailable');return response.json();
  }).then(data=>{entry.data=data;return data[id];}).catch(()=>{entry.retryAt=Date.now()+30000;});
  if(groups.size>8)groups.delete(groups.keys().next().value);
 }
 const entry=groups.get(key);return entry.data?Promise.resolve(entry.data[id]):entry.pending.then(()=>entry.data?.[id]);
}
export function getTrackAccents(id){
 if(!id)return;
 void loadTrackAccents(id);
 return groups.get(accentGroup(id))?.data?.[id];
}
