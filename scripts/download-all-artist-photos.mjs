import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
    .trim()
    .toLowerCase()
    .replace(/[«»""''„“]/g, '')
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-zа-яё0-9$_\-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const token = getOAuthToken();
  if (!token) {
    console.error('❌ Не удалось найти токен Яндекс Музыки.');
    process.exit(1);
  }

  mkdirSync('public/art/artists', { recursive: true });

  const artistsPath = 'public/artists.json';
  const artists = JSON.parse(readFileSync(artistsPath, 'utf8'));
  console.log(`📋 Всего артистов для проверки: ${artists.length}`);

  let updatedCount = 0;
  let downloadedCount = 0;

  await mapConcurrent(artists, 4, async (artist, idx, total) => {
    await sleep(45);
    const slug = slugify(artist.slug || artist.name);
    const localRel = `/art/artists/${slug}.jpg`;
    const localPath = join('public', 'art', 'artists', `${slug}.jpg`);

    if (existsSync(localPath)) {
      if (artist.art !== localRel) {
        artist.art = localRel;
        updatedCount++;
      }
      return;
    }

    try {
      const res = await fetch(`https://api.music.yandex.net/search?text=${encodeURIComponent(artist.name)}&type=artist&page=0`, {
        headers: { 'Authorization': 'OAuth ' + token }
      }).then(r => r.json());

      const results = res.result?.artists?.results || [];
      const match = results.find(a => a.name.toLowerCase() === artist.name.toLowerCase()) || results[0];

      if (match?.cover?.uri) {
        const imgUrl = 'https://' + match.cover.uri.replace('%%', '400x400');
        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          writeFileSync(localPath, Buffer.from(buf));
          artist.art = localRel;
          downloadedCount++;
          updatedCount++;

          if (match.id && (!artist.bio || !artist.similar?.length)) {
            try {
              const brief = await fetch(`https://api.music.yandex.net/artists/${match.id}/brief-info`, {
                headers: { 'Authorization': 'OAuth ' + token }
              }).then(r => r.json());
              if (brief.result?.artist?.description?.text) {
                artist.bio = brief.result.artist.description.text;
              }
              if (brief.result?.similarArtists?.length) {
                artist.similar = brief.result.similarArtists.slice(0, 8).map(sa => ({
                  name: sa.name,
                  slug: slugify(sa.name),
                  art: sa.cover?.uri ? 'https://' + sa.cover.uri.replace('%%', '200x200') : '/art/logo.svg'
                }));
              }
            } catch {}
          }

          if (downloadedCount % 20 === 0) {
            console.log(`[${idx+1}/${total}] Скачано ${downloadedCount} фото артистов... (последний: ${artist.name})`);
          }
        }
      }
    } catch (err) {
      // ignore network hiccups
    }
  });

  writeFileSync(artistsPath, JSON.stringify(artists, null, 2));
  console.log(`🎉 Готово! Всего скачано новых фото: ${downloadedCount}, обновлено записей: ${updatedCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
