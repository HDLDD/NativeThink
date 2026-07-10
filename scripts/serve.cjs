// Tiny static file server for the built app
// Usage: node scripts/serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 8001;
const ROOT = path.join(__dirname, '..', 'dist', 'client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serve(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  // SPA fallback: serve index.html for any non-file request
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback
      filePath = path.join(ROOT, 'index.html');
    }
    serve(res, filePath);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Native Thinking 已启动 → http://localhost:${PORT}`);
  console.log('按 Ctrl+C 停止服务器');
});
