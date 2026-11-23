import {createRecapStory} from './recap-card.js';
export async function mountListeningStats(container,{account,html,rows,period='week',user}){
 container.innerHTML='<p class="quiet" role="status">Собираем твою музыку…</p>';
 if(!user){container.innerHTML='<p class="quiet">Войди в аккаунт, чтобы сохранять статистику между устройствами.</p>';return;}
 try{
  const data=await account.stats(period);if(!container.isConnected)return;
  const labels={week:'Неделя',month:'Месяц',year:'Год'},max=Math.max(1,...data.daily.map(d=>d.seconds));
  container.innerHTML=`<div class="stats-period">${Object.entries(labels).map(([key,title])=>`<a class="mx-chip ${key===period?'active':''}" href="#stats/${key}">${title}</a>`).join('')}</div><section class="glass stats-card"><p class="quiet">Твоя музыка · ${labels[period]}</p><h1>${Math.floor(data.seconds/60)} <small>минут</small></h1><div class="stats-numbers"><span><b>${data.plays}</b>прослушиваний</span><span><b>${data.discoveries}</b>новых треков</span></div><div class="stats-days" aria-label="Минуты по дням">${data.daily.map(d=>`<div title="${d.day}: ${Math.round(d.seconds/60)} мин"><i style="--height:${Math.max(3,d.seconds/max*100)}%"></i><small>${d.day.slice(8)}</small></div>`).join('')}</div><button type="button" class="btn primary" data-stats-share>Поделиться карточкой</button></section><p class="quiet">Учитывается время воспроизведения в Sway с этого обновления. Паузы и перемотки не прибавляют минуты.</p><h2>Твои исполнители</h2><div class="stats-artists">${data.artists.map((a,i)=>`<div class="setting-row"><span>${i+1}. ${html(a.name)}</span><small>${Math.floor(a.seconds/60)} мин</small></div>`).join('')||'<p class="quiet">Включи любимую музыку — здесь появятся твои итоги.</p>'}</div><h2>На повторе</h2>${rows(data.tracks.map(r=>r.track))}`;
  container.querySelector('[data-stats-share]').onclick=async()=>{
   const blob=await createRecapStory(data,labels[period]);if(!blob)return;const file=new File([blob],'sway-my-music.png',{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Моя музыка в Sway'});return;}}catch(e){if(e.name==='AbortError')return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
 }catch{container.innerHTML='<p class="quiet" role="status">Статистика пока недоступна. Проверь подключение и открой экран ещё раз.</p>';}
}
