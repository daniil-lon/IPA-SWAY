import { json, readJSON } from './profile-store.mjs';
import { audit, flags, setFlag, overview, analytics, auditList, systemInfo, exportTable, purgeCache } from './admin-ops.mjs';
import { catalogAdminRoute } from './admin-catalog.mjs';
import { lyricsAdminRoute } from './admin-lyrics.mjs';
import { usersAdminRoute } from './admin-users.mjs';
import { uploadsAdminRoute } from './admin-uploads.mjs';

const adminCookieName = 'sway_admin_token';
const now = () => Math.floor(Date.now() / 1000);
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unbase64 = value => {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
};
const hash = async v => base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));

// Admin passwords are stored as salted PBKDF2-SHA256. Legacy salted and unsalted
// SHA-256 values are still accepted once and upgraded on the next successful login.
const PASSWORD_SCHEME = 'pbkdf2';
const PASSWORD_ITERATIONS = 100000;
async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return base64(new Uint8Array(bits));
}
async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${base64(salt)}$${await derivePassword(password, salt, PASSWORD_ITERATIONS)}`;
}
async function matchesPasswordHash(password, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  const parts = stored.split('$');
  if (parts.length === 4 && parts[0] === PASSWORD_SCHEME) {
    const iterations = Number(parts[1]);
    if (!Number.isSafeInteger(iterations) || iterations < 10000 || iterations > 1000000) return false;
    try {
      return safeEqual(await derivePassword(password, unbase64(parts[2]), iterations), parts[3]);
    } catch {
      return false;
    }
  }
  return safeEqual(await hash(password), stored) || safeEqual(await hash('sway_salt_' + password), stored);
}

function cookieValue(req, name) {
  return req.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
}

function adminCookie(url, value, age) {
  return `${adminCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0].trim() || '127.0.0.1';
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = new TextEncoder().encode(a), bBuf = new TextEncoder().encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) diff |= aBuf[i] ^ bBuf[i];
  return diff === 0;
}

export async function hasAdminPassword(env) {
  if (env.ADMIN_KEY && typeof env.ADMIN_KEY === 'string' && env.ADMIN_KEY.trim().length >= 6) {
    return true;
  }
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT value FROM admin_config WHERE key = 'master_password_hash'").first();
  return Boolean(row?.value);
}

export async function verifyPassword(password, env) {
  if (typeof password !== 'string' || !password) return false;
  if (env.ADMIN_KEY && safeEqual(password, env.ADMIN_KEY)) return true;
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT value FROM admin_config WHERE key = 'master_password_hash'").first();
  if (!row?.value) return false;
  const ok = await matchesPasswordHash(password, row.value);
  if (ok && !row.value.startsWith(PASSWORD_SCHEME + '$')) {
    try { await setAdminPassword(password, env); } catch (e) { console.error('Password upgrade failed', e?.message); }
  }
  return ok;
}

export async function setAdminPassword(password, env) {
  if (!env.DB || typeof password !== 'string' || password.length < 8) return false;
  const h = await createPasswordHash(password);
  await env.DB.prepare(`
    INSERT INTO admin_config (key, value, updated_at) VALUES ('master_password_hash', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(h, now()).run();
  return true;
}

export async function verifyAdminSession(req, env) {
  const token = cookieValue(req, adminCookieName) || req.headers.get('X-Admin-Token');
  if (!token) return false;
  if (!/^[A-Za-z0-9_-]{43,64}$/.test(token)) return false;
  if (!env.DB) return false;
  try {
    const hashed = await hash(token);
    const row = await env.DB.prepare("SELECT * FROM admin_sessions WHERE hash = ? LIMIT 1").bind(hashed).first();
    const expiry = Number(row?.expiry ?? row?.expires_at);
    if (!row || !Number.isFinite(expiry) || expiry < now()) return false;
    return true;
  } catch (e) {
    console.error('verifyAdminSession error', e);
    return false;
  }
}

async function createAdminSession(env, maxAge = 86400 * 7) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = now() + maxAge;
  if (env.DB) {
    const hashed = await hash(token);
    try {
      // Canonical schema (migrations/0003): only the hash is persisted.
      await env.DB.prepare("INSERT INTO admin_sessions (hash, created_at, expiry) VALUES (?, ?, ?)")
        .bind(hashed, now(), expiresAt).run();
    } catch {
      // Compatibility with deployments whose table still requires the legacy plaintext column.
      await env.DB.prepare("INSERT INTO admin_sessions (token, hash, created_at, expiry, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(token, hashed, now(), expiresAt, expiresAt).run();
    }
  }
  return { token, maxAge };
}

// Telegram WebApp initData HMAC verification
async function verifyTelegramWebAppData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const stamp=Number(params.get('auth_date'));if(!Number.isFinite(stamp)||Math.abs(now()-stamp)>300)return null;
  const hashVal = params.get('hash');
  if (!hashVal) return null;
  params.delete('hash');

  const pairs = [];
  for (const [k, v] of params.entries()) {
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretBytes = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));
  const dataKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const calcSig = await crypto.subtle.sign('HMAC', dataKey, enc.encode(dataCheckString));
  const hex = Array.from(new Uint8Array(calcSig)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (hex.toLowerCase() === hashVal.toLowerCase()) {
    const userRaw = params.get('user');
    return userRaw ? JSON.parse(userRaw) : { id: 'unknown' };
  }
  return null;
}

// Playback, history and catalogue requests all ask for uploads; reading the whole table each time
// was a steady D1 cost. Admin writes call clearCustomTracksCache(), so edits still show at once here.
let customCache = null;
export function clearCustomTracksCache() { customCache = null; }
export async function getCustomTracks(env) {
  if (!env.DB) return [];
  if (customCache?.db === env.DB && customCache.until > Date.now()) return customCache.tracks;
  try {
    const { results } = await env.DB.prepare("SELECT * FROM custom_tracks ORDER BY created_at DESC").all();
    const tracks = (results || []).map(r => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      genre: r.genre || 'pop',
      audio: `/api/custom-media/${r.id}.mp3`,
      art: r.art || '/art/logo.svg',
      bytes: r.bytes || 0,
      seconds: r.seconds || 0,
      moods: r.moods ? JSON.parse(r.moods) : []
    }));
    customCache = { db: env.DB, tracks, until: Date.now() + 300000 };
    return tracks;
  } catch {
    return [];
  }
}

export async function serveCustomMedia(req, path, env, { private: isPrivate = false } = {}) {
  const match = path.match(/^\/api\/custom-media\/([a-zA-Z0-9_-]+)\.mp3$/);
  if (!match || !env.DB) return new Response('Not Found', { status: 404 });
  const trackId = match[1];

  // R2 is the preferred store for admin uploads; D1 chunks remain as a fallback
  // for deployments that do not have a MEDIA_BUCKET binding.
  if (env.MEDIA_BUCKET) {
    try {
      const key = 'custom/' + trackId + '.mp3';
      const range = req.headers.get('Range');
      if (req.method === 'HEAD') {
        const head = await env.MEDIA_BUCKET.head(key);
        if (!head) return new Response('Not Found', { status: 404 });
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(head.size),
            'Accept-Ranges': 'bytes',
            'Cache-Control': isPrivate ? 'private, no-store' : 'public, max-age=31536000'
          }
        });
      }
      const object = await env.MEDIA_BUCKET.get(key, range ? { range: req.headers } : undefined);
      if (object) {
        const headers = new Headers();
        if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers);
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', isPrivate ? 'private, no-store' : 'public, max-age=31536000');
        if (object.size) headers.set('Content-Length', String(object.size));
        if (object.range?.offset !== undefined) {
          const start = object.range.offset;
          const length = object.range.length ?? object.size;
          headers.set('Content-Range', 'bytes ' + start + '-' + (start + length - 1) + '/' + object.size);
          return new Response(object.body, { status: 206, headers });
        }
        return new Response(object.body, { status: 200, headers });
      }
    } catch (error) {
      console.error('R2 custom media error', error?.message);
    }
  }

  try {
    const chunks = await env.DB.prepare("SELECT data AS chunk_data FROM custom_audio_chunks WHERE track_id = ? ORDER BY chunk_index ASC").bind(trackId).all();
    if (!chunks.results?.length) return new Response('Not Found', { status: 404 });

    const binaryChunks = chunks.results.map(c => {
      const binStr = atob(c.chunk_data);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      return bytes;
    });

    const totalLen = binaryChunks.reduce((acc, c) => acc + c.length, 0);
    const full = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of binaryChunks) {
      full.set(c, offset);
      offset += c.length;
    }

    const range=req.headers.get('Range');let start=0,end=totalLen-1,status=200;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+totalLen}});if(m[1]){start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}else start=Math.max(0,totalLen-Number(m[2]));if(start>end||start>=totalLen)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+totalLen}});status=206;}
    return new Response(req.method==='HEAD'?null:full.subarray(start,end+1), {status,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(end-start+1),
        ...(status===206?{'Content-Range':`bytes ${start}-${end}/${totalLen}`}:{ }),
        'Accept-Ranges': 'bytes',
        'Cache-Control': isPrivate ? 'private, no-store' : 'public, max-age=31536000'
      }
    });
  } catch (e) {
    return new Response('Audio unavailable', { status: 500 });
  }
}

// Public endpoints
export async function handlePublicPromo(env) {
  if (!env.DB) return json({ success: true, promo: null });
  const row = await env.DB.prepare(`
    SELECT id, title, subtitle, badge, cover_url, target_url
    FROM promo_banners
    WHERE is_active = 1
      AND (starts_at = 0 OR starts_at <= unixepoch())
      AND (ends_at = 0 OR ends_at > unixepoch())
    ORDER BY updated_at DESC LIMIT 1
  `).first();
  return json({ success: true, promo: row || null });
}

export async function handlePublicEditorialPlaylists(env) {
  if (!env.DB) return json({ success: true, playlists: [] });
  const { results = [] } = await env.DB.prepare(`
    SELECT id, slug, title, description, cover_url, badge, track_ids, sort_order, updated_at
    FROM editorial_playlists
    WHERE is_published = 1
      AND (starts_at = 0 OR starts_at <= unixepoch())
      AND (ends_at = 0 OR ends_at > unixepoch())
    ORDER BY sort_order ASC, updated_at DESC
  `).all();

  const formatted = results.map(r => {
    let trackIds = [];
    try { trackIds = JSON.parse(r.track_ids || '[]'); } catch {}
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description || '',
      cover: r.cover_url || '/art/logo.svg',
      badge: r.badge || 'Редакция',
      trackIds,
      tracksCount: trackIds.length,
      updatedAt: r.updated_at
    };
  });
  return json({ success: true, playlists: formatted });
}

export async function handlePublicActiveBroadcasts(env) {
  if (!env.DB) return json({ success: true, broadcasts: [] });
  const t = now();
  const { results = [] } = await env.DB.prepare(`
    SELECT id, title, message, level, action_label, action_url, expires_at, created_at
    FROM broadcast_messages
    WHERE (expires_at IS NULL OR expires_at > ?)
      AND (starts_at = 0 OR starts_at <= unixepoch())
    ORDER BY created_at DESC LIMIT 5
  `).bind(t).all();
  return json({ success: true, broadcasts: results });
}

// Telegram Bot Webhook
const escapeBotHtml = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Listener-facing bot: a welcome with an «open» button, and any text searches the catalogue.
async function publicBot(text, send, env, searchTracks) {
  const origin = env.PUBLIC_ORIGIN || 'https://music.academmix.ru';
  const open = [{ text: '▶ Открыть Sway', web_app: { url: origin + '/?src=tg_bot' } }];
  if (!text || text === '/start' || text.startsWith('/start ') || text === '/help') {
    await send(
      '🎧 <b>Sway — бесплатная музыка прямо в браузере</b>\n\n' +
      '«Моя волна» подбирает треки под настроение, есть тексты песен, эквалайзер и офлайн.\n\n' +
      'Напиши название трека или исполнителя — пришлю ссылку.\n' +
      'На iPhone: открой ' + origin + ' в Safari → «Поделиться» → «На экран „Домой“».',
      { inline_keyboard: [open] }
    );
    return;
  }
  if (text.startsWith('/')) { await send('Напиши название трека или исполнителя 🙂', { inline_keyboard: [open] }); return; }
  const found = text.length >= 2 && text.length <= 80 && searchTracks ? await searchTracks(text).catch(() => []) : [];
  if (!found.length) { await send('Ничего не нашёл по запросу «' + escapeBotHtml(text.slice(0, 80)) + '». Попробуй написать иначе.', { inline_keyboard: [open] }); return; }
  const link = t => origin + '/t/' + encodeURIComponent(t.id) + '?src=tg_bot';
  await send(
    '🔎 Нашёл:\n\n' + found.map((t, i) => (i + 1) + '. <a href="' + escapeBotHtml(link(t)) + '">' + escapeBotHtml(t.title) + '</a> — ' + escapeBotHtml(t.artist)).join('\n'),
    { inline_keyboard: found.slice(0, 3).map(t => [{ text: '▶ ' + String(t.title).slice(0, 40), url: link(t) }]).concat([open]) }
  );
}
async function promoSourcesSummary(env) {
  if (!env.DB) return '';
  try {
    const since = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const { results = [] } = await env.DB.prepare('SELECT source, SUM(visits) AS visits, SUM(installs) AS installs FROM promo_visits WHERE day >= ? GROUP BY source ORDER BY visits DESC LIMIT 8').bind(since).all();
    if (!results.length) return '📣 Источники за 7 дней: пока нет переходов по меткам\n\n';
    return '📣 <b>Источники за 7 дней</b>\n' + results.map(r => `• ${escapeBotHtml(r.source)}: ${r.visits} визитов, ${r.installs} установок`).join('\n') + '\n\n';
  } catch { return ''; }
}

export async function handleTelegramWebhook(req, env, staticTracksCount = 7000, { searchTracks } = {}) {
  const update = await req.json().catch(() => null);
  if (!update || !update.message) return json({ ok: true });

  const msg = update.message;
  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();
  const botToken = env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !chatId) return json({ ok: true });

  const send = async (replyText, replyMarkup) => {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        })
      });
    } catch {}
  };

  // Check admin config chat id
  let adminChatId = env.ADMIN_TELEGRAM_CHAT_ID;
  if (!adminChatId && env.DB) {
    const row = await env.DB.prepare("SELECT value FROM admin_config WHERE key = 'admin_telegram_chat_id'").first();
    adminChatId = row?.value;
  }

  // First time bind command: /bind <password>
  if (text.startsWith('/bind')) {
    const pw = text.split(/\s+/)[1];
    if (await verifyPassword(pw, env)) {
      if (env.DB) {
        await env.DB.prepare(`
          INSERT INTO admin_config (key, value, updated_at) VALUES ('admin_telegram_chat_id', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).bind(String(chatId), now()).run();
      }
      await send('✅ <b>Успешно привязано!</b> Теперь вы авторизованный администратор Sway.');
      return json({ ok: true });
    } else {
      await send('❌ Неверный пароль администратора.');
      return json({ ok: true });
    }
  }

  // Everyone except the bound admin chat gets the public listener bot; it never issues admin sessions.
  if (!adminChatId || String(chatId) !== String(adminChatId)) {
    if (msg.chat?.type === 'private') await publicBot(text, send, env, searchTracks);
    return json({ ok: true });
  }

  const adminOrigin = env.PUBLIC_ORIGIN || 'https://music.academmix.ru';

  if (text === '/start') {
    const session = await createAdminSession(env, 3600);
    const magicLink = `${adminOrigin}/api/admin/magic-login?token=${session.token}`;
    await send(
      `👋 <b>Панель управления Sway Music</b>\n\n` +
      `Команды:\n` +
      `• /stats — Живая статистика приложения\n` +
      `• /login — Волшебная ссылка для входа в панель\n` +
      `• /purge — Сброс Cloudflare кэша\n` +
      `• /broadcast &lt;текст&gt; — Срочное объявление слушателям\n` +
      `• /promo — Текущий промо-баннер`,
      {
        inline_keyboard: [
          [{ text: '⚡ Открыть админ-панель', web_app: { url: `${adminOrigin}/admin.html?token=${session.token}` } }],
          [{ text: '🔑 Быстрый вход в браузере', url: magicLink }]
        ]
      }
    );
    return json({ ok: true });
  }

  if (text === '/login') {
    const session = await createAdminSession(env, 3600);
    const magicLink = `${adminOrigin}/api/admin/magic-login?token=${session.token}`;
    await send(
      `🔑 <b>Ваша ссылка для входа в Sway Admin:</b>\n\n` +
      `<a href="${magicLink}">Нажмите сюда для входа</a>\n\n` +
      `<i>Ссылка действует 1 час.</i>`,
      {
        inline_keyboard: [
          [{ text: 'Войти в панель', url: magicLink }]
        ]
      }
    );
    return json({ ok: true });
  }

  if (text === '/status' || text === '/stats') {
    let listeners = 0, likes = 0, playlists = 0, custom = 0, syncedLyrics = 0;
    if (env.DB) {
      listeners = (await env.DB.prepare("SELECT COUNT(*) as c FROM users").first())?.c || 0;
      likes = (await env.DB.prepare("SELECT COUNT(*) as c FROM likes").first())?.c || 0;
      playlists = (await env.DB.prepare("SELECT COUNT(*) as c FROM playlists").first())?.c || 0;
      custom = (await env.DB.prepare("SELECT COUNT(*) as c FROM custom_tracks").first())?.c || 0;
      syncedLyrics = (await env.DB.prepare("SELECT COUNT(*) as c FROM track_lyrics WHERE synced = 1").first())?.c || 0;
    }
    await send(
      `📊 <b>Статистика Sway</b>\n\n` +
      `🎵 Базовый каталог: <b>${staticTracksCount}</b> треков\n` +
      `➕ Своих загруженных: <b>${custom}</b>\n` +
      `🎙 Караоке с таймингами: <b>${syncedLyrics}</b>\n` +
      `👥 Слушателей в базе: <b>${listeners}</b>\n` +
      `❤️ Поставлено лайков: <b>${likes}</b>\n` +
      `📁 Создано плейлистов: <b>${playlists}</b>\n\n` +
      await promoSourcesSummary(env) +
      `🟢 CDN Cloudflare: Активен (EEUR/VIE)`
    );
    return json({ ok: true });
  }

  if (text.startsWith('/broadcast')) {
    const broadText = text.replace(/^\/broadcast\s*/, '').trim();
    if (!broadText) {
      await send('⚠️ Укажите текст рассылки: <code>/broadcast Внимание! Обновление Sway</code>');
      return json({ ok: true });
    }
    const id = crypto.randomUUID();
    const expires = now() + 86400 * 3; // 3 days
    if (env.DB) {
      await env.DB.prepare(`
        INSERT INTO broadcast_messages (id, title, message, level, expires_at, created_at)
        VALUES (?, 'Объявление', ?, 'info', ?, ?)
      `).bind(id, broadText, expires, now()).run();
    }
    await send(`📢 <b>Рассылка создана!</b>\n\n«${broadText}»\n\n<i>Все слушатели увидят её при открытии приложения.</i>`);
    return json({ ok: true });
  }

  if (text === '/purge') {
    await send('🔄 Сброс кэша Cloudflare инициирован...');
    return json({ ok: true });
  }

  return json({ ok: true });
}

// Full Admin Router
export async function adminRoute(req, path, method, url, env, staticTracksCount = 7000, context = {}) {
  const pathname = url.pathname;
  if(method!=='GET'&&req.headers.get('Origin')!==url.origin)return json({error:'origin'},403);

  // 1. One-time password setup. Disabled unless ADMIN_SETUP_TOKEN is provisioned as a Worker secret.
  if (pathname === '/api/admin/setup' && method === 'POST') {
    const setupToken = env.ADMIN_SETUP_TOKEN;
    if (!setupToken || typeof setupToken !== 'string' || setupToken.length < 16) {
      return json({ error: 'not_found' }, 404);
    }
    if (!safeEqual(req.headers.get('X-Admin-Setup-Token') || '', setupToken)) {
      return json({ error: 'forbidden' }, 403);
    }
    if (await hasAdminPassword(env)) {
      return json({ error: 'Пароль уже настроен' }, 403);
    }
    const body = await readJSON(req);
    const pw = (body?.password || '').trim();
    if (pw.length < 12) return json({ error: 'Пароль должен быть от 12 символов' }, 400);
    await setAdminPassword(pw, env);
    const session = await createAdminSession(env);
    return new Response(JSON.stringify({ success: true, token: session.token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': adminCookie(url, session.token, session.maxAge)
      }
    });
  }

  // 2. Magic Link Login (from Telegram bot). The link is single-use and is
  // exchanged for a fresh short-lived session cookie.
  if (pathname === '/api/admin/magic-login' && method === 'GET') {
    const token = url.searchParams.get('token');
    if (!token || !/^[A-Za-z0-9_-]{43,64}$/.test(token) || !env.DB) {
      return new Response('Недействительная ссылка', { status: 400 });
    }
    const hashed = await hash(token);
    const session = await env.DB.prepare("SELECT * FROM admin_sessions WHERE hash = ? LIMIT 1").bind(hashed).first();
    const expiresAt = Number(session?.expiry ?? session?.expires_at);
    if (!session || !Number.isFinite(expiresAt) || expiresAt < now()) {
      return new Response('Срок действия ссылки истек. Запросите новую ссылку через Telegram бота: /login', { status: 401 });
    }
    await env.DB.prepare("DELETE FROM admin_sessions WHERE hash = ?").bind(hashed).run();
    const fresh = await createAdminSession(env, 3600);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/admin.html',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': adminCookie(url, fresh.token, fresh.maxAge)
      }
    });
  }

  // 3. Telegram WebApp Auth
  if (pathname === '/api/admin/telegram-auth' && method === 'POST') {
    const body = await readJSON(req);
    const initData = body?.initData;
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const user = await verifyTelegramWebAppData(initData, botToken);
    const allowed=env.ADMIN_TELEGRAM_ID||(await env.DB.prepare("SELECT value FROM admin_config WHERE key='admin_telegram_chat_id'").first())?.value;
    if (!user||!allowed||String(user.id)!==String(allowed)) {
      return json({ error: 'Неверные данные авторизации Telegram' }, 401);
    }
    const session = await createAdminSession(env);
    return new Response(JSON.stringify({ success: true, token: session.token, user }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': adminCookie(url, session.token, session.maxAge)
      }
    });
  }

  // 4. Password Login
  if (pathname === '/api/admin/login' && method === 'POST') {
    const ip = clientIp(req);
    const body = await readJSON(req);
    const pw = (body?.password || '').trim();

    // Rate limiting (canonical schema: admin_attempts(ip, attempts, last_attempt))
    const stamp = now(), windowSeconds = 900, maxAttempts = 5;
    if (env.DB) {
      try {
        const row = await env.DB.prepare("SELECT attempts, last_attempt FROM admin_attempts WHERE ip = ?").bind(ip).first();
        if (row && Number(row.last_attempt) > stamp - windowSeconds && Number(row.attempts) >= maxAttempts) {
          return json({ error: 'Слишком много попыток. Подождите 15 минут.' }, 429);
        }
      } catch (e) {
        console.error('Rate limit check error:', e);
      }
    }

    const ok = await verifyPassword(pw, env);
    if (env.DB) {
      try {
        if (ok) {
          await env.DB.prepare("DELETE FROM admin_attempts WHERE ip = ?").bind(ip).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO admin_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?)
            ON CONFLICT(ip) DO UPDATE SET
              attempts = CASE WHEN admin_attempts.last_attempt > ? THEN admin_attempts.attempts + 1 ELSE 1 END,
              last_attempt = ?
          `).bind(ip, stamp, stamp - windowSeconds, stamp).run();
        }
      } catch (e) {
        console.error('Log attempt error:', e);
      }
    }

    if (!ok) {
      return json({ error: 'Неверный пароль' }, 401);
    }

    const session = await createAdminSession(env);
    return new Response(JSON.stringify({ success: true, token: session.token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': adminCookie(url, session.token, session.maxAge)
      }
    });
  }

  // 5. Auth Status Check
  if (pathname === '/api/admin/status' && method === 'GET') {
    const isAuthed = await verifyAdminSession(req, env);
    const hasPassword = await hasAdminPassword(env);
    return json({
      authenticated: isAuthed,
      configured: hasPassword
    });
  }

  // 6. Logout
  if (pathname === '/api/admin/logout' && method === 'POST') {
    const token = cookieValue(req, adminCookieName);
    if (token && env.DB) {
      await env.DB.prepare("DELETE FROM admin_sessions WHERE hash = ?").bind(await hash(token)).run();
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${adminCookieName}=; Path=/; Max-Age=0`
      }
    });
  }

  // ALL FOLLOWING ENDPOINTS REQUIRE ADMIN AUTHENTICATION
  if (!await verifyAdminSession(req, env)) {
    return json({ error: 'Требуется авторизация администратора' }, 401);
  }

  const adminCtx = {
    req, path: pathname, method, url, env, staticTracksCount,
    ctx: context.ctx || null,
    loadTracks: context.loadTracks || (async () => [])
  };

  // Domain modules keep this file small: catalog, lyrics, users and moderation.
  const delegated = await catalogAdminRoute(adminCtx)
    || await lyricsAdminRoute(adminCtx)
    || await usersAdminRoute(adminCtx)
    || await uploadsAdminRoute(adminCtx);
  if (delegated) return delegated;

  // 6a. Change password (keeps the current session, revokes the rest).
  if (pathname === '/api/admin/password' && method === 'POST') {
    const body = await readJSON(req, 8000);
    const current = String(body?.currentPassword || '');
    const next = String(body?.newPassword || '').trim();
    if (next.length < 12) return json({ error: 'Новый пароль должен быть от 12 символов' }, 400);
    if (!await verifyPassword(current, env)) return json({ error: 'Текущий пароль неверен' }, 403);
    await setAdminPassword(next, env);
    const token = cookieValue(req, adminCookieName);
    const currentHash = token ? await hash(token) : '';
    if (env.DB) await env.DB.prepare('DELETE FROM admin_sessions WHERE hash != ?').bind(currentHash).run();
    await audit(env, 'admin.password', '', 'changed');
    return json({ ok: true });
  }

  // 6b. Active admin sessions.
  if (pathname === '/api/admin/sessions' && method === 'GET') {
    if (!env.DB) return json({ items: [] });
    const token = cookieValue(req, adminCookieName);
    const currentHash = token ? await hash(token) : '';
    const { results = [] } = await env.DB.prepare('SELECT hash, created_at, expiry FROM admin_sessions ORDER BY created_at DESC').all();
    return json({
      items: results.map(row => ({
        id: row.hash.slice(0, 10),
        created: row.created_at,
        expiry: row.expiry,
        current: row.hash === currentHash
      }))
    });
  }

  if (pathname === '/api/admin/sessions/revoke' && method === 'POST') {
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);
    const body = await readJSON(req, 4000);
    const token = cookieValue(req, adminCookieName);
    const currentHash = token ? await hash(token) : '';
    if (body?.all) {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE hash != ?').bind(currentHash).run();
      await audit(env, 'admin.sessions.revoke', 'all', '');
      return json({ ok: true, revoked: 'all' });
    }
    const id = String(body?.id || '');
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) return json({ error: 'invalid_id' }, 400);
    await env.DB.prepare("DELETE FROM admin_sessions WHERE hash LIKE ? AND hash != ?").bind(id + '%', currentHash).run();
    await audit(env, 'admin.sessions.revoke', id, '');
    return json({ ok: true, revoked: id });
  }

  // 6c. Failed login attempts.
  if (pathname === '/api/admin/attempts' && method === 'GET') {
    if (!env.DB) return json({ items: [] });
    const { results = [] } = await env.DB.prepare('SELECT ip, attempts, last_attempt FROM admin_attempts ORDER BY last_attempt DESC LIMIT 100').all();
    return json({ items: results });
  }

  // 6d. Audit log.
  if (pathname === '/api/admin/audit' && method === 'GET') {
    return json(await auditList(env, url.searchParams.get('limit'), url.searchParams.get('offset')));
  }

  // 6e. System state: which secrets exist, which tables are migrated.
  if (pathname === '/api/admin/system' && method === 'GET') {
    return json(await systemInfo(env, staticTracksCount));
  }

  // 6f. Feature flags.
  if (pathname === '/api/admin/flags') {
    if (method === 'GET') return json({ flags: await flags(env) });
    if (method === 'POST') {
      const body = await readJSON(req, 4000);
      try {
        const saved = await setFlag(env, String(body?.key || ''), String(body?.value ?? ''));
        await audit(env, 'flag.set', saved.key, saved.value);
        return json({ ok: true, ...saved });
      } catch (error) {
        return json({ error: error?.message || 'invalid_flag' }, 400);
      }
    }
  }

  // 6g. Listening analytics.
  if (pathname === '/api/admin/analytics' && method === 'GET') {
    const days = Number(url.searchParams.get('days')) || 7;
    const tracks = await adminCtx.loadTracks().catch(() => []);
    return json(await analytics(env, days, tracks));
  }

  // 6h. CSV export.
  if (pathname === '/api/admin/export' && method === 'GET') {
    const table = String(url.searchParams.get('table') || '');
    const result = await exportTable(env, table);
    if (!result) return json({ error: 'unknown_table' }, 400);
    return new Response(result.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + table + '.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }

  // 7. System Overview & Metrics
  if (pathname === '/api/admin/overview' && method === 'GET') {
    return json({ success: true, stats: await overview(env, staticTracksCount) });
  }

  // 8. Editorial Playlists Management
  if (pathname === '/api/admin/editorial-playlists') {
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);

    if (method === 'GET') {
      const { results = [] } = await env.DB.prepare(`
        SELECT * FROM editorial_playlists ORDER BY sort_order ASC, updated_at DESC
      `).all();
      return json({
        success: true,
        playlists: results.map(r => {
          let trackIds = [];
          try { trackIds = JSON.parse(r.track_ids || '[]'); } catch {}
          return { ...r, track_ids: trackIds };
        })
      });
    }

    if (method === 'POST') {
      const body = await readJSON(req, 65536);
      const id = body.id || crypto.randomUUID();
      const slug = (body.slug || body.title || 'playlist').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const title = (body.title || '').trim();
      if (!title) return json({ error: 'Название обязательно' }, 400);
      const desc = body.description || '';
      const cover = body.cover_url || '/art/logo.svg';
      const badge = body.badge || 'Редакция';
      const trackIds = JSON.stringify(Array.isArray(body.track_ids) ? body.track_ids : []);
      const isPub = body.is_published ? 1 : 0;
      const sortOrder = Number(body.sort_order) || 0;
      const startsAt = Number(body.starts_at) || 0;
      const endsAt = Number(body.ends_at) || 0;

      await env.DB.prepare(`
        INSERT INTO editorial_playlists (id, slug, title, description, cover_url, badge, track_ids, is_published, sort_order, starts_at, ends_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          description = excluded.description,
          cover_url = excluded.cover_url,
          badge = excluded.badge,
          track_ids = excluded.track_ids,
          is_published = excluded.is_published,
          sort_order = excluded.sort_order,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          updated_at = excluded.updated_at
      `).bind(id, slug, title, desc, cover, badge, trackIds, isPub, sortOrder, startsAt, endsAt, now(), now()).run();

      await audit(env, 'editorial.save', id, title);
      return json({ success: true, id });
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'Не указан ID' }, 400);
      await env.DB.prepare("DELETE FROM editorial_playlists WHERE id = ?").bind(id).run();
      return json({ success: true });
    }
  }

  // 9. Promo Banner Management
  if (pathname === '/api/admin/promo') {
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);

    if (method === 'GET') {
      const { results = [] } = await env.DB.prepare("SELECT * FROM promo_banners ORDER BY updated_at DESC").all();
      return json({ success: true, banners: results });
    }

    if (method === 'POST') {
      const body = await readJSON(req, 16384);
      const id = body.id || crypto.randomUUID();
      const title = (body.title || '').trim();
      if (!title) return json({ error: 'Заголовок обязателен' }, 400);
      const subtitle = body.subtitle || '';
      const badge = body.badge || 'ПРОМО';
      const cover = body.cover_url || '';
      const target = body.target_url || '#';
      const isActive = body.is_active ? 1 : 0;
      const startsAt = Number(body.starts_at) || 0;
      const endsAt = Number(body.ends_at) || 0;

      // If setting this to active, optionally deactivate other banners
      if (isActive) {
        await env.DB.prepare("UPDATE promo_banners SET is_active = 0 WHERE id != ?").bind(id).run();
      }

      await env.DB.prepare(`
        INSERT INTO promo_banners (id, title, subtitle, badge, cover_url, target_url, is_active, starts_at, ends_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          subtitle = excluded.subtitle,
          badge = excluded.badge,
          cover_url = excluded.cover_url,
          target_url = excluded.target_url,
          is_active = excluded.is_active,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          updated_at = excluded.updated_at
      `).bind(id, title, subtitle, badge, cover, target, isActive, startsAt, endsAt, now(), now()).run();

      await audit(env, 'promo.save', id, title);
      return json({ success: true, id });
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'Не указан ID' }, 400);
      await env.DB.prepare("DELETE FROM promo_banners WHERE id = ?").bind(id).run();
      return json({ success: true });
    }
  }

  // 10. Broadcast Announcements Management
  if (pathname === '/api/admin/broadcasts') {
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);

    if (method === 'GET') {
      const { results = [] } = await env.DB.prepare("SELECT * FROM broadcast_messages ORDER BY created_at DESC LIMIT 50").all();
      return json({ success: true, broadcasts: results });
    }

    if (method === 'POST') {
      const body = await readJSON(req, 16384);
      const id = body.id || crypto.randomUUID();
      const title = (body.title || 'Объявление').trim();
      const message = (body.message || '').trim();
      if (!message) return json({ error: 'Текст рассылки обязателен' }, 400);
      const level = body.level || 'info';
      const actionLabel = body.action_label || '';
      const actionUrl = body.action_url || '';
      const durationDays = Number(body.duration_days) || 3;
      const expiresAt = now() + durationDays * 86400;
      const startsAt = Number(body.starts_at) || 0;

      await env.DB.prepare(`
        INSERT INTO broadcast_messages (id, title, message, level, action_label, action_url, expires_at, starts_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, title, message, level, actionLabel, actionUrl, expiresAt, startsAt, now()).run();

      await audit(env, 'broadcast.save', id, title);
      return json({ success: true, id });
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'Не указан ID' }, 400);
      await env.DB.prepare("DELETE FROM broadcast_messages WHERE id = ?").bind(id).run();
      return json({ success: true });
    }
  }

  // 11. Lyrics are handled by admin-lyrics.mjs before this point.

  // 12. Purge Cloudflare Cache
  if (pathname === '/api/admin/purge-cache' && method === 'POST') {
    const result = await purgeCache(env, url.origin);
    await audit(env, 'cache.purge', '', result.message);
    return json({ success: result.ok, ...result });
  }

  return json({ error: 'Маршрут не найден' }, 404);
}
