const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('sway-catalog',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function cache(action,value){let db;try{db=await database();return await new Promise((resolve,reject)=>{const tx=db.transaction('cache',action==='get'?'readonly':'readwrite'),store=tx.objectStore('cache'),r=action==='get'?store.get('catalog'):store.put(value,'catalog');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch{return null;}finally{db?.close();}}
async function page(offset){const r=await fetch('/api/catalog?offset='+offset,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Object.assign(new Error('catalog'),{status:r.status});const d=await r.json();if(!Array.isArray(d.items)||d.next!==null&&(!Number.isInteger(d.next)||d.next<=offset))throw new Error('invalid_catalog');return d;}
export async function loadCatalog(onUpdate){
 const saved=await cache('get');
 if(saved?.items?.length){const complete=refreshCatalog(onUpdate,true);complete.catch(()=>{});return {items:saved.items,complete};}
 return refreshCatalog(onUpdate,false);
}
async function refreshCatalog(onUpdate,background){
 let first;
 try{first=await page(0);}catch(e){
  if(e.status===401)throw e;
  if(background)throw e;
  const r=await fetch('/catalog.json',{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Object.assign(new Error('catalog'),{status:r.status});return {items:await r.json(),complete:Promise.resolve()};
 }
 const initial=first.items;
 const complete=(async()=>{
  let items=[...first.items],next=first.next,last=performance.now();
  while(next!==null){let d;for(let attempt=0;attempt<3;attempt++){try{d=await page(next);break;}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,500*(attempt+1)));}}items.push(...d.items);next=d.next;if(performance.now()-last>1600){if(!background)onUpdate([...items],false);last=performance.now();}}
  await cache('set',{items,at:Date.now()});onUpdate(items,true);return items;
 })();complete.catch(()=>{});
 if(background)return complete;
 return {items:initial,complete};
}
