'use strict';
/** Server HTTP lokal tanpa dependensi. Hanya bind ke 127.0.0.1. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Store } = require('./store');
const { Game } = require('./game');

const PORT = Number(process.env.PORT) || 3777;
const HOST = '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TICK_MS = 20 * 1000;
const MAX_BODY = 4 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body terlalu besar'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('JSON tidak valid'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** Tolak DNS-rebinding (Host aneh) dan request lintas-origin (CSRF). */
function originAllowed(req) {
  const host = (req.headers.host || '').toLowerCase();
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return false;
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) return false;
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return false;
  }
  return true;
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  });
}

function createServer(game) {
  return http.createServer(async (req, res) => {
    try {
      if (!originAllowed(req)) return send(res, 403, 'Forbidden');
      const url = new URL(req.url, `http://${HOST}`);
      const route = `${req.method} ${url.pathname}`;

      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
        return serveStatic(req, res, url.pathname);
      }

      game.tick();
      switch (route) {
        case 'GET /api/state':
          return json(res, 200, game.snapshot());
        case 'GET /api/history': {
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
          return json(res, 200, { events: game.store.readEvents(limit) });
        }
        case 'GET /api/chat': {
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
          return json(res, 200, { messages: game.store.readChat(limit) });
        }
        case 'GET /api/samples': {
          const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours')) || 24));
          return json(res, 200, { samples: game.store.readSamples(Date.now() - hours * 3600e3) });
        }
        case 'POST /api/create': {
          const r = game.create(await readBody(req));
          return json(res, r.ok ? 200 : 400, r.ok ? game.snapshot() : { error: r.error });
        }
        case 'POST /api/action': {
          const r = game.act(await readBody(req));
          return json(res, r.ok ? 200 : 400, { ...(r.ok ? game.snapshot() : { error: r.error }), effects: r.effects, reply: r.reply });
        }
        default:
          return json(res, 404, { error: 'Endpoint tidak ada' });
      }
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Kesalahan server' : err.message });
    }
  });
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

function main() {
  const game = new Game(new Store(DATA_DIR));
  const server = createServer(game);
  const timer = setInterval(() => game.tick(), TICK_MS);

  let closing = false;
  const shutdown = (sig) => {
    if (closing) return;
    closing = true;
    console.log(`\n[${sig}] menyimpan & berhenti…`);
    clearInterval(timer);
    game.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} sudah dipakai (mungkin game sudah berjalan). Buka http://localhost:${PORT}`);
    } else console.error(err);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`🐣 Tamagotchi Taman berjalan di ${url}  (data: ${DATA_DIR})`);
    if (process.argv.includes('--open')) openBrowser(url);
  });
}

if (require.main === module) main();
module.exports = { createServer };
