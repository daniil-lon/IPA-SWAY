import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FFMPEG = 'C:\\Users\\Даниил\\AppData\\Local\\Python\\pythoncore-3.15-64\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v9.0.2.exe';
const BASE_DIR = 'C:\\Users\\Даниил\\Music\\МУЗЛО ДЛЯ SWAY\\По артистам';
const ARTIST_DIRS = ['madk1d', 'VILLIAN', 'Koss'];

const ARTIST_FALLBACK_COVERS = {
  madk1d: '/art/artists/madk1d.jpg',
  villian: '/art/artists/villian.jpg',
  koss: '/art/artists/koss.jpg'
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function probeDuration(filePath) {
  try {
    await execFileAsync(FFMPEG, ['-i', filePath]);
    return 180;
  } catch (err) {
    const text = err.stderr || err.stdout || '';
    const durMatch = /Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/.exec(text);
    if (durMatch) {
      const hours = parseInt(durMatch[1], 10);
      const mins = parseInt(durMatch[2], 10);
      const secs = parseFloat(durMatch[3]);
      return Math.round(hours * 3600 + mins * 60 + secs);
    }
    return 180;
  }
}

async function convertCover(srcImage, destPath) {
  try {
    await execFileAsync(FFMPEG, [
      '-y', '-i', srcImage,
      '-vf', 'scale=400:400:force_original_aspect_ratio=increase,crop=400:400',
      '-q:v', '2',
      destPath
    ]);
    return true;
  } catch (err) {
    return false;
  }
}

async function transcodeToMp3(srcAudio, destMp3) {
  await execFileAsync(FFMPEG, [
    '-y', '-i', srcAudio,
    '-vn', '-c:a', 'libmp3lame', '-b:a', '256k',
    destMp3
  ]);
}

function findCoverFile(baseName, folder) {
  const exts = ['.jpg', '.jpeg', '.png', '.webp'];
  for (const ext of exts) {
    const candidate = join(BASE_DIR, folder, baseName + ext);
    if (existsSync(candidate)) return candidate;
  }
  for (const other of ARTIST_DIRS) {
    if (other === folder) continue;
    for (const ext of exts) {
      const candidate = join(BASE_DIR, other, baseName + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Concurrency helper
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

async function run() {
  console.log('🚀 Начинаем параллельный импорт (4 потока) треков по артистам (madk1d, VILLIAN, Koss)...');
  mkdirSync('public/media', { recursive: true });
  mkdirSync('public/art/covers', { recursive: true });

  const catalogPath = 'public/catalog.json';
  const pulsesPath = 'public/wave-pulses.json';
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pulses = existsSync(pulsesPath) ? JSON.parse(readFileSync(pulsesPath, 'utf8')) : {};

  const existingTitles = new Set(catalog.map(t => (t.artist + ' - ' + t.title).toLowerCase()));
  const existingIds = new Set(catalog.map(t => t.id));

  const queue = [];
  const seenKeys = new Set();

  for (const d of ARTIST_DIRS) {
    const dirPath = join(BASE_DIR, d);
    if (!existsSync(dirPath)) continue;
    const files = readdirSync(dirPath);

    for (const f of files) {
      const ext = extname(f).toLowerCase();
      if (!['.mp3', '.flac', '.wav', '.m4a', '.ogg'].includes(ext)) continue;

      const baseName = basename(f, ext);
      const parts = baseName.split(/\s*[-—–]\s*/);
      const artist = parts.length >= 2 ? parts[0].trim() : d;
      const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : baseName;
      const key = (artist + ' - ' + title).toLowerCase();

      if (seenKeys.has(key) || existingTitles.has(key)) continue;
      seenKeys.add(key);

      queue.push({
        folder: d,
        file: join(dirPath, f),
        fileName: f,
        baseName,
        artist,
        title,
        ext
      });
    }
  }

  console.log(`📋 Найдено ${queue.length} уникальных новых треков для обработки.\n`);

  let completed = 0;
  await mapConcurrent(queue, 4, async (item) => {
    const slug = slugify(item.artist + '-' + item.title) || ('track-' + Math.random().toString(36).slice(2, 8));
    let uniqueId = slug;
    let counter = 1;
    while (existingIds.has(uniqueId)) {
      uniqueId = `${slug}-${++counter}`;
    }
    existingIds.add(uniqueId);
    existingTitles.add((item.artist + ' - ' + item.title).toLowerCase());

    const destAudioRel = `/media/${uniqueId}.mp3`;
    const destAudioFull = join('public', 'media', `${uniqueId}.mp3`);
    const destCoverRel = `/art/covers/${uniqueId}.jpg`;
    const destCoverFull = join('public', 'art', 'covers', `${uniqueId}.jpg`);

    // 1. Audio
    if (!existsSync(destAudioFull)) {
      if (item.ext === '.mp3' && statSync(item.file).size < 20 * 1024 * 1024) {
        copyFileSync(item.file, destAudioFull);
      } else {
        await transcodeToMp3(item.file, destAudioFull);
      }
    }
    const audioBytes = statSync(destAudioFull).size;

    // 2. Duration
    const duration = await probeDuration(destAudioFull);

    // 3. Cover
    let artUrl = destCoverRel;
    if (!existsSync(destCoverFull)) {
      const foundCover = findCoverFile(item.baseName, item.folder);
      if (foundCover) {
        await convertCover(foundCover, destCoverFull);
      } else {
        const normArtist = item.folder.toLowerCase();
        artUrl = ARTIST_FALLBACK_COVERS[normArtist] || '/art/logo.svg';
      }
    }

    // 4. Pulses
    const trackPulses = [];
    const interval = Math.max(Math.round(60000 / 130), 200);
    for (let ms = 200; ms < duration * 1000; ms += interval) {
      trackPulses.push(ms);
    }
    pulses[uniqueId] = trackPulses;

    // 5. Track object
    const baseHue = Math.floor(Math.random() * 360);
    const newTrack = {
      id: uniqueId,
      title: item.title,
      artist: item.artist,
      genre: 'Рэп / Хип-хоп',
      seconds: duration,
      addedAt: new Date().toISOString(),
      moods: [],
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
    console.log(`[${completed}/${queue.length}] ✅ ${item.artist} — ${item.title} (${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')})`);

    // Save every 10 completions
    if (completed % 10 === 0 || completed === queue.length) {
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
      writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');
    }
  });

  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');

  console.log(`\n🎉 Все ${completed} треков успешно обработаны параллельно и добавлены в каталог Sway!`);
  console.log(`Итого треков в каталоге: ${catalog.length}`);
}

run().catch(err => {
  console.error('Ошибка импорта:', err);
  process.exit(1);
});
