import { json } from './profile-store.mjs';
import { audit, flags } from './admin-ops.mjs';

// Admin audio uploads. With an R2 binding (MEDIA_BUCKET) files up to 60 MB are
// streamed to object storage; without one a small file is chunked into D1 so the
// feature still works out of the box.
const MAX_R2_BYTES = 60 * 1024 * 1024;
const MAX_D1_BYTES = 8 * 1024 * 1024;
const D1_CHUNK = 300 * 1024;

const safeArt = value => {
  const text = String(value || '').trim().slice(0, 500);
  if (!text) return '/art/logo.svg';
  return /^(https?:\/\/|\/)/i.test(text) ? text : '/art/logo.svg';
};

const parseMoods = value => {
  let list = [];
  try {
    list = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
  } catch {
    list = String(value || '').split(',');
  }
  const clean = [...new Set((Array.isArray(list) ? list : []).map(item => String(item).trim()).filter(item => item && item.length <= 40))].slice(0, 20);
  return clean.length ? clean : ['bright'];
};

export async function uploadsAdminRoute({ req, path, method, url, env }) {
  if (path !== '/api/admin/uploads') return null;
  if (!env.DB) return json({ error: 'D1 недоступна' }, 503);

  if (method === 'GET') {
    const { results = [] } = await env.DB.prepare('SELECT id, title, artist, genre, seconds, bytes, art, created_at FROM custom_tracks ORDER BY created_at DESC LIMIT 200').all();
    return json({
      items: results.map(row => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        genre: row.genre,
        seconds: Number(row.seconds) || 0,
        bytes: Number(row.bytes) || 0,
        art: row.art,
        created: row.created_at,
        audio: '/api/custom-media/' + row.id + '.mp3'
      })),
      storage: env.MEDIA_BUCKET ? 'r2' : 'd1'
    });
  }

  if (method === 'DELETE') {
    const id = String(url.searchParams.get('id') || '');
    if (!/^[a-z0-9-]{4,80}$/i.test(id)) return json({ error: 'invalid_id' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM custom_audio_chunks WHERE track_id = ?').bind(id),
      env.DB.prepare('DELETE FROM custom_tracks WHERE id = ?').bind(id)
    ]);
    if (env.MEDIA_BUCKET) {
      try { await env.MEDIA_BUCKET.delete('custom/' + id + '.mp3'); } catch {}
    }
    await audit(env, 'upload.delete', id, '');
    return json({ ok: true });
  }

  if (method !== 'POST') return json({ error: 'method' }, 405);

  const current = await flags(env);
  if (current.uploads !== '1') {
    return json({ error: 'Загрузка выключена. Включите флаг uploads в настройках.' }, 403);
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Нужен multipart/form-data' }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'Выберите аудиофайл' }, 400);
  if (file.size === 0) return json({ error: 'Файл пустой' }, 400);
  // The storage and public media route use MP3; no transcoder runs here.
  if (!/\.mp3$/i.test(file.name) || file.type && !/^(audio\/(mpeg|mp3)|application\/octet-stream)$/i.test(file.type)) {
    return json({ error: 'Поддерживается MP3. Сначала преобразуйте аудио в MP3.' }, 415);
  }

  const title = String(form.get('title') || file.name.replace(/\.[a-z0-9]+$/i, '')).trim().slice(0, 150);
  const artist = String(form.get('artist') || '').trim().slice(0, 150);
  const genre = String(form.get('genre') || 'pop').trim().slice(0, 80);
  const seconds = Math.round(Number(form.get('seconds')) || 0);
  if (!title) return json({ error: 'Укажите название' }, 400);
  if (!artist) return json({ error: 'Укажите исполнителя' }, 400);
  if (!(seconds > 0 && seconds <= 7200)) return json({ error: 'Не удалось определить длительность (укажите секунды)' }, 400);

  const bucket = env.MEDIA_BUCKET;
  const limit = bucket ? MAX_R2_BYTES : MAX_D1_BYTES;
  if (file.size > limit) {
    return json({ error: 'Файл больше ' + Math.round(limit / 1048576) + ' МБ' }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = 'custom-' + [...crypto.getRandomValues(new Uint8Array(6))].map(value => value.toString(16).padStart(2, '0')).join('');
  const art = safeArt(form.get('art'));
  const moods = parseMoods(form.get('moods'));
  const statements = [];

  if (bucket) {
    await bucket.put('custom/' + id + '.mp3', bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  } else {
    for (let index = 0; index * D1_CHUNK < bytes.length; index += 1) {
      const slice = bytes.subarray(index * D1_CHUNK, (index + 1) * D1_CHUNK);
      let binary = '';
      for (let offset = 0; offset < slice.length; offset += 1) binary += String.fromCharCode(slice[offset]);
      statements.push(env.DB.prepare('INSERT INTO custom_audio_chunks (track_id, chunk_index, data) VALUES (?, ?, ?)').bind(id, index, btoa(binary)));
    }
  }

  try {
    const metadata = env.DB.prepare(`
      INSERT INTO custom_tracks (id, title, artist, genre, seconds, moods, art, audio, source, license, bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sway', 'Sway', ?, unixepoch())
    `).bind(id, title, artist, genre, seconds, JSON.stringify(moods), art, '/api/custom-media/' + id + '.mp3', bytes.length);
    if (bucket) await metadata.run();
    else await env.DB.batch([...statements, metadata]);
  } catch (error) {
    if (bucket) { try { await bucket.delete('custom/' + id + '.mp3'); } catch {} }
    return json({ error: 'Не удалось создать трек', detail: String(error?.message || error).slice(0, 200) }, 500);
  }

  await audit(env, 'upload.create', id, title + ' — ' + artist);
  return json({ ok: true, id, audio: '/api/custom-media/' + id + '.mp3', storage: bucket ? 'r2' : 'd1' });
}
