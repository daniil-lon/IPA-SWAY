const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const ownBase='/api/profile';
export const yandexAvatarPath=ownBase+'/yandex-avatar';
const firstLetter=name=>Array.from(String(name||'S').trim())[0]?.toUpperCase()||'S';
const profileImage=(p,base,kind)=>p[kind==='cover'?'hasCover':'hasAvatar']?base+'/'+kind:'';
const crop=p=>Math.max(100,Math.min(180,Number(p.coverZoom)||100))/100;

export function signInView({configured,error,offline}){
 return '<section class="sway-login"><div class="sway-login-glass" aria-hidden="true"><i></i><i></i><i></i></div><div class="sway-login-card"><img src="/art/logo.svg" width="64" height="64" alt="Sway">'+
 '<p class="sway-account-kicker">МУЗЫКА ДЛЯ ТВОЕГО МОМЕНТА</p><h1>Войти в Sway</h1><p class="login-copy">Твоя коллекция, профиль и настройки под рукой на любом устройстве.</p>'+
 (error?'<p class="auth-status" role="alert">'+esc(error)+'</p>':'')+
 (configured?'<a class="sway-signin-button" href="/auth/yandex"><span aria-hidden="true">Я</span>Войти через Яндекс ID</a>':'<p class="auth-status">'+(offline?'Не удалось проверить подключение.':'Вход через Яндекс ID пока не настроен.')+'</p><button type="button" class="btn" data-action="retry-account">Проверить снова</button>')+
 '<small>Из Яндекс ID мы получаем имя, идентификатор аккаунта и, с твоего разрешения, фото для личного профиля. Профиль и избранное из каталога Sway хранятся в аккаунте, история и избранное Commons — на устройстве.</small></div></section>';
}

export function profileCard(p,{icon,track,own}){
 const base=own?ownBase:'/api/profiles/'+encodeURIComponent(p.handle);
 const cover=profileImage(p,base,'cover'),avatar=profileImage(p,base,'avatar')||(own&&p.hasYandexAvatar?yandexAvatarPath:'');
 const joined=p.joinedAt&&new Date(p.joinedAt*1000);
 const month=joined&&Number.isFinite(+joined)?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',timeZone:'UTC'}).formatToParts(joined).find(part=>part.type==='month')?.value:'';
 const member=month?'В Sway с '+month+' '+joined.getUTCFullYear():'';
 return '<section class="sway-profile-card"><div class="sway-profile-cover" aria-hidden="true" data-profile-zoom="'+crop(p)+'">'+(cover?'<img src="'+cover+'" alt="">':'')+'</div>'+
 '<div class="sway-profile-content"><span class="sway-profile-avatar">'+esc(firstLetter(p.name))+(avatar?'<img data-account-avatar src="'+avatar+'" referrerpolicy="no-referrer" alt="">':'')+'</span>'+
 '<h1>'+esc(p.name)+'</h1><p class="sway-profile-meta">'+[p.handle?'@'+esc(p.handle):'',member].filter(Boolean).join(' <span aria-hidden="true">·</span> ')+'</p>'+
 (p.bio?'<p class="sway-profile-bio">'+esc(p.bio)+'</p>':'')+
 (track?'<button type="button" class="sway-profile-track" data-play="'+esc(track.id)+'"><img src="'+esc(track.art)+'" alt=""><span><small>Песня профиля</small><strong>'+esc(track.title)+'</strong><small>'+esc(track.artist)+'</small></span>'+icon('play')+'</button>':'')+
 (own?'<div class="sway-profile-actions"><button type="button" class="btn primary" data-action="profile-edit">'+icon('edit')+'Изменить профиль</button>'+
 (p.visible&&p.handle?'<button type="button" class="btn" data-action="profile-share">'+icon('share')+'Поделиться</button>':'')+'</div>':'')+
 '</div></section>';
}

export function editorView(p,tracks,icon){
 const file=(kind,label)=>'<div class="profile-image-actions"><label class="btn profile-upload">'+icon('edit')+'<span>'+label+'</span><input type="file" accept="image/*" aria-label="'+label+'" data-profile-file="'+kind+'"></label><button type="button" class="btn profile-remove" data-profile-remove="'+kind+'" aria-label="'+(kind==='cover'?'Убрать обложку':'Убрать фото')+'" '+(profileImage(p,ownBase,kind)?'':'hidden')+'>'+icon('close')+'<span>Убрать</span></button></div>';
 const image=(kind)=>{
  const src=profileImage(p,ownBase,kind)||(kind==='avatar'&&p.hasYandexAvatar?yandexAvatarPath:'');
  return '<img data-profile-preview="'+kind+'" '+(kind==='avatar'?'data-account-avatar referrerpolicy="no-referrer" ':'')+'alt="" '+(src?'src="'+src+'"':'hidden')+'>';
 };
 return '<form id="profile-edit-form"><header><h2 id="profile-edit-title">Изменить профиль</h2><button class="icon dialog-close" type="button" aria-label="Закрыть">'+icon('close')+'</button></header>'+
 '<div class="profile-edit-scroll"><div class="profile-cover-preview sway-profile-cover">'+image('cover')+'</div>'+
 '<div class="profile-cover-tools"><div class="profile-cover-scale" '+(p.hasCover?'':'hidden')+'><div><label for="profile-cover-zoom">Масштаб обложки</label><output for="profile-cover-zoom">'+Math.round(crop(p)*100)+'%</output></div><div class="profile-zoom-control"><button type="button" class="icon" data-profile-zoom="-5" aria-label="Уменьшить обложку">−</button><input id="profile-cover-zoom" aria-label="Масштаб обложки" type="range" name="coverZoom" min="100" max="180" value="'+Math.round(crop(p)*100)+'"><button type="button" class="icon" data-profile-zoom="5" aria-label="Увеличить обложку">+</button></div></div>'+
 file('cover','Сменить обложку')+'</div><div class="profile-avatar-tools"><span class="sway-profile-avatar">'+esc(firstLetter(p.name))+image('avatar')+'</span><div><span class="profile-image-label">Фото профиля</span>'+file('avatar','Сменить фото')+'</div></div>'+
 '<label class="profile-field">Имя<input name="name" maxlength="80" autocomplete="nickname" value="'+esc(p.name)+'" required></label>'+
 '<label class="profile-field">Ник<input name="handle" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocapitalize="none" spellcheck="false" value="'+esc(p.handle)+'" placeholder="Например, sway_listener" aria-describedby="profile-handle-help"><small id="profile-handle-help">От 3 до 24 знаков: латинские буквы, цифры и _</small></label>'+
 '<label class="profile-field">О себе<textarea name="bio" maxlength="260" rows="3" placeholder="Какая музыка тебе близка?">'+esc(p.bio)+'</textarea></label>'+
 '<section class="profile-track-picker"><span class="profile-image-label" id="profile-song-label">Песня профиля</span><input type="hidden" name="profileTrack" value="'+esc(p.profileTrack)+'"><div class="profile-song-selection"><button class="profile-song-button" type="button" data-profile-song-open aria-controls="profile-song-panel" aria-expanded="false" aria-label="Выбрать песню профиля"></button><button class="icon profile-song-clear" type="button" aria-label="Убрать песню профиля">'+icon('close')+'</button></div><div id="profile-song-panel" hidden><label class="profile-song-search">'+icon('search')+'<input type="search" placeholder="Название песни или исполнитель" aria-label="Найти песню в Sway" autocomplete="off"></label><p class="profile-song-count" role="status"></p><div class="profile-song-results" role="listbox" aria-label="Песни Sway"></div></div></section>'+
 '<label class="setting-row profile-visibility"><span class="setting-copy"><strong>Доступ по ссылке</strong><small>Профиль смогут посмотреть вошедшие в Sway. Для ссылки нужен ник.</small></span><input type="checkbox" role="switch" name="visible" '+(p.visible?'checked':'')+'></label></div>'+
 '<footer><p role="status" class="profile-save-status"></p><div><button type="button" data-action="profile-cancel" class="btn">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></footer></form>';
}

export function mountProfileSongPicker(root,tracks,{icon,signal}){
 const input=root.querySelector('[name=profileTrack]'),open=root.querySelector('[data-profile-song-open]'),panel=root.querySelector('#profile-song-panel');
 const clear=root.querySelector('.profile-song-clear'),search=panel.querySelector('input'),results=panel.querySelector('.profile-song-results'),count=panel.querySelector('.profile-song-count');
 const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е').trim();
 const candidates=tracks.filter(t=>!t.provider).map(t=>({t,title:normalize(t.title),artist:normalize(t.artist)}));
 function summary(){
  const t=tracks.find(t=>t.id===input.value);
  open.innerHTML=(t?'<img src="'+esc(t.art)+'" alt=""><span><strong>'+esc(t.title)+'</strong><small>'+esc(t.artist)+'</small></span>':icon('music')+'<span><strong>Выбрать песню</strong><small>Найди любимый трек в Sway</small></span>')+icon('forward');clear.hidden=!t;
 }
 function setOpen(value){panel.hidden=!value;open.setAttribute('aria-expanded',value);if(value){render();search.focus();}else open.focus({preventScroll:true});}
 function render(){
  const q=normalize(search.value),parts=q.split(/\s+/).filter(Boolean);
  const found=candidates.filter(x=>parts.every(p=>x.title.includes(p)||x.artist.includes(p))).sort((a,b)=>Number(b.t.id===input.value)-Number(a.t.id===input.value)||Number(b.title.startsWith(q))-Number(a.title.startsWith(q)));
  results.innerHTML=found.slice(0,24).map(({t})=>'<button type="button" role="option" aria-selected="'+(t.id===input.value)+'" data-profile-song="'+esc(t.id)+'"><img src="'+esc(t.art)+'" alt="" loading="lazy"><span><strong>'+esc(t.title)+'</strong><small>'+esc(t.artist)+'</small></span>'+icon(t.id===input.value?'check':'plus')+'</button>').join('');
  count.textContent=found.length?(q?'Найдено: '+found.length:'Песни из каталога Sway'):'Не нашли такой трек. Попробуй другое название.';
 }
 open.addEventListener('click',()=>setOpen(panel.hidden),{signal});
 clear.addEventListener('click',()=>{input.value='';summary();if(!panel.hidden)render();},{signal});
 search.addEventListener('input',render,{signal});
 results.addEventListener('click',e=>{const b=e.target.closest('[data-profile-song]');if(!b)return;input.value=b.dataset.profileSong;summary();setOpen(false);},{signal});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);}},{signal});
 root.addEventListener('click',e=>{const b=e.target.closest('[data-profile-zoom]');if(!b)return;const zoom=root.querySelector('[name=coverZoom]');zoom.value=Math.max(100,Math.min(180,Number(zoom.value)+Number(b.dataset.profileZoom)));zoom.dispatchEvent(new Event('input',{bubbles:true}));},{signal});
 summary();
}

export async function resizeProfileImage(file,kind){
 if(!file||file.size>18*1024*1024)throw new Error('Выбери фото размером до 18 МБ.');
 const url=URL.createObjectURL(file);
 try{
  const bitmap=new Image();bitmap.src=url;await bitmap.decode();
  if(!bitmap.naturalWidth||bitmap.naturalWidth*bitmap.naturalHeight>48000000)throw new Error('Изображение слишком большое.');
  const avatar=kind==='avatar',w=avatar?256:1040,h=avatar?256:440,ratio=Math.max(w/bitmap.naturalWidth,h/bitmap.naturalHeight);
  const sw=w/ratio,sh=h/ratio;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#10161d';ctx.fillRect(0,0,w,h);
  ctx.drawImage(bitmap,(bitmap.naturalWidth-sw)/2,(bitmap.naturalHeight-sh)/2,sw,sh,0,0,w,h);
  for(const quality of [.88,.75,.61,.46]){
   const data=canvas.toDataURL('image/jpeg',quality);
   if(data.startsWith('data:image/jpeg;base64,')&&data.length<=(avatar?240000:480000))return data;
  }
  throw new Error('Попробуй выбрать другое изображение.');
 }finally{URL.revokeObjectURL(url);}
}
