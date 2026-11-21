import { api, esc, fmtNum, fmtDuration, fmtDay, relTime, toast, errorToast, store } from '../core.js';

export const title = 'Обзор';
export const crumb = 'Sway Music';

const ACTION_LABELS = {
  'admin.password': 'Смена пароля',
  'admin.sessions.revoke': 'Отзыв сессии',
  'cache.purge': 'Очистка кэша',
  'flag.set': 'Изменён флаг',
  'promo.save': 'Сохранён промо-баннер',
  'broadcast.save': 'Сохранена рассылка',
  'editorial.save': 'Сохранён плейлист редакции',
  'lyrics.save': 'Сохранён текст',
  'lyrics.import': 'Импортирован текст',
  'catalog.hide': 'Скрытие треков',
  'catalog.unhide': 'Показ треков',
  'catalog.genre': 'Жанр треков',
  'catalog.license': 'Лицензия треков',
  'catalog.language': 'Язык треков',
  'catalog.explicit': 'Пометка explicit',
  'catalog.clean': 'Снятие explicit',
  'catalog.moods': 'Настроение треков',
  'upload.create': 'Загрузка аудио',
  'upload.delete': 'Удаление аудио',
  'user.delete': 'Удаление пользователя',
  'user.logout': 'Сброс сессий пользователя',
  'user.rename': 'Переименование пользователя',
  'user.hide': 'Скрытие профиля',
  'user.show': 'Показ профиля',
  'user.clearLikes': 'Очистка лайков',
  'user.grant': 'Выдана подписка'
};

function barChart(daily, { width = 760, height = 210, color = '#a855f7' } = {}) {
  if (!daily.length) return '<div class="empty"><strong>Нет данных</strong>Слушатели ещё не передали статистику.</div>';
  const values = daily.map(row => Number(row.plays) || 0);
  const max = Math.max(...values, 1);
  const padLeft = 34, padBottom = 24, padTop = 12;
  const innerW = width - padLeft - 8;
  const innerH = height - padBottom - padTop;
  const step = innerW / daily.length;
  const barW = Math.max(3, Math.min(30, step * 0.62));

  const bars = daily.map((row, index) => {
    const value = Number(row.plays) || 0;
    const barH = Math.max(1, (value / max) * innerH);
    const x = padLeft + index * step + (step - barW) / 2;
    const y = padTop + innerH - barH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="url(#gradPlays)">
      <title>${esc(fmtDay(row.day))}: ${fmtNum(value)} прослушиваний · ${fmtNum(row.users)} слушателей</title>
    </rect>`;
  }).join('');

  const grid = [0, 0.5, 1].map(part => {
    const y = padTop + innerH * part;
    return `<line x1="${padLeft}" y1="${y}" x2="${width - 4}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="3 5"/>` +
      `<text x="${padLeft - 7}" y="${y + 4}" text-anchor="end" fill="#6f6880" font-size="9">${fmtNum(Math.round(max * (1 - part)))}</text>`;
  }).join('');

  const labelStep = Math.max(1, Math.ceil(daily.length / 8));
  const labels = daily.map((row, index) => {
    if (index % labelStep && index !== daily.length - 1) return '';
    const x = padLeft + index * step + step / 2;
    return `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="#6f6880" font-size="9">${esc(fmtDay(row.day))}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Прослушивания по дням">
    <defs><linearGradient id="gradPlays" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${color}" stop-opacity="0.35"/>
    </linearGradient></defs>
    ${grid}${bars}${labels}
  </svg>`;
}

function statCard(label, value, sub, tone = '') {
  return `<div class="stat-card ${tone}">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-val">${value}</div>
    ${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}
  </div>`;
}

export async function render(root) {
  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Обзор проекта</h2>
        <p>Живые показатели Sway: каталог, слушатели, тексты и состояние инфраструктуры.</p>
      </div>
      <div class="spacer"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="button" data-refresh>Обновить</button>
        <button class="btn primary" type="button" data-purge>Сбросить кэш</button>
      </div>
    </div>
    <div id="overview-body">
      <div class="stat-grid">
        ${Array.from({ length: 8 }).map(() => '<div class="stat-card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:40%;height:24px;margin-top:10px"></div></div>').join('')}
      </div>
      <div class="card"><div class="skeleton" style="width:100%;height:180px"></div></div>
    </div>`;

  async function load() {
    const body = root.querySelector('#overview-body');
    const [statsResult, analyticsResult, auditResult, systemResult] = await Promise.allSettled([
      api('/api/admin/overview'),
      api('/api/admin/analytics?days=7'),
      api('/api/admin/audit?limit=9'),
      api('/api/admin/system')
    ]);

    if (statsResult.status === 'rejected') {
      errorToast(statsResult.reason);
      body.innerHTML = '<div class="empty"><strong>Не удалось загрузить обзор</strong><span>Проверьте соединение и обновите страницу.</span></div>';
      return;
    }

    const stats = statsResult.value.stats || {};
    const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : { daily: [], topTracks: [] };
    const audit = auditResult.status === 'fulfilled' ? (auditResult.value.items || []) : [];
    const system = systemResult.status === 'fulfilled' ? systemResult.value : null;
    store.overview = stats;
    store.system = system;

    const lyricsPct = stats.lyricsTotal ? Math.round((stats.lyricsSynced / stats.lyricsTotal) * 100) : 0;
    const online = system?.secrets?.CF_API_TOKEN && system?.secrets?.CF_ZONE_ID;

    body.innerHTML = `
      ${system?.flags?.maintenance === '1' ? '<div class="card" style="border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.08)"><b style="color:#fcd34d">⚠ Режим обслуживания включён.</b> <span class="muted">Публичная часть сайта отвечает страницей обслуживания. Отключите флаг <code>maintenance</code> в настройках.</span></div>' : ''}
      <div class="stat-grid">
        ${statCard('Треков в каталоге', fmtNum(stats.totalTracks), fmtNum(stats.staticTracks) + ' базовых + ' + fmtNum(stats.customTracks) + ' загруженных')}
        ${statCard('Слушателей', fmtNum(stats.listeners), '+' + fmtNum(stats.newUsers7) + ' за 7 дней', 'accent')}
        ${statCard('Прослушиваний · 7 дней', fmtNum(stats.listens7), fmtDuration(stats.seconds7) + ' звучания')}
        ${statCard('Активных · 7 дней', fmtNum(stats.activeUsers7), 'уникальных слушателей')}
        ${statCard('Караоке', fmtNum(stats.lyricsSynced), 'из ' + fmtNum(stats.lyricsTotal) + ' текстов · ' + lyricsPct + '%', lyricsPct > 60 ? 'good' : '')}
        ${statCard('Лайков', fmtNum(stats.likes), 'в коллекциях слушателей')}
        ${statCard('Плейлистов', fmtNum(stats.playlists), 'пользовательских подборок')}
        ${statCard('Скрыто из каталога', fmtNum(stats.hiddenTracks), stats.hiddenTracks ? 'проверьте переопределения' : 'всё на месте', stats.hiddenTracks ? 'warn' : '')}
      </div>

      <div class="split">
        <div class="card">
          <div class="card-title">
            <span>Прослушивания за 7 дней</span>
            <span class="sub">${fmtNum(analytics.totals?.plays)} всего · ${fmtNum(analytics.totals?.users)} слушателей</span>
          </div>
          <div class="chart-box">${barChart(analytics.daily || [])}</div>
          <div class="chart-legend"><span><i style="background:#a855f7"></i>прослушивания по дням</span></div>
        </div>

        <div class="card">
          <div class="card-title"><span>Быстрые действия</span></div>
          <div style="display:flex;flex-direction:column;gap:9px">
            <button class="btn" type="button" data-goto="catalog">♪ Каталог: неполные карточки</button>
            <button class="btn" type="button" data-goto="lyrics">✎ Тексты без таймингов</button>
            <button class="btn" type="button" data-goto="content">✦ Промо, рассылки и подборки</button>
            <button class="btn" type="button" data-goto="users">☺ Пользователи и модерация</button>
          </div>
          <hr class="hr">
          <dl class="kv">
            <dt>Cloudflare API</dt><dd>${online ? '<span class="dot on"></span>подключён' : '<span class="dot warn"></span>не настроен (CF_API_TOKEN / CF_ZONE_ID)'}</dd>
            <dt>Telegram-бот</dt><dd>${system?.secrets?.TELEGRAM_BOT_TOKEN ? '<span class="dot on"></span>подключён' : '<span class="dot off"></span>нет токена'}</dd>
            <dt>Загрузки</dt><dd>${system?.flags?.uploads === '1' ? '<span class="dot on"></span>включены' : '<span class="dot off"></span>выключены'}</dd>
            <dt>Поисков · 7 дней</dt><dd>${fmtNum(stats.searches7)}</dd>
            <dt>Сессий</dt><dd>${fmtNum(stats.sessions)}</dd>
          </dl>
        </div>
      </div>

      <div class="split">
        <div class="card">
          <div class="card-title"><span>Топ треков · 7 дней</span><span class="sub">по времени звучания</span></div>
          ${(analytics.topTracks || []).slice(0, 8).map(track => `
            <div class="bar-row">
              <div class="label" title="${esc(track.title)} — ${esc(track.artist)}">${esc(track.title)} <span class="dim">— ${esc(track.artist)}</span></div>
              <div class="bar"><span style="width:${Math.max(2, Math.round((track.seconds / Math.max(1, analytics.topTracks[0]?.seconds || 1)) * 100))}%"></span></div>
              <div class="value">${fmtDuration(track.seconds)}</div>
            </div>`).join('') || '<div class="empty">Пока нет прослушиваний.</div>'}
        </div>

        <div class="card">
          <div class="card-title"><span>Последние действия</span><span class="sub">журнал аудита</span></div>
          <div class="item-list">
            ${audit.length ? audit.map(row => `
              <div class="list-item" style="padding:9px 11px">
                <div class="item-info">
                  <div class="item-title" style="font-size:12.5px">${esc(ACTION_LABELS[row.action] || row.action)}</div>
                  <div class="item-meta"><span>${esc(row.target || '—')}</span></div>
                </div>
                <span class="dim small nowrap">${esc(relTime(row.at))}</span>
              </div>`).join('') : '<div class="empty" style="padding:22px">Событий пока нет.</div>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span>Состояние проекта</span></div>
        <div class="mini-grid">
          <div><div class="stat-label">Промо-баннеры</div><div class="stat-line"><span class="big">${fmtNum(stats.promoActive)}</span><span class="of">активных</span></div></div>
          <div><div class="stat-label">Рассылки</div><div class="stat-line"><span class="big">${fmtNum(stats.broadcastsCount)}</span><span class="of">в истории</span></div></div>
          <div><div class="stat-label">Система</div><div class="stat-line"><span class="big" style="font-size:14px">${esc(system?.env?.PUBLIC_ORIGIN || location.origin)}</span></div></div>
          <div><div class="stat-label">Таблиц D1</div><div class="stat-line"><span class="big">${fmtNum(system?.tables?.length || 0)}</span><span class="of">схема</span></div></div>
        </div>
      </div>`;

    body.querySelectorAll('[data-goto]').forEach(button => {
      button.addEventListener('click', () => { window.location.hash = button.dataset.goto; });
    });
  }

  root.querySelector('[data-refresh]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Обновляем…';
    await load();
    button.disabled = false;
    button.textContent = 'Обновить';
    toast('Показатели обновлены');
  });

  root.querySelector('[data-purge]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Сбрасываем…';
    try {
      const result = await api('/api/admin/purge-cache', { method: 'POST' });
      toast(result.message || 'Кэш сброшен', result.success ? 'ok' : 'warn', 5000);
    } catch (error) {
      errorToast(error);
    } finally {
      button.disabled = false;
      button.textContent = 'Сбросить кэш';
    }
  });

  await load();
}
