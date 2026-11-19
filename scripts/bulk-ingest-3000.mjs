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

async function fetchLyrics(trackTitle, artistName, seconds) {
  try {
    const cleanTitle = trackTitle.replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').trim();
    const primaryArtist = artistName.split(/[,/&]/)[0].trim();
    const params = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: primaryArtist
    });
    if (seconds) params.set('duration', Math.round(seconds));

    let res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'Lrclib-Client': 'Sway/1.0 (https://tonika-music.905589xx.workers.dev)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const d = await res.json();
      if (d.syncedLyrics || d.plainLyrics) {
        return {
          id: d.id,
          plain: d.plainLyrics || '',
          synced: d.syncedLyrics || '',
          lines: parseLRC(d.syncedLyrics)
        };
      }
    }
  } catch {}
  return null;
}

const TOP_ARTISTS_LIST = [
  'Баста', 'Miyagi', 'Эндшпиль', 'Big Baby Tape', 'kizaru', 'MACAN', 'Zivert', 'ANNA ASTI',
  'GONE.Fludd', 'ICEGERGERT', 'Morgenshtern', 'Friendly Thug 52 NGG', 'ALBLAK 52', 'Toxi$',
  'Scally Milano', 'Heronwater', 'BUSHIDO ZHO', 'OG Buda', 'SALUKI', 'Платина', 'PHARAOH',
  'ЛСП', 'INSTASAMKA', 'Markul', 'MAYOT', 'Скриптонит', 'Oxxxymiron', 'Noize MC', 'Хаски',
  'FEDUK', 'Егор Крид', 'Клава Кока', 'Люся Чеботина', 'JONY', 'Andro', 'Elman', 'HammAli & Navai',
  'Ramil\'', 'Xcho', 'Navai', 'Мот', 'Jah Khalib', 'The Limba', 'Rakhim', 'Konfuz', 'Фогель',
  'NЮ', 'Dabro', 'Ваня Дмитриенко', 'Моя Мишель', 'Mary Gu', 'Seville', 'DEAD BLONDE', 'GSPD',
  'shadowraze', 'zxcursed', 'Серега Пират', 'pyrokinesis', 'aikko', 'polnalyubvi', 'Три дня дождя',
  'ssshhhiiittt!', 'Перемотка', 'Дора', 'Мэйби Бэйби', 'CMH', 'mzlff', 'The Hatters', 'Cream Soda',
  'Пошлая Молли', 'Kai Angel', '9mice', 'Aarne', 'LOVV66', '17 SEVENTEEN', 'blago white',
  'SODA LUV', 'SEEMEE', '163ONMYNECK', 'Pepel Nahudi', 'unki', 'madk1d', 'VILLIAN', '2hug',
  'The Weeknd', 'Billie Eilish', 'Travis Scott', 'Drake', 'Eminem', 'Kanye West', 'Dua Lipa'
];

const PLAYLISTS_LIST = [
  { name: 'Громкие новинки месяца', uid: 103372440, kind: 1175 },
  { name: 'Суперлонч', uid: 103372440, kind: 2616 },
  { name: 'ТикТок Топ', uid: 103372440, kind: 2048 },
  { name: 'Фит мечты', uid: 103372440, kind: 2129 },
  { name: 'Новые хиты', uid: 103372440, kind: 1234 },
  { name: 'Хиты FM', uid: 139954184, kind: 1029 },
  { name: 'Русский рэп: открытия', uid: 103372440, kind: 2627 },
  { name: 'Русский поп: открытия', uid: 103372440, kind: 2628 },
  { name: 'Русская электроника: открытия', uid: 103372440, kind: 2630 },
  { name: 'Инди: открытия', uid: 103372440, kind: 2631 },
  { name: 'Топ 100 России', uid: 103372440, kind: 1075 },
  { name: 'Вечные хиты', uid: 103372440, kind: 1083 },
  { name: 'Премьеры недели', uid: 103372440, kind: 1072 },
  { name: 'Рок хиты', uid: 103372440, kind: 1022 },
  { name: 'Зарубежный поп', uid: 103372440, kind: 1080 },
  { name: 'Зарубежный рэп', uid: 103372440, kind: 1081 },
  { name: 'Кальянный рэп', uid: 103372440, kind: 2408 },
  { name: 'Фонк', uid: 103372440, kind: 2435 },
  { name: 'Хип-хоп по-русски', uid: 103372440, kind: 1017 }
];

async function main() {
  const targetCount = parseInt(process.argv[2] || '3000', 10);
  console.log(`🎯 Цель: добавить до ${targetCount} новых треков с полной метаинформацией, артистами, альбомами и текстами.`);

  const token = getOAuthToken();
  if (!token) {
    console.error('❌ Не найден OAuth токен Яндекс Музыки.');
    process.exit(1);
  }

  mkdirSync('public/media', { recursive: true });
  mkdirSync('public/art/covers', { recursive: true });
  mkdirSync('public/art/artists', { recursive: true });
  mkdirSync('public/lyrics', { recursive: true });

  const catalogPath = 'public/catalog.json';
  const albumsPath = 'public/albums.json';
  const artistsPath = 'public/artists.json';
  const pulsesPath = 'public/wave-pulses.json';

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const albums = existsSync(albumsPath) ? JSON.parse(readFileSync(albumsPath, 'utf8')) : {};
  const artists = existsSync(artistsPath) ? JSON.parse(readFileSync(artistsPath, 'utf8')) : {};
  const pulses = existsSync(pulsesPath) ? JSON.parse(readFileSync(pulsesPath, 'utf8')) : {};

  const existingIds = new Set(catalog.map(t => t.id));
  const existingKeys = new Set(catalog.map(t => {
    const normT = t.title.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const normA = t.artist.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return normT + '::' + normA;
  }));

  console.log(`📦 В текущем каталоге: ${catalog.length} треков. Уникальных ключей: ${existingKeys.size}`);

  // 1. Сбор кандидатов из плейлистов
  console.log('📡 Сбор треков из плейлистов...');
  const candidates = [];
  const candidateKeys = new Set();

  function addCandidate(tr, sourceName) {
    if (!tr || !tr.id || !tr.available) return false;
    let title = tr.title;
    if (tr.version) title += ` (${tr.version})`;
    const artist = tr.artists?.map(a => a.name).join(', ') || 'Неизвестно';
    const normT = title.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const normA = artist.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const key = normT + '::' + normA;

    if (existingKeys.has(key) || candidateKeys.has(key)) return false;
    candidateKeys.add(key);
    candidates.push({ tr, title, artist, source: sourceName });
    return true;
  }

  for (const pl of PLAYLISTS_LIST) {
    try {
      const res = await fetch(`https://api.music.yandex.net/users/${pl.uid}/playlists/${pl.kind}`, {
        headers: { 'Authorization': 'OAuth ' + token },
        signal: AbortSignal.timeout(10000)
      }).then(r => r.json());
      const tracks = res.result?.tracks || [];
      let count = 0;
      for (const item of tracks) {
        if (addCandidate(item.track || item, pl.name)) count++;
      }
      console.log(`  + [${pl.name}]: +${count} новых треков (всего кандидатов: ${candidates.length})`);
    } catch (e) {
      console.warn(`  - [${pl.name}]: ошибка`, e.message);
    }
  }

  // 2. Сбор кандидатов по артистам
  console.log('📡 Сбор треков по дискографиям артистов...');
  for (const artistQuery of TOP_ARTISTS_LIST) {
    if (candidates.length >= targetCount + 500) break;
    try {
      const searchRes = await fetch(`https://api.music.yandex.net/search?text=${encodeURIComponent(artistQuery)}&type=artist&page=0`, {
        headers: { 'Authorization': 'OAuth ' + token },
        signal: AbortSignal.timeout(8000)
      }).then(r => r.json());
      const artist = searchRes.result?.artists?.results?.[0];
      if (!artist?.id) continue;

      // Получаем brief-info артиста
      try {
        const briefRes = await fetch(`https://api.music.yandex.net/artists/${artist.id}/brief-info`, {
          headers: { 'Authorization': 'OAuth ' + token },
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json());
        const b = briefRes.result;
        if (b?.artist) {
          const aSlug = slugify(b.artist.name);
          const avatarPath = join('public', 'art', 'artists', `${aSlug}.jpg`);
          if (!existsSync(avatarPath) && b.artist.cover?.uri) {
            const avatarBuf = await fetch('https://' + b.artist.cover.uri.replace('%%', '400x400')).then(r => r.arrayBuffer());
            writeFileSync(avatarPath, Buffer.from(avatarBuf));
          }
          if (!artists[aSlug]) {
            artists[aSlug] = {
              name: b.artist.name,
              slug: aSlug,
              art: `/art/artists/${aSlug}.jpg`,
              fallbackArt: `/art/artists/${aSlug}.jpg`,
              trackIds: [],
              albumIds: [],
              listeners: b.stats?.lastMonthListeners || 0,
              likes: b.artist.likesCount ? Number(b.artist.likesCount).toLocaleString('ru-RU') : '0',
              bio: b.artist.description?.text || '',
              similar: (b.similarArtists || []).slice(0, 8).map(s => ({
                name: s.name,
                slug: slugify(s.name),
                art: s.cover?.uri ? 'https://' + s.cover.uri.replace('%%', '200x200') : ''
              }))
            };
          }
        }
      } catch {}

      // Получаем треки артиста
      let page = 0;
      let artistTracksAdded = 0;
      while (page < 3) {
        const trRes = await fetch(`https://api.music.yandex.net/artists/${artist.id}/tracks?page=${page}&pageSize=50`, {
          headers: { 'Authorization': 'OAuth ' + token },
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json());
        const tracks = trRes.result?.tracks || [];
        if (!tracks.length) break;
        for (const tr of tracks) {
          if (addCandidate(tr, `Артист: ${artist.name}`)) artistTracksAdded++;
        }
        page++;
      }
      console.log(`  + [${artist.name}]: +${artistTracksAdded} треков (всего кандидатов: ${candidates.length})`);
    } catch (e) {
      console.warn(`  - [${artistQuery}]: ошибка`, e.message);
    }
  }

  console.log(`🎯 Всего уникальных кандидатов отобрано: ${candidates.length}. Лимит: ${targetCount}`);
  const targetQueue = candidates.slice(0, targetCount);

  // 3. Загрузка треков параллельно
  const concurrency = 6;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let queueIndex = 0;

  function flushData() {
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    writeFileSync(albumsPath, JSON.stringify(albums, null, 2), 'utf8');
    writeFileSync(artistsPath, JSON.stringify(artists, null, 2), 'utf8');
    writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');
  }

  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    while (queueIndex < targetQueue.length) {
      const idx = queueIndex++;
      const item = targetQueue[idx];
      const { tr, title, artist } = item;

      const trackSlug = slugify(artist + '-' + title);
      const trackId = `ym-${tr.id}`;

      if (existingIds.has(trackId) || existingIds.has(trackSlug)) {
        continue;
      }

      try {
        // 1. Прямая ссылка на MP3 (320 kbps)
        const audioUrl = await getDirectAudioUrl(tr.id, token);
        if (!audioUrl) {
          failed++;
          continue;
        }

        // Скачиваем аудио
        const audioBuf = await fetch(audioUrl, { signal: AbortSignal.timeout(25000) }).then(r => r.arrayBuffer());
        if (!audioBuf || audioBuf.byteLength < 100000) {
          failed++;
          continue;
        }

        const audioRel = `/media/${trackSlug}.mp3`;
        const audioPath = join('public', 'media', `${trackSlug}.mp3`);
        writeFileSync(audioPath, Buffer.from(audioBuf));

        // 2. Скачиваем обложку
        const coverRel = `/art/covers/${trackSlug}.jpg`;
        const coverPath = join('public', 'art', 'covers', `${trackSlug}.jpg`);
        if (tr.coverUri) {
          const coverUrl = 'https://' + tr.coverUri.replace('%%', '400x400');
          const coverBuf = await fetch(coverUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.arrayBuffer());
          writeFileSync(coverPath, Buffer.from(coverBuf));
        }

        // 3. Альбом
        const albumInfo = tr.albums?.[0];
        let albumSlug = '';
        if (albumInfo) {
          albumSlug = slugify(albumInfo.title);
          if (!albums[albumSlug]) {
            albums[albumSlug] = {
              id: albumSlug,
              title: albumInfo.title,
              artists: tr.artists?.map(a => a.name) || [artist],
              artistString: artist,
              art: coverRel,
              year: albumInfo.year || 2026,
              type: albumInfo.type || 'album',
              releaseDate: albumInfo.releaseDate || '2026-01-01T00:00:00+03:00',
              genre: (albumInfo.genre && GENRE_MAP[albumInfo.genre]) || 'Поп',
              trackIds: [],
              likes: albumInfo.likesCount ? Number(albumInfo.likesCount).toLocaleString('ru-RU') : '10 000'
            };
          }
          if (!albums[albumSlug].trackIds.includes(trackSlug)) {
            albums[albumSlug].trackIds.push(trackSlug);
          }
        }

        // 4. Артисты
        const artistNames = tr.artists?.map(a => a.name) || [artist];
        for (const aName of artistNames) {
          const aSlug = slugify(aName);
          if (!artists[aSlug]) {
            artists[aSlug] = {
              name: aName,
              slug: aSlug,
              art: coverRel,
              fallbackArt: coverRel,
              trackIds: [trackSlug],
              albumIds: albumSlug ? [albumSlug] : [],
              listeners: 500000,
              likes: '25 000',
              bio: '',
              similar: []
            };
          } else {
            if (!artists[aSlug].trackIds.includes(trackSlug)) artists[aSlug].trackIds.push(trackSlug);
            if (albumSlug && !artists[aSlug].albumIds.includes(albumSlug)) artists[aSlug].albumIds.push(albumSlug);
          }
        }

        // 5. Пульсы
        const seconds = Math.round((tr.durationMs || 180000) / 1000);
        pulses[trackSlug] = generatePulses(seconds);

        // 6. Текст песни (LRCLIB)
        let hasLyrics = false;
        try {
          const lyr = await fetchLyrics(title, artist, seconds);
          if (lyr && (lyr.plain || lyr.lines?.length)) {
            writeFileSync(join('public', 'lyrics', `${trackSlug}.json`), JSON.stringify(lyr, null, 2), 'utf8');
            hasLyrics = true;
          }
        } catch {}

        // 7. Добавляем в каталог
        const trackEntry = {
          id: trackSlug,
          title,
          artist,
          genre: (tr.albums?.[0]?.genre && GENRE_MAP[tr.albums[0].genre]) || 'Поп',
          seconds,
          moods: ['bright', 'focus'],
          art: coverRel,
          audio: audioRel,
          source: 'Sway',
          license: 'Sway',
          licenseUrl: '',
          bytes: audioBuf.byteLength,
          palette: [25, 65, 45, 80],
          artists: artistNames,
          albumId: albumSlug || undefined,
          albumTitle: albumInfo?.title || undefined,
          albumYear: albumInfo?.year || 2026,
          albumType: albumInfo?.type || 'album',
          albumReleaseDate: albumInfo?.releaseDate || '2026-01-01T00:00:00+03:00',
          isExplicit: Boolean(tr.contentWarning === 'explicit'),
          hasLyrics
        };

        catalog.push(trackEntry);
        existingIds.add(trackSlug);
        succeeded++;

      } catch (err) {
        failed++;
      } finally {
        processed++;
        if (processed % 25 === 0 || processed === targetQueue.length) {
          console.log(`🚀 [${processed}/${targetQueue.length}] Успешно: ${succeeded}, Ошибок: ${failed}, Всего в каталоге: ${catalog.length}`);
          flushData();
        }
      }
    }
  });

  await Promise.all(workers);
  flushData();

  console.log(`\n🎉 Загрузка завершена!`);
  console.log(`   Успешно добавлено треков: ${succeeded}`);
  console.log(`   Ошибок: ${failed}`);
  console.log(`   Итого треков в Sway: ${catalog.length}`);
}

main().catch(console.error);
