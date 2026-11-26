import { api, esc, fmtNum, fmtDuration, fmtDay, fmtDateTime, relTime, toast, errorToast, num } from '../core.js';

export const title = 'Слушатели';
export const crumb = 'Sway Music · Люди';

const who = row => row.registered
  ? `<strong>${esc(row.name || 'Аккаунт')}</strong> <span class="badge purple">аккаунт</span>`
  : `<strong>Гость #${esc(row.id)}</strong>`;

const trackCell = track => track
  ? `<div class="cell-main"><img class="thumb" src="${esc(track.art || '/art/logo.svg')}" alt="" loading="lazy"><div class="text"><div class="row-title truncate">${esc(track.title)}</div><div class="row-sub truncate">${esc(track.artist)}</div></div></div>`
  : '<span class="dim">—</span>';

function chart(daily) {
  if (!daily.length) return '<div class="empty"><strong>Пока пусто</strong>Данные появятся, когда кто-нибудь послушает музыку после обновления сайта.</div>';
  const width = 820, height = 220, padLeft = 36, padBottom = 26, padTop = 12;
  const max = Math.max(...daily.map(row => num(row.people)), 1);
  const innerW = width - padLeft - 10, innerH = height - padBottom - padTop;
  const step = innerW / daily.length, barW = Math.max(3, Math.min(26, step * 0.62));
  const bars = daily.map((row, index) => {
    const x = padLeft + index * step + (step - barW) / 2;
    const total = (num(row.people) / max) * innerH, fresh = (num(row.fresh) / max) * innerH;
    const tip = `<title>${esc(fmtDay(row.day))}: ${fmtNum(row.people)} слушателей, из них новых ${fmtNum(row.fresh)} · ${esc(fmtDuration(row.seconds))}</title>`;
    return `<g>${tip}<rect x="${x.toFixed(1)}" y="${(padTop + innerH - total).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, total).toFixed(1)}" rx="3" fill="#a855f7" opacity=".45"/>` +
      `<rect x="${x.toFixed(1)}" y="${(padTop + innerH - fresh).toFixed(1)}" width="${barW.toFixed(1)}" height="${fresh.toFixed(1)}" rx="3" fill="#22c55e"/></g>`;
  }).join('');
  const grid = [0, 0.5, 1].map(part => {
    const y = padTop + innerH * part;
    return `<line x1="${padLeft}" y1="${y}" x2="${width - 4}" y2="${y}" stroke="rgba(255,255,255,.07)" stroke-dasharray="3 5"/>` +
      `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" fill="#6f6880" font-size="9">${fmtNum(Math.round(max * (1 - part)))}</text>`;
  }).join('');
  const labelStep = Math.max(1, Math.ceil(daily.length / 9));
  const labels = daily.map((row, index) => index % labelStep && index !== daily.length - 1 ? '' :
    `<text x="${(padLeft + index * step + step / 2).toFixed(1)}" y="${height - 7}" text-anchor="middle" fill="#6f6880" font-size="9">${esc(fmtDay(row.day))}</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Слушатели по дням">${grid}${bars}${labels}</svg>`;
}

function shares(rows) {
  if (!rows.length) return '<div class="empty" style="padding:20px">Нет данных.</div>';
  const max = Math.max(...rows.map(row => num(row.people)), 1);
  return rows.map(row => `
    <div class="bar-row">
      <div class="label" title="${esc(row.name)}">${esc(row.name)}</div>
      <div class="bar"><span style="width:${Math.max(2, Math.round(num(row.people) / max * 100))}%"></span></div>
      <div class="value">${fmtNum(row.people)}</div>
    </div>`).join('');
}

export async function render(root) {
  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Слушатели</h2>
        <p>Все, кто слушает музыку, включая гостей без аккаунта. Гостя узнаём по случайному номеру браузера, без имени и IP.</p>
      </div>
      <div class="spacer"></div>
      <div class="inline-form"><button class="btn" type="button" data-refresh>Обновить</button></div>
    </div>
    <div class="stat-grid" data-stats>${Array.from({ length: 4 }).map(() => '<div class="stat-card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:40%;height:24px;margin-top:10px"></div></div>').join('')}</div>
    <div class="card">
      <div class="card-title"><span>Слушают прямо сейчас</span><span class="sub">за последние 5 минут · обновляется сам</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Кто</th><th>Трек</th><th>Устройство</th><th>Откуда</th><th class="num">Всего</th></tr></thead>
        <tbody data-now><tr><td colspan="5"><div class="skeleton" style="height:60px"></div></td></tr></tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title"><span>Слушатели по дням</span><span class="sub"><span style="color:#22c55e">■</span> новые · <span style="color:#a855f7">■</span> все · 30 дней</span></div>
      <div class="chart-box" data-chart><div class="skeleton" style="height:200px"></div></div>
    </div>
    <div class="card">
      <div class="card-title"><span>Что слушают</span><span class="sub">трек засчитывается после 30 секунд, один раз в день от слушателя · из этого строится «Чарт Sway»</span></div>
      <div class="stat-grid" data-plays-stats></div>
      <div class="split" style="margin-top:12px">
        <div><div class="form-label" style="margin-bottom:8px">Топ треков · 30 дней</div><div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Трек</th><th class="num">Прослуш.</th><th class="num">Людей</th></tr></thead><tbody data-plays-tracks></tbody></table></div></div>
        <div><div class="form-label" style="margin-bottom:8px">Топ артистов · 30 дней</div><div data-plays-artists></div><div class="form-label" style="margin:14px 0 8px">Прослушивания по дням</div><div data-plays-daily></div></div>
      </div>
    </div>
    <div class="split">
      <div class="card"><div class="card-title"><span>Откуда пришли</span><span class="sub">метки ?src= · 30 дней</span></div><div data-sources></div></div>
      <div class="card"><div class="card-title"><span>Устройства</span><span class="sub">30 дней</span></div><div data-devices></div></div>
    </div>
    <div class="card">
      <div class="card-title"><span>Последние слушатели</span><span class="sub">100 человек</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Кто</th><th>Последний трек</th><th>Устройство</th><th>Откуда</th><th class="num">Дней</th><th class="num">Всего</th><th>Впервые</th><th>Был</th></tr></thead>
        <tbody data-recent><tr><td colspan="8"><div class="skeleton" style="height:90px"></div></td></tr></tbody>
      </table></div>
      <p class="form-hint" style="margin-top:10px">Время считается, пока музыка играет и приложение открыто. На заблокированном iPhone учёт может прерываться, поэтому реальное время обычно немного больше.</p>
    </div>`;

  let timer = 0, alive = true;
  async function load(quiet = false) {
    try {
      const data = await api('/api/admin/listeners');
      if (!alive) return;
      const t = data.totals || {};
      root.querySelector('[data-stats]').innerHTML = `
        <div class="stat-card accent"><div class="stat-label">Сейчас слушают</div><div class="stat-val">${fmtNum(t.now)}</div><div class="stat-sub">последние 5 минут</div></div>
        <div class="stat-card"><div class="stat-label">Сегодня</div><div class="stat-val">${fmtNum(t.today)}</div><div class="stat-sub">${esc(fmtDuration(t.todaySeconds))} музыки · новых ${fmtNum(t.newToday)}</div></div>
        <div class="stat-card"><div class="stat-label">За 7 дней</div><div class="stat-val">${fmtNum(t.week)}</div><div class="stat-sub">${esc(fmtDuration(t.weekSeconds))} · новых ${fmtNum(t.newWeek)}</div></div>
        <div class="stat-card ${t.returningWeek ? 'good' : ''}"><div class="stat-label">Возвращаются</div><div class="stat-val">${fmtNum(t.returningWeek)}</div><div class="stat-sub">слушали больше одного дня · за месяц ${fmtNum(t.month)}</div></div>`;
      root.querySelector('[data-now]').innerHTML = (data.now || []).map(row => `
        <tr><td>${who(row)}</td><td>${trackCell(row.track)}</td><td class="dim">${esc(row.device)}</td><td class="dim">${esc(row.source || 'напрямую')}</td><td class="num">${esc(fmtDuration(row.seconds))}</td></tr>`).join('')
        || '<tr><td colspan="5"><div class="empty" style="padding:18px">Сейчас никто не слушает.</div></td></tr>';
      root.querySelector('[data-chart]').innerHTML = chart(data.daily || []);
      root.querySelector('[data-sources]').innerHTML = shares(data.sources || []);
      root.querySelector('[data-devices]').innerHTML = shares(data.devices || []);
      root.querySelector('[data-recent]').innerHTML = (data.recent || []).map(row => `
        <tr><td>${who(row)}</td><td>${trackCell(row.track)}</td><td class="dim">${esc(row.device)}</td><td class="dim">${esc(row.source || 'напрямую')}</td>
        <td class="num">${fmtNum(row.days)}</td><td class="num">${esc(fmtDuration(row.seconds))}</td><td class="dim nowrap">${esc(fmtDateTime(row.firstSeen))}</td><td class="dim nowrap">${esc(relTime(row.lastSeen))}</td></tr>`).join('')
        || '<tr><td colspan="8"><div class="empty" style="padding:18px">Пока никого. Слушатели появятся после обновления сайта.</div></td></tr>';
    } catch (error) {
      if (!quiet) errorToast(error);
    }
  }
  async function loadPlays() {
    try {
      const data = await api('/api/admin/plays');
      if (!alive) return;
      const t = data.totals || {};
      root.querySelector('[data-plays-stats]').innerHTML = `
        <div class="stat-card"><div class="stat-label">Прослушиваний сегодня</div><div class="stat-val">${fmtNum(t.today)}</div></div>
        <div class="stat-card"><div class="stat-label">За 7 дней</div><div class="stat-val">${fmtNum(t.week)}</div></div>
        <div class="stat-card"><div class="stat-label">За 30 дней</div><div class="stat-val">${fmtNum(t.month)}</div></div>`;
      root.querySelector('[data-plays-tracks]').innerHTML = (data.tracks || []).map((row, index) => `
        <tr><td class="dim">${index + 1}</td><td>${trackCell(row)}</td><td class="num">${fmtNum(row.plays)}</td><td class="num">${fmtNum(row.people)}</td></tr>`).join('')
        || '<tr><td colspan="4"><div class="empty" style="padding:18px">Пока нет прослушиваний. Чарт Sway временно собран из редакционного списка.</div></td></tr>';
      root.querySelector('[data-plays-artists]').innerHTML = shares((data.artists || []).map(row => ({ name: row.name, people: row.plays })));
      root.querySelector('[data-plays-daily]').innerHTML = shares((data.daily || []).slice(-14).reverse().map(row => ({ name: fmtDay(row.day), people: row.plays })));
    } catch (error) { /* the listeners report above already surfaces errors */ }
  }
  root.querySelector('[data-refresh]').addEventListener('click', async () => { await Promise.all([load(), loadPlays()]); toast('Обновлено'); });
  await Promise.all([load(), loadPlays()]);
  timer = setInterval(() => { if (!document.hidden) { load(true); loadPlays(); } }, 30000);
  return () => { alive = false; clearInterval(timer); };
}
