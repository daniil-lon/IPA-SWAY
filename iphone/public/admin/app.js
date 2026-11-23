import { api, on, toast, errorToast, store, initImageFallback } from './core.js';
import { render as renderOverview } from './sections/overview.js';
import { render as renderCatalog } from './sections/catalog.js';
import { render as renderLyrics } from './sections/lyrics.js';
import { render as renderContent } from './sections/content.js';
import { render as renderAnalytics } from './sections/analytics.js';
import { render as renderUsers } from './sections/users.js';
import { render as renderSettings } from './sections/settings.js';

const VIEWS = { overview: renderOverview, catalog: renderCatalog, lyrics: renderLyrics, content: renderContent, analytics: renderAnalytics, users: renderUsers, settings: renderSettings };
const DEFAULT_VIEW = 'overview';

const authScreen = document.getElementById('auth-screen');
const authForm = document.getElementById('auth-form');
const authPassword = document.getElementById('auth-password');
const authSubtitle = document.getElementById('auth-subtitle');
const adminShell = document.getElementById('admin-shell');
const viewRoot = document.getElementById('view');
const viewTitle = document.getElementById('view-title');
const viewCrumb = document.getElementById('view-crumb');
const nav = document.getElementById('nav');
const logoutBtn = document.getElementById('logout-btn');
const menuBtn = document.getElementById('menu-btn');

let currentView = null;
let currentCleanup = null;
let booted = false;

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  document.body.classList.remove('nav-open');
}

function showAuth(message) {
  adminShell.hidden = true;
  authScreen.hidden = false;
  authScreen.classList.remove('hidden');
  if (message) authSubtitle.textContent = message;
  setTimeout(() => authPassword?.focus(), 60);
}

function showPanel() {
  authScreen.hidden = true;
  authScreen.classList.add('hidden');
  adminShell.hidden = false;
}

async function navigate(view, { push = true, force = false } = {}) {
  const section = VIEWS[view] ? view : DEFAULT_VIEW;
  if (currentView === section && !push && !force) return;

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (error) { console.error(error); }
    currentCleanup = null;
  }

  currentView = section;
  setActiveNav(section);
  viewTitle.textContent = VIEWS[section].title || section;
  viewCrumb.textContent = VIEWS[section].crumb || 'Sway Music';
  viewRoot.replaceChildren();
  viewRoot.scrollTop = 0;
  window.scrollTo({ top: 0 });

  if (push) {
    const hash = '#' + section;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }

  try {
    currentCleanup = await VIEWS[section](viewRoot);
  } catch (error) {
    console.error(error);
    errorToast(error);
    viewRoot.innerHTML = '<div class="card"><div class="empty"><strong>Раздел не загрузился</strong>' +
      '<span>Проверьте соединение и попробуйте ещё раз.</span><br><br>' +
      '<button class="btn" type="button" data-retry>Повторить</button></div></div>';
    viewRoot.querySelector('[data-retry]')?.addEventListener('click', () => navigate(section, { push: false, force: true }));
  }
}

async function refreshBadges() {
  try {
    const data = await api('/api/admin/catalog/facets');
    const badge = document.getElementById('badge-catalog');
    if (badge && data?.missing) badge.textContent = String(data.missing);
    store.facets = data;
  } catch {}
}

async function boot() {
  if (booted) return;
  booted = true;

  // Telegram Mini App auth
  if (window.Telegram?.WebApp?.initData) {
    try {
      await api('/api/admin/telegram-auth', { method: 'POST', body: { initData: window.Telegram.WebApp.initData } });
    } catch {}
  }

  // Magic link: exchange the one-time token for a session cookie.
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    window.history.replaceState({}, document.title, '/admin.html');
    try {
      await fetch('/api/admin/magic-login?token=' + encodeURIComponent(urlToken), { credentials: 'same-origin' });
    } catch {}
  }

  try {
    const status = await api('/api/admin/status');
    store.status = status;
    if (status.authenticated) {
      showPanel();
      const initial = (window.location.hash || '').replace('#', '') || DEFAULT_VIEW;
      await navigate(initial, { push: false });
      refreshBadges();
    } else {
      showAuth(status.configured ? undefined : 'Пароль ещё не настроен. Используйте /api/admin/setup или Telegram-бота.');
      if (!status.configured) authForm.querySelector('button[type="submit"]').disabled = true;
    }
  } catch (error) {
    showAuth('Сервер недоступен. Попробуйте позже.');
  }
}

authForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = authForm.querySelector('button[type="submit"]');
  const password = authPassword.value;
  if (!password) return;
  button.disabled = true;
  button.textContent = 'Проверяем…';
  try {
    await api('/api/admin/login', { method: 'POST', body: { password } });
    authPassword.value = '';
    showPanel();
    toast('Добро пожаловать в Sway Admin');
    await navigate(DEFAULT_VIEW, { push: false });
    refreshBadges();
  } catch (error) {
    errorToast(error);
    authPassword.select();
  } finally {
    button.disabled = false;
    button.textContent = 'Войти в панель';
  }
});

logoutBtn?.addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
  window.location.reload();
});

nav?.addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  navigate(button.dataset.view);
});

menuBtn?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.addEventListener('click', event => {
  if (!document.body.classList.contains('nav-open')) return;
  if (event.target.closest('#sidebar') || event.target.closest('#menu-btn')) return;
  document.body.classList.remove('nav-open');
});

window.addEventListener('hashchange', () => {
  const view = (window.location.hash || '').replace('#', '') || DEFAULT_VIEW;
  navigate(view, { push: false });
});

on('unauthorized', () => {
  store.authed = false;
  showAuth('Сессия истекла. Войдите заново.');
});

boot();
initImageFallback();
