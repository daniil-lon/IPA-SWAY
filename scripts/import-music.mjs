import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const FFMPEG = 'C:\\Users\\Даниил\\AppData\\Local\\Python\\pythoncore-3.15-64\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v9.0.2.exe';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function parseFilename(fileName) {
  const base = fileName.replace(/\.[^/.]+$/, '').trim();
  const parts = base.split(/\s*[-—–]\s*/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return { artist, title };
  }
  return { artist: 'Sway Artist', title: base };
}

function probeAudio(filePath) {
  try {
    const out = execFileSync(FFMPEG, ['-i', filePath], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return parseProbeOutput(out);
  } catch (err) {
    // ffmpeg exits with code 1 when no output file specified, but outputs metadata in stderr!
    return parseProbeOutput(err.stderr || err.stdout || '');
  }
}

function parseProbeOutput(text) {
  const result = { duration: 0, artist: '', title: '', genre: '', hasCover: false };
  
  // Duration: 00:01:44.05
  const durMatch = /Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/.exec(text);
  if (durMatch) {
    const hours = parseInt(durMatch[1], 10);
    const mins = parseInt(durMatch[2], 10);
    const secs = parseFloat(durMatch[3]);
    result.duration = Math.round(hours * 3600 + mins * 60 + secs);
  }

  // Metadata
  const artistMatch = /artist\s*:\s*(.+)/i.exec(text);
  if (artistMatch) result.artist = artistMatch[1].trim();

  const titleMatch = /title\s*:\s*(.+)/i.exec(text);
  if (titleMatch) result.title = titleMatch[1].trim();

  const genreMatch = /genre\s*:\s*(.+)/i.exec(text);
  if (genreMatch) result.genre = genreMatch[1].trim();

  if (/Video:\s*mjpeg/i.test(text) || /attached pic/i.test(text)) {
    result.hasCover = true;
  }

  return result;
}

function mapGenre(raw, folderName) {
  const lower = (raw + ' ' + folderName).toLowerCase();
  if (lower.includes('рэп') || lower.includes('реп') || lower.includes('rap') || lower.includes('rusrap') || lower.includes('хип')) return 'Рэп / Хип-хоп';
  if (lower.includes('drill') || lower.includes('дрил')) return 'Дрилл';
  if (lower.includes('trap') || lower.includes('трэп')) return 'Трэп';
  if (lower.includes('phonk') || lower.includes('фонк')) return 'Фонк';
  if (lower.includes('рок') || lower.includes('rock')) return 'Рок';
  if (lower.includes('поп') || lower.includes('pop')) return 'Поп';
  if (lower.includes('инди') || lower.includes('indie')) return 'Инди';
  if (lower.includes('lofi') || lower.includes('лоуфай')) return 'Лоу-фай';
  if (lower.includes('электро') || lower.includes('electro') || lower.includes('edm')) return 'Электроника';
  return 'Рэп / Хип-хоп';
}

function detectMoods(genre, title) {
  const lower = (genre + ' ' + title).toLowerCase();
  if (lower.includes('инструментал') || lower.includes('instrumental') || lower.includes('фокус')) {
    return ['focus', 'night'];
  }
  if (lower.includes('спокойн') || lower.includes('тиш') || lower.includes('дождь')) {
    return ['calm', 'night'];
  }
  return ['bright', 'focus'];
}

function findCoverImage(audioFilePath, dirPath) {
  const base = basename(audioFilePath, extname(audioFilePath));
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const candidate = join(dirPath, base + ext);
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    for (const name of ['cover', 'folder', 'art', 'front']) {
      const candidate = join(dirPath, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function convertCover(srcImage, destPath) {
  // Center-crop and scale to 400x400 JPG using ffmpeg
  try {
    execFileSync(FFMPEG, [
      '-y', '-i', srcImage,
      '-vf', 'scale=400:400:force_original_aspect_ratio=increase,crop=400:400',
      '-q:v', '2',
      destPath
    ], { stdio: 'pipe' });
    return true;
  } catch (err) {
    console.error('Failed to convert cover:', err.message);
    return false;
  }
}

function extractCover(audioPath, destPath) {
  try {
    execFileSync(FFMPEG, [
      '-y', '-i', audioPath,
      '-an', '-vcodec', 'copy',
      destPath
    ], { stdio: 'pipe' });
    return true;
  } catch (err) {
    return false;
  }
}

function transcodeToMp3(srcAudio, destMp3) {
  execFileSync(FFMPEG, [
    '-y', '-i', srcAudio,
    '-vn', '-c:a', 'libmp3lame', '-b:a', '320k',
    destMp3
  ], { stdio: 'pipe' });
}

export async function importFolder(targetDir) {
  console.log(`\n🎧 Начинаем сканирование папки: ${targetDir}`);
  if (!existsSync(targetDir)) {
    console.error(`Папка не найдена: ${targetDir}`);
    return;
  }

  mkdirSync('public/media', { recursive: true });
  mkdirSync('public/art/covers', { recursive: true });

  const catalogPath = 'public/catalog.json';
  const pulsesPath = 'public/wave-pulses.json';
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pulses = existsSync(pulsesPath) ? JSON.parse(readFileSync(pulsesPath, 'utf8')) : {};
  const existingAudio = new Set(catalog.map(t => t.audio));
  const existingIds = new Set(catalog.map(t => t.id));

  // Find all audio files recursively
  const audioExtensions = new Set(['.mp3', '.flac', '.wav', '.m4a', '.ogg']);
  const audioFiles = [];

  function scan(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        scan(full);
      } else if (audioExtensions.has(extname(entry).toLowerCase())) {
        audioFiles.push(full);
      }
    }
  }

  scan(targetDir);
  console.log(`Найдено аудиофайлов: ${audioFiles.length}`);

  let addedCount = 0;

  for (const file of audioFiles) {
    const ext = extname(file).toLowerCase();
    const fileName = basename(file);
    const parentFolder = basename(dirname(file));

    console.log(`\n🔍 Обработка: ${fileName} (${parentFolder})`);

    const probe = probeAudio(file);
    const parsed = parseFilename(fileName);

    const artist = probe.artist || parsed.artist;
    const title = probe.title || parsed.title;
    const duration = probe.duration || 180;
    const genre = mapGenre(probe.genre, parentFolder);
    const moods = detectMoods(genre, title);

    const slug = slugify(artist + '-' + title) || ('track-' + Math.random().toString(36).slice(2, 8));
    let uniqueId = slug;
    let counter = 1;
    while (existingIds.has(uniqueId)) {
      uniqueId = `${slug}-${++counter}`;
    }

    const destAudioRel = `/media/${uniqueId}.mp3`;
    const destAudioFull = join('public', 'media', `${uniqueId}.mp3`);

    if (existingAudio.has(destAudioRel) && existsSync(destAudioFull)) {
      console.log(`  ⏩ Уже в каталоге: ${uniqueId}`);
      continue;
    }

    // 1. Audio processing
    console.log(`  🎵 Кодирование в MP3 320k: ${destAudioRel}`);
    if (ext === '.mp3') {
      copyFileSync(file, destAudioFull);
    } else {
      transcodeToMp3(file, destAudioFull);
    }
    const audioBytes = statSync(destAudioFull).size;

    // 2. Cover processing
    const destCoverRel = `/art/covers/${uniqueId}.jpg`;
    const destCoverFull = join('public', 'art', 'covers', `${uniqueId}.jpg`);
    let hasCover = false;

    const localImage = findCoverImage(file, dirname(file));
    if (localImage) {
      console.log(`  🖼️ Найдена обложка в папке: ${basename(localImage)}`);
      hasCover = convertCover(localImage, destCoverFull);
    } else if (probe.hasCover) {
      console.log(`  🖼️ Извлечение обложки из тегов трека...`);
      const tempExtract = join('public', 'art', 'covers', `temp_${uniqueId}.jpg`);
      if (extractCover(file, tempExtract)) {
        hasCover = convertCover(tempExtract, destCoverFull);
        try { execFileSync('cmd.exe', ['/c', 'del', tempExtract]); } catch {}
      }
    }

    const artUrl = hasCover ? destCoverRel : '/art/logo.svg';

    // 3. Audio pulses generation (for wave visualizer)
    const trackPulses = [];
    const interval = Math.max(Math.round(60000 / 128), 200); // ~128 BPM
    for (let ms = 200; ms < duration * 1000; ms += interval) {
      trackPulses.push(ms);
    }
    pulses[uniqueId] = trackPulses;

    const newTrack = {
      id: uniqueId,
      title,
      artist,
      genre,
      seconds: duration,
      addedAt: new Date().toISOString(),
      moods,
      art: artUrl,
      audio: destAudioRel,
      source: 'Sway',
      license: 'Sway',
      licenseUrl: '',
      bytes: audioBytes,
      palette: [Math.floor(Math.random() * 360), 65, 45, Math.floor(Math.random() * 360)]
    };

    catalog.push(newTrack);
    existingAudio.add(destAudioRel);
    existingIds.add(uniqueId);
    addedCount++;

    console.log(`  ✅ Добавлен трек: "${title}" — ${artist} (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})`);
  }

  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');

  console.log(`\n🎉 Готово! Успешно добавлено ${addedCount} новых треков в Sway!`);
  console.log(`Всего треков в каталоге: ${catalog.length}`);
}

const inputFolder = process.argv[2] || 'C:\\Users\\Даниил\\Music\\МУЗЛО ДЛЯ SWAY';
importFolder(inputFolder);
