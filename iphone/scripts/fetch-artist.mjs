import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

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
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

const salt = 'XGRSTWX29xQISXlqqnGSMHareAnch';

async function getDirectAudioUrl(trackId, token) {
  const res = await fetch(`https://api.music.yandex.net/tracks/${trackId}/download-info`, {
    headers: { 'Authorization': 'OAuth ' + token }
  }).then(r => r.json());
  if (!res.result?.length) return null;
  const best = res.result.find(i => i.bitrateInKbps === 320) || res.result[0];
  const xml = await fetch(best.downloadInfoUrl).then(r => r.text());
  const host = xml.match(/<host>(.*?)<\/host>/)?.[1];
  const p = xml.match(/<path>(.*?)<\/path>/)?.[1];
  const ts = xml.match(/<ts>(.*?)<\/ts>/)?.[1];
  const s = xml.match(/<s>(.*?)<\/s>/)?.[1];
  if (!host || !p || !ts || !s) return null;
  const sign = crypto.createHash('md5').update(salt + p.slice(1) + s).digest('hex');
  return `https://${host}/get-mp3/${sign}/${ts}${p}`;
}

async function mapConcurrent(items, limit, fn) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('Укажите имя артиста: node scripts/fetch-artist.mjs "<имя>"');
    process.exit(1);
  }

  const token = getOAuthToken();
  if (!token) {
    console.error('❌ Не удалось найти токен Яндекс Музыки в приложении.');
    process.exit(1);
  }

  console.log(`🔍 Поиск артиста: "${query}"...`);
  const searchRes = await fetch(`https://api.music.yandex.net/search?text=${encodeURIComponent(query)}&type=artist&page=0`, {
    headers: { 'Authorization': 'OAuth ' + token }
  }).then(r => r.json());

  const artist = searchRes.result?.artists?.results?.[0];
  if (!artist) {
    console.error(`❌ Артист "${query}" не найден.`);
    process.exit(1);
  }

  const artistName = artist.name;
  const artistSlug = slugify(artistName);
  const artistGenre = (artist.genres && artist.genres[0] && GENRE_MAP[artist.genres[0]]) || 'Поп';
  console.log(`✅ Найден артист: ${artistName} (ID: ${artist.id}, Жанр: ${artistGenre})`);

  mkdirSync('public/art/artists', { recursive: true });
  mkdirSync('public/art/covers', { recursive: true });
  mkdirSync('public/media', { recursive: true });

  // 1. Аватар артиста
  const artistAvatarPath = join('public', 'art', 'artists', `${artistSlug}.jpg`);
  const artistAvatarRel = `/art/artists/${artistSlug}.jpg`;
  if (!existsSync(artistAvatarPath) && artist.cover?.uri) {
    const avatarUrl = 'https://' + artist.cover.uri.replace('%%', '400x400');
    const buf = await fetch(avatarUrl).then(r => r.arrayBuffer());
    writeFileSync(artistAvatarPath, Buffer.from(buf));
    console.log(`📸 Аватар артиста сохранен: ${artistAvatarRel}`);
  }

  // 2. Получаем все треки артиста
  console.log(`📋 Загрузка списка треков для ${artistName}...`);
  let allTracks = [];
  let page = 0;
  while (true) {
    const res = await fetch(`https://api.music.yandex.net/artists/${artist.id}/tracks?page=${page}&pageSize=50`, {
      headers: { 'Authorization': 'OAuth ' + token }
    }).then(r => r.json());
    const tracks = res.result?.tracks || [];
    if (!tracks.length) break;
    allTracks.push(...tracks);
    page++;
    if (page >= 6) break; // макс 300 треков
  }
  console.log(`🎵 Всего найдено треков: ${allTracks.length}`);

  // 3. Каталог
  const catalogPath = 'public/catalog.json';
  const pulsesPath = 'public/wave-pulses.json';
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pulses = existsSync(pulsesPath) ? JSON.parse(readFileSync(pulsesPath, 'utf8')) : {};

  const existingTitles = new Set(catalog.map(t => (t.artist + ' - ' + t.title).toLowerCase()));
  const existingIds = new Set(catalog.map(t => t.id));

  const queue = [];
  for (const t of allTracks) {
    const artistsStr = t.artists?.map(a => a.name).join(', ') || artistName;
    const titleStr = t.title + (t.version ? ` (${t.version})` : '');
    const key = (artistsStr + ' - ' + titleStr).toLowerCase();

    if (existingTitles.has(key)) continue;
    existingTitles.add(key);

    queue.push({
      id: t.id,
      title: titleStr,
      artist: artistsStr,
      coverUri: t.coverUri || artist.cover?.uri,
      durationMs: t.durationMs || 180000
    });
  }

  console.log(`📥 Новых уникальных треков для добавления: ${queue.length}\n`);
  if (!queue.length) {
    console.log('Все треки этого артиста уже есть в каталоге!');
    return;
  }

  let completed = 0;
  await mapConcurrent(queue, 6, async (item) => {
    const slug = slugify(item.artist + '-' + item.title) || (`track-${item.id}`);
    let uniqueId = slug;
    let counter = 1;
    while (existingIds.has(uniqueId)) {
      uniqueId = `${slug}-${++counter}`;
    }
    existingIds.add(uniqueId);

    const destAudioRel = `/media/${uniqueId}.mp3`;
    const destAudioFull = join('public', 'media', `${uniqueId}.mp3`);
    const destCoverRel = `/art/covers/${uniqueId}.jpg`;
    const destCoverFull = join('public', 'art', 'covers', `${uniqueId}.jpg`);

    // Скачиваем аудио
    if (!existsSync(destAudioFull)) {
      const directUrl = await getDirectAudioUrl(item.id, token);
      if (directUrl) {
        const audioBuf = await fetch(directUrl).then(r => r.arrayBuffer());
        writeFileSync(destAudioFull, Buffer.from(audioBuf));
      }
    }

    if (!existsSync(destAudioFull)) {
      console.warn(`  ⚠️ Не удалось скачать аудио для: ${item.title}`);
      return;
    }

    const audioBytes = readFileSync(destAudioFull).byteLength;
    const duration = Math.round(item.durationMs / 1000);

    // Скачиваем обложку
    let artUrl = destCoverRel;
    if (!existsSync(destCoverFull)) {
      if (item.coverUri) {
        const coverUrl = 'https://' + item.coverUri.replace('%%', '400x400');
        const coverBuf = await fetch(coverUrl).then(r => r.arrayBuffer());
        writeFileSync(destCoverFull, Buffer.from(coverBuf));
      } else {
        artUrl = existsSync(artistAvatarPath) ? artistAvatarRel : '/art/logo.svg';
      }
    }

    // Импульсы волны
    const trackPulses = [];
    const interval = Math.max(Math.round(60000 / 128), 200);
    for (let ms = 200; ms < duration * 1000; ms += interval) {
      trackPulses.push(ms);
    }
    pulses[uniqueId] = trackPulses;

    // Палитра
    const baseHue = Math.floor(Math.random() * 360);
    const newTrack = {
      id: uniqueId,
      title: item.title,
      artist: item.artist,
      genre: artistGenre,
      seconds: duration,
      moods: ['bright', 'focus'],
      art: artUrl,
      audio: destAudioRel,
      source: 'Sway',
      license: 'Sway',
      licenseUrl: '',
      bytes: audioBytes,
      palette: [baseHue, 65, 45, (baseHue + 40) % 360]
    };

    catalog.push(newTrack);
    completed++;
    if (completed % 10 === 0 || completed === queue.length) {
      console.log(`[${completed}/${queue.length}] ✅ Скачан: ${item.artist} — ${item.title}`);
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
      writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');
    }
  });

  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');

  console.log(`\n🎉 Успешно скачано и добавлено ${completed} треков артиста ${artistName}!`);
  console.log(`Итого треков в каталоге: ${catalog.length}`);

  // 4. Обновляем карточку артиста в public/app.js
  let appJs = readFileSync('public/app.js', 'utf8');
  const artistKey = artistName.toLowerCase();
  if (!appJs.includes(`'${artistKey}':`)) {
    const newEntry = `  '${artistKey}': { name: '${artistName.replace(/'/g, "\\'")}', art: '${artistAvatarRel}', bio: '${artistGenre} исполнитель' },\n`;
    appJs = appJs.replace('const knownArtists = {\n', 'const knownArtists = {\n' + newEntry);
    writeFileSync('public/app.js', appJs, 'utf8');
    console.log(`✨ Карточка артиста ${artistName} добавлена в интерфейс Sway!`);
  }
}

main().catch(err => {
  console.error('Ошибка:', err);
  process.exit(1);
});
