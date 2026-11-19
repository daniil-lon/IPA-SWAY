import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

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
const salt = 'XGRSTWX29xQISXlqqnGSMHareAnch';

async function test() {
  const res = await fetch('https://api.music.yandex.net/tracks/153919218/download-info', {
    headers: { 'Authorization': 'OAuth ' + token }
  }).then(r => r.json());
  const best = res.result?.find(i => i.bitrateInKbps === 320) || res.result?.[0];
  const xml = await fetch(best.downloadInfoUrl).then(r => r.text());
  const host = xml.match(/<host>(.*?)<\/host>/)?.[1];
  const p = xml.match(/<path>(.*?)<\/path>/)?.[1];
  const ts = xml.match(/<ts>(.*?)<\/ts>/)?.[1];
  const s = xml.match(/<s>(.*?)<\/s>/)?.[1];
  const sign = crypto.createHash('md5').update(salt + p.slice(1) + s).digest('hex');
  const direct = 'https://' + host + '/get-mp3/' + sign + '/' + ts + p;
  console.log('Direct MP3 URL:', direct);
  const head = await fetch(direct, { method: 'HEAD' });
  console.log('Head status:', head.status, 'Content-Length:', head.headers.get('content-length'));
}

test().catch(console.error);
