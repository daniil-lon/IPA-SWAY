const database=()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open('sway-catalog',1),timer=setTimeout(()=>reject(new Error('cache_blocked')),1000);
 r.onupgradeneeded=()=>r.result.createObjectStore('cache');
 r.onsuccess=()=>{clearTimeout(timer);resolve(r.result);};r.onerror=()=>{clearTimeout(timer);reject(r.error);};
});
async function cache(action,value){let db;try{db=await database();return await new Promise((resolve,reject)=>{const tx=db.transaction('cache',action==='get'?'readonly':'readwrite'),store=tx.objectStore('cache'),r=action==='get'?store.get('catalog'):store.put(value,'catalog');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch{return null;}finally{db?.close();}}
let socketMode=false;
async function socketPage(query){
 const url=new URL('/api/catalog?'+query,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
 url.searchParams.set('encoding',typeof DecompressionStream==='function'?'gzip':'identity');
 return new Promise((resolve,reject)=>{
  const socket=new WebSocket(url);socket.binaryType='arraybuffer';let meta,received=false,done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket.close();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(new Error('catalog_socket_timeout')),8000);
  socket.onerror=()=>finish(new Error('catalog_socket_error'));
  socket.onclose=()=>{if(!received)finish(new Error('incomplete_catalog'));};
  socket.onmessage=async event=>{try{
   if(typeof event.data==='string'){if(meta||event.data.length>1024)throw new Error('catalog_metadata');meta=JSON.parse(event.data);return;}
   if(!meta||received||meta.status!==200||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>16384)throw new Error('catalog_metadata');
   received=true;let bytes=new Uint8Array(event.data);if(bytes.length>14336)throw new Error('catalog_size');
   if(meta.encoding==='gzip')bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
   else if(meta.encoding!=='identity')throw new Error('catalog_encoding');
   if(bytes.length!==meta.size)throw new Error('incomplete_catalog');finish(null,JSON.parse(new TextDecoder().decode(bytes)));
  }catch(error){finish(error);}};
 });
}
async function page(offset,version=''){
 const query=new URLSearchParams({offset:String(offset),...(offset===0?{plan:'1'}:{}),...(version?{v:version}:{})});
 let d;
 if(socketMode)d=await socketPage(query);
 else try{
  const r=await fetch('/api/catalog?'+query,{signal:AbortSignal.timeout(3500)});
  if(!r.ok){r.body?.cancel().catch(()=>{});throw Object.assign(new Error('catalog'),{status:r.status});}d=await r.json();
 }catch(error){if(error.status||typeof WebSocket!=='function')throw error;socketMode=true;d=await socketPage(query);}
 if(!Array.isArray(d.items)||d.next!==null&&(!Number.isInteger(d.next)||d.next<=offset))throw new Error('invalid_catalog');return d;
}
async function retryPage(offset,version){
 for(let attempt=0;;attempt++){try{return await page(offset,version);}catch(e){if(attempt===2||e.status===401||e.status===409)throw e;await new Promise(r=>setTimeout(r,500*(attempt+1)));}}
}
export async function loadCatalog(onUpdate,onStatus=()=>{},{requireNetwork=false}={}){
 // After an unavailable profile, only a live, access-checked catalogue can
 // confirm guest access. An old device cache cannot grant that permission.
 const saved=requireNetwork?null:await cache('get');
 if(saved?.items?.length){const complete=refreshCatalog(onUpdate,onStatus,true);complete.catch(()=>{});return {items:saved.items,settled:true,complete};}
 return refreshCatalog(onUpdate,onStatus,false);
}
async function refreshCatalog(onUpdate,onStatus,background){
 let first;
 try{first=await retryPage(0);}catch(e){
  if(e.status===401||background)throw e;
  const r=await fetch('/catalog.json',{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Object.assign(new Error('catalog'),{status:r.status});
  const items=await r.json();if(!Array.isArray(items))throw new Error('invalid_catalog');await cache('set',{items,at:Date.now()});
  return {items,settled:true,complete:Promise.resolve(items)};
 }
 const complete=(async()=>{
  let items=[...first.items],last=performance.now();
  const progress=()=>{if(!background&&performance.now()-last>1200){onUpdate([...items],false);last=performance.now();}};
  const offsets=first.pages;
  if(Array.isArray(offsets)&&offsets.length&&offsets[0]===first.next&&offsets.every((v,i)=>Number.isInteger(v)&&v>0&&v<first.total&&(!i||v>offsets[i-1]))){
   const completed=new Map();let cursor=0,ready=0;
   // Bounded parallel downloads keep the first screen immediate without hundreds of serial round trips.
   await Promise.all(Array.from({length:Math.min(4,offsets.length)},async()=>{
    while(cursor<offsets.length){const index=cursor++,d=await retryPage(offsets[index],first.version);
     if(d.next!==(offsets[index+1]??null))throw new Error('catalog_changed');completed.set(index,d.items);
     while(completed.has(ready)){items.push(...completed.get(ready));completed.delete(ready++);}progress();
    }
   }));
  }else{let next=first.next;while(next!==null){const d=await retryPage(next,first.version);items.push(...d.items);next=d.next;progress();}}
  await cache('set',{items,at:Date.now()});onUpdate(items,true);onStatus(null);return items;
 })();complete.catch(error=>{if(!background)onStatus(error);});
 if(background)return complete;
 return {items:first.items,settled:first.next===null,complete};
}
