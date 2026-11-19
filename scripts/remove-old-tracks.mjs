import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const toDeleteTitles = [
  'Dreamlike',
  'Back to Nature',
  'MindStream',
  'Fairy Lights',
  'Our Expanse',
  'Homestead',
  'Lift Motif',
  'Bells of Winter',
  'Midnight',
  'Jaunt',
  'Into the Caves',
  'Snow Day',
  'Classical Pop (Instrumental)',
  'Wandering Woodlands',
  'At 5\'pm',
  'At the End of Hope',
  'Joyfully',
  'Painful Vacation',
  'Rhythm Factory',
  'Moil',
  'Slowly Running',
  '8bit Bossa',
  'Springly Sprigs',
  'Dreams',
  'Heartbreak',
  'Day Jobs',
  'Somber Temple',
  'Deja Vu',
  'Breathe (Under The Sea)',
  'Childhood',
  'Breathe',
  'Dancing',
  'Wealthy 3',
  'Advertisements',
  'Woke 2',
  'Keep The Faith',
  'Billion',
  'Superspreader',
  'Farm',
  'Step Into Your Power',
  'Trailer',
  'La La Love',
  'Rush',
  'Mad Humans',
  'Sakuriasis',
  'Tear My Star',
  'Vox',
  'Heavenly Monster (feat. WithoutMyArmor)',
  'Beatnik',
  'Moments',
  'Too',
  'Rush 2',
  'Hard',
  'Fakie Dakie'
];

const delNorm = new Set(toDeleteTitles.map(t => t.toLowerCase().trim()));

const catalogPath = 'public/catalog.json';
const pulsesPath = 'public/wave-pulses.json';

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const pulses = JSON.parse(readFileSync(pulsesPath, 'utf8'));

const removedTracks = [];
const keptTracks = [];

for (const t of catalog) {
  if (delNorm.has(t.title.toLowerCase().trim())) {
    removedTracks.push(t);
  } else {
    keptTracks.push(t);
  }
}

console.log(`Найдено для удаления: ${removedTracks.length} треков.`);
console.log(`Остаётся в каталоге: ${keptTracks.length} треков.\n`);

// Check remaining media files to not delete shared files
const remainingAudio = new Set(keptTracks.map(t => decodeURI(t.audio)));
const remainingArt = new Set(keptTracks.map(t => decodeURI(t.art)));

let deletedAudioFiles = 0;
let deletedArtFiles = 0;

for (const t of removedTracks) {
  // Remove pulses
  delete pulses[t.id];

  // Remove audio file if not used by remaining
  const audioDecoded = decodeURI(t.audio);
  if (!remainingAudio.has(audioDecoded)) {
    const audioPath = join('public', audioDecoded);
    if (existsSync(audioPath)) {
      try {
        unlinkSync(audioPath);
        deletedAudioFiles++;
      } catch (e) {
        console.warn(`Не удалось удалить аудио ${audioPath}:`, e.message);
      }
    }
  }

  // Remove cover file if not used by remaining and not default svg/logo
  const artDecoded = decodeURI(t.art);
  if (!remainingArt.has(artDecoded) && !artDecoded.includes('logo') && !artDecoded.includes('commons')) {
    const artPath = join('public', artDecoded);
    if (existsSync(artPath)) {
      try {
        unlinkSync(artPath);
        deletedArtFiles++;
      } catch (e) {
        console.warn(`Не удалось удалить обложку ${artPath}:`, e.message);
      }
    }
  }
}

writeFileSync(catalogPath, JSON.stringify(keptTracks, null, 2), 'utf8');
writeFileSync(pulsesPath, JSON.stringify(pulses, null, 2), 'utf8');

console.log(`✅ Удалено ${removedTracks.length} треков из каталога.`);
console.log(`✅ Удалено ${deletedAudioFiles} файлов аудио и ${deletedArtFiles} файлов обложек.`);
console.log(`✅ В каталоге осталось ровно ${keptTracks.length} треков (только ваша музыка).`);
