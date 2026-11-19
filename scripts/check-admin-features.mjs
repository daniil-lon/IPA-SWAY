import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { servePlayer, track, nextTrack } from './player-fixture.mjs';
import {
  adminRoute,
  handlePublicPromo,
  handlePublicEditorialPlaylists,
  handlePublicActiveBroadcasts,
  handleTelegramWebhook,
  setAdminPassword
} from '../admin-store.mjs';

console.log('Testing Admin & Editorial Features...');

// Mock in-memory SQLite / D1 database for testing
class MockD1 {
  constructor() {
    this.tables = {
      admin_config: new Map(),
      admin_sessions: new Map(),
      admin_attempts: [],
      promo_banners: new Map(),
      editorial_playlists: new Map(),
      broadcast_messages: new Map(),
      track_lyrics: new Map(),
      users: new Map(),
      likes: [],
      playlists: new Map()
    };
  }

  prepare(query) {
    const q = query.replace(/\s+/g, ' ').trim();
    const self = this;
    const makeExec = (params = []) => ({
      async first() {
        if (q.includes('FROM admin_config WHERE key =')) {
          const k = params[0];
          const val = self.tables.admin_config.get(k);
          return val ? { value: val } : null;
        }
        if (q.includes('FROM admin_sessions WHERE token =')) {
          const tok = params[0];
          return self.tables.admin_sessions.get(tok) || null;
        }
        if (q.includes('COUNT(*) as c FROM users')) return { c: 42 };
        if (q.includes('COUNT(*) as c FROM likes')) return { c: 150 };
        if (q.includes('COUNT(*) as c FROM playlists')) return { c: 8 };
        if (q.includes('COUNT(*) as c FROM custom_tracks')) return { c: 3 };
        if (q.includes('COUNT(*) as c FROM track_lyrics WHERE is_synced = 1')) return { c: 2750 };
        if (q.includes('COUNT(*) as c FROM track_lyrics')) return { c: 4054 };
        if (q.includes('COUNT(*) as c FROM promo_banners')) return { c: 1 };
        if (q.includes('COUNT(*) as c FROM broadcast_messages')) return { c: 2 };
        if (q.includes('FROM promo_banners WHERE is_active = 1')) {
          for (const b of self.tables.promo_banners.values()) {
            if (b.is_active) return b;
          }
          return null;
        }
        if (q.includes('FROM track_lyrics WHERE track_id =')) {
          return self.tables.track_lyrics.get(params[0]) || null;
        }
        return null;
      },
      async all() {
        if (q.includes('FROM editorial_playlists')) {
          return { results: Array.from(self.tables.editorial_playlists.values()) };
        }
        if (q.includes('FROM promo_banners')) {
          return { results: Array.from(self.tables.promo_banners.values()) };
        }
        if (q.includes('FROM broadcast_messages')) {
          return { results: Array.from(self.tables.broadcast_messages.values()) };
        }
        return { results: [] };
      },
      async run() {
        if (q.includes('INSERT INTO admin_config')) {
          self.tables.admin_config.set(params[0], params[1]);
          return { success: true };
        }
        if (q.includes('INSERT INTO admin_sessions')) {
          self.tables.admin_sessions.set(params[0], { token: params[0], created_at: params[1], expires_at: params[2] });
          return { success: true };
        }
        if (q.includes('INSERT INTO promo_banners')) {
          self.tables.promo_banners.set(params[0], {
            id: params[0],
            title: params[1],
            subtitle: params[2],
            badge: params[3],
            cover_url: params[4],
            target_url: params[5],
            is_active: params[6],
            updated_at: params[8]
          });
          return { success: true };
        }
        if (q.includes('UPDATE promo_banners SET is_active = 0')) {
          for (const [k, v] of self.tables.promo_banners.entries()) {
            if (k !== params[0]) v.is_active = 0;
          }
          return { success: true };
        }
        if (q.includes('INSERT INTO editorial_playlists')) {
          self.tables.editorial_playlists.set(params[0], {
            id: params[0],
            slug: params[1],
            title: params[2],
            description: params[3],
            cover_url: params[4],
            badge: params[5],
            track_ids: params[6],
            is_published: params[7],
            sort_order: params[8],
            updated_at: params[10]
          });
          return { success: true };
        }
        if (q.includes('INSERT INTO broadcast_messages')) {
          self.tables.broadcast_messages.set(params[0], {
            id: params[0],
            title: params[1],
            message: params[2],
            level: params[3],
            action_label: params[4],
            action_url: params[5],
            expires_at: params[6],
            created_at: params[7]
          });
          return { success: true };
        }
        if (q.includes('INSERT INTO track_lyrics')) {
          self.tables.track_lyrics.set(params[0], {
            track_id: params[0],
            lyrics_lrc: params[1],
            lyrics_plain: params[2],
            is_synced: params[3]
          });
          return { success: true };
        }
        return { success: true };
      }
    });

    const exec = makeExec();
    exec.bind = (...params) => makeExec(params);
    return exec;
  }
}

const mockDb = new MockD1();
const mockEnv = {
  DB: mockDb,
  ADMIN_KEY: 'test-admin-secret-2026',
  TELEGRAM_BOT_TOKEN: '123456:TEST_BOT_TOKEN',
  ADMIN_TELEGRAM_CHAT_ID: '987654321'
};

const catalog = [
  { ...track, audio: '/media/test-tone.wav' },
  { ...nextTrack, audio: '/media/test-next.wav' }
];

const { server, origin } = await servePlayer({
  catalog,
  handler: async (req, res, path) => {
    const url = new URL(req.url, origin);
    const method = req.method;

    if (path.startsWith('/api/admin/')) {
      const fReq = new Request(origin + path, {
        method,
        headers: req.headers,
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? req : undefined,
        duplex: 'half'
      });
      const response = await adminRoute(fReq, path, method, url, mockEnv, catalog.length);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
      return true;
    }

    if (path === '/api/promo' && method === 'GET') {
      const response = await handlePublicPromo(mockEnv);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
      return true;
    }

    if (path === '/api/editorial-playlists' && method === 'GET') {
      const response = await handlePublicEditorialPlaylists(mockEnv);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
      return true;
    }

    if (path === '/api/broadcasts/active' && method === 'GET') {
      const response = await handlePublicActiveBroadcasts(mockEnv);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
      return true;
    }

    if (path === '/api/account') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user: { id: 'test-user', name: 'Tester' }, loginRequired: false, configured: false }));
      return true;
    }
  }
});

try {
  // 1. Password login test
  console.log('1. Testing /api/admin/login...');
  const loginRes = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-admin-secret-2026' })
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.ok(loginData.success);
  assert.ok(loginData.token);
  const adminCookie = loginRes.headers.get('set-cookie');
  console.log('PASS: /api/admin/login');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Cookie': adminCookie
  };

  // 2. Overview metrics test
  console.log('2. Testing /api/admin/overview...');
  const overRes = await fetch(`${origin}/api/admin/overview`, { headers: authHeaders });
  assert.equal(overRes.status, 200);
  const overData = await overRes.json();
  assert.equal(overData.stats.listeners, 42);
  assert.equal(overData.stats.likes, 150);
  assert.equal(overData.stats.lyricsSynced, 2750);
  console.log('PASS: /api/admin/overview');

  // 3. Promo Banner CRUD & Public endpoint test
  console.log('3. Testing Promo Banner CRUD & /api/promo...');
  const promoRes = await fetch(`${origin}/api/admin/promo`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Премьеры осени',
      subtitle: 'Главные хиты недели',
      badge: 'ПРЕМЬЕРА',
      cover_url: '/art/logo.svg',
      target_url: '#discover/releases',
      is_active: true
    })
  });
  assert.equal(promoRes.status, 200);

  // Check public endpoint
  const pubPromoRes = await fetch(`${origin}/api/promo`);
  assert.equal(pubPromoRes.status, 200);
  const pubPromoData = await pubPromoRes.json();
  assert.ok(pubPromoData.promo);
  assert.equal(pubPromoData.promo.title, 'Премьеры осени');
  assert.equal(pubPromoData.promo.badge, 'ПРЕМЬЕРА');
  console.log('PASS: Promo Banner CRUD & /api/promo');

  // 4. Editorial Playlists CRUD & Public endpoint test
  console.log('4. Testing Editorial Playlists CRUD & /api/editorial-playlists...');
  const editRes = await fetch(`${origin}/api/admin/editorial-playlists`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Выбор редакции',
      description: 'Топ 10 треков недели',
      badge: 'Редакция',
      cover_url: '/art/logo.svg',
      track_ids: [track.id, nextTrack.id],
      is_published: true,
      sort_order: 1
    })
  });
  assert.equal(editRes.status, 200);

  // Check public endpoint
  const pubEditRes = await fetch(`${origin}/api/editorial-playlists`);
  assert.equal(pubEditRes.status, 200);
  const pubEditData = await pubEditRes.json();
  assert.equal(pubEditData.playlists.length, 1);
  assert.equal(pubEditData.playlists[0].title, 'Выбор редакции');
  assert.deepEqual(pubEditData.playlists[0].trackIds, [track.id, nextTrack.id]);
  console.log('PASS: Editorial Playlists & /api/editorial-playlists');

  // 5. Broadcast Announcement test
  console.log('5. Testing Broadcast Messages & /api/broadcasts/active...');
  const broadRes = await fetch(`${origin}/api/admin/broadcasts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Внимание',
      message: 'Сервис обновлен! Доступен офлайн кэш и караоке',
      level: 'success',
      action_label: 'Смотреть',
      action_url: '#settings',
      duration_days: 2
    })
  });
  assert.equal(broadRes.status, 200);

  // Check public endpoint
  const pubBroadRes = await fetch(`${origin}/api/broadcasts/active`);
  assert.equal(pubBroadRes.status, 200);
  const pubBroadData = await pubBroadRes.json();
  assert.equal(pubBroadData.broadcasts.length, 1);
  assert.equal(pubBroadData.broadcasts[0].message, 'Сервис обновлен! Доступен офлайн кэш и караоке');
  console.log('PASS: Broadcasts & /api/broadcasts/active');

  // 6. Lyrics Editor test
  console.log('6. Testing Lyrics Editor API...');
  const lrcText = '[00:04.10] Первое слово\n[00:08.50] Второе слово';
  const lyricsSaveRes = await fetch(`${origin}/api/admin/lyrics`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      track_id: track.id,
      lyrics_lrc: lrcText,
      lyrics_plain: 'Первое слово\nВторое слово',
      is_synced: true
    })
  });
  assert.equal(lyricsSaveRes.status, 200);

  const lyricsGetRes = await fetch(`${origin}/api/admin/lyrics?trackId=${track.id}`, { headers: authHeaders });
  assert.equal(lyricsGetRes.status, 200);
  const lyricsGetData = await lyricsGetRes.json();
  assert.equal(lyricsGetData.lyrics.lyrics_lrc, lrcText);
  assert.equal(lyricsGetData.lyrics.is_synced, 1);
  console.log('PASS: Lyrics Editor API');

  // 7. Telegram Webhook simulation
  console.log('7. Testing Telegram Bot Webhook...');
  const tgUpdate = {
    message: {
      chat: { id: 987654321 },
      text: '/stats'
    }
  };
  const tgReq = new Request(origin + '/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tgUpdate)
  });
  const tgRes = await handleTelegramWebhook(tgReq, mockEnv, catalog.length);
  assert.equal(tgRes.status, 200);
  console.log('PASS: Telegram Webhook /stats');

  // 8. End-to-end Browser Verification
  console.log('8. Testing Browser rendering of Admin Portal & Listener UI...');
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test admin portal
  await page.goto(origin + '/admin.html');
  await page.locator('#auth-password').fill('test-admin-secret-2026');
  await page.locator('#auth-form button[type=submit]').click();
  await page.locator('#auth-screen').waitFor({ state: 'hidden' });
  assert.ok(await page.getByText('Обзор и метрики').isVisible());

  // Click on Promo tab
  await page.getByRole('button', { name: '✨ Промо-баннер' }).click();
  assert.ok(await page.locator('#promo-form').isVisible());
  await page.waitForFunction(() => document.getElementById('promo-title')?.value === 'Премьеры осени');
  assert.equal(await page.locator('#promo-title').inputValue(), 'Премьеры осени');

  // Click on Broadcasts tab
  await page.getByRole('button', { name: '📢 Рассылки' }).click();
  await page.getByText('Сервис обновлен! Доступен офлайн кэш и караоке').waitFor();
  assert.ok(await page.getByText('Сервис обновлен! Доступен офлайн кэш и караоке').isVisible());

  // Click on Editorial tab
  await page.getByRole('button', { name: '⭐ Плейлисты редакции' }).click();
  await page.getByText('Выбор редакции').first().waitFor();
  assert.ok(await page.getByText('Выбор редакции').first().isVisible());

  // Now open the listener player home page and verify promo card & broadcast toast appear!
  const listenerPage = await context.newPage();
  listenerPage.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  listenerPage.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await listenerPage.goto(origin + '/#home');

  // Wait for splash to disappear
  await listenerPage.locator('.sway-splash').waitFor({ state: 'hidden' }).catch(() => {});

  // Verify Broadcast Toast appears
  await listenerPage.locator('.sway-broadcast-toast').waitFor();
  assert.ok(await listenerPage.getByText('Сервис обновлен! Доступен офлайн кэш и караоке').isVisible());
  console.log('PASS: Listener UI receives Broadcast Toast');

  // Dismiss broadcast toast
  await listenerPage.locator('.sway-broadcast-close').dispatchEvent('click');
  await listenerPage.locator('.sway-broadcast-toast').waitFor({ state: 'detached' });

  // Verify Promo Card rendered on Home
  console.log('#main html:', (await listenerPage.locator('#main').innerHTML().catch(e => e.message)).slice(0, 500));
  console.log('body innerHTML sample:', (await listenerPage.content()).slice(0, 500));
  await listenerPage.locator('.sway-promo-card').waitFor();
  assert.ok(await listenerPage.getByText('Премьеры осени').isVisible());
  assert.ok(await listenerPage.getByText('ПРЕМЬЕРА').isVisible());
  console.log('PASS: Listener UI displays Promo Banner');

  // Verify Editorial Shelf rendered on Home
  await listenerPage.locator('.sway-editorial-card').waitFor();
  assert.ok(await listenerPage.getByText('Выбор редакции').first().isVisible());
  console.log('PASS: Listener UI displays Editorial Playlists shelf');

  await browser.close();

  console.log('\n🎉 ALL ADMIN, EDITORIAL, PROMO & BROADCAST TESTS PASSED WITH 100% SUCCESS!');
} finally {
  server.close();
}
