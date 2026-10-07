'use strict';
// Menguji backend lokal versi web (docs/api.js) dengan localStorage tiruan.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MIN = 60000, HOUR = 3600000;
const mod = () => import(pathToFileURL(path.join(__dirname, '..', 'docs', 'api.js')).href);

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const T0 = Date.UTC(2026, 0, 1, 8, 0, 0);

async function fresh(storage = fakeStorage(), start = T0) {
  const { createLocalApi } = await mod();
  let now = start;
  const w = createLocalApi({ storage, clock: () => now });
  return { ...w, storage, advance: (ms) => { now += ms; }, at: () => now, reopen: async () => (await mod()).createLocalApi({ storage, clock: () => now }) };
}

test('web: buat peliharaan, makan, ngobrol, riwayat tersimpan', async () => {
  const g = await fresh();
  assert.equal((await g.api('/api/state')).created, false);
  await assert.rejects(() => g.api('/api/create', { name: ' ', species: 'mochi' }), /Nama/);
  const snap = await g.api('/api/create', { name: 'Momo', species: 'bubu' });
  assert.equal(snap.pet.name, 'Momo');
  g.advance(3 * MIN);
  const r = await g.api('/api/action', { type: 'chat', text: 'namaku Budi' });
  assert.match(r.reply, /Budi/);
  assert.equal((await g.api('/api/chat')).messages.length, 2);
  const ev = (await g.api('/api/history?limit=10')).events.map((e) => e.type);
  assert.ok(ev.includes('birth') && ev.includes('hatch'));
});

test('web: ditutup 6 jam lalu dibuka lagi = waktu tetap berjalan & data utuh', async () => {
  const g = await fresh();
  await g.api('/api/create', { name: 'Momo', species: 'leafy' });
  g.advance(3 * MIN);
  await g.api('/api/action', { type: 'play', item: 'swing' });
  const hunger = (await g.api('/api/state')).pet.stats.hunger;
  g.advance(6 * HOUR);
  const g2 = await g.reopen();
  const s = await g2.api('/api/state');
  assert.equal(s.pet.name, 'Momo');
  assert.ok(s.pet.stats.hunger < hunger);
  const types = (await g2.api('/api/history?limit=50')).events.map((e) => e.type);
  assert.ok(types.includes('away') && types.includes('play'));
});

test('web: snapshot adalah salinan (mutasi klien tidak merusak state)', async () => {
  const g = await fresh();
  const a = await g.api('/api/create', { name: 'Momo', species: 'mochi' });
  a.pet.coins = 999999;
  assert.notEqual((await g.api('/api/state')).pet.coins, 999999);
});

test('web: aksi tidak valid ditolak dengan pesan, bukan crash', async () => {
  const g = await fresh();
  await assert.rejects(() => g.api('/api/action', { type: 'feed' }), /Belum ada/);
  await g.api('/api/create', { name: 'Momo', species: 'mochi' });
  g.advance(3 * MIN);
  for (const bad of [{ type: 'feed', food: '__proto__' }, { type: 'zzz' }, null, 5, { type: 'buy', item: 'constructor' }]) {
    await assert.rejects(() => g.api('/api/action', bad));
  }
  assert.ok(Number.isFinite((await g.api('/api/state')).pet.coins));
  await assert.rejects(() => g.api('/api/tidakada'), /Endpoint/);
});

test('web: ekspor lalu impor di perangkat lain memulihkan peliharaan', async () => {
  const a = await fresh();
  await a.api('/api/create', { name: 'Momo', species: 'bubu' });
  a.advance(3 * MIN);
  await a.api('/api/action', { type: 'chat', text: 'halo' });
  const backup = JSON.parse(JSON.stringify(await a.api('/api/export')));

  const b = await fresh(fakeStorage(), a.at());
  assert.equal((await b.api('/api/state')).created, false);
  await b.api('/api/import', backup);
  const s = await b.api('/api/state');
  assert.equal(s.pet.name, 'Momo');
  assert.equal((await b.api('/api/chat')).messages.length, 2);
});

test('web: impor menolak file rusak / palsu', async () => {
  const g = await fresh();
  await assert.rejects(() => g.api('/api/import', { foo: 1 }), /tidak valid/);
  await assert.rejects(() => g.api('/api/import', { app: 'tamagotchi-taman', pet: { name: 'x' } }), /tidak valid/);
  await assert.rejects(() => g.api('/api/import', 'teks'), /tidak valid/);
  assert.equal((await g.api('/api/state')).created, false);
});

test('web: penyimpanan penuh / diblokir tidak membuat game crash', async () => {
  const bad = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const g = await fresh(bad);
  const s = await g.api('/api/create', { name: 'Momo', species: 'mochi' });
  assert.equal(s.created, true);
  g.advance(3 * MIN);
  assert.ok((await g.api('/api/action', { type: 'cuddle' })).effects);
});

test('web: save lama (tanpa field baru) dimigrasi saat dibuka', async () => {
  const g = await fresh();
  await g.api('/api/create', { name: 'Momo', species: 'mochi' });
  const raw = JSON.parse(g.storage.getItem('tamagotchi:v1:pet'));
  for (const k of ['inventory', 'equipped', 'daily', 'streak', 'achievements', 'treasure', 'owner']) delete raw[k];
  g.storage.setItem('tamagotchi:v1:pet', JSON.stringify(raw));
  const s = await (await g.reopen()).api('/api/state');
  assert.equal(s.pet.daily.quests.length, 3);
  assert.deepEqual(s.pet.inventory, []);
});

test('web: core.js memberi logika yang sama dengan versi PC', async () => {
  const web = (await import(pathToFileURL(path.join(__dirname, '..', 'docs', 'core.js')).href)).engine;
  const pc = require('../src/engine');
  assert.deepEqual(Object.keys(web.FOODS), Object.keys(pc.FOODS));
  const mk = (e) => { const s = e.createPet({ name: 'A', species: 'mochi' }, T0, 'id', 7).state; e.advance(s, T0 + 5 * MIN); return e.perform(s, T0 + 5 * MIN, { type: 'chat', text: 'apa kabar' }).reply; };
  assert.equal(mk(web), mk(pc));
});
