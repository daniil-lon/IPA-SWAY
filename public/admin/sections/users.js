import { api, esc, fmtNum, fmtDuration, fmtDateTime, relTime, openModal, confirmDialog, toast, errorToast, debounce, num, initials } from '../core.js';

export const title = 'Пользователи';
export const crumb = 'Sway Music · Люди';

export async function render(root) {
  const state = { tab: 'users', q: '', offset: 0, limit: 40, total: 0, items: [], detail: null };

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Пользователи</h2>
        <p>Аккаунты, активность, сессии и модерация публичных профилей. Здесь же — подписки и очистка данных.</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" type="button" data-tab="users">Пользователи</button>
      <button class="tab" type="button" data-tab="moderation">Модерация</button>
    </div>

    <section data-panel="users">
      <div class="card">
        <div class="toolbar">
          <div class="search-field grow"><input class="form-input" type="search" data-q placeholder="Имя, ID или handle…" autocomplete="off"></div>
          <button class="btn" type="button" data-refresh>Обновить</button>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th class="num">Лайки</th>
                <th class="num">Плейлисты</th>
                <th class="num">Прослушано</th>
                <th>Последний раз</th>
                <th class="num">Сессии</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-rows><tr><td colspan="7"><div class="skeleton" style="height:140px"></div></td></tr></tbody>
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

    <section data-panel="moderation" hidden>
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Публичные профили</span><span class="sub" data-mod-count></span></div>
          <div class="item-list" data-mod-visible><div class="skeleton" style="height:80px"></div></div>
        </div>
        <div class="card">
          <div class="card-title"><span>Реакции в коллекциях</span></div>
          <div data-mod-reactions><div class="skeleton" style="height:80px"></div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><span>Приглашения в плейлисты</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Плейлист</th><th>Роль</th><th>Истекает</th></tr></thead>
            <tbody data-mod-invites><tr><td colspan="3"><div class="skeleton" style="height:60px"></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </section>`;

  const rows = root.querySelector('[data-rows]');
  const pagerInfo = root.querySelector('[data-pager-info]');

  root.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== state.tab; });
      if (state.tab === 'moderation') loadModeration();
    });
  });

  async function loadUsers() {
    rows.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:140px"></div></td></tr>';
    const params = new URLSearchParams({ offset: state.offset, limit: state.limit });
    if (state.q) params.set('q', state.q);
    try {
      const data = await api('/api/admin/users?' + params);
      state.items = data.items || [];
      state.total = num(data.total);
      rows.innerHTML = state.items.map(user => `
        <tr>
          <td>
            <div class="cell-main">
              <div class="thumb" style="display:grid;place-items:center;font-weight:750;font-size:12px">${esc(initials(user.name))}</div>
              <div class="text">
                <div class="row-title truncate">${esc(user.name || 'Без имени')}</div>
                <div class="row-sub truncate">${user.handle ? '@' + esc(user.handle) : '<span class="mono">' + esc(user.id) + '</span>'} ${user.visible ? '' : ' · <span class="badge gray">скрыт</span>'}</div>
              </div>
            </div>
          </td>
          <td class="num">${fmtNum(user.likes)}</td>
          <td class="num">${fmtNum(user.playlists)}</td>
          <td class="num">${esc(fmtDuration(user.seconds))}</td>
          <td class="nowrap">${user.lastListen ? esc(relTime(user.lastListen)) : '<span class="dim">—</span>'}</td>
          <td class="num">${fmtNum(user.sessions)}</td>
          <td><div class="cell-actions"><button class="btn sm" type="button" data-open="${esc(user.id)}">Открыть</button></div></td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty"><strong>Никого не нашли</strong>Измените запрос.</div></td></tr>';

      const start = state.total ? state.offset + 1 : 0;
      const end = Math.min(state.offset + state.items.length, state.total);
      pagerInfo.textContent = start + '–' + end + ' из ' + fmtNum(state.total);
      root.querySelector('[data-prev]').disabled = state.offset <= 0;
      root.querySelector('[data-next]').disabled = state.offset + state.limit >= state.total;
    } catch (error) {
      errorToast(error);
      rows.innerHTML = '<tr><td colspan="7"><div class="empty">Не удалось загрузить пользователей.</div></td></tr>';
    }
  }

  const runSearch = debounce(() => { state.offset = 0; loadUsers(); }, 320);
  root.querySelector('[data-q]').addEventListener('input', event => { state.q = event.target.value.trim(); runSearch(); });
  root.querySelector('[data-prev]').addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadUsers(); });
  root.querySelector('[data-next]').addEventListener('click', () => { state.offset += state.limit; loadUsers(); });
  root.querySelector('[data-refresh]').addEventListener('click', async () => { await loadUsers(); toast('Список обновлён'); });

  rows.addEventListener('click', event => {
    const button = event.target.closest('[data-open]');
    if (button) openUser(button.dataset.open);
  });

  /* ---------- User detail ---------- */
  async function openUser(id) {
    let data;
    try {
      data = await api('/api/admin/users/detail?id=' + encodeURIComponent(id));
    } catch (error) { errorToast(error); return; }
    state.detail = data;

    const user = data.user || {};
    const profile = data.profile || {};
    const modal = openModal({
      title: user.name || 'Пользователь',
      wide: true,
      body: `
        <div class="item-meta" style="margin-bottom:14px">
          <span class="mono">${esc(user.id)}</span>
          ${profile.handle ? `<span>@${esc(profile.handle)}</span>` : ''}
          ${profile.joined_at ? `<span>с ${esc(fmtDateTime(profile.joined_at))}</span>` : ''}
          ${profile.visible ? '<span class="badge green">профиль виден</span>' : '<span class="badge gray">профиль скрыт</span>'}
          ${data.subscription ? `<span class="badge purple">${esc(data.subscription.plan)} · ${esc(data.subscription.status)}</span>` : '<span class="badge gray">без подписки</span>'}
        </div>

        <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          <div class="stat-card"><div class="stat-label">Лайки</div><div class="stat-val" style="font-size:21px">${fmtNum(data.likes?.length || 0)}</div></div>
          <div class="stat-card"><div class="stat-label">Плейлисты</div><div class="stat-val" style="font-size:21px">${fmtNum(data.playlists?.length || 0)}</div></div>
          <div class="stat-card"><div class="stat-label">Сессии</div><div class="stat-val" style="font-size:21px">${fmtNum(data.sessions?.length || 0)}</div></div>
          <div class="stat-card"><div class="stat-label">Громкость</div><div class="stat-val" style="font-size:21px">${Math.round((Number(user.volume) || 0) * 100)}%</div></div>
        </div>

        <div class="form-actions" style="margin-bottom:14px">
          <button class="btn sm" type="button" data-act="rename">Переименовать</button>
          <button class="btn sm" type="button" data-act="${profile.visible ? 'hide' : 'show'}">${profile.visible ? 'Скрыть профиль' : 'Показать профиль'}</button>
          <button class="btn sm" type="button" data-act="grant">Выдать подписку</button>
          <button class="btn sm" type="button" data-act="logout">Сбросить сессии</button>
          <button class="btn sm" type="button" data-act="clearLikes">Очистить лайки</button>
          <button class="btn sm danger" type="button" data-act="delete">Удалить аккаунт</button>
        </div>

        <div class="split" style="gap:14px">
          <div>
            <div class="card-title"><span>Топ прослушиваний</span></div>
            <div class="item-list">
              ${(data.top || []).map((track, index) => `
                <div class="list-item" style="padding:8px 10px">
                  <span class="dim" style="width:18px">${index + 1}</span>
                  <img class="thumb" style="width:32px;height:32px" src="${esc(track.art || '/art/logo.svg')}" alt="">
                  <div class="item-info"><div class="item-title truncate" style="font-size:12.5px">${esc(track.title)}</div><div class="item-meta"><span>${esc(track.artist)}</span><span>${esc(fmtDuration(track.seconds))}</span></div></div>
                </div>`).join('') || '<div class="empty" style="padding:16px">Нет истории.</div>'}
            </div>
          </div>
          <div>
            <div class="card-title"><span>Плейлисты</span></div>
            <div class="item-list">
              ${(data.playlists || []).map(playlist => `
                <div class="list-item" style="padding:8px 10px">
                  <div class="item-info"><div class="item-title truncate" style="font-size:12.5px">${esc(playlist.name)}</div><div class="item-meta"><span>${fmtNum(playlist.tracks)} треков</span><span>${esc(fmtDateTime(playlist.updated))}</span></div></div>
                </div>`).join('') || '<div class="empty" style="padding:16px">Нет плейлистов.</div>'}
            </div>
          </div>
        </div>

        <div class="card-title" style="margin-top:16px"><span>Недавние лайки</span></div>
        <div class="item-list">
          ${(data.likes || []).slice(0, 8).map(track => `
            <div class="list-item" style="padding:7px 10px">
              <img class="thumb" style="width:30px;height:30px" src="${esc(track.art || '/art/logo.svg')}" alt="">
              <div class="item-info"><div class="item-title truncate" style="font-size:12.5px">${esc(track.title)} <span class="dim">— ${esc(track.artist)}</span></div></div>
              <span class="dim small">${esc(relTime(track.added))}</span>
            </div>`).join('') || '<div class="empty" style="padding:16px">Лайков нет.</div>'}
        </div>`,
      footer: '<button type="button" class="btn" data-close>Закрыть</button>'
    });

    modal.foot.querySelector('[data-close]').addEventListener('click', modal.close);

    modal.body.addEventListener('click', async event => {
      const action = event.target.closest('[data-act]');
      if (!action) return;
      const act = action.dataset.act;

      if (act === 'rename') {
        const name = await inputDialog({ title: 'Новое имя', label: 'Имя пользователя', value: user.name || '', maxlength: 80, confirmLabel: 'Сохранить' });
        if (!name) return;
        await runAction('rename', name);
      } else if (act === 'hide' || act === 'show') {
        await runAction(act);
      } else if (act === 'grant') {
        const result = await grantDialog();
        if (!result) return;
        await runAction('grant', result.plan, { days: result.days });
      } else if (act === 'logout') {
        if (!await confirmDialog({ title: 'Сбросить сессии?', message: 'Пользователь выйдет на всех устройствах и должен будет войти заново.', confirmLabel: 'Сбросить' })) return;
        await runAction('logout');
      } else if (act === 'clearLikes') {
        if (!await confirmDialog({ title: 'Очистить лайки?', message: 'Все треки из коллекции пользователя будут удалены.', confirmLabel: 'Очистить', danger: true })) return;
        await runAction('clearLikes');
      } else if (act === 'delete') {
        if (!await confirmDialog({ title: 'Удалить аккаунт?', message: 'Будут удалены профиль, лайки, плейлисты, история и сессии пользователя. Это необратимо.', confirmLabel: 'Удалить навсегда', danger: true })) return;
        try {
          await api('/api/admin/users/action', { method: 'POST', body: { id: user.id, action: 'delete' } });
          toast('Аккаунт удалён');
          modal.close();
          await loadUsers();
        } catch (error) { errorToast(error); }
      }
    });

    async function runAction(action, value, extra = {}) {
      try {
        await api('/api/admin/users/action', { method: 'POST', body: { id: user.id, action, value, ...extra } });
        toast('Готово');
        modal.close();
        await loadUsers();
      } catch (error) { errorToast(error); }
    }
  }

  function inputDialog({ title, label, value = '', maxlength = 200, confirmLabel = 'Сохранить' }) {
    return new Promise(resolve => {
      let settled = false;
      const modal = openModal({
        title, narrow: true,
        body: `<div class="form-group"><label class="form-label">${esc(label)}</label><input class="form-input" value="${esc(value)}" maxlength="${maxlength}" data-value></div>`,
        footer: `<button class="btn" type="button" data-cancel>Отмена</button><button class="btn primary" type="button" data-ok>${esc(confirmLabel)}</button>`,
        onClose: () => { if (!settled) resolve(null); }
      });
      const input = modal.body.querySelector('[data-value]');
      setTimeout(() => input.focus(), 40);
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        settled = true;
        modal.close();
        resolve(text);
      };
      modal.foot.querySelector('[data-ok]').addEventListener('click', submit);
      modal.foot.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
      input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    });
  }

  function grantDialog() {
    return new Promise(resolve => {
      let settled = false;
      const modal = openModal({
        title: 'Выдать подписку', narrow: true,
        body: `
          <div class="form-group"><label class="form-label">Тариф</label><input class="form-input" value="manual" maxlength="40" data-plan></div>
          <div class="form-group" style="margin-top:12px"><label class="form-label">Дней</label><input class="form-input" type="number" min="1" max="3650" value="30" data-days></div>`,
        footer: '<button class="btn" type="button" data-cancel>Отмена</button><button class="btn primary" type="button" data-ok>Выдать</button>',
        onClose: () => { if (!settled) resolve(null); }
      });
      modal.foot.querySelector('[data-ok]').addEventListener('click', () => {
        const plan = modal.body.querySelector('[data-plan]').value.trim() || 'manual';
        const days = Math.min(Math.max(Number(modal.body.querySelector('[data-days]').value) || 30, 1), 3650);
        settled = true;
        modal.close();
        resolve({ plan, days });
      });
      modal.foot.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
    });
  }

  /* ---------- Moderation ---------- */
  async function loadModeration() {
    const visible = root.querySelector('[data-mod-visible]');
    visible.innerHTML = '<div class="skeleton" style="height:80px"></div>';
    try {
      const data = await api('/api/admin/moderation');
      root.querySelector('[data-mod-count]').textContent = fmtNum(data.visible?.length || 0) + ' профилей';
      visible.innerHTML = (data.visible || []).map(profile => `
        <div class="list-item">
          <div class="item-info">
            <div class="item-title">${esc(profile.name || 'Без имени')} <span class="dim">@${esc(profile.handle || '—')}</span></div>
            <div class="item-meta"><span>${esc(profile.bio || 'без описания')}</span><span>${esc(fmtDateTime(profile.joined_at))}</span></div>
          </div>
          <div class="item-actions"><button class="btn sm" type="button" data-mod-open="${esc(profile.uid)}">Открыть</button></div>
        </div>`).join('') || '<div class="empty" style="padding:20px">Публичных профилей нет.</div>';

      root.querySelector('[data-mod-reactions]').innerHTML = (data.reactions || []).map(row => `
        <div class="bar-row">
          <div class="label">${esc(row.kind)} · ${esc(row.ref)}</div>
          <div class="bar"><span style="width:${Math.max(2, Math.round((num(row.total) / Math.max(1, data.reactions[0]?.total || 1)) * 100))}%"></span></div>
          <div class="value">${fmtNum(row.total)}</div>
        </div>`).join('') || '<div class="empty" style="padding:20px">Реакций пока нет.</div>';

      root.querySelector('[data-mod-invites]').innerHTML = (data.invites || []).map(invite => `
        <tr><td class="mono">${esc(invite.playlist)}</td><td>${esc(invite.role || '—')}</td><td>${esc(fmtDateTime(invite.expiry))}</td></tr>
      `).join('') || '<tr><td colspan="3"><div class="empty" style="padding:18px">Приглашений нет.</div></td></tr>';
    } catch (error) {
      errorToast(error);
      visible.innerHTML = '<div class="empty">Модерация недоступна.</div>';
    }
  }

  root.querySelector('[data-mod-visible]').addEventListener('click', event => {
    const button = event.target.closest('[data-mod-open]');
    if (button) openUser(button.dataset.modOpen);
  });

  await loadUsers();
}
