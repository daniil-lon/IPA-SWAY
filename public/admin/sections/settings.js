import { api, esc, fmtNum, fmtDateTime, relTime, confirmDialog, toast, errorToast, store, num } from '../core.js';

export const title = 'Настройки';
export const crumb = 'Sway Music · Система';

const FLAG_INFO = {
  maintenance: { label: 'Режим обслуживания', hint: 'Публичный сайт отвечает страницей «Sway обновляется».' },
  uploads: { label: 'Загрузка аудио', hint: 'Разрешает администраторам загружать треки.' },
  signups: { label: 'Регистрация', hint: 'Резервный флаг для управления новыми аккаунтами.' }
};

const AUDIT_LABELS = {
  'admin.password': 'Смена пароля',
  'admin.sessions.revoke': 'Отзыв сессии',
  'cache.purge': 'Очистка кэша',
  'flag.set': 'Изменён флаг',
  'promo.save': 'Промо-баннер',
  'broadcast.save': 'Рассылка',
  'editorial.save': 'Плейлист редакции',
  'lyrics.save': 'Текст сохранён',
  'lyrics.import': 'Текст импортирован',
  'lyrics.delete': 'Текст удалён',
  'catalog.hide': 'Треки скрыты',
  'catalog.unhide': 'Треки показаны',
  'catalog.genre': 'Жанр изменён',
  'catalog.license': 'Лицензия изменена',
  'catalog.language': 'Язык изменён',
  'catalog.explicit': 'Explicit добавлен',
  'catalog.clean': 'Explicit снят',
  'catalog.moods': 'Настроения изменены',
  'upload.create': 'Аудио загружено',
  'upload.delete': 'Аудио удалено',
  'user.delete': 'Пользователь удалён',
  'user.logout': 'Сессии сброшены',
  'user.rename': 'Имя изменено',
  'user.hide': 'Профиль скрыт',
  'user.show': 'Профиль показан',
  'user.clearLikes': 'Лайки очищены',
  'user.grant': 'Подписка выдана'
};

export async function render(root) {
  root.innerHTML = `
    <div class="view-head">
      <div>
        <h2>Настройки и система</h2>
        <p>Пароль, сессии, флаги, журнал аудита и состояние инфраструктуры.</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" type="button" data-tab="security">Безопасность</button>
      <button class="tab" type="button" data-tab="system">Система</button>
      <button class="tab" type="button" data-tab="flags">Флаги</button>
      <button class="tab" type="button" data-tab="audit">Аудит</button>
      <button class="tab" type="button" data-tab="telegram">Telegram</button>
    </div>

    <section data-panel="security">
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Смена пароля</span></div>
          <p class="lead">Пароль хранится как PBKDF2-SHA256. После смены все остальные сессии будут отозваны.</p>
          <form data-password-form>
            <div class="form-group"><label class="form-label">Текущий пароль</label><input class="form-input" type="password" name="currentPassword" autocomplete="current-password" required></div>
            <div class="form-group" style="margin-top:12px"><label class="form-label">Новый пароль (мин. 12 символов)</label><input class="form-input" type="password" name="newPassword" autocomplete="new-password" minlength="12" required></div>
            <div class="form-group" style="margin-top:12px"><label class="form-label">Повторите новый пароль</label><input class="form-input" type="password" name="confirmPassword" autocomplete="new-password" minlength="12" required></div>
            <div class="form-actions"><button class="btn primary" type="submit">Изменить пароль</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-title">
            <span>Активные сессии</span>
            <div class="card-actions"><button class="btn sm danger" type="button" data-revoke-all>Отозвать все</button></div>
          </div>
          <div class="item-list" data-sessions><div class="skeleton" style="height:80px"></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span>Неудачные попытки входа</span><span class="sub">защита от перебора</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>IP</th><th class="num">Попыток</th><th>Последняя</th></tr></thead>
            <tbody data-attempts><tr><td colspan="3"><div class="skeleton" style="height:60px"></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </section>

    <section data-panel="system" hidden>
      <div class="split">
        <div class="card">
          <div class="card-title"><span>Секреты и окружение</span></div>
          <dl class="kv" data-system></dl>
        </div>
        <div class="card">
          <div class="card-title"><span>Кэш и обслуживание</span></div>
          <p class="lead">Очистка кэша Cloudflare требует секретов <code>CF_API_TOKEN</code> и <code>CF_ZONE_ID</code>.</p>
          <button class="btn primary" type="button" data-purge>Сбросить кэш Cloudflare</button>
          <div class="form-hint" data-purge-status style="margin-top:10px"></div>
          <hr class="hr">
          <div class="card-title" style="margin-bottom:8px"><span>Таблицы D1</span></div>
          <div class="inline-form" data-tables></div>
        </div>
      </div>
    </section>

    <section data-panel="flags" hidden>
      <div class="card">
        <div class="card-title"><span>Переключатели</span><span class="sub">применяются в течение 15 секунд</span></div>
        <div class="item-list" data-flags><div class="skeleton" style="height:80px"></div></div>
      </div>
      <div class="card">
        <div class="card-title"><span>Добавить флаг</span></div>
        <form data-flag-form class="form-row">
          <input class="form-input" name="key" placeholder="my_flag" pattern="[a-z][a-z0-9_]{1,30}" required style="flex:1 1 200px">
          <input class="form-input" name="value" placeholder="значение" maxlength="200" required style="flex:1 1 200px">
          <button class="btn" type="submit">Добавить</button>
        </form>
      </div>
    </section>

    <section data-panel="audit" hidden>
      <div class="card">
        <div class="card-title">
          <span>Журнал действий</span>
          <div class="card-actions"><button class="btn sm" type="button" data-audit-refresh>Обновить</button></div>
        </div>
        <div class="item-list" data-audit><div class="skeleton" style="height:100px"></div></div>
        <div class="pager">
          <div class="pager-info" data-audit-info></div>
          <div class="pager-btns">
            <button class="btn sm" type="button" data-audit-prev>←</button>
            <button class="btn sm" type="button" data-audit-next>→</button>
          </div>
        </div>
      </div>
    </section>

    <section data-panel="telegram" hidden>
      <div class="card">
        <div class="card-title"><span>Telegram-бот</span></div>
        <p class="lead">Бот присылает уведомления и позволяет входить в панель по одноразовой ссылке.</p>
        <div class="codebox">
          <strong>Как подключить:</strong><br>
          1. Создайте бота в <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> и получите токен.<br>
          2. Задайте секреты воркера: <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>, <code>ADMIN_TELEGRAM_ID</code>.<br>
          3. Укажите webhook:<br>
          <code>https://api.telegram.org/bot&lt;ТОКЕН&gt;/setWebhook?url=https://music.academmix.ru/api/telegram/webhook&amp;secret_token=&lt;SECRET&gt;</code><br>
          4. Отправьте боту <code>/bind &lt;пароль&gt;</code>, затем <code>/login</code> для входа по ссылке.
        </div>
        <div class="item-meta" style="margin-top:12px">
          <span data-tg-status>Проверяем настройки…</span>
        </div>
      </div>
    </section>`;

  const state = { auditOffset: 0, auditLimit: 40 };

  root.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
      if (button.dataset.tab === 'system') loadSystem();
      if (button.dataset.tab === 'flags') loadFlags();
      if (button.dataset.tab === 'audit') loadAudit(0);
    });
  });

  /* ---------- Password ---------- */
  const passwordForm = root.querySelector('[data-password-form]');
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(passwordForm);
    const currentPassword = String(values.get('currentPassword') || '');
    const newPassword = String(values.get('newPassword') || '');
    const confirmPassword = String(values.get('confirmPassword') || '');
    if (newPassword.length < 12) return toast('Новый пароль — не короче 12 символов', 'warn');
    if (newPassword !== confirmPassword) return toast('Пароли не совпадают', 'warn');
    const button = passwordForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/admin/password', { method: 'POST', body: { currentPassword, newPassword } });
      passwordForm.reset();
      toast('Пароль изменён. Другие сессии отозваны.');
      await Promise.all([loadSessions(), loadAttempts(), loadAudit(0)]);
    } catch (error) { errorToast(error); }
    finally { button.disabled = false; }
  });

  /* ---------- Sessions ---------- */
  async function loadSessions() {
    const target = root.querySelector('[data-sessions]');
    target.innerHTML = '<div class="skeleton" style="height:70px"></div>';
    try {
      const data = await api('/api/admin/sessions');
      target.innerHTML = (data.items || []).map(session => `
        <div class="list-item">
          <div class="item-info">
            <div class="item-title" style="font-size:12.5px">
              ${session.current ? '<span class="badge green">текущая</span>' : '<span class="badge gray">другое устройство</span>'}
              <span class="mono dim" style="margin-left:6px">${esc(session.id)}…</span>
            </div>
            <div class="item-meta"><span>вход ${esc(fmtDateTime(session.created))}</span><span>до ${esc(fmtDateTime(session.expiry))}</span></div>
          </div>
          ${session.current ? '' : `<div class="item-actions"><button class="btn sm danger" type="button" data-revoke="${esc(session.id)}">Отозвать</button></div>`}
        </div>`).join('') || '<div class="empty" style="padding:18px">Нет активных сессий.</div>';
    } catch (error) {
      errorToast(error);
      target.innerHTML = '<div class="empty">Сессии недоступны.</div>';
    }
  }

  root.querySelector('[data-sessions]').addEventListener('click', async event => {
    const button = event.target.closest('[data-revoke]');
    if (!button) return;
    try {
      await api('/api/admin/sessions/revoke', { method: 'POST', body: { id: button.dataset.revoke } });
      toast('Сессия отозвана');
      await loadSessions();
    } catch (error) { errorToast(error); }
  });

  root.querySelector('[data-revoke-all]').addEventListener('click', async () => {
    if (!await confirmDialog({ title: 'Отозвать все сессии?', message: 'Останутся только текущая сессия. Все другие устройства выйдут из панели.', confirmLabel: 'Отозвать', danger: true })) return;
    try {
      await api('/api/admin/sessions/revoke', { method: 'POST', body: { all: true } });
      toast('Остальные сессии отозваны');
      await loadSessions();
    } catch (error) { errorToast(error); }
  });

  /* ---------- Attempts ---------- */
  async function loadAttempts() {
    const target = root.querySelector('[data-attempts]');
    try {
      const data = await api('/api/admin/attempts');
      target.innerHTML = (data.items || []).map(row => `
        <tr><td class="mono">${esc(row.ip)}</td><td class="num">${fmtNum(row.attempts)}</td><td>${esc(fmtDateTime(row.last_attempt))}</td></tr>
      `).join('') || '<tr><td colspan="3"><div class="empty" style="padding:18px">Попыток не было.</div></td></tr>';
    } catch {
      target.innerHTML = '<tr><td colspan="3"><div class="empty" style="padding:18px">Недоступно.</div></td></tr>';
    }
  }

  /* ---------- System ---------- */
  async function loadSystem() {
    const target = root.querySelector('[data-system]');
    const tables = root.querySelector('[data-tables]');
    try {
      const data = await api('/api/admin/system');
      store.system = data;
      const secrets = data.secrets || {};
      const rows = [
        ['Cloudflare API', secrets.CF_API_TOKEN && secrets.CF_ZONE_ID],
        ['Telegram-бот', secrets.TELEGRAM_BOT_TOKEN],
        ['Telegram webhook', secrets.TELEGRAM_WEBHOOK_SECRET],
        ['Yandex OAuth', secrets.YANDEX_CLIENT_SECRET],
        ['Setup-токен', secrets.ADMIN_SETUP_TOKEN]
      ];
      target.innerHTML = rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd><span class="dot ${value ? 'on' : 'off'}"></span>${value ? 'настроен' : 'нет'}</dd>`).join('') +
        `<dt>Публичный адрес</dt><dd>${esc(data.env?.PUBLIC_ORIGIN || location.origin)}</dd>
         <dt>Треков</dt><dd>${fmtNum(data.env?.tracks)}</dd>
         <dt>Флаг maintenance</dt><dd>${data.flags?.maintenance === '1' ? '<span class="badge yellow">включён</span>' : '<span class="badge green">выключен</span>'}</dd>`;
      tables.innerHTML = (data.tables || []).map(name => `<span class="chip mono">${esc(name)}</span>`).join('') || '<span class="dim">Нет таблиц</span>';
      const tgStatus = root.querySelector('[data-tg-status]');
      if (tgStatus) tgStatus.innerHTML = secrets.TELEGRAM_BOT_TOKEN
        ? '<span class="dot on"></span>Токен бота настроен' + (secrets.TELEGRAM_WEBHOOK_SECRET ? ', webhook защищён секретом' : ', но webhook-секрет не задан')
        : '<span class="dot off"></span>Токен бота не задан';
    } catch (error) {
      errorToast(error);
      target.innerHTML = '<dt>Ошибка</dt><dd>Не удалось получить состояние системы.</dd>';
    }
  }

  root.querySelector('[data-purge]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = root.querySelector('[data-purge-status]');
    button.disabled = true;
    status.textContent = 'Отправляем запрос…';
    try {
      const result = await api('/api/admin/purge-cache', { method: 'POST' });
      status.textContent = result.message || '';
      toast(result.message || 'Готово', result.success ? 'ok' : 'warn', 5000);
    } catch (error) {
      status.textContent = error.message;
      errorToast(error);
    } finally {
      button.disabled = false;
    }
  });

  /* ---------- Flags ---------- */
  async function loadFlags() {
    const target = root.querySelector('[data-flags]');
    target.innerHTML = '<div class="skeleton" style="height:70px"></div>';
    try {
      const data = await api('/api/admin/flags');
      const flags = data.flags || {};
      const known = Object.keys(FLAG_INFO);
      const extra = Object.keys(flags).filter(key => !known.includes(key));
      const switchRow = key => `
        <div class="list-item">
          <div class="item-info">
            <div class="item-title">${esc(FLAG_INFO[key].label)} <span class="mono dim">${esc(key)}</span></div>
            <div class="item-meta"><span>${esc(FLAG_INFO[key].hint)}</span></div>
          </div>
          <label class="switch"><input type="checkbox" data-flag-toggle="${esc(key)}" ${flags[key] === '1' ? 'checked' : ''}><span class="track"></span><span>${flags[key] === '1' ? 'вкл' : 'выкл'}</span></label>
        </div>`;
      target.innerHTML = known.map(switchRow).join('') + extra.map(key => `
        <div class="list-item">
          <div class="item-info">
            <div class="item-title mono" style="font-size:12.5px">${esc(key)}</div>
            <div class="item-meta"><span>текущее значение: ${esc(flags[key])}</span></div>
          </div>
          <div class="inline-form">
            <input class="form-input" data-flag-value="${esc(key)}" value="${esc(flags[key])}" style="width:180px;padding:7px 10px;font-size:12.5px">
            <button class="btn sm" type="button" data-flag-save="${esc(key)}">Сохранить</button>
          </div>
        </div>`).join('');
    } catch (error) {
      errorToast(error);
      target.innerHTML = '<div class="empty">Флаги недоступны.</div>';
    }
  }

  root.querySelector('[data-flags]').addEventListener('change', async event => {
    const toggle = event.target.closest('[data-flag-toggle]');
    if (!toggle) return;
    const key = toggle.dataset.flagToggle;
    const value = toggle.checked ? '1' : '0';
    try {
      await api('/api/admin/flags', { method: 'POST', body: { key, value } });
      toast('Флаг ' + key + ' = ' + value);
      await loadFlags();
    } catch (error) {
      errorToast(error);
      toggle.checked = !toggle.checked;
    }
  });

  root.querySelector('[data-flags]').addEventListener('click', async event => {
    const button = event.target.closest('[data-flag-save]');
    if (!button) return;
    const key = button.dataset.flagSave;
    const input = root.querySelector('[data-flag-value="' + CSS.escape(key) + '"]');
    try {
      await api('/api/admin/flags', { method: 'POST', body: { key, value: input.value } });
      toast('Флаг сохранён');
    } catch (error) { errorToast(error); }
  });

  root.querySelector('[data-flag-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await api('/api/admin/flags', { method: 'POST', body: { key: String(values.get('key')).trim(), value: String(values.get('value')).trim() } });
      toast('Флаг добавлен');
      event.currentTarget.reset();
      await loadFlags();
    } catch (error) { errorToast(error); }
  });

  /* ---------- Audit ---------- */
  async function loadAudit(offset = 0) {
    state.auditOffset = offset;
    const target = root.querySelector('[data-audit]');
    target.innerHTML = '<div class="skeleton" style="height:90px"></div>';
    try {
      const data = await api('/api/admin/audit?limit=' + state.auditLimit + '&offset=' + offset);
      const items = data.items || [];
      root.querySelector('[data-audit-info]').textContent = 'Всего записей: ' + fmtNum(data.total);
      root.querySelector('[data-audit-prev]').disabled = offset <= 0;
      root.querySelector('[data-audit-next]').disabled = offset + state.auditLimit >= num(data.total);
      target.innerHTML = items.map(row => `
        <div class="list-item" style="align-items:flex-start">
          <div class="item-info">
            <div class="item-title" style="font-size:12.5px">${esc(AUDIT_LABELS[row.action] || row.action)} ${row.target ? `<span class="mono dim">${esc(row.target)}</span>` : ''}</div>
            ${row.detail ? `<div class="muted small" style="margin-top:2px;word-break:break-word">${esc(row.detail)}</div>` : ''}
          </div>
          <span class="dim small nowrap" title="${esc(fmtDateTime(row.at))}">${esc(relTime(row.at))}</span>
        </div>`).join('') || '<div class="empty" style="padding:20px">Записей пока нет.</div>';
    } catch (error) {
      errorToast(error);
      target.innerHTML = '<div class="empty">Журнал недоступен.</div>';
    }
  }

  root.querySelector('[data-audit-refresh]').addEventListener('click', () => loadAudit(state.auditOffset));
  root.querySelector('[data-audit-prev]').addEventListener('click', () => loadAudit(Math.max(0, state.auditOffset - state.auditLimit)));
  root.querySelector('[data-audit-next]').addEventListener('click', () => loadAudit(state.auditOffset + state.auditLimit));

  await Promise.all([loadSessions(), loadAttempts(), loadSystem()]);
}
