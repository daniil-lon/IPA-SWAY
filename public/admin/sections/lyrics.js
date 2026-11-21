import { api, esc, fmtNum, relTime, confirmDialog, toast, errorToast, debounce, num } from '../core.js';

export const title = 'Тексты и караоке';
export const crumb = 'Sway Music · Контент';

const TIME_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

function parseLrc(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const content = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    let found = false;
    for (const match of raw.matchAll(TIME_TAG)) {
      found = true;
      lines.push({ at: Number(match[1]) * 60 + Number(match[2]), text: content });
    }
    if (!found && content) lines.push({ at: null, text: content });
  }
  return lines.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

function toLrc(lines) {
  return lines.filter(line => line.at !== null).map(line => {
    const minutes = String(Math.floor(line.at / 60)).padStart(2, '0');
    const seconds = (line.at % 60).toFixed(2).padStart(5, '0');
    return '[' + minutes + ':' + seconds + ']' + line.text;
  }).join('\n');
}

const timeLabel = seconds => {
  const value = Math.max(0, Number(seconds) || 0);
  return Math.floor(value / 60) + ':' + (value % 60).toFixed(2).padStart(5, '0');
};

export async function render(root) {
  const state = {
    q: '',
    filter: 'all',
    offset: 0,
    limit: 40,
    total: 0,
    items: [],
    session: null,
    audio: null
  };

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Тексты и караоке</h2>
        <p>Поиск по 4 000+ текстов, синхронизация по аудио, импорт и экспорт LRC, очередь треков без текста.</p>
      </div>
      <div class="spacer"></div>
      <button class="btn" type="button" data-refresh>Обновить</button>
    </div>

    <div class="stat-grid" data-coverage>
      ${Array.from({ length: 4 }).map(() => '<div class="stat-card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:40%;height:24px;margin-top:10px"></div></div>').join('')}
    </div>

    <div class="split" style="grid-template-columns:minmax(0,0.95fr) minmax(0,1.55fr);align-items:start">
      <div class="card">
        <div class="card-title"><span>Библиотека</span><span class="sub" data-list-count></span></div>
        <div class="toolbar">
          <div class="search-field grow"><input class="form-input" type="search" data-q placeholder="Поиск по тексту, названию, артисту, ID…" autocomplete="off"></div>
        </div>
        <div class="toolbar">
          <select class="form-select" data-filter style="max-width:210px">
            <option value="all">Все тексты</option>
            <option value="synced">Синхронизированные</option>
            <option value="unsynced">Без таймингов</option>
            <option value="none">Треки без текста</option>
          </select>
        </div>
        <div class="item-list" data-list><div class="skeleton" style="height:80px"></div></div>
        <div class="pager">
          <div class="pager-info" data-pager-info></div>
          <div class="pager-btns">
            <button class="btn sm" type="button" data-prev>←</button>
            <button class="btn sm" type="button" data-next>→</button>
          </div>
        </div>
      </div>

      <div class="card" data-editor>
        <div class="empty" style="padding:54px 20px">
          <strong>Выберите трек</strong>
          <span>Слева можно найти текст по строкам или открыть трек без текста.<br>В редакторе доступна разметка по аудио и импорт LRC.</span>
        </div>
      </div>
    </div>`;

  const coverageBox = root.querySelector('[data-coverage]');
  const listBox = root.querySelector('[data-list]');
  const pagerInfo = root.querySelector('[data-pager-info]');
  const editorBox = root.querySelector('[data-editor]');

  /* ---------- Coverage ---------- */
  async function loadCoverage() {
    try {
      const data = await api('/api/admin/lyrics/coverage');
      const pct = data.total ? Math.round((data.synced / data.total) * 100) : 0;
      coverageBox.innerHTML = `
        <div class="stat-card accent"><div class="stat-label">Всего текстов</div><div class="stat-val">${fmtNum(data.total)}</div><div class="stat-sub">в базе D1</div></div>
        <div class="stat-card good"><div class="stat-label">Синхронизировано</div><div class="stat-val">${fmtNum(data.synced)}</div><div class="stat-sub">${pct}% от всех</div></div>
        <div class="stat-card warn"><div class="stat-label">Без таймингов</div><div class="stat-val">${fmtNum(data.unsynced)}</div><div class="stat-sub">можно разметить по аудио</div></div>
        <div class="stat-card"><div class="stat-label">Треки без текста</div><div class="stat-val">${fmtNum(data.withoutLyrics)}</div><div class="stat-sub">из ${fmtNum(data.catalog)} в каталоге</div></div>`;
      return data;
    } catch (error) {
      coverageBox.innerHTML = '<div class="empty">Статистика текстов недоступна.</div>';
      return null;
    }
  }

  /* ---------- Library list ---------- */
  async function loadList() {
    listBox.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    const params = new URLSearchParams({ offset: state.offset, limit: state.limit, filter: state.filter });
    if (state.q) params.set('q', state.q);

    try {
      let items = [];
      if (state.filter === 'none') {
        const data = await api('/api/admin/catalog/list?flag=nolyrics&offset=' + state.offset + '&limit=' + state.limit + (state.q ? '&q=' + encodeURIComponent(state.q) : ''));
        state.total = num(data.total);
        items = (data.items || []).map(item => ({
          id: item.id, title: item.title, artist: item.artist, art: item.art,
          synced: false, updated: 0, chars: 0, excerpt: 'Текст ещё не добавлен', missing: true
        }));
      } else if (state.q.length >= 2) {
        const data = await api('/api/admin/lyrics/search?' + params);
        state.total = num(data.total);
        items = data.results || [];
      } else {
        const data = await api('/api/admin/lyrics/list?' + params);
        state.total = num(data.total);
        items = data.items || [];
      }
      state.items = items;
      paintList(items);
    } catch (error) {
      errorToast(error);
      listBox.innerHTML = '<div class="empty">Не удалось загрузить список.</div>';
    }
  }

  function paintList(items) {
    root.querySelector('[data-list-count]').textContent = fmtNum(state.total) + ' шт.';
    const start = state.total ? state.offset + 1 : 0;
    const end = Math.min(state.offset + items.length, state.total);
    pagerInfo.textContent = start + '–' + end + ' из ' + fmtNum(state.total);
    root.querySelector('[data-prev]').disabled = state.offset <= 0;
    root.querySelector('[data-next]').disabled = state.offset + state.limit >= state.total;

    listBox.innerHTML = items.map(item => `
      <button type="button" class="list-item" data-open="${esc(item.id)}" style="text-align:left;cursor:pointer;background:${state.session?.id === item.id ? 'var(--accent-soft)' : ''};border-color:${state.session?.id === item.id ? 'rgba(168,85,247,.45)' : 'var(--border)'}">
        <img class="thumb" src="${esc(item.art || '/art/logo.svg')}" alt="" loading="lazy">
        <div class="item-info">
          <div class="item-title truncate">${esc(item.title || item.id)}</div>
          <div class="item-meta">
            <span class="truncate" style="max-width:190px">${esc(item.artist || '—')}</span>
            ${item.missing ? '<span class="badge red">нет текста</span>' : item.synced ? '<span class="badge green">караоке</span>' : '<span class="badge yellow">без таймингов</span>'}
          </div>
          ${item.excerpt ? `<div class="row-sub truncate" style="max-width:100%;margin-top:3px">${esc(item.excerpt)}</div>` : ''}
        </div>
      </button>`).join('') || '<div class="empty"><strong>Ничего не найдено</strong>Измените запрос или фильтр.</div>';
  }

  const runSearch = debounce(() => { state.offset = 0; loadList(); }, 340);
  root.querySelector('[data-q]').addEventListener('input', event => { state.q = event.target.value.trim(); runSearch(); });
  root.querySelector('[data-filter]').addEventListener('change', event => { state.filter = event.target.value; state.offset = 0; loadList(); });
  root.querySelector('[data-prev]').addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadList(); });
  root.querySelector('[data-next]').addEventListener('click', () => { state.offset += state.limit; loadList(); });
  root.querySelector('[data-refresh]').addEventListener('click', async () => { await Promise.all([loadCoverage(), loadList()]); toast('Данные обновлены'); });

  listBox.addEventListener('click', event => {
    const button = event.target.closest('[data-open]');
    if (button) openTrack(button.dataset.open);
  });

  /* ---------- Editor ---------- */
  async function openTrack(id) {
    editorBox.innerHTML = '<div class="skeleton" style="height:320px"></div>';
    try {
      const [lyricsData, catalogData] = await Promise.allSettled([
        api('/api/admin/lyrics?trackId=' + encodeURIComponent(id)),
        api('/api/admin/catalog/track?id=' + encodeURIComponent(id))
      ]);
      const lyrics = lyricsData.status === 'fulfilled' ? lyricsData.value.lyrics : null;
      const track = catalogData.status === 'fulfilled' ? catalogData.value.track : null;
      const title = track?.title || lyrics?.title || id;
      const artist = track?.artist || lyrics?.artist || '';
      const lrc = lyrics?.lyrics_lrc || '';
      state.session = {
        id, title, artist, audio: track?.audio || '',
        lyrics,
        lrc,
        lines: parseLrc(lrc),
        mode: 'lrc'
      };
      renderEditor();
      paintList(state.items);
    } catch (error) {
      errorToast(error);
      editorBox.innerHTML = '<div class="empty">Не удалось открыть трек.</div>';
    }
  }

  function editorHeader() {
    const session = state.session;
    return `<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
      <div style="min-width:0;flex:1">
        <div style="font-size:16px;font-weight:750" class="truncate">${esc(session.title)}</div>
        <div class="muted small">${esc(session.artist || '—')} · <span class="mono">${esc(session.id)}</span></div>
        <div class="item-meta" style="margin-top:4px">
          ${session.lyrics ? `<span>${session.lyrics.is_synced ? '<span class="badge green">караоке</span>' : '<span class="badge yellow">без таймингов</span>'}</span><span>обновлён ${esc(relTime(session.lyrics.updated))}</span>` : '<span class="badge red">текста нет</span>'}
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${session.lyrics ? `<a class="btn sm" href="/api/admin/lyrics/export?id=${encodeURIComponent(session.id)}" download>.lrc</a>` : ''}
        <label class="btn sm" style="cursor:pointer">Импорт<input type="file" accept=".lrc,.txt,text/plain" data-import hidden></label>
        ${session.lyrics ? '<button class="btn sm danger" type="button" data-delete>Удалить</button>' : ''}
        <button class="btn sm primary" type="button" data-save>Сохранить</button>
      </div>
    </div>
    ${session.audio ? `<div class="audio-bar"><audio controls preload="metadata" src="${esc(session.audio)}" data-audio></audio><span class="mono dim" data-time>0:00.00</span></div>` : '<div class="empty" style="padding:14px">Аудио для этого трека не найдено — метки можно ввести вручную.</div>'}`;
  }

  function renderEditor() {
    const session = state.session;
    editorBox.innerHTML = `
      ${editorHeader()}
      <div class="tabs" style="margin-top:14px">
        <button class="tab ${session.mode === 'lrc' ? 'active' : ''}" type="button" data-mode="lrc">LRC</button>
        <button class="tab ${session.mode === 'markup' ? 'active' : ''}" type="button" data-mode="markup">Разметка по аудио</button>
      </div>
      <div data-mode-body></div>`;

    const audio = editorBox.querySelector('[data-audio]');
    state.audio = audio;
    if (audio) {
      audio.addEventListener('timeupdate', () => {
        const label = editorBox.querySelector('[data-time]');
        if (label) label.textContent = timeLabel(audio.currentTime);
      });
    }

    editorBox.querySelectorAll('[data-mode]').forEach(button => {
      button.addEventListener('click', () => {
        session.mode = button.dataset.mode;
        if (session.mode === 'markup') {
          const current = editorBox.querySelector('[data-lrc]')?.value;
          if (current !== undefined) session.lrc = current;
          const parsed = parseLrc(session.lrc);
          session.lines = parsed.length ? parsed : session.lrc.split(/\r?\n/).map(text => ({ text: text.trim(), at: null })).filter(line => line.text);
        }
        renderEditor();
      });
    });

    editorBox.querySelector('[data-save]').addEventListener('click', save);
    editorBox.querySelector('[data-delete]')?.addEventListener('click', removeLyrics);
    editorBox.querySelector('[data-import]')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        session.lrc = String(reader.result || '');
        session.lines = parseLrc(session.lrc);
        session.mode = 'lrc';
        renderEditor();
        toast('Файл загружен в редактор');
      };
      reader.readAsText(file, 'utf-8');
    });

    if (session.mode === 'lrc') renderLrcMode();
    else renderMarkupMode();
  }

  function renderLrcMode() {
    const session = state.session;
    const body = editorBox.querySelector('[data-mode-body]');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">LRC с метками <code>[mm:ss.xx]</code></label>
        <textarea class="form-textarea mono" data-lrc placeholder="[00:12.50] Первая строка&#10;[00:16.80] Вторая строка">${esc(session.lrc)}</textarea>
      </div>
      <div class="form-hint" style="margin-top:8px">Клик по строке в предпросмотре перематывает аудио. Без меток текст сохранится как обычный.</div>
      <div class="card-title" style="margin:14px 0 8px"><span>Предпросмотр</span></div>
      <div data-preview style="max-height:300px;overflow:auto"></div>`;

    const textarea = body.querySelector('[data-lrc]');
    const preview = body.querySelector('[data-preview]');

    const updatePreview = () => {
      const lines = parseLrc(textarea.value);
      if (!lines.length) {
        preview.innerHTML = '<div class="empty" style="padding:18px">Добавьте текст или метки времени.</div>';
        return;
      }
      preview.innerHTML = lines.map((line, index) => `
        <div class="dup-row" style="padding:5px 0;${line.at !== null ? 'cursor:pointer' : ''}" data-seek="${line.at ?? ''}">
          <span class="mono dim" style="width:64px;flex:none">${line.at !== null ? esc(timeLabel(line.at)) : '—'}</span>
          <span class="grow" style="font-size:13px">${esc(line.text)}</span>
          <span class="dim small">${index + 1}</span>
        </div>`).join('');
    };
    const debounced = debounce(() => { session.lrc = textarea.value; updatePreview(); }, 220);
    textarea.addEventListener('input', debounced);
    preview.addEventListener('click', event => {
      const row = event.target.closest('[data-seek]');
      if (!row || !state.audio) return;
      const seconds = Number(row.dataset.seek);
      if (!Number.isFinite(seconds)) return;
      state.audio.currentTime = seconds;
      state.audio.play().catch(() => {});
    });
    updatePreview();
  }

  function renderMarkupMode() {
    const session = state.session;
    const body = editorBox.querySelector('[data-mode-body]');
    body.innerHTML = `
      <p class="muted small" style="margin-bottom:10px">Включите аудио, затем нажимайте <b>⏱</b> у строки в момент, когда она начинается. Так собирается караоке.</p>
      <div class="form-actions" style="margin:0 0 10px">
        <button class="btn sm primary" type="button" data-mark>● Метка следующей строке</button>
        <button class="btn sm" type="button" data-reset>Сбросить метки</button>
        <button class="btn sm" type="button" data-generate>Собрать LRC</button>
      </div>
      <div data-lines style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:6px 10px">
        ${session.lines.map((line, index) => `
          <div class="dup-row">
            <button class="btn sm" type="button" data-stamp="${index}" title="Поставить текущее время">⏱</button>
            <span class="mono ${line.at === null ? 'dim' : ''}" style="width:62px;flex:none">${line.at === null ? '—' : esc(timeLabel(line.at))}</span>
            <span class="grow" style="font-size:13px">${esc(line.text)}</span>
            <button class="btn sm ghost" type="button" data-clear="${index}" title="Убрать метку">×</button>
          </div>`).join('') || '<div class="empty" style="padding:18px">Нет строк для разметки. Вернитесь в LRC и вставьте текст.</div>'}
      </div>
      <div class="form-hint" style="margin-top:8px" data-markup-status></div>`;

    const audio = state.audio;
    const markNext = () => {
      if (!audio) return toast('Аудио не найдено — метки можно ввести только в LRC', 'warn');
      const line = session.lines.find(item => item.at === null);
      if (!line) return toast('Все строки уже размечены', 'warn');
      line.at = Number(audio.currentTime.toFixed(2));
      session.lrc = toLrc(session.lines);
      renderMarkupMode();
    };

    body.querySelector('[data-mark]').addEventListener('click', markNext);
    body.querySelector('[data-generate]').addEventListener('click', () => {
      const unmarked = session.lines.filter(line => line.at === null).length;
      if (unmarked) return toast('Осталось строк без меток: ' + unmarked, 'warn');
      session.lrc = toLrc(session.lines);
      session.mode = 'lrc';
      renderEditor();
      toast('LRC собран — проверьте предпросмотр');
    });
    body.querySelector('[data-reset]').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Сбросить метки?', message: 'Все временные метки будут удалены. Текст останется.', confirmLabel: 'Сбросить', danger: true });
      if (!ok) return;
      session.lines = session.lines.map(line => ({ ...line, at: null }));
      session.lrc = session.lines.map(line => line.text).join('\n');
      renderMarkupMode();
    });
    body.querySelector('[data-lines]').addEventListener('click', event => {
      const stamp = event.target.closest('[data-stamp]');
      if (stamp && audio) {
        session.lines[Number(stamp.dataset.stamp)].at = Number(audio.currentTime.toFixed(2));
        session.lrc = toLrc(session.lines);
        renderMarkupMode();
        return;
      }
      const clear = event.target.closest('[data-clear]');
      if (clear) {
        session.lines[Number(clear.dataset.clear)].at = null;
        session.lrc = toLrc(session.lines);
        renderMarkupMode();
      }
    });

    const status = body.querySelector('[data-markup-status]');
    const marked = session.lines.filter(line => line.at !== null).length;
    status.textContent = 'Размечено ' + marked + ' из ' + session.lines.length + ' строк';
  }

  async function save() {
    const session = state.session;
    if (!session) return;
    let lrc = session.lrc;
    if (session.mode === 'markup') {
      const unmarked = session.lines.filter(line => line.at === null).length;
      if (unmarked) return toast('Отметьте все строки или соберите LRC частично', 'warn');
      lrc = toLrc(session.lines);
    } else {
      lrc = editorBox.querySelector('[data-lrc]')?.value ?? session.lrc;
    }
    if (!lrc.trim()) return toast('Введите текст', 'warn');
    const button = editorBox.querySelector('[data-save]');
    button.disabled = true;
    button.textContent = 'Сохраняем…';
    try {
      const result = await api('/api/admin/lyrics', { method: 'POST', body: { track_id: session.id, lyrics_lrc: lrc } });
      session.lrc = lrc;
      toast('Сохранено: ' + result.lines + ' строк, ' + (result.synced ? 'караоке' : 'без таймингов'));
      await Promise.all([loadCoverage(), loadList()]);
      await openTrack(session.id);
    } catch (error) {
      errorToast(error);
      button.disabled = false;
      button.textContent = 'Сохранить';
    }
  }

  async function removeLyrics() {
    const session = state.session;
    if (!session) return;
    const ok = await confirmDialog({
      title: 'Удалить текст?',
      message: 'Текст и тайминги трека будут удалены из базы. Аудио и карточка каталога останутся.',
      confirmLabel: 'Удалить',
      danger: true
    });
    if (!ok) return;
    try {
      await api('/api/admin/lyrics?trackId=' + encodeURIComponent(session.id), { method: 'DELETE' });
      toast('Текст удалён');
      state.session = null;
      editorBox.innerHTML = '<div class="empty" style="padding:54px 20px"><strong>Текст удалён</strong><span>Выберите другой трек слева.</span></div>';
      await Promise.all([loadCoverage(), loadList()]);
    } catch (error) { errorToast(error); }
  }

  await Promise.all([loadCoverage(), loadList()]);
}
