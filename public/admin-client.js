// Sway Client Integration for Editorial Playlists, Promo Banners & Broadcasts

let activePromo = null;
let activeBroadcasts = [];
let editorialPlaylists = [];

export async function initAdminClient({ onToast, onOpenPlaylist } = {}) {
  try {
    // 1. Fetch active broadcasts and show if any are new
    fetchBroadcasts({ onToast });

    // 2. Pre-fetch promo and editorial playlists
    await Promise.allSettled([
      fetchPromo(),
      fetchEditorial()
    ]);

    // 3. Render promo if container exists
    renderPromo();
    // 4. Render editorial if container exists
    renderEditorial(onOpenPlaylist);
  } catch (e) {
    console.debug('Admin client init:', e?.message);
  }
}

export async function fetchPromo() {
  try {
    const res = await fetch('/api/promo');
    if (!res.ok) return null;
    const data = await res.json();
    activePromo = data.promo || null;
    return activePromo;
  } catch {
    return null;
  }
}

export function renderPromo(targetContainer) {
  const container = targetContainer || document.getElementById('sway-promo-slot');
  if (!container) return;
  if (!activePromo) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <aside class="sway-promo-card glass" data-target="${escapeAttr(safeHref(activePromo.target_url, '#home'))}">
      ${activePromo.cover_url ? `<img src="${escapeAttr(activePromo.cover_url)}" alt="" class="sway-promo-art">` : ''}
      <div class="sway-promo-info">
        <span class="sway-promo-badge">${escapeHTML(activePromo.badge || 'ПРОМО')}</span>
        <h4 class="sway-promo-title">${escapeHTML(activePromo.title)}</h4>
        ${activePromo.subtitle ? `<p class="sway-promo-sub">${escapeHTML(activePromo.subtitle)}</p>` : ''}
      </div>
      <button type="button" class="btn primary sm sway-promo-action">Открыть</button>
    </aside>
  `;

  container.querySelector('.sway-promo-card')?.addEventListener('click', e => {
    const target = activePromo.target_url || '#home';
    if (target.startsWith('#')) {
      location.hash = target;
    } else {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  });
}

export async function fetchBroadcasts({ onToast } = {}) {
  try {
    const res = await fetch('/api/broadcasts/active');
    if (!res.ok) return [];
    const data = await res.json();
    activeBroadcasts = data.broadcasts || [];

    // Show non-dismissed broadcasts
    for (const b of activeBroadcasts) {
      const dismissKey = `sway.broadcast.dismissed.${b.id}`;
      if (localStorage.getItem(dismissKey)) continue;

      showBroadcastToast(b);
      break; // Show one at a time so user isn't overwhelmed
    }
    return activeBroadcasts;
  } catch {
    return [];
  }
}

function showBroadcastToast(b) {
  if (document.getElementById(`broadcast-${b.id}`)) return;

  const toast = document.createElement('aside');
  toast.id = `broadcast-${b.id}`;
  const level = ['info', 'warning', 'success', 'critical', 'danger'].includes(b.level) ? b.level : 'info';
  toast.className = `sway-broadcast-toast glass sway-level-${level}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="sway-broadcast-badge">📢</div>
    <div class="sway-broadcast-content">
      <strong class="sway-broadcast-title">${escapeHTML(b.title || 'Объявление')}</strong>
      <p class="sway-broadcast-msg">${escapeHTML(b.message)}</p>
      ${b.action_label ? `<a href="${escapeAttr(safeHref(b.action_url, '#home'))}" class="btn sm primary sway-broadcast-btn">${escapeHTML(b.action_label)}</a>` : ''}
    </div>
    <button type="button" class="btn icon sway-broadcast-close" aria-label="Закрыть">&times;</button>
  `;

  document.body.appendChild(toast);

  const dismiss = () => {
    try { localStorage.setItem(`sway.broadcast.dismissed.${b.id}`, '1'); } catch {}
    toast.style.display = 'none';
    toast.remove();
  };

  toast.querySelector('.sway-broadcast-close')?.addEventListener('click', dismiss);
  toast.querySelector('.sway-broadcast-btn')?.addEventListener('click', () => {
    dismiss();
  });
}

export async function fetchEditorial() {
  try {
    const res = await fetch('/api/editorial-playlists');
    if (!res.ok) return [];
    const data = await res.json();
    editorialPlaylists = data.playlists || [];
    return editorialPlaylists;
  } catch {
    return [];
  }
}

export function getEditorialPlaylists() {
  return editorialPlaylists;
}

export function renderEditorial(onOpenPlaylist, targetContainer) {
  const container = targetContainer || document.getElementById('sway-editorial-slot');
  if (!container) return;
  if (!editorialPlaylists.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="sway-editorial-header">
      <span class="badge-tag">От редакции</span>
      <h3 class="sway-editorial-heading">Выбор и премьеры</h3>
    </div>
    <div class="sway-editorial-grid">
      ${editorialPlaylists.map(p => `
        <article class="sway-editorial-card glass" data-editorial-id="${escapeAttr(p.id)}">
          <div class="sway-editorial-art">
            <img src="${escapeAttr(p.cover || '/art/logo.svg')}" alt="" loading="lazy">
            <span class="sway-editorial-badge">${escapeHTML(p.badge || 'Редакция')}</span>
          </div>
          <div class="sway-editorial-info">
            <strong class="sway-editorial-title">${escapeHTML(p.title)}</strong>
            <p class="sway-editorial-desc">${escapeHTML(p.description || (p.tracksCount + ' треков'))}</p>
          </div>
          <button type="button" class="btn primary sm sway-editorial-play" data-play-editorial="${escapeAttr(p.id)}" aria-label="Слушать ${escapeAttr(p.title)}">Слушать</button>
        </article>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('[data-editorial-id]').forEach(card => {
    card.addEventListener('click', e => {
      const id = card.dataset.editorialId;
      const playlist = editorialPlaylists.find(p => p.id === id);
      if (playlist && onOpenPlaylist) {
        onOpenPlaylist(playlist);
      }
    });
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

function safeHref(value, fallback = '#') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:/i.test(raw) ? fallback : raw;
}
