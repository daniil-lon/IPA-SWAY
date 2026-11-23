export function createPlaylistFolders({api,getUser,isOffline,html,icon,notice,onChange,modal}){
 let folders=[],items=[],owner='guest';
 const key=()=>`sway.playlist-folders.${owner}`;
 function persist(){try{localStorage.setItem(key(),JSON.stringify({folders,items}));}catch{}}
 const selected=()=>location.hash.startsWith('#library/playlists/folder/')?location.hash.split('/')[3]:'';
 const current=()=>folders.find(f=>f.id===selected());
 function connected(){if(isOffline()&&owner!=='guest')throw Error('offline');}
 async function load(value){
  owner=value;folders=[];items=[];
  try{const data=JSON.parse(localStorage.getItem(key())||'{}');folders=(data.folders||[]).filter(f=>typeof f.id==='string'&&typeof f.name==='string').slice(0,50);items=(data.items||[]).filter(i=>typeof i.playlist==='string'&&folders.some(f=>f.id===i.folder)).slice(0,100);}catch{}
  if(getUser()&&!isOffline())try{const data=await api('/api/playlist-folders');folders=data.folders;items=data.items;persist();}catch{notice('Папки не загрузились. Показана сохранённая копия.');}
 }
 function edit(folder){
  const layer=modal(folder?'Название папки':'Новая папка',`<form><label>Название<input name="name" maxlength="80" value="${html(folder?.name||'')}" required placeholder="Например, В дорогу"></label><button class="btn primary" type="submit">Сохранить</button></form>`);
  layer.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
   try{
    connected();const name=new FormData(event.target).get('name').trim();if(!name||name.length>80||/[\x00-\x1f]/.test(name))throw Error('name');
    if(folder){if(getUser())await api('/api/playlist-folders/'+folder.id,'PATCH',{name});folder.name=name;}
    else{if(folders.length>=50)throw Error('limit');folders.push(getUser()?await api('/api/playlist-folders','POST',{name}):{id:crypto.randomUUID(),name});}
    persist();layer.close();onChange();
   }catch{layer.querySelector('[role=status]').textContent='Не удалось сохранить папку. Проверь название и подключение.';}finally{button.disabled=false;}
  };
 }
 function choose(playlist){
  const active=items.find(i=>i.playlist===playlist)?.folder||'';
  const layer=modal('Переместить в папку',`<div class="playlist-destinations">${[{id:'',name:'Без папки'},...folders].map(f=>`<button type="button" class="setting-row" data-folder-target="${html(f.id)}"><span>${html(f.name)}</span>${icon(active===f.id?'check':'forward')}</button>`).join('')}</div><button class="btn" type="button" data-folder-new>Создать папку</button>`);
  layer.querySelectorAll('[data-folder-target]').forEach(button=>button.onclick=async()=>{
   button.disabled=true;try{
    connected();const folder=button.dataset.folderTarget;
    if(getUser()&&(folder||active))await api(`/api/playlist-folders/${folder||active}/playlists/${playlist}`,folder?'PUT':'DELETE');
    items=items.filter(i=>i.playlist!==playlist);if(folder)items.push({playlist,folder});persist();layer.close();onChange();
   }catch{layer.querySelector('[role=status]').textContent='Не удалось переместить плейлист. Проверь подключение.';}finally{button.disabled=false;}
  });
 }
 function controls(lists){
  const folder=current();
  if(folder)return `<div class="section-head"><h2>${html(folder.name)}</h2><button type="button" class="icon" data-folder-rename="${folder.id}" aria-label="Название папки">${icon('edit')}</button><button type="button" class="icon" data-folder-delete="${folder.id}" aria-label="Удалить папку">${icon('close')}</button></div>`;
  return `<section class="playlist-folder-section"><div class="section-head"><h2>Папки</h2><button type="button" class="icon" data-folder-new aria-label="Создать папку">${icon('plus')}</button></div><div class="playlist-folder-grid">${folders.map(f=>`<a href="#library/playlists/folder/${f.id}">${icon('library')}<strong>${html(f.name)}</strong><small>${items.filter(i=>i.folder===f.id&&lists.some(p=>p.id===i.playlist)).length} плейлистов</small></a>`).join('')}</div>${folders.length?'':'<p class="quiet">Объединяй плейлисты для дороги, работы и отдыха.</p>'}</section>`;
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-folder-new],[data-folder-rename],[data-folder-delete],[data-folder-choose]');if(!button)return;
  if(button.hasAttribute('data-folder-new')){edit();return;}
  if(button.dataset.folderChoose){choose(button.dataset.folderChoose);return;}
  const folder=folders.find(f=>f.id===(button.dataset.folderRename||button.dataset.folderDelete));if(!folder)return;
  if(button.dataset.folderRename){edit(folder);return;}
  const layer=modal('Удалить папку?',`<p>Плейлисты сохранятся в коллекции.</p><button class="btn primary" type="button" data-folder-confirm>Удалить папку</button>`);
  layer.querySelector('[data-folder-confirm]').onclick=async event=>{
   event.target.disabled=true;try{connected();if(getUser())await api('/api/playlist-folders/'+folder.id,'DELETE');folders=folders.filter(f=>f!==folder);items=items.filter(i=>i.folder!==folder.id);persist();layer.close();location.hash='#library/playlists';onChange();}catch{event.target.disabled=false;layer.querySelector('[role=status]').textContent='Не удалось удалить папку. Проверь подключение.';}
  };
 });
 return {load,controls,current,filter:lists=>lists.filter(p=>{const folder=items.find(i=>i.playlist===p.id)?.folder||'';return folder===(current()?.id||'');})};
}
