import fs from 'node:fs';
let s=fs.readFileSync('public/playlists.js','utf8');
s=s.replace('if(!list)return;','if(!list||list.role===\'viewer\')return;');
s=s.replace('lists.map(p=>`<button type="button" class="setting-row"','lists.filter(p=>p.role!==\'viewer\').map(p=>`<button type="button" class="setting-row"');
s=s.replace('const list=find(last),added=',"const list=lists.find(p=>p.id===last&&p.role!=='viewer'),added=");
s=s.replace('const list=find(last),id=b.dataset.playlistPick;',"const list=lists.find(p=>p.id===last&&p.role!=='viewer'),id=b.dataset.playlistPick;");
s=s.replace('const items=list.tracks.map(id=>byId.get(id)).filter(Boolean);',"const items=list.tracks.map(id=>byId.get(id)).filter(Boolean),editable=list.role!=='viewer',owned=!list.role||list.role==='owner';");
s=s.replace('<button type="button" class="btn" data-playlist-rename="${list.id}">',"${owned?`<button type=\"button\" class=\"btn\" data-playlist-share=\"${list.id}\">${icon('share')}Пригласить</button><button type=\"button\" class=\"btn\" data-playlist-rename=\"${list.id}\">`");
s=s.replace('aria-label="Удалить плейлист">${icon(\'close\')}</button></div>',"aria-label=\"Удалить плейлист\">${icon('close')}</button>`:`<button type=\"button\" class=\"btn\" data-playlist-leave=\"${list.id}\">Покинуть</button>`}</div>");
s=s.replace('${rows([t],true)}<button type="button"', '${rows([t],true)}${list.addedBy?.[t.id]?`<p class="playlist-attribution">Добавил: ${html(list.addedBy[t.id])}</p>`:\'\'}${editable?`<button type="button"');
s=s.replace('aria-label="Убрать ${html(t.title)} из плейлиста">${icon(\'close\')}</button></div>', 'aria-label="Убрать ${html(t.title)} из плейлиста">${icon(\'close\')}</button>`:\'\'}</div>');
s=s.replace('[data-playlist-delete]\');','[data-playlist-delete],[data-playlist-share],[data-playlist-leave]\');');
s=s.replace('b.dataset.playlistDelete||b.dataset.listId','b.dataset.playlistDelete||b.dataset.playlistShare||b.dataset.playlistLeave||b.dataset.listId');
s=s.replace("if(b.dataset.playlistPlay){onPlay(list.tracks);return;}",`if(b.dataset.playlistPlay){onPlay(list.tracks);return;}
  if(b.dataset.playlistShare){
   const layer=modal('Музыка вместе','<p class="quiet">Приглашение действует 7 дней. Слушатель может включать музыку, редактор — добавлять и убирать треки.</p><div class="playlist-invite-actions"><button class="btn primary" type="button" data-invite-role="viewer">Пригласить слушателя</button><button class="btn" type="button" data-invite-role="editor">Пригласить редактора</button><button class="btn" type="button" data-revoke>Отозвать ссылки</button></div><div class="playlist-members"></div>');
   layer.querySelectorAll('[data-invite-role]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const r=await api('/api/playlists/'+list.id+'/invites','POST',{role:button.dataset.inviteRole});if(navigator.share)await navigator.share({title:list.name,url:r.url});else{try{await navigator.clipboard.writeText(r.url);layer.querySelector('[role=status]').textContent='Ссылка скопирована';}catch{layer.querySelector('[role=status]').textContent=r.url;}}}catch(e){if(e.name!=='AbortError')layer.querySelector('[role=status]').textContent='Не удалось создать приглашение.';}finally{button.disabled=false;}});
   layer.querySelector('[data-revoke]').onclick=async()=>{try{await api('/api/playlists/'+list.id+'/invites','DELETE');layer.querySelector('[role=status]').textContent='Старые ссылки больше не действуют.';}catch{layer.querySelector('[role=status]').textContent='Не удалось отозвать ссылки.';}};
   try{const r=await api('/api/playlists/'+list.id+'/members');layer.querySelector('.playlist-members').innerHTML=r.members.map(m=>'<div class="setting-row"><span>'+html(m.name)+'<small>'+(m.role==='editor'?'Редактор':'Слушатель')+'</small></span><button class="btn" type="button" data-member="'+html(m.uid)+'">Убрать</button></div>').join('');layer.querySelectorAll('[data-member]').forEach(button=>button.onclick=async()=>{try{await api('/api/playlists/'+list.id+'/members/'+encodeURIComponent(button.dataset.member),'DELETE');button.closest('.setting-row').remove();}catch{layer.querySelector('[role=status]').textContent='Не удалось убрать участника.';}});}catch{}
   return;
  }
  if(b.dataset.playlistLeave){try{await api('/api/playlists/'+list.id+'/members/'+encodeURIComponent(getUser().id),'DELETE');await load();location.hash='#library/playlists';onChange();}catch{notice('Не удалось покинуть плейлист.');}return;}
`);
fs.writeFileSync('public/playlists.js',s);
