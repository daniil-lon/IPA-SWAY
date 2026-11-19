import {offlineCache,offlineRoot} from './offline-storage.js';

const SHELL='sway-shell-v18';
const shellPaths=['/native-audio.js','/catalog-loader.js','/smart-search.js','/listening-account.js','/listening-stats.js','/next-stage.css','/','/offline.html','/manifest.webmanifest',
 '/style.css','/mobile.css','/wave.css','/browse.css','/player.css','/sway-glass.css','/sway-reference.css',
 '/app.js','/discovery.js','/cover-colors.js','/motion.js','/player-scene.js','/music-sources.js','/audio-transition.js','/system-media.js','/equalizer.js',
 '/wave.js','/wave-deck.js','/wave-light.js','/wave-mark.js','/profile-ui.js','/haptics.js','/offline-storage.js',
 '/taste-ui.js','/taste.css','/lyrics.js','/lyrics.css','/playlists.js','/playlist-match.js','/collection.css',
 '/sleep-timer.js','/wave-filters.js','/share-card.js','/pwa-prompt.js','/listening-tools.js','/loudness.js','/admin-client.js',
 '/art/logo.svg','/art/logo-burst.webp','/art/icon-maskable-512.png','/art/chart.svg','/art/commons.svg','/art/wave-party.svg','/art/wave-flower.svg','/art/wave-bolt.svg','/art/wave-rap.svg','/art/wave-night.svg','/art/icon-180.png','/art/icon-192.png','/art/icon-512.png'];
const core=new Set(shellPaths);

self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 await cache.addAll(shellPaths.map(path=>new Request(path,{cache:'reload'})));
 await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith('tonika-offline-')||(k.startsWith('sway-shell-')&&k!==SHELL)).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));

async function shellResponse(event,path){
 const cache=await caches.open(SHELL);
 try{
  const response=await fetch(event.request);
  if(response.ok&&!response.redirected&&!new URL(event.request.url).search)event.waitUntil(cache.put(path,response.clone()).catch(()=>{}));
  if(response.status<500)return response;
 }catch{}
 return (await cache.match(path))||(path==='/'&&await cache.match('/offline.html'))||Response.error();
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
 if(request.method==='GET'&&core.has(u.pathname))e.respondWith(shellResponse(e,u.pathname));
});
