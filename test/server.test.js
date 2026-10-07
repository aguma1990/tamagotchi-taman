'use strict';
// Uji server HTTP: validasi input, keamanan header, ketahanan terhadap request sampah.
process.env.PORT = '3991';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../src/server');
const { Store } = require('../src/store');
const { Game } = require('../src/game');

const PORT = 3991;
let server, dir;

function req(method, url, { body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: url, headers: { Host: `localhost:${PORT}`, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch { /* bukan JSON */ } resolve({ status: res.statusCode, headers: res.headers, text: buf, json }); });
    });
    r.on('error', reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tama-srv-'));
  server = createServer(new Game(new Store(dir)));
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
});
test.after(() => new Promise((r) => server.close(r)));

test('server: alur normal — buat peliharaan, aksi, riwayat, obrolan', async () => {
  let r = await req('GET', '/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.json.created, false);
  r = await req('POST', '/api/create', { body: { name: 'Uji', species: 'trenggiling' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.pet.species, 'trenggiling');
  assert.ok(r.json.config.minigames && r.json.world);
  r = await req('POST', '/api/create', { body: { name: 'Lagi', species: 'mochi' } });
  assert.equal(r.status, 400, 'tidak bisa membuat dua kali');
  r = await req('POST', '/api/action', { body: { type: 'cuddle' } });
  assert.equal(r.status, 400, 'telur belum bisa dipeluk');
  assert.match(r.json.error, /Telur/);
  r = await req('POST', '/api/action', { body: { type: 'chat', text: 'halo' } });
  assert.equal(r.status, 200);
  assert.ok(r.json.reply);
  r = await req('GET', '/api/chat?limit=5');
  assert.equal(r.json.messages.length, 2);
  r = await req('GET', '/api/history?limit=5');
  assert.ok(r.json.events.length >= 1);
});

test('server: request sampah dijawab 4xx, bukan 500 atau crash', async () => {
  const bad = [
    ['POST', '/api/action', { raw: '{rusak' }, 400],
    ['POST', '/api/action', { raw: 'null' }, 400],
    ['POST', '/api/action', { raw: '[]' }, 400],
    ['POST', '/api/action', { raw: '"teks"' }, 400],
    ['POST', '/api/action', { body: { type: { a: 1 } } }, 400],
    ['POST', '/api/action', { body: { type: 'feed', food: '__proto__' } }, 400],
    ['POST', '/api/action', { body: { type: 'minigame', score: 'abc', game: 'catur' } }, 400],
    ['POST', '/api/create', { raw: '{"name": 5, "species": []}' }, 400],
    ['GET', '/api/tidakada', {}, 404],
    ['PUT', '/index.html', { raw: 'x' }, 405],
    ['GET', '/api/history?limit=abc', {}, 200],
    ['GET', '/api/samples?hours=-5', {}, 200],
    ['GET', '/api/chat?limit=999999', {}, 200],
  ];
  for (const [method, url, opts, expected] of bad) {
    const r = await req(method, url, opts);
    assert.equal(r.status, expected, `${method} ${url} ${JSON.stringify(opts).slice(0, 60)} → ${r.status}`);
  }
});

test('server: batas ukuran body & jenis konten', async () => {
  let r;
  try { r = await req('POST', '/api/action', { raw: JSON.stringify({ type: 'chat', text: 'x'.repeat(10000) }) }); } catch { r = { status: 'koneksi diputus' }; }
  assert.ok(r.status === 413 || r.status === 'koneksi diputus', `body besar → ${r.status}`);
  r = await req('POST', '/api/action', { raw: '{"type":"cuddle"}', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(r.status, 403, 'bukan JSON ditolak (anti-CSRF)');
});

test('server: Host/Origin palsu ditolak (DNS-rebinding & CSRF)', async () => {
  assert.equal((await req('GET', '/api/state', { headers: { Host: 'evil.com' } })).status, 403);
  assert.equal((await req('GET', '/api/state', { headers: { Host: `localhost:${PORT + 1}` } })).status, 403);
  assert.equal((await req('POST', '/api/action', { body: { type: 'cuddle' }, headers: { Origin: 'http://evil.com' } })).status, 403);
  assert.equal((await req('POST', '/api/action', { body: { type: 'chat', text: 'hai' }, headers: { Origin: `http://localhost:${PORT}` } })).status, 200);
});

test('server: file statis aman — tidak bisa keluar dari folder public, header keamanan ada', async () => {
  for (const evil of ['/../src/server.js', '/..%2fsrc%2fserver.js', '/%2e%2e/package.json', '/../../etc/passwd', '/..\\src\\server.js']) {
    const r = await req('GET', evil);
    assert.ok([400, 403, 404].includes(r.status), `${evil} → ${r.status}`);
    assert.ok(!r.text.includes('createServer') && !r.text.includes('root:'), `${evil} membocorkan isi`);
  }
  const r = await req('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  for (const f of ['app.js', 'scene.js', 'minigame.js', 'audio.js', 'card.js', 'api.js', 'style.css']) {
    const s = await req('GET', `/${f}`);
    assert.equal(s.status, 200, f);
  }
});

test('server: data pemain tidak dapat diunduh lewat jalur statis', async () => {
  const r = await req('GET', '/../data/pet.json');
  assert.ok([400, 403, 404].includes(r.status));
  assert.ok(!r.text.includes('"stats"'));
});
