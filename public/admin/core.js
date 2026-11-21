// Shared helpers for the Sway admin panel: API client, toasts, modals, formatting.

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, detail) {
  for (const handler of listeners.get(event) || []) {
    try { handler(detail); } catch (error) { console.error(error); }
  }
}

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let unauthorizedNotified = false;

export async function api(path, options = {}) {
  const { method = 'GET', body, raw = false, headers = {} } = options;
  const init = { method, credentials: 'same-origin', headers: { ...headers } };
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError('Нет связи с сервером. Проверьте интернет.', 0, error);
  }

  if (response.status === 401) {
    if (!unauthorizedNotified) {
      unauthorizedNotified = true;
      emit('unauthorized');
      setTimeout(() => { unauthorizedNotified = false; }, 1500);
    }
    if (raw) return response;
    throw new ApiError('Сессия истекла. Войдите заново.', 401);
  }

  if (raw) return response;

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();

  if (!response.ok) {
    const message = (data && data.error) || (typeof data === 'string' && data) || ('Ошибка ' + response.status);
    throw new ApiError(message, response.status, data);
  }
  return data;
}

/* ---------- Toasts ---------- */
export function toast(message, type = 'ok', ms = 3800) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast ' + type;
  const icon = type === 'err' ? '⚠' : type === 'warn' ? '!' : '✓';
  node.innerHTML = '<span class="ico">' + icon + '</span><span></span>';
  node.lastChild.textContent = String(message);
  host.append(node);
  setTimeout(() => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 220);
  }, ms);
}

export function errorToast(error) {
  const message = error instanceof ApiError ? error.message : (error?.message || 'Неизвестная ошибка');
  toast(message, 'err', 5200);
}

/* ---------- Modals ---------- */
export function openModal({ title = '', body = '', footer = '', wide = false, narrow = false, onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal' + (wide ? ' wide' : narrow ? ' narrow' : '');
  dialog.innerHTML = `
    <div class="modal-head">
      <h3></h3>
      <button type="button" class="close" aria-label="Закрыть">×</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-foot"></div>`;
  dialog.querySelector('h3').textContent = title;
  const bodyNode = dialog.querySelector('.modal-body');
  const footNode = dialog.querySelector('.modal-foot');
  if (typeof body === 'string') bodyNode.innerHTML = body;
  else if (body) bodyNode.append(body);
  if (typeof footer === 'string') footNode.innerHTML = footer;
  else if (footer) footNode.append(footer);
  if (!footNode.childNodes.length) footNode.hidden = true;

  document.body.append(dialog);
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
  };
  dialog.querySelector('.close').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    try { onClose?.(); } catch (error) { console.error(error); }
    dialog.remove();
  });
  dialog.showModal();
  return { dialog, body: bodyNode, foot: footNode, close };
}

export function confirmDialog({ title = 'Подтвердите действие', message = '', confirmLabel = 'Подтвердить', danger = false } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const modal = openModal({
      title,
      narrow: true,
      body: '<p class="muted" style="line-height:1.6"></p>',
      footer: `<button type="button" class="btn" data-cancel>Отмена</button>
               <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-confirm></button>`,
      onClose: () => { if (!settled) resolve(false); }
    });
    modal.body.querySelector('p').textContent = message;
    modal.foot.querySelector('[data-confirm]').textContent = confirmLabel;
    modal.foot.querySelector('[data-cancel]').addEventListener('click', () => { settled = true; modal.close(); resolve(false); });
    modal.foot.querySelector('[data-confirm]').addEventListener('click', () => { settled = true; modal.close(); resolve(true); });
  });
}

/* ---------- Formatting ---------- */
const numberFormat = new Intl.NumberFormat('ru-RU');

export const num = value => Number(value) || 0;
export const fmtNum = value => numberFormat.format(num(value));

export function fmtDate(unixSeconds) {
  const value = Number(unixSeconds);
  if (!value) return '—';
  return new Date(value * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(unixSeconds) {
  const value = Number(unixSeconds);
  if (!value) return '—';
  return new Date(value * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(day) {
  if (!day) return '—';
  const date = new Date(day + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return String(day);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export function fmtDuration(seconds) {
  const total = Math.max(0, Math.round(num(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return hours + ' ч ' + minutes + ' мин';
  if (minutes) return minutes + ':' + String(rest).padStart(2, '0');
  return rest + ' с';
}

export function fmtTrackDuration(seconds) {
  const total = Math.max(0, Math.round(num(seconds)));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

export function fmtBytes(bytes) {
  const value = num(bytes);
  if (!value) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let index = 0, size = value;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return (index === 0 ? size : size.toFixed(1)) + ' ' + units[index];
}

export function relTime(unixSeconds) {
  const value = Number(unixSeconds);
  if (!value) return '—';
  const diff = Math.round(Date.now() / 1000) - value;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' дн назад';
  return fmtDate(value);
}

/* ---------- DOM helpers ---------- */
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

export function debounce(fn, ms = 300) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html).trim();
  return template.content.firstElementChild;
}

/* ---------- Store ---------- */
export const store = {
  authed: false,
  status: null,
  overview: null,
  system: null
};

// CSP forbids inline event handlers, so all image fallbacks are delegated here.
export function initImageFallback() {
  if (document.body && !document.body.dataset.swayImageFallback) {
    document.body.dataset.swayImageFallback = '1';
    document.addEventListener('error', event => {
      const target = event.target;
      if (target instanceof HTMLImageElement) target.style.visibility = 'hidden';
    }, true);
  }
}

/* ---------- Misc ---------- */
export function toUnix(value) {
  if (!value) return 0;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? Math.floor(stamp / 1000) : 0;
}

export function fromUnix(value) {
  const stamp = Number(value);
  if (!stamp) return '';
  const date = new Date(stamp * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export function parseTrackIds(value) {
  return [...new Set(String(value || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean))];
}

export function initials(name) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}
