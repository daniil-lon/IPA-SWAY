// Admin operations: audit log, feature flags, overview, analytics, exports.
const num = value => Number(value) || 0;

export async function audit(env, action, target = '', detail = '') {
  if (!env?.DB) return;
  try {
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    await env.DB.prepare('INSERT INTO admin_audit_log (action, target, detail) VALUES (?, ?, ?)')
      .bind(String(action).slice(0, 80), String(target).slice(0, 180), text.slice(0, 500)).run();
  } catch {}
}

const FLAG_DEFAULTS = { maintenance: '0', signups: '1', uploads: '1' };

export async function flags(env) {
  const out = { ...FLAG_DEFAULTS };
  if (!env?.DB) return out;
  try {
    const { results = [] } = await env.DB.prepare('SELECT key, value FROM feature_flags').all();
    for (const row of results) out[row.key] = row.value;
  } catch {}
  return out;
}

export async function setFlag(env, key, value) {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) throw new Error('invalid_flag');
  if (typeof value !== 'string' || value.length > 200) throw new Error('invalid_value');
  await env.DB.prepare('INSERT INTO feature_flags (key, value, updated) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated')
    .bind(key, value).run();
  return { key, value };
}

export async function overview(env, staticTracksCount) {
  const empty = {
    staticTracks: staticTracksCount, customTracks: 0, totalTracks: staticTracksCount,
    listeners: 0, likes: 0, playlists: 0, lyricsTotal: 0, lyricsSynced: 0,
    promoActive: 0, broadcastsCount: 0, activeUsers7: 0, listens7: 0, seconds7: 0,
    newUsers7: 0, searches7: 0, sessions: 0, hiddenTracks: 0
  };
  if (!env?.DB) return empty;
  const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const first = async (sql, ...args) => {
    try { return await env.DB.prepare(sql).bind(...args).first(); } catch { return null; }
  };
  const rows = await Promise.all([
    first('SELECT COUNT(*) AS c FROM users'),
    first('SELECT COUNT(*) AS c FROM likes'),
    first('SELECT COUNT(*) AS c FROM playlists'),
    first('SELECT COUNT(*) AS c FROM custom_tracks'),
    first('SELECT COUNT(*) AS c FROM track_lyrics'),
    first('SELECT COUNT(*) AS c FROM track_lyrics WHERE synced = 1'),
    first('SELECT COUNT(*) AS c FROM promo_banners WHERE is_active = 1'),
    first('SELECT COUNT(*) AS c FROM broadcast_messages'),
    first('SELECT COUNT(DISTINCT uid) AS c FROM listening_daily WHERE day >= ?', from),
    first('SELECT SUM(plays) AS c FROM listening_daily WHERE day >= ?', from),
    first('SELECT SUM(seconds) AS c FROM listening_daily WHERE day >= ?', from),
    first("SELECT COUNT(*) AS c FROM user_profiles WHERE joined_at >= unixepoch('now','-7 days')"),
    first("SELECT COUNT(*) AS c FROM search_log WHERE at >= unixepoch('now','-7 days')"),
    first('SELECT COUNT(*) AS c FROM sessions WHERE expiry > unixepoch()'),
    first("SELECT COUNT(*) AS c FROM catalog_overrides WHERE json_extract(metadata,'$.hidden') = 1")
  ]);
  const [
    listeners, likes, playlists, customTracks, lyricsTotal, lyricsSynced,
    promoActive, broadcastsCount, activeUsers7, listens7, seconds7,
    newUsers7, searches7, sessions, hiddenTracks
  ] = rows.map(row => num(row?.c));
  return {
    staticTracks: staticTracksCount, customTracks,
    totalTracks: staticTracksCount + customTracks,
    listeners, likes, playlists, lyricsTotal, lyricsSynced,
    promoActive, broadcastsCount, activeUsers7,
    listens7, seconds7: Math.round(seconds7), newUsers7, searches7, sessions, hiddenTracks
  };
}

export async function analytics(env, days, tracks) {
  const period = [7, 30, 365].includes(days) ? days : 7;
  const from = new Date(Date.now() - (period - 1) * 86400000).toISOString().slice(0, 10);
  const byId = new Map((tracks || []).map(t => [t.id, t]));
  if (!env?.DB) return { period, from, totals: { seconds: 0, plays: 0, users: 0 }, daily: [], topTracks: [], topArtists: [], topGenres: [], newUsers: [], topSearches: [], zeroSearches: [], recentSearches: [] };

  const all = async (sql, ...args) => {
    try { return (await env.DB.prepare(sql).bind(...args).all()).results || []; } catch { return []; }
  };
  const since = Math.floor(Date.now() / 1000) - period * 86400;
  const [daily, top, newUsers, seen, topSearches, zeroSearches, recentSearches] = await Promise.all([
    all('SELECT day, SUM(seconds) AS seconds, SUM(plays) AS plays, COUNT(DISTINCT uid) AS users FROM listening_daily WHERE day >= ? GROUP BY day ORDER BY day', from),
    all('SELECT track, SUM(seconds) AS seconds, SUM(plays) AS plays FROM listening_daily WHERE day >= ? GROUP BY track ORDER BY seconds DESC LIMIT 40', from),
    all("SELECT date(joined_at,'unixepoch') AS day, COUNT(*) AS users FROM user_profiles WHERE joined_at >= unixepoch('now','-' || ? || ' days') GROUP BY day ORDER BY day", period),
    all('SELECT COUNT(DISTINCT uid) AS c FROM listening_daily WHERE day >= ?', from),
    all('SELECT query, COUNT(*) AS hits, SUM(CASE WHEN results = 0 THEN 1 ELSE 0 END) AS misses FROM search_log WHERE at >= ? GROUP BY query ORDER BY hits DESC LIMIT 15', since),
    all('SELECT query, COUNT(*) AS hits FROM search_log WHERE at >= ? AND results = 0 GROUP BY query ORDER BY hits DESC LIMIT 10', since),
    all('SELECT at, query, results FROM search_log ORDER BY at DESC LIMIT 20')
  ]);

  const seconds = daily.reduce((sum, row) => sum + num(row.seconds), 0);
  const plays = daily.reduce((sum, row) => sum + num(row.plays), 0);
  const artists = new Map(), genres = new Map();
  const topTracks = top.map(row => {
    const track = byId.get(row.track);
    const names = track ? (Array.isArray(track.artists) && track.artists.length ? track.artists : String(track.artist || '').split(/\s*[,;]\s*/).filter(Boolean)) : [];
    for (const name of names) artists.set(name, (artists.get(name) || 0) + num(row.seconds) / Math.max(1, names.length));
    if (track?.genre) genres.set(track.genre, (genres.get(track.genre) || 0) + num(row.seconds));
    return {
      id: row.track,
      title: track?.title || row.track,
      artist: track?.artist || '—',
      art: track?.art || '',
      seconds: Math.round(num(row.seconds)),
      plays: num(row.plays)
    };
  });
  const sortPairs = map => [...map].map(([name, value]) => ({ name, seconds: Math.round(value) })).sort((a, b) => b.seconds - a.seconds).slice(0, 10);

  return {
    period, from,
    totals: { seconds: Math.round(seconds), plays, users: num(seen[0]?.c) },
    daily: daily.map(row => ({ day: row.day, seconds: Math.round(num(row.seconds)), plays: num(row.plays), users: num(row.users) })),
    topTracks,
    topArtists: sortPairs(artists),
    topGenres: sortPairs(genres),
    newUsers: newUsers.map(row => ({ day: row.day, users: num(row.users) })),
    topSearches: topSearches.map(row => ({ query: row.query, hits: num(row.hits), misses: num(row.misses) })),
    zeroSearches: zeroSearches.map(row => ({ query: row.query, hits: num(row.hits) })),
    recentSearches: recentSearches.map(row => ({ at: row.at, query: row.query, results: num(row.results) }))
  };
}

export async function auditList(env, limit = 50, offset = 0) {
  if (!env?.DB) return { items: [], total: 0 };
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  try {
    const [rows, count] = await Promise.all([
      env.DB.prepare('SELECT id, at, actor, action, target, detail FROM admin_audit_log ORDER BY at DESC, id DESC LIMIT ? OFFSET ?').bind(safeLimit, safeOffset).all(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM admin_audit_log').first()
    ]);
    return { items: rows.results || [], total: num(count?.c) };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function systemInfo(env, staticTracksCount) {
  const info = {
    secrets: {
      ADMIN_SETUP_TOKEN: Boolean(env.ADMIN_SETUP_TOKEN),
      TELEGRAM_BOT_TOKEN: Boolean(env.TELEGRAM_BOT_TOKEN),
      TELEGRAM_WEBHOOK_SECRET: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      YANDEX_CLIENT_SECRET: Boolean(env.YANDEX_CLIENT_SECRET),
      CF_API_TOKEN: Boolean(env.CF_API_TOKEN),
      CF_ZONE_ID: Boolean(env.CF_ZONE_ID)
    },
    env: {
      REQUIRE_YANDEX_LOGIN: env.REQUIRE_YANDEX_LOGIN || '0',
      PUBLIC_ORIGIN: env.PUBLIC_ORIGIN || '',
      tracks: staticTracksCount
    },
    tables: [],
    flags: await flags(env)
  };
  if (!env?.DB) return info;
  try {
    const { results = [] } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all();
    info.tables = results.map(row => row.name);
  } catch {}
  return info;
}

const EXPORTS = {
  users: 'SELECT id, name, volume, autoplay, motion, crossfade, wave_pattern FROM users ORDER BY id',
  likes: 'SELECT uid, track, added FROM likes ORDER BY added DESC',
  playlists: 'SELECT id, uid, name, created, updated FROM playlists ORDER BY updated DESC',
  listening_daily: 'SELECT uid, day, track, seconds, plays FROM listening_daily ORDER BY day DESC LIMIT 5000',
  track_lyrics: 'SELECT id, title, artist, synced, updated FROM track_lyrics ORDER BY updated DESC LIMIT 5000',
  catalog_overrides: 'SELECT track, metadata, updated FROM catalog_overrides ORDER BY updated DESC LIMIT 5000',
  collection_reactions: 'SELECT uid, kind, ref, added FROM collection_reactions ORDER BY added DESC LIMIT 5000',
  broadcast_messages: 'SELECT * FROM broadcast_messages ORDER BY created_at DESC',
  promo_banners: 'SELECT * FROM promo_banners ORDER BY created_at DESC',
  editorial_playlists: 'SELECT * FROM editorial_playlists ORDER BY sort_order',
  search_log: 'SELECT at, query, results, uid FROM search_log ORDER BY at DESC LIMIT 5000'
};

export async function exportTable(env, table) {
  const sql = EXPORTS[table];
  if (!sql || !env?.DB) return null;
  const { results = [] } = await env.DB.prepare(sql).all();
  if (!results.length) return { table, csv: '', rows: 0 };
  const columns = Object.keys(results[0]);
  const escape = value => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  const lines = [columns.join(','), ...results.map(row => columns.map(column => escape(row[column])).join(','))];
  return { table, csv: lines.join('\r\n'), rows: results.length };
}

export async function purgeCache(env, origin) {
  const token = env.CF_API_TOKEN, zone = env.CF_ZONE_ID;
  if (!token || !zone) {
    return { ok: false, configured: false, message: 'CF_API_TOKEN и CF_ZONE_ID не заданы — очистка недоступна' };
  }
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/zones/' + zone + '/purge_cache', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [origin + '/catalog.json', origin + '/'] })
    });
    const data = await response.json().catch(() => ({}));
    const ok = response.ok && data.success !== false;
    return {
      ok,
      configured: true,
      status: response.status,
      message: ok ? 'Кэш Cloudflare очищен' : 'Cloudflare API: ' + (data.errors?.[0]?.message || response.status)
    };
  } catch (error) {
    return { ok: false, configured: true, message: 'Cloudflare API недоступен: ' + (error?.message || error) };
  }
}
