import {genreOf} from './discovery.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const normalize=s=>String(s).normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е');

export function tasteView({genres,icon}){
 return '<section class="taste-view"><h1 class="taste-intro">Кто тебе нравится?</h1><div class="taste-sticky"><div class="taste-genres" aria-label="Любимые жанры"><button type="button" data-taste-mix aria-pressed="true">Микс</button>'+genres.map(g=>'<button type="button" data-taste-genre="'+esc(g)+'" aria-pressed="false">'+esc(g)+'</button>').join('')+'</div><button type="button" class="icon taste-search-open" aria-label="Найти исполнителя">'+icon('search')+'</button><label class="taste-search" hidden>'+icon('search')+'<input type="search" placeholder="Найти исполнителя" aria-label="Поиск любимых исполнителей" autocomplete="off"><button type="button" class="icon" data-taste-search-close aria-label="Закрыть поиск">'+icon('close')+'</button></label></div><div class="taste-grid"></div><p class="taste-empty" role="status" hidden>Не нашли такого исполнителя.</p><div class="taste-save glass"><span class="taste-selected-portraits" aria-hidden="true"></span><span class="taste-count" role="status"></span><button type="button" class="btn primary" data-taste-save>Сохранить</button></div></section>';
}
export function mountTaste(root,{artists,preferredArtists,preferredGenres,save,icon,signal,sourceFor,onPreviewStart,onFeedback}){
 const selected=new Set(preferredArtists),genres=new Set(preferredGenres);
 const entries=artists.filter(a=>a.items?.some(t=>typeof t.audio==='string')).sort((a,b)=>Number(selected.has(b.name))-Number(selected.has(a.name))||b.items.length-a.items.length);
 const grid=root.querySelector('.taste-grid'),search=root.querySelector('input'),count=root.querySelector('.taste-count'),portraits=root.querySelector('.taste-selected-portraits'),saveButton=root.querySelector('[data-taste-save]');
 let filter='',visible=[],preview=null,index=0,resume=null,flight=0,drag=null,settling=false,clipTrack=null;
 const clip=new Audio();clip.preload='none';clip.playsInline=true;
 const picture=a=>a?.art||a?.fallbackArt||a?.items[0]?.art||'/art/logo.svg';
 const image=a=>'<img src="'+esc(picture(a))+'" data-player-art-fallback="'+esc(a.fallbackArt||a.items[0].art)+'" alt="" loading="lazy">';
 function render(){
  const q=normalize(search.value).trim();
  visible=entries.filter(a=>(!q||normalize(a.name).includes(q))&&(!filter||a.items.some(t=>genreOf(t)===filter)));
  grid.innerHTML=visible.map(a=>'<article class="taste-artist"><button type="button" class="taste-portrait" data-taste-preview="'+esc(a.slug)+'" aria-label="Послушать '+esc(a.name)+'">'+image(a)+'<strong>'+esc(a.name)+'</strong></button><button type="button" class="taste-heart" data-taste-artist="'+esc(a.name)+'" aria-label="Нравится '+esc(a.name)+'" aria-pressed="'+selected.has(a.name)+'">'+icon('heart')+'</button></article>').join('');
  root.querySelector('.taste-empty').hidden=visible.length>0;sync();
 }
 function sync(){
  count.textContent=selected.size?'Выбрано '+selected.size+' исполнителей':'Выбери любимых';
  portraits.innerHTML=entries.filter(a=>selected.has(a.name)).slice(0,3).map(image).join('');
  root.querySelectorAll('[data-taste-genre]').forEach(b=>b.setAttribute('aria-pressed',genres.has(b.dataset.tasteGenre)));
  root.querySelector('[data-taste-mix]').setAttribute('aria-pressed',!filter);
  for(const el of [root,preview].filter(Boolean))el.querySelectorAll('[data-taste-artist]').forEach(b=>b.setAttribute('aria-pressed',selected.has(b.dataset.tasteArtist)));
 }
 function choose(name){
  if(selected.has(name))selected.delete(name);else if(selected.size<150)selected.add(name);else{count.textContent='Можно выбрать до 150 исполнителей';return;}
  onFeedback?.();sync();
 }
 function stop(restore=false){
  flight++;clip.pause();clip.removeAttribute('src');clip.load();clipTrack=null;
  if(restore){const callback=resume;resume=null;callback?.();}
 }
 function close(restore=true){stop(restore);preview?.close();preview?.remove();preview=null;drag=null;settling=false;}
 function status(text=''){if(preview)preview.querySelector('.taste-preview-status').textContent=text;}
 function playClip(attempt=0){
  if(!preview)return;
  const songs=visible[index]?.items.filter(t=>typeof t.audio==='string')||[],t=songs[attempt];
  if(!t){status('Предпрослушивание недоступно');return;}
  const ticket=++flight;clip.pause();clip.muted=false;clip.volume=1;clipTrack=t;clip.src=sourceFor(t);clip.preload='auto';status();
  preview.querySelector('.taste-preview-track').textContent=t.title;
  // Call play in the tap. Safari can reject an initial seek before metadata.
  clip.onloadedmetadata=()=>{if(ticket!==flight)return;const d=clip.duration;if(Number.isFinite(d)&&d>35)try{clip.currentTime=Math.min(20,d*.16);}catch{}};
  let pending;try{pending=clip.play();}catch(error){failed(error);return;}
  pending?.then(()=>{if(ticket===flight)status();},failed);
  function failed(error){
   if(ticket!==flight||!preview||error?.name==='AbortError')return;
   if(error?.name!=='NotAllowedError'&&attempt<2&&attempt+1<songs.length){playClip(attempt+1);return;}
   status(error?.name==='NotAllowedError'?'Нажми на портрет, чтобы послушать':'Предпрослушивание пока недоступно');
  }
 }
 function syncPreview(){
  if(!preview)return;
  const a=visible[index],before=visible[(index-1+visible.length)%visible.length],after=visible[(index+1)%visible.length];
  preview.querySelector('.taste-preview-stage').innerHTML='<div class="taste-preview-rail"><button type="button" class="taste-neighbor before" data-taste-step="-1" aria-label="Предыдущий исполнитель">'+image(before)+'</button><article class="taste-focus-card">'+image(a)+'<div class="taste-preview-copy"><p class="taste-preview-track">'+esc(a.items[0].title)+'</p><h2>'+esc(a.name)+'</h2><button type="button" class="icon taste-preview-heart" data-taste-artist="'+esc(a.name)+'" aria-label="Нравится '+esc(a.name)+'" aria-pressed="'+selected.has(a.name)+'">'+icon('heart')+'</button></div></article><button type="button" class="taste-neighbor after" data-taste-step="1" aria-label="Следующий исполнитель">'+image(after)+'</button></div>';
 }
 async function step(delta){
  if(!visible.length||settling||!preview)return;settling=true;
  const rail=preview.querySelector('.taste-preview-rail'),distance=preview.querySelector('.taste-focus-card').offsetHeight+18;
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
   const animation=rail.animate([{transform:getComputedStyle(rail).transform},{transform:'translateY('+(-delta*distance)+'px)'}],{duration:340,easing:'cubic-bezier(.2,.76,.25,1)',fill:'forwards'});
   try{await animation.finished;}catch{}
  }
  if(!preview){settling=false;return;}
  index=(index+delta+visible.length)%visible.length;syncPreview();playClip();onFeedback?.();settling=false;
 }
 function open(slug){
  close();index=Math.max(0,visible.findIndex(a=>a.slug===slug));if(!visible.length)return;
  preview=document.createElement('dialog');preview.className='taste-preview';preview.setAttribute('aria-label','Предпрослушивание исполнителей');
  preview.innerHTML='<header><button type="button" class="icon" data-taste-close aria-label="Назад">'+icon('back')+'</button><span>Выбери любимых</span></header><div class="taste-preview-stage"></div><p class="taste-preview-status" role="status"></p>';
  document.body.append(preview);syncPreview();preview.showModal();resume=onPreviewStart?.();playClip();
  preview.addEventListener('cancel',e=>{e.preventDefault();close();},{signal});
  preview.addEventListener('click',e=>{
   if(settling)return;
   const b=e.target.closest('button');if(!b){if(e.target.closest('.taste-focus-card')&&clip.paused)playClip();return;}
   if(b.hasAttribute('data-taste-close'))close();
   else if(b.dataset.tasteArtist)choose(b.dataset.tasteArtist);
   else if(b.dataset.tasteStep)step(Number(b.dataset.tasteStep));
  },{signal});
  preview.addEventListener('pointerdown',e=>{if(e.isPrimary&&!e.target.closest('button'))drag={id:e.pointerId,x:e.clientX,y:e.clientY};},{signal});
  preview.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||settling)return;const dy=e.clientY-drag.y;if(Math.abs(dy)>7){drag.moved=true;preview.setPointerCapture(e.pointerId);preview.querySelector('.taste-preview-rail').style.transform='translateY('+Math.max(-240,Math.min(240,dy))+'px)';}},{signal});
  preview.addEventListener('pointerup',e=>{
   if(!drag||drag.id!==e.pointerId)return;const dy=e.clientY-drag.y,dx=e.clientX-drag.x;drag=null;
   if(Math.abs(dy)>50||Math.abs(dx)>65)step((Math.abs(dy)>Math.abs(dx)?dy:dx)<0?1:-1);
   else preview.querySelector('.taste-preview-rail').style.transform='';
  },{signal});
  preview.addEventListener('pointercancel',()=>{drag=null;if(preview)preview.querySelector('.taste-preview-rail').style.transform='';},{signal});
  preview.addEventListener('keydown',e=>{if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)){e.preventDefault();step(['ArrowDown','ArrowRight'].includes(e.key)?1:-1);}},{signal});
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tasteArtist)choose(b.dataset.tasteArtist);
  else if(b.dataset.tastePreview)open(b.dataset.tastePreview);
  else if(b.classList.contains('taste-search-open')){root.querySelector('.taste-search').hidden=false;search.focus();}
  else if(b.hasAttribute('data-taste-search-close')){search.value='';root.querySelector('.taste-search').hidden=true;render();root.querySelector('.taste-search-open').focus();}
  else if(b.dataset.tasteGenre){
   const g=b.dataset.tasteGenre;if(genres.has(g))genres.delete(g);else if(genres.size<5)genres.add(g);else{count.textContent='Выбери не больше пяти жанров';return;}
   filter=filter===g?'':g;render();
  }else if(b.hasAttribute('data-taste-mix')){filter='';render();}
  else if(b.hasAttribute('data-taste-save')){
   saveButton.disabled=true;count.textContent='Сохраняем…';
   try{await save({artists:[...selected],genres:[...genres]});count.textContent='Сохранено';}
   catch{count.textContent='Не удалось сохранить. Попробуй ещё раз.';}
   finally{saveButton.disabled=false;}
  }
 },{signal});
 search.addEventListener('input',render,{signal});
 clip.addEventListener('ended',()=>{if(preview)playClip(0);},{signal});
 signal.addEventListener('abort',()=>close(false),{once:true});render();
 return {get track(){return clipTrack;}};
}
