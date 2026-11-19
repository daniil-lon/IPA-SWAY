import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

process.on('uncaughtException', (err) => {
  if (err?.code === 'ERR_ASSERTION') return;
  console.error('Uncaught error:', err?.message || err);
});
process.on('unhandledRejection', () => {});

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

const TARGET_TOTAL = 7000;
const CONCURRENCY = 4;

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
  'chanson': 'Шансон',
  'folk': 'Фолк',
  'metal': 'Метал',
  'soundtrack': 'Саундтреки'
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
  } catch {
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
      if (sec >= 0) lines.push({ at: Math.round(sec * 100) / 100, text });
    }
  }
  lines.sort((a, b) => a.at - b.at);
  return lines;
}

async function fetchAndSaveLyrics(trackSlug, title, artist, yandexTrackId, token) {
  const lyricsOut = join(LYRICS_DIR, `${trackSlug}.json`);
  let lyricData = null;

  // 1. Try Yandex Music API
  try {
    const res = await fetch(`https://api.music.yandex.net/tracks/${yandexTrackId}/supplement`, {
      headers: { 'Authorization': 'OAuth ' + token },
      signal: AbortSignal.timeout(6000)
    }).then(r => r.json());
    if (res.result?.lyrics) {
      const syncLrc = res.result.lyrics.syncLyrics || res.result.lyrics.fullLyrics;
      const parsed = parseLRC(syncLrc);
      lyricData = {
        trackName: title,
        artistName: artist,
        synced: parsed.length > 0,
        plain: res.result.lyrics.fullLyrics || '',
        lines: parsed
      };
    }
  } catch {}

  // 2. Try LRCLIB API fallback if not found
  if (!lyricData) {
    try {
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
      const lres = await fetch(url, {
        headers: { 'User-Agent': 'SwayMusicBot/2.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (lres.ok) {
        const ldata = await lres.json();
        const parsed = ldata.syncedLyrics ? parseLRC(ldata.syncedLyrics) : [];
        lyricData = {
          trackName: title,
          artistName: artist,
          synced: parsed.length > 0,
          plain: ldata.plainLyrics || '',
          lines: parsed
        };
      }
    } catch {}
  }

  if (lyricData) {
    writeFileSync(lyricsOut, JSON.stringify(lyricData, null, 2), 'utf8');
    return true;
  }
  return false;
}

const ARTIST_SEEDS = [
  // Russian Rap / Trap / Hip-Hop
  "Miyagi", "Эндшпиль", "Скриптонит", "Баста", "Oxxxymiron", "MACAN", "SALUKI", "PHARAOH",
  "Big Baby Tape", "Kizaru", "OG Buda", "Mayot", "163ONMYNECK", "Scally Milano", "Heronwater",
  "Friendly Thug 52 Ngg", "ALBLAK 52", "Toxi$", "Markul", "Thomas Mraz", "ATL", "ЛСП",
  "Хаски", "FEDUK", "Obladaet", "Yanix", "Guf", "Смоки Мо", "Каста", "Boulevard Depo",
  "104", "Truwer", "Aarne", "Platina", "Noize MC", "Anacondaz", "25/17", "Рем Дигга",
  "Масло черного тмина", "Mnogoznaal", "Rocket", "Lizer", "Gone.Fludd", "Bushido Zho",
  "Voskresenskii", "Kai Angel", "9mice", "Jakone", "A.V.G", "Xcho", "Janaga", "Ramil'",
  "HammAli & Navai", "Navai", "HammAli",

  // Russian Pop / R&B / Dance
  "ANNA ASTI", "Zivert", "JONY", "Мари Краймбрери", "Люся Чеботина", "Клава Кока",
  "Егор Крид", "МОТ", "Artik & Asti", "Полина Гагарина", "Сергей Лазарев", "Дима Билан",
  "МакSим", "Руки Вверх!", "Gayazov$ Brother$", "Ваня Дмитриенко", "Моя Мишель", "Dabro",
  "Cream Soda", "Хабиб", "NЮ", "Mary Gu", "Seville", "Instasamka", "Andro", "Elman",
  "Gafur", "Amirchik", "Akmal'", "escape", "Konfuz", "GSPD", "Dead Blonde", "CMH",
  "Дора", "Мэйби Бэйби", "МЭВЛ", "Фогель", "MONA", "TONI",

  // Russian Rock / Alternative / Indie
  "Три дня дождя", "ssshhhiiittt!", "Дайте танк (!)", "Сироткин", "Полматери", "Папин Олимпос",
  "The Hatters", "Порнофильмы", "Кишлак", "автоспорт", "найтивыход", "Перемотка", "Молчат Дома",
  "Король и Шут", "Кино", "Би-2", "Сплин", "Земфира", "Мумий Тролль", "Ария", "ДДТ",
  "Наутилус Помпилиус", "Гражданская Оборона", "Ляпис Трубецкой", "Пикник", "Агата Кристи",
  "Сектор Газа", "Ногу Свело!", "Чиж & Co", "Чайф", "Смысловые Галлюцинации",

  // International Rap / Hip-Hop
  "The Weeknd", "Drake", "Eminem", "Travis Scott", "Kanye West", "Kendrick Lamar",
  "Post Malone", "21 Savage", "Metro Boomin", "Future", "Lil Baby", "Gunna",
  "Playboi Carti", "Lil Uzi Vert", "A$AP Rocky", "Tyler The Creator", "Don Toliver",
  "Central Cee", "Dave", "Juice WRLD", "XXXTENTACION", "Lil Peep", "Mac Miller", "Pop Smoke",

  // International Pop / R&B
  "Taylor Swift", "Billie Eilish", "Dua Lipa", "Ariana Grande", "Lana Del Rey",
  "Rihanna", "Beyoncé", "Lady Gaga", "Katy Perry", "Miley Cyrus", "Selena Gomez",
  "Olivia Rodrigo", "Sabrina Carpenter", "SZA", "Doja Cat", "Nicki Minaj", "Cardi B",
  "Bruno Mars", "Ed Sheeran", "Justin Bieber", "Harry Styles", "Shawn Mendes", "Charlie Puth",

  // International Rock / Metal / Alternative
  "Linkin Park", "Queen", "Nirvana", "Rammstein", "Metallica", "AC/DC", "Green Day",
  "Red Hot Chili Peppers", "The Beatles", "Pink Floyd", "Guns N' Roses", "Bon Jovi",
  "Radiohead", "Muse", "System of a Down", "Slipknot", "Evanescence", "Three Days Grace",
  "Skillet", "Bring Me The Horizon", "Coldplay", "Imagine Dragons", "Arctic Monkeys",
  "The Neighbourhood", "Chase Atlantic", "Glass Animals", "Gorillaz",

  // Electronic / Dance
  "David Guetta", "Calvin Harris", "Avicii", "Daft Punk", "The Chainsmokers",
  "Marshmello", "Tiësto", "Alan Walker", "Martin Garrix", "DJ Snake", "Kygo",
  "Skrillex", "Fred again..", "Swedish House Mafia", "Robin Schulz"
];

async function main() {
  const token = getOAuthToken();
  if (!token) {
    console.error('❌ Не найден OAuth-токен Яндекс Музыки.');
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

  console.log(`📊 Текущий каталог: ${catalog.length} треков. Цель: ${TARGET_TOTAL} треков.`);
  let addedTotal = 0;

  function persist() {
    writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
    writeFileSync(ALBUMS_FILE, JSON.stringify([...albumMap.values()], null, 2), 'utf8');
    writeFileSync(ARTISTS_FILE, JSON.stringify([...artistMap.values()], null, 2), 'utf8');
    writeFileSync(PULSES_FILE, JSON.stringify(pulses), 'utf8');
  }

  // 1. Process Chart First
  try {
    console.log('\n📈 [1/2] Загрузка чарта Яндекс Музыки...');
    const chartRes = await fetch('https://api.music.yandex.net/landing3?blocks=chart', {
      headers: { 'Authorization': 'OAuth ' + token }
    }).then(r => r.json());
    const chartBlock = chartRes.result?.blocks?.find(b => b.type === 'chart');
    const chartTracks = (chartBlock?.entities || []).map(e => e.data?.track).filter(Boolean);
    console.log(`Получено ${chartTracks.length} треков из чарта.`);

    for (const t of chartTracks) {
      if (catalog.length >= TARGET_TOTAL) break;
      const res = await processSingleTrack(t, token, existingIds, catalog, albumMap, artistMap, pulses);
      if (res) {
        addedTotal++;
        console.log(`[${catalog.length}/${TARGET_TOTAL}] (+${addedTotal}) ✅ ${res.artist} — ${res.title}`);
        if (addedTotal % 10 === 0) persist();
      }
    }
  } catch (err) {
    console.warn('Сбой чарта:', err.message);
  }

  // 2. Process Artists Seeds
  console.log(`\n🎤 [2/2] Обработка топовых артистов (всего в очереди: ${ARTIST_SEEDS.length})...`);
  for (let aIdx = 0; aIdx < ARTIST_SEEDS.length; aIdx++) {
    if (catalog.length >= TARGET_TOTAL) {
      console.log(`🎉 Цель в ${TARGET_TOTAL} треков успешно достигнута!`);
      break;
    }

    const artistName = ARTIST_SEEDS[aIdx];
    try {
      const searchRes = await fetch(`https://api.music.yandex.net/search?text=${encodeURIComponent(artistName)}&type=artist&page=0`, {
        headers: { 'Authorization': 'OAuth ' + token }
      }).then(r => r.json());
      const artObj = searchRes.result?.artists?.results?.[0];
      if (!artObj) continue;

      const artistSlug = slugify(artObj.name);

      // Check artist portrait
      if (!artistMap.has(artistSlug)) {
        try {
          const briefRes = await fetch(`https://api.music.yandex.net/artists/${artObj.id}/brief-info`, {
            headers: { 'Authorization': 'OAuth ' + token }
          }).then(r => r.json());
          const brief = briefRes.result || {};
          let artistArt = `/art/artists/${artistSlug}.jpg`;
          const photoUrl = brief.artist?.ogImage || brief.artist?.cover?.uri;
          if (photoUrl) {
            const photoRes = await fetch('https://' + photoUrl.replace('%%', '600x600'));
            if (photoRes.ok) {
              writeFileSync(join(ARTISTS_DIR, `${artistSlug}.jpg`), Buffer.from(await photoRes.arrayBuffer()));
            }
          }
          artistMap.set(artistSlug, {
            name: artObj.name,
            slug: artistSlug,
            art: artistArt,
            fallbackArt: '',
            trackIds: [],
            albumIds: [],
            listeners: brief.artist?.stats?.lastMonthListeners || 1000000,
            likes: String(brief.artist?.likesCount || '50 000'),
            bio: brief.artist?.description?.text || '',
            similar: (brief.similarArtists || []).slice(0, 8).map(sa => ({
              name: sa.name,
              slug: slugify(sa.name),
              art: sa.cover?.uri ? 'https://' + sa.cover.uri.replace('%%', '200x200') : `/art/artists/${slugify(sa.name)}.jpg`
            }))
          });
        } catch {}
      }

      // Fetch top tracks
      const trackRes = await fetch(`https://api.music.yandex.net/artists/${artObj.id}/tracks?page=0&pageSize=40`, {
        headers: { 'Authorization': 'OAuth ' + token }
      }).then(r => r.json());
      const rawTracks = trackRes.result?.tracks || [];

      let addedFromArtist = 0;
      for (const t of rawTracks) {
        if (catalog.length >= TARGET_TOTAL) break;
        const res = await processSingleTrack(t, token, existingIds, catalog, albumMap, artistMap, pulses);
        if (res) {
          addedTotal++;
          addedFromArtist++;
          console.log(`[${catalog.length}/${TARGET_TOTAL}] (+${addedTotal}) ✅ ${res.artist} — ${res.title}`);
          if (addedTotal % 10 === 0) persist();
        }
      }
      if (addedFromArtist > 0) {
        persist();
      }
    } catch (err) {
      console.warn(`Ошибка обработки артиста ${artistName}:`, err.message);
    }
  }

  persist();
  console.log(`\n🎉 ГОТОВО! Каталог успешно расширен!`);
  console.log(`📊 Всего треков: ${catalog.length}`);
  console.log(`💽 Всего альбомов: ${albumMap.size}`);
  console.log(`🎤 Всего артистов: ${artistMap.size}`);
}

async function processSingleTrack(t, token, existingIds, catalog, albumMap, artistMap, pulses) {
  if (!t || !t.id || !t.title) return null;
  const mainArtist = t.artists?.[0]?.name || 'Неизвестный';
  const artistName = t.artists?.map(a => a.name).join(', ') || mainArtist;
  const title = t.title + (t.version ? ` (${t.version})` : '');
  const trackSlug = slugify(`${mainArtist}-${title}`);

  if (existingIds.has(trackSlug)) return null;

  const directAudio = await getDirectAudioUrl(t.id, token);
  if (!directAudio) return null;

  // 1. Download MP3
  const audioPath = join(MEDIA_DIR, `${trackSlug}.mp3`);
  try {
    const audioRes = await fetch(directAudio);
    if (!audioRes.ok) return null;
    await pipeline(audioRes.body, createWriteStream(audioPath));
  } catch {
    return null;
  }

  const bytes = readFileSync(audioPath).length;
  if (bytes < 100000) return null; // Reject corrupted/empty files

  // 2. Download Cover
  const coverPath = join(COVERS_DIR, `${trackSlug}.jpg`);
  const coverUri = t.coverUri || t.albums?.[0]?.coverUri;
  if (coverUri) {
    try {
      const coverRes = await fetch('https://' + coverUri.replace('%%', '400x400'));
      if (coverRes.ok) writeFileSync(coverPath, Buffer.from(await coverRes.arrayBuffer()));
    } catch {}
  }

  // 3. Lyrics (saved to archive + D1)
  await fetchAndSaveLyrics(trackSlug, t.title, mainArtist, t.id, token);

  // 4. Pulses
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

  // 6. Artist link
  const artistSlug = slugify(mainArtist);
  if (artistMap.has(artistSlug)) {
    const artRec = artistMap.get(artistSlug);
    if (!artRec.trackIds.includes(trackSlug)) artRec.trackIds.push(trackSlug);
    if (!artRec.albumIds.includes(albumSlug)) artRec.albumIds.push(albumSlug);
  }

  // 7. Track record
  const genreCode = albObj?.genre || 'pop';
  const genreLabel = GENRE_MAP[genreCode] || 'Поп';

  const newTrack = {
    id: trackSlug,
    title,
    artist: artistName,
    album: albumTitle,
    seconds,
    duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    genre: genreLabel,
    year: albObj?.year || new Date().getFullYear(),
    cover: `/art/covers/${trackSlug}.jpg`,
    audio: `/media/${encodeURIComponent(trackSlug)}.mp3`,
    bytes,
    explicit: Boolean(t.contentWarning === 'explicit'),
    palette: {
      accent: '#7c5cff',
      dark: '#14141e',
      glow: 'rgba(124, 92, 255, 0.45)',
      card: '#1b1b28',
      text: '#ffffff',
      sub: '#a0a0b8'
    }
  };

  catalog.push(newTrack);
  existingIds.add(trackSlug);

  return { title, artist: artistName };
}

main().catch(err => {
  console.error('Fatal error in main:', err);
  process.exit(1);
});
