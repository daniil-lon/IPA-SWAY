export function createTrackReporter({api,html,icon,metrics}){
 let layer=null,pending=false,reportId='';
 return function report(track){
  if(!track)return;
  if(!layer){layer=document.createElement('dialog');layer.className='glass playlist-dialog';layer.id='track-report-dialog';document.body.append(layer);}
  reportId=crypto.randomUUID();pending=false;
  layer.innerHTML=`<header><h2>Сообщить о проблеме</h2><button type="button" class="icon" data-report-close aria-label="Закрыть">${icon('close')}</button></header><p class="quiet">${html(track.artist)} · ${html(track.title)}</p><form><label>Что случилось?<select name="reason"><option value="audio">Не играет или прерывается звук</option><option value="cover">Неверная обложка</option><option value="lyrics">Проблема с текстом</option><option value="other">Другая проблема</option></select></label><label>Подробности<textarea name="comment" maxlength="500" rows="3" placeholder="Необязательно"></textarea></label><p class="quiet">К сообщению приложатся замеры задержек этого сеанса, без истории прослушиваний.</p><button type="submit" class="btn primary">Отправить</button></form><p role="status"></p>`;
  layer.querySelector('[data-report-close]').onclick=()=>layer.close();
  layer.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(pending)return;pending=true;const button=event.target.querySelector('[type=submit]'),status=layer.querySelector('[role=status]');button.disabled=true;
   const values=new FormData(event.target);
   try{await api('/api/track-reports','POST',{id:reportId,track:track.id,reason:values.get('reason'),comment:values.get('comment'),samples:metrics.snapshot()});event.target.hidden=true;status.textContent='Спасибо! Сообщение отправлено.';}
   catch{status.textContent='Не удалось отправить. Текст сохранён здесь — попробуй ещё раз при подключении.';}
   finally{pending=false;button.disabled=false;}
  };
  layer.setAttribute('aria-label','Сообщить о проблеме');if(!layer.open)layer.showModal();
 };
}
