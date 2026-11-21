'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.opus': 'audio/ogg', '.aac': 'audio/aac', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function libraryRoot(base = __dirname) {
  const bundled = path.join(base, 'public');
  if (fs.existsSync(path.join(bundled, 'catalog.json'))) return bundled;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(base, 'library.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (typeof config.sharedPublic === 'string' && fs.existsSync(path.join(config.sharedPublic, 'catalog.json'))) return path.resolve(base, config.sharedPublic);
  } catch {}
  return path.resolve(base, '../iphone/public');
}

const isInside = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);

async function resolveAsset(urlString, base = __dirname) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlString, 'http://localhost').pathname);
  } catch { return null; }
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.some(part => part.startsWith('.') || part === '..')) return null;
  const relative = parts.join(path.sep) || 'index.html';
  const publicRoot = libraryRoot(base);
  const candidates = [{ root: path.join(base, 'ui'), relative }, { root: publicRoot, relative }];
  // The archive is exposed only as individual lyric JSON files, never as a general root.
  if (parts.length === 2 && parts[0] === 'lyrics' && parts[1].endsWith('.json')) {
    candidates.push({ root: path.join(path.dirname(publicRoot), 'lyrics_archive'), relative: parts[1] });
  }
  for (const candidate of candidates) {
    try {
      const root = await fsp.realpath(candidate.root);
      const requested = path.resolve(root, candidate.relative);
      if (!isInside(root, requested)) continue;
      const file = await fsp.realpath(requested);
      if (!isInside(root, file)) continue;
      const stat = await fsp.stat(file);
      if (stat.isFile()) return { file, stat };
    } catch {}
  }
  return null;
}

async function assetResponse(request, base = __dirname) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const item = await resolveAsset(request.url, base);
  if (!item) return new Response('Not found', { status: 404 });
  return fileResponse(request, item);
}

async function fileResponse(request, item) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const { file, stat } = item;
  const headers = new Headers({
    'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Cache-Control': path.extname(file) === '.mp3' ? 'private, max-age=3600' : 'no-cache'
  });
  // Keep Chromium's audio reader bounded and allow immediate seeking in large tracks.
  let start = 0, end = stat.size - 1, status = 200;
  const range = request.headers.get('Range');
  if (range && stat.size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size || (!match[1] && Number(match[2]) === 0)) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }
    status = 206;
    headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }
  headers.set('Content-Length', String(stat.size ? end - start + 1 : 0));
  if (request.method === 'HEAD' || stat.size === 0) return new Response(null, { status, headers });
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers });
}

module.exports = { libraryRoot, resolveAsset, assetResponse, fileResponse };
