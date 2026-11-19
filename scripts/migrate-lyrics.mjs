import fs from 'node:fs';
import path from 'node:path';
import { ProxyAgent } from 'undici';

const PROXY_URL = 'http://127.0.0.1:2080';
const ACCOUNT_ID = 'f8728339300f286484a2a6e9bfd1a915';
const DATABASE_ID = '4532cc16-3abb-4b72-b87e-e53c6f161742';
const LYRICS_DIR = path.resolve('lyrics_archive');

function getOAuthToken() {
  const tomlPath = path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml');
  const content = fs.readFileSync(tomlPath, 'utf8');
  const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('Could not find oauth_token in default.toml');
  return match[1];
}

async function queryD1(sql, params = [], token, dispatcher) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params }),
    dispatcher
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function main() {
  console.log('1. Reading lyrics files from:', LYRICS_DIR);
  const files = fs.readdirSync(LYRICS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} lyrics files.`);

  const token = getOAuthToken();
  const dispatcher = new ProxyAgent(PROXY_URL);

  const items = [];
  for (const file of files) {
    try {
      const id = file.replace(/\.json$/, '');
      const raw = fs.readFileSync(path.join(LYRICS_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      const title = data.trackName || data.title || '';
      const artist = data.artistName || data.artist || '';
      const synced = (data.synced && (typeof data.synced === 'string' ? data.synced.trim().length > 0 : Boolean(data.synced))) ? 1 : 0;
      const plain = data.plain || '';
      const lines = JSON.stringify(Array.isArray(data.lines) ? data.lines : []);
      items.push({ id, title, artist, synced, plain, lines });
    } catch (e) {
      console.warn(`Failed to parse ${file}:`, e.message);
    }
  }

  console.log(`Loaded ${items.length} records to upload.`);

  // Batch into chunks of 15 items (15 * 6 = 90 parameters per statement, strictly under Cloudflare D1 limit of 100)
  const CHUNK_SIZE = 15;
  let uploaded = 0;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const sql = `INSERT OR REPLACE INTO track_lyrics (id, title, artist, synced, plain, lines) VALUES ${placeholders};`;
    const params = [];
    for (const item of chunk) {
      params.push(item.id, item.title, item.artist, item.synced, item.plain, item.lines);
    }

    let retries = 3;
    while (retries > 0) {
      try {
        await queryD1(sql, params, token, dispatcher);
        uploaded += chunk.length;
        process.stdout.write(`\rUploaded ${uploaded}/${items.length} lyrics (${Math.round(uploaded / items.length * 100)}%)...`);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        console.warn(`\nRetry on batch ${i}: ${err.message}. Retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.log('\n2. Verifying count in D1...');
  const check = await queryD1('SELECT count(*) as total FROM track_lyrics;', [], token, dispatcher);
  console.log('D1 track_lyrics total rows:', check[0]?.results[0]?.total);
}

main().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
