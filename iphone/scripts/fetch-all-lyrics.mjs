import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function parseLRC(value) {
  if (typeof value !== 'string') return [];
  const offset = Number(value.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const lines = [];
  for (const raw of value.slice(0, 100000).split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.slice(stamps.at(-1).index + stamps.at(-1)[0].length).trim();
    if (!text) continue;
    for (const stamp of stamps) {
      const at = Number(stamp[1]) * 60 + Number(stamp[2].replace(':', '.')) + offset;
      if (Number.isFinite(at) && at >= 0) lines.push({ at: Math.round(at * 100) / 100, text });
    }
  }
  return lines.sort((a, b) => a.at - b.at).slice(0, 2000);
}

function normalize(s) {
  return String(s || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
}

async function fetchWithRetry(url, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'Lrclib-Client': 'Sway/1.0 (https://tonika-music.905589xx.workers.dev)'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (res.status === 404) return null;
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      if (res.ok) return await res.json();
    } catch (e) {
      if (attempt === maxRetries) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

async function findLyrics(track) {
  const cleanTitle = track.title.replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').trim();
  const primaryArtist = track.artist.split(/[,/&]/)[0].trim();

  // 1. Exact lookup
  const getParams = new URLSearchParams({
    track_name: cleanTitle,
    artist_name: primaryArtist
  });
  if (track.seconds) getParams.set('duration', Math.round(track.seconds));

  let data = await fetchWithRetry(`https://lrclib.net/api/get?${getParams.toString()}`);
  if (data && (data.syncedLyrics || data.plainLyrics)) {
    return data;
  }

  // 2. Search lookup
  const searchParams = new URLSearchParams({
    q: `${cleanTitle} ${primaryArtist}`
  });
  const results = await fetchWithRetry(`https://lrclib.net/api/search?${searchParams.toString()}`);
  if (Array.isArray(results) && results.length > 0) {
    const normTrack = normalize(cleanTitle);
    const normArtist = normalize(primaryArtist);

    const match = results.find(r => {
      const rTrack = normalize(r.trackName);
      const rArtist = normalize(r.artistName);
      const titleMatch = rTrack === normTrack || rTrack.includes(normTrack) || normTrack.includes(rTrack);
      const artistMatch = rArtist.includes(normArtist) || normArtist.includes(rArtist);
      return titleMatch && (artistMatch || results.length === 1);
    }) || results[0];

    if (match && (match.syncedLyrics || match.plainLyrics)) {
      return match;
    }
  }

  return null;
}

async function main() {
  const catalogPath = 'public/catalog.json';
  const lyricsDir = 'public/lyrics';
  mkdirSync(lyricsDir, { recursive: true });

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  console.log(`🎵 Всего треков в каталоге: ${catalog.length}`);

  let foundCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;

  // Проверяем сколько уже сохранено
  for (const t of catalog) {
    const file = join(lyricsDir, `${t.id}.json`);
    if (existsSync(file)) skippedCount++;
  }
  console.log(`⚡ Уже есть тексты для ${skippedCount} треков. Начинаем сбор для остальных...`);

  const concurrency = 6;
  let index = 0;

  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    while (index < catalog.length) {
      const i = index++;
      const t = catalog[i];
      const file = join(lyricsDir, `${t.id}.json`);

      if (existsSync(file)) continue;

      try {
        const res = await findLyrics(t);
        if (res && (res.syncedLyrics || res.plainLyrics)) {
          const payload = {
            id: res.id,
            trackName: res.trackName || t.title,
            artistName: res.artistName || t.artist,
            plain: res.plainLyrics || '',
            synced: res.syncedLyrics || '',
            lines: parseLRC(res.syncedLyrics)
          };
          writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
          t.hasLyrics = true;
          foundCount++;
        } else {
          notFoundCount++;
        }
      } catch (err) {
        notFoundCount++;
      }

      if ((i + 1) % 50 === 0 || i === catalog.length - 1) {
        console.log(`[${i + 1}/${catalog.length}] Найдено: ${foundCount}, Пропущено: ${skippedCount}, Не найдено: ${notFoundCount}`);
      }

      // Небольшая задержка чтобы не спамить
      await new Promise(r => setTimeout(r, 120));
    }
  });

  await Promise.all(workers);

  // Сохраняем флаг hasLyrics в catalog.json
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`🎉 Сбор текстов завершен! Добавлено текстов: ${foundCount}. Всего текстов: ${foundCount + skippedCount}`);
}

main().catch(console.error);
