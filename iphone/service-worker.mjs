import {offlineCache,offlineRoot} from './public/offline-storage.js';
import {fetchAsset,isTransferAsset} from './public/asset-loader.js';
import {fetchMedia} from './public/media-loader.js';

const SHELL='sway-shell-v39';
// All public JS/CSS/JSON/art paths are already covered by isTransferAsset.
const core=new Set(['/','/offline.html']);

self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 // The old all-or-nothing install waited forever when one large asset stalled.
 // Install only the small entry point; cache complete assets as they are used.
 await Promise.allSettled(['/','/boot.js','/offline.html','/manifest.webmanifest'].map(async path=>{
  const response=await fetch(new Request(path,{cache:'reload',signal:AbortSignal.timeout(5000)}));
  if(response.ok)await cache.put(path,response);
 }));
 await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const keys=await caches.keys();
 // Retain one previous shell until this version has loaded. Saved tracks use
 // their own cache and are never touched by an application update.
 const old=keys.filter(k=>k.startsWith('sway-shell-')&&k!==SHELL);
 await Promise.all(old.slice(0,-1).map(k=>caches.delete(k)));
 await self.clients.claim();
 // The first page loads the app before this worker controls it, so nothing cached the bundle and an
 // installed iPhone app opened offline after one online launch could not start. Warm it in the background.
 void warmShell();
})()));
async function warmShell(){
 const cache=await caches.open(SHELL);
 await Promise.allSettled(['/app-bundle.js','/sway.css'].map(async path=>{
  if(await cache.match(path))return;
  const response=await fetchAsset(new Request(new URL(path,self.location.origin),{signal:AbortSignal.timeout(30000)}));
  if(response.ok)await cache.put(path,response);
 }));
}

async function shellResponse(event,path){
 const cache=await caches.open(SHELL);
 const saved=await cache.match(path),entry=path==='/'||path==='/app-bundle.js'||path==='/sway.css';
 // A cached HTML page pins exact application/style hashes and CSP. Keeping it
 // cache-first across releases can pair an old entry with new assets forever.
 if(saved&&(!entry||self.navigator.onLine===false))return saved;
 try{
  // Covers carry no exact size and are often slower than 8 s on mobile data. Fetching them through the
  // strict code path flipped every later asset into 8 KB chunks and then failed the image outright.
  const art=path.startsWith('/art/');
  const request=new Request(event.request,{cache:entry?'no-store':event.request.cache,signal:AbortSignal.timeout(art?15000:8000)});
  let response=art?await fetch(request).catch(()=>{event.request.signal?.throwIfAborted();return fetchAsset(event.request,{recovery:true});}):
   isTransferAsset(path)?await fetchAsset(request):await fetch(request);
  if(path==='/'&&response.ok){
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength>131072||!new TextDecoder().decode(bytes).trimEnd().endsWith('</html>'))throw new Error('incomplete_entry');
   const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.delete('Transfer-Encoding');headers.set('Content-Length',String(bytes.byteLength));
   response=new Response(bytes,{status:response.status,headers});
  }
  if(response.ok&&!response.redirected&&!new URL(event.request.url).search)event.waitUntil(cache.put(path,response.clone()).catch(()=>{}));
  if(response.status<500)return response;
 }catch{}
 if(saved)return saved;
 const keys=await caches.keys();
 for(const key of keys.filter(k=>k.startsWith('sway-shell-')&&k!==SHELL).reverse()){
  const previous=await (await caches.open(key)).match(path);if(previous)return previous;
 }
 return (path==='/'&&await cache.match('/offline.html'))||Response.error();
}

async function savedResponse(request,path){
 const cache=await caches.open(offlineCache),response=await cache.match(path);
 if(!response)return new Response(null,{status:404});
 const headers=new Headers(response.headers),range=request.headers.get('Range');
 if(request.method==='HEAD')return new Response(null,{headers});
 if(!range||!path.startsWith(offlineRoot+'audio/'))return response;
 const match=/^bytes=(\d{0,16})-(\d{0,16})$/.exec(range);
 const size=Number(headers.get('Content-Length'));
 if(!Number.isSafeInteger(size)||size<1)return response;
 const first=match?.[1],last=match?.[2];
 const start=first?Number(first):Math.max(0,size-Number(last));
 const end=first&&last?Math.min(size-1,Number(last)):size-1;
 if(!match||(!first&&!last)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){
  response.body?.cancel().catch(()=>{});
  return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size,'Accept-Ranges':'bytes'}});
 }
 const blob=await response.blob();
 headers.set('Content-Range','bytes '+start+'-'+end+'/'+size);
 headers.set('Content-Length',String(end-start+1));
 return new Response(blob.slice(start,end+1),{status:206,headers});
}
self.addEventListener('fetch',e=>{
 const request=e.request,u=new URL(request.url);
 if(u.origin!==self.location.origin)return;
 if(request.method==='GET'&&u.pathname.startsWith('/media/')){e.respondWith(fetchMedia(request));return;}
 if((request.method==='GET'||request.method==='HEAD')&&u.pathname.startsWith(offlineRoot)){
  const kind=u.pathname.slice(offlineRoot.length).split('/')[0];
  if(kind==='audio'||kind==='art'||kind==='lyrics')e.respondWith(savedResponse(request,u.pathname));
  else e.respondWith(new Response(null,{status:404}));
  return;
 }
 if(request.method==='GET'&&/^\/lyrics\/.+\.json$/.test(u.pathname)){
  e.respondWith((async()=>{
   let response;try{response=await fetch(request);if(response.ok&&response.headers.get('Content-Type')?.includes('application/json'))return response;}catch{}
   const cache=await caches.open(offlineCache);let id;try{id=decodeURIComponent(u.pathname.slice(8,-5));}catch{return response||Response.error();}
   return await cache.match(offlineRoot+'lyrics/'+encodeURIComponent(id))||response||new Response(null,{status:404});
  })());return;
 }
 if(request.method==='GET'&&(core.has(u.pathname)||isTransferAsset(u.pathname)))e.respondWith(shellResponse(e,u.pathname));
});
