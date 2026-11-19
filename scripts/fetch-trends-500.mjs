import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

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
  try {
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
  } catch (e) {
    return null;
  }
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

function generatePalette(artist, title) {
  let hash = 0;
  const s = artist + ' - ' + title;
  for (let i = 0; i < s.length; i++) hash = (hash << 5) - hash + s.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return [hue, 65, 45, 80];
}

async function main() {
  const token = getOAuthToken();
  if (!token) {
    console.error('❌ Не найден OAuth токен Яндекс Музыки.');
    process.exit(1);
  }

  const catalogPath = 'public/catalog.json';
  const pulsesPath = 'public/wave-pulses.json';
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pulses = existsSync(pulsesPath) ? JSON.parse(readFileSync(pulsesPath, 'utf8')) : {};

  // Существующие треки для строгого отсеивания дубликатов
  const existingIds = new Set(catalog.map(t => t.id));
  const existingKeys = new Set(catalog.map(t => {
    const normT = t.title.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const normA = t.artist.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return normT + '::' + normA;
  }));

  console.log(`📦 Текущий каталог: ${catalog.length} треков.`);
  console.log('📡 Сбор треков из раздела «Тренды» и «Открытия»...');

  const trendPlaylists = [
    { name: 'Громкие новинки месяца', uid: 103372440, kind: 1175 },
    { name: 'Суперлонч', uid: 103372440, kind: 2616 },
    { name: 'ТикТок Топ', uid: 103372440, kind: 2048 },
    { name: 'Фит мечты', uid: 103372440, kind: 2129 },
    { name: 'Новые хиты', uid: 103372440, kind: 1234 },
    { name: 'Хиты FM', uid: 139954184, kind: 1029 },
    { name: 'Русский рэп: открытия', uid: 103372440, kind: 2627 },
    { name: 'Русский поп: открытия', uid: 103372440, kind: 2628 },
    { name: 'Русская электроника: открытия', uid: 103372440, kind: 2630 },
    { name: 'Инди: открытия', uid: 103372440, kind: 2631 }
  ];

  const candidatePool = [];
  const poolKeys = new Set();

  for (const pl of trendPlaylists) {
    try {
      const r = await fetch(`https://api.music.yandex.net/users/${pl.uid}/playlists/${pl.kind}`, {
        headers: { 'Authorization': 'OAuth ' + token }
      }).then(res => res.json());

      const tracks = r.result?.tracks || [];
      let addedFromPl = 0;

      for (const item of tracks) {
        const tr = item.track || item;
        if (!tr || !tr.id || !tr.available) continue;

        let title = tr.title;
        if (tr.version) title += ` (${tr.version})`;
        const artist = tr.artists?.map(a => a.name).join(', ') || 'Неизвестно';

        const normT = title.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const normA = artist.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const key = normT + '::' + normA;

        // Строгая проверка: нет ли трека уже в Sway!
        if (existingIds.has(`ym-${tr.id}`) || existingIds.has(String(tr.id)) || existingKeys.has(key) || poolKeys.has(key)) {
          continue;
        }

        poolKeys.add(key);
        candidatePool.push({
          yandexTrack: tr,
          title,
          artist,
          playlist: pl.name
        });
        addedFromPl++;
      }
      console.log(`  + [${pl.name}]: найдено ${addedFromPl} новых уникальных треков`);
    } catch (err) {
      console.error(`  - Ошибка загрузки [${pl.name}]:`, err.message);
    }
  }

  console.log(`🎯 Всего уникальных новых треков из трендов: ${candidatePool.length}`);
  const targetTracks = candidatePool.slice(0, 500);
  console.log(`🚀 Отобрано для загрузки: ${targetTracks.length} треков (цель: 500).`);

  mkdirSync('public/art/covers', { recursive: true });
  mkdirSync('public/media', { recursive: true });

  let successCount = 0;
  let failCount = 0;
  const newEntries = [];

  // 8 параллельных потоков для быстрой и стабильной загрузки
  await mapConcurrent(targetTracks, 8, async (item, idx, total) => {
    const tr = item.yandexTrack;
    const trackId = tr.id;
    let baseSlug = slugify(`${tr.artists?.[0]?.name || 'track'}-${item.title}`);
    if (!baseSlug) baseSlug = `ym-${trackId}`;

    let slug = baseSlug;
    let counter = 1;
    while (existingIds.has(slug)) {
      slug = `${baseSlug}-${++counter}`;
    }
    existingIds.add(slug);

    try {
      // 1. MP3 320 kbps
      const audioUrl = await getDirectAudioUrl(trackId, token);
      if (!audioUrl) {
        failCount++;
        return;
      }

      const mediaPath = join('public', 'media', `${slug}.mp3`);
      const audioRel = `/media/${slug}.mp3`;

      if (!existsSync(mediaPath)) {
        const audioBuf = await fetch(audioUrl).then(r => r.arrayBuffer());
        writeFileSync(mediaPath, Buffer.from(audioBuf));
      }

      // 2. Обложка альбома 400x400
      const coverUri = tr.coverUri || tr.albums?.[0]?.coverUri;
      const coverPath = join('public', 'art', 'covers', `${slug}.jpg`);
      const artRel = `/art/covers/${slug}.jpg`;

      if (coverUri && !existsSync(coverPath)) {
        const coverUrl = 'https://' + coverUri.replace('%%', '400x400');
        const coverBuf = await fetch(coverUrl).then(r => r.arrayBuffer());
        writeFileSync(coverPath, Buffer.from(coverBuf));
      }

      // 3. Метаданные
      const seconds = Math.round((tr.durationMs || 180000) / 1000);
      const genre = (tr.albums?.[0]?.genre && GENRE_MAP[tr.albums[0].genre]) || 'Рэп / Хип-хоп';
      const bytes = existsSync(mediaPath) ? readFileSync(mediaPath).length : 5000000;
      const palette = generatePalette(item.artist, item.title);

      const entry = {
        id: slug,
        title: item.title,
        artist: item.artist,
        genre,
        seconds,
        moods: ['bright', 'focus'],
        art: existsSync(coverPath) ? artRel : '/art/covers/default.jpg',
        audio: audioRel,
        source: 'Sway',
        license: 'Sway',
        licenseUrl: '',
        bytes,
        palette
      };

      newEntries.push(entry);
      pulses[slug] = generatePulses(seconds);
      successCount++;
      if (successCount % 25 === 0 || successCount === total) {
        console.log(`⚡ [${successCount}/${total}] Загружено треков (${Math.round(successCount / total * 100)}%) | Последний: ${item.artist} - ${item.title}`);
      }
    } catch (err) {
      failCount++;
    }
  });

  console.log(`\n🎉 Загрузка завершена! Успешно: ${newEntries.length}, Ошибок: ${failCount}`);

  // Сохраняем обновленный каталог
  if (newEntries.length) {
    catalog.push(...newEntries);
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    writeFileSync(pulsesPath, JSON.stringify(pulses), 'utf8');
    console.log(`💾 Каталог сохранен! Теперь в приложении всего: ${catalog.length} треков!`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
