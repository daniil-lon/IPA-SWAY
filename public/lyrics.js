import {artistCredits} from './discovery.js';
const cache=new Map();let nextRequest=0,serial=Promise.resolve();
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,'');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function parseLRC(value){
 if(typeof value!=='string')return [];
 const offset=Number(value.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000,lines=[];
 for(const raw of value.slice(0,100000).split(/\r?\n/)){
  const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
  if(!stamps.length)continue;
  const text=raw.slice(stamps.at(-1).index+stamps.at(-1)[0].length).trim();
  if(!text)continue;
  for(const stamp of stamps){const at=Number(stamp[1])*60+Number(stamp[2].replace(':','.'))+offset;if(Number.isFinite(at)&&at>=0)lines.push({at,text});}
 }
 return lines.sort((a,b)=>a.at-b.at).slice(0,2000);
}
export function matchingLyrics(record,track){
 if(!record)return false;
 const cleanTrackTitle=normalize(String(track.title||'').replace(/\s*\(.*?\)/g,'').replace(/\s*\[.*?\]/g,''));
 const cleanRecTitle=normalize(String(record.trackName||'').replace(/\s*\(.*?\)/g,'').replace(/\s*\[.*?\]/g,''));
 if(cleanRecTitle!==cleanTrackTitle&&normalize(record.trackName)!==normalize(track.title))return false;
 if(Number.isFinite(track.seconds)&&(!Number.isFinite(Number(record.duration))||Math.abs(Number(record.duration)-track.seconds)>2.1))return false;
 const credits=artistCredits(track.artist).map(normalize),artists=artistCredits(record.artistName).map(normalize);
 return credits.some(name=>name&&artists.includes(name));
}
async function request(path,signal){
 if(Date.now()<nextRequest)throw new Error('rate_limited');
 const run=serial.catch(()=>{}).then(async()=>{
  if(Date.now()<nextRequest)throw new Error('rate_limited');
  await new Promise(resolve=>setTimeout(resolve,230));signal?.throwIfAborted();
  const response=await fetch('https://lrclib.net'+path,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),headers:{'Lrclib-Client':'Sway/1.0 (https://tonika-music.905589xx.workers.dev)'}});
  if(response.status===429||response.status===503){
   const header=response.headers.get('Retry-After'),delay=Number(header);
   nextRequest=Date.now()+(Number.isFinite(delay)&&delay>0?delay*1000:Math.max(15000,Date.parse(header)-Date.now()||0))+Math.random()*1000;
   throw new Error('rate_limited');
  }
  if(response.status===404)return null;
  if(!response.ok)throw new Error('lyrics_unavailable');
  return response.json();
 });serial=run;return run;
}
export async function loadLyrics(track,{signal,onPartial}={}){
 const key=[track.artist,track.title,Math.round(track.seconds||0)].join('|');
 const saved=cache.get(key);if(saved&&Date.now()-saved.at<86400000)return saved.value;
 const remember=value=>{cache.set(key,{value,at:Date.now()});if(cache.size>40)cache.delete(cache.keys().next().value);return value;};
 let fallback=null;
 if(track.id){
  try{
   const localRes=await fetch('/lyrics/'+encodeURIComponent(track.id)+'.json',{signal});
   if(localRes.ok){
    const json=await localRes.json();
    if(json&&(json.plain||json.lines?.length)){
     const lines=Array.isArray(json.lines)?json.lines.filter(l=>Number.isFinite(l?.at)&&l.at>=0&&typeof l.text==='string').slice(0,2000).sort((a,b)=>a.at-b.at):[];
     const value={...json,lines,plain:typeof json.plain==='string'?json.plain.slice(0,100000):''};
     if(lines.length)return remember(value);
     fallback=value;onPartial?.(value);
    }
   }
  }catch{}
 }
 try{
 const params=new URLSearchParams({track_name:track.title,artist_name:track.artist});
 if(track.seconds>=1&&track.seconds<=3600)params.set('duration',Math.round(track.seconds));
 let match=await request('/api/get?'+params,signal);
 if(!matchingLyrics(match,track)){
  const query=new URLSearchParams({track_name:track.title,artist_name:artistCredits(track.artist)[0]||track.artist});
  const found=await request('/api/search?'+query,signal);
  match=Array.isArray(found)?found.filter(r=>matchingLyrics(r,track)).sort((a,b)=>Number(!!b.syncedLyrics)-Number(!!a.syncedLyrics))[0]:null;
 }
 const value=match?{lines:parseLRC(match.syncedLyrics),plain:typeof match.plainLyrics==='string'?match.plainLyrics.slice(0,100000):'',instrumental:match.instrumental===true,id:match.id}:null;
 return remember(value?.lines.length?value:fallback||value);
 }catch(error){signal?.throwIfAborted();if(fallback)return remember(fallback);throw error;}
}

export function mountLyrics(root,track,{icon,getTime,onSeek,onMode,mode='off',signal}){
 const artwork=root.querySelector('.full-artwork'),toggle=root.querySelector('[data-player-lyrics]');
 if(!artwork||!toggle)return null;
 const panel=document.createElement('section');panel.className='lyrics-panel';panel.hidden=true;panel.setAttribute('aria-label','Текст песни');artwork.append(panel);
 let data=null,loading=false,loaded=false,active=-2,manualUntil=0,position=0,frame=0,wakeLock=null;
 const expandedAllowed=true,layer=root.closest('dialog');
 const heading=root.querySelector('header>span'),originalHeading=heading?.textContent;
 function setMode(value){
  mode=value;root.dataset.lyrics=mode;artwork.toggleAttribute('data-lyrics',mode!=='off');panel.hidden=mode==='off';toggle.setAttribute('aria-pressed',mode!=='off');
  layer?.classList.toggle('karaoke-active',mode==='expanded');
  if(mode!=='expanded'){
   if(document.fullscreenElement===layer)document.exitFullscreen?.().catch(()=>{});
   wakeLock?.release().catch(()=>{});wakeLock=null;
  }else if(navigator.wakeLock&&!document.hidden)navigator.wakeLock.request('screen').then(lock=>{if(mode==='expanded'&&!signal.aborted)wakeLock=lock;else lock.release();}).catch(()=>{});
  if(heading)heading.textContent=mode==='expanded'?track.title:originalHeading;
  onMode?.(mode);if(mode!=='off'){show();update(getTime(),true);}
  if(mode!=='off'&&!frame)frame=requestAnimationFrame(animate);
 }
 function paint(){
  if(signal.aborted)return;
  panel.innerHTML='<div class="lyrics-toolbar"><span>'+(data?.lines.length?'Текст песни':data?.plain?'Без синхронизации':'Текст песни')+'</span><div class="lyrics-actions">'+(data?.lines.length?'<button type="button" class="icon" data-lyrics-share aria-label="Поделиться строчкой">'+icon('share')+'</button>':'')+(expandedAllowed?'<button type="button" class="icon" data-lyrics-expand aria-label="'+(mode==='expanded'?'Свернуть текст':'Развернуть текст')+'">'+icon(mode==='expanded'?'chevron':'expand')+'</button>':'')+'</div></div>'+
   '<div class="lyrics-lines" aria-label="Строки песни">'+(data?.lines.length?data.lines.map((line,i)=>'<button type="button" data-lyric-line="'+i+'"><span class="lyric-text">'+esc(String(line.text||'').replace(/[|_\u2014\u2015\u2500-\u257f]/g,'').trim())+'</span></button>').join(''):data?.plain?'<p class="lyrics-plain">'+esc(String(data.plain||'').replace(/[|_\u2014\u2015\u2500-\u257f]/g,''))+'</p>':'<p class="lyrics-empty">'+(data?.instrumental?'Инструментальный трек':'Текст пока не найден')+'</p>')+'</div><a class="lyrics-credit" href="https://lrclib.net" target="_blank" rel="noopener noreferrer">Текст · LRCLIB</a>';
  active=-2;update(position,true);
 }
 async function show(){
  if(loaded){update(getTime(),true);return;}
  if(loading)return;loading=true;panel.innerHTML='<p class="lyrics-empty" role="status">Ищем текст…</p>';
  try{data=await loadLyrics(track,{signal,onPartial:value=>{data=value;paint();}});loaded=true;paint();}
  catch(e){if(signal.aborted)return;panel.innerHTML='<p class="lyrics-empty" role="status">'+(e.message==='rate_limited'?'Сервис текстов занят. Попробуй немного позже.':'Не удалось загрузить текст. Проверь подключение.')+'</p><button class="btn lyrics-retry" type="button" data-lyrics-retry>Повторить</button>';}
  finally{loading=false;}
 }
 function update(time,force=false){
  position=time;
  if(mode==='off'||!data?.lines.length)return;
  let lo=0,hi=data.lines.length-1,at=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(data.lines[mid].at<=time){at=mid;lo=mid+1;}else hi=mid-1;}
  if(at===active&&!force)return;active=at;
  const list=panel.querySelector('.lyrics-lines');if(!list)return;
  list.querySelectorAll('[data-lyric-line]').forEach((line,i)=>{line.classList.toggle('is-active',i===at);line.classList.toggle('is-near',Math.abs(i-at)===1);if(i===at)line.setAttribute('aria-current','true');else line.removeAttribute('aria-current');});
  const focused=list.querySelector('[aria-current=true]')||list.firstElementChild;
  if(focused&&(force||Date.now()>manualUntil))list.scrollTo({top:Math.max(0,focused.offsetTop-list.clientHeight*.42+focused.offsetHeight/2),behavior:force||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 toggle.addEventListener('click',()=>setMode(mode==='off'?'preview':'off'),{signal});
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-lyrics-share')){
   const curLine = data?.lines?.[active]?.text || data?.lines?.[0]?.text;
   if(curLine){
    import('./share-card.js').then(m => m.shareTrack(track, { quote: curLine, timestamp: getTime() }));
   }
   return;
  }

  if(b.hasAttribute('data-lyrics-expand')){
   setMode(mode==='expanded'?'preview':'expanded');paint();
   if(mode==='expanded'&&layer?.requestFullscreen&&!document.fullscreenElement)try{layer.requestFullscreen().catch(()=>{});}catch{}
  }
  else if(b.hasAttribute('data-lyrics-retry'))show();
  else if(b.dataset.lyricLine!==undefined){manualUntil=0;const line=data?.lines[Number(b.dataset.lyricLine)];if(line){onSeek(line.at);update(line.at,true);}}
 },{signal});
 for(const event of ['touchstart','wheel','pointerdown'])panel.addEventListener(event,()=>{manualUntil=Date.now()+5000;},{passive:true,signal});
 function animate(){frame=0;if(signal.aborted||mode==='off')return;if(!document.hidden)update(getTime());frame=requestAnimationFrame(animate);}
 signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);wakeLock?.release().catch(()=>{});queueMicrotask(()=>{if(!layer?.querySelector('[data-lyrics=expanded]'))layer?.classList.remove('karaoke-active');});},{once:true});
 setMode(mode);return {update,collapse(){if(mode==='expanded'){setMode('preview');paint();return true;}return false;}};
}
