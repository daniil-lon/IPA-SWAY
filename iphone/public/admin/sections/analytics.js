import { api, esc, fmtNum, fmtDuration, fmtDay, fmtDateTime, toast, errorToast, num } from '../core.js';
import {mountExperience} from './experience.js';

export const title = 'Аналитика';
export const crumb = 'Sway Music · Контент';

const EXPORTS = [
  ['listening_daily', 'Прослушивания по дням'],
  ['users', 'Пользователи'],
  ['likes', 'Лайки'],
  ['playlists', 'Плейлисты'],
  ['track_lyrics', 'Тексты'],
  ['catalog_overrides', 'Правки каталога'],
  ['search_log', 'Журнал поиска'],
  ['collection_reactions', 'Реакции'],
  ['broadcast_messages', 'Рассылки'],
  ['promo_banners', 'Промо-баннеры'],
  ['editorial_playlists', 'Плейлисты редакции']
];

function chart(daily, metric) {
  if (!daily.length) return '<div class="empty"><strong>Нет данных</strong>Слушатели ещё не передали статистику за этот период.</div>';
  const width = 820, height = 230, padLeft = 44, padBottom = 26, padTop = 12;
  const values = daily.map(row => num(row[metric]));
  const max = Math.max(...values, 1);
  const innerW = width - padLeft - 10, innerH = height - padBottom - padTop;
  const step = innerW / daily.length;
  const barW = Math.max(2, Math.min(30, step * 0.62));

  const bars = daily.map((row, index) => {
    const value = num(row[metric]);
    const barH = Math.max(1, (value / max) * innerH);
    const x = padLeft + index * step + (step - barW) / 2;
    const y = padTop + innerH - barH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="url(#analyticsGrad)">
      <title>${esc(fmtDay(row.day))}: ${metric === 'seconds' ? esc(fmtDuration(value)) : fmtNum(value)} · ${fmtNum(row.users)} слушателей</title>
    </rect>`;
  }).join('');

  const grid = [0, 0.5, 1].map(part => {
    const y = padTop + innerH * part;
    const label = metric === 'seconds' ? fmtDuration(Math.round(max * (1 - part))) : fmtNum(Math.round(max * (1 - part)));
    return `<line x1="${padLeft}" y1="${y}" x2="${width - 4}" y2="${y}" stroke="rgba(255,255,255,.07)" stroke-dasharray="3 5"/>` +
      `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" fill="#6f6880" font-size="9">${esc(label)}</text>`;
  }).join('');

  const labelStep = Math.max(1, Math.ceil(daily.length / 9));
  const labels = daily.map((row, index) => {
    if (index % labelStep && index !== daily.length - 1) return '';
    const x = padLeft + index * step + step / 2;
    return `<text x="${x.toFixed(1)}" y="${height - 7}" text-anchor="middle" fill="#6f6880" font-size="9">${esc(fmtDay(row.day))}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График">
    <defs><linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#a855f7" stop-opacity="0.3"/>
    </linearGradient></defs>
    ${grid}${bars}${labels}
  </svg>`;
}

function barList(rows, { unit = 'seconds' } = {}) {
  if (!rows?.length) return '<div class="empty" style="padding:20px">Нет данных.</div>';
  const max = Math.max(...rows.map(row => num(row.seconds)), 1);
  return rows.map(row => `
    <div class="bar-row">
      <div class="label" title="${esc(row.name)}">${esc(row.name)}</div>
      <div class="bar"><span style="width:${Math.max(2, Math.round((num(row.seconds) / max) * 100))}%"></span></div>
      <div class="value">${unit === 'seconds' ? esc(fmtDuration(row.seconds)) : fmtNum(row.seconds)}</div>
    </div>`).join('');
}

export async function render(root) {
  const state = { days: 7, metric: 'plays', data: null };

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Аналитика</h2>
        <p>Прослушивания, аудитория, топы и поисковые запросы. Данные из D1, без внешних трекеров.</p>
      </div>
      <div class="spacer"></div>
      <div class="inline-form">
        <select class="form-select" data-days style="padding:8px 30px 8px 11px;font-size:12.5px">
          <option value="7">7 дней</option>
          <option value="30">30 дней</option>
          <option value="365">Год</option>
        </select>
        <select class="form-select" data-metric style="padding:8px 30px 8px 11px;font-size:12.5px">
          <option value="plays">Прослушивания</option>
          <option value="seconds">Время</option>
          <option value="users">Слушатели</option>
        </select>
        <button class="btn" type="button" data-refresh>Обновить</button>
      </div>
    </div>

    <div class="stat-grid" data-stats>
      ${Array.from({ length: 4 }).map(() => '<div class="stat-card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:40%;height:24px;margin-top:10px"></div></div>').join('')}
    </div>

    <div class="card">
      <div class="card-title"><span>Динамика</span><span class="sub" data-chart-note></span></div>
      <div class="chart-box" data-chart><div class="skeleton" style="height:210px"></div></div>
    </div>

    <div class="split">
      <div class="card">
        <div class="card-title"><span>Топ треков</span><span class="sub">по времени звучания</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th style="width:30px">#</th><th>Трек</th><th class="num">Просл.</th><th class="num">Время</th></tr></thead>
            <tbody data-top-tracks><tr><td colspan="4"><div class="skeleton" style="height:90px"></div></td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><span>Поисковые запросы</span><span class="sub">7–365 дней</span></div>
        <div data-searches><div class="skeleton" style="height:90px"></div></div>
      </div>
    </div>

    <div class="split">
      <div class="card">
        <div class="card-title"><span>Топ исполнителей</span></div>
        <div data-artists><div class="skeleton" style="height:120px"></div></div>
      </div>
      <div class="card">
        <div class="card-title"><span>Жанры</span></div>
        <div data-genres><div class="skeleton" style="height:120px"></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span>Экспорт CSV</span><span class="sub">скачивается с сервера</span></div>
      <div class="inline-form">
        ${EXPORTS.map(([ table, label ]) => `<a class="btn sm" href="/api/admin/export?table=${encodeURIComponent(table)}">${esc(label)}</a>`).join('')}
      </div>
      <p class="form-hint" style="margin-top:10px">Экспорт содержит ограниченную выборку (до 5 000 строк) и открывается по вашей текущей сессии администратора.</p>
    </div>`;

  async function load() {
    const stats = root.querySelector('[data-stats]');
    const chartBox = root.querySelector('[data-chart]');
    chartBox.innerHTML = '<div class="skeleton" style="height:210px"></div>';
    try {
      const data = await api('/api/admin/analytics?days=' + state.days);
      state.data = data;
      const newUsers = (data.newUsers || []).reduce((sum, row) => sum + num(row.users), 0);
      stats.innerHTML = `
        <div class="stat-card accent"><div class="stat-label">Прослушиваний</div><div class="stat-val">${fmtNum(data.totals?.plays)}</div><div class="stat-sub">за ${state.days} дней</div></div>
        <div class="stat-card"><div class="stat-label">Время звучания</div><div class="stat-val" style="font-size:22px">${esc(fmtDuration(data.totals?.seconds))}</div><div class="stat-sub">суммарно</div></div>
        <div class="stat-card"><div class="stat-label">Уникальных слушателей</div><div class="stat-val">${fmtNum(data.totals?.users)}</div><div class="stat-sub">слушали треки</div></div>
        <div class="stat-card ${newUsers ? 'good' : ''}"><div class="stat-label">Новых аккаунтов</div><div class="stat-val">${fmtNum(newUsers)}</div><div class="stat-sub">регистрации за период</div></div>`;

      const metricLabel = state.metric === 'seconds' ? 'время звучания' : state.metric === 'users' ? 'слушатели' : 'прослушивания';
      root.querySelector('[data-chart-note]').textContent = metricLabel + ' по дням · ' + fmtDay(data.from) + ' — сегодня';
      chartBox.innerHTML = chart(data.daily || [], state.metric);

      const tracks = data.topTracks || [];
      root.querySelector('[data-top-tracks]').innerHTML = tracks.slice(0, 12).map((track, index) => `
        <tr>
          <td class="dim">${index + 1}</td>
          <td><div class="cell-main"><img class="thumb" src="${esc(track.art || '/art/logo.svg')}" alt="" loading="lazy"><div class="text"><div class="row-title truncate">${esc(track.title)}</div><div class="row-sub truncate">${esc(track.artist)}</div></div></div></td>
          <td class="num">${fmtNum(track.plays)}</td>
          <td class="num">${esc(fmtDuration(track.seconds))}</td>
        </tr>`).join('') || '<tr><td colspan="4"><div class="empty">Нет прослушиваний.</div></td></tr>';

      const topSearches = data.topSearches || [];
      const zeroSearches = data.zeroSearches || [];
      const recent = data.recentSearches || [];
      root.querySelector('[data-searches]').innerHTML = `
        <div class="tabs" style="width:100%;margin-bottom:12px">
          <button class="tab active" type="button" data-search-tab="top">Топ</button>
          <button class="tab" type="button" data-search-tab="zero">Без результата</button>
          <button class="tab" type="button" data-search-tab="recent">Последние</button>
        </div>
        <div data-search-body></div>`;

      const searchBody = root.querySelector('[data-search-body]');
      const paint = mode => {
        if (mode === 'zero') {
          searchBody.innerHTML = zeroSearches.map(row => `<div class="dup-row"><span class="grow">${esc(row.query)}</span><span class="badge red">${fmtNum(row.hits)}</span></div>`).join('') || '<div class="empty" style="padding:18px">Все запросы что-то находили.</div>';
        } else if (mode === 'recent') {
          searchBody.innerHTML = recent.map(row => `<div class="dup-row"><span class="grow truncate">${esc(row.query)}</span><span class="dim small">${fmtNum(row.results)} рез.</span><span class="dim small nowrap">${esc(fmtDateTime(row.at))}</span></div>`).join('') || '<div class="empty" style="padding:18px">Журнал пуст.</div>';
        } else {
          searchBody.innerHTML = topSearches.map((row, index) => `<div class="dup-row"><span class="dim" style="width:22px">${index + 1}</span><span class="grow">${esc(row.query)}</span><span class="badge">${fmtNum(row.hits)}</span>${row.misses ? `<span class="badge red">${fmtNum(row.misses)} пусто</span>` : ''}</div>`).join('') || '<div class="empty" style="padding:18px">Поисков пока нет.</div>';
        }
      };
      paint('top');
      root.querySelectorAll('[data-search-tab]').forEach(button => {
        button.addEventListener('click', () => {
          root.querySelectorAll('[data-search-tab]').forEach(item => item.classList.toggle('active', item === button));
          paint(button.dataset.searchTab);
        });
      });

      root.querySelector('[data-artists]').innerHTML = barList(data.topArtists || []);
      root.querySelector('[data-genres]').innerHTML = barList(data.topGenres || []);
    } catch (error) {
      errorToast(error);
      stats.innerHTML = '<div class="empty" style="grid-column:1/-1">Аналитика недоступна.</div>';
      chartBox.innerHTML = '<div class="empty">Не удалось загрузить данные.</div>';
    }
  }

  root.querySelector('[data-days]').addEventListener('change', event => { state.days = Number(event.target.value) || 7; load(); });
  root.querySelector('[data-metric]').addEventListener('change', event => {
    state.metric = event.target.value;
    if (state.data) {
      root.querySelector('[data-chart]').innerHTML = chart(state.data.daily || [], state.metric);
      const metricLabel = state.metric === 'seconds' ? 'время звучания' : state.metric === 'users' ? 'слушатели' : 'прослушивания';
      root.querySelector('[data-chart-note]').textContent = metricLabel + ' по дням';
    }
  });
  root.querySelector('[data-refresh]').addEventListener('click', async () => { await load(); toast('Аналитика обновлена'); });

  await load();
  const experience=document.createElement('section');root.append(experience);await mountExperience(experience);
}
