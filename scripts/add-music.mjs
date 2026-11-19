#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const MEDIA_DIR = join(PUBLIC_DIR, 'media');
const COVERS_DIR = join(PUBLIC_DIR, 'art', 'covers');
const ARTISTS_DIR = join(PUBLIC_DIR, 'art', 'artists');
const LYRICS_DIR = join(ROOT, 'lyrics_archive');

for (const dir of [MEDIA_DIR, COVERS_DIR, ARTISTS_DIR, LYRICS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const CATALOG_FILE = join(PUBLIC_DIR, 'catalog.json');
const ALBUMS_FILE = join(PUBLIC_DIR, 'albums.json');
const ARTISTS_FILE = join(PUBLIC_DIR, 'artists.json');
const PULSES_FILE = join(PUBLIC_DIR, 'wave-pulses.json');

const GENRE_MAP = {
  'pop': 'Поп',
  'ruspop': 'Поп',
  'dance': 'Танцевальная',
  'electronic': 'Электроника',
  'hip-hop': 'Рэп / Хип-хоп',
  'rap': 'Рэп / Хип-хоп',
  'rusrap': 'Рэп / Хип-хоп',
  'rock': 'Рок',
  'rusrock': 'Рок',
  'indie': 'Инди',
  'rnb': 'R&B / Соул',
  'chanson': 'Шансон'
};

function getOAuthToken() {
  const dir = join(process.env.APPDATA, 'YandexMusicMod', 'Local Storage', 'leveldb');
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (!/\.(ldb|log)$/i.test(f)) continue;
    try {
      const content = readFileSync(join(dir, f), 'latin1');
      const m = content.match(/y0_[a-zA-Z0-9_-]{20,}/);
      if (m) return m[0];
    } catch {}
  }
  return null;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

const salt = 'XGRSTWX29xQISXlqqnGSMHareAnch';

async function getDirectAudioUrl(trackId, token) {
  try {
    const res = await fetch(`https://api.music.yandex.net/tracks/${trackId}/download-info`, {
      headers: { 'Authorization': 'OAuth ' + token },
      signal: AbortSignal.timeout(8000)
    }).then(r => r.json());
    if (!res.result?.length) return null;
    const best = res.result.find(i => i.bitrateInKbps === 320) || res.result[0];
    const xml = await fetch(best.downloadInfoUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.text());
    const host = xml.match(/<host>(.*?)<\/host>/)?.[1];
    const p = xml.match(/<path>(.*?)<\/path>/)?.[1];
    const ts = xml.match(/<ts>(.*?)<\/ts>/)?.[1];
    const s = xml.match(/<s>(.*?)<\/s>/)?.[1];
    if (!host || !p || !ts || !s) return null;
    const sign = crypto.createHash('md5').update(salt + p.slice(1) + s).digest('hex');
    return `https://${host}/get-mp3/${sign}/${ts}${p}`;
  } catch (e) {
    return null;
  }
}

function generatePulses(seconds) {
  const count = Math.max(24, Math.min(128, Math.round(seconds * 0.75)));
  const pulses = [];
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 4;
    const val = Math.round(18 + Math.sin(phase) * 12 + Math.cos(phase * 2.3) * 8 + (i % 3) * 5);
    pulses.push(Math.max(10, Math.min(48, val)));
  }
  return pulses;
}

function parseLRC(value) {
  if (typeof value !== 'string') return [];
  const offset = Number(value.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const lines = [];
  for (const raw of value.slice(0, 100000).split(/\r?\n/)) {
    const timeMatch = raw.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g);
    if (!timeMatch) continue;
    const text = raw.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    if (!text) continue;
    for (const tag of timeMatch) {
      const p = tag.slice(1, -1).split(/[:.]/);
      const sec = Number(p[0]) * 60 + Number(p[1]) + (p[2] ? Number(p[2].padEnd(3, '0')) / 1000 : 0) + offset;
      if (sec >= 0) lines.push({ time: Math.round(sec * 100) / 100, text });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

async function fetchLyrics(trackId, title, artist, token) {
  const lyricsOut = join(LYRICS_DIR, `${trackId}.json`);
  if (existsSync(lyricsOut)) return true;

  // 1. Try Yandex Music API
  try {
    const res = await fetch(`https://api.music.yandex.net/tracks/${trackId}/supplement`, {
      headers: { 'Authorization': 'OAuth ' + token },
      signal: AbortSignal.timeout(6000)
    }).then(r => r.json());
    if (res.result?.lyrics) {
      const syncLrc = res.result.lyrics.syncLyrics || res.result.lyrics.fullLyrics;
      const parsed = parseLRC(syncLrc);
      const data = {
        id: trackId,
        title,
        artist,
        synced: parsed.length > 0,
        plainLyrics: res.result.lyrics.fullLyrics || '',
        syncedLyrics: parsed
      };
      writeFileSync(lyricsOut, JSON.stringify(data, null, 2), 'utf8');
      return true;
    }
  } catch {}

  // 2. Try LRCLIB API fallback
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const lres = await fetch(url, {
      headers: { 'User-Agent': 'SwayMusicBot/2.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (lres.ok) {
      const ldata = await lres.json();
      const parsed = ldata.syncedLyrics ? parseLRC(ldata.syncedLyrics) : [];
      const data = {
        id: trackId,
        title,
        artist,
        synced: parsed.length > 0,
        plainLyrics: ldata.plainLyrics || '',
        syncedLyrics: parsed
      };
      writeFileSync(lyricsOut, JSON.stringify(data, null, 2), 'utf8');
      return true;
    }
  } catch {}

  return false;
}

async function main() {
  const args = process.argv.slice(2);
  let targetArtist = null;
  let targetChart = false;
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--artist' && args[i + 1]) targetArtist = args[++i];
    else if (args[i] === '--chart') targetChart = true;
    else if (args[i] === '--tracks' && args[i + 1]) limit = parseInt(args[++i], 10);
  }

  if (!targetArtist && !targetChart) {
    console.log('Использование:');
    console.log('  node scripts/add-music.mjs --artist "Имя Артиста" [--tracks 30]');
    console.log('  node scripts/add-music.mjs --chart [--tracks 100]');
    process.exit(1);
  }

  const token = getOAuthToken();
  if (!token) {
    console.error('❌ Не найден OAuth-токен Яндекс Музыки в приложении.');
    process.exit(1);
  }
  console.log('🔑 Авторизован с Яндекс Музыкой.');

  const catalog = existsSync(CATALOG_FILE) ? JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) : [];
  const albums = existsSync(ALBUMS_FILE) ? JSON.parse(readFileSync(ALBUMS_FILE, 'utf8')) : [];
  const artists = existsSync(ARTISTS_FILE) ? JSON.parse(readFileSync(ARTISTS_FILE, 'utf8')) : [];
  const pulses = existsSync(PULSES_FILE) ? JSON.parse(readFileSync(PULSES_FILE, 'utf8')) : {};

  const existingIds = new Set(catalog.map(t => t.id));
  const albumMap = new Map(albums.filter(a => a && a.id).map(a => [a.id, a]));
  const artistMap = new Map(artists.filter(a => a && a.slug).map(a => [a.slug, a]));

  let rawTracks = [];
  let artistProfile = null;

  if (targetArtist) {
    console.log(`🔍 Ищу артиста: "${targetArtist}"...`);
    const searchRes = await fetch(`https://api.music.yandex.net/search?text=${encodeURIComponent(targetArtist)}&type=artist&page=0`, {
      headers: { 'Authorization': 'OAuth ' + token }
    }).then(r => r.json());

    const artObj = searchRes.result?.artists?.results?.[0];
    if (!artObj) {
      console.error(`❌ Артист "${targetArtist}" не найден.`);
      process.exit(1);
    }

    console.log(`✨ Найден артист: ${artObj.name} (ID: ${artObj.id})`);
    
    // Fetch official HD portrait
    const briefRes = await fetch(`https://api.music.yandex.net/artists/${artObj.id}/brief-info`, {
      headers: { 'Authorization': 'OAuth ' + token }
    }).then(r => r.json());

    const brief = briefRes.result || {};
    const artistSlug = slugify(artObj.name);
    let artistArt = `/art/artists/${artistSlug}.jpg`;
    const photoUrl = brief.artist?.ogImage || brief.artist?.cover?.uri;

    if (photoUrl) {
      const fullPhoto = 'https://' + photoUrl.replace('%%', '600x600');
      const photoOut = join(ARTISTS_DIR, `${artistSlug}.jpg`);
      try {
        const photoRes = await fetch(fullPhoto);
        if (photoRes.ok) {
          const buf = Buffer.from(await photoRes.arrayBuffer());
          writeFileSync(photoOut, buf);
          console.log(`🖼 Сохранено официальное HD-фото артиста: /art/artists/${artistSlug}.jpg`);
        }
      } catch (err) {
        console.warn('Не удалось скачать фото артиста:', err.message);
      }
    }

    // Artist record in artists.json
    artistProfile = {
      name: artObj.name,
      slug: artistSlug,
      art: artistArt,
      fallbackArt: '',
      trackIds: [],
      albumIds: [],
      listeners: brief.artist?.stats?.lastMonthListeners || 1200000,
      likes: String(brief.artist?.likesCount || '25 000'),
      bio: brief.artist?.description?.text || '',
      similar: (brief.similarArtists || []).slice(0, 8).map(sa => ({
        name: sa.name,
        slug: slugify(sa.name),
        art: sa.cover?.uri ? 'https://' + sa.cover.uri.replace('%%', '200x200') : `/art/artists/${slugify(sa.name)}.jpg`
      }))
    };

    // Fetch popular tracks
    const trackRes = await fetch(`https://api.music.yandex.net/artists/${artObj.id}/tracks?page=0&pageSize=${limit}`, {
      headers: { 'Authorization': 'OAuth ' + token }
    }).then(r => r.json());

    rawTracks = trackRes.result?.tracks || [];
  } else if (targetChart) {
    console.log(`📈 Загружаю текущий чарт треков...`);
    const chartRes = await fetch(`https://api.music.yandex.net/landing3?blocks=chart`, {
      headers: { 'Authorization': 'OAuth ' + token }
    }).then(r => r.json());

    const chartBlock = chartRes.result?.blocks?.find(b => b.type === 'chart');
    rawTracks = (chartBlock?.entities || []).map(e => e.data?.track).filter(Boolean).slice(0, limit);
  }

  console.log(`📦 Всего кандидатов к обработке: ${rawTracks.length}`);
  let addedCount = 0;

  for (let i = 0; i < rawTracks.length; i++) {
    const t = rawTracks[i];
    const artistName = t.artists?.map(a => a.name).join(', ') || targetArtist || 'Неизвестный';
    const mainArtist = t.artists?.[0]?.name || targetArtist;
    const title = t.title + (t.version ? ` (${t.version})` : '');
    const trackSlug = slugify(`${mainArtist}-${title}`);

    if (existingIds.has(trackSlug)) {
      console.log(`[${i+1}/${rawTracks.length}] ⏭ Уже есть: ${mainArtist} — ${title}`);
      continue;
    }

    const directAudio = await getDirectAudioUrl(t.id, token);
    if (!directAudio) {
      console.warn(`[${i+1}/${rawTracks.length}] ⚠️ Нет ссылки на 320 kbps: ${mainArtist} — ${title}`);
      continue;
    }

    // 1. Download MP3
    const audioPath = join(MEDIA_DIR, `${trackSlug}.mp3`);
    try {
      const audioRes = await fetch(directAudio);
      if (!audioRes.ok) throw new Error(`HTTP ${audioRes.status}`);
      await pipeline(audioRes.body, createWriteStream(audioPath));
    } catch (err) {
      console.warn(`[${i+1}/${rawTracks.length}] ⚠️ Сбой скачивания аудио: ${err.message}`);
      continue;
    }

    const bytes = readFileSync(audioPath).length;

    // 2. Download Cover
    const coverPath = join(COVERS_DIR, `${trackSlug}.jpg`);
    const coverUri = t.coverUri || t.albums?.[0]?.coverUri;
    if (coverUri) {
      try {
        const coverRes = await fetch('https://' + coverUri.replace('%%', '400x400'));
        if (coverRes.ok) writeFileSync(coverPath, Buffer.from(await coverRes.arrayBuffer()));
      } catch {}
    }

    // 3. Lyrics
    await fetchLyrics(trackSlug, t.title, mainArtist, token);

    // 4. Pulses & Colors
    const seconds = Math.round(t.durationMs / 1000);
    pulses[trackSlug] = generatePulses(seconds);

    // 5. Album metadata
    const albObj = t.albums?.[0];
    const albumTitle = albObj?.title || title;
    const albumSlug = slugify(albumTitle);
    if (!albumMap.has(albumSlug)) {
      albumMap.set(albumSlug, {
        id: albumSlug,
        title: albumTitle,
        art: `/art/covers/${trackSlug}.jpg`,
        artistString: artistName,
        year: albObj?.year || new Date().getFullYear(),
        type: albObj?.type === 'single' ? 'single' : 'album',
        releaseDate: albObj?.releaseDate || new Date().toISOString(),
        isExplicit: Boolean(t.contentWarning === 'explicit'),
        trackIds: [trackSlug],
        trackCount: 1
      });
    } else {
      const ex = albumMap.get(albumSlug);
      if (!ex.trackIds.includes(trackSlug)) {
        ex.trackIds.push(trackSlug);
        ex.trackCount = ex.trackIds.length;
      }
    }

    // 6. Add to catalog
    const trackItem = {
      id: trackSlug,
      title,
      artist: artistName,
      genre: GENRE_MAP[albObj?.genre] || 'Поп',
      seconds,
      moods: ['bright', 'focus'],
      art: `/art/covers/${trackSlug}.jpg`,
      audio: `/media/${trackSlug}.mp3`,
      source: 'Sway',
      license: 'Sway',
      licenseUrl: '',
      bytes,
      palette: [210, 60, 40, 80],
      artists: t.artists?.map(a => a.name) || [mainArtist],
      albumId: albumSlug,
      albumTitle: albumTitle,
      albumYear: albObj?.year || new Date().getFullYear(),
      albumType: albObj?.type === 'single' ? 'single' : 'album',
      albumReleaseDate: albObj?.releaseDate || new Date().toISOString(),
      isExplicit: Boolean(t.contentWarning === 'explicit')
    };

    catalog.push(trackItem);
    existingIds.add(trackSlug);
    addedCount++;

    if (artistProfile) {
      if (!artistProfile.fallbackArt) artistProfile.fallbackArt = trackItem.art;
      artistProfile.trackIds.push(trackSlug);
      if (!artistProfile.albumIds.includes(albumSlug)) artistProfile.albumIds.push(albumSlug);
    }

    console.log(`[${i+1}/${rawTracks.length}] ✅ Добавлен: ${mainArtist} — ${title} (${Math.round(bytes / 1024 / 1024 * 10) / 10} MB)`);
  }

  if (artistProfile) {
    artistMap.set(artistProfile.slug, artistProfile);
  }

  // Save all updated JSONs
  writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
  writeFileSync(ALBUMS_FILE, JSON.stringify([...albumMap.values()], null, 2), 'utf8');
  writeFileSync(ARTISTS_FILE, JSON.stringify([...artistMap.values()], null, 2), 'utf8');
  writeFileSync(PULSES_FILE, JSON.stringify(pulses, null, 2), 'utf8');

  console.log('\n🎉 Итог:');
  console.log(`✨ Успешно добавлено новых треков: ${addedCount}`);
  console.log(`📊 Всего треков в каталоге: ${catalog.length}`);
  console.log(`💽 Всего альбомов: ${albumMap.size}`);
  console.log(`🎤 Всего артистов: ${artistMap.size}`);
}

main().catch(console.error);
