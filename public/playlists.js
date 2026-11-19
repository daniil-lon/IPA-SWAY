export function createPlaylists({api,icon,html,getTracks,getUser,isOffline,onChange,onPlay,rows,header,notice}){
 let lists=[],owner='guest',last='',busy=false,dialog,lifetime;
 const key=()=>`sway.playlists.${owner}`;
 const persist=()=>{try{localStorage.setItem(key(),JSON.stringify(lists));localStorage.setItem(key()+'.last',last);}catch{}};
 const find=id=>lists.find(p=>p.id===id);
 function cached(){try{const saved=JSON.parse(localStorage.getItem(key())||'[]');lists=Array.isArray(saved)?saved.filter(p=>typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.tracks)).slice(0,100):[];last=localStorage.getItem(key()+'.last')||'';}catch{lists=[];}}
 async function load(){
  owner=getUser()?.id||getUser()?.name||'guest';if(isOffline())try{owner=localStorage.getItem('sway.playlists.owner')||owner;}catch{}
  cached();
  if(getUser()&&!isOffline()){
   try{const data=await api('/api/playlists');lists=data.playlists;persist();try{localStorage.setItem('sway.playlists.owner',owner);}catch{}}
   catch{notice('Плейлисты аккаунта не загрузились. Показана сохранённая копия.');}
  }
 }
 async function create(name,tracks=[]){
  if(isOffline()&&owner!=='guest')throw new Error('offline');
  name=name.trim();if(!name||name.length>80)throw new Error('name');
  const list=getUser()?await api('/api/playlists','POST',{name,tracks}):{id:crypto.randomUUID(),name,tracks:[...new Set(tracks)],created:Date.now()/1000};
  lists.unshift(list);last=list.id;persist();onChange();return list;
 }
 async function add(list,id){
  if(!list||list.role==='viewer')return;
  if(list.tracks.includes(id)){last=list.id;persist();return;}
  if(isOffline()&&owner!=='guest')throw new Error('offline');
  if(getUser())await api(`/api/playlists/${list.id}/tracks/${encodeURIComponent(id)}`,'PUT');
  list.tracks.push(id);last=list.id;persist();onChange();
 }
 function quickButton(track,button){
  const list=lists.find(p=>p.id===last&&p.role!=='viewer'),added=list?.tracks.includes(track.id);return button(added?'check':'library',list?`${added?'В плейлисте':'Добавить в плейлист'} «${list.name}»`:'Добавить в плейлист',`data-playlist-pick="${html(track.id)}"`);
 }
 function modal(title,body){
  lifetime?.abort();lifetime=new AbortController();
  if(!dialog){dialog=document.createElement('dialog');dialog.id='playlist-dialog';dialog.className='glass playlist-dialog';document.body.append(dialog);}
  dialog.innerHTML=`<header><h2>${html(title)}</h2><button class="icon" type="button" data-playlist-close aria-label="Закрыть">${icon('close')}</button></header>${body}<p class="playlist-message" role="status"></p>`;
  dialog.setAttribute('aria-label',title);if(!dialog.open)dialog.showModal();
  dialog.onclick=e=>{if(e.target.closest('[data-playlist-close]'))dialog.close();};return dialog;
 }
 function picker(id){
  const track=getTracks().find(t=>t.id===id);if(!track)return;
  const layer=modal('Добавить в плейлист',`<p class="quiet">${html(track.title)} · ${html(track.artist)}</p><div class="playlist-destinations">${lists.filter(p=>p.role!=='viewer').map(p=>`<button type="button" class="setting-row" data-playlist-target="${p.id}"><span>${html(p.name)}<small>${p.tracks.length} треков</small></span>${icon(p.tracks.includes(id)?'check':'plus')}</button>`).join('')}</div>${createForm(id)}`);
  layer.addEventListener('click',async e=>{
   const b=e.target.closest('[data-playlist-target]');if(!b||busy)return;busy=true;b.disabled=true;
   try{await add(find(b.dataset.playlistTarget),id);dialog.close();}catch{layer.querySelector('[role=status]').textContent='Не удалось сохранить. Проверь подключение.';}finally{busy=false;b.disabled=false;}
  },{signal:lifetime.signal});
  bindCreate(layer,id,true);
 }
 const createForm=id=>`<form data-playlist-create><label>Название плейлиста<input name="name" maxlength="80" required placeholder="Например, В машину" autocomplete="off"></label><div class="playlist-presets">${['В машину','Тренировка','Ночной чилл'].map(name=>`<button type="button" class="mx-chip" data-playlist-name="${name}">${name}</button>`).join('')}</div><button class="btn primary" type="submit">${id?'Создать и добавить':'Создать плейлист'}</button></form>`;
 function bindCreate(layer,id,close=false){
  layer.querySelectorAll('[data-playlist-name]').forEach(b=>b.onclick=()=>{layer.querySelector('input[name=name]').value=b.dataset.playlistName;});
  layer.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(busy)return;busy=true;const b=e.target.querySelector('[type=submit]');b.disabled=true;
   try{await create(new FormData(e.target).get('name'),id?[id]:[]);if(close)dialog.close();else{dialog.close();location.hash='#library/playlists';}}
   catch{layer.querySelector('[role=status]').textContent='Не удалось создать плейлист. Проверь подключение.';}finally{busy=false;b.disabled=false;}
  };
 }
 function newList(){const layer=modal('Новый плейлист',createForm(''));bindCreate(layer,'');}
 function view(){
  const id=location.hash.split('/')[2],list=find(id),catalog=getTracks(),byId=new Map(catalog.map(t=>[t.id,t]));
  if(list){
   const items=list.tracks.map(id=>byId.get(id)).filter(Boolean),editable=list.role!=='viewer',owned=!list.role||list.role==='owner';
   return `<div class="browse-view playlist-view">${header(html(list.name),'#library/playlists')}<section class="playlist-hero"><div class="playlist-collage">${collage(items)}</div><h1>${html(list.name)}</h1><p class="quiet">${items.length} треков</p><div class="actions"><button type="button" class="btn primary" data-playlist-play="${list.id}" ${items.length?'':'disabled'}>${icon('play')}Слушать</button>${owned?`<button type="button" class="btn" data-playlist-share="${list.id}">${icon('share')}Пригласить</button><button type="button" class="btn" data-playlist-rename="${list.id}">${icon('edit')}Название</button><button type="button" class="icon" data-playlist-delete="${list.id}" aria-label="Удалить плейлист">${icon('close')}</button>`:`<button type="button" class="btn" data-playlist-leave="${list.id}">Покинуть</button>`}</div></section><p class="quiet">Добавляй треки кнопкой ${icon('library')} в поиске или через меню трека.</p><div class="playlist-tracks">${items.map(t=>`<div>${rows([t],true)}${list.addedBy?.[t.id]?`<p class="playlist-attribution">Добавил: ${html(list.addedBy[t.id])}</p>`:''}${editable?`<button type="button" class="icon" data-playlist-remove="${html(t.id)}" data-list-id="${list.id}" aria-label="Убрать ${html(t.title)} из плейлиста">${icon('close')}</button>`:''}</div>`).join('')}</div></div>`;
  }
  return `<div class="browse-view playlist-view">${header('Мои плейлисты','#library')}<div class="section-head"><h2>Музыка для твоих планов</h2><button type="button" class="icon" data-playlist-new aria-label="Создать плейлист">${icon('plus')}</button></div><div class="playlist-grid">${lists.map(p=>{const items=p.tracks.map(id=>byId.get(id)).filter(Boolean);return `<a href="#library/playlists/${p.id}"><div class="playlist-collage">${collage(items)}</div><strong>${html(p.name)}</strong><small>${p.tracks.length} треков</small></a>`;}).join('')}</div>${lists.length?'':'<p class="quiet">Собери «В машину», «Тренировка» или свой плейлист. Треки останутся в выбранном порядке.</p>'}<button class="btn primary" type="button" data-playlist-new>${icon('plus')}Создать плейлист</button><a class="btn" href="#settings/import">Импортировать плейлист</a></div>`;
 }
 const collage=items=>items.length?items.slice(0,4).map(t=>`<img src="${html(t.art)}" alt="" loading="lazy">`).join(''):icon('music');
 function summary(){return `<section class="collection-playlists"><div class="section-head"><a class="title-link" href="#library/playlists">Мои плейлисты ${icon('forward')}</a><button class="icon" type="button" data-playlist-new aria-label="Создать плейлист">${icon('plus')}</button></div><div class="playlist-mini">${lists.slice(0,3).map(p=>`<a href="#library/playlists/${p.id}">${icon('music')}<span><strong>${html(p.name)}</strong><small>${p.tracks.length} треков</small></span></a>`).join('')||'<p class="quiet">Собери музыку для дороги, тренировки или отдыха.</p>'}</div></section>`;}
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-playlist-pick],[data-playlist-choose],[data-playlist-new],[data-playlist-play],[data-playlist-remove],[data-playlist-rename],[data-playlist-delete],[data-playlist-share],[data-playlist-leave]');if(!b)return;
  if(b.hasAttribute('data-playlist-new')){newList();return;}
  if(b.dataset.playlistChoose){picker(b.dataset.playlistChoose);return;}
  if(b.dataset.playlistPick){
   const list=lists.find(p=>p.id===last&&p.role!=='viewer'),id=b.dataset.playlistPick;if(!list){picker(id);return;}b.disabled=true;
   try{await add(list,id);b.innerHTML=icon('check');b.setAttribute('aria-label','В плейлисте «'+list.name+'»');}catch{notice('Не удалось добавить трек в плейлист.');}finally{b.disabled=false;}return;
  }
  const list=find(b.dataset.playlistPlay||b.dataset.playlistRename||b.dataset.playlistDelete||b.dataset.playlistShare||b.dataset.playlistLeave||b.dataset.listId);if(!list)return;
  if(b.dataset.playlistPlay){onPlay(list.tracks);return;}
  if(b.dataset.playlistShare){
   const layer=modal('Музыка вместе','<p class="quiet">Приглашение действует 7 дней. Слушатель может включать музыку, редактор — добавлять и убирать треки.</p><div class="playlist-invite-actions"><button class="btn primary" type="button" data-invite-role="viewer">Пригласить слушателя</button><button class="btn" type="button" data-invite-role="editor">Пригласить редактора</button><button class="btn" type="button" data-revoke>Отозвать ссылки</button></div><div class="playlist-members"></div>');
   layer.querySelectorAll('[data-invite-role]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const r=await api('/api/playlists/'+list.id+'/invites','POST',{role:button.dataset.inviteRole});if(navigator.share)await navigator.share({title:list.name,url:r.url});else{try{await navigator.clipboard.writeText(r.url);layer.querySelector('[role=status]').textContent='Ссылка скопирована';}catch{layer.querySelector('[role=status]').textContent=r.url;}}}catch(e){if(e.name!=='AbortError')layer.querySelector('[role=status]').textContent='Не удалось создать приглашение.';}finally{button.disabled=false;}});
   layer.querySelector('[data-revoke]').onclick=async()=>{try{await api('/api/playlists/'+list.id+'/invites','DELETE');layer.querySelector('[role=status]').textContent='Старые ссылки больше не действуют.';}catch{layer.querySelector('[role=status]').textContent='Не удалось отозвать ссылки.';}};
   try{const r=await api('/api/playlists/'+list.id+'/members');layer.querySelector('.playlist-members').innerHTML=r.members.map(m=>'<div class="setting-row"><span>'+html(m.name)+'<small>'+(m.role==='editor'?'Редактор':'Слушатель')+'</small></span><button class="btn" type="button" data-member="'+html(m.uid)+'">Убрать</button></div>').join('');layer.querySelectorAll('[data-member]').forEach(button=>button.onclick=async()=>{try{await api('/api/playlists/'+list.id+'/members/'+encodeURIComponent(button.dataset.member),'DELETE');button.closest('.setting-row').remove();}catch{layer.querySelector('[role=status]').textContent='Не удалось убрать участника.';}});}catch{}
   return;
  }
  if(b.dataset.playlistLeave){try{await api('/api/playlists/'+list.id+'/members/'+encodeURIComponent(getUser().id),'DELETE');await load();location.hash='#library/playlists';onChange();}catch{notice('Не удалось покинуть плейлист.');}return;}

  if(b.dataset.playlistRename||b.dataset.playlistDelete){
   const deleting=!!b.dataset.playlistDelete,layer=modal(deleting?'Удалить плейлист?':'Название плейлиста',deleting?`<p class="quiet">«${html(list.name)}» будет удалён. Треки останутся в каталоге и избранном.</p><button type="button" class="btn danger" data-playlist-confirm>Удалить плейлист</button>`:`<form><label>Название<input name="name" maxlength="80" value="${html(list.name)}" required></label><button class="btn primary" type="submit">Сохранить</button></form>`);
   const confirm=async e=>{e.preventDefault();if(busy)return;busy=true;try{
    if(isOffline()&&owner!=='guest')throw new Error('offline');
    if(deleting){if(getUser())await api('/api/playlists/'+list.id,'DELETE');lists=lists.filter(p=>p!==list);location.hash='#library/playlists';}
    else{const name=new FormData(e.target).get('name').trim();if(!name)return;if(getUser())await api('/api/playlists/'+list.id,'PATCH',{name});list.name=name;}
    persist();dialog.close();onChange();
   }catch{layer.querySelector('[role=status]').textContent='Не удалось сохранить изменение.';}finally{busy=false;}};
   if(deleting)layer.querySelector('[data-playlist-confirm]').onclick=confirm;else layer.querySelector('form').onsubmit=confirm;return;
  }
  if(b.dataset.playlistRemove){b.disabled=true;try{if(isOffline()&&owner!=='guest')throw new Error('offline');if(getUser())await api(`/api/playlists/${list.id}/tracks/${encodeURIComponent(b.dataset.playlistRemove)}`,'DELETE');list.tracks=list.tracks.filter(id=>id!==b.dataset.playlistRemove);persist();onChange();}catch{b.disabled=false;notice('Не удалось убрать трек.');}}
 });
 return {load,view,summary,quickButton,create,get lists(){return lists;}};
}
