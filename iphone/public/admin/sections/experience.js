import {api,esc,errorToast} from '../core.js';
const labels={startup:'Открытие Sway',first_audio:'Первый звук',next_audio:'Переключение трека',rebuffer:'Остановки для загрузки'};
const reasons={audio:'Звук',cover:'Обложка',lyrics:'Текст',other:'Другое'};
export async function mountExperience(root){
 root.innerHTML='<div class="card"><div class="card-title"><span>Скорость и проблемы</span><button class="btn sm" data-experience-refresh>Обновить</button></div><p class="form-hint">Реальные замеры за 30 дней. Без истории песен и внешних трекеров.</p><div data-experience-body>Загружаем…</div></div>';
 async function load(){
  const body=root.querySelector('[data-experience-body]');
  try{
   const {timings,reports}=await api('/api/admin/experience');const groups=new Map();
   for(const row of timings){const key=row.metric+row.platform;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
   const summaries=[...groups.values()].map(rows=>{
    rows.sort((a,b)=>a.bucket-b.bucket);const count=rows.reduce((n,r)=>n+r.samples,0),total=rows.reduce((n,r)=>n+r.total_ms,0);let cumulative=0;
    const p95=rows.find(r=>(cumulative+=r.samples)>=count*.95)?.bucket;
    return `<div class="dup-row"><strong class="grow">${esc(labels[rows[0].metric])} · ${esc(rows[0].platform)}</strong><span>${count} замеров · среднее ${(total/count/1000).toFixed(2)} с · 95% ≤ ${p95/1000} с</span></div>`;
   }).join('');
   body.innerHTML=(summaries||'<p class="dim">Замеров пока нет.</p>')+'<h3>Сообщения о треках</h3>'+reports.map(r=>`<div class="card"><strong>${esc(reasons[r.reason])}</strong> · <a href="/#search/${encodeURIComponent(r.track)}" target="_blank" rel="noopener">${esc(r.track)}</a><p>${esc(r.comment||'Без комментария')}</p><small class="dim">${esc(new Date(r.created*1000).toLocaleString('ru-RU'))}</small><button class="btn sm" data-resolve-report="${esc(r.id)}">Решено</button></div>`).join('')+(reports.length?'':'<p class="dim">Нерешённых сообщений нет.</p>');
   body.querySelectorAll('[data-resolve-report]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('/api/admin/experience/reports/'+button.dataset.resolveReport,{method:'PATCH',body:{}});await load();}catch(error){errorToast(error);button.disabled=false;}});
  }catch(error){body.textContent='Не удалось загрузить замеры и сообщения.';errorToast(error);}
 }
 root.querySelector('[data-experience-refresh]').onclick=load;await load();
}
