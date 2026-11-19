import { json, readJSON } from './profile-store.mjs';

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

async function verifyPassword(password, env) {
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

export async function getCustomTracks(env) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare("SELECT * FROM custom_tracks ORDER BY created_at DESC").all();
    return (results || []).map(r => ({
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
  } catch {
    return [];
  }
}

export async function serveCustomMedia(req, path, env, { private: isPrivate = false } = {}) {
  const match = path.match(/^\/api\/custom-media\/([a-zA-Z0-9_-]+)\.mp3$/);
  if (!match || !env.DB) return new Response('Not Found', { status: 404 });
  const trackId = match[1];

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
    WHERE expires_at IS NULL OR expires_at > ?
    ORDER BY created_at DESC LIMIT 5
  `).bind(t).all();
  return json({ success: true, broadcasts: results });
}

// Telegram Bot Webhook
export async function handleTelegramWebhook(req, env, staticTracksCount = 7000) {
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

  // Verify chat authorization. An unbound bot must never issue an admin session.
  if (!adminChatId) {
    await send('🔒 Бот не привязан к администратору. Отправьте <code>/bind &lt;пароль&gt;</code>.');
    return json({ ok: true });
  }
  if (String(chatId) !== String(adminChatId)) {
    await send('🔒 Доступ запрещен. Отправьте <code>/bind &lt;пароль&gt;</code> для авторизации.');
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
export async function adminRoute(req, path, method, url, env, staticTracksCount = 7000) {
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

  // 7. System Overview & Metrics
  if (pathname === '/api/admin/overview' && method === 'GET') {
    let listeners = 0, likes = 0, playlists = 0, customTracks = 0, lyricsTotal = 0, lyricsSynced = 0;
    let promoActive = 0, broadcastsCount = 0;

    if (env.DB) {
      listeners = (await env.DB.prepare("SELECT COUNT(*) as c FROM users").first())?.c || 0;
      likes = (await env.DB.prepare("SELECT COUNT(*) as c FROM likes").first())?.c || 0;
      playlists = (await env.DB.prepare("SELECT COUNT(*) as c FROM playlists").first())?.c || 0;
      customTracks = (await env.DB.prepare("SELECT COUNT(*) as c FROM custom_tracks").first())?.c || 0;
      lyricsTotal = (await env.DB.prepare("SELECT COUNT(*) as c FROM track_lyrics").first())?.c || 0;
      lyricsSynced = (await env.DB.prepare("SELECT COUNT(*) as c FROM track_lyrics WHERE synced = 1").first())?.c || 0;
      promoActive = (await env.DB.prepare("SELECT COUNT(*) as c FROM promo_banners WHERE is_active = 1").first())?.c || 0;
      broadcastsCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM broadcast_messages").first())?.c || 0;
    }

    return json({
      success: true,
      stats: {
        staticTracks: staticTracksCount,
        customTracks,
        totalTracks: staticTracksCount + customTracks,
        listeners,
        likes,
        playlists,
        lyricsTotal,
        lyricsSynced,
        promoActive,
        broadcastsCount
      }
    });
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

      await env.DB.prepare(`
        INSERT INTO editorial_playlists (id, slug, title, description, cover_url, badge, track_ids, is_published, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          description = excluded.description,
          cover_url = excluded.cover_url,
          badge = excluded.badge,
          track_ids = excluded.track_ids,
          is_published = excluded.is_published,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `).bind(id, slug, title, desc, cover, badge, trackIds, isPub, sortOrder, now(), now()).run();

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

      // If setting this to active, optionally deactivate other banners
      if (isActive) {
        await env.DB.prepare("UPDATE promo_banners SET is_active = 0 WHERE id != ?").bind(id).run();
      }

      await env.DB.prepare(`
        INSERT INTO promo_banners (id, title, subtitle, badge, cover_url, target_url, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          subtitle = excluded.subtitle,
          badge = excluded.badge,
          cover_url = excluded.cover_url,
          target_url = excluded.target_url,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `).bind(id, title, subtitle, badge, cover, target, isActive, now(), now()).run();

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

      await env.DB.prepare(`
        INSERT INTO broadcast_messages (id, title, message, level, action_label, action_url, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, title, message, level, actionLabel, actionUrl, expiresAt, now()).run();

      return json({ success: true, id });
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'Не указан ID' }, 400);
      await env.DB.prepare("DELETE FROM broadcast_messages WHERE id = ?").bind(id).run();
      return json({ success: true });
    }
  }

  // 11. Lyrics Editor
  if (pathname === '/api/admin/lyrics') {
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);

    if (method === 'GET') {
      const trackId = url.searchParams.get('trackId');
      if (!trackId) return json({ error: 'trackId обязателен' }, 400);
      const row = await env.DB.prepare(`
        SELECT id AS track_id, lines, plain AS lyrics_plain, synced AS is_synced, updated AS updated_at FROM track_lyrics WHERE id = ?
      `).bind(trackId).first();
      return json({ success: true, lyrics: row ? {...row,lyrics_lrc:JSON.parse(row.lines||'[]').map(l=>'['+String(Math.floor((l.at??l.time)/60)).padStart(2,'0')+':'+((l.at??l.time)%60).toFixed(2).padStart(5,'0')+']'+l.text).join('\n')} : null });
    }

    if (method === 'POST') {
      const body = await readJSON(req, 65536);
      const trackId = (body.track_id || '').trim();
      if (!trackId) return json({ error: 'track_id обязателен' }, 400);
      const lrc = (body.lyrics_lrc || '').trim();
      const plain = (body.lyrics_plain || '').trim();
      const lines=[];for(const line of lrc.split(/\r?\n/)){const text=line.replace(/\[\d+:\d+(?:\.\d+)?\]/g,'').trim();for(const m of line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g))lines.push({at:Number(m[1])*60+Number(m[2]),text});}lines.sort((a,b)=>a.at-b.at);
      const isSynced=lines.length?1:0;

      await env.DB.prepare(`
        INSERT INTO track_lyrics (id,title,artist,lines,plain,synced,updated) VALUES (?,'','',?,?,?,?) ON CONFLICT(id) DO UPDATE SET lines=excluded.lines,plain=excluded.plain,synced=excluded.synced,updated=excluded.updated
      `).bind(trackId,JSON.stringify(lines),plain||lines.map(l=>l.text).join('\n'),isSynced,now()).run();

      return json({ success: true });
    }
  }

  // 12. Purge Cloudflare Cache
  if (pathname === '/api/admin/purge-cache' && method === 'POST') {
    return json({
      success: true,
      message: 'Запрос на очистку кэша принят. Изменения применятся по всей сети Cloudflare.'
    });
  }

  return json({ error: 'Маршрут не найден' }, 404);
}
