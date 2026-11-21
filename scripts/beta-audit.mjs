import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const names = process.argv.slice(2);
const origin = process.env.SWAY_ORIGIN || '';
await mkdir('artifacts/beta-audit', { recursive: true });
const results = [];
for (const name of names) {
  const started = Date.now();
  const args = ['scripts/' + name + '.mjs', ...(origin ? [origin] : [])];
  const r = spawnSync(process.execPath, args, {
    cwd: 'iphone', encoding: 'utf8', timeout: 180000,
    env: { ...process.env, TONIKA_BROWSER: process.env.TONIKA_BROWSER || 'msedge' }
  });
  const out = ((r.stdout || '') + '\n' + (r.stderr || '')).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const status = r.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : r.status === 0 ? 'PASS' : 'FAIL';
  const result = { name, status, ms: Date.now() - started, detail: out.slice(-3).join(' | ').slice(0, 320) };
  results.push(result);
  console.log(status.padEnd(7) + String(result.ms).padStart(6) + 'ms  ' + name + '  ' + result.detail);
}
await writeFile('artifacts/beta-audit/' + (process.env.SWAY_AUDIT_TAG || 'report') + '.json', JSON.stringify(results, null, 2));
console.log('SUMMARY ' + JSON.stringify(results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {})));
