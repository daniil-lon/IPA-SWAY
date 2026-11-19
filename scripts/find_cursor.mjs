import fs from 'fs';

for (const f of ['public/lyrics.js', 'public/lyrics.css', 'public/app.js', 'public/style.css', 'public/sway-reference.css', 'public/collection.css']) {
  if (!fs.existsSync(f)) continue;
  const c = fs.readFileSync(f, 'utf8');
  ['blink', 'cursor', 'border', 'mask-image', 'pseudo', 'pipe', 'underline', 'stripe'].forEach(w => {
    if (c.includes(w)) console.log(f, 'contains keyword:', w);
  });
}
