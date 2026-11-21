import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

const token = getOAuthToken();
const res = await fetch('https://api.music.yandex.net/landing3?blocks=chart', {
  headers: { 'Authorization': 'OAuth ' + token }
}).then(r => r.json());

const chartBlock = res.result?.blocks?.find(b => b.type === 'chart');
console.log('chart entities sample:', JSON.stringify(chartBlock?.entities?.[0], null, 2));
