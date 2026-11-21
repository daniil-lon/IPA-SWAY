import fs from 'node:fs';
let s=fs.readFileSync('public/app.js','utf8');
s="import {loadCatalog} from './catalog-loader.js';\nimport {searchTracks,normalizeSearch} from './smart-search.js';\nimport {createListeningAccount} from './listening-account.js';\nimport {mountListeningStats} from './listening-stats.js';\n"+s;
s=s.replace("save('queue-owner',queueOwner);","save('queue-owner',queueOwner);\n accountListening?.changed();");
const anchor='async function restoreQueue(){';
s=s.replace(anchor,`const accountListening=createListeningAccount({api,getUser:()=>user,getTrack:id=>map.get(id),getSnapshot:()=>current?{queue,current:current.id,position:audio.currentTime,mode:playMode,shuffle,repeat,nextUp,waveMood,waveMix}:null,applySnapshot:async snapshot=>{pausePlayback();current=null;save('queue.'+queueOwner,snapshot);await restoreQueue();render();},onHistory:ids=>{recentTracks=[...new Set([...recentTracks,...ids])].slice(0,200);save('recent-tracks',recentTracks);},onChange:()=>{if(accountReady&&tracks.length)renderResume();}});
function renderResume(){
 document.querySelector('.account-resume')?.remove();const r=accountListening.remote;if(!r||!map.has(r.snapshot?.current))return;
 const bar=document.createElement('div');bar.className='account-resume';bar.innerHTML='<span>Продолжить «'+html(map.get(r.snapshot.current).title)+'» с другого устройства?</span><button class="btn primary" type="button" data-account-resume>Продолжить</button><button class="btn" type="button" data-account-keep>Остаться здесь</button>';main.prepend(bar);bar.querySelector('[data-account-resume]').onclick=()=>accountListening.resume();bar.querySelector('[data-account-keep]').onclick=()=>accountListening.keep();
}
${anchor}`);
s=s.replace(/ const query=search.trim\(\).toLocaleLowerCase\('ru'\), scope=([\s\S]*?)\n return scope.filter\([^\n]+\);/," const scope=$1\n return searchTracks(scope,search);");
s=s.replace("const items=searchItems();\n const status=", "const items=searchItems();\n const status=");
s=s.replace("+matchingArtistCard(q)+(!showResults", "+searchGroups(q)+(!showResults");
s=s.replace('function searchResults(){',`function searchGroups(q){
 if(!q||collectionSearch())return '';const match=v=>normalizeSearch(v).includes(normalizeSearch(q));
 const artists=[...artistIndex.values()].filter(a=>match(a.name)).slice(0,8),albums=albumsData.filter(a=>match(a.title)).slice(0,8),lists=playlists.lists.filter(p=>match(p.name));
 const group=(title,entries)=>entries.length?'<section class="search-group"><h3>'+title+'</h3><div class="search-group-links">'+entries.join('')+'</div></section>':'';
 return group('Исполнители',artists.map(a=>'<a class="mx-chip" href="#artist/'+encodeURIComponent(a.name)+'">'+html(a.name)+'</a>'))+group('Альбомы',albums.map(a=>'<a class="mx-chip" href="#album/'+encodeURIComponent(a.id)+'">'+html(a.title)+'</a>'))+group('Мои плейлисты',lists.map(p=>'<a class="mx-chip" href="#library/playlists/'+p.id+'">'+html(p.name)+'</a>'));
}
function searchResults(){`);
s=s.replace("'history','u'].includes(parts[0])", "'history','u','stats','join'].includes(parts[0])");
s=s.replace("if(page==='history')main.innerHTML=historyView();", `if(page==='history')main.innerHTML=historyView();
 if(page==='stats'){main.innerHTML=navHeader('Моя музыка',backLink('#library'),'')+'<div class="stats-view" id="listening-stats"></div>';void mountListeningStats($('#listening-stats'),{account:accountListening,html,user,period:['week','month','year'].includes(parts[1])?parts[1]:'week',rows:ids=>rows(tracksFrom(ids))});}
 if(page==='join'){main.innerHTML=navHeader('Совместный плейлист',backLink('#library'),'')+'<section class="panel"><h1>Музыка вместе</h1><p>После присоединения плейлист появится в твоей коллекции.</p><button class="btn primary" type="button" data-join-playlist>Присоединиться</button><p role="status"></p></section>';const b=$('[data-join-playlist]');b.onclick=async()=>{b.disabled=true;try{if(!user){sessionStorage.setItem('sway.after-login',location.hash);location.href='/auth/yandex';return;}if(!/^[a-f0-9]{64}$/.test(parts[1]||''))throw new Error();const r=await api('/api/playlist-invites/'+parts[1],'POST');await playlists.load();location.hash='#library/playlists/'+r.id;}catch{main.querySelector('[role=status]').textContent='Приглашение истекло или недоступно.';b.disabled=false;}};}`);
s=s.replace('sync();updateTime();syncOfflineUI();','sync();updateTime();syncOfflineUI();renderResume();');
s=s.replace("link('#settings/shortcuts','Горячие клавиши')+", "link('#stats/week','Моя музыка','Итоги, любимые исполнители и открытия')+\n link('#settings/shortcuts','Горячие клавиши')+");
s=s.replace("/^#u\\/[a-z0-9_]{3,24}$/.test(route)","/^(?:#u\\/[a-z0-9_]{3,24}|#join\\/[a-f0-9]{64})$/.test(route)");
s=s.replace("queueOwner=user?.id||'guest';await playlists.load();await restoreQueue();queueLikedCache();render();", "queueOwner=user?.id||'guest';await restoreQueue();render();void playlists.load().then(()=>{if(page==='library')render();});void accountListening.load();queueLikedCache();");
s=s.replace("function updateTime(){", "function updateTime(){\n accountListening.tick(current?.id||'',audio.currentTime,!audio.paused&&!audio.seeking);");
const start=s.indexOf("  const [response,measured,chartData,albRes,artRes]=await Promise.all([fetch('/catalog.json')"),end=s.indexOf('  return tracks;',start);
if(start<0||end<0)throw new Error('catalog anchor');
s=s.slice(0,start)+`  let measured={};
  const accept=(list,complete)=>{
   tracks=tagCatalog(list,measured);if(!Array.isArray(savedRemote))savedRemote=[];
   const retained=savedRemote.map(t=>restoreCommonsTrack(t,canPlay)).filter(Boolean);map=new Map([...savedItems(),...retained,...tracks].map(t=>[t.id,t]));indexAlbums();indexArtists();refreshSuggestions();
   if(complete){void playlists.load().then(()=>{if(['library','stats'].includes(page))render();});void restoreQueue();queueLikedCache();}
  };
  const result=await loadCatalog((list,complete)=>{accept(list,complete);if(!['search','settings','profile','u','join'].includes(page)&&!dialog.open&&!sheet.open)render();else if(page==='search')searchResults();});accept(result.items,false);
  const metadata=async(path,fallback)=>fetch(path,{signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():fallback).catch(()=>fallback);
  void Promise.all([metadata('/track-moods.json',{}),metadata('/chart.json',[]),metadata('/albums.json',[]),metadata('/artists.json',[])]).then(([m,chart,albums,artists])=>{measured=m||{};if(Array.isArray(albums))albumsData=albums;if(Array.isArray(artists))artistsData=artists;if(Array.isArray(chart)&&chart.length){rankedChart=chart;chartTime=Date.now();}accept(tracks,false);if(page==='discover')render();});
`+s.slice(end);
fs.writeFileSync('public/app.js',s);
let index=fs.readFileSync('public/index.html','utf8');index=index.replace('</head>','<link rel="stylesheet" href="/next-stage.css">\n</head>');fs.writeFileSync('public/index.html',index);
