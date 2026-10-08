// Tiny static file server for the built app
// Usage: node scripts/serve.js [port]
// /api/* 反代到线上 Pages（NT_API_ORIGIN 可覆盖）。本机验收必须走这条：函数行为与线上一致；
// 不代理的话 /api/* 会落进 SPA 兜底拿到 index.html，客户端解析报 "Unexpected token '<'"。
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 8001;
const ROOT = path.join(__dirname, '..', 'dist', 'client');
const API_ORIGIN = process.env.NT_API_ORIGIN || 'https://nativethink.pages.dev';

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
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // /api/* 反代到线上 Pages Functions（本机验收时翻译 / TTS / 云同步等与线上同源）
  if (url.pathname.startsWith('/api/')) {
    const target = new URL(url.pathname + url.search, API_ORIGIN);
    const transport = target.protocol === 'https:' ? https : http;
    const proxyReq = transport.request(target, {
      method: req.method,
      headers: { ...req.headers, host: target.host },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `本地 /api 代理到 ${API_ORIGIN} 失败：${err.message}` }));
    });
    req.pipe(proxyReq);
    return;
  }

  // SPA fallback: serve index.html for any non-file request
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
  console.log(`/api/* 反代 → ${API_ORIGIN}`);
  console.log('按 Ctrl+C 停止服务器');
});
