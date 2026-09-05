/**
 * NativeThink — Electron main process.
 *
 * Boots the local API server (same backend code as the Cloudflare deployment),
 * then loads the built SPA from it. All data stays on this machine:
 *   - localStorage → Chromium profile in %APPDATA%/NativeThink
 *   - auth/sync KV → <userData>/data/kv.json
 */

import { app, BrowserWindow, shell, session } from 'electron';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/local-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read the local server config (bilibili SESSDATA etc.) */
function readLocalConfig(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'server-config.json'), 'utf8')) || {};
  } catch { return {}; }
}

const APP_PORT = 31745;
const isDev = !!process.env.NATIVETHINK_DEV;

let mainWindow = null;
let server = null;

// Single instance — the local server binds a fixed port
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/** Find the first free port starting at APP_PORT */
function findFreePort(start) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const probe = http.createServer();
      probe.once('error', () => tryPort(p + 1));
      probe.once('listening', () => probe.close(() => resolve(p)));
      probe.listen(p, '127.0.0.1');
    };
    tryPort(start);
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4fafa',
    title: 'NativeThink — 母语思维英语训练',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links (http/https, non-localhost) in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target) && !target.startsWith('http://127.0.0.1') && !target.startsWith('http://localhost')) {
      shell.openExternal(target);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  const port = await findFreePort(APP_PORT);

  // Detect the effective system proxy (e.g. Clash) — outbound calls to
  // Wikipedia / Google TTS need it behind restrictive networks.
  let proxy = process.env.NATIVETHINK_PROXY || null;
  if (!proxy) {
    try {
      const pac = await session.defaultSession.resolveProxy('https://en.wikipedia.org');
      const m = pac.match(/PROXY\s+([^;,\s]+)/i);
      if (m && m[1] && m[1] !== 'DIRECT') {
        proxy = m[1].startsWith('http') ? m[1] : `http://${m[1]}`;
      }
    } catch { /* proxy detection unavailable — direct connection */ }
  }

  const root = path.join(__dirname, '..');
  const dataDir = path.join(app.getPath('userData'), 'data');
  server = await startServer({
    port,
    distDir: path.join(root, 'dist', 'client'),
    functionsDir: path.join(root, 'functions'),
    dataDir,
    proxy,
  });

  // Inject B站 login state into the embedded browser session so the
  // bilibili player iframe is logged in (HD quality + AI subtitles)
  const sessdata = readLocalConfig(dataDir).bilibiliSessdata;
  if (sessdata) {
    try {
      await session.defaultSession.cookies.set({
        url: 'https://www.bilibili.com',
        name: 'SESSDATA',
        value: sessdata,
        domain: '.bilibili.com',
        path: '/',
        httpOnly: true,
        secure: true,
        expirationDate: Math.floor(Date.now() / 1000) + 180 * 24 * 3600,
      });
      console.log('[NativeThink] Bilibili SESSDATA injected into player session');
    } catch (err) {
      console.warn('[NativeThink] failed to inject SESSDATA:', err.message);
    }
  }

  // Web compatibility: B站 rejects the Electron UA on some resource paths and
  // its image CDN has hotlink protection. IMPORTANT: do NOT strip Electron
  // from the session UA globally — the renderer relies on it (isElectron())
  // to skip the silently-broken SpeechSynthesis. Spoof per-request instead.
  try {
    const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    // NOTE: this handler runs for EVERY request in the session. Any throw here
    // would stall requests (including the app's own /api fetches) — keep it
    // fully defensive.
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const headers = { ...details.requestHeaders };
        const host = new URL(details.url).hostname;
        const isBilibili = host === 'bilibili.com' || host.endsWith('.bilibili.com') ||
          host === 'hdslb.com' || host.endsWith('.hdslb.com') || host === 'bilibili.com';
        if (isBilibili) {
          headers['User-Agent'] = chromeUA;
          headers['Referer'] = 'https://www.bilibili.com/';
        }
        callback({ requestHeaders: headers });
      } catch {
        // Never stall a request because of header rewriting
        callback({ requestHeaders: details.requestHeaders });
      }
    });
  } catch { /* non-fatal */ }

  createWindow(`http://127.0.0.1:${port}`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(`http://127.0.0.1:${port}`);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  try { server?.close(); } catch { /* ignore */ }
});
