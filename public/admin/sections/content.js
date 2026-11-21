import { api, esc, fmtNum, fmtDateTime, fromUnix, toUnix, confirmDialog, toast, errorToast } from '../core.js';

export const title = 'Промо и рассылки';
export const crumb = 'Sway Music · Контент';

const LEVELS = { info: 'Информация', success: 'Событие', warning: 'Важно' };

export async function render(root) {
  const state = { tab: 'promo', promos: [], broadcasts: [], playlists: [] };

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Промо, рассылки и подборки</h2>
        <p>Управляйте баннером на главной, объявлениями для слушателей и плейлистами редакции. У контента есть расписание показа.</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" type="button" data-tab="promo">Промо-баннер</button>
      <button class="tab" type="button" data-tab="broadcasts">Рассылки</button>
      <button class="tab" type="button" data-tab="editorial">Плейлисты редакции</button>
    </div>

    <section data-panel="promo">
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Баннер на главной</span><span class="sub">только один активен</span></div>
          <form data-promo-form>
            <input type="hidden" name="id">
            <div class="form-grid">
              <div class="form-group"><label class="form-label">Заголовок <span class="req">*</span></label><input class="form-input" name="title" required maxlength="160"></div>
              <div class="form-group"><label class="form-label">Бейдж</label><input class="form-input" name="badge" placeholder="НОВИНКА" maxlength="40"></div>
              <div class="form-group wide"><label class="form-label">Подзаголовок</label><input class="form-input" name="subtitle" maxlength="220"></div>
              <div class="form-group"><label class="form-label">Обложка (URL)</label><input class="form-input" name="cover_url" placeholder="/art/... или https://..."></div>
              <div class="form-group"><label class="form-label">Ссылка при клике</label><input class="form-input" name="target_url" placeholder="#home" value="#home"></div>
              <div class="form-group"><label class="form-label">Начало показа</label><input class="form-input" name="starts_at" type="datetime-local"></div>
              <div class="form-group"><label class="form-label">Конец показа</label><input class="form-input" name="ends_at" type="datetime-local"></div>
            </div>
            <div class="form-actions">
              <label class="switch"><input type="checkbox" name="is_active" checked><span class="track"></span><span>Показывать слушателям</span></label>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">Сохранить баннер</button>
              <button class="btn" type="button" data-promo-reset>Очистить</button>
            </div>
          </form>
        </div>

        <div class="card">
          <div class="card-title"><span>Предпросмотр</span></div>
          <div style="padding:16px 18px;background:linear-gradient(135deg,rgba(168,85,247,.24),rgba(99,102,241,.2));border:1px solid rgba(168,85,247,.4);border-radius:13px;display:flex;align-items:center;gap:12px">
            <div style="min-width:0;flex:1">
              <span data-preview-badge class="badge purple">НОВИНКА</span>
              <div data-preview-title style="font-size:16px;font-weight:750;margin-top:6px">Новинки этой пятницы</div>
              <div data-preview-sub class="muted small" style="margin-top:2px">Свежие релизы недели</div>
            </div>
            <span class="btn sm primary" style="pointer-events:none">Слушать</span>
          </div>
          <hr class="hr">
          <div class="item-list" data-promo-list><div class="skeleton" style="height:70px"></div></div>
        </div>
      </div>
    </section>

    <section data-panel="broadcasts" hidden>
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Новое объявление</span></div>
          <form data-broadcast-form>
            <div class="form-grid">
              <div class="form-group"><label class="form-label">Заголовок</label><input class="form-input" name="title" value="Объявление" maxlength="120"></div>
              <div class="form-group"><label class="form-label">Тип</label><select class="form-select" name="level">${Object.entries(LEVELS).map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}</select></div>
              <div class="form-group wide"><label class="form-label">Текст <span class="req">*</span></label><textarea class="form-textarea" name="message" required maxlength="1200" placeholder="Что нового у Sway?"></textarea></div>
              <div class="form-group"><label class="form-label">Кнопка</label><input class="form-input" name="action_label" placeholder="Открыть" maxlength="60"></div>
              <div class="form-group"><label class="form-label">Ссылка кнопки</label><input class="form-input" name="action_url" placeholder="#home"></div>
              <div class="form-group"><label class="form-label">Показывать дней</label><input class="form-input" name="duration_days" type="number" min="1" max="365" value="3"></div>
              <div class="form-group"><label class="form-label">Начало показа</label><input class="form-input" name="starts_at" type="datetime-local"></div>
            </div>
            <div class="form-actions"><button class="btn primary" type="submit">Опубликовать</button></div>
          </form>
        </div>
        <div class="card">
          <div class="card-title"><span>История рассылок</span><span class="sub" data-broadcast-count></span></div>
          <div class="item-list" data-broadcast-list><div class="skeleton" style="height:80px"></div></div>
        </div>
      </div>
    </section>

    <section data-panel="editorial" hidden>
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Плейлист редакции</span></div>
          <form data-editorial-form>
            <input type="hidden" name="id">
            <div class="form-grid">
              <div class="form-group"><label class="form-label">Название <span class="req">*</span></label><input class="form-input" name="title" required maxlength="140"></div>
              <div class="form-group"><label class="form-label">Бейдж</label><input class="form-input" name="badge" value="Редакция" maxlength="40"></div>
              <div class="form-group wide"><label class="form-label">Описание</label><input class="form-input" name="description" maxlength="240"></div>
              <div class="form-group"><label class="form-label">Обложка (URL)</label><input class="form-input" name="cover_url" placeholder="/art/logo.svg"></div>
              <div class="form-group"><label class="form-label">Порядок</label><input class="form-input" name="sort_order" type="number" value="0"></div>
              <div class="form-group"><label class="form-label">Начало показа</label><input class="form-input" name="starts_at" type="datetime-local"></div>
              <div class="form-group"><label class="form-label">Конец показа</label><input class="form-input" name="ends_at" type="datetime-local"></div>
              <div class="form-group wide"><label class="form-label">ID треков</label><textarea class="form-textarea mono" name="track_ids" style="min-height:120px" placeholder="Через запятую, пробел или с новой строки"></textarea><span class="form-hint">ID можно скопировать в разделе «Каталог».</span></div>
            </div>
            <div class="form-actions">
              <label class="switch"><input type="checkbox" name="is_published" checked><span class="track"></span><span>Опубликован</span></label>
            </div>
            <div class="form-actions">
              <button class="btn primary" type="submit">Сохранить плейлист</button>
              <button class="btn" type="button" data-editorial-reset>Очистить</button>
            </div>
          </form>
        </div>
        <div class="card">
          <div class="card-title"><span>Подборки редакции</span><span class="sub" data-editorial-count></span></div>
          <div class="item-list" data-editorial-list><div class="skeleton" style="height:80px"></div></div>
        </div>
      </div>
    </section>`;

  /* ---------- Tabs ---------- */
  root.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== state.tab; });
      if (state.tab === 'promo') loadPromo();
      if (state.tab === 'broadcasts') loadBroadcasts();
      if (state.tab === 'editorial') loadEditorial();
    });
  });

  /* ---------- Promo ---------- */
  const promoForm = root.querySelector('[data-promo-form]');
  const previewBadge = root.querySelector('[data-preview-badge]');
  const previewTitle = root.querySelector('[data-preview-title]');
  const previewSub = root.querySelector('[data-preview-sub]');

  function syncPreview() {
    previewBadge.textContent = promoForm.elements.badge.value.trim() || 'ПРОМО';
    previewTitle.textContent = promoForm.elements.title.value.trim() || 'Заголовок промо';
    previewSub.textContent = promoForm.elements.subtitle.value.trim() || 'Описание баннера';
  }
  ['title', 'badge', 'subtitle'].forEach(name => promoForm.elements[name].addEventListener('input', syncPreview));

  function fillPromo(banner) {
    promoForm.elements.id.value = banner?.id || '';
    promoForm.elements.title.value = banner?.title || '';
    promoForm.elements.badge.value = banner?.badge || 'НОВИНКА';
    promoForm.elements.subtitle.value = banner?.subtitle || '';
    promoForm.elements.cover_url.value = banner?.cover_url || '';
    promoForm.elements.target_url.value = banner?.target_url || '#home';
    promoForm.elements.starts_at.value = fromUnix(banner?.starts_at);
    promoForm.elements.ends_at.value = fromUnix(banner?.ends_at);
    promoForm.elements.is_active.checked = Boolean(banner?.is_active);
    syncPreview();
  }

  function resetPromo() {
    promoForm.reset();
    promoForm.elements.target_url.value = '#home';
    promoForm.elements.badge.value = 'НОВИНКА';
    promoForm.elements.is_active.checked = true;
    syncPreview();
  }

  async function loadPromo() {
    const list = root.querySelector('[data-promo-list]');
    try {
      const data = await api('/api/admin/promo');
      state.promos = data.banners || [];
      list.innerHTML = state.promos.map(banner => `
        <div class="list-item" style="align-items:flex-start">
          ${banner.cover_url ? `<img class="thumb" src="${esc(banner.cover_url)}" alt="" loading="lazy">` : '<div class="thumb" style="display:grid;place-items:center">✦</div>'}
          <div class="item-info">
            <div class="item-title truncate">${esc(banner.title)} ${banner.is_active ? '<span class="badge green">активен</span>' : '<span class="badge gray">выкл</span>'}</div>
            <div class="item-meta">
              <span class="badge purple">${esc(banner.badge || 'ПРОМО')}</span>
              <span>${esc(fmtDateTime(banner.updated_at))}</span>
              ${banner.starts_at ? `<span>с ${esc(fmtDateTime(banner.starts_at))}</span>` : ''}
              ${banner.ends_at ? `<span>до ${esc(fmtDateTime(banner.ends_at))}</span>` : ''}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn sm" type="button" data-promo-edit="${esc(banner.id)}">Изменить</button>
            ${banner.is_active ? '' : `<button class="btn sm success" type="button" data-promo-activate="${esc(banner.id)}">Включить</button>`}
            <button class="btn sm danger" type="button" data-promo-delete="${esc(banner.id)}">×</button>
          </div>
        </div>`).join('') || '<div class="empty" style="padding:20px">Баннеров пока нет.</div>';
    } catch (error) {
      errorToast(error);
      list.innerHTML = '<div class="empty">Не удалось загрузить баннеры.</div>';
    }
  }

  promoForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(promoForm);
    const body = {
      id: values.get('id') || undefined,
      title: String(values.get('title') || '').trim(),
      subtitle: String(values.get('subtitle') || ''),
      badge: String(values.get('badge') || 'ПРОМО'),
      cover_url: String(values.get('cover_url') || ''),
      target_url: String(values.get('target_url') || '#'),
      is_active: values.get('is_active') === 'on',
      starts_at: toUnix(values.get('starts_at')),
      ends_at: toUnix(values.get('ends_at'))
    };
    const button = promoForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/admin/promo', { method: 'POST', body });
      toast('Баннер сохранён');
      await loadPromo();
    } catch (error) { errorToast(error); }
    finally { button.disabled = false; }
  });

  root.querySelector('[data-promo-reset]').addEventListener('click', resetPromo);

  root.querySelector('[data-promo-list]').addEventListener('click', async event => {
    const edit = event.target.closest('[data-promo-edit]');
    if (edit) {
      const banner = state.promos.find(item => item.id === edit.dataset.promoEdit);
      if (banner) { fillPromo(banner); promoForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    const activate = event.target.closest('[data-promo-activate]');
    if (activate) {
      const banner = state.promos.find(item => item.id === activate.dataset.promoActivate);
      if (!banner) return;
      try {
        await api('/api/admin/promo', {
          method: 'POST',
          body: {
            id: banner.id, title: banner.title, subtitle: banner.subtitle || '', badge: banner.badge || 'ПРОМО',
            cover_url: banner.cover_url || '', target_url: banner.target_url || '#', is_active: true,
            starts_at: banner.starts_at || 0, ends_at: banner.ends_at || 0
          }
        });
        toast('Баннер включён');
        await loadPromo();
      } catch (error) { errorToast(error); }
      return;
    }
    const remove = event.target.closest('[data-promo-delete]');
    if (remove) {
      const ok = await confirmDialog({ title: 'Удалить баннер?', message: 'Баннер исчезнет с главной страницы.', confirmLabel: 'Удалить', danger: true });
      if (!ok) return;
      try {
        await api('/api/admin/promo?id=' + encodeURIComponent(remove.dataset.promoDelete), { method: 'DELETE' });
        toast('Баннер удалён');
        if (promoForm.elements.id.value === remove.dataset.promoDelete) resetPromo();
        await loadPromo();
      } catch (error) { errorToast(error); }
    }
  });

  /* ---------- Broadcasts ---------- */
  const broadcastForm = root.querySelector('[data-broadcast-form]');
  const broadcastList = root.querySelector('[data-broadcast-list]');

  async function loadBroadcasts() {
    broadcastList.innerHTML = '<div class="skeleton" style="height:70px"></div>';
    try {
      const data = await api('/api/admin/broadcasts');
      state.broadcasts = data.broadcasts || [];
      root.querySelector('[data-broadcast-count]').textContent = fmtNum(state.broadcasts.length) + ' шт.';
      broadcastList.innerHTML = state.broadcasts.map(item => `
        <div class="list-item" style="align-items:flex-start">
          <div class="item-info">
            <div class="item-title">${esc(item.title)} <span class="badge ${item.level === 'warning' ? 'yellow' : item.level === 'success' ? 'green' : 'purple'}">${esc(LEVELS[item.level] || item.level)}</span></div>
            <div class="muted small" style="margin-top:3px;white-space:pre-wrap">${esc(item.message)}</div>
            <div class="item-meta">
              <span>до ${esc(fmtDateTime(item.expires_at))}</span>
              ${item.starts_at ? `<span>с ${esc(fmtDateTime(item.starts_at))}</span>` : ''}
              ${item.action_label ? `<span>кнопка: <b>${esc(item.action_label)}</b></span>` : ''}
            </div>
          </div>
          <div class="item-actions"><button class="btn sm danger" type="button" data-broadcast-delete="${esc(item.id)}">Удалить</button></div>
        </div>`).join('') || '<div class="empty" style="padding:20px">Рассылок пока нет.</div>';
    } catch (error) {
      errorToast(error);
      broadcastList.innerHTML = '<div class="empty">Не удалось загрузить рассылки.</div>';
    }
  }

  broadcastForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(broadcastForm);
    const body = {
      title: String(values.get('title') || 'Объявление'),
      message: String(values.get('message') || '').trim(),
      level: String(values.get('level') || 'info'),
      action_label: String(values.get('action_label') || ''),
      action_url: String(values.get('action_url') || ''),
      duration_days: Number(values.get('duration_days')) || 3,
      starts_at: toUnix(values.get('starts_at'))
    };
    if (!body.message) return toast('Введите текст', 'warn');
    const button = broadcastForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/admin/broadcasts', { method: 'POST', body });
      toast('Объявление опубликовано');
      broadcastForm.elements.message.value = '';
      broadcastForm.elements.action_label.value = '';
      broadcastForm.elements.action_url.value = '';
      await loadBroadcasts();
    } catch (error) { errorToast(error); }
    finally { button.disabled = false; }
  });

  broadcastList.addEventListener('click', async event => {
    const remove = event.target.closest('[data-broadcast-delete]');
    if (!remove) return;
    const ok = await confirmDialog({ title: 'Удалить рассылку?', message: 'Объявление исчезнет у слушателей.', confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await api('/api/admin/broadcasts?id=' + encodeURIComponent(remove.dataset.broadcastDelete), { method: 'DELETE' });
      toast('Рассылка удалена');
      await loadBroadcasts();
    } catch (error) { errorToast(error); }
  });

  /* ---------- Editorial ---------- */
  const editorialForm = root.querySelector('[data-editorial-form]');
  const editorialList = root.querySelector('[data-editorial-list]');

  function resetEditorial() {
    editorialForm.reset();
    editorialForm.elements.badge.value = 'Редакция';
    editorialForm.elements.is_published.checked = true;
    editorialForm.elements.sort_order.value = '0';
  }

  async function loadEditorial() {
    editorialList.innerHTML = '<div class="skeleton" style="height:70px"></div>';
    try {
      const data = await api('/api/admin/editorial-playlists');
      state.playlists = data.playlists || [];
      root.querySelector('[data-editorial-count]').textContent = fmtNum(state.playlists.length) + ' шт.';
      editorialList.innerHTML = state.playlists.map(playlist => `
        <div class="list-item" style="align-items:flex-start">
          <img class="thumb" src="${esc(playlist.cover_url || '/art/logo.svg')}" alt="" loading="lazy">
          <div class="item-info">
            <div class="item-title truncate">${esc(playlist.title)} <span class="badge purple">${esc(playlist.badge || 'Редакция')}</span> ${playlist.is_published ? '<span class="badge green">опубл.</span>' : '<span class="badge gray">черновик</span>'}</div>
            <div class="item-meta">
              <span>${fmtNum((playlist.track_ids || []).length)} треков</span>
              <span>порядок ${fmtNum(playlist.sort_order)}</span>
              ${playlist.starts_at ? `<span>с ${esc(fmtDateTime(playlist.starts_at))}</span>` : ''}
              ${playlist.ends_at ? `<span>до ${esc(fmtDateTime(playlist.ends_at))}</span>` : ''}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn sm" type="button" data-playlist-edit="${esc(playlist.id)}">Изменить</button>
            <button class="btn sm danger" type="button" data-playlist-delete="${esc(playlist.id)}">×</button>
          </div>
        </div>`).join('') || '<div class="empty" style="padding:20px">Плейлистов пока нет.</div>';
    } catch (error) {
      errorToast(error);
      editorialList.innerHTML = '<div class="empty">Не удалось загрузить плейлисты.</div>';
    }
  }

  function fillEditorial(playlist) {
    editorialForm.elements.id.value = playlist.id;
    editorialForm.elements.title.value = playlist.title || '';
    editorialForm.elements.badge.value = playlist.badge || 'Редакция';
    editorialForm.elements.description.value = playlist.description || '';
    editorialForm.elements.cover_url.value = playlist.cover_url || '';
    editorialForm.elements.sort_order.value = String(playlist.sort_order || 0);
    editorialForm.elements.starts_at.value = fromUnix(playlist.starts_at);
    editorialForm.elements.ends_at.value = fromUnix(playlist.ends_at);
    editorialForm.elements.track_ids.value = (playlist.track_ids || []).join('\n');
    editorialForm.elements.is_published.checked = Boolean(playlist.is_published);
    editorialForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  editorialForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(editorialForm);
    const trackIds = String(values.get('track_ids') || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean);
    const body = {
      id: values.get('id') || undefined,
      title: String(values.get('title') || '').trim(),
      badge: String(values.get('badge') || 'Редакция'),
      description: String(values.get('description') || ''),
      cover_url: String(values.get('cover_url') || '/art/logo.svg'),
      sort_order: Number(values.get('sort_order')) || 0,
      track_ids: trackIds,
      is_published: values.get('is_published') === 'on',
      starts_at: toUnix(values.get('starts_at')),
      ends_at: toUnix(values.get('ends_at'))
    };
    if (!body.title) return toast('Введите название', 'warn');
    const button = editorialForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/admin/editorial-playlists', { method: 'POST', body });
      toast('Плейлист сохранён');
      resetEditorial();
      await loadEditorial();
    } catch (error) { errorToast(error); }
    finally { button.disabled = false; }
  });

  root.querySelector('[data-editorial-reset]').addEventListener('click', resetEditorial);

  editorialList.addEventListener('click', async event => {
    const edit = event.target.closest('[data-playlist-edit]');
    if (edit) {
      const playlist = state.playlists.find(item => item.id === edit.dataset.playlistEdit);
      if (playlist) fillEditorial(playlist);
      return;
    }
    const remove = event.target.closest('[data-playlist-delete]');
    if (remove) {
      const ok = await confirmDialog({ title: 'Удалить плейлист?', message: 'Подборка исчезнет из приложения.', confirmLabel: 'Удалить', danger: true });
      if (!ok) return;
      try {
        await api('/api/admin/editorial-playlists?id=' + encodeURIComponent(remove.dataset.playlistDelete), { method: 'DELETE' });
        toast('Плейлист удалён');
        await loadEditorial();
      } catch (error) { errorToast(error); }
    }
  });

  await Promise.all([loadPromo(), loadBroadcasts(), loadEditorial()]);
}
