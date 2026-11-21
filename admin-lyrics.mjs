import { json, readJSON } from './profile-store.mjs';
import { lyricLanguage } from './public/music-language.js';
import { audit } from './admin-ops.mjs';

const LRC_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

export function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const text = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    for (const match of raw.matchAll(LRC_TAG)) lines.push({ at: Number(match[1]) * 60 + Number(match[2]), text });
  }
  lines.sort((a, b) => a.at - b.at);
  return lines;
}

export function linesToLrc(lines) {
  return (lines || []).map(line => {
    const at = Number(line.at ?? line.time ?? 0);
    const minutes = String(Math.floor(at / 60)).padStart(2, '0');
    const seconds = (at % 60).toFixed(2).padStart(5, '0');
    return '[' + minutes + ':' + seconds + ']' + String(line.text || '');
  }).join('\n');
}

export async function saveLyrics(env, trackId, lrc, meta = {}) {
  const lines = parseLrc(lrc);
  const plain = lines.length ? lines.map(line => line.text).join('\n') : String(lrc || '').trim();
  const synced = lines.length ? 1 : 0;
  await env.DB.prepare(`
    INSERT INTO track_lyrics (id, title, artist, lines, plain, synced, updated)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      lines = excluded.lines,
      plain = excluded.plain,
      synced = excluded.synced,
      updated = excluded.updated
  `).bind(
    trackId,
    String(meta.title || '').slice(0, 180),
    String(meta.artist || '').slice(0, 180),
    JSON.stringify(lines.map(line => ({ at: Number(line.at.toFixed(2)), text: line.text }))),
    plain,
    synced
  ).run();
  await env.DB.prepare("INSERT INTO track_languages (id, language, source) VALUES (?, ?, 'lyrics') ON CONFLICT(id) DO UPDATE SET language = excluded.language, updated = unixepoch()")
    .bind(trackId, lyricLanguage(plain)).run();
  return { synced: Boolean(synced), lines: lines.length, chars: plain.length };
}

export async function lyricsAdminRoute({ req, path, method, url, env, loadTracks }) {
  if (!path.startsWith('/api/admin/lyrics')) return null;

  if (path === '/api/admin/lyrics' && method === 'GET') {
    const trackId = url.searchParams.get('trackId');
    if (!trackId) return json({ error: 'trackId обязателен' }, 400);
    if (!env.DB) return json({ success: true, lyrics: null });
    const row = await env.DB.prepare('SELECT id, title, artist, lines, plain, synced, updated FROM track_lyrics WHERE id = ?').bind(trackId).first();
    return json({
      success: true,
      lyrics: row ? { ...row, is_synced: Boolean(row.synced), lyrics_lrc: linesToLrc(JSON.parse(row.lines || '[]')), lyrics_plain: row.plain || '' } : null
    });
  }

  if (path === '/api/admin/lyrics' && method === 'POST') {
    const body = await readJSON(req, 200000);
    const trackId = String(body?.track_id || '').trim();
    if (!trackId) return json({ error: 'track_id обязателен' }, 400);
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);
    const tracks = await loadTracks().catch(() => []);
    const track = tracks.find(item => item.id === trackId);
    const result = await saveLyrics(env, trackId, body?.lyrics_lrc ?? body?.lrc ?? '', track || {});
    await audit(env, 'lyrics.save', trackId, JSON.stringify(result));
    return json({ success: true, ...result });
  }

  if (path === '/api/admin/lyrics' && method === 'DELETE') {
    const trackId = String(url.searchParams.get('trackId') || '').trim();
    if (!trackId) return json({ error: 'trackId обязателен' }, 400);
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);
    await env.DB.prepare('DELETE FROM track_lyrics WHERE id = ?').bind(trackId).run();
    await audit(env, 'lyrics.delete', trackId, '');
    return json({ ok: true });
  }

  if (path === '/api/admin/lyrics/search' && method === 'GET') {
    if (!env.DB) return json({ results: [], total: 0 });
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    if (q.length < 2) return json({ results: [], total: 0, offset });

    const ids = [];
    const add = id => { if (id && !ids.includes(id)) ids.push(id); };
    try {
      const match = '"' + q.replaceAll('"', '""') + '"';
      const { results = [] } = await env.DB.prepare(
        "SELECT t.id FROM lyrics_search JOIN track_lyrics t ON t.rowid = lyrics_search.rowid WHERE lyrics_search MATCH ? ORDER BY rank LIMIT 200"
      ).bind(match).all();
      for (const row of results) add(row.id);
    } catch {}
    try {
      const like = '%' + q + '%';
      const { results = [] } = await env.DB.prepare(
        'SELECT id FROM track_lyrics WHERE id LIKE ? OR title LIKE ? OR artist LIKE ? LIMIT 200'
      ).bind(like, like, like).all();
      for (const row of results) add(row.id);
    } catch {}

    const page = ids.slice(offset, offset + 25);
    if (!page.length) return json({ results: [], total: ids.length, offset });
    const placeholders = page.map(() => '?').join(',');
    const { results: rows = [] } = await env.DB.prepare(
      'SELECT id, title, artist, plain, lines, synced, updated FROM track_lyrics WHERE id IN (' + placeholders + ')'
    ).bind(...page).all();
    const byId = new Map(rows.map(row => [row.id, row]));
    const tracks = await loadTracks().catch(() => []);
    const catalog = new Map(tracks.map(track => [track.id, track]));

    const results = page.map(id => {
      const row = byId.get(id);
      if (!row) return null;
      const track = catalog.get(id);
      const plain = row.plain || '';
      const index = q ? plain.toLowerCase().indexOf(q.toLowerCase()) : -1;
      const excerpt = index >= 0 ? plain.slice(Math.max(0, index - 40), index + 80).replace(/\s+/g, ' ') : plain.slice(0, 100).replace(/\s+/g, ' ');
      return {
        id,
        title: track?.title || row.title || id,
        artist: track?.artist || row.artist || '',
        art: track?.art || '',
        audio: track?.audio || '',
        synced: Boolean(row.synced),
        updated: row.updated,
        excerpt
      };
    }).filter(Boolean);

    return json({ results, total: ids.length, offset, next: offset + 25 < ids.length ? offset + 25 : null });
  }

  if (path === '/api/admin/lyrics/list' && method === 'GET') {
    if (!env.DB) return json({ items: [], total: 0 });
    const filter = url.searchParams.get('filter') || 'all';
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
    const like = '%' + q + '%';

    const where = [];
    const args = [];
    if (filter === 'synced') where.push('synced = 1');
    else if (filter === 'unsynced') where.push('synced = 0');
    if (q) { where.push('(id LIKE ? OR title LIKE ? OR artist LIKE ?)'); args.push(like, like, like); }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM track_lyrics' + clause).bind(...args).first();
    const { results = [] } = await env.DB.prepare(
      'SELECT id, title, artist, plain, synced, updated FROM track_lyrics' + clause + ' ORDER BY updated DESC, id LIMIT ? OFFSET ?'
    ).bind(...args, limit, offset).all();
    const tracks = await loadTracks().catch(() => []);
    const catalog = new Map(tracks.map(track => [track.id, track]));

    return json({
      total: Number(count?.c) || 0,
      offset,
      limit,
      items: results.map(row => ({
        id: row.id,
        title: catalog.get(row.id)?.title || row.title || row.id,
        artist: catalog.get(row.id)?.artist || row.artist || '',
        art: catalog.get(row.id)?.art || '',
        synced: Boolean(row.synced),
        updated: row.updated,
        chars: (row.plain || '').length,
        excerpt: (row.plain || '').slice(0, 120).replace(/\s+/g, ' ')
      }))
    });
  }

  if (path === '/api/admin/lyrics/coverage' && method === 'GET') {
    if (!env.DB) return json({ total: 0, synced: 0, unsynced: 0 });
    const row = await env.DB.prepare('SELECT COUNT(*) AS total, SUM(synced = 1) AS synced, SUM(length(plain) = 0) AS empty FROM track_lyrics').first();
    const tracks = await loadTracks().catch(() => []);
    const total = Number(row?.total) || 0;
    const synced = Number(row?.synced) || 0;
    return json({
      total,
      synced,
      unsynced: total - synced,
      empty: Number(row?.empty) || 0,
      catalog: tracks.length,
      withoutLyrics: Math.max(0, tracks.length - total)
    });
  }

  if (path === '/api/admin/lyrics/export' && method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id || !env.DB) return new Response('not found', { status: 404 });
    const row = await env.DB.prepare('SELECT lines, plain, title, artist FROM track_lyrics WHERE id = ?').bind(id).first();
    if (!row) return new Response('not found', { status: 404 });
    const body = linesToLrc(JSON.parse(row.lines || '[]')) || row.plain || '';
    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + id.replace(/[^\w.-]/g, '_') + '.lrc"',
        'Cache-Control': 'no-store'
      }
    });
  }

  if (path === '/api/admin/lyrics/import' && method === 'POST') {
    const body = await readJSON(req, 400000);
    const trackId = String(body?.track_id || '').trim();
    const lrc = body?.lrc;
    if (!trackId || typeof lrc !== 'string') return json({ error: 'track_id и lrc обязательны' }, 400);
    if (!env.DB) return json({ error: 'D1 недоступна' }, 503);
    const tracks = await loadTracks().catch(() => []);
    const result = await saveLyrics(env, trackId, lrc, tracks.find(item => item.id === trackId) || {});
    await audit(env, 'lyrics.import', trackId, JSON.stringify(result));
    return json({ success: true, ...result });
  }

  return json({ error: 'not_found' }, 404);
}
