import {nativeAndroid,connectNativeAudio,nativeEqualizer,nativeQueue,nativeRepeat} from './native-audio.js';
import {loadCatalog} from './catalog-loader.js';
import {searchTracks,normalizeSearch} from './smart-search.js';
import {createListeningAccount} from './listening-account.js';
import {mountListeningStats} from './listening-stats.js';
import { initAdminClient, renderPromo, renderEditorial } from './admin-client.js';
import { setSleepTimer, setSleepTimerAfterTracks, cancelSleepTimer, getSleepTimerStatus, onTimerUpdate, checkTrackEndSleep, isEndOfTrackSleep, sleepFadeSeconds } from './sleep-timer.js';
import { loadWaveFilters, saveWaveFilters, applyWaveFiltersToPool, MOOD_OPTIONS, CHARACTER_OPTIONS, LANGUAGE_OPTIONS, ENERGY_OPTIONS } from './wave-filters.js';
import {downloadPolicy,connectionAllows,downloadFits,queueSnapshot,mountQueueDrag} from './listening-tools.js';
import { shareTrack } from './share-card.js';
import { initPwaPrompt, isStandaloneApp, offerInstall, requestInstall } from './pwa-prompt.js';
import {rankWave,readWaveHistory,recordWaveSignal,deckRecommendations,recommendationTitle,relatedMix} from './wave.js';
import {mountWaveDeck} from './wave-deck.js';
import {availableStations,waveStations} from './wave-stations.js';
import {mountWaveLight,getTrackAccents,waveSurface} from './wave-light.js';
import {artistCredits,canonical,chartHue,chartPeriod,genreOf,genreOptions,newReleases,tagCatalog,tracksInMix} from './discovery.js';
import {similarArtists,artistRadio,latestRelease,releaseTimestamp} from './music-intelligence.js';
import {equalizerBands,equalizerLimit,makeEqualizer,equalizerPresets} from './equalizer.js';
import {dismissLayer,makeSwipe,motionAllowed} from './motion.js';
import {dragPlayerScene,mountPlayerScene,prepareArtwork,playerSurface} from './player-scene.js';
import {mergeMusic,parseYandexLink,restoreCommonsTrack,searchCommons} from './music-sources.js';
import {createSystemMedia,isIOS} from './system-media.js';
import {makeTransition,transitionSeconds} from './audio-transition.js';
import {installPlaybackRecovery} from './playback-recovery.js';
import {createProgressivePlayback} from './progressive-playback.js';
import {feedback,supportsHaptics} from './haptics.js';
import {downloadableAudio,offlineURL,readOfflineAudio,readOfflineTracks,removeOfflineTrack,saveOfflineTrack,supportsOffline} from './offline-storage.js';
import {signInView,profileCard,editorView,mountProfileSongPicker,resizeProfileImage,yandexAvatarPath} from './profile-ui.js';
import {mountTaste,tasteView} from './taste-ui.js';
import {mountLyrics} from './lyrics.js';
import {createPlaylists} from './playlists.js';
import {createPlaybackMetrics} from './playback-metrics.js';
import {createTrackReporter} from './track-report.js';
import {matchPlaylist,parseTrackList} from './playlist-match.js';
import {mountRowGestures} from './row-gestures.js';
import {createRussiaChart} from './russia-chart.js';
// Promo attribution: remember the first ?src= label (tg_post, tg_story, tg_bot…), count one visit per
// session and one install. iOS gives home-screen apps their own storage, so installs count as «installed».
{
 const read=key=>{try{return localStorage.getItem(key);}catch{return null;}},write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
 const params=new URLSearchParams(location.search),label=(params.get('src')||params.get('utm_source')||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,32);
 if(label&&!read('tonika.source'))write('tonika.source',label);
 if(params.has('src')||params.has('utm_source')){params.delete('src');params.delete('utm_source');const rest=params.toString();try{history.replaceState(history.state,'',location.pathname+(rest?'?'+rest:'')+location.hash);}catch{}}
 const beacon=(source,kind)=>{try{navigator.sendBeacon?.('/api/visit',new Blob([JSON.stringify({source,kind})],{type:'application/json'}));}catch{}};
 const source=label||read('tonika.source');let counted=false;
 try{counted=sessionStorage.getItem('tonika.visit')==='1';sessionStorage.setItem('tonika.visit','1');}catch{}
 if(source&&!counted)beacon(source,'visit');
 if((matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)&&!read('tonika.install-counted')){write('tonika.install-counted','1');beacon(source||'installed','install');}
}
// Script failures on real phones are otherwise invisible: send a handful per visit to the server log.
{
 let sent=0;const seen=new Set();
 const report=(message,stack)=>{
  const text=String(message||'').slice(0,300),key=text+'|'+String(stack||'').slice(0,80);
  if(!text||sent>=5||seen.has(key)||!navigator.sendBeacon)return;seen.add(key);sent++;
  const body={message:text,stack:String(stack||'').slice(0,1200),page:location.hash.slice(0,60),standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true};
  try{navigator.sendBeacon('/api/client-error',new Blob([JSON.stringify(body)],{type:'application/json'}));}catch{}
 };
 addEventListener('error',e=>{if(e instanceof ErrorEvent)report(e.message,e.error?.stack||e.filename+':'+e.lineno);});
 addEventListener('unhandledrejection',e=>{const r=e.reason;if(r?.name!=='AbortError')report(r?.message||r,r?.stack);});
}
document.addEventListener('error',event=>{
 const img=event.target;if(!(img instanceof HTMLImageElement))return;
 if(img.hasAttribute('data-account-avatar')||img.classList.contains('mx-artist-photo'))img.hidden=true;
 if(img.hasAttribute('data-player-art-fallback')){
  const source=img.getAttribute('src'),fallback=img.dataset.playerArtFallback;
  if(fallback&&fallback!==source){img.dataset.playerArtFallback='/art/logo.svg';img.src=fallback;}
  else if(source!=='/art/logo.svg'){img.dataset.playerArtFallback='';img.src='/art/logo.svg';}
  else{img.removeAttribute('data-player-art-fallback');img.style.visibility='hidden';}
 }
},true);

const icons={
forward:'<path d="m9 5 7 7-7 7"/>',
logout:'<path d="M13 4h6v16h-6m-3-12-4 4 4 4m-4-4h11"/>',
personal:'<path d="M12 17.4 4.8 11a4.4 4.4 0 1 1 7.2-5 4.4 4.4 0 1 1 7.2 5zM2.7 17.6c1.4 3.4 5.4 4.4 9.3 4.4s7.9-1 9.3-4.4"/>',
back:'<path d="m15 5-7 7 7 7"/>',
chevron:'<path d="m5 9 7 7 7-7"/>',
spark:'<path d="M12 1v22M1 12h22M4 4l16 16M20 4 4 20M8 2l8 20M2 8l20 8M16 2 8 22M2 16l20-8"/>',
 'wave-mark':'<path fill="none" stroke-width="2.2" d="M2 8.4c3.1-4.5 6.7-4.5 10 0 3.4 4.6 7.2 4.6 10 0m-20 7.2c3.1-4.5 6.7-4.5 10 0 3.4 4.6 7.2 4.6 10 0"/>',
glint:'<path fill="currentColor" stroke="none" d="M11 1c.6 6 3.2 9 9 10-5.8.9-8.4 3.7-9 10-.7-6.3-3.5-9-9-10 5.5-1 8.3-4 9-10zM19 0c.2 2.5 1.5 3.7 4 4-2.5.4-3.8 1.6-4 4-.4-2.5-1.6-3.6-4-4 2.4-.3 3.6-1.5 4-4z"/>',
music:'<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="5.5" cy="18" rx="3.5" ry="2.5"/><ellipse cx="17.5" cy="16" rx="3.5" ry="2.5"/>',
disc:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M6.5 12a5.5 5.5 0 0 1 5.5-5.5m5.5 5.5a5.5 5.5 0 0 1-5.5 5.5"/>',
history:'<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v6l3 2"/>',
bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
shapes:'<circle cx="6" cy="7" r="3"/><path d="M14 4h6v6h-6zM3 20l3-6 3 6zm11-4 3-2 3 2v4h-6z"/>',
share:'<path d="M12 14V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/>',
edit:'<path d="M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8m-9 3 1-4 7.2-7.2 3 3L14 13z"/>',
more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
home:'<path d="M2.5 10.2 12 2.9l9.5 7.3v9.4a1.5 1.5 0 0 1-1.5 1.5h-5v-6.9H9v6.9H4a1.5 1.5 0 0 1-1.5-1.5z"/>',
search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
library:'<rect x="3" y="4" width="14" height="16" rx="2"/><path d="M7 8h6m-6 4h6m7-5 1 12"/>',
heart:'<path d="M12 20.5 3.9 13C1.7 10.9 1.1 7.5 3.4 5.4c2.2-2 5.5-1.3 8.6 1.8 3.1-3.1 6.4-3.8 8.6-1.8 2.3 2.1 1.7 5.5-.5 7.6Z"/>',
settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="#211730"/><circle cx="15" cy="12" r="2" fill="#211730"/><circle cx="10" cy="18" r="2" fill="#211730"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/>',
download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
user:'<circle cx="12" cy="8" r="3.4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
play:'<path fill="currentColor" stroke="none" d="M8 4.8c0-.7.7-1.1 1.3-.8l10.4 7.2a.95.95 0 0 1 0 1.6L9.3 20c-.6.4-1.3 0-1.3-.8z"/>',
pause:'<path stroke-width="3.4" d="M8.5 5.5v13m7-13v13"/>',
prev:'<path fill="currentColor" stroke="none" d="M17.5 5.3 7.4 12l10.1 6.7z"/><path d="M5.5 5.5v13"/>',
next:'<path fill="currentColor" stroke="none" d="m6.5 5.3 10.1 6.7-10.1 6.7z"/><path d="M18.5 5.5v13"/>',
repeat:'<path d="m17 2 3 3-3 3M20 5H8a4 4 0 0 0-4 4m3 13-3-3 3-3m-3 3h12a4 4 0 0 0 4-4"/>',
'repeat-one':'<path d="m17 2 3 3-3 3M20 5H8a4 4 0 0 0-4 4m3 13-3-3 3-3m-3 3h12a4 4 0 0 0 4-4"/><path d="M10.6 10.4 12.4 9v6"/>',
shuffle:'<path d="M3 6h3c3 0 4 3 6 6s3 6 6 6h3m-4-4 4 4-4 4M3 18h3c3 0 4-3 6-6s3-6 6-6h3m-4-4 4 4-4 4"/>',
queue:'<path d="M4 6h16M4 11h16M4 16h9m5-2v6m-3-3h6"/>',
list:'<path d="M8 5.5h13M8 12h13M8 18.5h13"/><circle cx="3.3" cy="5.5" r=".85"/><circle cx="3.3" cy="12" r=".85"/><circle cx="3.3" cy="18.5" r=".85"/>',
'next-up':'<path d="m6 3 6 6 6-6M4 13h16M4 18h16"/>',
less:'<path d="m3 3 18 18M7.5 5.2a4.4 4.4 0 0 1 4.5 1.5 4.7 4.7 0 0 1 7.6 5.5l-2 2M3.9 8.7A4.6 4.6 0 0 0 5 13.3l7 6.9 2.5-2.5"/>',
equalizer:'<path d="M4 15v4m0-14v6m8-5V3m0 8v10m8-17v9m0 4v3M2 12.7h4m4-4h4m4 6.4h4"/>',
volume:'<path d="M3 9v6h4l5 4V5L7 9zM15 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
mute:'<path d="M3 9v6h4l5 4V5L7 9zm13 1 4 4m0-4-4 4"/>',
close:'<path d="m6 6 12 12M18 6 6 18"/>',
wave:'<path d="M2 13h3l2-5 3 9 4-13 3 16 2-7h3"/>',
shake:'<path d="m2 20 2-7 6 2 2-7 6 2 3-8m-5 2 5-2 1 5"/>',
undo:'<path d="m9 4-6 5 6 5M3 9h11a6 6 0 0 1 0 12h-4"/>',
arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
check:'<path d="m5 12 4.5 4.5L19 7"/>'
,lyrics:'<path d="M3 5h10M8 5v14m6-9h7m-7 4h7m-7 4h7"/>',
moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'
,expand:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>'
};
const icon=n=>'<i data-icon="'+n+'"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[n]+'</svg></i>';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
for(const el of $$('i[data-icon]')) el.outerHTML=icon(el.dataset.icon);
function load(k, fallback){try{return JSON.parse(localStorage.getItem('tonika.'+k))??fallback;}catch{return fallback;}}
function save(k,v){try{localStorage.setItem('tonika.'+k,JSON.stringify(v));}catch{}}
const moods=[['focus','Для фокуса','cover-1','Треки с мягкими акцентами.'],['calm','Спокойно','cover-0','Ровное звучание, чтобы немного выдохнуть.'],['night','После полуночи','cover-3','Более тёмное и мягкое звучание.'],['bright','Легче','cover-2','Лёгкие ритмы и музыка на подъём.']];
let catalogSettled=false;
let tracks=[], map=new Map(), queue=[], current=null, search='', playing=false, starting=false, playRequest=0, playMode='', shuffle=false, repeat='off', unshuffled=null, queueSource='', travel=1;
let page='home', mood=null, user=null, loginConfigured=false, loginRequired=true, accountReady=false, accountOffline=false;
let accountProfile=null, profileJob=null, editDraft=null;
let offlineTracks=new Map(),offlineMode=false,manualOffline=load('offline-mode',false)===true,offlineBatch=null,offlineStatus='';
let autoCacheLikes=load('auto-cache-likes',true)!==false,likedCacheTimer=0;
let downloadPrefs=downloadPolicy(load('download-policy',{})),normalizeVolume=load('normalize-volume',true)!==false,restoringQueue=false,queueOwner='guest',lastQueueSave=0;
const lessTracks=new Set(load('less-tracks',[]));
const offlineFailed=new Map();
const offlineJobs=new Map();
const offlineReservations=new Map();
let waveMood='', waveMix=null, waveExplorer=false, waveDeckKey='calm', waveDeckSlot=1, deckUI=null, deckLifetime=null, suggestions=null;
let waveHistory=readWaveHistory(load('wave-history',[])), listening={position:null,seconds:0,recorded:false};
let recentTracks=load('recent-tracks',[]);if(!Array.isArray(recentTracks))recentTracks=[];
const pendingLikes=new Set();
let guest={volume:.8,autoplay:true,crossfade:true,motion:true,...load('prefs',{})}, prefs={...guest};
const preferredGenres=new Set((Array.isArray(load('preferred-genres',[]))?load('preferred-genres',[]):[]).slice(0,5));
const preferredArtists=new Set((Array.isArray(load('preferred-artists',[]))?load('preferred-artists',[]):[]).slice(0,150));
let tasteLifetime=null,tasteWrites=Promise.resolve();
let liveStats=null, rankedChart=null, chartJob=null, chartError=false, chartTime=0, chartTimer;
const offlineOnly=()=>offlineMode||manualOffline;
let hapticsEnabled=load('haptics',true)!==false;
const pulse=(kind,event,target)=>feedback(kind,{event,target,enabled:hapticsEnabled});
const onDeviceLikes=new Set(load('commons-likes',[]));
let likes=new Set([...load('likes',[]),...onDeviceLikes]), timer, installation, modal='', infoTrack=null, authError='';
let audio=$('#audio');
const audioElements=[audio,$('#audio-next')], main=$('#main'), dialog=$('#dialog'), sheet=$('#sheet'), editor=$('#profile-editor');
const playbackMetrics=createPlaybackMetrics(audioElements,()=>audio);
// Listener counter for the admin panel: a random id per browser (no name, no IP), pinged while music plays.
{
 let visitor='',lastPing=0;
 try{visitor=localStorage.getItem('sway.visitor')||'';if(!/^[a-f0-9]{32}$/.test(visitor)){visitor=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('sway.visitor',visitor);}}catch{}
 const ping=(force=false)=>{
  if(!visitor||!playing||!current||offlineOnly()||navigator.onLine===false)return;
  if(!force&&Date.now()-lastPing<110000)return;
  if(force&&Date.now()-lastPing<60000)return;
  lastPing=Date.now();
  let source='';try{source=localStorage.getItem('tonika.source')||'';}catch{}
  const app=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  try{navigator.sendBeacon?.('/api/listen',new Blob([JSON.stringify({visitor,track:current.id,source,app})],{type:'application/json'}));}catch{}
 };
 for(const element of audioElements)element.addEventListener('playing',()=>setTimeout(()=>ping(true),1500));
 setInterval(ping,30000);
 // A track counts toward the public chart after 30 seconds of real listening, once per play.
 let heardId='',heard=0,heardAt=0,counted=false;
 for(const element of audioElements)element.addEventListener('timeupdate',()=>{
  if(!current||!playing)return;
  const now=performance.now();
  if(current.id!==heardId){heardId=current.id;heard=0;counted=false;heardAt=now;return;}
  heard+=Math.min(1.5,Math.max(0,(now-heardAt)/1000));heardAt=now;
  if(counted||heard<30)return;
  counted=true;myMonthPlays(current.id);
  if(navigator.onLine===false)return;
  if(visitor)try{navigator.sendBeacon?.('/api/listen',new Blob([JSON.stringify({visitor,track:current.id,play:true})],{type:'application/json'}));}catch{}
 });
}
// "Твой топ месяца": counted plays (30+ seconds) for the current month, stored on this device only.
function myMonthPlays(id){
 const month=new Date().toISOString().slice(0,7);
 let data={month,counts:{}};
 try{const saved=JSON.parse(localStorage.getItem('sway.myplays')||'null');if(saved?.month===month&&saved.counts)data=saved;}catch{}
 if(id){data.counts[id]=(data.counts[id]||0)+1;try{localStorage.setItem('sway.myplays',JSON.stringify(data));}catch{}}
 return data.counts;
}
function myTopMonth(limit=5){
 const counts=myMonthPlays();
 return Object.entries(counts).filter(([id])=>map.has(id)).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id,plays])=>({track:map.get(id),plays}));
}
const reportTrack=createTrackReporter({api,html,icon,metrics:playbackMetrics});
const fullClose=dialog.querySelector('.dialog-close');
let lyricsUI=null,lyricsLifetime=null,lyricsMode='off';
fullClose.addEventListener('click',event=>{if(lyricsUI?.collapse()){event.preventDefault();event.stopPropagation();}});
const intendsPlayback=()=>playing||starting;
const nativeAudio=isIOS(), canPlay=mime=>!!audio.canPlayType(mime);
const canDownload=t=>supportsOffline()&&!!downloadableAudio(t,canPlay);
const playbackURL=t=>!nativeAndroid&&offlineTracks.has(t.id)&&navigator.serviceWorker?.controller?offlineURL('audio',t.id):t.audio;
let savedAudioObject=null;
function releaseSavedAudio(keep){
 if(savedAudioObject&&savedAudioObject.url!==keep){URL.revokeObjectURL(savedAudioObject.url);savedAudioObject=null;}
}
connectNativeAudio(audioElements);
const progressive=nativeAndroid?null:createProgressivePlayback(audioElements);
if(!nativeAndroid)installPlaybackRecovery(audioElements,{progressive});
const eq=nativeAndroid?nativeEqualizer(audioElements,load('equalizer',{})):makeEqualizer(audioElements,load('equalizer',{}));
const transitions=makeTransition(audioElements,{mixer:eq,crossfade:()=>prefs.crossfade,onCommit:commitTransition,sourceFor:(t,element)=>progressive?.sourceFor(element,playbackURL(t),t.seconds)||playbackURL(t),getCurrent:()=>current,getAccents:getTrackAccents});
let plannedNext=null;
let embedActive=false, savedRemote=load('commons-tracks',[]);
const storedEmbeds=load('yandex-links',[]);
const savedEmbeds=new Map((Array.isArray(storedEmbeds)?storedEmbeds:[]).flatMap(url=>{
 const entry=parseYandexLink(url);return entry?[[entry.original,entry]]:[];
}));
const systemMedia=createSystemMedia(audioElements,()=>audio,{play:()=>{if(current&&audio.paused)play(current,undefined,playMode);},pause:pausePlayback,stop:pausePlayback,previoustrack:()=>step(-1),nexttrack:()=>step(1),seekto:({seekTime,fastSeek})=>seekPlayback(seekTime,fastSeek),seekbackward:({seekOffset=15}={})=>seekPlayback(audio.currentTime-seekOffset),seekforward:({seekOffset=15}={})=>seekPlayback(audio.currentTime+seekOffset)});
function rememberRemote(t){
 if(!t?.provider)return;
 savedRemote=[t,...savedRemote.filter(x=>x?.id!==t.id)].filter((x,i)=>i<80||onDeviceLikes.has(x.id));
 save('commons-tracks',savedRemote);
}
function notice(text){
 const el=$('#notice');if(!el)return;
 const owner=sheet.open?sheet:editor.open?editor:dialog.open?dialog:document.body;
 if(el.parentElement!==owner)owner.append(el);
 el.textContent=text;el.dataset.visible='true';clearTimeout(timer);
 timer=setTimeout(()=>{el.textContent='';delete el.dataset.visible;},3600);
}
const toast=notice;
function playbackSnapshot(){const at=queue.indexOf(current?.id),from=Math.max(0,at-100);return current?{queue:queue.slice(from,from+2000),current:current.id,position:audio.currentTime,mode:playMode,shuffle,repeat,original:shuffle&&unshuffled?unshuffled.slice(0,2000):null,source:queueSource,nextUp,waveMood,waveMix}:null;}
const warmedArt=new Set();
function persistQueue(){
 if(restoringQueue||!current)return;
 save('queue.'+queueOwner,playbackSnapshot());
 if(navigator.onLine!==false){for(const id of queue.slice(queue.indexOf(current.id)+1,queue.indexOf(current.id)+4)){const t=map.get(id);if(t?.art&&!warmedArt.has(t.art)){const image=new Image();image.decoding='async';image.src=t.art;warmedArt.add(t.art);}}if(warmedArt.size>60)warmedArt.clear();}
 save('queue-owner',queueOwner);
 accountListening?.changed();
 if(nativeAndroid){const at=queue.indexOf(current.id);nativeRepeat(repeat);nativeQueue(audio,tracksFrom(at<0?[current.id]:repeat==='all'?[...queue.slice(at),...queue.slice(0,at)]:queue.slice(at)));}
}
const recentKey=()=>`recent-tracks.${user?.id||(offlineMode?load('queue-owner','guest'):'guest')}`;
function restoreRecentHistory(){const legacy=!user&&load('queue-owner','guest')==='guest'?load('recent-tracks',[]):[];recentTracks=load(recentKey(),legacy);if(!Array.isArray(recentTracks))recentTracks=[];}
const accountListening=createListeningAccount({api,getUser:()=>user,getSnapshot:playbackSnapshot,applySnapshot:async snapshot=>{pausePlayback();current=null;save('queue.'+queueOwner,snapshot);await restoreQueue();render();},onHistory:ids=>{recentTracks=[...new Set([...recentTracks,...ids])].slice(0,200);save(recentKey(),recentTracks);},onChange:()=>{if(accountReady&&tracks.length)renderResume();}});
function renderResume(){
 document.querySelector('.account-resume')?.remove();const r=accountListening.remote;if(!r||!map.has(r.snapshot?.current))return;
 const bar=document.createElement('div');bar.className='account-resume';bar.innerHTML='<span>Продолжить «'+html(map.get(r.snapshot.current).title)+'» с другого устройства?</span><button class="btn primary" type="button" data-account-resume>Продолжить</button><button class="btn" type="button" data-account-keep>Остаться здесь</button>';main.prepend(bar);bar.querySelector('[data-account-resume]').onclick=()=>accountListening.resume();bar.querySelector('[data-account-keep]').onclick=()=>accountListening.keep();
}
async function restoreQueue(){
 if(current)return;
 queueOwner=user?.id||(offlineMode?load('queue-owner','guest'):'guest');
 const raw=load('queue.'+queueOwner,null);if(!catalogSettled&&raw?.queue?.some(id=>!map.has(id)))return;
 const saved=queueSnapshot(raw,new Set(map.keys()));if(!saved)return;
 restoringQueue=true;
 try{
  const target=map.get(saved.current);await play(target,tracksFrom(saved.queue),saved.mode,1,{start:false});
  shuffle=saved.shuffle;unshuffled=saved.shuffle?saved.original:null;queueSource=saved.source;repeat=saved.repeat;nextUp=saved.nextUp;waveMood=saved.waveMood;waveMix=saved.waveMix;
  const element=audio,seek=()=>{if(current===target&&audio===element&&Number.isFinite(element.duration))element.currentTime=Math.min(saved.position,Math.max(0,element.duration-.1));};
  if(element.readyState)seek();else element.addEventListener('loadedmetadata',seek,{once:true});sync();
 }finally{restoringQueue=false;}
}
function reorderQueue(ids){
 const at=queue.indexOf(current?.id),remaining=queue.slice(at+1),allowed=new Set(remaining);
 const order=[...new Set(ids.filter(id=>allowed.has(id)))];for(const id of remaining)if(!order.includes(id))order.push(id);
 queue=[...queue.slice(0,at+1),...order];nextUp=order[0]||'';invalidateFade();persistQueue();
}
async function api(path,method='GET',data={},signal){
 const response=await fetch(path,method==='GET'?{signal}:{method,signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:['/api/playback','/api/listening'].includes(path)&&JSON.stringify(data).length<60000});
 if(!response.ok){
  const detail=await response.json().catch(()=>({}));
  if(response.status===401&&user&&loginRequired)clearAccount('Войди снова, чтобы продолжить слушать.');
  throw Object.assign(new Error(String(response.status)),{status:response.status,code:detail?.error});
 }
 return response.status===204?null:response.json();
}
function tracksFrom(ids){return ids.map(x=>map.get(x)).filter(Boolean);}
function time(n){return Number.isFinite(n)?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'–:––';}
const button=(name,label,attr='',classes='icon')=>'<button type="button" class="'+classes+'" aria-label="'+html(label)+'" '+attr+'>'+icon(name)+'</button>';
const art=t=>'<img src="'+html(t.art)+'" alt="">';
const download=t=>canDownload(t)?button(offlineTracks.has(t.id)?'check':'download',offlineTracks.has(t.id)?'Удалить из скачанного: '+t.title:'Скачать в Sway: '+t.title,'data-offline-toggle="'+html(t.id)+'"'+(offlineJobs.has(t.id)||!offlineTracks.has(t.id)&&(offlineOnly()||navigator.onLine===false)?' disabled':''),'icon offline-toggle'+(offlineTracks.has(t.id)?' saved':'')):'';
const row=(t,compact=false)=>'<article class="row" data-row="'+t.id+'"><button class="row-track" type="button" data-play="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'"><span class="row-art">'+art(t)+'</span><div><strong>'+html(t.title)+(t.isExplicit?' <span class="badge-e" aria-label="Explicit" title="Ненормативная лексика">E</span>':'')+'</strong><small>'+html(t.artist)+(t.provider?' <span class="source-tag">Commons</span>':'')+'</small></div></button><div class="row-actions"><small>'+time(t.seconds)+'</small>'+(compact?button('more','Действия с треком «'+t.title+'»','data-info-track="'+t.id+'"'):button('heart','Мне нравится','data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+playlists.quickButton(t,button)+button('plus','Добавить в очередь','data-add="'+t.id+'"'))+'</div></article>';
const rows=(items,compact=false)=>items.length?'<div class="rows">'+items.map(t=>row(t,compact)).join('')+'</div>':'<div class="panel"><p class="quiet">Здесь пока нет треков.</p></div>';
const russiaChart=createRussiaChart({html,icon,getTracks:()=>tracks,isOffline:()=>offlineOnly()||navigator.onLine===false,onChange:()=>{if(page!=='discover')return;const section=location.hash.split('/')[1];const slot=!section&&$('#discover-russia');if(slot){if(!slot.contains(document.activeElement))slot.innerHTML=russiaChart.shelf();}else if(section==='russia')renderWhenIdle();},onPlay:id=>{const t=map.get(id);if(t)play(t,[t],'track');},onPreviewStart:()=>{if(playing)pausePlayback();}});
for(const element of audioElements)element.addEventListener('play',()=>russiaChart.stop());
const playlists=createPlaylists({api,icon,html,getTracks:()=>[...map.values()],getUser:()=>user,isOffline:()=>offlineOnly()||navigator.onLine===false,onChange:()=>{if(page==='library')render();},onPlay:(ids,name)=>{const items=tracksFrom(ids);if(items.length){play(items[0],items,'playlist');if(name)queueSource=name;}},rows,header:(title,href)=>shelfHeader(title,backLink(href)),notice,reactionButton});
const card=t=>'<article class="track-card"><button class="card-art" type="button" data-play="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'">'+art(t)+icon('play')+'</button><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></article>';
const head=(label,title,desc)=>'<header class="page-head"><div class="kicker">'+label+'</div><h1>'+title+'</h1><p>'+desc+'</p></header>';
const waveSelection=()=>'<button class="wave-selection" type="button" data-action="wave-reset" hidden><span></span>'+icon('close')+'</button>';
const waveCanvas='<canvas class="wave-light" aria-hidden="true"></canvas>';
const tiles=()=>'<div class="tiles">'+moods.map(([id,title,img])=>'<a class="tile" href="#mood/'+id+'"><img alt="" src="/art/'+img+'.svg"><b>'+title+'</b></a>').join('')+'</div>';
// Rotation and screen size keep the same Sway interface.
const mobile=matchMedia('(min-width:0px)');
let searchTab='popular', searchBack='#home', favoriteMood='', discoverMixTab='top', waveLight=null, nextUp='';
function setCoverColors(el,t){
 if(!el||!t||el.dataset.coverTrack===t.id)return;
 const [h,s,l,a]=t.palette||[271,53,36,299];
 el.style.setProperty('--cover-h',h);el.style.setProperty('--cover-s',s+'%');el.style.setProperty('--cover-l',l+'%');el.style.setProperty('--cover-a',a);
 el.style.setProperty('--wave-surface',waveSurface(t));
 el.style.setProperty('--cover-surface',playerSurface(t));
 el.style.setProperty('--cover-art','url('+JSON.stringify(t.art||'')+')');
 el.dataset.coverTrack=t.id;
 const cover=prepareArtwork(t.art);
 if(!cover.loaded)cover.promise.then(ok=>{if(ok&&el.isConnected&&el.dataset.coverTrack===t.id){el.style.setProperty('--cover-surface',playerSurface(t));syncChrome();}});
}
const isWaveMode=()=>['wave','track-wave'].includes(playMode);
// "Playing from" names the list a queue was started from, like the header of a system player queue.
function describeSource(mode){
 const [section,value]=location.hash.slice(1).split('/');
 const named=fn=>{try{return fn(decodeURIComponent(value||''))||'';}catch{return '';}};
 if(mode==='track-wave')return 'Волна по треку';
 if(mode==='wave')return '';
 if(mode==='likes')return 'Мне нравится';
 if(mode==='chart')return 'Чарт Sway';
 if(mode==='offline')return 'Скачанное';
 if(section==='album')return named(id=>resolveAlbum(id)?.title);
 if(section==='artist')return named(slug=>resolveArtist(slug)?.name);
 if(section==='search')return 'Поиск';
 if(section==='history')return 'История';
 if(section==='mood')return mood?.[1]||'';
 if(section==='discover')return value==='releases'?'Новинки':value==='trends'?'Тренды':'Что послушать';
 if(section==='liked')return 'Мне нравится';
 return '';
}
const sourceName=()=>isWaveMode()&&playMode==='wave'?waveName():queueSource||'';
const waveName=()=>waveMix?.title||moods.find(m=>m[0]===waveMood)?.[1]||'Моя волна';
const selectedMixKey=()=>isWaveMode()?(waveMix?.key||waveMood):'';
const waveVisual=t=>isWaveMode()&&waveMix?.palette?{...t,palette:waveMix.palette,visualKey:waveMix.key}:t;
const recommendOptions=()=>({likes,history:waveHistory,preferredGenres,preferredArtists});
function applyTaste(value){
 preferredArtists.clear();preferredGenres.clear();
 for(const name of value?.artists||[])preferredArtists.add(name);
 for(const genre of value?.genres||[])preferredGenres.add(genre);
 save('preferred-artists',[...preferredArtists]);save('preferred-genres',[...preferredGenres]);refreshSuggestions();
}
async function persistTaste(value){
 const write=tasteWrites.catch(()=>{}).then(()=>user?api('/api/taste','PUT',value):value);
 tasteWrites=write;const result=await write;applyTaste(result);refreshWaveQueue();
}
const suggest=()=>suggestions??=deckRecommendations(tracks,recommendOptions());
let cachedDeck=null, deckRank=null;
function refreshSuggestions(){suggestions=null;cachedDeck=null;deckUI?.refresh();}
const backLink=(target='#home')=>'<a class="icon" href="'+target+'" aria-label="Назад">'+icon('back')+'</a>';
const navHeader=(title,left,right)=>'<header class="mx-head"><span>'+left+'</span><strong>'+title+'</strong><span>'+right+'</span></header>';
const searchLink='<a class="icon" href="#search" aria-label="Поиск">'+icon('search')+'</a>';
const collectionSearchLink='<a class="icon" href="#search/collection" aria-label="Поиск в коллекции">'+icon('search')+'</a>';
const profileLink='<a class="icon" href="#profile" aria-label="Профиль">'+icon('user')+'</a>';
function waveDeck(){
 const shortcut=(key,title,glyph)=>'<div data-deck-item="'+key+'" data-deck-shortcut class="wave-deck-item" hidden><button type="button" class="wave-deck-button" data-action="wave-'+key+'"><span class="wave-deck-glyph">'+icon(glyph)+'</span><span>'+title+'</span></button></div>';
 return '<section class="wave-deck-frame" aria-label="Подборки по настроению"><div class="wave-deck" tabindex="0" role="group" aria-label="Лента подборок">'+shortcut('usual','Назад к привычному','undo')+shortcut('shake','Встряхнуть Мою волну','shake')+'</div>'+button('back','Предыдущая подборка','data-deck-back','icon wave-deck-arrow')+button('forward','Следующая подборка','data-deck-next','icon wave-deck-arrow')+'</section>';
}
function waveDeckChoices(){
 const recommendation=suggest();
 if(cachedDeck&&deckRank===recommendation)return cachedDeck;
 const available=offlineOnly()?tracks.filter(t=>offlineTracks.has(t.id)):tracks;
 const choices=availableStations(available).map(station=>({...station,key:'station-'+station.key,attr:'data-wave-station="'+station.key+'"'}));
 const used=new Set();let count=0;
 for(const seed of recommendation){
  const name=artistCredits(seed.artist)[0],artist=resolveArtist(name);
  if(!artist||used.has(name)||artistRadio(available,artist).length<3)continue;
  used.add(name);const key='artist-'+artist.slug;
  choices.splice(Math.min(4+count*7,choices.length),0,{key,title:name,attr:'data-wave-artist="'+html(name)+'"',image:artist.art||seed.art,track:seed});
  if(++count===3)break;
 }
 deckRank=recommendation;return cachedDeck=choices;
}
function closestDeckSlot(key){
 const choices=waveDeckChoices(),index=choices.findIndex(item=>item.key===key);
 const previous=waveMix?.key===key&&waveMix.slot!=null?waveMix.slot:waveDeckSlot;
 const slot=index<0?previous:index+Math.round((previous-index)/choices.length)*choices.length;
 if(waveMix?.key===key)waveMix.slot=slot;
 return slot;
}
function deckCard(slot){
 const item=document.createElement('div');item.className='wave-deck-item';
 const choices=waveDeckChoices(), index=((slot%choices.length)+choices.length)%choices.length;
 const choice=choices[index]||{key:'usual',title:'Моя волна',attr:'data-action="wave-usual"',image:'/art/mood-focus.svg',color:'focus'};
 const {key,title,attr,image,track,color,emblem,palette}=choice;
 if(track){item.dataset.recommendation=track.id;setCoverColors(item,track);}
 if(color)item.dataset.moodColor=color;
 if(palette){const [h,s,,a]=palette;item.style.setProperty('--deck-light','hsl('+a+' '+s+'% 62%)');item.style.setProperty('--deck-mid','hsl('+h+' '+s+'% 37%)');item.style.setProperty('--deck-dark','hsl('+h+' 70% 9%)');}
 item.dataset.deckItem=key;
 const glyph=emblem?'<img class="wave-deck-glyph" src="/art/wave-'+emblem+'.svg" alt="" draggable="false">':'<img class="wave-deck-glyph'+(track?' wave-deck-avatar':'')+'" src="'+html(image)+'"'+(track?' data-player-art-fallback="'+html(track.art)+'"':'')+' alt="" draggable="false" decoding="async">';
 item.innerHTML='<button type="button" class="wave-deck-button" '+attr+' aria-label="'+html(title)+'" aria-pressed="'+(key===selectedMixKey())+'">'+glyph+(track?'<span class="deck-rec-copy"><small>В стиле артиста</small><b>'+html(title)+'</b></span>':'<span>'+html(title)+'</span>')+'</button>';
 return item;
}
const waveArtist=t=>artistCredits(t.artist).slice(0,3).join(', ')||t.artist;
// The wave hero stands the lead artist's portrait behind the cover; only real photos, never the logo fallback.
const wavePhoto=t=>resolveArtist((t.artists||artistCredits(t.artist))[0]||t.artist)?.art||'';
function setWavePhoto(img,t){
 const src=wavePhoto(t);img.hidden=!src;
 if(!src)img.removeAttribute('src');else if(img.getAttribute('src')!==src)img.src=src;
}
let currentStory = null, storyIndex = 0, storyTimer = null;
function storiesRail(){ return ''; }
function getStorySlides(storyKey){
 const topArtistName = tracks[0]?.artist || 'Sway';
 const artistObj = (typeof artistsData!=='undefined'&&artistsData?.find(a => a.name.toLowerCase() === topArtistName.toLowerCase())) || {name: topArtistName, image: '/art/logo-burst.webp'};
 const topThree = tracks.slice(0, 3);
 if(storyKey === 'vibe'){
  return [
   {capsule:'ТВОЙ ВАЙБ В SWAY',title:'Вечерний вайб',desc:'На этой неделе вы чаще всего слушали глубокие и атмосферные треки. Музыка звучала бархатно и вдумчиво.',bg:'radial-gradient(circle at 50% 35%, #ff0080 0%, #7928ca 45%, #05040a 85%)',art:'<img src="/art/logo-burst.webp" class="story-artist-art" alt="">',actionText:'Слушать похожую музыку',actionFn:'wave'},
   {capsule:'АРТИСТ НЕДЕЛИ',title:topArtistName,desc:'Звучал в ваших наушниках чаще других исполнителей.',bg:'radial-gradient(circle at 50% 35%, #ffd54f 0%, #ff5500 50%, #05040a 85%)',art:'<img src="'+html(artistObj.image||'/art/logo-burst.webp')+'" class="story-artist-art" alt="">',actionText:'Открыть артиста',actionFn:'artist'},
   {capsule:'ИТОГИ',title:'380 минут музыки',desc:'Вы в топ-15% самых преданных слушателей этой недели!',bg:'radial-gradient(circle at 50% 35%, #00f2fe 0%, #4facfe 50%, #05040a 85%)',art:'<div class="story-share-card"><strong>SWAY 2026</strong><p class="quiet">Твой персональный вайб сформирован</p></div>',actionText:'Поделиться в Telegram',actionFn:'share'}
  ];
 }
 if(storyKey === 'chart'){
  return [{capsule:'ЧАРТ НЕДЕЛИ',title:'Главные хиты',desc:'Песни, которые прямо сейчас разрывают чарт Sway.',bg:'radial-gradient(circle at 50% 35%, #ff007f 0%, #9d4edd 50%, #05040a 85%)',art:'<div class="story-share-card">'+topThree.map((t,i)=>'<div style="display:flex;align-items:center;gap:8px;width:100%"><span style="font-weight:bold;color:#ffd54f">'+(i+1)+'.</span><span style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+html(t.artist+' — '+t.title)+'</span></div>').join('')+'</div>',actionText:'Слушать весь чарт',actionFn:'chart'}];
 }
 if(storyKey === 'night'){
  return [{capsule:'НОЧНОЙ ЧИЛЛ',title:'Спокойствие и сон',desc:'Идеальные треки для поздних поездок на машине или ночного отдыха.',bg:'radial-gradient(circle at 50% 35%, #7928ca 0%, #1e1b4b 55%, #05040a 85%)',art:'<img src="/art/logo-burst.webp" class="story-artist-art" alt="">',actionText:'Включить ночную волну',actionFn:'mood:night'}];
 }
 if(storyKey==='shots'){
  return [{capsule:'ВИДЕОШОТЫ ИЗ ЯНДЕКС МУЗЫКИ',title:'Живая музыка',desc:'Короткие зацикленные видеоролики и анимированные обложки прямо в плеере Sway. Смотрите и слушайте одновременно!',bg:'radial-gradient(circle at 50% 35%, #00f2fe 0%, #ff0080 50%, #05040a 85%)',art:'<img src="/art/logo-burst.webp" class="story-artist-art" alt="">',actionText:'Слушать хиты с видеошотами',actionFn:'shots'}];
 }
 return [{capsule:'ДРАЙВ И ЭНЕРГИЯ',title:'Максимум сил',desc:'Бодрые биты для спорта, движения и отличного настроения.',bg:'radial-gradient(circle at 50% 35%, #ff0055 0%, #ff7700 50%, #05040a 85%)',art:'<img src="/art/logo-burst.webp" class="story-artist-art" alt="">',actionText:'Включить энергию',actionFn:'mood:energy'}];
}
function openStory(storyKey){
 currentStory = getStorySlides(storyKey);
 storyIndex = 0;
 let modal = document.getElementById('sway-story-modal');
 if(!modal){
  modal = document.createElement('div');
  modal.id = 'sway-story-modal';
  modal.className = 'story-modal';
  document.body.appendChild(modal);
 }
 modal.classList.remove('hidden');
 showStorySlide();
}
function closeStory(){
 clearTimeout(storyTimer);
 currentStory = null;
 const modal = document.getElementById('sway-story-modal');
 if(modal) modal.classList.add('hidden');
}
function showStorySlide(){
 clearTimeout(storyTimer);
 const modal = document.getElementById('sway-story-modal');
 if(!modal || !currentStory || !currentStory[storyIndex]) return closeStory();
 const slide = currentStory[storyIndex];
 modal.innerHTML = 
  '<div class="story-bg" style="background: '+slide.bg+'"></div>'+
  '<div class="story-bars">'+
    currentStory.map((_, i) => 
      '<div class="story-bar"><div class="story-bar-fill" style="width: '+(i < storyIndex ? '100%' : i === storyIndex ? '100%' : '0%')+'; transition: '+(i === storyIndex ? 'width 5.5s linear' : 'none')+'"></div></div>'
    ).join('')+
  '</div>'+
  '<div class="story-header">'+
    '<div class="story-author"><img src="/art/logo-burst.webp" width="22" height="22" alt=""> Sway Вайб</div>'+
    '<button type="button" class="story-close" onclick="closeStory()">✕</button>'+
  '</div>'+
  '<div class="story-nav-touch story-nav-left" onclick="prevStorySlide()"></div>'+
  '<div class="story-nav-touch story-nav-right" onclick="nextStorySlide()"></div>'+
  '<div class="story-body">'+
    '<span class="story-capsule">'+slide.capsule+'</span>'+
    '<h1 class="story-title">'+html(slide.title)+'</h1>'+
    slide.art+
    '<p class="story-desc">'+html(slide.desc)+'</p>'+
  '</div>'+
  '<div class="story-actions">'+
    '<button type="button" class="story-btn primary" onclick="handleStoryAction(\''+slide.actionFn+'\')">'+html(slide.actionText)+'</button>'+
    '<button type="button" class="story-btn secondary" onclick="closeStory()">Закрыть</button>'+
  '</div>';
 setTimeout(() => {
   const fills = modal.querySelectorAll('.story-bar-fill');
   if(fills[storyIndex]) fills[storyIndex].style.width = '100%';
 }, 30);
 storyTimer = setTimeout(() => { nextStorySlide(); }, 5500);
}
function nextStorySlide(){
 if(!currentStory) return;
 if(storyIndex < currentStory.length - 1){ storyIndex++; showStorySlide(); } else { closeStory(); }
}
function prevStorySlide(){
 if(!currentStory) return;
 if(storyIndex > 0){ storyIndex--; showStorySlide(); }
}
function handleStoryAction(action){
 closeStory();
 if(action === 'wave'){
  const waveBtn = document.querySelector('[data-action="mobile-wave"]');
  if(waveBtn) waveBtn.click();
 } else if(action === 'chart'){
  location.hash = '#discover/chart';
 } else if(action === 'artist'){
  location.hash = '#artist/' + encodeURIComponent(tracks[0]?.artist || '');
 } else if(action === 'shots'){
  const hit = tracks.find(t => t.artist.toLowerCase().includes('macan') || t.artist.toLowerCase().includes('instasamka') || t.title.toLowerCase().includes('пополам')) || tracks[0];
  if(hit){ play(hit); if(dialog) dialog.showModal(); }
 } else if(action === 'share'){
  if(navigator.share){
   navigator.share({title: 'Мой вайб в Sway', text: 'Слушаю музыку на Sway: https://music.academmix.ru', url: 'https://music.academmix.ru'});
  } else {
   navigator.clipboard?.writeText('Мой вайб в Sway: https://music.academmix.ru');
   notice('Ссылка скопирована в буфер обмена!');
  }
 }
}
window.closeStory = closeStory;
window.prevStorySlide = prevStorySlide;
window.nextStorySlide = nextStorySlide;
window.handleStoryAction = handleStoryAction;

function haptic(ms = 10) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
}

let waveFilters = loadWaveFilters();

function waveFiltersBar() {
  const hasActive = waveFilters.mood || waveFilters.character !== 'mix' || waveFilters.language !== 'any';
  const moodObj = MOOD_OPTIONS.find(m => m.id === waveFilters.mood);
  const charObj = CHARACTER_OPTIONS.find(c => c.id === waveFilters.character);
  const langObj = LANGUAGE_OPTIONS.find(l => l.id === waveFilters.language);
  const label = hasActive
    ? [moodObj?.id ? moodObj?.label : null, charObj?.id !== 'mix' ? charObj?.label : null, langObj?.id !== 'any' ? langObj?.label : null].filter(Boolean).join(' · ')
    : 'Настройки волны';
  return '<div class="wave-filter-bar"><button type="button" class="wave-filters-btn" data-action="open-wave-filters">' + icon('sliders') + '<span>' + html(label) + '</span>' + (hasActive ? '<span class="wave-filter-dot"></span>' : '') + '</button>' +
   (needsTaste() ? '<button type="button" class="wave-filters-btn wave-taste-btn" data-action="open-onboarding">' + icon('spark') + '<span>Любимые артисты</span></button>' : '') + '</div>';
}

let waveDraft=null;
function openWaveFiltersSheet() {
  waveDraft={...waveFilters};open('wave-filters');
}

function openSleepTimerSheet() {
  open('sleep-timer');
}

function mobileHome(){
 const t=lastHeard();if(!t)return '';
 const front=waveArtist(t);
 return '<section id="mx-wave-root" class="mx-wave" data-track="'+t.id+'" data-playing="'+(playing||starting)+'"><div class="mx-wave-atmosphere" aria-hidden="true"><div class="mx-wave-surface is-current"></div><div class="mx-wave-surface"></div><div class="wave-bloom"><span></span><span></span><span></span></div>'+waveCanvas+'</div>'+
 navHeader('<span data-wave-heading><span class="mx-wave-caption">Моя волна</span></span>'+waveSelection(),profileLink,searchLink)+
 '<div id="sway-promo-slot"></div>'+
 '<div class="mx-stage"><div class="mx-live"><img class="mx-artist-photo" alt="" decoding="async"'+(wavePhoto(t)?' src="'+html(wavePhoto(t))+'"':' hidden')+'><div class="mx-title-slot"><h1 id="mobile-wave-title" data-long="'+(front.length>21)+'">'+html(front)+'</h1></div><div class="mx-art"><img class="mx-wave-cover" src="'+html(t.art)+'" alt=""><button class="mx-art-open" type="button" data-action="mobile-play" aria-label="Развернуть плеер с обложки"></button></div></div>'+
 '<div class="mx-idle"><h1>Моя волна</h1>'+button('play',current?'Продолжить волну':'Слушать волну','data-action="mobile-wave"','icon mx-start')+'</div></div><div class="mx-wave-bar">'+
 button('pause','Пауза','data-action="mobile-wave"','mx-pill mx-pause icon')+'<div class="mx-track-control"><button class="mx-pill mx-track" type="button" data-action="mobile-play"><span class="mx-track-playing">'+html(t.title)+'</span><span class="mx-track-idle">'+html(t.artist+' — '+t.title)+'</span></button><label class="mx-wave-progress" hidden><input class="wave-seek" type="range" min="0" max="1000" value="0" aria-label="Перемотка на главной"></label></div>'+button('heart','Мне нравится','data-wave-like data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"','mx-pill mx-wave-like icon')+
 '</div>'+waveFiltersBar()+waveDeck()+'</section>';
}
function mobileProfile(){
 const option=(href,label)=>'<a href="'+href+'">'+label+icon('forward')+'</a>';
 const guestCard='<section class="mx-profile-unit"><span class="profile-orb" aria-hidden="true">'+icon('wave-mark')+'</span><h1>Гостевой профиль</h1><p class="quiet">Слушай музыку и собирай коллекцию</p></section>';
 return navHeader('Профиль',backLink('#home'),user?button('logout','Выйти','data-action="logout"'):'')+
 '<div class="mx-profile sway-profile"><div id="profile-data">'+(user?(accountProfile?ownProfile():'<p class="loading">Загружаем профиль…</p>'):guestCard)+'</div>'+
 (!user&&loginConfigured?'<section class="profile-login"><span>Синхронизируй коллекцию</span><a class="mx-chip on" href="/auth/yandex">Войти</a></section>':'')+
 myTopSection()+
 '<section class="mx-profile-list">'+option('#settings','Настройки')+'</section>'+
 (user?'<section class="sway-account-footer"><button class="profile-delete" type="button" data-action="delete">'+icon('logout')+'<strong>Удалить аккаунт</strong>'+icon('forward')+'</button></section>':'')+'</div>';
}
function myTopSection(){
 const top=myTopMonth(5);if(!top.length)return '';
 const month=new Date().toLocaleDateString('ru-RU',{month:'long'});
 return '<section class="my-top"><header><h2>Твой топ месяца</h2><small>'+html(month)+' · на этом устройстве</small></header><ol>'+top.map(({track:t,plays},i)=>'<li><button type="button" data-play="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'"><b>'+(i+1)+'</b>'+art(t)+'<span><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></span><em>'+plays+'×</em></button></li>').join('')+'</ol></section>';
}
const ownProfile=()=>profileCard(accountProfile,{icon,track:map.get(accountProfile.profileTrack),own:true});
function syncProfileCover(root){
 const cover=root?.querySelector('[data-profile-zoom]');if(!cover)return;
 const zoom=Number(cover.dataset.profileZoom)||1;cover.style.setProperty('--profile-zoom',zoom);
 const img=cover.querySelector('img'),card=cover.closest('.sway-profile-card');if(!img||!card)return;
 const sample=()=>{
  if(!img.naturalWidth||!cover.isConnected)return;
  try{
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=16;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
   const ratio=cover.clientWidth/Math.max(1,cover.clientHeight), iw=img.naturalWidth,ih=img.naturalHeight;
   const sw=Math.min(iw,ih*ratio)/zoom,sh=Math.min(ih,iw/ratio)/zoom;
   ctx.drawImage(img,(iw-sw)/2,(ih-sh)/2+.6*sh,sw,.4*sh,0,0,32,16);
   const rgba=ctx.getImageData(0,0,32,16).data;
   const palette=side=>{
    let n=0,r=0,g=0,b=0;
    for(let y=1;y<16;y++)for(let x=side*16;x<(side+1)*16;x++){
     const i=(y*32+x)*4,w=rgba[i+3]/255;
     r+=rgba[i]*w;g+=rgba[i+1]*w;b+=rgba[i+2]*w;n+=w;
    }
    return 'rgb('+[r,g,b].map(v=>Math.round(v/Math.max(1,n))).join(' ')+')';
   };
   card.style.setProperty('--profile-cover-left',palette(0));card.style.setProperty('--profile-cover-right',palette(1));
  }catch{}
 };
 if(img.complete)sample();else img.addEventListener('load',sample,{once:true});
}
function loadProfile(handle=''){
 profileJob?.abort();
 const job=new AbortController(), target=$('#profile-data'), owner=user;profileJob=job;
 if(!target||!owner)return;
 api(handle?'/api/profiles/'+encodeURIComponent(handle):'/api/profile','GET',{},job.signal).then(p=>{
  if(job.signal.aborted||user!==owner||!target.isConnected)return;
  if(handle)target.innerHTML=profileCard(p,{icon,track:map.get(p.profileTrack),own:false});
  else{accountProfile=p;target.innerHTML=ownProfile();}
  syncProfileCover(target);
 }).catch(error=>{
  if(job.signal.aborted||!target.isConnected)return;
  if(!handle&&accountProfile)return;
  target.innerHTML='<p class="panel quiet">'+(handle&&error.status===404?'Профиль не найден или закрыт.':user?'Не удалось загрузить профиль. <button type="button" class="link" data-action="retry-profile">Повторить</button>':'Войди в Sway, чтобы увидеть профиль.')+'</p>';
 });
}
function openProfileEditor(){
 if(!accountProfile||!user||editor.open)return;
 editDraft={files:{},pending:new Set(),busy:false,controller:new AbortController()};
 editor.innerHTML=editorView(accountProfile,tracks,icon);editor.showModal();
 mountProfileSongPicker(editor,tracks,{icon,signal:editDraft.controller.signal});
 updateCoverZoom();
 $('.profile-edit-scroll').scrollTop=0;editor.querySelector('.dialog-close').focus({preventScroll:true});
}
function previewProfileImage(kind,data){
 const form=$('#profile-edit-form'), preview=form?.querySelector('[data-profile-preview="'+kind+'"]');if(!preview)return;
 const src=data||(kind==='avatar'&&accountProfile?.hasYandexAvatar?yandexAvatarPath:'');
 if(src)preview.src=src;else preview.removeAttribute('src');preview.hidden=!src;
 form.querySelector('[data-profile-remove="'+kind+'"]').hidden=!data;
 if(kind==='cover'){form.querySelector('.profile-cover-scale').hidden=!data;form.elements.coverZoom.value=100;updateCoverZoom();}
}
function updateCoverZoom(){
 const form=$('#profile-edit-form'), value=Number(form.elements.coverZoom.value);
 form.querySelector('.profile-cover-preview').style.setProperty('--profile-zoom',value/100);
 form.querySelector('.profile-cover-scale').style.setProperty('--range-fill',((value-100)/80*100)+'%');
 form.querySelector('.profile-cover-scale output').textContent=value+'%';
 form.querySelector('[data-profile-zoom="-5"]').disabled=value<=100;
 form.querySelector('[data-profile-zoom="5"]').disabled=value>=180;
}
async function uploadProfileImage(input){
 const file=input.files[0], draft=editDraft, kind=input.dataset.profileFile;if(!file||!draft)return;
 const status=$('.profile-save-status'), submit=$('#profile-edit-form [type=submit]');
 input.value='';input.disabled=true;draft.pending.add(kind);status.textContent='Готовим фото…';submit.disabled=true;
 try{
  const data=await resizeProfileImage(file,kind);
  if(editDraft!==draft)return;
  draft.files[kind]=data;previewProfileImage(kind,data);status.textContent='';
 }catch(error){if(editDraft===draft)status.textContent=error.message.startsWith('Выбери')?error.message:'Не удалось открыть фото. Попробуй выбрать другое.';}
 finally{if(editDraft===draft){input.disabled=false;draft.pending.delete(kind);submit.disabled=draft.pending.size>0;}}
}
async function saveProfile(form){
 const draft=editDraft;if(!draft||draft.pending.size||draft.busy)return;
 const {name,handle,bio,coverZoom,profileTrack,visible}=form.elements, status=form.querySelector('.profile-save-status');
 if(!name.value.trim()||(visible.checked&&!handle.value.trim())){status.textContent=visible.checked?'Заполни имя и ник для профиля по ссылке.':'Укажи имя профиля.';return;}
 draft.busy=true;form.setAttribute('aria-busy','true');
 const controls=[...form.querySelectorAll('button,input,textarea')];controls.forEach(el=>el.disabled=true);
 status.textContent='Сохраняем…';
 try{
  const p=await api('/api/profile','PATCH',{name:name.value,handle:handle.value,bio:bio.value,coverZoom:Number(coverZoom.value),profileTrack:profileTrack.value,visible:visible.checked,...draft.files});
  if(editDraft!==draft||!user)return;
  profileJob?.abort();accountProfile=p;user.name=p.name;$('#account-label').textContent=p.name;
  if(page==='profile'&&$('#profile-data')){$('#profile-data').innerHTML=ownProfile();syncProfileCover($('#profile-data'));}
  draft.busy=false;editor.close();$('[data-action="profile-edit"]')?.focus({preventScroll:true});notice('Профиль сохранён');
 }catch(error){
  if(editDraft!==draft)return;
  status.textContent=({handle_taken:'Этот ник уже занят.',invalid_profile:'Проверь имя, ник и описание.',invalid_image:'Размер или формат фото не подошёл.'})[error.code]||'Не удалось сохранить профиль. Попробуй ещё раз.';
 }finally{if(editDraft===draft){draft.busy=false;form.removeAttribute('aria-busy');controls.forEach(el=>el.disabled=false);updateCoverZoom();}}
}
const knownArtists = {
  'zivert': { name: 'Zivert', art: '/art/artists/zivert.jpg', bio: 'Поп исполнитель' },
  'madk1d': { name: 'madk1d', art: '/art/artists/madk1d.jpg', bio: 'Хип-хоп / рэп артист' },
  'villian': { name: 'VILLIAN', art: '/art/artists/villian.jpg', bio: 'Хип-хоп / рэп артист' },
  'koss': { name: 'Koss', art: '/art/artists/koss.jpg', bio: 'Хип-хоп / рэп артист' },
  'toxi$': { name: 'Toxi$', art: '/art/artists/toxi.jpg', bio: 'Рэп / хип-хоп артист' },
  'toxi': { name: 'Toxi$', art: '/art/artists/toxi.jpg', bio: 'Рэп / хип-хоп артист' },
  'маяк x': { name: 'МАЯК X', art: '/art/artists/mayak-x.jpg', bio: 'Инди-поп проект' },
  'маяк-x': { name: 'МАЯК X', art: '/art/artists/mayak-x.jpg', bio: 'Инди-поп проект' },
  'плутто': { name: 'ПЛУТТО', art: '/art/artists/plutto.jpg', bio: 'Рэп / хип-хоп артист' },
  'plutto': { name: 'ПЛУТТО', art: '/art/artists/plutto.jpg', bio: 'Рэп / хип-хоп артист' },
  'тёмный принц': { name: 'тёмный принц', art: '/art/artists/tyomny-prints.jpg', bio: 'Рэп артист' },
  'темный принц': { name: 'тёмный принц', art: '/art/artists/tyomny-prints.jpg', bio: 'Рэп артист' },
  'мэйби бэйби': { name: 'Мэйби Бэйби', art: '/art/artists/maybe-baby.jpg', bio: 'Поп и рэп исполнительница' },
  'og buda': { name: 'OG Buda', art: '/art/artists/og-buda.jpg', bio: 'Рэп / трэп артист' },
  'егор крид': { name: 'ЕГОР КРИД', art: '/art/artists/egor-kreed.jpg', bio: 'Поп и рэп артист' },
  'баста': { name: 'Баста', art: '/art/artists/basta.jpg', bio: 'Легенда русского рэпа' },
  'basta': { name: 'Баста', art: '/art/artists/basta.jpg', bio: 'Легенда русского рэпа' },
  'mia boyka': { name: 'MIA BOYKA', art: '/art/artists/mia-boyka.jpg', bio: 'Поп-исполнительница' },
  'enzro': { name: 'ENZRO', art: '/art/artists/enzro.jpg', bio: 'Хип-хоп исполнитель' },
  'kai angel': { name: 'Kai Angel', art: '/art/artists/kai-angel.jpg', bio: 'Рэп / трэп артист' },
  'давид туров': { name: 'Давид Туров', art: '/art/artists/david-turov.jpg', bio: 'Блогер и музыкальный артист' },
  'lizogub': { name: 'LIZOGUB', art: '/art/artists/lizogub.jpg', bio: 'Хип-хоп и поп исполнитель' },
  'милана некрасова': { name: 'Милана Некрасова', art: '/art/artists/milana-nekrasova.jpg', bio: 'Поп-исполнительница' },
  'вирсавия': { name: 'Вирсавия', art: '/art/artists/virsaviya.jpg', bio: 'Поп и рэп артистка' },
  'цуефа': { name: 'ЦУЕФА', art: '/art/artists/tsuefa.jpg', bio: 'Творческое объединение' },
  'mot': { name: 'MOT', art: '/art/artists/mot.jpg', bio: 'Хип-хоп и R&B исполнитель' },
  'xcho': { name: 'Xcho', art: '/art/artists/xcho.jpg', bio: 'Хип-хоп артист' },
  'by индия': { name: 'By Индия', art: '/art/artists/by-india.jpg', bio: 'R&B и хип-хоп артист' },
  'татьяна буланова': { name: 'Татьяна Буланова', art: '/art/artists/tatyana-bulanova.jpg', bio: 'Заслуженная артистка России' },
  'даник': { name: 'Даник', art: '/art/artists/danik.jpg', bio: 'Поп и рэп артист' },
  'danik': { name: 'Даник', art: '/art/artists/danik.jpg', bio: 'Поп и рэп артист' },
  'nextime': { name: 'NEXTIME', art: '/art/artists/nextime.jpg', bio: 'Рэп / дрилл артист' },
  'дора': { name: 'Дора', art: '/art/artists/dora.jpg', bio: 'Рок и поп исполнительница' },
  'dora': { name: 'Дора', art: '/art/artists/dora.jpg', bio: 'Рок и поп исполнительница' }
};

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[«»""''„“]/g, '')
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-zа-яё0-9$_\-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function splitArtists(str) {
  return [...new Set(String(str || '')
    .split(/\s*[,;/]\s*|\s+(?:&|×|feat\.?|ft\.?)\s+/iu)
    .map(s => s.trim())
    .filter(Boolean))];
}

const artistAliases=new Map(Object.entries(knownArtists).map(([key,profile])=>[canonical(key),profile]));
const artistIdentity = name=>canonical(artistAliases.get(canonical(name))?.name || name);

let artistIndex=new Map();
let artistsData=[];
let albumsIndex=new Map();
let albumsData=[];

function indexAlbums(){
 albumsIndex=new Map();
 for(const alb of albumsData){
  const record={...alb};
  albumsIndex.set(alb.id,record);
  albumsIndex.set(slugify(alb.title),record);
 }
 for(const t of tracks){
  const albId=t.albumId||slugify(t.title);
  if(!albumsIndex.has(albId)){
   const alb={
    id:albId,
    title:t.albumTitle||t.title,
    artists:t.artists||splitArtists(t.artist),
    artistString:t.artist,
    art:t.art,
    year:t.albumYear||'',
    type:t.albumType||'single',
    releaseDate:t.albumReleaseDate||'',
    releaseDateVerified:t.releaseDateVerified===true,
    genre:t.genre||'Поп / Рэп',
    trackIds:[t.id],
    likes:''
   };
   albumsIndex.set(albId,alb);
   albumsIndex.set(slugify(alb.title),alb);
  }else{
   const ex=albumsIndex.get(albId);
   if(t.releaseDateVerified){ex.releaseDate=t.albumReleaseDate;ex.releaseDateVerified=true;}
   if(ex.trackIds&&!ex.trackIds.includes(t.id))ex.trackIds.push(t.id);
   if(ex.trackIds?.length>=3)ex.type='album';
  }
 }
}

function indexArtists(){
 artistIndex=new Map();
 for(const a of artistsData){
  const profile=artistAliases.get(canonical(a.name));
  const record={
   ...a,
   art:profile?.art||a.art,
   bio:profile?.bio||a.bio,
   items:(a.trackIds||[]).map(id=>map.get(id)).filter(Boolean)
  };
  const key=canonical(a.slug||a.name);
  artistIndex.set(key,record);
  artistIndex.set(slugify(a.name),record);
  artistIndex.set(slugify(a.slug),record);
  artistIndex.set(canonical(a.name),record);
 }
 for(const t of tracks){
  const parts=t.artists||splitArtists(t.artist);
  for(const name of parts){
   const key=artistIdentity(name), slug=slugify(name);
   const profile=artistAliases.get(canonical(name));
   const group=artistIndex.get(key)||artistIndex.get(slug)||{
    name:profile?.name||name,
    slug,
    art:profile?.art||`/art/artists/${slug}.jpg`,
    fallbackArt:t.art,
    items:[],
    albumIds:[],
    listeners:0,
    likes:0,
    bio:profile?.bio||'',
    similar:[]
   };
   if(!group.items.some(x=>x.id===t.id))group.items.push(t);
   if(t.albumId&&!group.albumIds?.includes(t.albumId)){
    if(!group.albumIds)group.albumIds=[];
    group.albumIds.push(t.albumId);
   }
   artistIndex.set(key,group);
   artistIndex.set(slug,group);
   artistIndex.set(canonical(group.name),group);
  }
 }
}

// First visit: a few well-known artists with real photos seed the wave before there are any likes.
const onboardPicks=new Set();
function onboardingArtists(){
 const seen=new Set(),list=[];
 for(const a of artistIndex.values()){
  if(seen.has(a))continue;seen.add(a);
  if(!artistsData.some(x=>x.name===a.name)||!a.art||!a.art.startsWith('/art/artists/'))continue;
  list.push(a);
 }
 return list.sort((x,y)=>(y.items?.length||0)-(x.items?.length||0)).slice(0,24);
}
// Offered as a button under the wave settings, never as a popup over «Слушать волну».
const needsTaste=()=>!load('onboarded',false)&&!likes.size&&!preferredArtists.size&&onboardingArtists().length>=6;
function finishOnboarding(){save('onboarded',true);document.querySelectorAll('[data-action="open-onboarding"]').forEach(b=>b.remove());}
function resolveArtist(param){
 if(!param)return null;
 let decoded=String(param);
 try{decoded=decodeURIComponent(decoded);}catch{}
 const lower=canonical(decoded), slug=slugify(decoded);
 if(artistIndex.has(lower))return artistIndex.get(lower);
 if(artistIndex.has(slug))return artistIndex.get(slug);
 const byName=[...artistIndex.values()].find(x=>canonical(x.name)===lower||x.slug===slug);
 if(byName)return byName;
 const t=map.get(decoded);
 if(t){
  const first=(t.artists||splitArtists(t.artist))[0];
  return resolveArtist(first)||{name:t.artist,art:t.art,items:[t],slug:slugify(t.artist),listeners:0,likes:0};
 }
 return null;
}

function resolveAlbum(param){
 if(!param)return null;
 let decoded=String(param);
 try{decoded=decodeURIComponent(decoded);}catch{}
 const slug=slugify(decoded);
 if(albumsIndex.has(decoded))return albumsIndex.get(decoded);
 if(albumsIndex.has(slug))return albumsIndex.get(slug);
 const byTitle=[...albumsIndex.values()].find(a=>a.id===decoded||slugify(a.title)===slug);
 if(byTitle)return byTitle;
 const t=map.get(decoded);
 if(t&&t.albumId)return albumsIndex.get(t.albumId)||albumsIndex.get(slugify(t.albumTitle));
 return null;
}

function getArtistAlbums(artist){
 const result=[];
 const seen=new Set();
 for(const albId of (artist.albumIds||[])){
  const alb=albumsIndex.get(albId)||albumsIndex.get(slugify(albId));
  if(alb&&!seen.has(alb.id)){seen.add(alb.id);result.push(alb);}
 }
 for(const t of (artist.items||[])){
  const albId=t.albumId||slugify(t.title);
  const alb=albumsIndex.get(albId)||albumsIndex.get(slugify(albId));
  if(alb&&!seen.has(alb.id)){seen.add(alb.id);result.push(alb);}
 }
 return result;
}

function artistAvatar(name){return resolveArtist(name)?.art||resolveArtist(name)?.fallbackArt||'/art/logo.svg';}

function formatListeners(num){
 const count=Math.max(0,Math.floor(Number(num)||0));
 const mod10=count%10,mod100=count%100;
 const noun=mod10===1&&mod100!==11?'слушатель':[2,3,4].includes(mod10)&&![12,13,14].includes(mod100)?'слушателя':'слушателей';
 return count.toLocaleString('ru-RU')+' '+noun;
}

function formatReleaseDate(str){
 if(!str)return '';
 try{
  const d=new Date(str);
  if(!isNaN(d.getTime()))return d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
 }catch{}
 return String(str).slice(0,10);
}

function pluralTracks(count) {
  const mod10 = count % 10, mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'трек';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'трека';
  return 'треков';
}

function matchingArtistCard(q) {
  if (!q || q.length < 2) return '';
  const lower=canonical(q);
  const profile=resolveArtist(lower);
  if(profile){
      const count=profile.items.length;
      return '<div class="search-artist-card">'+
        '<img class="search-artist-art" src="'+(profile.art||profile.fallbackArt)+'" alt="'+html(profile.name)+'">'+
        '<div class="search-artist-info">'+
          '<span class="search-artist-badge">'+icon('spark')+'Исполнитель</span>'+
          '<strong class="search-artist-name">'+html(profile.name)+'</strong>'+
          '<span class="search-artist-meta">'+count+' '+pluralTracks(count)+'</span>'+
        '</div>'+
        '<a href="#artist/'+encodeURIComponent(profile.slug)+'" class="search-artist-btn">Открыть карточку</a>'+
      '</div>';
  }
  return '';
}

let community={tracks:{},artists:{},collections:{},loaded:false},communityAt=0,communityJob=null;
let collectionLikes=new Set(),reactionOwner='',infoArtist=null;
const reactionKey=(kind,ref)=>kind+':'+ref;
function reactionButton(kind,ref){
 const key=reactionKey(kind,ref),count=community.collections[key]||0;
 return `<button type="button" class="collection-reaction" data-collection-kind="${html(kind)}" data-collection-ref="${html(ref)}" aria-label="Нравится плейлист" aria-pressed="${collectionLikes.has(key)}">${icon('heart')}<span data-collection-count="${html(key)}">${count.toLocaleString('ru-RU')}</span></button>`;
}
async function loadCommunity(force=false){
 const owner=user?.id||'';
 if(reactionOwner!==owner){reactionOwner=owner;collectionLikes.clear();communityAt=0;}
 if(communityJob||!force&&Date.now()-communityAt<45000||offlineOnly())return;
 communityAt=Date.now();const hash=location.hash;
 communityJob=Promise.all([api('/api/catalog-signals'),owner?api('/api/collection-reactions'):Promise.resolve({liked:[]})]).then(([data,reactions])=>{
  if(owner!==(user?.id||''))return;
  community={...data,loaded:true};collectionLikes=new Set(reactions.liked||[]);
  if(modal==='info'&&sheet.open)paintSheet();
  if((['artist','album'].includes(page)||page==='library')&&location.hash===hash){const y=scrollY;render();requestAnimationFrame(()=>scrollTo(0,y));}
 }).catch(()=>{}).finally(()=>{communityJob=null;});
 return communityJob;
}
async function toggleCollection(b){
 if(!user){notice('Войди в аккаунт, чтобы сохранить плейлист и его лайк в Sway.');return;}
 const kind=b.dataset.collectionKind,ref=b.dataset.collectionRef,key=reactionKey(kind,ref);
 if(b.disabled)return;b.disabled=true;
 try{const data=await api('/api/collection-reactions',collectionLikes.has(key)?'DELETE':'PUT',{kind,ref});
  if(data.liked)collectionLikes.add(key);else collectionLikes.delete(key);
  community.collections[key]=data.likes;
  for(const el of $$('[data-collection-kind]'))if(reactionKey(el.dataset.collectionKind,el.dataset.collectionRef)===key){el.setAttribute('aria-pressed',data.liked);const count=el.querySelector('[data-collection-count]');if(count)count.textContent=data.likes.toLocaleString('ru-RU');}
  pulse('like');
 }catch{notice('Не удалось сохранить лайк. Попробуй ещё раз.');}finally{b.disabled=false;}
}
function artistPopular(artist){
 const published=new Map((artist.popular||[]).map((id,i)=>[id,i]));
 return [...artist.items].sort((a,b)=>(community.tracks[b.id]?.plays||0)-(community.tracks[a.id]?.plays||0)||(community.tracks[b.id]?.likes||0)-(community.tracks[a.id]?.likes||0)||(published.get(a.id)??10000)-(published.get(b.id)??10000)||a.title.localeCompare(b.title,'ru'));
}
function artistTrackRow(t,index){
 const active=current?.id===t.id;
 return `<article class="row artist-track-row ${active?'active':''}" data-row="${html(t.id)}"><span class="artist-track-rank">${index}</span><button class="row-track" type="button" data-play="${html(t.id)}" aria-label="Воспроизвести ${html(t.title)}"><span class="row-art">${art(t)}${icon(active&&playing?'pause':'play')}</span><span class="row-meta"><strong>${html(t.title)}${t.isExplicit?' <span class="badge-e">E</span>':''}</strong><small>${html(t.artist)}</small></span></button><div class="row-actions">${button('heart','Мне нравится','data-like="'+html(t.id)+'" aria-pressed="'+likes.has(t.id)+'"')}${button('more','Меню трека','data-action="track-menu" data-track="'+html(t.id)+'"')}</div></article>`;
}
function artistView(){
 const [,param,section]=location.hash.split('/'),artist=resolveArtist(param);if(!artist?.items?.length)return discoverView();
 const popular=artistPopular(artist),albums=getArtistAlbums(artist),similar=similarArtists(artist,[...artistIndex.values()]);
 const identity=canonical(artist.name),stats=community.artists[identity]||{listeners:0,plays:0};
 const art=artist.art||artist.fallbackArt||popular[0].art,hue=popular[0]?.palette?.[0]||215;
 const link=kind=>'#artist/'+encodeURIComponent(artist.slug)+'/'+kind;
 const artistLink='#artist/'+encodeURIComponent(artist.slug);
 if(['all','best','mix'].includes(section)){
  const radio=section==='mix',items=radio?artistRadio(tracks,artist):popular,kind=radio?'artist-radio':'artist-best';
  return `<article class="artist-v2 artist-playlist-detail" style="--artist-h:${hue}">${navHeader('',backLink(artistLink),searchLink)}<section class="system-playlist-hero"><img data-player-art-fallback="${html(artist.fallbackArt||popular[0].art)}" src="${html(art)}" alt=""><small>${radio?'В стиле артиста':'Треки артиста'}</small><h1>${radio?'В стиле: ':section==='all'?'Популярные треки: ':'Лучшее: '}${html(artist.name)}</h1><p>${radio?'Похожие по звучанию записи других исполнителей':trackCount(items.length)+' в каталоге Sway'}</p><div class="actions"><button class="btn primary" type="button" data-action="${radio?'play-artist-wave':'play-artist'}" data-artist="${html(artist.name)}" ${items.length?'':'disabled'}>${icon('play')}Слушать</button>${reactionButton(kind,identity)}</div></section><div class="artist-popular-tracks">${items.map((t,i)=>artistTrackRow(t,i+1)).join('')||'<p class="quiet">Подходящих треков пока нет.</p>'}</div></article>`;
 }
 const newRelease=latestRelease(albums);
 const currentArtist=playing&&current&&artist.items.some(t=>t.id===current.id);
 const genres=[...new Set(artist.items.map(genreOf).filter(Boolean))].slice(0,3);
 const releaseCard=a=>`<a class="new-release-card" href="#album/${encodeURIComponent(a.id)}"><img class="new-release-art" src="${html(a.art)}" alt=""><span class="new-release-meta"><strong>${html(a.title)}</strong><small>${formatReleaseDate(a.releaseDate)} · ${a.type==='album'?'альбом':a.type==='ep'?'мини-альбом':'сингл'}</small></span>${icon('forward')}</a>`;
 const albumCard=a=>`<a class="artist-album-card" href="#album/${encodeURIComponent(a.id)}"><img class="artist-album-art" src="${html(a.art)}" alt="" loading="lazy"><strong class="artist-album-title">${html(a.title)}</strong><small class="artist-album-sub">${html(a.artistString||artist.name)}</small><span class="artist-album-year">${a.year?html(a.year)+' · ':''}${a.type==='album'?'альбом':a.type==='ep'?'мини-альбом':'сингл'}</span></a>`;
 return `<article class="artist-v2" data-artist="${html(artist.slug)}" style="--artist-h:${hue}">
 ${navHeader('',backLink('#discover'),searchLink+button('more','Об исполнителе','data-action="artist-about" data-artist="'+html(artist.name)+'"'))}
 <div class="artist-hero-v2"><div class="artist-hero-backdrop"><img class="artist-hero-ambient" data-player-art-fallback="${html(artist.fallbackArt||popular[0].art)}" src="${html(art)}" alt="" aria-hidden="true"><img class="artist-hero-art" data-player-art-fallback="${html(artist.fallbackArt||popular[0].art)}" src="${html(art)}" alt="${html(artist.name)}"><div class="artist-hero-overlay"></div></div><div class="artist-hero-content"><h1 class="artist-hero-name">${html(artist.name)}</h1><div class="artist-listeners">${community.loaded?formatListeners(stats.listeners)+' за месяц в Sway':'Статистика Sway загружается'}<small>${trackCount(artist.items.length)} в каталоге</small></div><div class="artist-hero-actions"><button class="artist-action-pill" type="button" data-action="like-artist" data-artist="${html(artist.slug)}" aria-pressed="${preferredArtists.has(artist.name)}"><span class="action-circle">${icon('heart')}</span><small>Нравится</small></button><button class="artist-action-pill hero-play-main" type="button" data-action="play-artist" data-artist="${html(artist.name)}"><span class="action-circle">${icon(currentArtist?'pause':'play')}</span><small>${currentArtist?'Пауза':'Слушать'}</small></button></div></div></div>
 ${newRelease?`<section class="artist-section"><h2 class="artist-section-title">Новый релиз</h2>${releaseCard(newRelease)}</section>`:''}
 <section class="artist-section"><div class="artist-section-head"><h2 class="artist-section-title"><a href="${link('all')}">Популярные треки ${icon('forward')}</a></h2></div><div class="artist-popular-tracks">${popular.slice(0,5).map((t,i)=>artistTrackRow(t,i+1)).join('')}</div><a class="artist-show-all" href="${link('all')}">Все треки ${icon('forward')}</a></section>
 <section class="artist-section"><button class="artist-wave-card animated-radio" type="button" data-action="play-artist-wave" data-artist="${html(artist.name)}"><span class="radio-light" aria-hidden="true"></span><small>Моя волна в стиле артиста</small><strong>${icon('play')}${html(artist.name)}</strong><span class="radio-caption">Открой похожих исполнителей</span></button></section>
 ${albums.length?`<section class="artist-section"><h2 class="artist-section-title">Альбомы и синглы</h2><div class="artist-albums-rail">${[...albums].sort((a,b)=>releaseTimestamp(b)-releaseTimestamp(a)).map(albumCard).join('')}</div></section>`:''}
 <section class="artist-section"><h2 class="artist-section-title">Плейлисты</h2><div class="artist-albums-rail artist-playlist-rail">${[['best','Лучшее','artist-best',art],['mix','В стиле','artist-radio',similar[0]?.art||art]].map(([path,label,kind,cover])=>`<article class="artist-playlist-tile"><a class="artist-album-card" href="${link(path)}"><div class="playlist-art-wrap ${path==='best'?'best-playlist-theme':'style-playlist-theme'}"><img class="playlist-artist-img" data-player-art-fallback="${html(popular[0].art)}" src="${html(cover)}" alt="" loading="lazy"><span class="playlist-badge-pill">${label}</span></div><strong class="artist-album-title">${label}: ${html(artist.name)}</strong></a>${reactionButton(kind,identity)}</article>`).join('')}</div></section>
 <section class="artist-section"><button class="artist-about-card" type="button" data-action="artist-about" data-artist="${html(artist.name)}"><img class="artist-about-ambient" data-player-art-fallback="${html(artist.fallbackArt||popular[0].art)}" src="${html(art)}" alt=""><img class="artist-about-img" data-player-art-fallback="${html(artist.fallbackArt||popular[0].art)}" src="${html(art)}" alt=""><span class="artist-about-overlay"></span><span class="artist-about-text"><strong>Об исполнителе</strong><small>${html(genres.join(' · ')||'Музыка в Sway')} · Подробнее ${icon('forward')}</small></span></button></section>
 ${similar.length?`<section class="artist-section"><h2 class="artist-section-title">Похожие исполнители</h2><p class="artist-similarity-note">По жанрам, звучанию и совместным записям</p><div class="similar-artists-rail">${similar.map(a=>`<a class="similar-artist-item" href="#artist/${encodeURIComponent(a.slug)}"><img class="similar-artist-avatar" data-player-art-fallback="${html(a.fallbackArt||a.items[0]?.art||'/art/logo.svg')}" src="${html(a.art||a.fallbackArt)}" alt="" loading="lazy"><span class="similar-artist-name">${html(a.name)}</span></a>`).join('')}</div></section>`:''}
 </article>`;
}

function mobileArtist(){
  return artistView();
}

function albumView() {
  const param = location.hash.split('/')[1];
  const album = resolveAlbum(param);
  if (!album) return discoverView();

  const albumTracks = (album.trackIds || []).map(id => map.get(id)).filter(Boolean).sort((a,b)=>(a.discNumber||1)-(b.discNumber||1)||(a.trackNumber||0)-(b.trackNumber||0));
  if (!albumTracks.length && album.items) albumTracks.push(...album.items);
  if (!albumTracks.length) return discoverView();

  const isPlayingAlbum = playing && current && albumTracks.some(t => t.id === current.id);

  const artistsLinks = (album.artists || splitArtists(album.artistString)).map(name => {
    const slug = slugify(name);
    return '<a class="artist-link" href="#artist/'+encodeURIComponent(slug)+'">'+html(name)+'</a>';
  }).join(', ');

  const related = [...albumsIndex.values()].filter(a => a.id !== album.id && (a.genre === album.genre || a.artists?.some(x => album.artists?.includes(x)))).slice(0, 8);

  return '<article class="album-view" data-album="'+html(album.id)+'">'+
    navHeader('', backLink('#discover'), searchLink + button('more', 'Действия', 'data-action="album-menu" data-album="'+html(album.id)+'"'))+
    
    // Album Hero
    '<div class="album-hero">'+
      '<img class="album-hero-art" src="'+html(album.art)+'" alt="'+html(album.title)+'">'+
      '<h1 class="album-hero-title">'+html(album.title)+(album.isExplicit ? ' <span class="badge-e">E</span>' : '')+'</h1>'+
      '<div class="album-hero-sub">'+
        artistsLinks + ' · ' + album.year+
      '</div>'+
      '<div class="album-actions-bar">'+
        '<button class="artist-action-pill" type="button" data-collection-kind="album" data-collection-ref="'+html(album.id)+'" data-action="like-album" data-album="'+html(album.id)+'" aria-pressed="'+collectionLikes.has('album:'+album.id)+'" aria-label="Нравится">'+
          '<span class="action-circle">'+icon('heart')+'</span>'+
          '<small data-collection-count="album:'+html(album.id)+'">'+Number(community.collections['album:'+album.id]||0).toLocaleString('ru-RU')+'</small>'+
        '</button>'+
        '<button class="artist-action-pill" type="button" data-action="download-album" data-album="'+html(album.id)+'" aria-label="Скачать">'+
          '<span class="action-circle">'+icon('bolt')+'</span>'+
          '<small>Скачать</small>'+
        '</button>'+
        '<button class="artist-action-pill hero-play-main" type="button" data-action="play-album" data-album="'+html(album.id)+'" aria-label="Слушать">'+
          '<span class="action-circle">'+(isPlayingAlbum ? icon('pause') : icon('play'))+'</span>'+
          '<small>Слушать</small>'+
        '</button>'+
      '</div>'+
    '</div>'+

    // Tracklist
    '<div class="album-tracks-list">'+
      albumTracks.map((t, idx) => {
        const isCurrent = current?.id === t.id;
        const isThisPlaying = isCurrent && playing;
        return '<div class="album-track-row '+(isThisPlaying ? 'playing' : '')+'" data-row="'+t.id+'">'+
          '<span class="album-track-num">'+(isThisPlaying ? '⚡🟡' : (idx + 1))+'</span>'+
          '<button class="album-track-btn" type="button" data-play="'+t.id+'" data-context="album:'+album.id+'">'+
            '<div class="album-track-info">'+
              '<strong>'+html(t.title)+(t.isExplicit ? ' <span class="badge-e">E</span>' : '')+'</strong>'+
              '<small>'+html(t.artist)+'</small>'+
            '</div>'+
          '</button>'+
          button('heart', 'Мне нравится', 'data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+
          '<small class="row-time">'+time(t.seconds)+'</small>'+
          button('more', 'Меню трека', 'data-action="track-menu" data-track="'+t.id+'"')+
        '</div>';
      }).join('')+
    '</div>'+

    // Моя волна по альбому
    '<section class="artist-section">'+
      '<button class="artist-wave-card" type="button" data-action="play-album-wave" data-album="'+html(album.id)+'">'+
        '<small>Моя волна по альбому</small>'+
        '<strong>'+icon('play')+' '+html(album.title)+'</strong>'+
      '</button>'+
    '</section>'+

    // Related albums
    (related.length ?
      '<section class="artist-section">'+
        '<div class="artist-section-head"><h2 class="artist-section-title">'+html(album.genre || 'Похожие релизы')+' '+icon('forward')+'</h2></div>'+
        '<div class="artist-albums-rail">'+
          related.map(alb => 
            '<a class="artist-album-card" href="#album/'+encodeURIComponent(alb.id)+'">'+
              '<img class="artist-album-art" src="'+html(alb.art)+'" alt="'+html(alb.title)+'" loading="lazy">'+
              '<strong class="artist-album-title">'+html(alb.title)+'</strong>'+
              '<small class="artist-album-sub">'+html(alb.artistString)+'</small>'+
              '<span class="artist-album-year">'+alb.year+'</span>'+
            '</a>'
          ).join('')+
        '</div>'+
      '</section>' : '')+

  '</article>';
}

function openArtistsSheet(artistNames) {
  const parts = Array.isArray(artistNames) ? artistNames : splitArtists(artistNames);
  if (parts.length <= 1) {
    location.hash = '#artist/' + encodeURIComponent(slugify(parts[0] || ''));
    return;
  }
  modal = 'artists';
  sheet.dataset.modal = 'artists';
  $('#sheet-body').innerHTML = '<h2 class="dialog-title">Исполнители</h2>'+
    '<div class="multi-artist-sheet">'+
      parts.map(name => {
        const slug = slugify(name);
        const art = artistAvatar(name);
        return '<a class="multi-artist-row" href="#artist/'+encodeURIComponent(slug)+'" data-close-layers>'+
          '<img class="multi-artist-avatar" src="'+html(art)+'" alt="'+html(name)+'">'+
          '<strong>'+html(name)+'</strong>'+
          icon('forward')+
        '</a>';
      }).join('')+
    '</div>';
  sheet.showModal();syncChrome();
}
function mobileSuggestions(){
 const list=suggest(), t=list.find(t=>t.id!==current?.id)||list[0];
 return (t?'<section class="mx-suggestion"><h2>Попробуй послушать</h2><button type="button" class="search-feature" data-play="'+t.id+'">'+art(t)+'<span><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></span>'+icon('play')+'</button></section>':'')+
 '<section class="mx-gap search-more">'+titleLink('Подборки для тебя','#discover')+'<div class="track-grid">'+list.slice(0,6).map(card).join('')+'</div></section>';
}
const favoriteFilterNames=[['','Всё'],['bright','Бодрое'],['focus','Для фокуса'],['calm','Спокойное'],['night','Ночное']];
function favoriteItems(){
 const items=tracksFrom([...likes].reverse());
 return favoriteMood?items.filter(t=>t.moods.includes(favoriteMood)):items;
}
function favoriteChips(){
 return '<div class="mx-filters">'+favoriteFilterNames.map(([id,title])=>'<button class="mx-chip '+(favoriteMood===id?'on':'')+'" data-filter="'+id+'" aria-pressed="'+(favoriteMood===id)+'">'+title+'</button>').join('')+'</div>';
}
function favoriteArtists(expanded=false){
 const names=new Set([...preferredArtists,...tracksFrom([...likes].reverse()).flatMap(t=>artistCredits(t.artist))]);
 const artists=[...new Set([...names].map(resolveArtist).filter(Boolean))];
 return artists.length?'<div class="shelf-artists '+(expanded?'shelf-artists-grid':'')+'">'+artists.slice(0,expanded?artists.length:8).map(a=>'<a href="#artist/'+encodeURIComponent(a.slug)+'"><img src="'+html(a.art||a.fallbackArt||a.items[0]?.art)+'" alt="" loading="lazy"><strong>'+html(a.name)+'</strong><small>'+trackCount(a.items.length)+'</small></a>').join('')+'</div>':'';
}

function mobileSearch(){
 const recent=load('search-history',[]), prompts=[['Для работы','без отвлечений'],['Хочу','немного выдохнуть'],['Музыка','для позднего вечера'],['Хочется','двигаться под музыку']];
 return '<div class="mx-search-top"><header class="mx-search">'+backLink(searchBack)+'<input id="search-query" type="search" enterkeyhint="search" autocomplete="off" aria-label="Трек, исполнитель или жанр" placeholder="Что вы чувствуете или ищете?" value="'+html(search)+'">'+button('close','Очистить запрос','data-action="search-clear" hidden','icon search-clear')+'</header></div>'+
 '<div id="search-intro"><div class="search-prompts"><span aria-hidden="true">'+icon('glint')+'</span><div class="search-prompts-rail" aria-label="Идеи для поиска">'+moods.map((m,i)=>'<button type="button" data-query="'+m[1]+'"><b>'+prompts[i][0]+'</b> '+prompts[i][1]+'</button>').join('')+'</div></div>'+
 '<div class="mx-tabs" role="group" aria-label="Разделы поиска"><button type="button" class="mx-chip '+(searchTab==='popular'?'on':'')+'" data-action="search-popular" aria-pressed="'+(searchTab==='popular')+'">Популярное</button><button type="button" class="mx-chip '+(searchTab==='history'?'on':'')+'" data-action="search-history" aria-pressed="'+(searchTab==='history')+'">История</button></div>'+
 (searchTab==='history'?'<section class="mx-history">'+(recent.length?recent.map(q=>'<button class="search-history-item" type="button" data-query="'+html(q)+'">'+icon('history')+html(q)+icon('forward')+'</button>').join('')+'<button class="mx-chip on" data-action="clear-search-history">Очистить историю</button>':'<p class="quiet">Здесь появятся недавние запросы.</p>')+'</section>':'')+'</div>'+
 '<div class="mx-discover-search" id="mx-search-moods">'+mobileSuggestions()+'</div><div id="search-results"></div>';
}
const trackCount=n=>n+' '+(n%10===1&&n%100!==11?'трек':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'трека':'треков');
const recentItems=()=>tracksFrom(recentTracks);
// Before anything plays, the wave takes its colours from the song heard last, not the first catalog entry.
function lastHeard(){return current||recentItems()[0]||tracks[0];}
const categoryTabs=[['trends','Тренды'],['genres','Жанры'],['releases','Новинки']];
const shelfHeader=(title,left='',right=searchLink)=>'<header class="mx-head shelf-header"><span>'+left+'</span><h1>'+title+'</h1><span>'+right+'</span></header>';
const titleLink=(title,href)=>'<h2 class="shelf-title"><a href="'+href+'">'+title+icon('forward')+'</a></h2>';
const browseIcon=name=>'<svg class="catalog-glyph" viewBox="0 0 64 64" aria-hidden="true"><use href="/art/catalog-symbols.svg#'+name+'"/></svg>';
const coverStack=(source,fallback)=>'<span class="shelf-stack" aria-hidden="true">'+(source.length>1?art(source[1]):'')+(source.length?art(source[0]):'<img src="'+fallback+'" alt="">')+'</span>';
const shortcut=(href,label,note,source,fallback)=>'<a class="shelf-shortcut" href="'+href+'">'+coverStack(source,fallback)+'<span><strong>'+label+'</strong><small>'+html(note)+'</small></span></a>';
const chartItems=()=>tracksFrom((rankedChart||[]).map(t=>t.id||t.trackId));
const statItems=key=>tracksFrom((liveStats?.[key]||[]).map(t=>t.id));
const chartShortcut=()=>'<div class="chart-glass" data-chart-color="'+chartHue()+'"><button class="chart-faves" type="button" data-action="play-chart-favorites"><span class="chart-visual"><img src="/art/chart.svg" alt=""></span><span><strong>Чарт Sway</strong><small>Слушать понравившееся</small></span>'+icon('play')+'</button><a class="chart-top" href="#discover/chart">Топ 100 '+icon('forward')+'</a></div>';
function syncChartColor(){
 clearTimeout(chartTimer);
 const el=$('[data-chart-color]');if(!el)return;
 const now=Date.now();el.style.setProperty('--chart-hue',chartHue(now));
 chartTimer=setTimeout(syncChartColor,chartPeriod-now%chartPeriod+30);
}
function catalogArtists(){
 const scores=new Map();
 // Real plays first; chart positions break ties and fill in while statistics are young.
 for(const a of liveStats?.artists||[]){const key=artistIdentity(a.name);scores.set(key,(scores.get(key)||0)+1000*(Number(a.plays)||0));}
 (rankedChart||[]).forEach((t,i)=>{
  for(const name of artistCredits(map.get(t.id||t.trackId)?.artist)){
   const key=artistIdentity(name);scores.set(key,(scores.get(key)||0)+Math.max(1,100-i));
  }
 });
 const hot=scores.size>0;
 const groups=[...artistIndex.values()].filter(p=>!hot||scores.has(p.slug)).sort((a,b)=>(scores.get(b.slug)||0)-(scores.get(a.slug)||0)||b.items.length-a.items.length||a.name.localeCompare(b.name,'ru'));
 return {hot,groups};
}
function artistShelf(groups,expanded=false){
 return '<div class="shelf-artists'+(expanded?' shelf-artists-grid':'')+'">'+groups.slice(0,expanded?150:12).map(p=>'<a href="#artist/'+encodeURIComponent(p.slug)+'"><img src="'+html(p.art)+'" alt="" loading="lazy"><strong>'+html(p.name)+'</strong><small>'+trackCount(p.items.length)+'</small></a>').join('')+'</div>';
}
function loadChart(force=false){
 if(chartJob||(!force&&Date.now()-chartTime<60000))return;
 // Live chart from listening statistics; the bundled editorial chart is the offline fallback.
 chartJob=fetch('/api/chart',{credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('chart_'+r.status);return r.json();}).then(data=>{
  if(!Array.isArray(data.items)||!data.items.length)throw new Error('chart_empty');
  rankedChart=data.items;liveStats=data;chartError=false;
 }).catch(()=>fetch('/chart.json').then(r=>r.json()).then(data=>{
  rankedChart=Array.isArray(data)?data:(Array.isArray(data.items)?data.items:[]);chartError=false;
 })).catch(()=>{chartError=true;}).finally(()=>{
  chartJob=null;chartTime=Date.now();
  const section=location.hash.split('/')[1];
  if(page!=='discover')return;
  if(['chart','trends','artists'].includes(section))render();
  else if(!section&&$('#discovery-artists')){
   const active=document.activeElement;
   refreshDiscoverSlots();
  }
 });
}
function discoverArtistShelf(){
 const {hot,groups}=catalogArtists();
 return titleLink(hot?'Популярные артисты':'Исполнители каталога','#discover/artists')+artistShelf(groups);
}
function chartEmpty(){
 if(offlineOnly()&&!rankedChart)return '<p class="shelf-empty">Подключись к интернету, чтобы открыть чарт.</p>';
 return chartError?'<p class="shelf-empty" role="status">Не удалось загрузить чарт. <button type="button" class="mx-chip" data-action="retry-chart">Повторить</button></p>':rankedChart?'<p class="shelf-empty">Чарт появится, когда слушатели поставят лайки или послушают треки.</p>':'<p class="loading" role="status">Загружаем чарт…</p>';
}
function chartRow(t,info,index){
 const pos=info?.position||(index+1);
 const prog=info?.progress||'same';
 const shiftSym=pos===1&&prog!=='new'?'👑':prog==='up'?'▲'+(info.shift>1?info.shift:''):prog==='down'?'▼'+(info.shift<-1?-info.shift:''):prog==='new'?'NEW':'—';
 const isExplicit=info?.explicit||t.explicit;
 const isPlaying=current?.id===t.id&&playing;
 return '<article class="chart-row '+(isPlaying?'playing':'')+'" data-row="'+t.id+'">'+
  '<div class="chart-rank-col"><span class="chart-pos">'+pos+'</span><span class="chart-shift '+(pos===1&&prog!=='new'?'crown':prog)+'" aria-hidden="true">'+shiftSym+'</span></div>'+
  '<button class="row-track" type="button" data-play="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'">'+
   '<span class="row-art">'+art(t)+(isPlaying?icon('pause'):icon('play'))+'</span>'+
   '<div class="row-meta">'+
    '<strong>'+html(t.title)+(isExplicit?' <span class="badge-e" aria-label="Explicit" title="Ненормативная лексика">E</span>':'')+'</strong>'+
    '<small>'+html(t.artist)+(info?.plays?' · '+playsLabel(info.plays):'')+'</small>'+
   '</div>'+
  '</button>'+
  '<div class="row-actions">'+
   button('heart','Мне нравится','data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+
   '<small class="row-time">'+time(t.seconds)+'</small>'+
  '</div>'+
 '</article>';
}
function playsLabel(n){
 const v=Number(n)||0, mod10=v%10, mod100=v%100;
 const word=mod10===1&&mod100!==11?'прослушивание':mod10>=2&&mod10<=4&&(mod100<10||mod100>=20)?'прослушивания':'прослушиваний';
 return (v>=1000?(v/1000).toFixed(v>=10000?0:1).replace('.',',')+' тыс.':String(v))+' '+word;
}
function chartView(){
 const items=chartItems();
 return '<div class="browse-view chart-view">'+shelfHeader('Чарт',backLink('#discover'))+
 '<section class="chart-hero"><div class="chart-hero-glow"></div><img src="/art/chart-hero.jpg" alt="Чарт"><h1>Чарт Sway</h1><p>'+(liveStats?.livePlays?'По прослушиваниям за 7 дней':'Самое популярное в Sway')+'</p>'+
 '<div class="chart-action-bar">'+
   '<button class="chart-action-btn" type="button" data-action="play-chart-favorites"><span class="action-circle">'+icon('personal')+'</span><small>Нравится</small></button>'+
   '<button class="chart-action-btn" type="button" data-action="download-chart"><span class="action-circle">'+icon('bolt')+'</span><small>Скачать</small></button>'+
   '<button class="chart-action-btn" type="button" data-action="chart-trailer"><span class="action-circle">'+icon('spark')+'</span><small>Трейлер</small></button>'+
   '<button class="chart-action-btn chart-play-main" type="button" data-action="play-chart" aria-label="Слушать чарт"><span class="action-circle">'+(playing&&playMode==='chart'?icon('pause'):icon('play'))+'</span><small>Слушать</small></button>'+
 '</div>'+
 '</section>'+
 '<div class="chart-sheet">'+
  '<div class="chart-sheet-header"><strong>Чарт</strong><small>'+(items.length?items.length+' треков · Топ 100':'Загрузка...')+'</small></div>'+
  '<div class="chart-set">'+(items.length?'<div class="chart-grid">'+items.map((t,i)=>chartRow(t,rankedChart?.find(x=>x.id===t.id||x.trackId===t.id),i)).join('')+'</div>':chartEmpty())+'</div>'+
 '</div></div>';
}
function trendsView(){
 const chartTop=chartItems().slice(0,5);
 const rising=statItems('trends');
 const discoveries=rising.length>=3?rising:tracks.slice(-20).reverse();
 return '<div class="browse-view trends-view">'+shelfHeader('Тренды',backLink('#discover'))+
 '<section class="shelf-section">'+titleLink('Чарт','#discover/chart')+
 '<div class="chart-set"><div class="chart-grid">'+
  chartTop.map((t,i)=>chartRow(t,rankedChart?.find(x=>x.id===t.id||x.trackId===t.id),i)).join('')+
 '</div></div></section>'+
 '<section class="shelf-section"><h2 class="title-link">'+(rising.length>=3?'Растут за неделю':'Открытия')+'</h2>'+
 rows(discoveries,true)+
 '</section></div>';
}
function catalogMixCards(tab=discoverMixTab){
 const genres=genreOptions(tracks,[...preferredGenres]).slice(0,8);
 const distinctGenres=new Set();
 const top=suggest().filter(t=>{const genre=genreOf(t);if(!genre||distinctGenres.has(genre))return false;distinctGenres.add(genre);return true;}).slice(0,5);
 const options=tab==='mood'?moods.filter(([id])=>tracks.some(t=>t.moods.includes(id))).map(([id,title])=>({title,attr:'data-wave-mood="'+id+'"',color:id})):
  tab==='genres'?genres.map((title,i)=>({title,attr:'data-wave-genre="'+html(title)+'"',color:moods[i%4][0]})):
  top.map((t,i)=>({title:recommendationTitle(t),attr:'data-wave-seed="'+html(t.id)+'"',color:moods[i%4][0]}));
 return options.map(({title,attr,color})=>'<button class="shelf-mix-card" type="button" '+attr+' data-mix-color="'+color+'"><small>Сет «Моей волны»</small><strong>'+icon('play')+html(title)+'</strong></button>').join('')+(!options.length?'<p class="quiet">Здесь пока нет подходящих треков.</p>':'');
}
function catalogMixes(){
 const controls=[['top','топ'],['genres','по жанру'],['mood','по настроению']];
 return '<div class="shelf-mix-head"><h2 class="shelf-title">Подборки для тебя</h2><div class="shelf-mix-tabs" role="group" aria-label="Виды подборок">'+controls.map(([id,title])=>'<button class="mx-chip '+(id===discoverMixTab?'on':'')+'" type="button" data-discover-mix="'+id+'" aria-pressed="'+(id===discoverMixTab)+'">'+title+'</button>').join('')+'</div></div><div class="shelf-mix-rail" aria-label="Подборки">'+catalogMixCards(discoverMixTab)+'</div>';
}
function switchDiscoverMix(newTab){
 if(newTab===discoverMixTab)return;
 const tabOrder=['top','genres','mood'];
 const prevIdx=tabOrder.indexOf(discoverMixTab);
 const nextIdx=tabOrder.indexOf(newTab);
 const dir=nextIdx>prevIdx?1:-1;
 discoverMixTab=newTab;
 const mixContainer=$('#discover-mixes');
 if(!mixContainer)return;
 for(const chip of mixContainer.querySelectorAll('[data-discover-mix]')){
  const active=chip.dataset.discoverMix===newTab;
  chip.classList.toggle('on',active);
  chip.setAttribute('aria-pressed',String(active));
 }
 const targetChip=mixContainer.querySelector('[data-discover-mix="'+newTab+'"]');
 targetChip?.focus({preventScroll:true});
 const rail=mixContainer.querySelector('.shelf-mix-rail');
 if(!rail||!motionAllowed()){
  if(rail)rail.innerHTML=catalogMixCards(newTab);
  return;
 }
 rail.style.transition='opacity 0.16s ease-out, transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1)';
 rail.style.opacity='0';
 rail.style.transform='translateX('+(-28*dir)+'px)';
 setTimeout(()=>{
  rail.innerHTML=catalogMixCards(newTab);
  rail.scrollLeft=0;
  rail.style.transition='none';
  rail.style.opacity='0';
  rail.style.transform='translateX('+(28*dir)+'px)';
  requestAnimationFrame(()=>{
   requestAnimationFrame(()=>{
    rail.style.transition='opacity 0.26s ease-out, transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)';
    rail.style.opacity='1';
    rail.style.transform='translateX(0)';
   });
  });
 },160);
}
function discoverView(section='',genre=''){
 if(section==='chart')return chartView();
 if(section==='trends')return trendsView();
 if(section==='russia')return russiaChart.view(shelfHeader('Чарт России',backLink('#discover')));
 if(section==='artists'){const {hot,groups}=catalogArtists();return '<div class="browse-view">'+shelfHeader(hot?'Популярные артисты':'Исполнители каталога',backLink('#discover'))+artistShelf(groups,true)+'</div>';}
 const title=categoryTabs.find(([key])=>key===section)?.[1];
 if(title){
  const genres=genreOptions(tracks,[...preferredGenres]);
  const releases=section==='releases'?newReleases(tracks):[];
  let content=section==='trends'?(chartItems().length?rows(chartItems(),true):chartEmpty()):releases.length?rows(releases,true):'<p class="shelf-empty">Здесь будут свежие загрузки. Треки без даты загрузки доступны в поиске и по жанрам.</p>';
  if(section==='genres')content='<div class="shelf-genre-links">'+genres.map(t=>'<a class="mx-chip '+(t===genre?'on':'')+'" href="#discover/genres/'+encodeURIComponent(t)+'">'+html(t)+'</a>').join('')+'</div>'+rows(tracks.filter(t=>!genre||genreOf(t)===genre));
  return '<div class="browse-view">'+shelfHeader(html(genre||title),backLink('#discover'))+'<div class="browse-category">'+content+'</div></div>';
 }
 const debut=newReleases(tracks,{max:8,perArtist:1});
 // Order: find, then what people play (chart, now, rising), external chart, mixes, artists, new.
 return '<div class="browse-view discover-view">'+shelfHeader('Что послушать')+'<a class="discover-search" href="#search">'+icon('search')+'<span>Трек, исполнитель или альбом</span>'+icon('forward')+'</a><nav class="catalog-icons" aria-label="Категории">'+categoryTabs.map(([id,label])=>'<a href="#discover/'+id+'">'+browseIcon(id)+'<span>'+label+'</span></a>').join('')+'</nav>'+
 '<section class="sway-chart-card" id="discover-chart">'+discoverChartCard()+'</section>'+
 '<div id="discover-live">'+discoverLive()+'</div>'+
 '<div id="discover-russia">'+russiaChart.shelf()+'</div>'+
 '<section id="discover-mixes" class="shelf-mixes">'+catalogMixes()+'</section>'+
 '<section class="shelf-artists-section" id="discovery-artists">'+discoverArtistShelf()+'</section>'+
 (debut.length?'<section class="shelf-releases">'+titleLink('Новое в каталоге','#discover/releases')+'<div class="shelf-release-rail">'+debut.map(t=>'<button class="shelf-release" type="button" data-play="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'">'+art(t)+'<strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></button>').join('')+'</div></section>':'')+'</div>';
}
// Late data (chart, moods, statistics) refreshes discover sections in place: a full rebuild would
// drop a tap or scroll that is already under way.
function refreshDiscoverSlots(){
 const active=document.activeElement;
 for(const [id,draw] of [['#discovery-artists',discoverArtistShelf],['#discover-chart',discoverChartCard],['#discover-live',discoverLive],['#discover-mixes',catalogMixes]]){
  const el=$(id);if(el&&!el.contains(active))el.innerHTML=draw();
 }
}
function discoverChartCard(){
 const items=chartItems().slice(0,5), live=!!liveStats?.livePlays;
 const head='<header class="scc-head"><a href="#discover/chart"><small>'+(live?'По прослушиваниям за 7 дней':'Самое популярное в Sway')+'</small><strong>Чарт Sway'+icon('forward')+'</strong></a>'+(items.length?button(playing&&playMode==='chart'?'pause':'play','Слушать чарт','data-action="play-chart"','icon scc-play'):'')+'</header>';
 if(!items.length)return head+chartEmpty();
 return head+'<ol class="scc-list">'+items.map((t,i)=>{
  const info=rankedChart?.find(x=>(x.id||x.trackId)===t.id), prog=info?.progress||'same';
  const mark=prog==='new'?'<em class="scc-new">NEW</em>':prog==='up'?'<em class="scc-up" aria-label="Поднялся">▲</em>':prog==='down'?'<em class="scc-down" aria-label="Опустился">▼</em>':'';
  return '<li><button type="button" data-play="'+t.id+'" data-row="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'"><b>'+(i+1)+'</b>'+art(t)+'<span><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></span>'+mark+'</button></li>';
 }).join('')+'</ol><a class="scc-more" href="#discover/chart">Весь топ-100'+icon('forward')+'</a>';
}
function discoverRail(title,items,note=t=>t.artist,cls=''){
 return '<section class="shelf-releases '+cls+'"><h2 class="shelf-title">'+title+'</h2><div class="shelf-release-rail">'+items.map(t=>'<button class="shelf-release" type="button" data-play="'+t.id+'" aria-label="Воспроизвести '+html(t.title)+'">'+art(t)+'<strong>'+html(t.title)+'</strong><small>'+html(note(t))+'</small></button>').join('')+'</div></section>';
}
function discoverLive(){
 const now=statItems('now'), rising=statItems('trends'), people=new Map((liveStats?.now||[]).map(r=>[r.id,r.people]));
 return (now.length?discoverRail('<span class="live-dot" aria-hidden="true"></span>Сейчас слушают'+(liveStats.nowCount>1?' <small>'+liveStats.nowCount+' чел.</small>':''),now.slice(0,12),t=>people.get(t.id)>1?people.get(t.id)+' слушают':t.artist,'shelf-now'):'')+
  (rising.length>=3?discoverRail('Растут за неделю',rising.slice(0,12),t=>t.artist,'shelf-rising'):'');
}
function mobileLikes(){
 const active=playing&&playMode==='likes', disabled=favoriteItems().length?'':'disabled';
 return '<div class="favorites-view">'+navHeader('Мне нравится',backLink('#library'),collectionSearchLink+button('more','Действия с избранным','data-action="favorites-menu"'))+
 '<section class="mx-heart"><img class="mx-heart-art" src="/art/favorites.svg" alt=""><h1>Мне нравится</h1><div class="mx-heart-actions"><div>'+button('download','Скачать треки','data-action="downloads" '+disabled)+'<span>Скачать</span></div><div>'+button(active?'pause':'play',active?'Пауза':'Слушать','data-action="play-liked" '+disabled,'icon mx-yellow')+'<span id="mx-favorite-label">'+(active?'Пауза':'Слушать')+'</span></div></div></section>'+favoriteChips()+
 '<div class="mx-gap mx-favorite-results">'+rows(favoriteItems(),true)+'</div></div>';
}
function collectionView(section=''){
 const items=tracksFrom([...likes].reverse());
 if(section==='playlists')return playlists.view();
 if(section==='offline')return offlineView();
 if(section==='artists')return '<div class="browse-view">'+shelfHeader('Любимые исполнители',backLink('#library'))+'<div class="browse-category">'+(favoriteArtists(true)||'<p class="shelf-empty">Добавь любимые треки, и здесь появятся их исполнители.</p>')+'</div></div>';
 if(section==='sources'){
  const entries=[...savedEmbeds.values()].reverse();
  return '<div class="browse-view">'+shelfHeader('Сохранённые ссылки',backLink('#library'),searchLink)+'<div class="browse-category">'+(entries.length?'<div class="saved-sources">'+entries.map(x=>'<article><div><strong>'+x.label+' · Яндекс Музыка</strong><small>'+html(new URL(x.original).pathname)+'</small></div>'+(x.embed?button('play','Открыть виджет','data-saved-embed="'+html(x.original)+'"'):'<a class="icon" href="'+html(x.original)+'" target="_blank" rel="noopener noreferrer" aria-label="Открыть оригинал">'+icon('arrow')+'</a>')+button('close','Убрать ссылку','data-save-embed="'+html(x.original)+'"')+'</article>').join('')+'</div>':'<p class="shelf-empty">Вставь ссылку из Яндекс Музыки в поиск и сохрани её, чтобы быстро открыть здесь.</p>')+'</div></div>';
 }
 const grid=[['#library/offline','Скачанное',trackCount(offlineTracks.size),'download'],['#library/playlists','Мои плейлисты','','library'],['#library/artists','Исполнители','','user'],['#settings','Настройки','','settings'],['#history','История','','history'],['#settings/import','Импорт плейлиста','','share']];
 return '<div class="browse-view collection-view">'+shelfHeader('Коллекция',profileLink,collectionSearchLink)+
 '<div class="collection-mix"><button class="mx-mix" type="button" data-action="play-collection"><small>Моя волна по коллекции</small><strong>'+icon('play')+'Коллекция</strong></button><p>У твоей музыки есть <span>цвет</span></p></div>'+
 '<section class="collection-favorites"><a class="shelf-shortcut" href="#liked">'+coverStack(items,'/art/favorites.svg')+'<span><strong>Мне нравится '+icon('forward')+'</strong><small>'+trackCount(items.length)+'</small></span></a>'+
 (items.length?rows(items.slice(0,3),true):'<div class="shelf-empty">Сохраняй треки сердечком, и они появятся здесь. <a href="#discover">Найти музыку '+icon('forward')+'</a></div>')+'</section>'+
 playlists.summary()+(items.length||preferredArtists.size?'<section class="collection-artists">'+titleLink('Любимые исполнители','#library/artists')+favoriteArtists()+'</section>':'')+
 '<section class="collection-more"><h2 class="shelf-title">Ещё у тебя в коллекции</h2><div class="collection-grid">'+grid.map(([href,label,note,glyph])=>'<a href="'+href+'"><span class="collection-cell-icon">'+(glyph==='favorites'?'<img src="/art/favorites.svg" alt="">':icon(glyph))+'</span><span>'+label+(note?'<small>'+note+'</small>':'')+'</span></a>').join('')+'</div></section></div>';
}
function historyView(){
 const list=recentItems();
 return '<div class="browse-view">'+shelfHeader('История',backLink('#discover'))+'<div class="browse-category">'+(list.length?rows(list)+'<button class="mx-chip on history-clear" type="button" data-action="clear-history">Очистить историю</button>':'<p class="shelf-empty">Здесь появятся треки, которые ты слушал.</p>')+'</div></div>';
}
const storageSize=bytes=>new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(bytes/1000000)+' МБ';
function savedItems(){
 return [...offlineTracks.values()].map(({track,cover})=>
  map.get(track.id)||(offlineMode?{...track,art:cover?offlineURL('art',track.id):'/art/logo.svg'}:track));
}
function syncOfflineUI(){
 for(const label of $$('[data-offline-readiness]'))label.textContent=offlineReadiness();
 for(const b of $$('[data-offline-toggle]')){
  const id=b.dataset.offlineToggle,t=map.get(id)||offlineTracks.get(id)?.track||current;
  if(!t||id!==t.id)continue;
  const saved=offlineTracks.has(id),busy=offlineJobs.has(id),glyph=saved?'check':'download';
  b.disabled=busy||!saved&&(offlineOnly()||navigator.onLine===false);
  b.classList.toggle('saved',saved);b.setAttribute('aria-busy',String(busy));
  b.setAttribute('aria-label',busy?'Сохраняем: '+t.title:saved?'Удалить из скачанного: '+t.title:'Скачать в Sway: '+t.title);
  if(b.querySelector('i')?.dataset.icon!==glyph)b.innerHTML=icon(glyph);
 }
 for(const label of $$('[data-offline-caption]'))label.textContent=offlineJobs.has(label.dataset.offlineCaption)?'Сохраняем…':offlineTracks.has(label.dataset.offlineCaption)?'Скачано':'Скачать';
 for(const b of $$('[data-action="stop-downloads"]'))b.hidden=!offlineBatch;
 for(const b of $$('[data-action="download-catalog"],[data-action="download-favorites"]'))b.disabled=!!offlineBatch||offlineOnly()||navigator.onLine===false;
 for(const label of $$('[data-offline-status]'))if(label.textContent!==offlineStatus)label.textContent=offlineStatus;
}
function offlineReadiness(){const saved=[...likes].filter(id=>offlineTracks.has(id)).length;return likes.size?saved===likes.size?'Избранное готово к офлайну · '+saved+' треков':'Избранное: '+saved+' из '+likes.size+' готово без интернета':'Лайкай треки, чтобы сохранить их для офлайна';}
function offlineFeedback(message){
 offlineStatus=message;for(const label of $$('[data-offline-status]'))label.textContent=message;
}
function queueLikedCache(delay=1200){
 clearTimeout(likedCacheTimer);
 if(!autoCacheLikes||!supportsOffline()||offlineOnly()||navigator.onLine===false||accountOffline)return;
 if(!connectionAllows(downloadPrefs,navigator.connection)){offlineFeedback(navigator.connection?.type?'Автозагрузка ждёт Wi‑Fi':'Браузер не определяет Wi‑Fi. Автозагрузка приостановлена; скачивай вручную.');return;}
 likedCacheTimer=setTimeout(()=>{
  if(offlineBatch){queueLikedCache(4000);return;}
  const items=tracksFrom([...likes]).filter(t=>!offlineFailed.has(t.id)||offlineFailed.get(t.id)<Date.now());
  downloadGroup(items,{automatic:true});
 },delay);
}
function refreshOfflineScreen(){
 if(page==='library'&&(offlineMode||location.hash==='#library/offline'))render();
 else syncOfflineUI();
}
async function waitForOfflineWorker(){
 const registration=await offlineRegistration;
 const worker=registration?.installing||registration?.waiting||registration?.active;
 if(!worker)throw new Error('unavailable');
 if(worker.state==='activated')return;
 await new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',check);error?reject(error):resolve();};
  const check=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('unavailable'));};
  const timer=setTimeout(()=>finish(new Error('unavailable')),12000);
  worker.addEventListener('statechange',check);check();
 });
}
async function saveForOffline(t,batch=null){
 if(!canDownload(t)||offlineJobs.has(t.id)||offlineTracks.has(t.id))return;
 const used=[...offlineTracks.values()].reduce((n,t)=>n+t.size,0)+[...offlineReservations.values()].reduce((n,v)=>n+v,0);
 if(!downloadFits(downloadPrefs,used,t.bytes||32*1024*1024))throw new Error('download_limit');
 const controller=batch?.controller||new AbortController();
 offlineReservations.set(t.id,t.bytes||32*1024*1024);
 offlineJobs.set(t.id,controller);syncOfflineUI();
 try{
  await waitForOfflineWorker();
  let shown=0;
  const saved=await saveOfflineTrack(t,canPlay,{signal:controller.signal,progress(bytes,total){
   if(performance.now()-shown<180)return;
   shown=performance.now();
   offlineFeedback((batch?batch.done+'/'+batch.total+' · ':'')+t.title+' · '+(total?Math.min(100,Math.floor(bytes/total*100))+'%':storageSize(bytes)));
  }});
  offlineTracks.set(t.id,saved);if(!map.has(t.id))map.set(t.id,t);
 }finally{offlineJobs.delete(t.id);offlineReservations.delete(t.id);syncOfflineUI();}
}
const offlineError=error=>error?.message==='download_limit'?'Достигнут лимит загрузок. Увеличь его в настройках или удали скачанное.':error?.name==='QuotaExceededError'?'На устройстве не осталось места. Удали несколько скачанных треков.':error?.message==='too_large'?'Этот аудиофайл слишком большой для сохранения в приложении.':'Не удалось сохранить трек. Проверь подключение и попробуй ещё раз.';
async function toggleOfflineTrack(id){
 const saved=offlineTracks.get(id),t=map.get(id)||saved?.track||current;
 if(t?.id!==id||offlineJobs.has(id)||!saved&&(!canDownload(t)||offlineOnly()))return;
 if(saved){
  try{
   await removeOfflineTrack(id);offlineTracks.delete(id);
   if((offlineOnly()||navigator.onLine===false)&&current?.id===id){
    pausePlayback();current=null;queue=queue.filter(x=>x!==id);audio.removeAttribute('src');audio.load();releaseSavedAudio();systemMedia.setTrack(null);
    if(dialog.open)dialog.close();
   }
   offlineFeedback('Трек удалён с устройства');refreshOfflineScreen();notice('Трек удалён с устройства');
  }catch{notice('Не удалось удалить трек.');}
  return;
 }
 offlineFeedback('Сохраняем «'+t.title+'»…');
 try{await saveForOffline(t);offlineFeedback('Трек сохранён на устройстве');refreshOfflineScreen();notice('Трек сохранён на устройстве');}
 catch(error){offlineFeedback(offlineError(error));notice(offlineError(error));}
}
async function downloadGroup(source,{automatic=false}={}){
 if(offlineBatch||offlineOnly()||navigator.onLine===false)return;
 const items=source.filter(t=>canDownload(t)&&!offlineTracks.has(t.id)&&!offlineJobs.has(t.id));
 if(!items.length){if(!automatic)offlineFeedback('Все доступные треки уже скачаны');return;}
 const job={controller:new AbortController(),total:items.length,done:0,failed:0,automatic};
 offlineBatch=job;syncOfflineUI();offlineFeedback('Готовим загрузку…');
 let problem='';
 try{
  for(const t of items){
   if(job.controller.signal.aborted)break;
   if(automatic&&(!autoCacheLikes||!likes.has(t.id)))continue;
   if(automatic&&!connectionAllows(downloadPrefs,navigator.connection)){problem='Автозагрузка ждёт Wi‑Fi';break;}
   try{await saveForOffline(t,job);job.done++;}
   catch(error){
    if(job.controller.signal.aborted)break;
    job.failed++;
    offlineFailed.set(t.id,Date.now()+300000);
    if(error?.name==='QuotaExceededError'||error?.message==='download_limit'){problem=offlineError(error);break;}
   }
  }
 }finally{
  offlineBatch=null;
  offlineFeedback(problem||(job.controller.signal.aborted?'Загрузка остановлена. ':'')+'Сохранено: '+job.done+' из '+job.total+(job.failed?' · Не удалось: '+job.failed:''));
  refreshOfflineScreen();
  if(automatic&&!problem&&!job.failed&&!job.controller.signal.aborted)queueLikedCache(2000);
 }
}
let offlineSort='recent', offlineQuery='';
function offlineSorted(){
 const stamp=t=>offlineTracks.get(t.id)?.savedAt||0;
 const items=savedItems();
 if(offlineSort==='artist')return items.sort((a,b)=>String(a.artist).localeCompare(String(b.artist),'ru')||String(a.title).localeCompare(String(b.title),'ru'));
 if(offlineSort==='title')return items.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ru'));
 return items.sort((a,b)=>stamp(b)-stamp(a));
}
function offlineDuration(items){
 const seconds=items.reduce((n,t)=>n+(Number(t.seconds)||0),0);if(!seconds)return '';
 const h=Math.floor(seconds/3600), m=Math.round(seconds%3600/60);
 return h?h+' ч '+m+' мин':m+' мин';
}
function offlineRows(items){
 if(!items.length)return '';
 return items.map(t=>'<article class="row offline-row" data-row="'+html(t.id)+'" data-offline-search="'+html((t.title+' '+t.artist).toLowerCase())+'"><button type="button" class="row-track" data-play="'+html(t.id)+'" aria-label="'+html('Воспроизвести '+t.title)+'"><span class="row-art">'+art({...t,art:offlineTracks.get(t.id)?.cover?offlineURL('art',t.id):t.art})+'</span><div><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></div></button><div class="row-actions"><small class="row-time">'+(t.seconds?time(t.seconds):'')+'</small>'+download(t)+'</div></article>').join('');
}
function offlineView(){
 const items=offlineSorted(),size=[...offlineTracks.values()].reduce((n,v)=>n+v.size,0);
 const missing=tracks.filter(t=>canDownload(t)&&!offlineTracks.has(t.id));
 const estimate=missing.reduce((n,t)=>n+(Number(t.bytes)||0),0);
 const length=offlineDuration(items);
 const sorts=[['recent','Недавние'],['artist','Исполнитель'],['title','Название']];
 queueMicrotask(syncOfflineStorage);
 return '<div class="browse-view offline-view">'+shelfHeader('Скачанное',offlineMode?'':backLink('#library'))+
 '<section class="offline-card offline-hero"><div class="offline-hero-top"><span class="offline-disc" aria-hidden="true">'+icon('download')+'</span><div><h1>Музыка без интернета</h1><p data-offline-count>'+trackCount(items.length)+' · '+storageSize(size)+(length?' · '+length:'')+'</p></div></div>'+
 '<div class="offline-meter" data-offline-meter hidden><span><i style="width:0%"></i></span><small></small></div>'+
 '<div class="offline-actions">'+(items.length?'<button class="btn primary" type="button" data-action="play-offline">'+icon('play')+'Слушать</button><button class="btn" type="button" data-action="shuffle-offline">'+icon('shuffle')+'Перемешать</button>':'')+
 (offlineMode?'<button class="btn" type="button" data-action="retry-account">Подключиться</button><a class="btn" href="#settings">Настройки</a>':manualOffline?'<button class="btn" type="button" data-action="leave-offline">Выйти из офлайн-режима</button>':missing.length?'<button class="btn" type="button" data-action="download-catalog">'+icon('download')+'Скачать каталог'+(estimate?' · '+storageSize(estimate):'')+'</button>':'')+
 '<button class="btn" type="button" data-action="stop-downloads" hidden>Остановить</button></div>'+
 '<p class="offline-status" data-offline-status role="status"></p></section>'+
 '<p class="quiet offline-readiness" data-offline-readiness>'+offlineReadiness()+'</p>'+
 (items.length?'<div class="offline-tools">'+(items.length>6?'<label class="offline-search">'+icon('search')+'<input type="search" data-offline-filter placeholder="Найти в скачанном" value="'+html(offlineQuery)+'" aria-label="Найти в скачанном"></label>':'')+
  '<div class="offline-sort" role="group" aria-label="Сортировка">'+sorts.map(([id,label])=>'<button type="button" class="mx-chip'+(offlineSort===id?' on':'')+'" data-offline-sort="'+id+'" aria-pressed="'+(offlineSort===id)+'">'+label+'</button>').join('')+'</div></div>'+
  '<p class="offline-hint">Смахни трек влево, чтобы удалить его с устройства</p>'+
  '<div class="rows offline-list" data-offline-list>'+offlineRows(items)+'</div><p class="shelf-empty" data-offline-nothing hidden>Ничего не нашлось</p>':
 '<section class="offline-empty"><span class="offline-empty-art" aria-hidden="true">'+icon('download')+'</span><h2>Здесь пока пусто</h2><p>'+(maintenance?'Пока идёт обновление, играют только скачанные треки. После обновления скачай любимое — оно будет доступно всегда.':offlineMode?'На этом устройстве пока нет скачанных треков.':'Нажми '+icon('download')+' у трека или скачай каталог целиком — музыка будет играть даже без интернета.')+'</p>'+(offlineMode?'':'<a class="btn primary" href="#discover">Найти музыку</a>')+'</section>')+'</div>';
}
function filterOfflineRows(){
 const q=offlineQuery.trim().toLowerCase();let shown=0;
 for(const row of $$('[data-offline-list] .offline-row')){const hit=!q||row.dataset.offlineSearch.includes(q);row.hidden=!hit;if(hit)shown++;}
 const none=$('[data-offline-nothing]');if(none)none.hidden=shown>0;
}
async function syncOfflineStorage(){
 const meter=$('[data-offline-meter]');if(!meter||!navigator.storage?.estimate)return;
 try{
  const {usage=0,quota=0}=await navigator.storage.estimate();if(!quota)return;
  const share=Math.min(100,usage/quota*100);
  meter.hidden=false;meter.querySelector('i').style.width=Math.max(2,share).toFixed(1)+'%';
  meter.querySelector('small').textContent='Занято '+storageSize(usage)+' из '+(quota>=1e9?new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(quota/1e9)+' ГБ':storageSize(quota))+' доступных браузеру';
 }catch{}
}
// Swipe a downloaded row left to remove it from the device (the same as its download toggle).
{
 let swipe=null;
 document.addEventListener('pointerdown',e=>{
  const row=e.target.closest?.('[data-offline-list] .offline-row');
  if(!row||e.pointerType==='mouse')return;
  swipe={row,x:e.clientX,y:e.clientY,dx:0,locked:null};
 },{passive:true});
 document.addEventListener('pointermove',e=>{
  if(!swipe)return;
  const dx=e.clientX-swipe.x, dy=e.clientY-swipe.y;
  if(swipe.locked===null&&Math.abs(dx)+Math.abs(dy)>10)swipe.locked=Math.abs(dx)>Math.abs(dy)*1.4&&dx<0;
  if(!swipe.locked)return;
  swipe.dx=Math.min(0,dx);swipe.row.style.transform='translateX('+swipe.dx+'px)';swipe.row.dataset.swiping=swipe.dx<-90?'remove':'';
 },{passive:true});
 const end=()=>{
  if(!swipe)return;
  const {row,dx,locked}=swipe;swipe=null;
  if(!locked)return;
  row.dataset.swallow=String(Date.now()+450);
  if(dx<-90){row.style.transform='translateX(-110%)';row.style.opacity='0';setTimeout(()=>row.querySelector('[data-offline-toggle]')?.click(),180);}
  else{row.style.transform='';delete row.dataset.swiping;}
 };
 document.addEventListener('click',e=>{const row=e.target.closest?.('.offline-row[data-swallow]');if(row&&Number(row.dataset.swallow)>Date.now()){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('pointerup',end,{passive:true});
 document.addEventListener('pointercancel',end,{passive:true});
}
const emptyPlayer='<h2 class="dialog-title">Плеер</h2><p class="quiet">Выбери трек в каталоге.</p>';
const fullCoverTrack=t=>t&&offlineTracks.get(t.id)?.cover&&(offlineOnly()||!navigator.onLine)?{...t,art:offlineURL('art',t.id)}:t;
const fullArtwork=t=>'<div class="full-artwork"><img class="full-cover" src="'+html(t.art)+'" alt="" draggable="false"><img class="full-peek" alt="" draggable="false" aria-hidden="true"></div>';

const fullTrackCopy=t=>{
  const parts=t.artists||splitArtists(t.artist);
  const artistHtml=parts.length>1
    ?'<button type="button" class="player-artist-btn" data-action="show-artists" data-artists="'+html(parts.join(','))+'">'+html(t.artist)+'</button>'
    :'<a class="player-artist-link" href="#artist/'+encodeURIComponent(slugify(parts[0]||t.artist))+'" data-close-player>'+html(t.artist)+'</a>';
  return '<div class="player-track-lines"><div class="player-track-copy"><h2>'+html(t.title)+(t.isExplicit?' <span class="badge-e">E</span>':'')+'</h2><p class="quiet">'+artistHtml+'</p></div></div>';
};
const fullToggle=(classes='icon')=>button(intendsPlayback()?'pause':'play',intendsPlayback()?'Пауза':'Воспроизвести','data-action="toggle"',classes);
const playerSeek=()=>'<div class="mx-seek-wrap"><progress id="mx-progress" value="0" max="1000"></progress><input class="full-seek" type="range" min="0" max="1000" value="0" aria-label="Перемотка"><span class="seek-preview" aria-hidden="true"></span></div><div class="mx-times"><span id="mx-elapsed">0:00</span><span id="mx-left">–:––</span></div><p id="full-time" hidden></p>';
function fullArtistLinks(t){
 const pictures=artistCredits(t.artist).slice(0,2).map(name=>{
  const artist=resolveArtist(name);
  const picture='<img src="'+html(artist?.art||t.art)+'" data-player-art-fallback="'+html(artist?.art&&artist.art!==t.art?t.art:'/art/logo.svg')+'" alt="">';
  return artist?'<a href="#artist/'+encodeURIComponent(artist.slug)+'" data-close-player aria-label="'+html('Исполнитель: '+name)+'">'+picture+'</a>':picture;
 });
 return '<div class="mx-full-artists">'+(pictures.join('')||'<img src="'+html(t.art)+'" alt="">')+'</div>';
}
const fullDock=t=>'<div class="full-dock" inert><button class="full-dock-track" type="button" data-action="full-top" aria-label="Вернуться к плееру"><img src="'+html(t.art)+'" alt=""><span><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></span></button>'+button('heart','Мне нравится','data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+fullToggle('icon dock-toggle')+'</div>';
function fullArtistCard(t){
 const artist=resolveArtist(artistCredits(t.artist)[0]);if(!artist)return '';
 const stats=community.artists[canonical(artist.name)]||{listeners:0};
 const description=artist.bio||[...new Set(artist.items.map(genreOf))].filter(Boolean).slice(0,2).join(' · ')+' · '+trackCount(artist.items.length)+' в Sway';
 return '<section class="full-artist-section"><a class="full-artist-card" href="#artist/'+encodeURIComponent(artist.slug)+'" data-close-player><img src="'+html(artist.art||t.art)+'" data-player-art-fallback="'+html(t.art)+'" alt="" loading="lazy"><span><strong>'+html(artist.name)+'</strong><small>'+stats.listeners.toLocaleString('ru-RU')+' слушателей в Sway за месяц</small><p>'+html(description)+'</p><b>Об исполнителе '+icon('forward')+'</b></span></a></section>';
}

function mobileFull(t){
 const inWave=isWaveMode()||playMode==='track-wave';
 const offline=offlineOnly();
 const heading=sourceName()||'Сейчас играет';
 const related=relatedMix(tracks,t,{likes,history:waveHistory}).slice(0,4);
 return '<section class="mx-full full-player" data-offline="'+offline+'" data-playing="'+intendsPlayback()+'">'+
''+
'<header><span>'+html(heading)+'</span>'+button('list','Очередь','data-action="queue"')+'</header>'+
 fullArtwork(t)+
 '<div class="mx-full-meta">'+fullArtistLinks(t)+fullTrackCopy(t)+button('share','Поделиться треком','data-action="share"')+button('more','О треке','data-action="track-info"')+'</div>'+
 playerSeek()+
 '<div class="mx-full-ctrl">'+(inWave?button('less','Пропустить и реже рекомендовать похожее','data-action="wave-less"'):button('shuffle','Перемешать','data-action="shuffle" aria-pressed="'+shuffle+'"'))+button('prev','Предыдущий трек','data-action="prev"')+fullToggle('icon mx-yellow')+button('next','Следующий трек','data-action="next"')+button('heart','Мне нравится','data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+'</div>'+
 '<div class="mx-full-extra">'+button(repeatIcon(),repeatLabel(),'data-action="repeat" data-repeat="'+repeat+'" aria-pressed="'+(repeat!=='off')+'"')+button('lyrics','Текст песни','data-player-lyrics aria-pressed="false"')+(download(t)||button('more','Действия с треком','data-action="track-info"'))+(offline?button('moon','Таймер сна','data-action="open-sleep-timer"')+'<a class="icon" href="#settings/equalizer" data-close-player aria-label="Эквалайзер">'+icon('sliders')+'</a>'+playlists.quickButton(t,button):'')+'</div>'+(offline?'':trackWaveButton(t))+'<p id="full-notice" role="status"></p>'+
 (!offline&&related.length?'<section class="full-related"><h3>Похожая музыка</h3>'+rows(related,true)+'</section>':'')+playlists.playerDestinations(t)+(!offline?fullArtistCard(t):'')+
 '<div class="mx-full-utilities">'+button('moon','Таймер сна','data-action="open-sleep-timer"')+(getSleepTimerStatus().active?'<span class="sleep-timer-badge">'+getSleepTimerStatus().label+'</span>':'')+button('share','Поделиться','data-action="share-card"')+playlists.quickButton(t,button)+'</div>'+
 '<div class="full-dock-space" aria-hidden="true"></div>'+fullDock(t)+'</section>';
}
function trackWaveButton(t,title='Волна по треку'){
 return '<button class="mx-mix track-mix animated-radio" type="button" data-track="'+html(t.id)+'" data-action="track-wave"><span class="radio-light" aria-hidden="true"></span><small>'+title+'</small><strong>'+icon('play')+html(t.title)+'</strong></button>';
}
function slideTrack(el,update,{direction=travel,distance=32,duration=350}={}){
 if(!el)return;
 const parent=el.parentElement;
 parent.querySelector(':scope > .track-ghost')?.remove();
 const effects=el.getAnimations?.()||[];for(const effect of effects)effect.cancel();
 if(!motionAllowed()||!el.animate||!el.getClientRects().length){update();return;}
 const ghost=el.cloneNode(true);ghost.removeAttribute('id');ghost.classList.add('track-ghost');ghost.setAttribute('aria-hidden','true');
 parent.append(ghost);update();
 ghost.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateX('+(-distance*direction)+'px)'}],{duration:duration*.77,easing:'ease-out'}).finished.catch(()=>{}).then(()=>ghost.remove());
 el.animate([{opacity:0,transform:'translateX('+(distance*direction)+'px)'},{opacity:1,transform:'none'}],{duration,easing:'cubic-bezier(.22,.75,.23,1)'});
}
function fitWaveTitle(title=document.querySelector('#mobile-wave-title')){
 if(!title)return;
 title.style.removeProperty('font-size');
 const style=getComputedStyle(title),width=title.clientWidth;
 if(!width)return;
 const canvas=fitWaveTitle.canvas||(fitWaveTitle.canvas=document.createElement('canvas'));
 const context=canvas.getContext('2d');context.font=style.font;
 const spacing=parseFloat(style.letterSpacing)||0;
 const textWidth=context.measureText(title.textContent).width+Math.max(0,[...title.textContent].length-1)*spacing;
 if(textWidth>width)title.style.fontSize=Math.floor(parseFloat(style.fontSize)*width/textWidth)+'px';
}
function refreshMobileWave(decoded=false){
 const root=$('#mx-wave-root'),t=lastHeard();if(!root||!t)return;
 if(root.dataset.track!==t.id&&!decoded){
  const cover=prepareArtwork(t.art);
  if(!cover.loaded){
   if(root.dataset.pendingTrack!==t.id){root.dataset.pendingTrack=t.id;Promise.race([cover.promise,new Promise(resolve=>setTimeout(resolve,650))]).then(()=>{if(root.isConnected&&(lastHeard())?.id===t.id){delete root.dataset.pendingTrack;refreshMobileWave(true);}});}
   return;
  }
 }
 waveLight?.setTrack(waveVisual(t));
 const old=root.querySelector('.mx-wave-surface.is-current');
 if(!old.dataset.coverTrack)setCoverColors(old,t);
 else if(old.dataset.coverTrack!==t.id){
  const next=root.querySelector('.mx-wave-surface:not(.is-current)');
  next.classList.remove('is-previous');setCoverColors(next,t);old.classList.remove('is-current');
  old.classList.add('is-previous');
  next.getBoundingClientRect();next.classList.add('is-current');
 }
 if(root.dataset.track!==t.id){
  const title=root.querySelector('#mobile-wave-title'), cover=root.querySelector('.mx-wave-cover:not(.track-ghost)'), name=root.querySelector('.mx-track-playing');
  const front=waveArtist(t);
  slideTrack(title,()=>{title.textContent=front;title.dataset.long=front.length>21;fitWaveTitle(title);},{distance:53});
  slideTrack(cover,()=>{cover.src=t.art;},{distance:39});
  setWavePhoto(root.querySelector('.mx-artist-photo'),t);
  slideTrack(name,()=>{name.textContent=t.title;},{distance:31});
  root.querySelector('.mx-track-idle').textContent=t.artist+' — '+t.title;
  root.querySelector('[data-wave-like]').dataset.like=t.id;
  root.dataset.track=t.id;
 }
 const launch=root.querySelector('.mx-start'), pause=root.querySelector('.mx-pause'), now=String(playing||starting);
 launch.setAttribute('aria-label',current?'Продолжить волну':'Слушать волну');
 if(root.dataset.playing!==now){
  const focused=document.activeElement;root.dataset.playing=now;
  if(focused===(now==='true'?launch:pause))(now==='true'?pause:launch).focus({preventScroll:true});
 }
}
function syncWaveSelection(){
 const chip=$('.wave-selection'), frame=$('.wave-deck-frame');if(!chip||!frame)return;
 const selected=selectedMixKey();
 if((frame.dataset.selection||'')===selected)return;
 const focused=document.activeElement;
 frame.dataset.selection=selected;chip.hidden=!selected;
 const heading=$('[data-wave-heading]');if(heading)heading.hidden=!!selected;
 if(selected){chip.querySelector('span').textContent=waveName();chip.setAttribute('aria-label',(waveMix?'Сбросить подборку «':'Сбросить настроение «')+waveName()+'»');}
 for(const item of frame.querySelectorAll('[data-deck-item]')){
  if(item.hasAttribute('data-deck-shortcut')){if(!deckUI)item.hidden=!selected;}
  else item.querySelector('button').setAttribute('aria-pressed',item.dataset.deckItem===selected);
 }
 const slot=selected?closestDeckSlot(selected):waveDeckSlot;
 const target=selected||waveDeckKey;
 deckUI?.visibility(slot,target);
 if(focused===chip&&chip.hidden)($(playing||starting?'.mx-pause':'.mx-start')||$('[data-action="wave"]'))?.focus();
 if(focused?.closest('[data-deck-item][hidden]'))frame.querySelector('.wave-deck').focus({preventScroll:true});
}
function rememberSearch(){
 if(collectionSearch())return;
 const input=search.trim(), q=parseYandexLink(input)?.original||input;
 if(q&&q.length<=140&&!/^<iframe\b/i.test(q))save('search-history',[q,...load('search-history',[]).filter(x=>x!==q)].slice(0,8));
}


function home(){return mobileHome();}
function catalog(){if(mobile.matches)return mobileSearch();
 return head('КАТАЛОГ','Поиск','Найди трек, исполнителя или жанр.')+'<label class="search-field">'+icon('search')+'<input id="search-query" type="search" aria-label="Трек, исполнитель или жанр" value="'+html(search)+'" placeholder="Например, электроника"></label><div id="search-results"></div>';
}
const collectionSearch=()=>location.hash==='#search/collection';
let providerJob, providerKey='', providerResults=[], providerStatus='', submittedYandex=null;
const sourceNote='';
function matching(){
 const scope=collectionSearch()?tracksFrom([...likes].reverse()):tracks;
 return searchTracks(scope,search);
}
const searchItems=()=>mergeMusic(matching(),providerResults);
let searchLimit=80,renderedSearchKey='';
function stopProviderSearch(){
 providerJob?.abort();providerJob=null;providerKey='';providerResults=[];providerStatus='';
}
function requestProviderSearch(q){
 if(q===providerKey)return;
 stopProviderSearch();providerKey=q;
 if(!q)return;
 const control=providerJob=new AbortController();
 providerStatus='loading';
 const delay=setTimeout(async()=>{
  const timeout=setTimeout(()=>{if(providerJob===control){control.abort();providerStatus='failure';searchResults();}},8000);
  try{
   const found=await searchCommons(q,{signal:control.signal,canPlay});
   if(control.signal.aborted||providerJob!==control)return;
   // Only persist favourites, queued items and playback history, not every query.
   const active=new Set([...likes,...queue,...recentTracks,current?.id]);
   for(const [id,t] of map)if(t.provider&&!active.has(id))map.delete(id);
   for(const t of found)map.set(t.id,t);
   providerResults=found;providerStatus='done';
  }catch{
   if(control.signal.aborted||providerJob!==control)return;
   providerStatus='failure';
  }finally{clearTimeout(timeout);}
  searchResults();
 },330);
 control.signal.addEventListener('abort',()=>clearTimeout(delay),{once:true});
}
let lyricsJob=null, lyricsKey='', lyricsResults=[];
function stopLyricsSearch(){
 lyricsJob?.abort();lyricsJob=null;lyricsKey='';lyricsResults=[];
 const sec=document.getElementById('lyric-search-section');if(sec)sec.remove();
}
function requestLyricsSearch(q){
 if(q===lyricsKey)return;
 stopLyricsSearch();lyricsKey=q;
 if(!q||q.length<3||collectionSearch())return;
 const control=lyricsJob=new AbortController();
 const delay=setTimeout(async()=>{
  try{
   const r=await fetch('/api/search-lyrics?q='+encodeURIComponent(q),{signal:control.signal});
   if(control.signal.aborted||lyricsJob!==control)return;
   if(r.ok){
    const d=await r.json();
    lyricsResults=Array.isArray(d.results)?d.results:[];
    if(lyricsResults.length && $('#search-query')?.value?.trim()===q){
     renderLyricResults();
    }
   }
  }catch{}
 },320);
 control.signal.addEventListener('abort',()=>clearTimeout(delay),{once:true});
}
function renderLyricResults(){
 const container=document.getElementById('search-results');
 if(!container||!lyricsResults.length)return;
 let el=document.getElementById('lyric-search-section');
 if(!el){
  el=document.createElement('div');
  el.id='lyric-search-section';
  el.className='lyric-search-section';
  container.appendChild(el);
 }
 el.innerHTML='<div class="section-head lyric-head"><h2>По строкам из песен</h2><p class="quiet">'+lyricsResults.length+' найдено в текстах</p></div>'+
  '<div class="lyric-results-list">'+
  lyricsResults.map(l=>{
   const t=map.get(l.id);
   return '<div class="lyric-card" data-play="'+html(l.id)+'">'+
    '<div class="lyric-card-art">'+(t?'<img src="'+html(t.art)+'" alt="" loading="lazy">':icon('music'))+'</div>'+
    '<div class="lyric-card-body">'+
      '<div class="lyric-card-names"><strong>'+html(l.title)+'</strong> · <small>'+html(l.artist)+'</small></div>'+
      '<p class="lyric-card-quote">«'+html(l.snippet)+'»</p>'+
    '</div>'+
    '<button type="button" class="btn icon primary lyric-play-btn" data-play="'+html(l.id)+'" aria-label="Слушать">'+icon('play')+'</button>'+
   '</div>';
  }).join('')+'</div>';
 sync();
}
function searchGroups(q){
 if(!q||collectionSearch())return '';const match=v=>normalizeSearch(v).includes(normalizeSearch(q));
 const artists=[...new Set(artistIndex.values())].filter(a=>match(a.name)).slice(0,8),albums=albumsData.filter(a=>match(a.title)).slice(0,8),lists=playlists.lists.filter(p=>match(p.name));
 const group=(title,entries)=>entries.length?'<section class="search-group"><h3>'+title+'</h3><div class="search-group-links">'+entries.join('')+'</div></section>':'';
 return group('Исполнители',artists.map(a=>'<a class="mx-chip" href="#artist/'+encodeURIComponent(a.name)+'">'+html(a.name)+'</a>'))+group('Альбомы',albums.map(a=>'<a class="mx-chip" href="#album/'+encodeURIComponent(a.id)+'">'+html(a.title)+'</a>'))+group('Мои плейлисты',lists.map(p=>'<a class="mx-chip" href="#library/playlists/'+p.id+'">'+html(p.name)+'</a>'));
}
function searchResults(){
 const result=$('#search-results');if(!result)return;
 const q=search.trim(), scoped=collectionSearch(), intro=$('#search-intro'), cards=$('#mx-search-moods');
 const key=String(scoped)+'|'+q;if(key!==renderedSearchKey){renderedSearchKey=key;searchLimit=80;}
 const input=$('#search-query');if(scoped){input.placeholder='Найти в коллекции';input.setAttribute('aria-label','Найти в коллекции');}
 if(intro)intro.hidden=!!q||scoped;
 if(cards)cards.hidden=!!q||scoped||searchTab==='history';
 const clear=$('.search-clear');if(clear)clear.hidden=!q;
 const looksLikeLink=/^(?:https?:|<iframe\b)/i.test(q);
 submittedYandex=scoped?null:parseYandexLink(q);
 requestProviderSearch(!scoped&&!looksLikeLink&&!submittedYandex&&q.length>=3&&q.length<=100?q:'');
 requestLyricsSearch(!scoped&&!looksLikeLink&&!submittedYandex&&q.length>=3&&q.length<=100?q:'');
 if(!q||scoped||looksLikeLink)stopLyricsSearch();
 const items=searchItems();
 const status=providerStatus==='loading'?'Ищем открытые записи…':providerStatus==='failure'?'Commons сейчас не отвечает. Показаны результаты Sway.':'';
 if(submittedYandex){
  const link=submittedYandex;
  result.innerHTML='<div class="search-sources provider-found"><b>'+link.label+' · Яндекс Музыка</b><span>'+(link.embed?'Доступ и длительность определяет Яндекс Музыка.':'Для этой ссылки доступно открытие на сайте Яндекс Музыки.')+'</span><div class="provider-actions">'+(link.embed?'<button class="btn primary" type="button" data-action="yandex-player">'+icon('play')+'Открыть виджет</button>':'')+'<a class="btn" href="'+html(link.original)+'" target="_blank" rel="noopener noreferrer">Оригинал '+icon('arrow')+'</a><button type="button" class="btn" data-save-embed="'+html(link.original)+'">'+icon(savedEmbeds.has(link.original)?'check':'plus')+(savedEmbeds.has(link.original)?'Сохранено':'Сохранить ссылку')+'</button></div></div>';
 }else{
  const empty=looksLikeLink&&!scoped?'Вставь ссылку с music.yandex.ru или код из меню «Поделиться» → «HTML-код».':scoped?'В коллекции ничего не нашлось.':'Ничего не нашлось. Попробуй другое название или имя исполнителя.';
  const scopeLink=scoped?'<a class="search-provider-link" href="#search">'+icon('arrow')+'Перейти к общему поиску</a>':'';
  const showResults=!(mobile.matches&&!q&&!scoped);
  result.innerHTML=(scoped?'<p class="search-scope">Только в коллекции</p>':'')+searchGroups(q)+(!showResults?'':items.length?rows(items.slice(0,searchLimit),mobile.matches):providerStatus==='loading'?'':'<p class="search-empty quiet">'+empty+'</p>')+
   (showResults&&items.length>searchLimit?'<div class="search-page-more"><span>Показано '+searchLimit+' из '+items.length+'</span><button type="button" class="mx-chip" data-action="search-more">Показать ещё</button></div>':'')+
   (status?'<p class="provider-status" role="status">'+status+'</p>':'')+scopeLink+(!q&&!scoped&&searchTab!=='history'?sourceNote:'');
 }
 sync();
}
function library(likedOnly,section){if(!likedOnly)return collectionView(section);if(mobile.matches)return mobileLikes();
 const items=tracksFrom([...likes].reverse());
 return head('ВАША МУЗЫКА',likedOnly?'Мне нравится':'Коллекция',user?'Понравившиеся треки доступны в твоём аккаунте.':'Понравившиеся треки сохраняются на этом устройстве.')+
 (items.length?'<div class="section-head"><h2>Понравившиеся</h2><button class="btn" data-action="play-liked">'+icon('play')+'Слушать</button></div>'+rows(items):'<section class="panel"><h2>Здесь будут любимые треки</h2><p class="quiet">Нажми на сердечко рядом с треком, чтобы сохранить его.</p><div><a href="#search" class="btn primary">Открыть каталог</a></div></section>');
}
const settingsTitle=(title,href='#settings')=>'<header class="settings-title">'+backLink(href)+'<h1>'+title+'</h1></header>';
const settingCopy=(title,desc='')=>'<span class="setting-copy"><strong>'+title+'</strong>'+(desc?'<small>'+desc+'</small>':'')+'</span>';
function settings(){
 const volume=Math.round(prefs.volume*100);
 const toggle=(name,title,desc,checked=prefs[name],disabled=false)=>'<label class="setting-row">'+settingCopy(title,desc)+'<input type="checkbox" role="switch" name="'+name+'" aria-label="'+title+'" '+(checked?'checked ':'')+(disabled?'disabled':'')+'></label>';
 const link=(href,title,desc)=>'<a class="setting-row" href="'+href+'">'+settingCopy(title,desc)+icon('forward')+'</a>';
 const subBack=offlineMode?'#library/offline':historyBackSettings;
 return '<div class="settings-view sway-settings">'+settingsTitle('Настройки',subBack)+(authError?'<p class="settings-error" role="alert">'+html(authError)+'</p>':'')+
 '<form id="settings-form"><h2 class="settings-group-title">Загрузки и память</h2>'+
 toggle('offlineMode','Офлайн-режим','Слушай скачанное без интернета',offlineOnly(),offlineMode)+
 toggle('autoCacheLikes','Сохранять «Мне нравится»','Автоматически на этом устройстве · '+[...likes].filter(id=>offlineTracks.has(id)).length+' из '+likes.size+' сохранено',autoCacheLikes,!supportsOffline())+
 toggle('wifiOnly','Автозагрузка только по Wi‑Fi',navigator.connection?.type?'Мобильный интернет не используется для автозагрузок':'Если браузер не определяет сеть, скачивай вручную',downloadPrefs.wifiOnly)+
 '<label class="setting-row">'+settingCopy('Память для музыки','Занято '+storageSize([...offlineTracks.values()].reduce((n,t)=>n+t.size,0)))+'<select name="downloadLimit" aria-label="Лимит памяти для музыки">'+[256,512,1024,2048,4096].map(n=>'<option value="'+n+'" '+(downloadPrefs.limitMB===n?'selected':'')+'>'+storageSize(n*1024*1024)+'</option>').join('')+'</select></label>'+
 '<p class="offline-status" data-offline-readiness>'+offlineReadiness()+'</p>'+
 '<p class="offline-status" data-offline-status role="status">'+html(offlineStatus)+'</p>'+
 '<button type="button" class="setting-row" data-action="clear-offline">'+settingCopy('Очистить память',offlineTracks.size?trackCount(offlineTracks.size)+' на устройстве':'Нет скачанных треков')+icon('forward')+'</button>'+
 '<h2 class="settings-group-title">Звук и воспроизведение</h2>'+link('#settings/equalizer','Эквалайзер',!eq.supported?'Недоступен в браузере':eq.state.enabled?'Своя настройка':'Выключен')+
 toggle('normalizeVolume','Ровная громкость','Плавно снижает громкость более громких записей',normalizeVolume,!eq.supported)+
 toggle('crossfade','Плавные переходы между треками',transitions.supported?'По ритму треков · до '+transitionSeconds+' секунд':'Недоступно в этом браузере',prefs.crossfade&&transitions.supported,!transitions.supported)+
 '<h2 class="settings-group-title">Моя музыка</h2>'+link('#settings/preferences','Уточнить предпочтения','Выбери любимые жанры для «Моей волны»')+
 link('#settings/import','Импорт медиатеки','Добавь найденные в Sway треки в избранное')+
 link('#stats/week','Моя музыка','Итоги, любимые исполнители и открытия')+
 '<h2 class="settings-group-title">Приложение</h2>'+
 link('#settings/shortcuts','Горячие клавиши')+
 '<button type="button" class="setting-row" data-action="install">'+settingCopy(isStandaloneApp()?'Sway установлен':'Sway на iPhone','Открывай с экрана «Домой» · бесплатно')+icon('download')+'</button>'+
 (nativeAudio?'':'<label class="setting-row setting-volume">'+settingCopy('Громкость по умолчанию')+
 '<span class="setting-slider"><input type="range" aria-label="Громкость по умолчанию" name="volume" min="0" max="100" value="'+volume+'"><output id="setting-volume-value" aria-hidden="true">'+volume+'%</output></span></label>')+
 toggle('autoplay','Следующий трек автоматически','Продолжать воспроизведение в очереди')+
 toggle('motion','Анимация интерфейса','Если выключить, движение станет спокойнее')+
 (supportsHaptics()?toggle('haptics','Тактильный отклик','Короткая вибрация при касании',hapticsEnabled):'')+
 (offlineMode?'':link('#profile','Профиль',html(user?.name||'Гостевой режим')))+
 '<div class="settings-state"><span id="settings-status" role="status"></span><button class="settings-retry" type="submit" hidden>Повторить</button></div></form></div>';
}
let historyBackSettings='#profile';
function settingsSubview(kind){
 const heading={preferences:'Предпочтения',shortcuts:'Горячие клавиши',import:'Импорт медиатеки'}[kind];
 const genres=genreOptions(tracks);
 const content=kind==='preferences'?tasteView({genres,icon}):
  kind==='shortcuts'?'<dl class="settings-hotkeys"><div><dt>Поиск</dt><dd><kbd>/</kbd></dd></div><div><dt>Воспроизвести или поставить на паузу</dt><dd><kbd>Пробел</kbd></dd></div><div><dt>Отключить или включить звук</dt><dd><kbd>M</kbd></dd></div></dl>':
  '<form id="library-import" class="library-import-form"><p class="quiet">Перенеси музыку в свою коллекцию Sway. Сначала проверим совпадения по названию и исполнителю.</p><label>Ссылка на открытый плейлист Яндекс Музыки или VK<input id="library-import-url" type="url" inputmode="url" placeholder="https://music.yandex.ru/playlists/…" maxlength="1200"></label><label>Название нового плейлиста<input id="library-import-name" maxlength="80" placeholder="Мой плейлист"></label><details><summary>Вставить список треков или JSON</summary><label for="library-import-text">До 1 000 строк «Исполнитель — Название». Можно вставить экспортированный список, если сервис не отдаёт его по ссылке.</label><textarea id="library-import-text" rows="7" maxlength="120000"></textarea></details><button type="submit" class="btn primary">Найти треки в Sway</button><div id="library-import-result" role="status"></div></form>';
 return '<div class="settings-view sway-settings settings-subview">'+settingsTitle(heading)+content+'</div>';
}
const hzLabel=value=>value<1000?value+' Гц':(value/1000).toLocaleString('ru')+' кГц';
function equalizerView(){
 return '<div class="settings-view equalizer-view"><h1>Эквалайзер</h1>'+
 '<section class="sway-eq-panel"><div class="eq-chart"><svg viewBox="0 0 360 180" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="eq-shade" x2="0%" y2="100%"><stop stop-color="#ffe960" stop-opacity=".17"/><stop offset="1" stop-color="#ffe960" stop-opacity="0"/></linearGradient></defs><path d="M0 90h360" stroke="#fff2" fill="none"/><path id="eq-area" fill="url(#eq-shade)"/><path id="eq-curve" fill="none" stroke="#ffeb72" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>'+
 '<div class="eq-sliders">'+equalizerBands.map((hz,i)=>'<label><input type="range" min="'+(-equalizerLimit)+'" max="'+equalizerLimit+'" step="1" aria-label="'+hzLabel(hz)+'" data-eq-band="'+i+'" value="'+eq.state.levels[i]+'" '+(eq.supported?'':'disabled')+'><span>'+hzLabel(hz)+'<output aria-hidden="true"></output></span></label>').join('')+'</div></div>'+
 '<label class="setting-row"><span class="setting-copy"><strong>Эквалайзер</strong><small>'+(eq.supported?'Для треков в плеере Sway':'Браузер не поддерживает эквалайзер')+'</small></span><input type="checkbox" role="switch" id="eq-enabled" aria-label="Эквалайзер" '+(eq.state.enabled?'checked':'')+' '+(eq.supported?'':'disabled')+'></label>'+
 '<div class="eq-preset-grid" role="group" aria-label="Готовые настройки">'+equalizerPresets.map(([name],i)=>'<button type="button" data-eq-preset="'+i+'" '+(eq.supported?'':'disabled')+'>'+name+icon('check')+'</button>').join('')+'</div></section></div>';
}
let equalizerFrame=0, drawnLevels=null;
function syncEqualizer(animate=false){
 const curve=$('#eq-curve');if(!curve)return;
 cancelAnimationFrame(equalizerFrame);
 const start=performance.now(), to=eq.state.enabled?[...eq.state.levels]:equalizerBands.map(()=>0), from=drawnLevels||to, area=$('#eq-area');
 function draw(now){
  if(!curve.isConnected)return;
  const time=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?Math.min(1,(now-start)/(motionAllowed()?250:115)):1;
  drawnLevels=to.map((v,i)=>v+(from[i]-v)*(1-time)**3);
  const points=drawnLevels.map((gain,i)=>[30+60*i,90-(82/equalizerLimit)*gain]);
  const shape=points.reduce((d,[x,y],i)=>{const [px,py]=points[i-1]||[0,90];const mid=(px+x)/2;return d+'C'+mid+' '+py+' '+mid+' '+y+' '+x+' '+y;},'M0 90')+'C345 '+points.at(-1)[1]+' 349 90 360 90';
  curve.setAttribute('d',shape);area.setAttribute('d',shape+'V180H0Z');
  if(time<1)equalizerFrame=requestAnimationFrame(draw);
 }
 draw(start);
 $$('[data-eq-band]').forEach(el=>{const value=eq.state.levels[Number(el.dataset.eqBand)],label=(value>0?'+':'')+value+' дБ';el.value=value;el.setAttribute('aria-valuetext',label);el.parentElement.querySelector('output').textContent=label;el.parentElement.dataset.gain=value>0?'boost':value<0?'cut':'flat';});
 $('#eq-enabled').checked=eq.state.enabled;
 $('.eq-chart').classList.toggle('eq-off',!eq.state.enabled);
 $$('[data-eq-preset]').forEach(el=>el.setAttribute('aria-pressed',eq.state.enabled&&equalizerPresets[+el.dataset.eqPreset][1].every((v,i)=>v===eq.state.levels[i])));
}
function applyEqualizer(animate=false){
 syncEqualizer(animate);eq.update();save('equalizer',eq.state);
 if(eq.state.enabled)systemMedia.prepare();
 settleEqualizer(beginEqualizer(),{announce:animate});
}
function beginEqualizer(){
 if(nativeAudio&&document.hidden&&!eq.routes(audio))return false;
 try{eq.setNormalization(normalizeVolume);const attempt=eq.activate({mix:prefs.crossfade||normalizeVolume});return attempt?.catch?attempt.catch(()=>false):attempt;}
 catch{return false;}
}
let equalizerAttempt=0;
function settleEqualizer(attempt,{announce=false,playbackRequest}={}){
 const round=++equalizerAttempt;
 const finish=ready=>{
  if(round!==equalizerAttempt||embedActive||playbackRequest!==undefined&&playbackRequest!==playRequest)return;
  if(nativeAudio&&!prefs.crossfade&&!normalizeVolume){
   if(ready&&eq.state.enabled)routeIOSAudio(audioElements[0]);
   else if(eq.routes(audio)&&!eq.routes(audioElements[1]))routeIOSAudio(audioElements[1]);
  }
  if(nativeAudio&&!ready&&eq.routes(audio))recoverNativeAudio();
  transitions.setVolume(prefs.volume);
  if(announce&&eq.state.enabled&&!ready)notice('Сейчас звук без эквалайзера. Выбери пресет, чтобы попробовать снова.');
 };
 if(attempt?.then)attempt.then(finish);else finish(attempt);
}
function recoverNativeAudio(){
 const old=audioElements.find(el=>el!==audio),replacement=document.createElement('audio');
 replacement.id=old.id;replacement.crossOrigin='anonymous';replacement.preload='none';
 old.replaceWith(replacement);eq.replaceElement(old,replacement);transitions.replaceStandby(replacement);
 attachAudio(replacement);systemMedia.attach(replacement);routeIOSAudio(replacement);
}
function routeIOSAudio(target){
 if(target===audio)return;
 if(!current){transitions.select(target);audio=target;return;}
 const from=audio, track=current, source=from.getAttribute('src'), position=from.currentTime;
 const resume=!!source&&(starting||!from.paused&&!from.ended);
 const request=++playRequest;
 from.pause();transitions.select(target);audio=target;
 if(source){
  target.src=source;
  if(position>0){
   try{target.currentTime=position;}catch{}
   target.addEventListener('loadedmetadata',()=>{
    if(audio===target&&track===current&&target.getAttribute('src')===source&&target.currentTime+0.2<position&&position<target.duration)target.currentTime=position;
   },{once:true});
  }
 }
 from.removeAttribute('src');from.preload='none';from.load();
 listening.position=null;starting=resume;playing=false;
 function end(error){
  if(request!==playRequest)return;
  starting=false;playing=!target.paused&&!target.ended&&!target.error;sync();
  if(error&&error.name!=='AbortError')notice('Нажми «Воспроизвести», чтобы продолжить.');
 }
 if(resume){try{target.play().then(()=>end(),end);}catch(error){end(error);}}
 updateTime();sync();
}
function dismissSplash(){
 const splash=document.getElementById('sway-splash');
 if(splash&&!splash.classList.contains('fading')){
  splash.classList.add('fading');
  setTimeout(()=>{try{splash.remove();}catch{}},220);
 }
}
function render(){
 dismissSplash();
 deckLifetime?.abort();deckUI=null;deckLifetime=null;waveLight=null;
 tasteLifetime?.abort();tasteLifetime=null;
 profileJob?.abort();
 if(!accountReady)return;
 playbackMetrics.ready();
 if(loginRequired&&!user&&!offlineMode){
  document.body.dataset.authGate='true';document.body.dataset.page='login';page='login';
  main.innerHTML=signInView({configured:loginConfigured,error:authError,offline:accountOffline});return;
 }
 delete document.body.dataset.authGate;
 const requestedHash=location.hash.slice(1),hash=offlineMode&&!/^(?:settings|library|liked|history)(?:\/|$)/.test(requestedHash)?'library/offline':requestedHash, parts=hash.split('/');
 if(parts[0]==='search'){
  let trackId=parts[1]||'';try{trackId=decodeURIComponent(trackId);}catch{}
  if(map.has(trackId))search=map.get(trackId).title;
 }
 page=['search','discover','library','liked','profile','settings','mood','artist','album','history','u','stats','join'].includes(parts[0])?parts[0]:hash==='about'?'settings':'home';
 mood=moods.find(m=>m[0]===parts[1]);if(page==='mood'&&!mood)page='home';
 document.body.dataset.page=page;
 if((['artist','album'].includes(page)||page==='library'))void loadCommunity();
 document.body.dataset.settingsView=page==='settings'?(parts[1]||''):'';
 document.body.toggleAttribute('data-offline-mode',offlineMode);
 if(page!=='search')stopProviderSearch();
 if(page==='home')main.innerHTML=home();
 if(page==='discover'){main.innerHTML=discoverView(parts[1],readGenre());if(!offlineOnly())loadChart();}
 if(page==='history')main.innerHTML=historyView();
 if(page==='stats'){main.innerHTML=navHeader('Моя музыка',backLink('#library'),'')+'<div class="stats-view" id="listening-stats"></div>';void mountListeningStats($('#listening-stats'),{account:accountListening,html,user,period:['week','month','year'].includes(parts[1])?parts[1]:'week',rows:ids=>rows(tracksFrom(ids))});}
 if(page==='join'){main.innerHTML=navHeader('Совместный плейлист',backLink('#library'),'')+'<section class="panel"><h1>Музыка вместе</h1><p>После присоединения плейлист появится в твоей коллекции.</p><button class="btn primary" type="button" data-join-playlist>Присоединиться</button><p role="status"></p></section>';const b=$('[data-join-playlist]');b.onclick=async()=>{b.disabled=true;try{if(!user){sessionStorage.setItem('sway.after-login',location.hash);location.href='/auth/yandex';return;}if(!/^[a-f0-9]{64}$/.test(parts[1]||''))throw new Error();const r=await api('/api/playlist-invites/'+parts[1],'POST');await playlists.load();location.hash='#library/playlists/'+r.id;}catch{main.querySelector('[role=status]').textContent='Приглашение истекло или недоступно.';b.disabled=false;}};}
 if(page==='search'){main.innerHTML=catalog();searchResults();}
 if(page==='library'||page==='liked')main.innerHTML=library(page==='liked',parts[1]);
 if(page==='profile'){main.innerHTML=mobileProfile();if(user&&!accountProfile)loadProfile();else syncProfileCover(main);}
 if(page==='u'){
  const handle=/^[a-z0-9_]{3,24}$/.test(parts[1])?parts[1]:'';
  main.innerHTML=navHeader('Профиль',backLink('#home'),'')+'<div class="mx-profile sway-profile" id="profile-data"><p class="panel quiet">'+(user&&handle?'Загружаем профиль…':user?'Профиль не найден.':'Войди в Sway, чтобы увидеть профиль.')+'</p></div>';
  if(user&&handle)loadProfile(handle);
 }
 if(page==='artist'){main.innerHTML=mobileArtist();const section=$('[data-artist-track]');if(section)setCoverColors(section,map.get(section.dataset.artistTrack));}
 if(page==='album')main.innerHTML=albumView();
 if(page==='settings'){
  const equalizer=parts[1]==='equalizer';
  main.innerHTML=equalizer?navHeader('Эквалайзер',backLink('#settings'),'')+equalizerView():['preferences','shortcuts','import'].includes(parts[1])?settingsSubview(parts[1]):settings();
  if(equalizer)syncEqualizer();
  else if(parts[1]==='preferences'){
   tasteLifetime=new AbortController();
   mountTaste($('.taste-view'),{artists:[...new Set(artistIndex.values())],preferredArtists,preferredGenres,save:persistTaste,icon,signal:tasteLifetime.signal,sourceFor:playbackURL,onFeedback:()=>pulse('like'),onPreviewStart:()=>{
    const resume=intendsPlayback(),id=current?.id;pausePlayback();
    return ()=>{if(resume&&current?.id===id&&audio.paused)play(current,undefined,playMode);};
   }});
  }
  else $('.setting-slider')?.style.setProperty('--volume',Math.round(prefs.volume*100)+'%');
 }
 if(page==='mood')main.innerHTML=(mobile.matches?navHeader('Подборка',backLink('#discover'),searchLink):'')+head('ПОДБОРКА',mood[1],mood[3])+'<div class="section-head"><button class="btn primary" data-action="play-mood">'+icon('play')+'Слушать подборку</button><a href="#moods" class="link">Все настроения</a></div>'+rows(tracks.filter(t=>t.moods.includes(mood[0])));
 const navPage=page==='search'?({'#library':'library','#liked':'library','#discover':'discover'}[searchBack]||'home'):page;
 for(const a of $$('[data-nav]')){const compact=a.closest('.mobile-nav'), active=a.dataset.nav===(compact?navPage:page)||(a.dataset.nav==='discover'&&page==='mood')||(compact&&a.dataset.nav==='library'&&['liked','profile','settings','artist','album','history','u'].includes(navPage));a.classList.toggle('active',!!active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 const dock=$('.mobile-nav');dock.style.setProperty('--dock-index',Math.max(0,[...dock.children].findIndex(a=>a.classList.contains('active'))));
 if(hash==='moods')requestAnimationFrame(()=>$('#moods')?.scrollIntoView({block:'start'}));
 sync();updateTime();syncOfflineUI();renderResume();
 syncChartColor();
 updateScrollUI();syncDockKeyboard();
 const frame=$('.wave-deck-frame');
 if(frame&&tracks.length){
  deckLifetime=new AbortController();const {signal}=deckLifetime;
  fitWaveTitle();window.addEventListener('resize',()=>fitWaveTitle(),{signal});
  document.fonts.ready.then(()=>{if(!signal.aborted)fitWaveTitle();});
  deckUI=mountWaveDeck(frame,{initial:waveDeckSlot,initialKey:waveDeckKey,maker:deckCard,size:()=>waveDeckChoices().length,onCenter:(slot,key)=>{waveDeckSlot=slot;waveDeckKey=key;},onTouchCenter:()=>pulse('tick'),signal});
  waveLight=mountWaveLight($('.wave-light'),{track:waveVisual(lastHeard()),getAudio:()=>audio,playing:playing||starting,started:!!current,motion:prefs.motion,pattern:'bloom',signal});
  if(selectedMixKey())deckUI.visibility(closestDeckSlot(selectedMixKey()),selectedMixKey(),false);
 }
 renderPromo();
 renderEditorial(p=>openEditorialPlaylist(p));
}
function readGenre(){const [,section,value]=location.hash.split('/');try{return section==='genres'?decodeURIComponent(value||''):'';}catch{return '';}}
function context(t){if(offlineOnly()||location.hash==='#library/offline')return savedItems();if(page==='search')return searchItems();if(page==='history')return recentItems();if(['#discover/chart','#discover/trends'].includes(location.hash))return chartItems();if(location.hash==='#discover/releases')return newReleases(tracks);if(page==='discover'&&readGenre())return tracks.filter(x=>genreOf(x)===readGenre());if(page==='artist'){const a=resolveArtist(location.hash.split('/')[1]);return a?(location.hash.split('/')[2]==='mix'?artistRadio(tracks,a):artistPopular(a)):[t];}if(page==='album')return (resolveAlbum(location.hash.split('/')[1])?.trackIds||[]).map(id=>map.get(id)).filter(Boolean);if(page==='mood')return tracks.filter(x=>x.moods.includes(mood[0]));if(['liked','library'].includes(page))return mobile.matches&&page==='liked'?favoriteItems():tracksFrom([...likes].reverse());return tracks.length?tracks:[t];}
function apply(){
 transitions.setVolume(prefs.volume);$('#volume').value=Math.round(prefs.volume*100);document.body.classList.toggle('gentle-motion',!prefs.motion);
 if(!prefs.autoplay||!prefs.crossfade)invalidateFade();
 waveLight?.setMotion(prefs.motion);
}
function syncChrome(){
 waveLight?.setCovered(dialog.open&&dialog.dataset.view==='full');
 const visible=dialog.open?dialog.querySelector('.full-player'):$('#mx-wave-root');
 const t=map.get(visible?.dataset.coverTrack||visible?.dataset.track)||lastHeard();
 const surface=dialog.open?playerSurface(t):page==='home'?waveSurface(waveVisual(t)):'#0b0e14';
 const root=document.documentElement;
 if(root.style.getPropertyValue('--system-surface')!==surface){root.style.setProperty('--system-surface',surface);document.querySelector('meta[name=theme-color]')?.setAttribute('content',surface);}
}
for(const layer of [dialog,sheet,editor])layer.addEventListener('close',()=>{const toast=$('#notice');if(toast?.parentElement===layer)document.body.append(toast);syncChrome();});
function syncPlaybackWait(){
 const waiting=String(starting||playing&&(audio.seeking||audio.readyState<3));
 if(dialog.dataset.waiting!==waiting)dialog.dataset.waiting=waiting;
 const root=$('#mx-wave-root');if(root&&root.dataset.waiting!==waiting)root.dataset.waiting=waiting;
}
function sync(){
 syncChrome();persistQueue();
 document.body.classList.toggle('has-track',!!current);setCoverColors(document.body,lastHeard());refreshMobileWave();syncWaveSelection();
 if(page!=='home')waveLight?.setTrack(lastHeard());waveLight?.setPlaying(playing||starting);
 $('#now-title').textContent=current?.title||'Sway';$('#now-artist').textContent=current?.artist||'Выберите трек';
 if($('#now-art').getAttribute('src')!==(current?.art||'/art/logo.svg'))$('#now-art').src=current?.art||'/art/logo.svg';
 const toggle=$('#toggle'), toggleIcon=intendsPlayback()?'pause':'play', toggleLabel=intendsPlayback()?'Пауза':'Воспроизвести';
 if(toggle.querySelector('i').dataset.icon!==toggleIcon)toggle.innerHTML=icon(toggleIcon);
 toggle.setAttribute('aria-label',toggleLabel);
 $('#shuffle').setAttribute('aria-pressed',shuffle);syncRepeatButton($('#repeat'));
 const mute=$('#mute');mute.setAttribute('aria-pressed',audio.muted);mute.setAttribute('aria-label',audio.muted?'Включить звук':'Выключить звук');
 if(mute.querySelector('i').dataset.icon!==(audio.muted?'mute':'volume')) mute.innerHTML=icon(audio.muted?'mute':'volume');
 const liked=$('.mx-heart [data-action="play-liked"]');if(liked){const key=playing&&playMode==='likes'?'pause':'play',label=key==='pause'?'Пауза':'Слушать';if(liked.querySelector('i')?.dataset.icon!==key){liked.innerHTML=icon(key);liked.setAttribute('aria-label',label);$('#mx-favorite-label').textContent=label;}}
 const chart=$('[data-action="play-chart"]');if(chart){const key=playing&&playMode==='chart'?'pause':'play';if(chart.querySelector('i')?.dataset.icon!==key){chart.innerHTML=icon(key);chart.setAttribute('aria-label',key==='pause'?'Пауза':'Слушать чарт');}}
 const like=$('#like-now');like.disabled=!current;like.setAttribute('aria-pressed',!!current&&likes.has(current.id));
 for(const row of $$('[data-row]'))row.classList.toggle('active',row.dataset.row===current?.id);
 for(const b of $$('[data-like]'))b.setAttribute('aria-pressed',likes.has(b.dataset.like));
 const wave=$('[data-action="wave"]'), active=isWaveMode()&&playing;
 if(wave&&wave.querySelector('i')?.dataset.icon!==(active?'pause':'play')) wave.innerHTML=icon(active?'pause':'play')+'<span>'+(active?'Пауза':'Слушать волну')+'</span>';
 if(dialog.open){
  const full=dialog.querySelector('.full-player');if(full)full.dataset.playing=String(intendsPlayback());
  for(const b of dialog.querySelectorAll('[data-action="toggle"]'))if(b.querySelector('i')?.dataset.icon!==toggleIcon){b.innerHTML=icon(toggleIcon);b.setAttribute('aria-label',toggleLabel);}
  dialog.querySelector('[data-action="shuffle"]')?.setAttribute('aria-pressed',shuffle);syncRepeatButton(dialog.querySelector('[data-action="repeat"]'));
 }
 syncPlaybackWait();requestSeekFrame();
 systemMedia.sync();
}
async function play(t,items,mode='track',direction=1,{start=true}={}){
 if(!t||loginRequired&&!user&&!offlineMode)return;
 if(offlineOnly()){
  if(!offlineTracks.has(t.id)){notice('Этот трек не скачан на устройство.');return;}
  if(items)items=items.filter(item=>offlineTracks.has(item.id));
 }
 invalidateFade();
 prepareArtwork(t.art);
 if(embedActive)closeEmbed();
 systemMedia.prepare();
 const request=++playRequest;starting=start;travel=direction;
 const playbackMetric=current&&current.id!==t.id?'next_audio':'first_audio';
 if(start)playbackMetrics.begin(playbackMetric);
 // Start Web Audio during the tap, before an offline file read can lose the gesture.
 const processing=start?beginEqualizer():null;
 // The second element also carries gapless switches without crossfade, so unlock it during the tap.
 if(start&&nativeAudio)transitions.unlock();
 const savedOnIOS=nativeAudio&&offlineTracks.has(t.id)&&(offlineOnly()||navigator.onLine===false||mode==='offline');
 let source=nativeAudio&&!savedOnIOS?t.audio:playbackURL(t);
 if(savedOnIOS){
  // WebKit's media loader can stall on a saved HTTP URL when the device is offline.
  if(savedAudioObject?.id===t.id)source=savedAudioObject.url;
  else{
   const blob=await readOfflineAudio(t.id).catch(()=>null);
   if(request!==playRequest)return;
   if(blob&&offlineTracks.has(t.id))source=URL.createObjectURL(blob);
  }
 }
 if(!source.startsWith('blob:'))source=progressive?.sourceFor(audio,source,t.seconds)||source;
 const priorMode=playMode;playMode=mode;if(!['wave','track-wave'].includes(mode)){waveMood='';waveMix=null;}if(items){queue=(items.some(x=>x.id===t.id)?items:[t,...items]).map(x=>x.id);nextUp='';unshuffled=null;if(!restoringQueue)queueSource=describeSource(mode);if(shuffle&&!restoringQueue&&!isWaveMode())shuffleQueue(t.id);}
 if(t.id!==current?.id){
  const prior=current;
  listening={position:0,seconds:0,recorded:false,chartRecorded:false};
  if(t.id===nextUp)nextUp='';
  current=t;audio.preload='auto';audio.src=source;updateTime();
  if(!restoringQueue)resumeLongTrack(audio,t);
  systemMedia.setTrack(t);
  if(dialog.open&&dialog.dataset.view==='full')paintFull(prior);
  if(modal==='queue')paintSheet();
 }else{
  if(audio.getAttribute('src')!==source&&(audio.error||offlineOnly()||navigator.onLine===false||source.startsWith('blob:'))){
   const element=audio,position=element.currentTime;
   element.src=source;
   element.addEventListener('loadedmetadata',()=>{if(audio===element&&current?.id===t.id&&element.getAttribute('src')===source&&position<element.duration)element.currentTime=position;},{once:true});
  }
  if(priorMode!==mode&&dialog.open&&dialog.dataset.view==='full')paintFull();
 }
 releaseSavedAudio(audio.getAttribute('src'));
 if(savedOnIOS&&source.startsWith('blob:'))savedAudioObject={id:t.id,url:source};
 if(!start){audio.pause();playing=false;sync();return;}
 sync();
 try{
  const playback=audio.play();
  settleEqualizer(processing,{playbackRequest:request});
  await playback.catch(async error=>{
   const fallback=playbackURL(t);
   if(request!==playRequest||!source.startsWith('blob:')||fallback===t.audio||error.name!=='NotSupportedError')throw error;
   audio.src=fallback;releaseSavedAudio();
   await audio.play();
  });
 }catch(e){if(request===playRequest&&e.name!=='AbortError')notice(savedOnIOS?'Не удалось начать воспроизведение скачанного трека.':'Не удалось начать воспроизведение. Попробуй ещё раз.');}
 finally{if(request===playRequest){starting=false;playing=!audio.paused&&!audio.ended&&!audio.error;sync();}}
}
function invalidateFade(){plannedNext=null;transitions.cancel();}
function queueNext(t){
 if(!current){play(t,[t]);return;}
 if(t.id===current.id){notice('Этот трек уже играет');return;}
 invalidateFade();queue=queue.filter(id=>id!==t.id);queue.splice(queue.indexOf(current.id)+1,0,t.id);nextUp=t.id;persistQueue();notice('Трек прозвучит следующим');
 if(modal==='queue')paintSheet();
}
function shuffled(ids){const list=[...ids];for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
// Shuffle is a real order, so the queue sheet, previous/next, crossfade preloading
// and the Android playback service all agree on the upcoming tracks.
function shuffleQueue(first=current?.id){
 const at=queue.indexOf(first),head=at<0?[]:[first,...(nextUp&&queue[at+1]===nextUp?[nextUp]:[])];
 unshuffled=[...queue];
 queue=[...head,...shuffled(queue.filter(id=>!head.includes(id)))];
}
function unshuffleQueue(){
 if(unshuffled){const present=new Set(queue),order=unshuffled.filter(id=>present.has(id)),known=new Set(order);queue=[...order,...queue.filter(id=>!known.has(id))];}
 unshuffled=null;
}
function setShuffle(value){
 invalidateFade();shuffle=value;
 if(isWaveMode())refreshWaveQueue();
 else{if(shuffle)shuffleQueue();else unshuffleQueue();persistQueue();if(modal==='queue')paintSheet();}
 sync();
}
const repeatModes=['off','all','one'];
const repeatIcon=()=>repeat==='one'?'repeat-one':'repeat';
const repeatLabel=()=>repeat==='one'?'Повтор трека':repeat==='all'?'Повтор очереди':'Повтор выключен';
function syncRepeatButton(b){
 if(!b)return;
 b.setAttribute('aria-pressed',repeat!=='off');b.setAttribute('aria-label',repeatLabel());b.dataset.repeat=repeat;
 if(b.querySelector('i')?.dataset.icon!==repeatIcon())b.innerHTML=icon(repeatIcon());
}
function pausePlayback(){playbackMetrics.cancel();rememberLongPosition();++playRequest;invalidateFade();starting=false;if(scrub)scrub.resume=false;audio.pause();playing=false;sync();}
function seekPlayback(seconds,fast=false){
 if(!Number.isFinite(audio.duration)||!Number.isFinite(seconds))return;
 transitions.rewind();
 const offset=Math.max(0,Math.min(audio.duration,seconds));
 if(fast&&audio.fastSeek)audio.fastSeek(offset);else audio.currentTime=offset;
}
function toggle(){if(!current){const items=tracksFrom(queue);play(items[0]||tracks[0],items.length?items:tracks);return;}if(starting||!audio.paused)pausePlayback();else{if(audio.error){audio.load();}play(current,undefined,playMode);}}
function automaticTrack(){
 if(!current||repeat==='one'||isEndOfTrackSleep()||!prefs.autoplay&&repeat!=='all')return null;
 const i=queue.indexOf(current.id), neighbor=queue[i+1];
 if(isWaveMode()&&i===queue.length-1){
  if(!plannedNext||plannedNext.order!==queue||plannedNext.from!==current.id){
   const order=waveOrder(waveMood,waveExplorer,waveMix);
   const first=order.find(t=>t.id!==current.id);
   plannedNext={order:queue,from:current.id,to:first,items:first?[first,...order.filter(t=>t.id!==first.id)]:undefined};
  }
  return plannedNext.to||null;
 }
 if(neighbor||isWaveMode())return map.get(neighbor)||null;
 // Repeat-all starts the queue over; a single track restarts in step().
 return repeat==='all'&&queue.length>1?map.get(queue[0])||null:null;
}
function commitTransition(incoming,t,playAttempt){
 const prior=current;
 if(plannedNext?.items){queue=plannedNext.items.map(item=>item.id);nextUp='';}
 audio=incoming;current=t;plannedNext=null;travel=1;starting=false;playing=true;
 playbackMetrics.committed();
 if(t.id===nextUp)nextUp='';
 listening={position:audio.currentTime,seconds:Math.min(transitionSeconds,audio.currentTime),recorded:false,chartRecorded:false};
 systemMedia.setTrack(t);rememberPlayed();
 if(dialog.open&&dialog.dataset.view==='full')paintFull(prior);
 if(modal==='queue')paintSheet();
 sync();updateTime();
 playAttempt?.catch(()=>{if(audio===incoming&&current===t&&audio.paused){playing=false;sync();notice('Нажми «Воспроизвести», чтобы продолжить.');}});
}
function step(delta,ended=false,forceNeighbor=false,recordSkip=true){
 if(!queue.length){if(!ended)toggle();return;}
 // The end-of-track timer must win over repeat and autoplay, otherwise the next track starts anyway.
 if(ended&&checkTrackEndSleep({onTrigger:()=>{invalidateFade();pausePlayback();toast('Музыка остановлена по таймеру');}}))return;
 if(ended&&(repeat==='one'||repeat==='all'&&queue.length===1&&!isWaveMode())){seekPlayback(0);play(current,undefined,playMode);return;}
 if(delta<0&&!forceNeighbor&&audio.currentTime>3){seekPlayback(0);return;}
 if(ended){
  const next=automaticTrack();
  if(next){const upcoming=plannedNext?.items;if(!transitions.finish(next))play(next,upcoming,playMode,1);}
  else{invalidateFade();if(isWaveMode()&&prefs.autoplay)startWave(waveMood,{explore:waveExplorer,mix:waveMix,mode:playMode});}
  return;
 }
 const start=intendsPlayback()||!audio.paused;
 if(start)playbackMetrics.begin('next_audio');
 const i=queue.indexOf(current?.id);
 if(delta===1&&recordSkip&&!listening.recorded&&audio.readyState>0&&!audio.error)saveWaveSignal('skip');
 const prepared=delta===1&&start?map.get(queue[i+1]):null;
 if(prepared&&transitions.preparedId===prepared.id&&transitions.finish(prepared,{manual:true}))return;
 if(delta===1){
  if(isWaveMode()){
   if(i+1<queue.length)play(map.get(queue[i+1]),undefined,playMode,delta,{start});
   else startWave(waveMood,{explore:waveExplorer,mix:waveMix,start,mode:playMode});
   return;
  }
 }
 const n=(i+delta+queue.length)%queue.length;
 play(map.get(queue[n]),undefined,playMode,delta,{start});
}
function wave(){
 if(isWaveMode()&&current){toggle();return;}
 startWave('',{first:!current&&!waveHistory.length&&!likes.size?tracks[0]:null});
}
function waveOrder(key,explore,mix){
 const options={...recommendOptions(),mood:key,explore:explore||shuffle};
 const rawPool=offlineOnly()||navigator.onLine===false?tracks.filter(t=>offlineTracks.has(t.id)):tracks;
 const pool=applyWaveFiltersToPool(rawPool.filter(t=>!lessTracks.has(t.id)),waveFilters,{likes,history:waveHistory});
 if(mix?.seedId)return relatedMix(pool.filter(t=>t.id!==current?.id),map.get(mix.seedId),options);
 if(mix?.artist){const artist=resolveArtist(mix.artist);return artist?rankWave(artistRadio(pool,artist),options).slice(0,60):[];}
 const candidates=tracksInMix(pool,mix),avoidCount=Math.min(20,Math.floor(candidates.length/3)),avoid=avoidCount?waveHistory.slice(-avoidCount).map(x=>x.id):[];
 return rankWave(candidates,{...options,exclude:avoid}).slice(0,60);
}
function startWave(key='',{first=null,explore=false,mix=null,start=true,mode='wave'}={}){
 const order=waveOrder(key,explore,mix);
 if(!order.length){notice(offlineOnly()?'В этой подборке нет скачанных треков.':'В этой подборке пока нет подходящих треков.');return;}
 // Catalog enrichment replaces track objects. Identity must follow the song ID,
 // otherwise a refreshed catalog can replay the current song when shaking.
 const opening=(first&&order.find(t=>t.id===first.id))||order.find(t=>t.id!==current?.id)||order[0];
 waveMood=key;waveMix=mix;waveExplorer=explore;
 play(opening,[opening,...order.filter(t=>t.id!==opening.id)],mode,1,{start});return true;
}
function chooseWaveMood(id,b){
 if(!moods.some(m=>m[0]===id))return;
 const slot=b?.closest('[data-deck-slot]')?.dataset.deckSlot;
 if(slot!==undefined)waveDeckSlot=Number(slot);
 if(isWaveMode()&&waveMood===id){deckUI?.center(closestDeckSlot(id));if(audio.paused)toggle();return;}
 startWave(id);
}
function chooseWaveGenre(b){
 const genre=b.dataset.waveGenre, slot=b.closest('[data-deck-slot]')?.dataset.deckSlot;
 const mix={key:'genre-'+genre,genre,title:b.dataset.waveTitle||genre,slot:slot===undefined?null:Number(slot)};
 if(isWaveMode()&&waveMix?.key===mix.key){if(mix.slot!==null){waveMix.slot=mix.slot;deckUI?.visibility(mix.slot,mix.key);}if(audio.paused)toggle();return;}
 startWave('',{mix});
}
function chooseRecommendation(b){
 const t=map.get(b.dataset.waveSeed);if(!t)return;
 const item=b.closest('[data-deck-slot]');
 const mix={key:'seed-'+t.id,slot:item?Number(item.dataset.deckSlot):null,seedId:t.id,title:b.dataset.waveTitle||recommendationTitle(t)};
 if(isWaveMode()&&waveMix?.key===mix.key){if(audio.paused)toggle();return;}
 startWave('',{mix});
}
function chooseWaveStation(b){
 const station=waveStations.find(item=>item.key===b.dataset.waveStation);if(!station)return;
 const slot=b.closest('[data-deck-slot]')?.dataset.deckSlot;
 const mix={key:'station-'+station.key,station:station.key,title:station.title,palette:station.palette,slot:slot===undefined?null:Number(slot)};
 if(isWaveMode()&&waveMix?.key===mix.key){if(mix.slot!==null){waveMix.slot=mix.slot;deckUI?.visibility(mix.slot,mix.key);}if(audio.paused)toggle();return;}
 startWave('',{mix});
}
function chooseWaveArtist(b){
 const artist=resolveArtist(b.dataset.waveArtist);if(!artist)return;
 const slot=b.closest('[data-deck-slot]')?.dataset.deckSlot;
 const mix={key:'artist-'+artist.slug,artist:artist.name,title:'В стиле '+artist.name,slot:slot===undefined?null:Number(slot)};
 if(isWaveMode()&&waveMix?.key===mix.key){if(mix.slot!==null){waveMix.slot=mix.slot;deckUI?.visibility(mix.slot,mix.key);}if(audio.paused)toggle();return;}
 startWave('',{mix});
}
function refreshWaveQueue(){
 if(playMode!=='wave'||!current)return;
 const index=queue.indexOf(current.id);if(index<0||index===queue.length-1)return;
 const upcoming=new Set(queue.slice(index+1));
 // Keep the buffered neighbor when listening feedback reranks the rest of the wave.
 const prepared=transitions.preparedId;
 const first=upcoming.has(nextUp)?nextUp:upcoming.has(prepared)?prepared:null;
 const ranked=rankWave(tracks.filter(t=>upcoming.has(t.id)&&t.id!==first),{...recommendOptions(),mood:waveMood,explore:waveExplorer||shuffle});
 // The explicit queue order also includes tracks added outside the current mood.
 const order=[...new Set([...ranked.map(t=>t.id),...upcoming])].filter(id=>id!==first);
 queue=[...queue.slice(0,index+1),...(first?[first]:[]),...order];
 if(queue[index+1]!==[...upcoming][0])invalidateFade();
 if(modal==='queue')paintSheet();
}
function saveWaveSignal(kind){
 if(!current||listening.recorded)return;
 listening.recorded=true;
 waveHistory=recordWaveSignal(waveHistory,current.id,kind);
 save('wave-history',waveHistory);refreshWaveQueue();refreshSuggestions();
}
window.addEventListener('sway-native-track',event=>{
 const d=event.detail,t=map.get(d.trackId);if(!t||current?.id===t.id)return;const el=audioElements[d.channel];if(el!==audio)return;
 current=t;playing=!d.paused;starting=false;listening={position:d.currentTime,seconds:0,recorded:false,chartRecorded:false};systemMedia.setTrack(t);rememberPlayed();
 checkTrackEndSleep({onTrigger:()=>{pausePlayback();toast('Музыка остановлена по таймеру');}});
 sync();if(page==='home')render();
});
function rememberPlayed(){
 if(!current||audio.paused||recentTracks[0]===current.id)return;
 recentTracks=[current.id,...recentTracks.filter(id=>id!==current.id)].slice(0,40);
 rememberRemote(current);
 save(recentKey(),recentTracks);
}
function clearHistory(){if(user)void api('/api/history','DELETE').catch(()=>notice('История на этом устройстве очищена. Для очистки в аккаунте нужно подключение.'));recentTracks=[];waveHistory=[];save(recentKey(),recentTracks);save('wave-history',waveHistory);refreshSuggestions();render();}
// Long recordings (mixes, live sets) continue from the last second instead of starting over.
const longTrackSeconds=600;
let longPositions=load('long-positions',{});if(!longPositions||typeof longPositions!=='object'||Array.isArray(longPositions))longPositions={};
function rememberLongPosition(){
 if(!current||current.provider||!(audio.duration>=longTrackSeconds)||audio.seeking)return;
 const at=audio.currentTime,left=audio.duration-at,known=current.id in longPositions;
 if(at>=30&&left>=30)longPositions[current.id]=Math.floor(at);else if(known)delete longPositions[current.id];else return;
 longPositions=Object.fromEntries(Object.entries(longPositions).slice(-50));save('long-positions',longPositions);
}
function resumeLongTrack(element,t){
 const at=Number(longPositions[t.id]);if(!(at>=30))return;
 element.addEventListener('loadedmetadata',()=>{
  if(audio!==element||current!==t||!(element.duration>=longTrackSeconds)||at>element.duration-30)return;
  element.currentTime=at;notice('Продолжаем с '+time(at));
 },{once:true});
}
function measureListening(){
 if(!current||audio.seeking||audio.paused)return;
 const t=audio.currentTime, delta=listening.position===null?0:t-listening.position;
 listening.position=t;
 if(delta>0&&delta<=2.5)listening.seconds+=delta;
 if(listening.seconds>=Math.min(36,Math.max(12,(audio.duration||current.seconds)*.22)))saveWaveSignal('listen');
 if(user&&!current.provider&&!offlineOnly()&&!listening.chartRecorded&&listening.seconds>=Math.min(30,Math.max(3,(audio.duration||current.seconds)*.55))){
  listening.chartRecorded=true;
  api('/api/chart/listen','POST',{track:current.id}).then(()=>{chartTime=0;}).catch(()=>{});
 }
}
const seekControl='#seek,.full-seek,.wave-seek';
let scrub=null, playheadFrame=0, lastPlayhead=0, scrubFrame=0;
const positionRatio=(position,total)=>total>0&&Number.isFinite(total)?Math.min(1,Math.max(0,position/total)):0;
function drawMobileSeek(wrap,f){
 const progress=wrap._progress||(wrap._progress=wrap.querySelector('progress'));
 progress.value=f*1000;wrap.style.setProperty('--seek-fraction',f);
}
function requestSeekFrame(){
 if(playheadFrame||!mobile.matches||audio.paused||document.hidden||scrub)return;
 if(!((dialog.open&&dialog.dataset.view==='full')||$('#mx-wave-root')))return;
 playheadFrame=requestAnimationFrame(now=>{
  playheadFrame=0;
  if(!scrub&&now-lastPlayhead>=30){
   lastPlayhead=now;
   const f=positionRatio(audio.currentTime,audio.duration);
   if(dialog.open){
    const seek=dialog.querySelector('.mx-seek-wrap');if(seek)drawMobileSeek(seek,f);
   }else if($('#mx-wave-root'))$('#mx-wave-root').style.setProperty('--played',(f*100)+'%');
  }
  requestSeekFrame();
 });
}
document.addEventListener('visibilitychange',requestSeekFrame);
function syncSeek(input,f,total,position){
 if(!input)return;
 input.disabled=!(total>0&&Number.isFinite(total));
 if(input!==scrub?.element)input.value=Math.round(f*1000);
 input.setAttribute('aria-valuetext',time(position)+' из '+time(total));
}
function paintScrub(){
 const total=audio.duration, ready=Number.isFinite(total)&&total>0;
 if(scrub&&(!scrub.element.isConnected||scrub.track!==current?.id||!ready))scrub=null;
 const position=scrub?Number(scrub.element.value)/1000*total:audio.currentTime;
 const f=positionRatio(position,total);
 const homeSeek=$('.wave-seek');
 if(homeSeek){homeSeek.parentElement.hidden=!ready;syncSeek(homeSeek,f,total,position);}
 const seek=dialog.querySelector('.mx-seek-wrap');
 if(seek){
  drawMobileSeek(seek,f);
  const dragging=seek.contains(scrub?.element||null);
  seek.toggleAttribute('data-scrubbing',dragging);
  if(dragging)seek.querySelector('.seek-preview').textContent=time(position);
  $('#mx-elapsed').textContent=time(position);$('#mx-left').textContent=ready?time(total):'–:––';
 }
 $('#elapsed').textContent=time(position);$('#duration').textContent=time(total);syncSeek($('#seek'),f,total,position);$('#progress').value=f*100;
 const fullSeek=$('.full-seek');if(fullSeek){syncSeek(fullSeek,f,total,position);$('#full-time').textContent=time(position)+' / '+time(total);}
 $('.player').style.setProperty('--played',(f*100)+'%');
 $('#mx-wave-root')?.style.setProperty('--played',(f*100)+'%');
 return position;
}
function updateTime(){
 accountListening.tick(current?.id||'',audio.currentTime,!audio.paused&&!audio.seeking);
 eq.measure(audio,current?.id);const standby=audioElements.find(el=>el!==audio);if(standby)eq.measure(standby,transitions.preparedId);
 if(Date.now()-lastQueueSave>4000){lastQueueSave=Date.now();persistQueue();rememberLongPosition();}
 const position=paintScrub();
 lyricsUI?.update(position);
}
function finishScrub(job,commit){
 if(scrubFrame){cancelAnimationFrame(scrubFrame);scrubFrame=0;}
 if(scrub!==job)return;
 scrub=null;
 if(job.track===current?.id){
  const target=Number(job.element.value)/1000*audio.duration;
  const moved=commit&&job.element.isConnected&&job.initial!==job.element.value;
  if(moved)seekPlayback(target);
  if(job.ended){
   if(moved&&job.resume&&target<audio.duration)play(current,undefined,playMode);
   else if(prefs.autoplay||repeat!=='off')step(1,true);
   else sync();
  }
 }
 updateTime();
 requestSeekFrame();
}
function dragSeek(job,x){
 const rect=job.element.getBoundingClientRect(), edge=4;
 job.element.value=Math.round(1000*Math.min(1,Math.max(0,(x-rect.left-edge-job.grab)/Math.max(1,rect.width-edge*2))));
 // Paint at most once per frame while dragging: full updateTime is too heavy per pointermove.
 if(!scrubFrame)scrubFrame=requestAnimationFrame(()=>{scrubFrame=0;if(scrub===job)paintScrub();});
}
document.addEventListener('pointerdown',e=>{
 if(e.isPrimary&&e.button===0&&e.target.matches?.(seekControl)&&!e.target.disabled&&current){
  transitions.rewind();
  const custom=e.target.matches('.mx-seek-wrap input,.wave-seek');
  scrub={element:e.target,pointer:e.pointerId,track:current.id,initial:e.target.value,custom,resume:intendsPlayback(),grab:0};
  if(custom){
   const rect=e.target.getBoundingClientRect(), thumb=rect.left+4+(rect.width-8)*Number(e.target.value)/1000;
   if(Math.abs(e.clientX-thumb)<14)scrub.grab=e.clientX-thumb;
   e.preventDefault();
   if(e.pointerType!=='touch')e.target.focus({preventScroll:true});
   try{e.target.setPointerCapture(e.pointerId);}catch{}
   dragSeek(scrub,e.clientX);
  }
 }
});
document.addEventListener('pointermove',e=>{if(scrub?.custom&&scrub.pointer===e.pointerId)dragSeek(scrub,e.clientX);});
document.addEventListener('pointerup',e=>{
 const job=scrub;
 if(job?.pointer!==e.pointerId)return;
 if(job.custom){dragSeek(job,e.clientX);finishScrub(job,true);}
 else requestAnimationFrame(()=>finishScrub(job,true));
});
document.addEventListener('pointercancel',e=>{if(scrub?.pointer===e.pointerId)finishScrub(scrub,false);});
document.addEventListener('lostpointercapture',e=>{if(scrub?.pointer===e.pointerId&&scrub.custom)finishScrub(scrub,false);});
async function likeTrack(t){
 if(!t||pendingLikes.has(t.id))return;
 const old=likes.has(t.id);pendingLikes.add(t.id);old?likes.delete(t.id):likes.add(t.id);sync();
 try{
  if(t.provider){
   if(old)onDeviceLikes.delete(t.id);else{onDeviceLikes.add(t.id);rememberRemote(t);}
   save('commons-likes',[...onDeviceLikes]);
  }else if(user){await api('/api/likes/'+encodeURIComponent(t.id),old?'DELETE':'PUT');chartTime=0;communityAt=0;void loadCommunity(true);}else save('likes',[...likes].filter(id=>!id.startsWith('wm-')));
 }
 catch{old?likes.add(t.id):likes.delete(t.id);notice('Не удалось сохранить изменение.');}
 finally{save('offline-likes',[...likes]);pendingLikes.delete(t.id);offlineFailed.delete(t.id);queueLikedCache();refreshWaveQueue();refreshSuggestions();if(['liked','library'].includes(page))render();else sync();}
}
function setManualOffline(value){
 manualOffline=value;save('offline-mode',value);
 if(value){
  offlineBatch?.controller.abort();
  queue=queue.filter(id=>id===current?.id||offlineTracks.has(id));nextUp='';unshuffled=null;pausePlayback();invalidateFade();
 }
}
async function clearOffline(btn){
 const ids=[...offlineTracks.keys()];if(!ids.length)return;
 btn.disabled=true;offlineBatch?.controller.abort();
 autoCacheLikes=false;save('auto-cache-likes',false);clearTimeout(likedCacheTimer);
 if(offlineOnly()&&ids.includes(current?.id)){
  pausePlayback();current=null;queue=[];audio.removeAttribute('src');audio.load();releaseSavedAudio();systemMedia.setTrack(null);
 }
 const results=await Promise.allSettled(ids.map(async id=>{await removeOfflineTrack(id);offlineTracks.delete(id);}));
 dismissLayer(sheet,{slide:mobile.matches});render();
 notice(results.some(x=>x.status==='rejected')?'Не удалось удалить часть скачанных треков.':'Скачанные треки удалены с устройства.');
}
let importMatches=[],importTicket=0;
async function matchImport(form){
 const ticket=++importTicket,result=form.querySelector('#library-import-result'),submit=form.querySelector('[type=submit]');
 importMatches=[];submit.disabled=true;result.textContent='Проверяем плейлист…';
 try{
  const raw=$('#library-import-text').value.trim(),url=$('#library-import-url').value.trim();
  let source=null,entries=raw?parseTrackList(raw):[];
  if(!entries.length&&url){source=await api('/api/import/resolve','POST',{url});entries=source.tracks;}
  if(ticket!==importTicket||!form.isConnected)return;
  if(!entries.length){result.textContent='Добавь ссылку или список названий треков.';return;}
  const report=matchPlaylist(entries,tracks);importMatches=report.matched;
  const name=$('#library-import-name');if(!name.value)name.value=source?.name||'Импортированный плейлист';
  const unmatched=[...report.missing,...report.ambiguous];
  result.innerHTML='<section class="import-report"><strong>Найдено '+report.matched.length+' из '+report.total+'</strong>'+(source?.partial?'<p class="quiet">'+html(source.provider)+' отдал '+entries.length+' из '+source.total+' треков на открытой странице. Для полного переноса вставь список названий.</p>':'')+(report.ambiguous.length?'<p class="quiet">У '+report.ambiguous.length+' записей несколько версий. Они оставлены для ручной проверки.</p>':'')+(unmatched.length?'<details><summary>Не перенесены: '+unmatched.length+'</summary><ul>'+unmatched.map(t=>'<li>'+html(t.artist+' — '+t.title)+'</li>').join('')+'</ul></details>':'')+(importMatches.length?'<p class="quiet">Порядок исходного плейлиста сохранится.</p><button type="button" class="btn primary" data-action="confirm-import">Сохранить плейлист</button>':'<p class="quiet">Совпадений в каталоге Sway пока нет.</p>')+'</section>';
 }catch(error){if(ticket===importTicket&&form.isConnected)result.textContent=error.code==='invalid_playlist_link'?'Нужна прямая ссылка на плейлист Яндекс Музыки или VK.':'Сервис не предоставил открытый список треков. Вставь названия в поле «Список треков», и Sway найдёт совпадения.';}
 finally{if(ticket===importTicket)submit.disabled=false;}
}
async function importFavorites(btn){
 btn.disabled=true;
 try{const list=await playlists.create($('#library-import-name').value||'Импортированный плейлист',importMatches.map(t=>t.id));location.hash='#library/playlists/'+list.id;}
 catch{btn.disabled=false;notice('Не удалось сохранить плейлист. Проверь подключение.');}
}
function syncFullScroll(){
 const full=dialog.querySelector('.mx-full'), dock=full?.querySelector('.full-dock');
 if(!full||!dock||!dialog.open)return;
 const scroll=dialog.scrollTop, rest=dialog.scrollHeight-dialog.clientHeight;
 const limit=Math.max(104,Math.min(340,rest*.80));
 const docked=full.dataset.lyrics==='expanded'||scroll>=limit;
 full.toggleAttribute('data-scrolled',scroll>12);
 if(full.hasAttribute('data-docked')!==docked){
  full.toggleAttribute('data-docked',docked);dock.inert=!docked;
  if(!docked&&dock.contains(document.activeElement))fullClose.focus({preventScroll:true});
 }
}
dialog.addEventListener('scroll',syncFullScroll,{passive:true});

function paintFull(previous=null){
 lyricsLifetime?.abort();lyricsUI=null;
 const b=$('#dialog-body'), t=fullCoverTrack(current), focus=dialog.contains(document.activeElement)?document.activeElement?.dataset.action:null;
 const old=previous?b.querySelector('.full-player'):null, scroll=dialog.scrollTop;
 b.innerHTML=!t?emptyPlayer:mobile.matches?mobileFull(t):'<div class="full-player desktop-full">'+fullArtwork(t)+fullTrackCopy(t)+'<div class="actions">'+button('shuffle','Перемешать','data-action="shuffle" aria-pressed="'+shuffle+'"')+button('prev','Предыдущий трек','data-action="prev"')+button(playing?'pause':'play',playing?'Пауза':'Воспроизвести','data-action="toggle"','icon toggle')+button('next','Следующий трек','data-action="next"')+button(repeatIcon(),repeatLabel(),'data-action="repeat" data-repeat="'+repeat+'" aria-pressed="'+(repeat!=='off')+'"')+'</div><input class="full-seek" type="range" min="0" max="1000" aria-label="Перемотка"><p id="full-time" class="quiet"></p><div class="actions">'+button('heart','Мне нравится','data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+download(t)+button('queue','Очередь','data-action="queue"')+button('more','О треке','data-action="track-info"')+'</div><p id="full-notice" role="status"></p></div>';
 const full=b.querySelector('.full-player');
 const header=full?.querySelector('header');
 if(header)header.prepend(fullClose);else dialog.append(fullClose);
 if(full){
  setCoverColors(full,t);
  full.dataset.playing=String(intendsPlayback());
  mountPlayerScene(full,t,{old,color:setCoverColors,direction:travel,motion:motionAllowed()});

  previewImages=[...new Set([-1,1].map(queuedCoverTrack).map(item=>item?.art).filter(src=>src&&src!==t.art))].map(src=>prepareArtwork(src));
  syncChrome();
  if(!full.querySelector('[data-player-lyrics]'))full.querySelector('.actions:last-of-type')?.insertAdjacentHTML('beforeend',button('lyrics','Текст песни','data-player-lyrics aria-pressed="false"'));
  lyricsLifetime=new AbortController();
  lyricsUI=mountLyrics(full,t,{icon,getTime:()=>audio.currentTime,onSeek:seekPlayback,mode:lyricsMode,onMode:mode=>{lyricsMode=mode;syncFullScroll();},signal:lyricsLifetime.signal});
 }
 if(focus)b.querySelector('[data-action="'+focus+'"]')?.focus({preventScroll:true});
 if(dialog.open){dialog.scrollTop=scroll;syncFullScroll();}
 updateTime();
}
const sheetRow=(glyph,label,attrs)=>'<button type="button" '+attrs+'>'+icon(glyph)+label+'</button>';
function paintSheet(){
 let content='';
 if(modal==='artist-about'&&infoArtist){
  const a=infoArtist,stats=community.artists[canonical(a.name)]||{listeners:0,plays:0},genres=[...new Set(a.items.map(genreOf).filter(Boolean))];
  const collaborators=[...new Set(a.items.flatMap(t=>t.artists||artistCredits(t.artist)))].filter(n=>canonical(n)!==canonical(a.name)).slice(0,8);
  content=`<section class="artist-facts"><img data-player-art-fallback="${html(a.fallbackArt||a.items[0]?.art||'/art/logo.svg')}" src="${html(a.art||a.fallbackArt)}" alt=""><small>Исполнитель в Sway</small><h2 class="dialog-title">${html(a.name)}</h2><p>${html(genres.join(' · ')||'Музыка из каталога Sway')}</p><dl><div><dt>Треков в каталоге</dt><dd>${a.items.length}</dd></div><div><dt>Слушателей за месяц</dt><dd>${stats.listeners.toLocaleString('ru-RU')}</dd></div><div><dt>Засчитанных прослушиваний</dt><dd>${stats.plays.toLocaleString('ru-RU')}</dd></div></dl>${collaborators.length?`<h3>Совместные записи</h3><div class="artist-collaborators">${collaborators.map(n=>`<a href="#artist/${encodeURIComponent(resolveArtist(n)?.slug||slugify(n))}" data-close-layers>${html(n)} ${icon('forward')}</a>`).join('')}</div>`:''}<p class="quiet">Счётчики отражают прослушивания в Sway. Слушатель учитывается один раз за месяц; прослушивание — после 30 секунд, один раз в сутки для каждого трека.</p></section>`;
 }
 if(modal==='wave-filters'){
  const filters=waveDraft||waveFilters;
  content='<h2 class="dialog-title">Настройки волны</h2><p class="wave-filter-description">Музыка под твой ритм. Выбери звучание и открой новые треки.</p>' +
    '<div class="filter-section"><div class="filter-section-title">Настроение</div><div class="filter-chips">' +
    MOOD_OPTIONS.map(m => '<button type="button" class="filter-chip' + (filters.mood === m.id ? ' is-active' : '') + '" aria-pressed="'+(filters.mood===m.id)+'" data-set-filter-mood="' + html(m.id) + '">' + html(m.label) + '</button>').join('') +
    '</div></div>' +
    '<div class="filter-section"><div class="filter-section-title">Характер подбора</div><div class="filter-chips">' +
    CHARACTER_OPTIONS.map(c => '<button type="button" class="filter-chip' + (filters.character === c.id ? ' is-active' : '') + '" aria-pressed="'+(filters.character===c.id)+'" data-set-filter-char="' + html(c.id) + '">' + html(c.label) + '</button>').join('') +
    '</div></div>' +
    '<div class="filter-section"><div class="filter-section-title">Энергия</div><div class="filter-chips">'+ENERGY_OPTIONS.map(m=>'<button type="button" class="filter-chip'+(filters.energy===m.id?' is-active':'')+'" aria-pressed="'+(filters.energy===m.id)+'" data-set-filter-energy="'+m.id+'">'+m.label+'</button>').join('')+'</div></div>'+ 
    '<div class="filter-section"><div class="filter-section-title">Язык музыки</div><div class="filter-chips">' +
    LANGUAGE_OPTIONS.map(l => '<button type="button" class="filter-chip' + (filters.language === l.id ? ' is-active' : '') + '" aria-pressed="'+(filters.language===l.id)+'" data-set-filter-lang="' + html(l.id) + '">' + html(l.label) + '</button>').join('') +
    '</div></div>' +
    '<p class="wave-filter-description" style="margin-top:14px">Треки с неизвестным языком доступны в режиме «Любой язык».</p><div class="wave-filter-footer"><button type="button" class="btn" data-action="reset-wave-filters">Сбросить</button><button type="button" class="btn primary" data-action="apply-wave-filters">Включить волну</button></div>';
 }
 if(modal==='onboarding'){
  const picks=onboardingArtists();
  content='<h2 class="dialog-title">Кого ты слушаешь?</h2><p class="onboard-lead">Отметь хотя бы троих — «Моя волна» сразу подстроится под тебя</p>'+
   '<div class="onboard-grid">'+picks.map(a=>'<button type="button" class="onboard-artist" data-onboard-artist="'+html(a.name)+'" aria-pressed="'+onboardPicks.has(a.name)+'"><img src="'+html(a.art)+'" alt="" loading="lazy" decoding="async"><span>'+html(a.name)+'</span></button>').join('')+'</div>'+
   '<div class="onboard-footer"><button type="button" class="btn" data-onboard-done="skip">Пропустить</button><button type="button" class="btn primary" data-onboard-done="save">'+(onboardPicks.size?'Готово · '+onboardPicks.size:'Готово')+'</button></div>';
 }
 if(modal==='sleep-timer'){
  const status = getSleepTimerStatus();
  const minutes=Math.ceil((status.remainingSeconds||0)/60);
  const item=(attr,label,on)=>'<button type="button" class="sway-sheet-item'+(on?' is-active':'')+'" '+attr+' aria-pressed="'+on+'"><span>'+html(label)+'</span>'+(on?icon('check'):'')+'</button>';
  content='<h2 class="dialog-title">Таймер сна</h2>' +
    (status.active ? '<p class="quiet" style="margin-bottom:12px;color:var(--accent)">' + (status.mode === 'end-of-track' ? 'Таймер сработает в конце текущего трека' : status.mode === 'tracks' ? 'Остановим музыку: '+status.label.toLowerCase() : 'Осталось: ' + status.label) + '</p>' : '') +
    '<div class="sway-sheet-list">' +
    [15,30,45,60,90].map(m=>item('data-set-sleep="'+m+'"',m+' минут',status.mode==='time'&&Math.abs(m-minutes)<=1)).join('') +
    item('data-set-sleep-tracks="1"','В конце этого трека',status.mode==='end-of-track') +
    [3,5,10].map(n=>item('data-set-sleep-tracks="'+n+'"','После '+n+' треков',status.mode==='tracks'&&status.tracksTotal===n)).join('') +
    (status.active ? '<button type="button" class="sway-sheet-item" data-set-sleep="0" style="color:#ff5e62"><span>Выключить таймер</span>' + icon('close') + '</button>' : '') +
    '</div><p class="quiet sleep-fade-note">По времени музыка плавно затихает последние '+sleepFadeSeconds+' секунд.</p>';
 }

 if(modal==='queue'){
  const index=queue.indexOf(current?.id);
  const earlier=index>0?tracksFrom(queue.slice(Math.max(0,index-10),index)):[],from=sourceName();
  content='<h2 class="dialog-title">Очередь</h2>'+(from?'<p class="queue-source"><small>Играет из</small><strong>'+html(from)+'</strong></p>':'')+(earlier.length?'<h3 class="queue-label">Ранее</h3><div class="queue-earlier">'+rows(earlier,true)+'</div>':'')+(current?'<h3 class="queue-label">Сейчас играет</h3>'+rows([current],true):'')+'<h3 class="queue-label">Дальше · перетащи за ручку</h3><div class="queue-sort">'+tracksFrom(queue.slice(index+1)).map(t=>'<div class="queue-item" data-queue-id="'+html(t.id)+'">'+button('list','Перетащить '+t.title,'data-queue-handle')+rows([t],true)+'<div class="queue-tools">'+button('prev','Выше: '+t.title,'data-queue-move="-1" data-queue-track="'+html(t.id)+'"')+button('next','Ниже: '+t.title,'data-queue-move="1" data-queue-track="'+html(t.id)+'"')+button('close','Убрать из очереди: '+t.title,'data-queue-remove="'+html(t.id)+'"')+'</div></div>').join('')+'</div>';
 }
 if(modal==='delete')content='<h2 class="dialog-title">Ты точно хочешь удалить аккаунт?</h2><p class="quiet">Профиль, настройки аккаунта и сохранённые лайки будут удалены без возможности восстановления.</p><div class="confirm-actions"><button class="btn" type="button" data-action="cancel-sheet">Отмена</button><button class="btn danger" type="button" data-action="confirm-delete">Да, удалить аккаунт</button></div>';
 if(modal==='clear-offline')content='<h2 class="dialog-title">Удалить скачанные треки?</h2><p class="quiet">Освободится память этого устройства. Коллекция и лайки сохранятся.</p><div class="confirm-actions"><button class="btn" type="button" data-action="cancel-sheet">Отмена</button><button class="btn danger" type="button" data-action="confirm-clear-offline">Удалить скачанное</button></div>';
 if(modal==='info'&&infoTrack){
  const t=infoTrack,stats=community.tracks[t.canonicalId||t.id]||{plays:0,listeners:0,likes:0};
  const artistParts=t.artists||splitArtists(t.artist);
  const artistLine=artistParts.length>1
    ?'<button type="button" class="mx-info-artist" data-action="show-artists" data-artists="'+html(artistParts.join(','))+'"><img class="mx-artist-avatar" src="'+html(artistAvatar(artistParts[0]))+'" alt="">'+html(t.artist)+' '+icon('forward')+'</button>'
    :'<a class="mx-info-artist" href="#artist/'+encodeURIComponent(slugify(artistParts[0]||t.artist))+'" data-close-layers><img class="mx-artist-avatar" src="'+html(artistAvatar(t.artist))+'" alt="">'+html(t.artist)+'</a>';
  const alb=t.albumId?resolveAlbum(t.albumId):null;
  const albumLine=alb?'<a class="sheet-album-row" href="#album/'+encodeURIComponent(alb.id)+'" data-close-layers>'+icon('disc')+'<span>Альбом: <strong>'+html(alb.title)+'</strong></span>'+icon('forward')+'</a>':'';
  content='<div class="mx-info-top"><button class="info-art" type="button" data-action="track-cover" aria-label="Посмотреть обложку">'+art(t)+'</button><div><h2>'+html(t.title)+(t.isExplicit?' <span class="badge-e">E</span>':'')+'</h2><p class="quiet">'+(t.provider?'Wikimedia Commons':time(t.seconds))+'</p></div></div>'+artistLine+albumLine+'<p class="track-community quiet">'+stats.plays.toLocaleString('ru-RU')+' прослушиваний в Sway · '+stats.likes.toLocaleString('ru-RU')+' лайков<br>'+stats.listeners.toLocaleString('ru-RU')+' слушателей за 30 дней</p>'+trackWaveButton(t)+
   '<div class="mx-info-actions"><span>'+button('heart','Мне нравится','data-like="'+t.id+'" aria-pressed="'+likes.has(t.id)+'"')+'Нравится</span>'+(canDownload(t)?'<span>'+download(t)+'<span data-offline-caption="'+html(t.id)+'">Скачать</span></span>':'')+'<span>'+button('share','Поделиться треком','data-action="share"')+'Поделиться</span></div>'+
    '<div class="mx-info-list">'+sheetRow('share','Поделиться','data-action="share"')+sheetRow('next-up','Играть следующим','data-next-up="'+t.id+'"')+sheetRow('library','Добавить в плейлист','data-playlist-choose="'+t.id+'"')+sheetRow('queue','Добавить в очередь','data-add="'+t.id+'"')+sheetRow('moon','Таймер сна','data-action="open-sleep-timer"')+sheetRow('info','Источник и лицензия','data-action="track-credits"')+'</div>';
 }
 if(modal==='cover'&&infoTrack)content='<div class="cover-view">'+art(infoTrack)+'<h2>'+html(infoTrack.title)+'</h2><p class="quiet">'+html(infoTrack.artist)+'</p>'+sheetRow('back','К действиям с треком','data-action="track-menu"')+'</div>';
 if(modal==='credits'&&infoTrack){
  const t=infoTrack;
  content='<div class="mx-info-top">'+art(t)+'<div><h2>'+html(t.title)+'</h2><p class="quiet">'+html(t.artist)+(t.provider?' · Wikimedia Commons':' · '+time(t.seconds))+'</p></div></div>'+(t.credit?'<p class="quiet source-credit">Авторство: '+html(t.credit)+'</p>':'')+'<div class="mx-info-list"><a href="'+html(t.source)+'" target="_blank" rel="noopener">'+icon('arrow')+'Страница оригинала</a><a href="'+html(t.licenseUrl)+'" target="_blank" rel="noopener">'+icon('info')+html(t.license)+'</a>'+sheetRow('back','К действиям с треком','data-action="track-menu"')+'</div>';
 }
 if(modal==='favorites'||modal==='downloads'){
  const items=modal==='downloads'?favoriteItems().filter(canDownload):favoriteItems();
  content='<h2 class="dialog-title">'+(modal==='favorites'?'Мне нравится':'Скачать треки')+'</h2>';
  if(modal==='favorites')content+='<p class="quiet">'+trackCount(items.length)+'</p><div class="mx-info-list">'+sheetRow('play','Слушать подборку','data-action="play-liked"')+sheetRow('download','Скачать треки','data-action="downloads"')+'</div>';
  else content+=items.length?'<div class="offline-actions"><button class="btn primary" type="button" data-action="download-favorites">Скачать всё</button><button class="btn" type="button" data-action="stop-downloads" hidden>Остановить</button></div><p class="offline-status" data-offline-status role="status"></p><div class="download-list">'+items.map(t=>'<div>'+art(t)+'<span><strong>'+html(t.title)+'</strong><small>'+html(t.artist)+'</small></span>'+download(t)+'</div>').join('')+'</div>':'<p class="quiet">В этой подборке нет треков для скачивания.</p>';
 }
 $('#sheet-body').innerHTML=content;
 if(modal==='info'&&infoTrack&&!infoTrack.provider)$('#sheet-body .mx-info-list')?.insertAdjacentHTML('beforeend',sheetRow('info','Сообщить о проблеме','data-track-report="'+html(infoTrack.id)+'"'));
 if(infoTrack)setCoverColors(sheet,infoTrack);else sheet.removeAttribute('data-cover-track');
 if(modal==='queue')mountQueueDrag($('#sheet-body'),{commit:ids=>{reorderQueue(ids);paintSheet();},feedback:()=>pulse('tick')});
 sync();syncOfflineUI();
}
function open(kind,track=current){
 if(kind==='full'){
  if(sheet.open)sheet.close();
  if(embedActive)closeEmbed();
  dialog.dataset.view='full';dialog.setAttribute('aria-label','Плеер Sway');
  if(!dialog.open){paintFull();dialog.showModal();dialog.scrollTop=0;sync();}
  return;
 }
 if(['info','credits','cover'].includes(kind)&&!track)return;
 infoTrack=['info','credits','cover'].includes(kind)?track:null;
 sheet.dataset.view=kind;sheet.setAttribute('aria-label',{queue:'Очередь',delete:'Удаление аккаунта','clear-offline':'Очистить память',info:'О треке',credits:'Источник и лицензия',cover:'Обложка трека',favorites:'Мне нравится',downloads:'Скачать треки','wave-filters':'Настройки волны','sleep-timer':'Таймер сна',onboarding:'Любимые исполнители'}[kind]||'Меню');
 modal=kind;$('.sheet-notice').textContent='';paintSheet();
 if(!sheet.open)sheet.showModal();
 sheet.scrollTop=0;(sheet.querySelector('[data-action="cancel-sheet"]')||sheet.querySelector('.dialog-close')).focus({preventScroll:true});
}
function closeEmbed(){
 if(!embedActive)return;
 $('#dialog-body').replaceChildren();
 embedActive=false;systemMedia.suspend(false);
 if(dialog.open)dialog.close();
}
function openEmbed(entry){
 if(!entry?.embed)return;
 if(sheet.open)sheet.close();
 pausePlayback();rememberSearch();
 embedActive=true;systemMedia.suspend(true);
 dialog.dataset.view='embed';dialog.setAttribute('aria-label','Плеер Яндекс Музыки');
 dialog.append(fullClose);
 const body=$('#dialog-body');
 body.innerHTML='<section class="provider-panel"><div class="provider-byline">Внешний источник</div><h2>Яндекс Музыка</h2><p>Воспроизведение и подписка управляются Яндекс Музыкой.</p><div class="embed-slot"></div><a class="btn" href="'+html(entry.original)+'" target="_blank" rel="noopener noreferrer">Открыть в Яндекс Музыке '+icon('arrow')+'</a></section>';
 const frame=document.createElement('iframe');
 frame.title=entry.label+' в плеере Яндекс Музыки';
 frame.src=entry.embed;
 frame.allow='autoplay; encrypted-media';
 frame.dataset.type=entry.kind;
 body.querySelector('.embed-slot').append(frame);
 if(!dialog.open)dialog.showModal();
 dialog.scrollTop=0;dialog.querySelector('.dialog-close').focus({preventScroll:true});
}
for(const layer of [dialog,sheet,editor]){
 const dismiss=()=>{if(layer===editor&&editDraft?.busy)return;dismissLayer(layer,{slide:mobile.matches&&layer!==editor});};
 layer.addEventListener('cancel',e=>{e.preventDefault();if(layer===dialog&&lyricsUI?.collapse())return;dismiss();});
 layer.addEventListener('click',e=>{
  if(e.target!==layer)return;
  const r=layer.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();
 });
}
dialog.addEventListener('close',()=>{if(!dialog.open){lyricsLifetime?.abort();lyricsUI=null;lyricsMode='off';dialog.append(fullClose);closeEmbed();$('#dialog-body').replaceChildren();}});
sheet.addEventListener('close',()=>{if(!sheet.open){modal='';infoTrack=null;$('#sheet-body').replaceChildren();}});
editor.addEventListener('close',()=>{if(!editor.open){editDraft?.controller?.abort();editDraft=null;editor.replaceChildren();}});
function clearAccount(error=''){
 persistQueue();
 user=null;accountProfile=null;authError=error;profileJob?.abort();++settingsRevision;void accountListening.load();restoreRecentHistory();
 if(editor.open){editor.close();editDraft=null;}if(sheet.open)sheet.close();if(dialog.open)dialog.close();
 closeEmbed();pausePlayback();current=null;queue=[];nextUp='';playMode='';waveMood='';waveMix=null;
 queueOwner='guest';
 audio.removeAttribute('src');audio.load();releaseSavedAudio();systemMedia.setTrack(null);
 prefs={...guest};likes=new Set([...load('likes',[]),...onDeviceLikes]);$('#account-label').textContent='Войти';
 if(loginRequired){tracks=[];map.clear();stopProviderSearch();}
 playlists.load().then(()=>{if(!user)render();});clearTimeout(likedCacheTimer);offlineBatch?.controller.abort();
 refreshSuggestions();apply();render();
}
async function endAccount(remove,btn){
 if(!user)return;
 btn.disabled=true;try{await Promise.all([settingsWrites,tasteWrites.catch(()=>{})]);await api(remove?'/api/me':'/api/logout',remove?'DELETE':'POST');clearAccount();notice(remove?'Аккаунт удалён':'Вы вышли из аккаунта');}catch{notice('Не удалось выполнить действие. Попробуй ещё раз.');btn.disabled=false;}
}
document.addEventListener('click',e=>{
 const reportButton=e.target.closest('[data-track-report]');
 if(reportButton){const track=map.get(reportButton.dataset.trackReport);if(track){sheet.close();reportTrack(track);}return;}
 if(russiaChart.handle(e.target))return;
 const sortButton=e.target.closest('[data-offline-sort]');
 if(sortButton){
  offlineSort=sortButton.dataset.offlineSort;
  for(const b of $$('[data-offline-sort]')){const on=b===sortButton;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);}
  const list=$('[data-offline-list]');if(list){list.innerHTML=offlineRows(offlineSorted());filterOfflineRows();}
  return;
 }
 if(e.target.closest('a[href="/auth/yandex"]')&&/^#u\/[a-z0-9_]{3,24}$/.test(location.hash)){
  try{sessionStorage.setItem('sway.after-login',location.hash);}catch{}
 }
 if(e.target.closest('[data-close-player],[data-close-layers]')){if(sheet.open)sheet.close();if(dialog.open)dialog.close();}
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.queueRemove){queue=queue.filter(id=>id!==b.dataset.queueRemove);if(nextUp===b.dataset.queueRemove)nextUp='';invalidateFade();persistQueue();paintSheet();return;}
 if(b.dataset.queueMove){const at=queue.indexOf(current?.id),ids=queue.slice(at+1),i=ids.indexOf(b.dataset.queueTrack),j=i+Number(b.dataset.queueMove);if(i>=0&&j>=0&&j<ids.length){[ids[i],ids[j]]=[ids[j],ids[i]];reorderQueue(ids);paintSheet();}return;}
 if(b.dataset.setFilterEnergy!==undefined){waveDraft.energy=b.dataset.setFilterEnergy;pulse('selection');paintSheet();return;}
 if(b.dataset.setFilterMood!==undefined){waveDraft.mood=b.dataset.setFilterMood;pulse('selection');paintSheet();return;}
 if(b.dataset.setFilterChar!==undefined){waveDraft.character=b.dataset.setFilterChar;pulse('selection');paintSheet();return;}
 if(b.dataset.setFilterLang!==undefined){waveDraft.language=b.dataset.setFilterLang;pulse('selection');paintSheet();return;}
 if(b.dataset.onboardArtist!==undefined){
  const name=b.dataset.onboardArtist;if(onboardPicks.has(name))onboardPicks.delete(name);else onboardPicks.add(name);
  b.setAttribute('aria-pressed',String(onboardPicks.has(name)));pulse('selection');
  const done=sheet.querySelector('[data-onboard-done="save"]');if(done)done.textContent=onboardPicks.size?'Готово · '+onboardPicks.size:'Готово';return;
 }
 if(b.dataset.onboardDone!==undefined){
  const chosen=b.dataset.onboardDone==='save'?[...onboardPicks]:[];sheet.close();finishOnboarding();
  if(chosen.length){void persistTaste({artists:[...new Set([...preferredArtists,...chosen])],genres:[...preferredGenres]}).catch(()=>{});notice('Волна настроена под твой вкус');}
  return;
 }
 if(b.dataset.setSleep!==undefined){
  const mins=Number(b.dataset.setSleep);
  if(mins===0){cancelSleepTimer();toast('Таймер сна выключен');}
  else{setSleepTimer(mins,{onFade:factor=>transitions.setVolume(prefs.volume*factor),onTrigger:()=>{pausePlayback();toast('Музыка остановлена по таймеру');}});toast('Таймер сна установлен на '+mins+' мин');}
  haptic(10);sheet.close();return;
 }
 if(b.dataset.setSleepTracks!==undefined){
  const count=Number(b.dataset.setSleepTracks);setSleepTimerAfterTracks(count);
  // The last counted track must end on its own, without a crossfade into the next one.
  if(count===1)invalidateFade();
  toast(count===1?'Таймер: в конце этого трека':'Таймер: после '+count+' треков');
  haptic(10);sheet.close();return;
 }

 if(b.dataset.action==='story'){openStory(b.dataset.story);return;}
 if(b.dataset.action==='toggle-shot'){toggleShotMode();return;}
 if(b.classList.contains('dialog-close')){const layer=b.closest('dialog');if(layer!==editor||!editDraft?.busy)dismissLayer(layer,{slide:mobile.matches&&layer!==editor});return;}
 if(b.dataset.preferredGenre){
  const name=b.dataset.preferredGenre;
  if(preferredGenres.has(name))preferredGenres.delete(name);
  else if(preferredGenres.size<5)preferredGenres.add(name);
  else{notice('Можно выбрать до пяти жанров.');return;}
  b.setAttribute('aria-pressed',preferredGenres.has(name));save('preferred-genres',[...preferredGenres]);refreshSuggestions();
  return;
 }
 if(b.dataset.offlineToggle){toggleOfflineTrack(b.dataset.offlineToggle);return;}
 if(b.dataset.profileRemove&&editDraft&&!editDraft.busy){
  const kind=b.dataset.profileRemove;editDraft.files[kind]=null;previewProfileImage(kind,null);return;
 }
 if(b.dataset.eqPreset){
  eq.state.levels=[...equalizerPresets[Number(b.dataset.eqPreset)][1]];eq.state.enabled=true;applyEqualizer(true);return;
 }
 if(b.dataset.waveStation){chooseWaveStation(b);return;}
 if(b.dataset.waveArtist){chooseWaveArtist(b);return;}
 if(b.dataset.waveMood){chooseWaveMood(b.dataset.waveMood,b);return;}
 if(b.dataset.waveGenre){chooseWaveGenre(b);return;}
 if(b.dataset.waveSeed){chooseRecommendation(b);return;}
 if(b.dataset.infoTrack){const t=map.get(b.dataset.infoTrack);if(t)open('info',t);return;}
 if(b.dataset.savedEmbed){openEmbed(savedEmbeds.get(b.dataset.savedEmbed));return;}
 if(b.dataset.saveEmbed){
  const key=b.dataset.saveEmbed, entry=submittedYandex?.original===key?submittedYandex:null;
  if(savedEmbeds.has(key))savedEmbeds.delete(key);else if(entry)savedEmbeds.set(key,entry);
  save('yandex-links',[...savedEmbeds.values()].map(x=>x.embed||x.original));
  if(page==='search')searchResults();else if(page==='library')render();
  return;
 }
 if(b.dataset.discoverMix){switchDiscoverMix(b.dataset.discoverMix);return;}
 if(b.hasAttribute('data-filter')){
  favoriteMood=b.dataset.filter;
  for(const chip of $$('.mx-filters button')){const active=chip===b;chip.classList.toggle('on',active);chip.setAttribute('aria-pressed',active);}
  $('.mx-favorite-results').innerHTML=rows(favoriteItems(),true);
  for(const control of $$('.mx-heart-actions button'))control.disabled=!favoriteItems().length;
  sync();return;
 }
 if(b.dataset.query){search=b.dataset.query;searchTab='popular';render();return;}
 if(b.dataset.play&&page==='search')rememberSearch();
 const t=map.get(b.dataset.play||b.dataset.like||b.dataset.add||b.dataset.nextUp);
 if(b.dataset.play&&t){
  pulse('play',e,b);
  if(t.id===current?.id&&modal!=='queue'){toggle();return;}
  play(t,modal==='queue'?undefined:context(t),modal==='queue'?playMode:offlineMode||location.hash==='#library/offline'?'offline':location.hash==='#discover/chart'?'chart':'track');return;
 }
 if(b.dataset.like){if(t&&!pendingLikes.has(t.id))pulse('like',e,b);likeTrack(t);return;}
 if(t&&(b.dataset.add||b.dataset.nextUp)){
  invalidateFade();
  if(b.dataset.nextUp&&t.id!==current?.id)queueNext(t);
  else if(!queue.includes(t.id)){queue.push(t.id);notice('Добавлено в очередь');}
  else notice(t.id===current?.id?'Этот трек уже играет':'Трек уже в очереди');
  if(modal==='queue')paintSheet();return;
 }
 if(b.hasAttribute('data-collection-kind')){void toggleCollection(b);return;}
 const action=b.dataset.action||b.id;
 if(['toggle','wave','mobile-wave','start-personal','play-chart','play-chart-favorites','play-liked','play-collection','play-mood','play-artist','play-album','play-artist-wave','play-album-wave'].includes(action))pulse('play',e,b);
 if(['shuffle','wave-shake','shuffle-artist'].includes(action))pulse('shuffle',e,b);
 if(action==='like-now'&&current&&!pendingLikes.has(current.id))pulse('like',e,b);
 const playSaved=(items)=>{if(offlineOnly())items=items.filter(t=>offlineTracks.has(t.id));if(!items.length){notice(offlineOnly()?'Нет скачанных лайков.':'Поставь лайк треку, чтобы включить эту подборку.');return;}if(modal==='favorites')dismissLayer(sheet,{slide:mobile.matches});if(playMode==='likes'&&items.some(t=>t.id===current?.id))toggle();else play(items[0],items,'likes');};
 const actions={
  wave,'mobile-wave':()=>current?toggle():wave(),'open-sleep-timer':()=>openSleepTimerSheet(),'open-wave-filters':()=>openWaveFiltersSheet(),'open-onboarding':()=>open('onboarding'),'reset-wave-filters':()=>{waveDraft={mood:'',character:'mix',language:'any',energy:'balanced'};paintSheet();},'apply-wave-filters':()=>{waveFilters={...(waveDraft||waveFilters)};saveWaveFilters(waveFilters);sheet.close();const began=startWave(waveFilters.mood,{explore:waveFilters.character==='discovery',mix:waveMix,mode:isWaveMode()?playMode:'wave'});sync();if(began)toast('Фильтры волны применены');},'share-card':()=>{if(current){haptic(10);shareTrack(current,{timestamp:audio.currentTime}).then(r=>{if(r?.method==='fallback-copied')toast('Ссылка скопирована в буфер');});}},'mobile-play':()=>{if(!current)startWave('',{first:tracks[0],start:false});open('full');},
  'full-top':()=>{fullClose.focus({preventScroll:true});dialog.scrollTo({top:0,behavior:motionAllowed()?'smooth':'instant'});},
  'start-personal':()=>startWave(),'wave-reset':()=>startWave(),'wave-usual':()=>startWave(),'wave-shake':()=>startWave(waveMood,{explore:true,mix:waveMix}),
  'play-chart':()=>{if(playMode==='chart'&&current)toggle();else{const items=chartItems();play(items[0],items,'chart');}},
  'play-chart-favorites':()=>playSaved(tracksFrom([...likes].reverse())),
  'download-chart':()=>{downloadGroup(chartItems());notice('Загрузка треков чарта в офлайн');},
  'chart-trailer':()=>{const items=chartItems();if(items.length){play(items[0],items.slice(0,10),'chart');notice('Включён трейлер чарта');}},
  'retry-chart':()=>{b.disabled=true;loadChart(true);},
  'wave-less':()=>{if(!current)return;lessTracks.add(current.id);save('less-tracks',[...lessTracks].slice(-1000));waveHistory=recordWaveSignal(waveHistory,current.id,'skip');save('wave-history',waveHistory);refreshWaveQueue();refreshSuggestions();step(1,false,false,false);notice('Будем реже предлагать похожее');},
  'search-popular':()=>{searchTab='popular';search='';render();},'search-history':()=>{rememberSearch();searchTab='history';search='';render();},'clear-history':clearHistory,
  'search-clear':()=>{search='';const input=$('#search-query');input.value='';searchResults();input.focus();},
  'search-more':()=>{searchLimit+=80;searchResults();},
  'clear-search-history':()=>{save('search-history',[]);render();},
  'track-info':()=>{void loadCommunity();open('info');},'track-wave':()=>{const t=map.get(b.dataset.track)||current;if(!t)return;startWave('',{mix:{key:'seed-'+t.id,seedId:t.id,title:'Волна по треку'},mode:'track-wave'});if(!dialog.open)open('full');},
  'track-credits':()=>open('credits',infoTrack),'track-menu':()=>open('info',infoTrack),'track-cover':()=>open('cover',infoTrack),
  'yandex-player':()=>openEmbed(submittedYandex),
  'favorites-menu':()=>open('favorites'),downloads:()=>open('downloads'),
  'download-catalog':()=>downloadGroup(tracks),'download-favorites':()=>downloadGroup(favoriteItems()),
  'stop-downloads':()=>{if(offlineBatch?.automatic){autoCacheLikes=false;save('auto-cache-likes',false);}offlineBatch?.controller.abort();},
  'maintenance-retry':()=>{if(b)b.disabled=true;checkMaintenance().then(on=>{if(!on)startApp();else{offlineFeedback('Обновление ещё идёт');if(b)b.disabled=false;}});},
  'shuffle-offline':()=>{const items=shuffled(savedItems().map(t=>t.id)).map(id=>savedItems().find(t=>t.id===id)).filter(Boolean);if(items.length)play(items[0],items,'offline');},
  'play-offline':()=>{const items=savedItems();if(items.length){if(playMode==='offline'&&offlineTracks.has(current?.id))toggle();else play(items[0],items,'offline');}},
  share:async()=>{const t=infoTrack||current;if(!t)return;rememberSearch();const url=t.provider?t.source:new URL('/t/'+encodeURIComponent(t.id),location.origin).href;try{if(navigator.share)await navigator.share({title:t.title,url});else{await navigator.clipboard.writeText(url);notice('Ссылка скопирована');}}catch(e){if(e.name!=='AbortError')notice('Не удалось поделиться ссылкой');}},
  'play-liked':()=>playSaved(mobile.matches&&page==='liked'?favoriteItems():tracksFrom([...likes].reverse())),
  'play-collection':()=>playSaved(tracksFrom([...likes].reverse())),'play-mood':()=>{if(!mood)return;const v=tracks.filter(t=>t.moods?.includes(mood[0]));if(v.length)play(v[0],v);},
  'play-artist':()=>{const artist=resolveArtist(b?.dataset?.artist||location.hash.split('/')[1]);if(artist?.items?.length){if(playing&&artist.items.some(t=>t.id===current?.id))pausePlayback();else{const items=artistPopular(artist);play(items[0],items,'normal');}}},
  'like-artist':async()=>{
   const artist=resolveArtist(b?.dataset?.artist||location.hash.split('/')[1]);if(!artist)return;
   const selected=new Set(preferredArtists);if(selected.has(artist.name))selected.delete(artist.name);else selected.add(artist.name);
   b.disabled=true;
   try{await persistTaste({artists:[...selected],genres:[...preferredGenres]});b.setAttribute('aria-pressed',selected.has(artist.name));notice(selected.has(artist.name)?'Исполнитель в твоей коллекции':'Исполнитель убран из любимых');pulse('like');}
   catch{notice('Не удалось сохранить исполнителя. Попробуй ещё раз.');}finally{b.disabled=false;}
  },
  'play-album':()=>{const alb=resolveAlbum(b?.dataset?.album||location.hash.split('/')[1]);if(alb){const items=(alb.trackIds||[]).map(id=>map.get(id)).filter(Boolean);if(items.length){if(items.some(t=>t.id===current?.id)&&playing)toggle();else play(items[0],items,'album');}}},
  'play-album-wave':()=>{const alb=resolveAlbum(b?.dataset?.album||location.hash.split('/')[1]);if(alb){const items=(alb.trackIds||[]).map(id=>map.get(id)).filter(Boolean);if(items.length)play(items[0],items,'wave');}},
  'play-artist-wave':()=>{const artist=resolveArtist(b?.dataset?.artist||location.hash.split('/')[1]);if(artist)startWave('',{mix:{key:'artist-'+artist.slug,artist:artist.name,title:'В стиле '+artist.name}});},
  'artist-about':()=>{infoArtist=resolveArtist(b?.dataset?.artist||location.hash.split('/')[1]);if(infoArtist)open('artist-about');},
  'like-album':()=>{const a=resolveAlbum(b?.dataset.album||location.hash.split('/')[1]);if(a){b.dataset.collectionKind='album';b.dataset.collectionRef=a.id;void toggleCollection(b);}},
  'download-album':()=>{const alb=resolveAlbum(b?.dataset?.album||location.hash.split('/')[1]);if(alb){const items=(alb.trackIds||[]).map(id=>map.get(id)).filter(Boolean);if(items.length){downloadGroup(items);notice('Загрузка треков альбома в офлайн');}}},
  'show-artists':()=>{openArtistsSheet(b?.dataset?.artists);},
  'shuffle-artist':()=>{const artist=resolveArtist(b?.dataset?.artist||location.hash.split('/')[1]);if(artist?.items?.length){const sh=tracksFrom(shuffled(artist.items.map(t=>t.id)));play(sh[0],sh,'shuffle');}},
  'share-artist':async()=>{const slug=b?.dataset?.artistSlug||location.hash.split('/')[1];const url=new URL('/#artist/'+encodeURIComponent(slug),location.origin).href;try{if(navigator.share)await navigator.share({title:'Артист в Sway',url});else{await navigator.clipboard.writeText(url);notice('Ссылка на артиста скопирована');}}catch(e){if(e.name!=='AbortError')notice('Ссылка скопирована');}},
  toggle,prev:()=>step(-1),next:()=>step(1),shuffle:()=>setShuffle(!shuffle),repeat:()=>{invalidateFade();repeat=repeatModes[(repeatModes.indexOf(repeat)+1)%repeatModes.length];sync();notice(repeatLabel());},
  'like-now':()=>likeTrack(current),'now-open':()=>open('full'),'queue-open':()=>open('queue'),queue:()=>open('queue'),mute:()=>{transitions.setMuted(!audio.muted);sync();},
  'retry-account':()=>startApp(),'retry-profile':()=>loadProfile(page==='u'?location.hash.split('/')[1]:''),'profile-edit':openProfileEditor,
  'leave-offline':()=>{setManualOffline(false);render();},
  'clear-offline':()=>{if(offlineTracks.size)open('clear-offline');else notice('На устройстве нет скачанных треков.');},
  'confirm-clear-offline':()=>clearOffline(b),'cancel-sheet':()=>dismissLayer(sheet,{slide:mobile.matches,focus:true}),
  'confirm-import':()=>importFavorites(b),
  'profile-cancel':()=>{if(!editDraft?.busy)editor.close();},
  'profile-share':async()=>{
   if(!accountProfile?.visible||!accountProfile.handle)return;
   const url=new URL('/#u/'+encodeURIComponent(accountProfile.handle),location.origin).href;
   try{if(navigator.share)await navigator.share({title:accountProfile.name+' · Sway',url});else{await navigator.clipboard.writeText(url);notice('Ссылка на профиль скопирована');}}
   catch(error){if(error.name!=='AbortError')notice('Не удалось поделиться профилем');}
  },
  logout:()=>endAccount(false,b),delete:()=>open('delete'),'confirm-delete':()=>{if(sheet.open&&modal==='delete')endAccount(true,b);},install:()=>requestInstall(notice)
 };
 actions[action]?.();
});
document.addEventListener('input',e=>{
 if(e.target.id==='search-query'){search=e.target.value;searchResults();}
 if(e.target.matches?.('[data-offline-filter]')){offlineQuery=e.target.value;filterOfflineRows();}
 if(e.target.matches?.(seekControl)){
  if(scrub?.element===e.target)updateTime();
  else seekPlayback(Number(e.target.value)/1000*audio.duration);
 }
 if(e.target.name==='coverZoom'&&e.target.form?.id==='profile-edit-form')updateCoverZoom();
 if(e.target.form?.id==='settings-form'&&e.target.name==='volume'){
  const value=Number(e.target.value);e.target.form.querySelector('output').textContent=value+'%';e.target.closest('.setting-slider').style.setProperty('--volume',value+'%');transitions.setVolume(value/100);
 }
 if(e.target.id==='volume'){transitions.setVolume(+e.target.value/100);transitions.setMuted(false);sync();}
 if(e.target.hasAttribute('data-eq-band')){eq.state.levels[Number(e.target.dataset.eqBand)]=Number(e.target.value);eq.state.enabled=true;applyEqualizer();}
});
let settingsWrites=Promise.resolve(), settingsRevision=0;
function syncSettingsState(form,message='',retry=false){
 if(!form.isConnected)return;
 form.querySelector('#settings-status').textContent=message;
 form.querySelector('.settings-retry').hidden=!retry;
}
function persistSettings(form){
 if(!form.reportValidity())return;
 const data=new FormData(form), account=Boolean(user);
 const next={volume:data.has('volume')?Number(data.get('volume'))/100:prefs.volume,autoplay:data.has('autoplay'),motion:data.has('motion'),crossfade:transitions.supported?data.has('crossfade'):prefs.crossfade};
 const revision=++settingsRevision;
 if(!account){
  try{localStorage.setItem('tonika.prefs',JSON.stringify(next));}
  catch{syncSettingsState(form,'Не удалось сохранить настройки.',true);return;}
  guest={...next};prefs={...next};apply();
  syncSettingsState(form,'Сохранено на этом устройстве');
  return;
 }
 prefs={...prefs,...next};apply();
 syncSettingsState(form,'Сохраняем…');
 settingsWrites=settingsWrites.then(async()=>{
  if(revision!==settingsRevision||!user)return;
  try{
   await api('/api/me','PATCH',next);
   if(!user)return;
   Object.assign(user,next);
   if(revision===settingsRevision)syncSettingsState(form,'Сохранено');
  }catch{
   if(revision===settingsRevision){apply();syncSettingsState(form,'Не удалось сохранить настройки.',true);}
  }
 });
}
document.addEventListener('change',e=>{
 if(['wifiOnly','downloadLimit'].includes(e.target.name)){
  downloadPrefs=downloadPolicy({...downloadPrefs,...(e.target.name==='wifiOnly'?{wifiOnly:e.target.checked}:{limitMB:Number(e.target.value)})});save('download-policy',downloadPrefs);
  if(offlineBatch?.automatic&&!connectionAllows(downloadPrefs,navigator.connection))offlineBatch.controller.abort();queueLikedCache(0);return;
 }
 if(e.target.name==='normalizeVolume'){normalizeVolume=e.target.checked;save('normalize-volume',normalizeVolume);eq.setNormalization(normalizeVolume);if(intendsPlayback())settleEqualizer(beginEqualizer());return;}
 if(scrub?.element===e.target){finishScrub(scrub,true);return;}
 if(e.target.name==='offlineMode'&&e.target.form?.id==='settings-form'){
  setManualOffline(e.target.checked);syncOfflineUI();return;
 }
 if(e.target.name==='haptics'&&e.target.form?.id==='settings-form'){
  hapticsEnabled=e.target.checked;save('haptics',hapticsEnabled);
  if(hapticsEnabled)pulse('tick',e);return;
 }
 const form=e.target.form;if(form?.id==='settings-form')persistSettings(form);
 if(e.target.name==='autoCacheLikes'){autoCacheLikes=e.target.checked;save('auto-cache-likes',autoCacheLikes);if(!autoCacheLikes&&offlineBatch?.automatic)offlineBatch.controller.abort();else queueLikedCache(0);return;}
 if(e.target.name==='crossfade'&&e.target.checked&&nativeAudio&&intendsPlayback())settleEqualizer(beginEqualizer());
 if(e.target.dataset.profileFile)uploadProfileImage(e.target);
 if(e.target.id==='eq-enabled'){eq.state.enabled=e.target.checked;applyEqualizer(true);}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='profile-edit-form'){e.preventDefault();saveProfile(e.target);return;}
 if(e.target.id==='library-import'){e.preventDefault();matchImport(e.target);return;}
 if(e.target.id!=='settings-form')return;
 e.preventDefault();persistSettings(e.target);
});
function attachAudio(el){
 for(const ev of ['loadedmetadata','durationchange','timeupdate','emptied'])el.addEventListener(ev,()=>{if(el===audio)updateTime();});
 for(const ev of ['waiting','seeking','seeked','canplay','playing','emptied'])el.addEventListener(ev,()=>{if(el===audio)syncPlaybackWait();});
 el.addEventListener('timeupdate',()=>{if(el===audio){measureListening();if(!scrub)transitions.tick(automaticTrack());}});
 for(const event of ['canplay','seeked'])el.addEventListener(event,()=>{if(el===audio&&!scrub)transitions.tick(automaticTrack());});
 el.addEventListener('seeking',()=>{if(el===audio){listening.position=null;transitions.rewind();}});
 el.addEventListener('playing',()=>{if(el===audio)rememberPlayed();});
 for(const ev of ['playing','pause','play'])el.addEventListener(ev,()=>{if(el===audio){if(el.paused&&!el.ended)invalidateFade();playing=!el.paused&&!el.ended&&!el.error;sync();}});
 el.addEventListener('ended',()=>{
  if(el!==audio)return;
  rememberLongPosition();
  if(scrub?.track===current?.id){scrub.ended=true;return;}
  if(prefs.autoplay||repeat!=='off')step(1,true);else{checkTrackEndSleep({});invalidateFade();}
  if(el===audio&&!starting){playing=!audio.paused&&!audio.ended;sync();}
 });
 el.addEventListener('error',()=>{if(el===audio&&current){const resumed=retryAfterNetworkError(el);invalidateFade();starting=false;playing=false;sync();if(!resumed)notice('Трек не загрузился. Попробуй снова или выбери другой.');}});
}
// A dropped connection (cell handoff, Wi-Fi to LTE) should not end the song: reload it from the same second.
let networkRetry={id:'',count:0,at:0};
function retryAfterNetworkError(element){
 const t=current,position=element.currentTime,request=playRequest;
 if(!intendsPlayback()||element.error?.code!==2||navigator.onLine===false)return false;
 // Separate drops over a long song each get their own retries.
 if(networkRetry.id!==t.id||Date.now()-networkRetry.at>30000)networkRetry={id:t.id,count:0,at:0};
 if(networkRetry.count>=2)return false;
 networkRetry.count++;networkRetry.at=Date.now();notice('Связь прервалась, продолжаем…');
 setTimeout(()=>{
  if(audio!==element||current!==t||request!==playRequest)return;
  element.load();
  element.addEventListener('loadedmetadata',()=>{if(audio===element&&current===t&&position<element.duration)element.currentTime=position;},{once:true});
  play(t,undefined,playMode);
 },1500*networkRetry.count);
 return true;
}
audioElements.forEach(attachAudio);
mountRowGestures(document,{onNext:id=>{const t=map.get(id);if(t)queueNext(t);},onLike:id=>{const t=map.get(id);if(t){pulse('like');likeTrack(t);}},onMenu:id=>{const t=map.get(id);if(t)open('info',t);},isLiked:id=>likes.has(id),feedback:kind=>pulse(kind==='hold'?'like':'tick')});
let focusSearch=false;
mobile.addEventListener('change',()=>{if(tracks.length){render();if(dialog.open&&dialog.dataset.view==='full')paintFull();}});
let previewImages=[];
function queuedCoverTrack(direction){
 const i=queue.indexOf(current?.id);
 if(i<0||queue.length<2)return null;
 const n=(i+direction+queue.length)%queue.length;
 const flexible=direction===1&&isWaveMode()&&i===queue.length-1;
 const t=!flexible&&map.get(queue[n]);
 return t&&(!offlineOnly()||offlineTracks.has(t.id))?fullCoverTrack(t):null;
}
dialog.addEventListener('close',()=>{previewImages=[];});
function dragArt(x){
 if(!motionAllowed())return;
 dragPlayerScene(dialog.querySelector('.full-player'),x,x?queuedCoverTrack(x<0?1:-1):null,setCoverColors);
}
makeSwipe(dialog,{start:'.full-artwork,.mx-full header,.mx-full-meta,.full-player',allow:e=>mobile.matches&&!sheet.open&&!e.target.closest('button,a,input,[data-lyric-line],.lyrics-lines'),allowDown:e=>!e.target.closest('button,a,input,[data-lyric-line],.lyrics-lines'),onX:delta=>{haptic(10);step(delta,false,true);},dragX:dragArt,onDown:()=>dismissLayer(dialog,{slide:true}),pull:dy=>dialog.style.setProperty('--pull',dy+'px')});
makeSwipe(sheet,{start:'[data-drag-sheet]',allow:e=>mobile.matches&&!e.target.closest('button,a')&&sheet.scrollTop<8,onDown:()=>dismissLayer(sheet,{slide:true}),pull:dy=>sheet.style.setProperty('--pull',dy+'px')});
let miniNow=null;
makeSwipe($('.player'),{start:'.now,.now-text,.now-cover,.now-like',allow:e=>mobile.matches&&!!current&&!e.target.closest('#like-now,.transport button'),dragX:dx=>{if(!miniNow)miniNow=$('.player .now');if(miniNow)miniNow.style.transform=dx?'translateX('+Math.max(-45,Math.min(45,dx))+'px)':'';},onX:delta=>{if(!miniNow)miniNow=$('.player .now');if(miniNow)miniNow.style.transform='';haptic(12);step(delta,false,true);}});
const swipeTabs=['#home','#discover','#library'];
makeSwipe(main,{
 start:'.mx-stage,.shelf-header',
 allow:e=>mobile.matches&&e.pointerType==='touch'&&!dialog.open&&!sheet.open&&!editor.open&&!e.target.closest('button,a,input')&&e.clientX>18&&e.clientX<innerWidth-18&&swipeTabs.includes(location.hash||'#home'),
 onX:(delta,event)=>{
  const i=swipeTabs.indexOf(location.hash||'#home');
  if(i<0)return;
  pulse('route',event);
  location.hash=swipeTabs[(i+delta+swipeTabs.length)%swipeTabs.length];
 }
});
function syncDockKeyboard(){
 const keyboard=mobile.matches&&page==='search'&&document.activeElement?.id==='search-query'&&window.visualViewport&&window.innerHeight-window.visualViewport.height>110;
 document.body.classList.toggle('typing-search',!!keyboard);
}
window.visualViewport?.addEventListener('resize',syncDockKeyboard);
for(const ev of ['focusin','focusout'])document.addEventListener(ev,()=>requestAnimationFrame(syncDockKeyboard));
function updateScrollUI(){
 document.body.classList.toggle('screen-scrolled',scrollY>17);
 const favorites=$('.mx-heart');document.body.classList.toggle('favorites-compact',!!favorites&&scrollY>favorites.offsetHeight-45);
}
window.addEventListener('scroll',updateScrollUI,{passive:true});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='search-query'){rememberSearch();if(mobile.matches)e.target.blur();}});
window.addEventListener('hashchange',e=>{
 const before=new URL(e.oldURL).hash, next=location.hash;
 if(next==='#settings'&&['#profile','#library','#library/offline'].includes(before))historyBackSettings=before;
 if(embedActive)closeEmbed();
 if(editor.open&&!editDraft?.busy)editor.close();
 if(page==='search'&&!next.startsWith('#search'))rememberSearch();
 if(next.startsWith('#search')&&(page!=='search'||next==='#search/collection'||before==='#search/collection')){searchBack=['#liked','#library','#discover'].includes(before)?before:(next==='#search/collection'?'#library':'#home');search='';searchTab='popular';}
 if(next!=='#moods')window.scrollTo(0,0);
 render();
 if(focusSearch&&page==='search'){focusSearch=false;$('#search-query')?.focus();}
 if(page!=='login'&&main.animate&&before!==next&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  for(const animation of main.getAnimations())animation.cancel();
  const goingBack=before.startsWith(next+'/')||next==='#profile'&&before.startsWith('#settings');
  const distance=motionAllowed()?(mobile.matches?(goingBack?-9:9):5):0;
  main.animate([{opacity:.67,transform:'translateY('+distance+'px)'},{opacity:1,transform:'none'}],{duration:distance?250:130,easing:'cubic-bezier(.2,.73,.24,1)'});
 }
});
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||page==='login'||e.ctrlKey||e.metaKey||e.altKey||dialog.open||sheet.open||editor.open||e.target.closest?.('input,textarea,select,[contenteditable]'))return;
 if(e.key==='/'){e.preventDefault();if(page==='search')$('#search-query')?.focus();else{focusSearch=true;location.hash='search';}}
 else if(!e.repeat&&e.code==='Space'&&!e.target.closest?.('button,a')){e.preventDefault();toggle();}
 else if(!e.repeat&&e.code==='KeyM'){transitions.setMuted(!audio.muted);sync();}
});
function recoverAudioEffect(){
 if(nativeAudio&&eq.routes(audio)&&!audio.paused&&!audio.ended){
  systemMedia.prepare();settleEqualizer(beginEqualizer(),{playbackRequest:playRequest});
 }
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncChartColor();recoverAudioEffect();}});
window.addEventListener('pageshow',e=>{if(e.persisted)recoverAudioEffect();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installation=e;$('#install').hidden=false;});
window.addEventListener('appinstalled',()=>{$('#install').hidden=true;installation=null;});
const offlineRegistration=supportsOffline()?navigator.serviceWorker.register('/sw.js',{type:'module',updateViaCache:'none'}).catch(()=>null):null;
window.addEventListener('offline',()=>{offlineBatch?.controller.abort();clearTimeout(likedCacheTimer);syncOfflineUI();if(current){queue=queue.filter(id=>id===current.id||offlineTracks.has(id));invalidateFade();if(offlineTracks.has(current.id))play(current,undefined,playMode,1,{start:intendsPlayback()});}});
window.addEventListener('online',()=>{syncOfflineUI();offlineFailed.clear();if(offlineMode)reconnectOnline();else queueLikedCache();});
window.addEventListener('focus',()=>reconnectOnline());
window.addEventListener('pageshow',()=>reconnectOnline());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnectOnline();});
window.addEventListener('pagehide',persistQueue);
navigator.connection?.addEventListener('change',()=>{if(offlineBatch?.automatic&&!connectionAllows(downloadPrefs,navigator.connection))offlineBatch.controller.abort();queueLikedCache(0);});
const login=new URL(location.href).searchParams.get('login');
if(login){
 authError={
  canceled:'Вход отменён или время ожидания истекло. Попробуй снова.',
  provider_config:'Яндекс ID отклонил настройки приложения Sway. Сообщи владельцу Sway.',
  code_rejected:'Яндекс ID не принял код входа. Начни вход заново.',
  provider:'Sway не смог завершить обмен с Яндекс ID. Попробуй снова.',
  profile_unavailable:'Sway не смог получить профиль из Яндекс ID. Попробуй снова.',
  session_failed:'Яндекс подтвердил вход, но Sway не смог сохранить сессию. Попробуй снова.',
  unavailable:'Вход через Яндекс ID пока недоступен.'
 }[login]||'Не удалось войти.';
 history.replaceState(null,'','/'+location.hash);
}
apply();
let booting=false,reconnectTimer;
function reconnectOnline(){
 if(offlineMode&&!manualOffline&&!booting&&!document.hidden&&navigator.onLine!==false)void startApp();
}
// Site maintenance: the admin paused live music. Downloaded tracks keep playing, a banner explains why.
let maintenance=null;
async function checkMaintenance(){
 try{
  const r=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(4000)});
  maintenance=r.ok?await r.json():null;
 }catch{maintenance=null;}
 if(!maintenance?.maintenance)maintenance=null;
 syncMaintenanceBanner();
 return !!maintenance;
}
function maintenanceUntil(value){
 const at=Date.parse(value||'');if(!Number.isFinite(at)||at<Date.now())return '';
 const sameDay=new Date(at).toDateString()===new Date().toDateString();
 return 'Ориентировочно до '+new Date(at).toLocaleString('ru-RU',sameDay?{hour:'2-digit',minute:'2-digit'}:{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
}
function syncMaintenanceBanner(){
 let banner=$('#maintenance-banner');
 document.body.toggleAttribute('data-maintenance',!!maintenance);
 if(!maintenance){banner?.remove();return;}
 if(!banner){banner=document.createElement('aside');banner.id='maintenance-banner';banner.className='maintenance-banner';banner.setAttribute('role','status');document.documentElement.append(banner);}
 const until=maintenanceUntil(maintenance.until);
 banner.innerHTML='<span class="mb-icon" aria-hidden="true">'+icon('settings')+'</span><div><strong>Идёт обновление сайта</strong><small>'+html(maintenance.message||'Скоро всё заработает. Пока можно слушать скачанные треки.')+(until?' · '+html(until):'')+'</small></div><button type="button" class="icon" data-action="maintenance-retry" aria-label="Проверить снова">'+icon('repeat')+'</button>';
}
function enterOffline(){
 offlineMode=true;accountOffline=true;accountReady=true;user=null;accountProfile=null;
 likes=new Set(load('offline-likes',[...likes]).filter(id=>offlineTracks.has(id)));
 tracks=[...offlineTracks.values()].map(({track,cover})=>({...track,art:cover?offlineURL('art',track.id):'/art/logo.svg'}));
 map=new Map(tracks.map(t=>[t.id,t]));
 indexArtists();refreshSuggestions();
 playlists.load().then(async()=>{if(offlineMode){await restoreQueue();render();}});
 queue=queue.filter(id=>map.has(id));
 history.replaceState(null,'','/#library/offline');
 render();
}
async function startApp(){
 if(booting)return;
  booting=true;clearTimeout(reconnectTimer);
  const retry=$('[data-action="retry-account"]');if(retry)retry.disabled=true;
 try{
  try{offlineTracks=new Map((await readOfflineTracks(canPlay)).map(entry=>[entry.track.id,entry]));}catch{}
  if(navigator.onLine===false){
   if(offlineMode)offlineFeedback('Нет подключения');
   enterOffline();return;
  }
  // Checked alongside the account request so the maintenance probe adds no start-up delay.
  const maintenanceCheck=checkMaintenance();
  try{
   const [data,paused]=await Promise.all([api('/api/me','GET',{},AbortSignal.timeout(6000)).catch(error=>({error})),maintenanceCheck]);
   if(paused){enterOffline();return;}
   if(data.error)throw data.error;user=data.user;loginRequired=data.loginRequired===true;loginConfigured=data.loginConfigured===true;accountOffline=false;
   offlineMode=false;document.body.removeAttribute('data-offline-mode');
   if(user){
    save('offline-likes',data.likes||[]);if(data.taste)applyTaste(data.taste);
    prefs={...guest,...user};likes=new Set([...(data.likes||[]),...onDeviceLikes]);$('#account-label').textContent=user.name;apply();
    try{
     const route=sessionStorage.getItem('sway.after-login');sessionStorage.removeItem('sway.after-login');
     if(route&&/^(?:#u\/[a-z0-9_]{3,24}|#join\/[a-f0-9]{64})$/.test(route)&&location.hash==='#home')history.replaceState(null,'','/'+route);
    }catch{}
   }
  }catch{
   accountOffline=true;loginRequired=true;loginConfigured=false;user=null;
  }
  accountReady=true;
  if(!accountOffline&&loginRequired&&!user){render();return;}
  if(await fetchCatalog({requireNetwork:accountOffline})===null)return;
  // A successful live catalogue response confirms server-authorized access
  // even when the separate account service is temporarily unavailable.
  if(accountOffline)loginRequired=false;
  offlineMode=false;document.body.removeAttribute('data-offline-mode');
  if(maintenance){maintenance=null;syncMaintenanceBanner();}
  if(!manualOffline&&location.hash==='#library/offline')history.replaceState(null,'','/#home');
  queueOwner=user?.id||'guest';restoreRecentHistory();await restoreQueue();render();void playlists.load().then(()=>{if(page==='library')render();});void accountListening.load();queueLikedCache();
 }finally{
  booting=false;if(retry?.isConnected)retry.disabled=false;
  if(offlineMode&&!manualOffline)reconnectTimer=setTimeout(reconnectOnline,30000);
 }
}
// Catalogue pages stream in while the user is already tapping. A render between touchstart and click
// replaces the pressed button and Safari drops the tap, so hold re-renders until the finger lifts.
// Home keeps its first render until the catalogue settles: the wave hero needs no partial pages.
let touching=0,idleRender=0,released=0;
addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')touching++;},true);
for(const type of ['pointerup','pointercancel'])addEventListener(type,e=>{if(e.pointerType!=='mouse')touching=Math.max(0,touching-1);released=performance.now();},true);
function renderWhenIdle(){
 clearTimeout(idleRender);
 idleRender=setTimeout(function attempt(){if(touching||performance.now()-released<350){idleRender=setTimeout(attempt,250);return;}if(!dialog.open&&!sheet.open)render();},touching?250:120);
}
async function fetchCatalog({requireNetwork=false}={}){
 delete document.body.dataset.authGate;
 main.innerHTML='<div class="sway-loader-inline"><div class="splash-ambient"></div><div class="splash-logo-wrap"><picture><source srcset="/art/logo-burst.webp" type="image/webp"><img src="/art/logo-burst.png" alt="Sway" class="splash-logo" width="140" height="140"></picture></div><div class="splash-text"><div class="splash-title">SWAY</div><div class="splash-sub">Загружаем музыку…</div></div></div>';
 try{
  let measured={},languages={},catalogEntries=[];
  const accept=(list,complete)=>{
   catalogEntries=list;const normalized=tagCatalog(list,measured,languages),present=new Set(normalized.map(t=>t.id));tracks=normalized.filter(t=>!t.canonicalId||!present.has(t.canonicalId));if(!Array.isArray(savedRemote))savedRemote=[];
   const retained=savedRemote.map(t=>restoreCommonsTrack(t,canPlay)).filter(Boolean);map=new Map([...savedItems(),...retained,...normalized].map(t=>[t.id,t]));indexAlbums();indexArtists();refreshSuggestions();
   if(complete){catalogSettled=true;void playlists.load().then(()=>{if(['library','stats'].includes(page))render();});void restoreQueue();queueLikedCache();}
  };
  let lastPartialRender=0;
  const result=await loadCatalog((list,complete)=>{
   accept(list,complete);
   // Full page rebuilds recreate the wave canvas and deck: throttle them while the catalog streams in.
   const quiet=['search','settings','profile','u','join'].includes(page)||dialog.open||sheet.open;
   // Home keeps the idle screen until the catalog settles; a rebuild mid-touch would drop the tap.
    if(!quiet&&(complete||(page!=='home'||main.querySelector('.sway-loader-inline'))&&performance.now()-lastPartialRender>2500)){lastPartialRender=performance.now();renderWhenIdle();}
   else if(page==='search')searchResults();
   renderResume();
  },error=>{document.querySelector('.catalog-retry')?.remove();if(error){const bar=document.createElement('div');bar.className='account-resume catalog-retry';bar.innerHTML='<span>Загружена часть каталога. Обнови, когда появится связь.</span><button class="btn" type="button" data-action="retry-account">Обновить</button>';main.prepend(bar);}},{requireNetwork});accept(result.items,result.settled===true);
  const metadata=async(path,fallback)=>fetch(path,{signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():fallback).catch(()=>fallback);
  void Promise.all([metadata('/track-moods.json',{}),metadata('/chart.json',[]),metadata('/albums.json',[]),metadata('/artists.json',[]),metadata('/track-languages.json',{})]).then(([m,chart,albums,artists,languageData])=>{measured=m||{};languages=languageData||{};if(Array.isArray(albums))albumsData=albums;if(Array.isArray(artists))artistsData=artists;if(Array.isArray(chart)&&chart.length&&!liveStats){rankedChart=chart;chartTime=Date.now();}accept(catalogEntries,false);if(page==='discover'&&!location.hash.split('/')[1])refreshDiscoverSlots();else if(['discover','artist','album'].includes(page))render();});
  return tracks;
 }catch(error){
  if(error.status===401){loginRequired=true;offlineMode=false;accountOffline=false;render();}
  else if(offlineTracks.size||navigator.onLine===false)enterOffline();
  else main.innerHTML='<section class="panel"><h1>Каталог не загрузился</h1><p>Проверь подключение и попробуй ещё раз.</p><button class="btn" type="button" data-action="retry-account">Обновить</button></section>';
  return null;
 }
}
await startApp();

initPwaPrompt({onToast:t=>toast(t)});
// Suggest installing on iPhone only after 40 s of real listening in this visit, never on first sight.
// Captured on document: crossfades swap the active <audio>, and media events do not bubble.
{let heard=0,last=0;const listen=e=>{const a=e.target;if(a!==audio)return;const now=a.currentTime;if(!a.paused&&now>last&&now-last<2)heard+=now-last;last=now;if(heard>=40){document.removeEventListener('timeupdate',listen,true);offerInstall({onToast:t=>toast(t)});}};document.addEventListener('timeupdate',listen,true);}

function openEditorialPlaylist(p) {
 const pTracks = (p.trackIds || []).map(id => map.get(id)).filter(Boolean);
 if (pTracks.length) {
  play(pTracks[0], pTracks, 'track');
  open('full');
 }
}

initAdminClient({onToast:t=>toast(t), onOpenPlaylist:p=>openEditorialPlaylist(p)});
document.dispatchEvent(new Event('sway:application-ready'));
