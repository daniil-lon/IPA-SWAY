import { json, readJSON } from './profile-store.mjs';
import { mergeCatalogOverride, recordingKey, needsAttention } from './catalog-store.mjs';
import { audit } from './admin-ops.mjs';

const pickItem = (track, lyrics, hidden) => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  artists: track.artists || [],
  genre: track.genre || '',
  seconds: Number(track.seconds) || 0,
  bytes: Number(track.bytes) || 0,
  albumTitle: track.albumTitle || '',
  albumYear: track.albumYear || track.year || '',
  art: track.art || '',
  audio: track.audio || '',
  language: track.language || '',
  license: track.license || '',
  isExplicit: Boolean(track.isExplicit ?? track.explicit),
  hidden: Boolean(hidden ?? track.hidden),
  hasLyrics: lyrics.has(track.id),
  custom: String(track.audio || '').startsWith('/api/custom-media/')
});

const SORTERS = {
  title: (a, b) => String(a.title).localeCompare(String(b.title), 'ru'),
  artist: (a, b) => String(a.artist).localeCompare(String(b.artist), 'ru'),
  seconds: (a, b) => b.seconds - a.seconds,
  year: (a, b) => Number(b.albumYear || 0) - Number(a.albumYear || 0),
  size: (a, b) => b.bytes - a.bytes
};

export async function catalogAdminRoute({ req, path, method, url, env, loadTracks }) {
  if (!path.startsWith('/api/admin/catalog/')) return null;

  if (path === '/api/admin/catalog/list' && method === 'GET') {
    const tracks = await loadTracks();
    let lyrics = new Set();
    if (env.DB) {
      try {
        const { results = [] } = await env.DB.prepare('SELECT id FROM track_lyrics').all();
        lyrics = new Set(results.map(row => row.id));
      } catch {}
    }

    const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
    const genre = url.searchParams.get('genre') || '';
    const year = url.searchParams.get('year') || '';
    const license = url.searchParams.get('license') || '';
    const hidden = url.searchParams.get('hidden') || '';
    const flag = url.searchParams.get('flag') || '';
    const sort = url.searchParams.get('sort') || '';
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);

    const filtered = tracks.filter(track => {
      if (q) {
        const haystack = (track.title + ' ' + track.artist + ' ' + (track.albumTitle || '') + ' ' + track.id).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (genre && track.genre !== genre) return false;
      if (year && String(track.albumYear || track.year || '') !== year) return false;
      if (license === 'none' && track.license) return false;
      if (license === 'set' && !track.license) return false;
      if (hidden === '1' && !track.hidden) return false;
      if (hidden === '0' && track.hidden) return false;
      if (flag === 'missing' && !needsAttention(track)) return false;
      if (flag === 'lyrics' && !lyrics.has(track.id)) return false;
      if (flag === 'nolyrics' && lyrics.has(track.id)) return false;
      if (flag === 'explicit' && !(track.isExplicit ?? track.explicit)) return false;
      return true;
    });

    const items = filtered.map(track => pickItem(track, lyrics, track.hidden));
    if (SORTERS[sort]) items.sort(SORTERS[sort]);

    return json({
      total: items.length,
      offset,
      limit,
      items: items.slice(offset, offset + limit),
      missingCount: items.filter(item => !item.albumTitle || !item.art || !item.seconds || !item.artists.length).length
    });
  }

  if (path === '/api/admin/catalog/track' && method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const tracks = await loadTracks();
    const track = tracks.find(item => item.id === id);
    if (!track) return json({ error: 'unknown_track' }, 404);
    let lyrics = null, override = {};
    if (env.DB) {
      try { lyrics = await env.DB.prepare('SELECT id, synced, updated, length(plain) AS chars FROM track_lyrics WHERE id = ?').bind(id).first(); } catch {}
      try {
        const row = await env.DB.prepare('SELECT metadata FROM catalog_overrides WHERE track = ?').bind(id).first();
        override = row ? JSON.parse(row.metadata) : {};
      } catch {}
    }
    return json({ track, override, lyrics });
  }

  if (path === '/api/admin/catalog/facets' && method === 'GET') {
    const tracks = await loadTracks();
    const genres = new Map(), years = new Map();
    let noLicense = 0, missing = 0, hidden = 0, explicit = 0;
    for (const track of tracks) {
      if (track.genre) genres.set(track.genre, (genres.get(track.genre) || 0) + 1);
      const year = track.albumYear || track.year;
      if (year) years.set(String(year), (years.get(String(year)) || 0) + 1);
      if (!track.license) noLicense += 1;
      if (needsAttention(track)) missing += 1;
      if (track.hidden) hidden += 1;
      if (track.isExplicit ?? track.explicit) explicit += 1;
    }
    return json({
      total: tracks.length,
      noLicense,
      missing,
      hidden,
      explicit,
      genres: [...genres].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      years: [...years].map(([name, count]) => ({ name, count })).sort((a, b) => b.name.localeCompare(a.name))
    });
  }

  if (path === '/api/admin/catalog/duplicates' && method === 'GET') {
    const tracks = await loadTracks();
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const groups = new Map();
    for (const track of tracks) {
      const key = recordingKey(track);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(track);
    }
    let list = [...groups.values()].filter(group => group.length > 1);
    if (q) list = list.filter(group => group.some(track => (track.title + ' ' + track.artist).toLowerCase().includes(q)));
    return json({
      total: list.length,
      offset,
      items: list.slice(offset, offset + 15).map(group => ({
        key: recordingKey(group[0]),
        tracks: group.map(track => ({ id: track.id, title: track.title, artist: track.artist, seconds: track.seconds, album: track.albumTitle || '', hidden: Boolean(track.hidden) }))
      })),
      next: offset + 15 < list.length ? offset + 15 : null
    });
  }

  if (path === '/api/admin/catalog/bulk' && method === 'POST') {
    const payload = await readJSON(req, 65536);
    if (!payload) return json({ error: 'body_required' }, 400);
    const tracks = await loadTracks();
    return await applyBulk(env, payload, tracks);
  }

  return json({ error: 'not_found' }, 404);
}

async function applyBulk(env, payload, tracks) {
  const ids = Array.isArray(payload?.ids) ? [...new Set(payload.ids.filter(id => typeof id === 'string'))].slice(0, 500) : [];
  const action = payload?.action;
  if (!ids.length) return json({ error: 'ids_required' }, 400);
  const known = new Set(tracks.map(track => track.id));
  const valid = ids.filter(id => known.has(id));
  if (!valid.length) return json({ error: 'unknown_tracks' }, 404);

  const patch = {};
  if (action === 'hide') patch.hidden = true;
  else if (action === 'unhide') patch.hidden = false;
  else if (action === 'genre') { if (typeof payload.value !== 'string' || !payload.value.trim()) return json({ error: 'value_required' }, 400); patch.genre = payload.value.trim().slice(0, 80); }
  else if (action === 'license') { if (typeof payload.value !== 'string') return json({ error: 'value_required' }, 400); patch.license = payload.value.trim().slice(0, 80); }
  else if (action === 'language') { if (!['ru', 'en', 'foreign', 'mul', 'zxx', ''].includes(payload.value)) return json({ error: 'invalid_language' }, 400); patch.language = payload.value; }
  else if (action === 'explicit') { patch.isExplicit = true; patch.explicit = true; }
  else if (action === 'clean') { patch.isExplicit = false; patch.explicit = false; }
  else if (action === 'moods') { if (!Array.isArray(payload.value)) return json({ error: 'value_required' }, 400); patch.moods = payload.value.filter(v => typeof v === 'string').slice(0, 20); }
  else return json({ error: 'unknown_action' }, 400);

  for (const id of valid) await mergeCatalogOverride(env.DB, id, patch);
  await audit(env, 'catalog.' + action, valid.length + ' tracks', JSON.stringify({ patch, sample: valid.slice(0, 5) }));
  return json({ ok: true, updated: valid.length, skipped: ids.length - valid.length, patch });
}
