import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';

// End-to-end security checks against the real worker bundle with an in-memory
// database and asset binding. Run with: npm run check:security
const {outputFiles: [script]} = await build({entryPoints: ['worker.mjs'], bundle: true, format: 'esm', write: false});
const worker = (await import('data:text/javascript;base64,' + Buffer.from(script.text).toString('base64'))).default;

const origin = 'https://tonika.test';
const now = () => Math.floor(Date.now() / 1000);
const hashToken = value => createHash('sha256').update(value).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

const catalogText = await readFile('public/catalog.json', 'utf8');
const catalog = JSON.parse(catalogText);
const db = new DatabaseSync(':memory:');
const migrations = (await readdir('migrations')).filter(file => file.endsWith('.sql')).sort();
for (const file of migrations) db.exec(await readFile('migrations/' + file, 'utf8'));

function prepare(sql, ...params) {
  const statement = db.prepare(sql);
  return {
    bind: (...values) => prepare(sql, ...values),
    first: async () => statement.get(...params),
    all: async () => ({results: statement.all(...params)}),
    run: async () => statement.run(...params)
  };
}
const DB = {
  prepare,
  batch: async statements => {
    db.exec('BEGIN');
    try { for (const statement of statements) await statement.run(); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
};
const ASSETS = {
  fetch: async request => {
    const url = new URL(request.url);
    if (url.pathname === '/catalog.json') return new Response(catalogText, {headers: {'Content-Type': 'application/json'}});
    if (url.pathname.startsWith('/media/')) return new Response(new Uint8Array([73, 68, 51, 4]), {headers: {'Content-Type': 'audio/mpeg', 'Content-Length': '4'}});
    if (url.pathname === '/admin.html') return new Response('<html>Sway Admin HTML</html>', {headers: {'Content-Type': 'text/html; charset=utf-8'}});
    return new Response('asset', {headers: {'Cache-Control': 'public, max-age=86400'}});
  }
};
const env = {
  DB,
  ASSETS,
  REQUIRE_YANDEX_LOGIN: '0',
  PUBLIC_ORIGIN: origin,
  ADMIN_SETUP_TOKEN: 'local-setup-token-123456',
  TELEGRAM_WEBHOOK_SECRET: 'local-webhook-secret'
};
const call = (path, options = {}, target = env) => worker.fetch(new Request(origin + path, {redirect: 'manual', ...options}), target);
const cookieOf = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(name + '='))?.split(';')[0];

// Health and catalog are served without bundling the 5 MB JSON into the worker.
let response = await call('/api/health');
assert.equal(response.status, 200);
assert.equal((await response.json()).tracks, catalog.length);

response = await call('/catalog.json');
assert.equal(response.status, 200);
assert.equal((await response.json()).length, catalog.length);

response = await call('/api/catalog?offset=0');
const page = await response.json();
assert.equal(response.status, 200);
assert.equal(page.total, catalog.length);
assert.ok(page.items.length > 0 && page.items.length <= 24);

response = await call('/media/' + catalog[0].audio.replace(/^\//, ''));
assert.equal(response.status, 200);

// Admin setup is closed unless the one-time token is supplied.
response = await call('/api/admin/status');
assert.deepEqual(await response.json(), {authenticated: false, configured: false});

const setup = body => call('/api/admin/setup', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Origin: origin, ...body.headers},
  body: JSON.stringify({password: 'CorrectHorseBattery2026!'})
});
assert.equal((await setup({})).status, 403, 'setup must require the one-time token');
assert.equal((await setup({headers: {'X-Admin-Setup-Token': 'wrong'}})).status, 403);
response = await worker.fetch(new Request(origin + '/api/admin/setup', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Origin: origin},
  body: JSON.stringify({password: 'CorrectHorseBattery2026!'})
}), {...env, ADMIN_SETUP_TOKEN: ''});
assert.equal(response.status, 404, 'setup must be disabled when no setup token is configured');

response = await setup({headers: {'X-Admin-Setup-Token': env.ADMIN_SETUP_TOKEN}});
assert.equal(response.status, 200);
const adminCookie = cookieOf(response, 'sway_admin_token');
assert.ok(adminCookie);

const stored = db.prepare("SELECT value FROM admin_config WHERE key='master_password_hash'").get().value;
assert.match(stored, /^pbkdf2\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/, 'passwords must be salted PBKDF2');
assert.equal((await setup({headers: {'X-Admin-Setup-Token': env.ADMIN_SETUP_TOKEN}})).status, 403, 'second setup must be rejected');

// Password login and session lookup.
const login = password => call('/api/admin/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Origin: origin},
  body: JSON.stringify({password})
});
assert.equal((await login('wrong-password')).status, 401);
response = await login('CorrectHorseBattery2026!');
assert.equal(response.status, 200);
const sessionCookie = cookieOf(response, 'sway_admin_token');
assert.ok(sessionCookie);

response = await call('/api/admin/status', {headers: {Cookie: sessionCookie}});
assert.equal((await response.json()).authenticated, true);

// Magic links are single-use and rotate to a fresh session.
const magic = token();
db.prepare('INSERT INTO admin_sessions (hash, created_at, expiry) VALUES (?, ?, ?)').run(hashToken(magic), now(), now() + 3600);
response = await call('/api/admin/magic-login?token=' + magic);
assert.equal(response.status, 302);
const magicCookie = cookieOf(response, 'sway_admin_token');
assert.ok(magicCookie && magicCookie !== 'sway_admin_token=' + magic, 'raw magic token must not be reused as the cookie');
assert.equal((await call('/api/admin/magic-login?token=' + magic)).status, 401, 'magic link must work only once');

// Telegram webhook requires the secret header.
const webhook = headers => call('/api/telegram/webhook', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', ...headers},
  body: '{}'
});
assert.equal((await webhook({})).status, 401);
assert.equal((await webhook({'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET})).status, 200);

// Gated custom media: no session => 401, session => private response.
const gated = {...env, REQUIRE_YANDEX_LOGIN: '1'};
db.prepare('INSERT INTO custom_audio_chunks (track_id, chunk_index, data) VALUES (?, ?, ?)').run('t1', 0, Buffer.from('hello').toString('base64'));
response = await call('/api/custom-media/t1.mp3', {}, gated);
assert.equal(response.status, 401);
const userSession = token();
db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('u1', 'Tester');
db.prepare('INSERT INTO sessions (hash, uid, expiry) VALUES (?, ?, ?)').run(hashToken(userSession), 'u1', now() + 3600);
response = await call('/api/custom-media/t1.mp3', {headers: {Cookie: 'tonika_session=' + userSession}}, gated);
assert.equal(response.status, 200);
assert.equal(await response.text(), 'hello');
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');

db.close();
console.log(`security checks ok: ${migrations.length} migrations, ${catalog.length} catalog tracks`);
