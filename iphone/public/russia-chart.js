// «Чарт России»: top songs from Apple Music's Russian chart.
// Covers and 30-second previews stream from Apple's CDN, links open the full track in streaming services.
// A chart song that also exists in the Sway catalog plays in full through the regular player.
import {normalizeSearch} from './smart-search.js';

const STORE='sway.russia-chart', FRESH=6*3600*1000, STALE=7*24*3600*1000;
const read=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'null');}catch{return null;}};
const write=v=>{try{localStorage.setItem(STORE,JSON.stringify(v));}catch{}};
const cover=(url,size)=>String(url||'').replace(/\/\d+x\d+bb\.(jpg|png)$/,'/'+size+'x'+size+'bb.$1');
const firstArtist=s=>String(s||'').split(/\s*,\s*|\s+(?:&|feat\.?|ft\.?|x|×|\+)\s+/i)[0];
const cleanTitle=s=>String(s||'').replace(/\s*[([].*?[)\]]\s*/g,' ').trim();

export function createRussiaChart({html,icon,getTracks,isOffline,onChange,onPlay,onPreviewStart}){
 let items=read()?.items||null, job=null, failed=false, matches=null, matchedFrom=null;
 const player=new Audio();player.preload='none';
 let previewId='';
 const setPlaying=id=>{
  previewId=id;
  for(const b of document.querySelectorAll('[data-ru-preview]')){
   const on=b.dataset.ruPreview===id;b.classList.toggle('playing',on);b.setAttribute('aria-pressed',String(on));
   b.innerHTML=icon(on?'pause':'play');
  }
 };
 player.addEventListener('ended',()=>setPlaying(''));
 player.addEventListener('pause',()=>{if(previewId)setPlaying('');});
 // Apple's preview host is blocked on some networks: drop the dead button instead of retrying forever.
 player.addEventListener('error',()=>{
  const id=previewId;setPlaying('');
  const item=items?.find(x=>x.id===id);if(item)item.preview='';
  document.querySelector('[data-ru-preview="'+CSS.escape(id)+'"]')?.remove();
 });

 function load(force=false){
  const saved=read();
  if(job||isOffline())return;
  if(!force&&saved&&Date.now()-saved.at<FRESH){items=saved.items;return;}
  // Small pages: long responses from our host get cut on some Russian networks.
  job=(async()=>{
   const list=[];
   for(let page=0;page!==null&&list.length<100;){
    const r=await fetch('/api/russia-chart?page='+page,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error();
    const data=await r.json();list.push(...(data.items||[]));page=data.next??null;
   }
   if(!list.length)throw new Error();
   items=list;failed=false;matches=null;write({at:Date.now(),items});
  })().catch(()=>{failed=!items||!(saved&&Date.now()-saved.at<STALE);})
   .finally(()=>{job=null;onChange();});
 }

 // Catalog lookup by normalised title plus the first artist, so «Zivert — не святая» finds the Sway copy.
 function match(item){
  const tracks=getTracks();
  if(!matches||matchedFrom!==tracks.length){
   matches=new Map();matchedFrom=tracks.length;
   for(const t of tracks){const key=normalizeSearch(cleanTitle(t.title));if(!key)continue;if(!matches.has(key))matches.set(key,[]);matches.get(key).push(t);}
  }
  const found=matches.get(normalizeSearch(cleanTitle(item.title)));
  if(!found)return null;
  const artist=normalizeSearch(firstArtist(item.artist));
  return found.find(t=>{const a=normalizeSearch(t.artist);return artist&&(a.includes(artist)||artist.includes(a));})||null;
 }

 const search=item=>encodeURIComponent(firstArtist(item.artist)+' '+cleanTitle(item.title));
 const status=()=>isOffline()&&!items?'<p class="shelf-empty">Подключись к интернету, чтобы открыть чарт России.</p>':
  failed?'<p class="shelf-empty" role="status">Не удалось загрузить чарт России. <button type="button" class="mx-chip" data-ru-retry>Повторить</button></p>':
  '<p class="loading" role="status">Загружаем чарт России…</p>';

 function row(item,i){
  const local=match(item), on=previewId===item.id;
  return '<article class="ru-row">'+
   '<span class="ru-rank">'+(i+1)+'</span>'+
   '<span class="ru-art"><img src="'+html(cover(item.art,160))+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>'+
   '<div class="ru-meta"><strong>'+html(item.title)+(item.explicit?' <span class="badge-e" aria-label="Explicit">E</span>':'')+'</strong><small>'+html(item.artist)+'</small>'+
    '<span class="ru-links">'+(local?'<button type="button" class="ru-full" data-ru-play="'+html(local.id)+'">'+icon('play')+'Целиком в Sway</button>':'')+
    '<a href="https://music.yandex.ru/search?text='+search(item)+'" target="_blank" rel="noopener">Яндекс</a>'+
    (local?'':'<a href="https://vk.com/audio?q='+search(item)+'" target="_blank" rel="noopener">VK</a>'+
    (item.apple?'<a href="'+html(item.apple)+'" target="_blank" rel="noopener">Apple</a>':''))+'</span></div>'+
   // The full Sway track beats a 30-second clip, so matched rows skip the preview button.
   (item.preview&&!local?'<button type="button" class="ru-preview'+(on?' playing':'')+'" data-ru-preview="'+html(item.id)+'" aria-pressed="'+on+'" aria-label="Отрывок: '+html(item.title)+'">'+icon(on?'pause':'play')+'</button>':'')+
  '</article>';
 }

 function shelf(){
  // On the discover page a failed chart simply stays hidden; the full page shows the retry button.
  if(!items){load();return isOffline()||failed?'':'<section class="ru-shelf"><h2 class="title-link">Чарт России</h2>'+status()+'</section>';}
  load();
  return '<section class="ru-shelf"><a class="title-link" href="#discover/russia">Чарт России '+icon('forward')+'</a>'+
   '<div class="ru-rail">'+items.slice(0,12).map((item,i)=>'<a class="ru-card" href="#discover/russia"><span class="ru-card-art"><img src="'+html(cover(item.art,300))+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><b>'+(i+1)+'</b></span><strong>'+html(item.title)+'</strong><small>'+html(item.artist)+'</small></a>').join('')+'</div></section>';
 }

 function view(header){
  load();
  const found=items?items.filter(match).length:0;
  return '<div class="browse-view ru-view">'+header+
   '<section class="ru-hero"><h1>Чарт России</h1><p>Топ-100 Apple Music · обновляется каждый день</p>'+
   (items?'<p class="ru-note">Отрывки по 30 секунд. '+(found?found+' '+(found%10===1&&found%100!==11?'песня есть':'песен есть')+' в Sway целиком.':'Полные версии — в Яндекс Музыке или VK.')+'</p>':'')+'</section>'+
   (items?'<div class="ru-list">'+items.map(row).join('')+'</div>':status())+'</div>';
 }

 function handle(target){
  const retry=target.closest('[data-ru-retry]');
  if(retry){retry.disabled=true;load(true);return true;}
  const full=target.closest('[data-ru-play]');
  if(full){stop();onPlay(full.dataset.ruPlay);return true;}
  const b=target.closest('[data-ru-preview]');
  if(!b)return false;
  const item=items?.find(x=>x.id===b.dataset.ruPreview);
  if(!item?.preview)return true;
  if(previewId===item.id){player.pause();return true;}
  onPreviewStart();
  player.src=item.preview;
  setPlaying(item.id);
  player.play().catch(()=>setPlaying(''));
  return true;
 }
 function stop(){if(previewId){player.pause();setPlaying('');}}
 return {load,shelf,view,handle,stop};
}
