import { readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const BASE = 'C:\\Users\\Даниил\\Music\\МУЗЛО ДЛЯ SWAY\\По артистам';

const ARTISTS = [
  { slug: 'toxi$', name: 'Toxi$', folder: 'Toxi$' },
  { slug: 'маяк-x', name: 'МАЯК X', folder: 'МАЯК X' },
  { slug: 'плутто', name: 'ПЛУТТО', folder: 'ПЛУТТО' },
  { slug: 'тёмный-принц', name: 'тёмный принц', folder: 'тёмный принц' },
  { slug: 'мэйби-бэйби', name: 'Мэйби Бэйби', folder: 'Мэйби Бэйби' },
  { slug: 'og-buda', name: 'OG Buda', folder: 'OG Buda' },
  { slug: 'егор-крид', name: 'ЕГОР КРИД', folder: 'ЕГОР КРИД' },
  { slug: 'баста', name: 'Баста', folder: 'Баста' },
  { slug: 'mia-boyka', name: 'MIA BOYKA', folder: 'MIA BOYKA' },
  { slug: 'enzro', name: 'ENZRO', folder: 'ENZRO' },
  { slug: 'kai-angel', name: 'Kai Angel', folder: 'Kai Angel' },
  { slug: 'давид-туров', name: 'Давид Туров', folder: 'Давид Туров' },
  { slug: 'lizogub', name: 'LIZOGUB', folder: 'LIZOGUB' },
  { slug: 'милана-некрасова', name: 'Милана Некрасова', folder: 'Милана Некрасова' },
  { slug: 'вирсавия', name: 'Вирсавия', folder: 'Вирсавия' },
  { slug: 'цуефа', name: 'ЦУЕФА', folder: 'ЦУЕФА' },
  { slug: 'mot', name: 'MOT', folder: 'MOT' },
  { slug: 'xcho', name: 'Xcho', folder: 'Xcho' },
  { slug: 'by-индия', name: 'By Индия', folder: 'By Индия' },
  { slug: 'татьяна-буланова', name: 'Татьяна Буланова', folder: 'Татьяна Буланова' },
  { slug: 'даник', name: 'Даник', folder: 'Даник' },
  { slug: 'nextime', name: 'NEXTIME', folder: 'NEXTIME' },
  { slug: 'дора', name: 'Дора', folder: 'Дора' }
];

for (const a of ARTISTS) {
  const p = join(BASE, a.folder);
  if (!existsSync(p)) {
    console.log(a.name, 'FOLDER MISSING');
    continue;
  }
  const files = readdirSync(p);
  const imgs = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  
  // Prefer solo track cover where filename starts with artist name
  const soloImg = imgs.find(f => f.toLowerCase().startsWith(a.name.toLowerCase() + ' -'));
  const anyImg = soloImg || imgs[0];
  console.log(`${a.name} (${a.slug}): ${anyImg || 'NO IMAGE'}`);
}
