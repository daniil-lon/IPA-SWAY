import { api, esc, fmtNum, fmtDuration, fmtBytes, fmtDateTime, openModal, confirmDialog, toast, errorToast, debounce, store, num } from '../core.js';

export const title = 'Каталог';
export const crumb = 'Sway Music · Контент';

const LANGUAGES = [
  ['', 'Не указан'],
  ['ru', 'Русский'],
  ['en', 'Английский'],
  ['foreign', 'Другой язык'],
  ['mul', 'Несколько языков'],
  ['zxx', 'Без слов']
];
const LANGUAGE_LABEL = Object.fromEntries(LANGUAGES);

const ERROR_TEXT = {
  unknown_track: 'Трек не найден в каталоге.',
  invalid_language: 'Недопустимый код языка.',
  invalid_release_date: 'Некорректная дата релиза.',
  invalid_metadata: 'Проверьте поля: где-то недопустимое значение.',
  invalid_credits: 'Исполнители должны быть списком непустых имён.',
  invalid_genre: 'Некорректный жанр.',
  invalid_license: 'Некорректная лицензия.',
  invalid_moods: 'Настроения — список коротких слов.',
  invalid_hidden: 'Некорректное значение скрытия.',
  invalid_explicit: 'Некорректное значение explicit.',
  different_recording: 'Нельзя объединить: это другая запись (не совпадают название/исполнители/длительность).',
  ids_required: 'Не выбрано ни одного трека.',
  unknown_tracks: 'Треки не найдены.',
  unknown_action: 'Неизвестное действие.',
  value_required: 'Нужно значение для действия.',
  body_required: 'Пустой запрос.'
};

const errorText = error => ERROR_TEXT[error?.message] || error?.message || 'Не удалось сохранить';

const langLabel = code => LANGUAGE_LABEL[code] || code || '—';

function flagBadges(track) {
  const badges = [];
  if (track.hasLyrics) badges.push('<span class="badge green">текст</span>');
  if (track.hidden) badges.push('<span class="badge red">скрыт</span>');
  if (track.isExplicit) badges.push('<span class="badge yellow">18+</span>');
  if (track.custom) badges.push('<span class="badge blue">загружен</span>');
  if (!track.license) badges.push('<span class="badge gray">без лицензии</span>');
  return badges.join(' ') || '<span class="dim small">—</span>';
}

export async function render(root) {
  const state = {
    tab: 'tracks',
    q: '',
    genre: '',
    year: '',
    license: '',
    flag: '',
    sort: '',
    offset: 0,
    limit: 50,
    total: 0,
    items: [],
    facets: null,
    selected: new Set(),
    uploadStorage: null
  };

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Каталог</h2>
        <p>Поиск, редактирование метаданных, скрытие треков, разбор дублей и загрузка собственного аудио.</p>
      </div>
      <div class="spacer"></div>
      <button class="btn primary" type="button" data-upload-open>Загрузить аудио</button>
    </div>

    <div class="tabs">
      <button class="tab active" type="button" data-tab="tracks">Треки</button>
      <button class="tab" type="button" data-tab="duplicates">Дубли</button>
      <button class="tab" type="button" data-tab="uploads">Загрузки</button>
    </div>

    <section data-panel="tracks">
      <div class="card">
        <div class="toolbar">
          <div class="search-field grow">
            <input class="form-input" type="search" data-q placeholder="Название, исполнитель, альбом или ID…" autocomplete="off">
          </div>
          <select class="form-select" data-genre style="max-width:180px"><option value="">Все жанры</option></select>
          <select class="form-select" data-flag style="max-width:200px">
            <option value="">Все треки</option>
            <option value="missing">Неполные карточки</option>
            <option value="lyrics">С текстом</option>
            <option value="nolyrics">Без текста</option>
            <option value="explicit">Explicit</option>
          </select>
          <select class="form-select" data-license style="max-width:170px">
            <option value="">Лицензия: любая</option>
            <option value="set">Указана</option>
            <option value="none">Не указана</option>
          </select>
          <select class="form-select" data-sort style="max-width:170px">
            <option value="">Без сортировки</option>
            <option value="title">По названию</option>
            <option value="artist">По исполнителю</option>
            <option value="seconds">По длительности</option>
            <option value="year">По году</option>
            <option value="size">По размеру</option>
          </select>
          <select class="form-select" data-limit style="max-width:110px">
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </div>
        <div class="toolbar-note" data-summary style="margin-bottom:10px">Загрузка каталога…</div>

        <div class="selected-bar" data-selected-bar hidden>
          <b data-selected-count>0</b><span>выбрано</span>
          <span class="dim">·</span>
          <button class="btn sm" type="button" data-bulk="hide">Скрыть</button>
          <button class="btn sm" type="button" data-bulk="unhide">Показать</button>
          <select class="form-select" data-bulk-language style="width:auto;padding:6px 26px 6px 9px;font-size:12px">
            <option value="">Язык…</option>
            ${LANGUAGES.map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`).join('')}
          </select>
          <button class="btn sm" type="button" data-bulk="language">Применить язык</button>
          <input class="form-input" data-bulk-genre placeholder="Жанр" style="width:130px;padding:6px 9px;font-size:12px">
          <button class="btn sm" type="button" data-bulk="genre">Жанр</button>
          <input class="form-input" data-bulk-license placeholder="Лицензия" style="width:130px;padding:6px 9px;font-size:12px">
          <button class="btn sm" type="button" data-bulk="license">Лицензия</button>
          <button class="btn sm" type="button" data-bulk="explicit">18+</button>
          <button class="btn sm" type="button" data-bulk="clean">Снять 18+</button>
          <button class="btn sm" type="button" data-clear-selection>Сбросить</button>
        </div>

        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th style="width:34px"><input type="checkbox" data-select-all aria-label="Выбрать все"></th>
                <th>Трек</th>
                <th>Альбом</th>
                <th class="num">Длит.</th>
                <th>Жанр</th>
                <th>Язык</th>
                <th>Метки</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-rows></tbody>
          </table>
        </div>
        <div class="pager">
          <div class="pager-info" data-pager-info></div>
          <div class="pager-btns">
            <button class="btn sm" type="button" data-prev>← Назад</button>
            <button class="btn sm" type="button" data-next>Вперёд →</button>
          </div>
        </div>
      </div>
    </section>

    <section data-panel="duplicates" hidden>
      <div class="card">
        <div class="card-title">
          <span>Похожие записи</span>
          <span class="sub">Одинаковые название и исполнители</span>
          <div class="card-actions">
            <input class="form-input" data-dup-q placeholder="Фильтр по названию…" style="width:220px;padding:7px 10px;font-size:12.5px">
          </div>
        </div>
        <p class="lead" style="margin-bottom:12px">Разные версии (ремикс, live, ремастер) — это нормально. Объединяйте только настоящие дубли: эталон получит ссылку <code>canonicalId</code>, остальные останутся в каталоге как версии.</p>
        <div data-duplicates><div class="skeleton" style="height:80px"></div></div>
        <div class="pager">
          <div class="pager-info" data-dup-info></div>
          <div class="pager-btns">
            <button class="btn sm" type="button" data-dup-prev>← Назад</button>
            <button class="btn sm" type="button" data-dup-next>Вперёд →</button>
          </div>
        </div>
      </div>
    </section>

    <section data-panel="uploads" hidden>
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Загрузка аудио</span><span class="sub" data-upload-storage></span></div>
          <form data-upload-form>
            <div class="form-grid">
              <div class="form-group wide">
                <label class="form-label">Аудиофайл <span class="req">*</span></label>
                <input class="form-input" type="file" accept="audio/*" name="file" data-upload-file required>
                <span class="form-hint" data-upload-limit>MP3, M4A, WAV. Длительность определяется автоматически.</span>
              </div>
              <div class="form-group"><label class="form-label">Название <span class="req">*</span></label><input class="form-input" name="title" required maxlength="150"></div>
              <div class="form-group"><label class="form-label">Исполнитель <span class="req">*</span></label><input class="form-input" name="artist" required maxlength="150"></div>
              <div class="form-group"><label class="form-label">Жанр</label><input class="form-input" name="genre" placeholder="pop" maxlength="80"></div>
              <div class="form-group"><label class="form-label">Длительность, сек</label><input class="form-input" name="seconds" type="number" min="1" max="7200" data-upload-seconds></div>
              <div class="form-group"><label class="form-label">Обложка (URL или путь)</label><input class="form-input" name="art" placeholder="/art/logo.svg"></div>
              <div class="form-group"><label class="form-label">Настроения через запятую</label><input class="form-input" name="moods" placeholder="bright, night"></div>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">Загрузить в каталог</button>
              <span class="form-hint" data-upload-status></span>
            </div>
          </form>
        </div>
        <div class="card">
          <div class="card-title"><span>Загруженные треки</span><span class="sub" data-upload-count></span></div>
          <div class="item-list" data-uploads><div class="skeleton" style="height:60px"></div></div>
        </div>
      </div>
    </section>`;

  const rowsBody = root.querySelector('[data-rows]');
  const summary = root.querySelector('[data-summary]');
  const pagerInfo = root.querySelector('[data-pager-info]');
  const prevButton = root.querySelector('[data-prev]');
  const nextButton = root.querySelector('[data-next]');
  const selectedBar = root.querySelector('[data-selected-bar]');
  const selectedCount = root.querySelector('[data-selected-count]');
  const selectAll = root.querySelector('[data-select-all]');

  /* ---------- Tabs ---------- */
  root.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== state.tab; });
      if (state.tab === 'duplicates' && !state.duplicatesLoaded) loadDuplicates(0);
      if (state.tab === 'uploads') loadUploads();
    });
  });

  /* ---------- Facets ---------- */
  async function loadFacets() {
    try {
      const facets = state.facets || await api('/api/admin/catalog/facets');
      state.facets = facets;
      const genreSelect = root.querySelector('[data-genre]');
      genreSelect.innerHTML = '<option value="">Все жанры</option>' +
        (facets.genres || []).map(row => `<option value="${esc(row.name)}">${esc(row.name)} · ${fmtNum(row.count)}</option>`).join('');
      const badge = document.getElementById('badge-catalog');
      if (badge && facets.missing) badge.textContent = String(facets.missing);
      store.facets = facets;
    } catch (error) {
      // Facets are a convenience; the list still works without them.
    }
  }

  /* ---------- Track list ---------- */
  async function loadTracks() {
    summary.textContent = 'Загрузка каталога…';
    rowsBody.innerHTML = '<tr><td colspan="8"><div class="skeleton" style="height:160px"></div></td></tr>';
    const params = new URLSearchParams({ offset: state.offset, limit: state.limit });
    for (const key of ['q', 'genre', 'flag', 'license', 'sort']) if (state[key]) params.set(key, state[key]);
    if (state.year) params.set('year', state.year);

    try {
      const data = await api('/api/admin/catalog/list?' + params);
      state.items = data.items || [];
      state.total = num(data.total);
      paintTracks(data);
    } catch (error) {
      errorToast(error);
      rowsBody.innerHTML = '<tr><td colspan="8"><div class="empty">Каталог не загрузился. Обновите страницу.</div></td></tr>';
      summary.textContent = '';
    }
  }

  function paintTracks(data) {
    summary.innerHTML = `<b>${fmtNum(data.total)}</b> треков по фильтру · ${fmtNum(data.missingCount)} с неполными данными · показаны ${fmtNum(state.items.length)}`;
    rowsBody.innerHTML = state.items.map(track => `
      <tr data-id="${esc(track.id)}" class="${state.selected.has(track.id) ? 'selected' : ''}">
        <td><input type="checkbox" data-check value="${esc(track.id)}" ${state.selected.has(track.id) ? 'checked' : ''} aria-label="Выбрать ${esc(track.title)}"></td>
        <td>
          <div class="cell-main">
            <img class="thumb" src="${esc(track.art || '/art/logo.svg')}" alt="" loading="lazy">
            <div class="text">
              <div class="row-title truncate" title="${esc(track.title)}">${esc(track.title || track.id)}</div>
              <div class="row-sub truncate">${esc(track.artist || '—')}${track.albumYear ? ' · ' + esc(track.albumYear) : ''}</div>
            </div>
          </div>
        </td>
        <td class="truncate" style="max-width:190px">${esc(track.albumTitle || '—')}</td>
        <td class="num">${track.seconds ? esc(fmtDuration(track.seconds)) : '<span class="badge red">нет</span>'}</td>
        <td>${esc(track.genre || '—')}</td>
        <td>${esc(langLabel(track.language))}</td>
        <td>${flagBadges(track)}</td>
        <td>
          <div class="cell-actions">
            <button class="btn sm" type="button" data-edit="${esc(track.id)}">Изменить</button>
            <button class="btn sm ${track.hidden ? 'success' : ''}" type="button" data-toggle="${esc(track.id)}">${track.hidden ? 'Показать' : 'Скрыть'}</button>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="8"><div class="empty"><strong>Ничего не найдено</strong>Попробуйте изменить фильтры.</div></td></tr>';

    const start = state.total ? state.offset + 1 : 0;
    const end = Math.min(state.offset + state.items.length, state.total);
    pagerInfo.textContent = start + '–' + end + ' из ' + fmtNum(state.total);
    prevButton.disabled = state.offset <= 0;
    nextButton.disabled = state.offset + state.limit >= state.total;

    const allSelected = state.items.length > 0 && state.items.every(track => state.selected.has(track.id));
    selectAll.checked = allSelected;
    selectAll.indeterminate = !allSelected && state.items.some(track => state.selected.has(track.id));
    syncSelection();
  }

  function syncSelection() {
    selectedBar.hidden = state.selected.size === 0;
    selectedCount.textContent = String(state.selected.size);
    root.querySelectorAll('[data-check]').forEach(box => {
      const row = box.closest('tr');
      const id = box.value;
      box.checked = state.selected.has(id);
      row?.classList.toggle('selected', box.checked);
    });
  }

  rowsBody.addEventListener('change', event => {
    const box = event.target.closest('[data-check]');
    if (!box) return;
    if (box.checked) state.selected.add(box.value);
    else state.selected.delete(box.value);
    syncSelection();
  });

  selectAll.addEventListener('change', () => {
    for (const track of state.items) {
      if (selectAll.checked) state.selected.add(track.id);
      else state.selected.delete(track.id);
    }
    syncSelection();
  });

  root.querySelector('[data-clear-selection]').addEventListener('click', () => {
    state.selected.clear();
    selectAll.checked = false;
    selectAll.indeterminate = false;
    syncSelection();
  });

  rowsBody.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) { openEditor(edit.dataset.edit); return; }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      const track = state.items.find(item => item.id === id);
      try {
        await patchTrack(id, { hidden: !track?.hidden });
        toast(track?.hidden ? 'Трек показан' : 'Трек скрыт');
        await loadTracks();
      } catch (error) { errorToast(error); }
    }
  });

  const runSearch = debounce(() => { state.offset = 0; loadTracks(); }, 320);
  root.querySelector('[data-q]').addEventListener('input', event => { state.q = event.target.value.trim(); runSearch(); });
  root.querySelector('[data-genre]').addEventListener('change', event => { state.genre = event.target.value; state.offset = 0; loadTracks(); });
  root.querySelector('[data-flag]').addEventListener('change', event => { state.flag = event.target.value; state.offset = 0; loadTracks(); });
  root.querySelector('[data-license]').addEventListener('change', event => { state.license = event.target.value; state.offset = 0; loadTracks(); });
  root.querySelector('[data-sort]').addEventListener('change', event => { state.sort = event.target.value; state.offset = 0; loadTracks(); });
  root.querySelector('[data-limit]').addEventListener('change', event => { state.limit = Number(event.target.value) || 50; state.offset = 0; loadTracks(); });
  prevButton.addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadTracks(); });
  nextButton.addEventListener('click', () => { state.offset += state.limit; loadTracks(); });

  /* ---------- Bulk ---------- */
  root.querySelectorAll('[data-bulk]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.dataset.bulk;
      const ids = [...state.selected];
      if (!ids.length) return;
      const payload = { ids, action };
      if (action === 'language') {
        payload.value = root.querySelector('[data-bulk-language]').value;
        if (!payload.value) return toast('Выберите язык', 'warn');
      }
      if (action === 'genre') {
        payload.value = root.querySelector('[data-bulk-genre]').value.trim();
        if (!payload.value) return toast('Введите жанр', 'warn');
      }
      if (action === 'license') {
        payload.value = root.querySelector('[data-bulk-license]').value.trim();
        if (!payload.value) return toast('Введите лицензию', 'warn');
      }
      const ok = await confirmDialog({
        title: 'Применить к ' + ids.length + ' трекам?',
        message: 'Действие «' + button.textContent.trim() + '» изменит выбранные записи каталога. Его можно отменить вручную.',
        confirmLabel: 'Применить'
      });
      if (!ok) return;
      button.disabled = true;
      try {
        const result = await api('/api/admin/catalog/bulk', { method: 'POST', body: payload });
        toast('Обновлено: ' + fmtNum(result.updated) + (result.skipped ? ', пропущено: ' + result.skipped : ''), 'ok');
        state.selected.clear();
        await loadTracks();
        await loadFacets();
      } catch (error) {
        errorToast(error);
      } finally {
        button.disabled = false;
      }
    });
  });

  async function patchTrack(id, patch) {
    return api('/api/admin/catalog', { method: 'PATCH', body: { id, ...patch } });
  }

  /* ---------- Editor ---------- */
  async function openEditor(id) {
    let data;
    try {
      data = await api('/api/admin/catalog/track?id=' + encodeURIComponent(id));
    } catch (error) { errorToast(error); return; }

    const track = data.track || {};
    const override = data.override || {};
    const lyrics = data.lyrics;
    const modal = openModal({
      title: 'Трек: ' + (track.title || id),
      wide: true,
      body: `
        <div class="cell-main" style="margin-bottom:16px">
          <img class="thumb" src="${esc(track.art || '/art/logo.svg')}" alt="" style="width:56px;height:56px">
          <div class="text">
            <div class="row-title">${esc(track.title || id)}</div>
            <div class="row-sub mono">${esc(id)}</div>
            <div class="item-meta">
              ${lyrics ? `<span>Текст: <b>${lyrics.synced ? 'синхронизирован' : 'без таймингов'}</b> · ${fmtNum(lyrics.chars)} симв.</span>` : '<span>Текста нет</span>'}
              <span>${esc(fmtDuration(track.seconds))}</span>
              <span>${esc(fmtBytes(track.bytes))}</span>
            </div>
          </div>
        </div>
        ${track.audio ? `<div class="audio-bar" style="margin-bottom:16px"><audio controls preload="none" src="${esc(track.audio)}"></audio></div>` : ''}
        <form data-editor-form>
          <div class="form-grid">
            <div class="form-group"><label class="form-label">Название</label><input class="form-input" name="title" value="${esc(track.title || '')}" maxlength="180"></div>
            <div class="form-group"><label class="form-label">Исполнители через запятую</label><input class="form-input" name="artists" value="${esc((track.artists?.length ? track.artists : String(track.artist || '').split(/\s*[,;]\s*/).filter(Boolean)).join(', '))}" maxlength="400"></div>
            <div class="form-group"><label class="form-label">Альбом</label><input class="form-input" name="albumTitle" value="${esc(track.albumTitle || '')}" maxlength="180"></div>
            <div class="form-group"><label class="form-label">Год альбома</label><input class="form-input" name="albumYear" type="number" min="0" max="2100" value="${esc(track.albumYear || track.year || '')}"></div>
            <div class="form-group"><label class="form-label">Жанр</label><input class="form-input" name="genre" list="genre-list" value="${esc(track.genre || '')}" maxlength="80"><datalist id="genre-list">${(state.facets?.genres || []).slice(0, 40).map(row => `<option value="${esc(row.name)}"></option>`).join('')}</datalist></div>
            <div class="form-group"><label class="form-label">Язык</label><select class="form-select" name="language">${LANGUAGES.map(([code, label]) => `<option value="${esc(code)}" ${(track.language || '') === code ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Лицензия</label><input class="form-input" name="license" value="${esc(track.license || '')}" maxlength="80"></div>
            <div class="form-group"><label class="form-label">Настроения через запятую</label><input class="form-input" name="moods" value="${esc((override.moods || track.moods || []).join(', '))}" maxlength="300"></div>
            <div class="form-group"><label class="form-label">Дата релиза</label><input class="form-input" name="albumReleaseDate" type="date" value="${esc((override.albumReleaseDate || '').slice(0, 10))}"></div>
            <div class="form-group"><label class="form-label">Номер диска</label><input class="form-input" name="discNumber" type="number" min="1" max="1000" value="${esc(override.discNumber || '')}"></div>
            <div class="form-group"><label class="form-label">Номер трека</label><input class="form-input" name="trackNumber" type="number" min="1" max="1000" value="${esc(override.trackNumber || '')}"></div>
            <div class="form-group"><label class="form-label">Эталон для дубля (ID)</label><input class="form-input" name="canonicalId" value="${esc(override.canonicalId || '')}" placeholder="оставьте пустым"></div>
          </div>
          <div class="form-row" style="margin-top:14px">
            <label class="switch"><input type="checkbox" name="hidden" ${track.hidden ? 'checked' : ''}><span class="track"></span><span>Скрыт из публичного каталога</span></label>
            <label class="switch"><input type="checkbox" name="explicit" ${track.isExplicit ? 'checked' : ''}><span class="track"></span><span>Explicit (18+)</span></label>
          </div>
        </form>`,
      footer: '<button type="button" class="btn" data-cancel>Отмена</button><button type="button" class="btn primary" data-save>Сохранить</button>'
    });

    modal.foot.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.foot.querySelector('[data-save]').addEventListener('click', async () => {
      const form = modal.body.querySelector('[data-editor-form]');
      const values = new FormData(form);
      const patch = { id };
      const title = String(values.get('title') || '').trim();
      if (title) patch.title = title;
      const artists = String(values.get('artists') || '').split(',').map(item => item.trim()).filter(Boolean);
      if (artists.length) patch.artists = artists;
      const albumTitle = String(values.get('albumTitle') || '').trim();
      if (albumTitle || track.albumTitle) patch.albumTitle = albumTitle;
      const genre = String(values.get('genre') || '').trim();
      if (genre || track.genre) patch.genre = genre;
      patch.language = String(values.get('language') ?? '');
      const license = String(values.get('license') || '').trim();
      if (license || track.license) patch.license = license;
      const moods = String(values.get('moods') || '').split(',').map(item => item.trim()).filter(Boolean);
      patch.moods = moods;
      const albumYear = Number(values.get('albumYear'));
      if (Number.isInteger(albumYear) && albumYear > 0) patch.albumYear = albumYear;
      const discNumber = Number(values.get('discNumber'));
      if (Number.isInteger(discNumber) && discNumber > 0) patch.discNumber = discNumber;
      const trackNumber = Number(values.get('trackNumber'));
      if (Number.isInteger(trackNumber) && trackNumber > 0) patch.trackNumber = trackNumber;
      const releaseDate = String(values.get('albumReleaseDate') || '').trim();
      if (releaseDate) patch.albumReleaseDate = releaseDate;
      const canonicalId = String(values.get('canonicalId') || '').trim();
      if (canonicalId) patch.canonicalId = canonicalId;
      patch.hidden = values.get('hidden') === 'on';
      patch.explicit = values.get('explicit') === 'on';

      const saveButton = modal.foot.querySelector('[data-save]');
      saveButton.disabled = true;
      saveButton.textContent = 'Сохраняем…';
      try {
        await patchTrack(id, patch);
        toast('Карточка сохранена');
        modal.close();
        await loadTracks();
      } catch (error) {
        errorToast(new Error(errorText(error)));
        saveButton.disabled = false;
        saveButton.textContent = 'Сохранить';
      }
    });
  }

  /* ---------- Duplicates ---------- */
  let dupOffset = 0;
  let dupQuery = '';

  async function loadDuplicates(offset = 0) {
    state.duplicatesLoaded = true;
    dupOffset = offset;
    const target = root.querySelector('[data-duplicates]');
    target.innerHTML = '<div class="skeleton" style="height:80px"></div>';
    const params = new URLSearchParams({ offset: dupOffset });
    if (dupQuery) params.set('q', dupQuery);
    try {
      const data = await api('/api/admin/catalog/duplicates?' + params);
      root.querySelector('[data-dup-info]').textContent = 'Найдено групп: ' + fmtNum(data.total);
      root.querySelector('[data-dup-prev]').disabled = dupOffset <= 0;
      root.querySelector('[data-dup-next]').disabled = data.next === null;
      target.innerHTML = (data.items || []).map(group => `
        <div class="dup-group">
          <div class="dup-head">
            <b>${fmtNum(group.tracks.length)} версии</b>
            <span class="dim mono">${esc(group.key)}</span>
          </div>
          ${group.tracks.map((track, index) => `
            <div class="dup-row">
              <div class="grow">
                <div class="row-title" style="font-size:12.5px">${esc(track.title)}</div>
                <div class="row-sub">${esc(track.artist)} · ${esc(fmtDuration(track.seconds))} · <span class="mono">${esc(track.id)}</span> ${track.hidden ? '<span class="badge red">скрыт</span>' : ''}</div>
              </div>
              <button class="btn sm" type="button" data-dup-edit="${esc(track.id)}">Изменить</button>
              ${index === 0 ? '' : `<button class="btn sm" type="button" data-dup-canonical="${esc(group.tracks[0].id)}" data-dup-source="${esc(track.id)}">Эталон</button>`}
            </div>`).join('')}
        </div>`).join('') || '<div class="empty"><strong>Дублей нет</strong>Похожие записи не найдены.</div>';
    } catch (error) {
      errorToast(error);
      target.innerHTML = '<div class="empty">Не удалось загрузить дубли.</div>';
    }
  }

  root.querySelector('[data-duplicates]').addEventListener('click', async event => {
    const edit = event.target.closest('[data-dup-edit]');
    if (edit) { openEditor(edit.dataset.dupEdit); return; }
    const canonical = event.target.closest('[data-dup-canonical]');
    if (canonical) {
      const target = canonical.dataset.dupCanonical;
      const source = canonical.dataset.dupSource;
      const ok = await confirmDialog({
        title: 'Объединить записи?',
        message: 'Трек ' + source + ' будет помечен как версия эталона ' + target + '. Это сработает только для одинаковых записей.',
        confirmLabel: 'Объединить'
      });
      if (!ok) return;
      try {
        await patchTrack(source, { canonicalId: target });
        toast('Записи объединены');
        loadDuplicates(dupOffset);
      } catch (error) { errorToast(new Error(errorText(error))); }
    }
  });

  const dupSearch = debounce(() => { dupQuery = root.querySelector('[data-dup-q]').value.trim(); loadDuplicates(0); }, 320);
  root.querySelector('[data-dup-q]').addEventListener('input', dupSearch);
  root.querySelector('[data-dup-prev]').addEventListener('click', () => loadDuplicates(Math.max(0, dupOffset - 15)));
  root.querySelector('[data-dup-next]').addEventListener('click', () => loadDuplicates(dupOffset + 15));

  /* ---------- Uploads ---------- */
  const uploadOpen = () => {
    root.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === 'uploads'));
    root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== 'uploads'; });
    state.tab = 'uploads';
    loadUploads();
    root.querySelector('[data-upload-file]')?.focus();
    root.querySelector('[data-upload-file]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  root.querySelector('[data-upload-open]').addEventListener('click', uploadOpen);

  const uploadForm = root.querySelector('[data-upload-form]');
  const uploadFile = uploadForm.querySelector('[data-upload-file]');
  const secondsInput = uploadForm.querySelector('[data-upload-seconds]');
  const uploadStatus = root.querySelector('[data-upload-status]');

  uploadFile.addEventListener('change', () => {
    const file = uploadFile.files?.[0];
    if (!file) return;
    uploadStatus.textContent = fmtBytes(file.size);
    if (!uploadForm.elements.title.value) uploadForm.elements.title.value = file.name.replace(/\.[a-z0-9]+$/i, '');
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) secondsInput.value = String(Math.round(audio.duration));
      URL.revokeObjectURL(url);
    });
    audio.addEventListener('error', () => URL.revokeObjectURL(url));
  });

  uploadForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = uploadForm.querySelector('button[type="submit"]');
    const file = uploadFile.files?.[0];
    if (!file) return toast('Выберите аудиофайл', 'warn');
    if (!(Number(secondsInput.value) > 0)) return toast('Укажите длительность в секундах', 'warn');
    const data = new FormData(uploadForm);
    data.set('seconds', secondsInput.value);
    button.disabled = true;
    button.textContent = 'Загружаем…';
    uploadStatus.textContent = 'Идёт загрузка ' + fmtBytes(file.size) + '…';
    try {
      const result = await api('/api/admin/uploads', { method: 'POST', body: data });
      toast('Трек загружен (' + (result.storage === 'r2' ? 'R2' : 'D1') + ')');
      uploadForm.reset();
      uploadStatus.textContent = '';
      await loadUploads();
      await loadTracks();
    } catch (error) {
      errorToast(error);
      uploadStatus.textContent = '';
    } finally {
      button.disabled = false;
      button.textContent = 'Загрузить в каталог';
    }
  });

  async function loadUploads() {
    const target = root.querySelector('[data-uploads]');
    target.innerHTML = '<div class="skeleton" style="height:60px"></div>';
    try {
      const data = await api('/api/admin/uploads');
      state.uploadStorage = data.storage;
      root.querySelector('[data-upload-storage]').textContent = data.storage === 'r2' ? 'хранилище R2' : 'хранилище D1 (без R2)';
      root.querySelector('[data-upload-limit]').textContent = data.storage === 'r2'
        ? 'MP3, M4A, WAV до 60 МБ. Файл уходит в R2.'
        : 'MP3, M4A, WAV до 8 МБ. Для больших файлов подключите R2 (MEDIA_BUCKET).';
      root.querySelector('[data-upload-count]').textContent = fmtNum(data.items?.length || 0) + ' шт.';
      target.innerHTML = (data.items || []).map(track => `
        <div class="list-item">
          <img class="thumb" src="${esc(track.art || '/art/logo.svg')}" alt="" loading="lazy">
          <div class="item-info">
            <div class="item-title truncate">${esc(track.title)} <span class="dim">— ${esc(track.artist)}</span></div>
            <div class="item-meta"><span>${esc(fmtDuration(track.seconds))}</span><span>${esc(fmtBytes(track.bytes))}</span><span>${esc(fmtDateTime(track.created))}</span></div>
          </div>
          <div class="item-actions">
            <button class="btn sm" type="button" data-upload-play="${esc(track.audio)}">▶</button>
            <button class="btn sm danger" type="button" data-upload-delete="${esc(track.id)}">Удалить</button>
          </div>
        </div>`).join('') || '<div class="empty" style="padding:22px">Пока ничего не загружено.</div>';
    } catch (error) {
      errorToast(error);
      target.innerHTML = '<div class="empty">Загрузки недоступны.</div>';
    }
  }

  root.querySelector('[data-uploads]').addEventListener('click', async event => {
    const play = event.target.closest('[data-upload-play]');
    if (play) {
      const audio = new Audio(play.dataset.uploadPlay);
      audio.play().catch(() => toast('Не удалось воспроизвести', 'err'));
      return;
    }
    const remove = event.target.closest('[data-upload-delete]');
    if (remove) {
      const ok = await confirmDialog({
        title: 'Удалить загруженный трек?',
        message: 'Аудиофайл и запись каталога будут удалены без возможности восстановления.',
        confirmLabel: 'Удалить',
        danger: true
      });
      if (!ok) return;
      try {
        await api('/api/admin/uploads?id=' + encodeURIComponent(remove.dataset.uploadDelete), { method: 'DELETE' });
        toast('Трек удалён');
        await loadUploads();
        await loadTracks();
      } catch (error) { errorToast(error); }
    }
  });

  await loadFacets();
  await loadTracks();

  return () => { /* no global listeners */ };
}
