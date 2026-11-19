'use strict';
const http = require('node:http');
const { Readable } = require('node:stream');
const { assetResponse } = require('./local-assets.cjs');

function createPreviewServer({ port = 8798, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== `${host}:${server.address().port}`) { res.writeHead(403); res.end(); return; }
      const request = new Request(`http://${host}:${server.address().port}${req.url}`, { method: req.method, headers: req.headers });
      const response = await assetResponse(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const source = Readable.fromWeb(response.body);
        res.on('close', () => source.destroy());
        source.on('error', () => res.destroy());
        source.pipe(res);
      } else res.end();
    } catch (error) { if (!res.headersSent) res.writeHead(500); res.end('Unable to read asset'); }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
module.exports = { createPreviewServer };
if (require.main === module) createPreviewServer({ port: Number(process.env.SWAY_DESKTOP_PORT) || 8798 }).then(server => console.log(`Desktop preview: http://127.0.0.1:${server.address().port}`));
