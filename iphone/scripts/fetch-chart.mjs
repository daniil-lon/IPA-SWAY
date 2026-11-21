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

  console.log('📡 Запрос официального чарта Яндекс Музыки (Топ 100)...');
  const res = await fetch('https://api.music.yandex.net/landing3/chart', {
    headers: { 'Authorization': 'OAuth ' + token }
  }).then(r => r.json());

  const chartTracks = res.result?.chart?.tracks;
  if (!chartTracks || !chartTracks.length) {
    console.error('❌ Не удалось получить список треков чарта.');
    process.exit(1);
  }

  console.log(`✅ Получено ${chartTracks.length} треков в чарте!`);

  mkdirSync('public/art/covers', { recursive: true });
  mkdirSync('public/media', { recursive: true });

  const catalogPath = 'public/catalog.json';
  const pulsesPath = 'public/wave-pulses.json';
  const chartPath = 'public/chart.json';

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pulses = existsSync(pulsesPath) ? JSON.parse(readFileSync(pulsesPath, 'utf8')) : {};

  // Индексируем существующий каталог
  const existingById = new Map();
  const existingBySlug = new Set();
  catalog.forEach(t => {
    existingById.set(t.id, t);
    existingBySlug.add(t.id);
  });

  const chartManifest = [];
  const toDownload = [];

  for (let i = 0; i < chartTracks.length; i++) {
    const item = chartTracks[i];
    const tr = item.track;
    const chartInfo = item.chart || tr.chart || {};
    const pos = chartInfo.position || (i + 1);
    const progress = chartInfo.progress || 'same'; // 'same', 'up', 'down'
    const shift = chartInfo.shift || 0;
    const explicit = tr.contentWarning === 'explicit' || tr.disclaimers?.includes('explicit');

    const artistName = tr.artists?.map(a => a.name).join(', ') || 'Неизвестный исполнитель';
    let title = tr.title;
    if (tr.version) title += ` (${tr.version})`;

    // Ищем, есть ли уже этот трек в каталоге
    // 1. По точному ID Яндекс Музыки (ym-ID или просто ID)
    let matchedTrack = catalog.find(c => c.id === `ym-${tr.id}` || c.id === String(tr.id));
    // 2. По совпадению названия и артиста
    if (!matchedTrack) {
      const normTitle = title.toLowerCase().replace(/ё/g, 'е').trim();
      const firstArtist = tr.artists?.[0]?.name?.toLowerCase().replace(/ё/g, 'е').trim();
      matchedTrack = catalog.find(c => {
        const cTitle = c.title.toLowerCase().replace(/ё/g, 'е').trim();
        const cArtist = c.artist.toLowerCase().replace(/ё/g, 'е').trim();
        return (cTitle === normTitle || cTitle.includes(normTitle) || normTitle.includes(cTitle)) &&
               (cArtist.includes(firstArtist) || firstArtist.includes(cArtist));
      });
    }

    if (matchedTrack) {
      chartManifest.push({
        position: pos,
        progress,
        shift,
        trackId: matchedTrack.id,
        title: matchedTrack.title,
        artist: matchedTrack.artist,
        explicit: Boolean(explicit)
      });
    } else {
      let slug = slugify(`${tr.artists?.[0]?.name || 'track'}-${title}`);
      if (!slug) slug = `ym-${tr.id}`;
      let uniqueSlug = slug;
      let counter = 1;
      while (existingBySlug.has(uniqueSlug)) {
        uniqueSlug = `${slug}-${++counter}`;
      }
      existingBySlug.add(uniqueSlug);

      const targetItem = {
        position: pos,
        progress,
        shift,
        trackId: uniqueSlug,
        title,
        artist: artistName,
        explicit: Boolean(explicit),
        yandexTrack: tr
      };
      chartManifest.push(targetItem);
      toDownload.push(targetItem);
    }
  }

  console.log(`📊 Всего в чарте: ${chartManifest.length}`);
  console.log(`⚡ Уже есть в каталоге: ${chartManifest.length - toDownload.length}`);
  console.log(`📥 Нужно скачать: ${toDownload.length}`);

  let downloadedCount = 0;
  const newTracks = [];

  await mapConcurrent(toDownload, 6, async (item, idx, total) => {
    const tr = item.yandexTrack;
    const trackId = tr.id;
    const slug = item.trackId;

    try {
      // 1. Прямая ссылка на аудио 320 kbps
      const audioUrl = await getDirectAudioUrl(trackId, token);
      if (!audioUrl) {
        console.warn(`⚠️ [${idx + 1}/${total}] Не удалось получить ссылку для #${item.position}: ${item.artist} - ${item.title}`);
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

      newTracks.push(entry);
      pulses[slug] = generatePulses(seconds);
      downloadedCount++;
      console.log(`✅ [${downloadedCount}/${total}] #${item.position} Скачан: ${item.artist} - ${item.title} (${seconds}s)`);
    } catch (err) {
      console.error(`❌ Ошибка загрузки #${item.position} ${item.title}:`, err.message);
    }
  });

  // Добавляем новые треки в каталог
  if (newTracks.length) {
    catalog.push(...newTracks);
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    writeFileSync(pulsesPath, JSON.stringify(pulses), 'utf8');
    console.log(`💾 Каталог обновлен: добавлено ${newTracks.length} треков (всего в каталоге: ${catalog.length})`);
  }

  // Сохраняем итоговый chart.json с чистым манифестом
  const cleanManifest = chartManifest.map(m => ({
    position: m.position,
    progress: m.progress,
    shift: m.shift,
    trackId: m.trackId,
    title: m.title,
    artist: m.artist,
    explicit: Boolean(m.explicit)
  }));

  writeFileSync(chartPath, JSON.stringify(cleanManifest, null, 2), 'utf8');
  console.log(`🌟 Файл public/chart.json успешно записан! Топ-${cleanManifest.length} треков сохранен.`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
