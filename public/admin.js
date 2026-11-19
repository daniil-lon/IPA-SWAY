// State & DOM elements
    const authScreen = document.getElementById('auth-screen');
    const authForm = document.getElementById('auth-form');
    const authPassword = document.getElementById('auth-password');
    const logoutBtn = document.getElementById('logout-btn');
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const toast = document.getElementById('admin-toast');

    function showToast(text, duration = 3000) {
      toast.textContent = text;
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, duration);
    }

    async function checkAuth() {
      // Check if Telegram WebApp initData is available
      if (window.Telegram?.WebApp?.initData) {
        try {
          const res = await fetch('/api/admin/telegram-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: Telegram.WebApp.initData })
          });
          if (res.ok) {
            authScreen.classList.add('hidden');
            loadOverview();
            return;
          }
        } catch {}
      }

      // Exchange a magic-link token for a session cookie before loading the panel.
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        window.history.replaceState({}, document.title, '/admin.html');
        try {
          await fetch('/api/admin/magic-login?token=' + encodeURIComponent(urlToken), { credentials: 'same-origin' });
        } catch {}
      }

      try {
        const res = await fetch('/api/admin/status');
        const data = await res.json();
        if (data.authenticated) {
          authScreen.classList.add('hidden');
          loadOverview();
        } else {
          authScreen.classList.remove('hidden');
        }
      } catch {
        authScreen.classList.remove('hidden');
      }
    }

    authForm.addEventListener('submit', async e => {
      e.preventDefault();
      const password = authPassword.value;
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          authScreen.classList.add('hidden');
          showToast('✅ Авторизация успешна');
          loadOverview();
        } else {
          alert(data.error || 'Ошибка входа');
        }
      } catch (err) {
        alert('Ошибка сети при входе');
      }
    });

    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.reload();
    });

    // Navigation Tabs
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        navTabs.forEach(t => t.classList.toggle('active', t === tab));
        tabContents.forEach(c => c.classList.toggle('hidden', c.id !== `tab-${target}`));
        if (target === 'promo') loadPromo();
        if (target === 'broadcasts') loadBroadcasts();
        if (target === 'editorial') loadEditorial();
      });
    });

    // 1. Overview
    async function loadOverview() {
      try {
        const res = await fetch('/api/admin/overview');
        if (!res.ok) return;
        const data = await res.json();
        if (data.stats) {
          document.getElementById('stat-tracks').textContent = data.stats.totalTracks.toLocaleString('ru-RU');
          document.getElementById('stat-listeners').textContent = data.stats.listeners.toLocaleString('ru-RU');
          document.getElementById('stat-lyrics').textContent = data.stats.lyricsSynced.toLocaleString('ru-RU');
          document.getElementById('stat-likes').textContent = data.stats.likes.toLocaleString('ru-RU');
        }
      } catch {}
    }
    document.getElementById('refresh-stats-btn')?.addEventListener('click', () => {
      loadOverview();
      showToast('Статистика обновлена');
    });

    document.getElementById('purge-cache-btn')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/admin/purge-cache', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || 'Кэш Cloudflare сброшен!');
      } catch {
        showToast('Ошибка при сбросе кэша');
      }
    });

    // 2. Promo Banner
    const promoTitle = document.getElementById('promo-title');
    const promoBadge = document.getElementById('promo-badge');
    const promoSub = document.getElementById('promo-subtitle');
    const promoCover = document.getElementById('promo-cover');
    const promoTarget = document.getElementById('promo-target');
    const promoActive = document.getElementById('promo-active');
    const promoId = document.getElementById('promo-id');

    function syncPromoPreview() {
      document.getElementById('preview-badge').textContent = promoBadge.value || 'ПРОМО';
      document.getElementById('preview-title').textContent = promoTitle.value || 'Заголовок промо';
      document.getElementById('preview-sub').textContent = promoSub.value || 'Описание';
    }
    [promoTitle, promoBadge, promoSub].forEach(el => el.addEventListener('input', syncPromoPreview));

    async function loadPromo() {
      try {
        const res = await fetch('/api/admin/promo');
        const data = await res.json();
        const b = data.banners?.[0];
        if (b) {
          promoId.value = b.id;
          promoTitle.value = b.title;
          promoBadge.value = b.badge || 'НОВИНКА';
          promoSub.value = b.subtitle || '';
          promoCover.value = b.cover_url || '';
          promoTarget.value = b.target_url || '#home';
          promoActive.checked = Boolean(b.is_active);
          syncPromoPreview();
        }
      } catch {}
    }

    document.getElementById('promo-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const body = {
        id: promoId.value || undefined,
        title: promoTitle.value,
        subtitle: promoSub.value,
        badge: promoBadge.value,
        cover_url: promoCover.value,
        target_url: promoTarget.value,
        is_active: promoActive.checked
      };
      try {
        const res = await fetch('/api/admin/promo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          showToast('✅ Промо-баннер сохранен и активен!');
          loadPromo();
        }
      } catch {}
    });

    document.getElementById('promo-delete-btn')?.addEventListener('click', async () => {
      if (promoId.value) {
        await fetch(`/api/admin/promo?id=${promoId.value}`, { method: 'DELETE' });
        promoTitle.value = '';
        promoSub.value = '';
        promoActive.checked = false;
        showToast('Промо-баннер удален');
      }
    });

    // 3. Broadcasts
    async function loadBroadcasts() {
      const container = document.getElementById('broadcasts-list');
      try {
        const res = await fetch('/api/admin/broadcasts');
        const data = await res.json();
        const items = data.broadcasts || [];
        if (!items.length) {
          container.innerHTML = '<p style="color: var(--text-muted); font-size: 14px;">Нет активных рассылок.</p>';
          return;
        }
        container.innerHTML = items.map(b => `
          <div class="list-item">
            <div class="item-info">
              <div class="item-title">${escapeHTML(b.title)}: ${escapeHTML(b.message)}</div>
              <div class="item-meta">
                <span>Уровень: <b>${b.level}</b></span>
                <span>Истекает: ${new Date(b.expires_at * 1000).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
            <button type="button" class="btn sm danger" data-delete-broadcast="${escapeHTML(b.id)}">Удалить</button>
          </div>
        `).join('');
      } catch {}
    }

    window.deleteBroadcast = async function(id) {
      if (!confirm('Удалить эту рассылку?')) return;
      await fetch(`/api/admin/broadcasts?id=${id}`, { method: 'DELETE' });
      showToast('Рассылка удалена');
      loadBroadcasts();
    };

    document.getElementById('broadcast-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const body = {
        title: document.getElementById('broad-title').value,
        level: document.getElementById('broad-level').value,
        message: document.getElementById('broad-msg').value,
        action_label: document.getElementById('broad-action-label').value,
        action_url: document.getElementById('broad-action-url').value
      };
      const res = await fetch('/api/admin/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        showToast('📢 Рассылка успешно отправлена!');
        document.getElementById('broad-msg').value = '';
        loadBroadcasts();
      }
    });

    // 4. Editorial Playlists
    async function loadEditorial() {
      const container = document.getElementById('editorial-list');
      try {
        const res = await fetch('/api/admin/editorial-playlists');
        const data = await res.json();
        const items = data.playlists || [];
        if (!items.length) {
          container.innerHTML = '<p style="color: var(--text-muted); font-size: 14px;">Нет созданных плейлистов от редакции.</p>';
          return;
        }
        container.innerHTML = items.map(p => `
          <div class="list-item">
            <div class="item-info">
              <div class="item-title">⭐ ${escapeHTML(p.title)} <span class="badge-tag">${escapeHTML(p.badge || 'Редакция')}</span></div>
              <div class="item-meta">
                <span>Треков: <b>${p.track_ids?.length || 0}</b></span>
                <span>Статус: <b>${p.is_published ? 'Опубликован' : 'Черновик'}</b></span>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn sm" data-edit-editorial="${escapeHTML(JSON.stringify(p))}">Изменить</button>
              <button type="button" class="btn sm danger" data-delete-editorial="${escapeHTML(p.id)}">Удалить</button>
            </div>
          </div>
        `).join('');
      } catch {}
    }

    window.editEditorial = function(p) {
      document.getElementById('edit-id').value = p.id;
      document.getElementById('edit-title').value = p.title;
      document.getElementById('edit-badge').value = p.badge || 'Редакция';
      document.getElementById('edit-desc').value = p.description || '';
      document.getElementById('edit-cover').value = p.cover_url || '';
      document.getElementById('edit-order').value = p.sort_order || 0;
      document.getElementById('edit-tracks').value = (p.track_ids || []).join(', ');
      document.getElementById('edit-published').checked = Boolean(p.is_published);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.deleteEditorial = async function(id) {
      if (!confirm('Удалить плейлист редакции?')) return;
      await fetch(`/api/admin/editorial-playlists?id=${id}`, { method: 'DELETE' });
      showToast('Плейлист удален');
      loadEditorial();
    };

    document.getElementById('editorial-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const rawTracks = document.getElementById('edit-tracks').value;
      const trackIds = rawTracks.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const body = {
        id: document.getElementById('edit-id').value || undefined,
        title: document.getElementById('edit-title').value,
        badge: document.getElementById('edit-badge').value,
        description: document.getElementById('edit-desc').value,
        cover_url: document.getElementById('edit-cover').value,
        sort_order: Number(document.getElementById('edit-order').value) || 0,
        track_ids: trackIds,
        is_published: document.getElementById('edit-published').checked
      };
      const res = await fetch('/api/admin/editorial-playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        showToast('⭐ Плейлист редакции сохранен!');
        loadEditorial();
      }
    });

    // 5. Lyrics Editor
    document.getElementById('lyrics-load-btn')?.addEventListener('click', async () => {
      const trackId = document.getElementById('lyrics-track-id').value.trim();
      if (!trackId) return alert('Введите ID трека');
      try {
        const res = await fetch(`/api/admin/lyrics?trackId=${encodeURIComponent(trackId)}`);
        const data = await res.json();
        document.getElementById('lyrics-editor-form').classList.remove('hidden');
        if (data.lyrics) {
          document.getElementById('lyrics-lrc-text').value = data.lyrics.lyrics_lrc || data.lyrics.lyrics_plain || '';
          document.getElementById('lyrics-is-synced').checked = Boolean(data.lyrics.is_synced);
        } else {
          document.getElementById('lyrics-lrc-text').value = '';
          document.getElementById('lyrics-is-synced').checked = true;
          showToast('Для этого трека еще нет текста. Можете добавить его сейчас.');
        }
      } catch {
        alert('Ошибка при загрузке текста');
      }
    });

    document.getElementById('lyrics-editor-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const trackId = document.getElementById('lyrics-track-id').value.trim();
      const lrc = document.getElementById('lyrics-lrc-text').value.trim();
      const isSynced = document.getElementById('lyrics-is-synced').checked;
      const res = await fetch('/api/admin/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: trackId,
          lyrics_lrc: lrc,
          lyrics_plain: lrc.replace(/\[\d+:\d+\.\d+\]/g, '').trim(),
          is_synced: isSynced
        })
      });
      if (res.ok) {
        showToast('🎙 Караоке сохранено в D1!');
      }
    });

    function escapeHTML(str) {
      if (!str) return '';
      return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }

    // Initialize
    checkAuth();
  
document.addEventListener('click',event=>{const b=event.target.closest('[data-delete-broadcast],[data-edit-editorial],[data-delete-editorial]');if(!b)return;if(b.dataset.deleteBroadcast)window.deleteBroadcast(b.dataset.deleteBroadcast);if(b.dataset.deleteEditorial)window.deleteEditorial(b.dataset.deleteEditorial);if(b.dataset.editEditorial){try{window.editEditorial(JSON.parse(b.dataset.editEditorial));}catch{}}});
