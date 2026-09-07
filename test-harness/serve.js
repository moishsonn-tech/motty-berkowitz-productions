// Minimal static file server for frontend/ — no dependencies, matches this repo's zero-dep
// style for anything that doesn't need one. Used by the test harness (run.js spawns this) and
// documented in README.md as the one way to run the app locally.
require('dotenv').config({ path: require('path').join(__dirname, '.env.test') });
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'frontend');
const PORT = Number(process.env.TEST_APP_PORT) || 8934;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(ROOT, reqPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; } // no path escape
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

module.exports = { start, PORT };

if (require.main === module) {
  start().then((server) => {
    console.log(`Serving frontend/ at http://localhost:${server.address().port}`);
  });
}
