import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const catalogPath = join('public', 'catalog.json');
const albumsPath = join('public', 'albums.json');
const artistsPath = join('public', 'artists.json');
const artistsArtDir = join('public', 'art', 'artists');

if (!existsSync(artistsArtDir)) mkdirSync(artistsArtDir, { recursive: true });

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[«»""''„“]/g, '')
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-zа-яё0-9$_\-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function splitArtists(str) {
  return [...new Set(String(str || '')
    .split(/\s*[,;/]\s*|\s+(?:&|×|feat\.?|ft\.?)\s+/iu)
    .map(s => s.trim())
    .filter(Boolean))];
}

console.log(`🎵 Обогащаем каталог (${catalog.length} треков)...`);

// Concurrency helper with gentle delay to avoid 429
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i, items.length);
      } catch (err) {
        results[i] = null;
      }
      await new Promise(r => setTimeout(r, 45));
    }
  });
  await Promise.all(workers);
  return results;
}

let foundCount = 0;
await mapConcurrent(catalog, 4, async (t, idx, total) => {
  const parts = splitArtists(t.artist);
  t.artists = parts;

  let alb = null;
  let tr = null;

  try {
    const q = encodeURIComponent(t.artist + ' ' + t.title);
    const res = await fetch(`https://api.music.yandex.net/search?text=${q}&type=track&page=0`);
    if (res.ok) {
      const data = await res.json();
      tr = data.result?.tracks?.results?.[0];
      alb = tr?.albums?.[0];
    }
  } catch (e) {}

  if (alb && alb.title) {
    t.albumId = slugify(alb.title) || slugify(t.title);
    t.albumTitle = alb.title;
    t.albumYear = alb.year || 2026;
    t.albumType = alb.type === 'single' ? 'single' : (alb.trackCount > 3 ? 'album' : 'single');
    t.albumReleaseDate = alb.releaseDate || `${t.albumYear}-01-01`;
    t.isExplicit = Boolean(tr?.contentWarning === 'explicit');
    foundCount++;
  } else {
    t.albumId = slugify(t.title);
    t.albumTitle = t.title;
    t.albumYear = 2026;
    t.albumType = 'single';
    t.albumReleaseDate = '2026-01-01';
    t.isExplicit = false;
  }

  if ((idx + 1) % 100 === 0 || idx + 1 === total) {
    console.log(`  [${idx + 1}/${total}] Треков обработано (найдено в Yandex: ${foundCount})`);
  }
});

writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
console.log(`✅ Каталог полностью обогащен!`);

// 2. Строим базу уникальных альбомов
console.log('💿 Формируем базу альбомов...');
const albumsMap = new Map();

for (const t of catalog) {
  const albId = t.albumId || slugify(t.title);
  if (!albumsMap.has(albId)) {
    albumsMap.set(albId, {
      id: albId,
      title: t.albumTitle || t.title,
      artists: t.artists || splitArtists(t.artist),
      artistString: t.artist,
      art: t.art,
      year: t.albumYear || 2026,
      type: t.albumType || 'single',
      releaseDate: t.albumReleaseDate || '2026-01-01',
      genre: t.genre || 'Поп / Рэп',
      trackIds: [],
      likes: Math.floor(10000 + Math.random() * 40000).toLocaleString('ru-RU')
    });
  }
  const alb = albumsMap.get(albId);
  if (!alb.trackIds.includes(t.id)) {
    alb.trackIds.push(t.id);
  }
  if (alb.trackIds.length >= 3) alb.type = 'album';
}

const albumsList = [...albumsMap.values()];
writeFileSync(albumsPath, JSON.stringify(albumsList, null, 2), 'utf8');
console.log(`✅ Найдено и сохранено ${albumsList.length} уникальных альбомов и синглов!`);

// 3. Формируем базу артистов
console.log('👤 Формируем базу артистов...');
const artistsMap = new Map();

for (const t of catalog) {
  const parts = t.artists || splitArtists(t.artist);
  for (const name of parts) {
    const slug = slugify(name);
    if (!slug) continue;
    if (!artistsMap.has(slug)) {
      artistsMap.set(slug, {
        name,
        slug,
        art: `/art/artists/${slug}.jpg`,
        fallbackArt: t.art,
        trackIds: [],
        albumIds: [],
        listeners: Math.floor(500000 + Math.random() * 2500000),
        likes: Math.floor(15000 + Math.random() * 60000).toLocaleString('ru-RU'),
        bio: '',
        similar: []
      });
    }
    const a = artistsMap.get(slug);
    if (!a.trackIds.includes(t.id)) a.trackIds.push(t.id);
    if (t.albumId && !a.albumIds.includes(t.albumId)) a.albumIds.push(t.albumId);
  }
}

const sortedArtists = [...artistsMap.values()].sort((a, b) => b.trackIds.length - a.trackIds.length);
console.log(`Всего уникальных артистов: ${sortedArtists.length}. Скачиваем фото и данные для топ 100...`);

const topArtists = sortedArtists.slice(0, 100);

await mapConcurrent(topArtists, 4, async (a, idx, total) => {
  const localPhotoPath = join(artistsArtDir, `${a.slug}.jpg`);
  try {
    const q = encodeURIComponent(a.name);
    const res = await fetch(`https://api.music.yandex.net/search?text=${q}&type=artist&page=0`);
    if (res.ok) {
      const data = await res.json();
      const ymArtist = data.result?.artists?.results?.[0];
      if (ymArtist) {
        if (ymArtist.cover?.uri && !existsSync(localPhotoPath)) {
          const photoUrl = 'https://' + ymArtist.cover.uri.replace('%%', '400x400');
          const photoRes = await fetch(photoUrl);
          if (photoRes.ok) {
            const buf = Buffer.from(await photoRes.arrayBuffer());
            writeFileSync(localPhotoPath, buf);
          }
        }
        if (ymArtist.id) {
          const briefRes = await fetch(`https://api.music.yandex.net/artists/${ymArtist.id}/brief-info`);
          if (briefRes.ok) {
            const briefData = await briefRes.json();
            const info = briefData.result;
            if (info?.stats?.lastMonthListeners) {
              a.listeners = info.stats.lastMonthListeners;
            }
            if (info?.similarArtists?.length) {
              a.similar = info.similarArtists.slice(0, 6).map(sim => ({
                name: sim.name,
                slug: slugify(sim.name),
                art: sim.cover?.uri ? 'https://' + sim.cover.uri.replace('%%', '400x400') : '/art/logo.svg'
              }));
            }
            if (info?.artist?.description?.text) {
              a.bio = info.artist.description.text;
            }
          }
        }
      }
    }
  } catch (err) {}

  if (!existsSync(localPhotoPath)) {
    a.art = a.fallbackArt;
  }
});

for (const a of sortedArtists.slice(100)) {
  const localPhotoPath = join(artistsArtDir, `${a.slug}.jpg`);
  if (!existsSync(localPhotoPath)) {
    a.art = a.fallbackArt;
  }
}

writeFileSync(artistsPath, JSON.stringify(sortedArtists, null, 2), 'utf8');
console.log(`🎉 Обогащение завершено! Сохранено артистов: ${sortedArtists.length}`);
