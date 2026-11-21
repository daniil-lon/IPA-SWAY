import { readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const BASE = 'C:\\Users\\Даниил\\Music\\МУЗЛО ДЛЯ SWAY\\По артистам';
const DIRS = [
  'Toxi$', 'МАЯК X', 'ПЛУТТО', 'тёмный принц', 'Мэйби Бэйби',
  'OG Buda', 'ЕГОР КРИД', 'Баста', 'MIA BOYKA', 'ENZRO',
  'Kai Angel', 'Давид Туров', 'LIZOGUB', 'Милана Некрасова',
  'Вирсавия', 'ЦУЕФА', 'MOT', 'Xcho', 'By Индия',
  'Татьяна Буланова', 'Даник', 'NEXTIME', 'Дора'
];

for (const d of DIRS) {
  const p = join(BASE, d);
  if (!existsSync(p)) {
    console.log(`[${d}] DOES NOT EXIST`);
    continue;
  }
  const files = readdirSync(p);
  const audio = files.filter(f => /\.(mp3|flac|wav|m4a|ogg)$/i.test(f));
  const images = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const direct = images.find(img => {
    const name = basename(img, extname(img)).toLowerCase();
    return name === d.toLowerCase() || name === 'avatar' || name === 'artist' || name === 'photo';
  });
  console.log(`[${d}] Audio: ${audio.length}, Images: ${images.length}, Direct Avatar: ${direct || 'None (first: ' + images[0] + ')'}`);
}
