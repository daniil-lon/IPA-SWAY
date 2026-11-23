import {fetchAsset} from './asset-loader.js';
// The interface must recover interrupted transfers without waiting for the
// separate offline worker to install. Exact build hashes also reject old code.
const message=()=>document.querySelector('#sway-splash .splash-sub');
const timed=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('connection_timeout')),ms);})]).finally(()=>clearTimeout(timer));};
const stage=name=>{document.body.dataset.loadStage=name;};
let buildCache;
function database(){
 return buildCache??=new Promise((resolve,reject)=>{
  const request=indexedDB.open('sway-verified-build-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('sources',{keyPath:'hash'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function savedSource(hash,text){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction('sources',text===undefined?'readonly':'readwrite'),store=transaction.objectStore('sources');
  let result;
  if(text===undefined){const request=store.get(hash);request.onsuccess=()=>{result=request.result?.text;};}
  else{
   store.put({hash,text,at:Date.now()});
   const request=store.getAll();request.onsuccess=()=>request.result.sort((a,b)=>a.at-b.at).slice(0,-6).forEach(row=>store.delete(row.hash));
  }
  transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
 });
}
async function control(){
 if(!('serviceWorker' in navigator))return;
 document.body.dataset.offlineStage='worker-download';
 const registration=await timed(navigator.serviceWorker.register('/sw.js',{type:'module',updateViaCache:'none'}),45000);
 document.body.dataset.offlineStage='worker-activation';
 const worker=registration.installing||registration.waiting;
 if(worker)await timed(new Promise((resolve,reject)=>{
  const check=()=>{if(worker.state==='activated')resolve();else if(worker.state==='redundant')reject(new Error('worker_update'));};
  worker.addEventListener('statechange',check);check();
 }),15000);
 if(!navigator.serviceWorker.controller)await timed(new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),8000);
 document.body.dataset.offlineStage='ready';
}
async function source(path,hash){
 if(!/^[A-Za-z0-9+/]{43}=$/.test(hash||''))throw new Error('missing_build_hash');
 const verified=async response=>{
  if(!response?.ok)return;
  const bytes=await response.arrayBuffer();
  const digest=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))));
  if(digest===hash)return new TextDecoder().decode(bytes);
 };
 try{
  const saved=await timed(savedSource(hash).then(text=>text===undefined?undefined:verified(new Response(text))),1500);
  if(saved!==undefined)return saved;
 }catch{}
 for(const recovery of [false,true]){
  const response=await fetchAsset(new Request(new URL(path,location.href)),{recovery});
  if(!response.ok)throw new Error('asset_'+response.status);
  const text=await verified(response);
  if(text!==undefined){
   // Build data has its own bounded cache; downloaded songs are never evicted.
   await timed(savedSource(hash,text),1000).catch(()=>{});
   return text;
  }
 }
 throw new Error('asset_integrity');
}
async function start(){
 try{
  void control().catch(error=>{document.body.dataset.workerError=error.message;});
  const build=document.querySelector('script[data-sway-boot]').dataset;
  stage('styles');
  const styles=[...document.querySelectorAll('link[data-sway-style]')];
  const stylesReady=Promise.all(styles.map(async link=>{
   const text=await timed(source(link.dataset.swayStyle,build.cssHash),45000);
   const style=document.createElement('style');style.dataset.swayStyle=link.dataset.swayStyle;style.textContent=text;link.replaceWith(style);
  }));
  const [,text]=await Promise.all([stylesReady,timed(source('/app-bundle.js',build.appHash),45000)]);
  document.querySelectorAll('[data-sway-srcset]').forEach(el=>{el.srcset=el.dataset.swaySrcset;});
  document.querySelectorAll('[data-sway-src]').forEach(el=>{el.src=el.dataset.swaySrc;});
  stage('application');
  await timed(new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.type='module';script.dataset.swayApp='';
   document.addEventListener('sway:application-ready',resolve,{once:true});
   script.onerror=()=>reject(new Error('application'));script.textContent=text;document.head.append(script);
  }),60000);
  document.querySelectorAll('[data-sway-icon]').forEach(el=>{el.href=el.dataset.swayIcon;});
  document.querySelectorAll('[data-sway-manifest]').forEach(el=>{el.href=el.dataset.swayManifest;});
  stage('ready');
 }catch(error){
  document.body.dataset.loadError=error.message;stage('retry');
  const box=message();if(!box)return;
  box.textContent='Соединение прервалось. Попробуй загрузить ещё раз.';
  const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Повторить';
  button.style.cssText='display:block;margin:20px auto;padding:12px 24px;border:0;border-radius:24px;background:#ffff38;color:#080a10;-webkit-text-fill-color:#080a10;font:600 15px system-ui;cursor:pointer';
  button.addEventListener('click',()=>location.reload());box.append(button);
 }
}
void start();
