const partSize=8192,maxSize=32*1024*1024;
const state=globalThis.__swayTransferState??={interrupted:false,socketMode:false};
// Networks that cut long Cloudflare responses (often home Wi-Fi in Russia) are remembered across
// launches, so the app goes straight to small parts instead of waiting for timeouts every start.
// A background probe forgets the mark once full responses get through again.
const REMEMBER_MS=3*24*3600000;
const readMark=store=>{try{const saved=JSON.parse(store.getItem('sway-transfer')||'null');return saved&&Date.now()-saved.at<REMEMBER_MS?saved:null;}catch{return null;}};
const remembered=(()=>{try{return readMark(localStorage)||readMark(sessionStorage);}catch{return null;}})();
if(remembered)Object.assign(state,{interrupted:true,socketMode:!!remembered.socketMode});
if(remembered&&typeof window==='object'&&!state.probing){
 state.probing=true;
 setTimeout(async()=>{
  try{
   const response=await completeFetch(new Request('/track-languages.json?probe='+Date.now(),{cache:'no-store'}));
   if(response.ok&&(await response.arrayBuffer()).byteLength>20000){state.interrupted=false;state.socketMode=false;try{localStorage.removeItem('sway-transfer');sessionStorage.removeItem('sway-transfer');}catch{}}
  }catch{}
 },6000);
}
export const interruptedConnection=()=>state.interrupted;
export function markInterruptedConnection(socket=false){
 state.interrupted=true;state.socketMode||=socket;
 const mark=JSON.stringify({at:Date.now(),socketMode:state.socketMode});try{localStorage.setItem('sway-transfer',mark);}catch{}try{sessionStorage.setItem('sway-transfer',mark);}catch{}
}
const lanes={asset:{active:0,max:4,waiting:[]},media:{active:0,max:8,waiting:[]}};
async function slot(task,kind,signal){
 const lane=lanes[kind];signal?.throwIfAborted();
 if(lane.active>=lane.max)await new Promise((resolve,reject)=>{
  const item={resolve:()=>{signal?.removeEventListener('abort',cancel);resolve();}};
  const cancel=()=>{const at=lane.waiting.indexOf(item);if(at>=0)lane.waiting.splice(at,1);reject(signal.reason);};
  lane.waiting.push(item);signal?.addEventListener('abort',cancel,{once:true});
 });else lane.active++;
 try{signal?.throwIfAborted();return await task();}finally{const next=lane.waiting.shift();if(next)next.resolve();else lane.active--;}
}
export function isTransferAsset(path){
 try{path=decodeURIComponent(path);}catch{return false;}
 return !path.includes('..')&&!/[\\\u0000-\u001f?#]/.test(path)&&(
  path==='/admin-client.js'||/^\/(?!admin)[a-z][a-z0-9-]*\.(?:js|css|json|webmanifest)$/.test(path)&&path!=='/catalog.json'||
  /^\/art\/[\p{L}\p{N}_./$() -]+\.(?:svg|png|jpe?g|webp|avif)$/u.test(path)
 );
}
async function completeFetch(request){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
 const cancel=()=>controller.abort();request.signal?.addEventListener('abort',cancel,{once:true});
 try{
  const response=await fetch(new Request(request,{signal:controller.signal}));
  if(!response.ok||!response.body)return response;
  const data=await response.arrayBuffer(),headers=new Headers(response.headers);
  // Some mobile connections finish a compressed 200 response after only a
  // prefix. Check the original byte count before handing code to the browser.
  const expected=headers.get('X-Sway-Size');
  if(expected!==null&&(!/^\d+$/.test(expected)||!Number.isSafeInteger(Number(expected))||data.byteLength!==Number(expected)))throw new Error('incomplete_asset');
  headers.delete('Content-Encoding');headers.delete('Transfer-Encoding');headers.set('Content-Length',String(data.byteLength));
  return new Response(data,{status:response.status,statusText:response.statusText,headers});
 }finally{clearTimeout(timer);request.signal?.removeEventListener('abort',cancel);}
}
function checkedPart(meta,data,offset,version){
 const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(meta.range||'');
 if(!range||+range[1]!==offset||+range[2]>=+range[3]||+range[3]>maxSize||+range[2]-offset>=partSize||!meta.version||version&&meta.version!==version)throw new Error('invalid_asset_part');
 if(data.length!==+range[2]-offset+1)throw new Error('incomplete_asset_part');
 return {data,total:+range[3],version:meta.version,type:meta.type||'application/octet-stream',encoding:meta.encoding,size:Number(meta.size)};
}
async function socketPart(url,offset,version,signal,kind='asset'){
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{return await new Promise((resolve,reject)=>{
   const query=new URLSearchParams({path:url.pathname,offset:String(offset),encoding:kind==='asset'&&typeof DecompressionStream==='function'?'gzip':'identity',...(version?{v:version}:{})});
   const address=new URL('/api/'+kind+'-socket?'+query,url);address.protocol=url.protocol==='https:'?'wss:':'ws:';
   const socket=new WebSocket(address);socket.binaryType='arraybuffer';let meta,done=false;
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);socket.close();if(error)reject(error);else resolve(value);};
   const cancel=()=>finish(signal.reason||new Error('aborted')),timer=setTimeout(()=>finish(new Error('asset_socket_timeout')),8000);
   signal?.addEventListener('abort',cancel,{once:true});
   socket.onmessage=event=>{try{
    if(typeof event.data==='string'){if(meta||event.data.length>2048)throw new Error('invalid_asset_metadata');meta=JSON.parse(event.data);}
    else{if(!meta)throw new Error('missing_asset_metadata');finish(null,checkedPart(meta,new Uint8Array(event.data),offset,version));}
   }catch(error){finish(error);}};
   socket.onerror=()=>finish(new Error('asset_socket_error'));
   socket.onclose=()=>{if(!done)finish(new Error('incomplete_asset_socket'));};
  });}catch(error){signal?.throwIfAborted();if(attempt>=1)throw error;}
 }
}
export async function fetchAssetPart(url,offset,version,signal,kind='asset',preferSocket=false){
 return slot(async()=>{
  if(state.socketMode||preferSocket)return socketPart(url,offset,version,signal,kind);
  for(let attempt=0;;attempt++){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500),cancel=()=>controller.abort();
   signal?.addEventListener('abort',cancel,{once:true});
   try{
    signal?.throwIfAborted();
    const query=new URLSearchParams({path:url.pathname,offset:String(offset),encoding:kind==='asset'&&typeof DecompressionStream==='function'?'gzip':'identity',...(version?{v:version}:{})});
    const response=await fetch(new URL('/api/'+kind+'-part?'+query,url),{signal:controller.signal,credentials:'same-origin'});
    if(response.status!==206)throw Object.assign(new Error('asset_part_'+response.status),{status:response.status});
    const data=new Uint8Array(await response.arrayBuffer());
    return checkedPart({range:response.headers.get('Content-Range'),version:response.headers.get('X-Sway-Version'),type:response.headers.get('X-Sway-Type')||response.headers.get('Content-Type'),encoding:response.headers.get('X-Sway-Encoding'),size:response.headers.get('X-Sway-Size')},data,offset,version);
   }catch(error){
    signal?.throwIfAborted();if(error.status===404||error.status===412)throw error;
    if(typeof WebSocket==='function'){markInterruptedConnection(true);return socketPart(url,offset,version,signal,kind);}
    if(attempt>=2)throw error;
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
 },kind,signal);
}
export async function fetchAsset(input,{recovery=false}={}){
 const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
 if(!recovery&&!state.interrupted){try{return await completeFetch(request);}catch(error){request.signal?.throwIfAborted();markInterruptedConnection();}}
 const first=await fetchAssetPart(url,0,'',request.signal);let data=new Uint8Array(first.total);data.set(first.data);
 let cursor=first.data.length;
 await Promise.all(Array.from({length:Math.min(4,Math.ceil((first.total-cursor)/partSize))},async()=>{
  while(cursor<first.total){const offset=cursor;cursor+=partSize;const next=await fetchAssetPart(url,offset,first.version,request.signal);
   if(next.total!==first.total)throw new Error('asset_changed');data.set(next.data,offset);
  }
 }));
 if(first.encoding==='gzip')data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 if(data.length!==first.size||data.length>maxSize)throw new Error('incomplete_asset');
 return new Response(data,{headers:{'Content-Type':first.type,'Content-Length':String(data.length),'ETag':first.version,'Cache-Control':'public, max-age=0, must-revalidate'}});
}
