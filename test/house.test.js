'use strict';
// Rumah & hujan: tanpa rumah kesehatan cepat turun; dengan rumah, peliharaan berteduh otomatis.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const C = engine.C;
const { MIN, HOUR } = engine;
const SLOT = C.WEATHER_SLOT_MS;
const T0 = new Date(2026, 5, 10, 9, 0, 0).getTime();

function pet(extra = {}, house = false) {
  const s = engine.createPet({ name: 'Momo', species: 'mochi' }, T0, 'house-id', 11).state;
  engine.advance(s, T0 + 2 * MIN);
  Object.assign(s, extra);
  if (house) s.house.owned = true;
  return s;
}
const act = (s, a, t = s.lastTickAt) => engine.perform(s, t, a);
const wx = (t) => engine.weatherAt({ id: 'house-id' }, t);

/** Awal slot pertama (setelah `from`) dengan cuaca `name` yang didahului slot bukan basah. */
function slotStart(name, from = T0 + 6 * HOUR) {
  for (let slot = Math.floor(from / SLOT); slot < Math.floor(from / SLOT) + 4000; slot++) {
    const t = slot * SLOT;
    if (wx(t + 1000) === name && !['hujan', 'badai'].includes(wx(t - 1000))) return t;
  }
  throw new Error(`cuaca ${name} tidak ditemukan`);
}
function fullStats(s) { Object.assign(s.stats, { hunger: 100, happiness: 100, energy: 100, hygiene: 100, thirst: 100, health: 100 }); }
function atSlot(s, t) { s.lastTickAt = t - MIN; s.sleeping = false; fullStats(s); }

test('tanpa rumah: hujan menurunkan kesehatan dengan cepat, peringatan muncul sekali per slot', () => {
  const s = pet();
  const t = slotStart('hujan');
  atSlot(s, t);
  const events = [];
  for (let i = 1; i <= 10; i++) events.push(...engine.advance(s, t + i * MIN).events); // menit demi menit (online)
  assert.ok(s.stats.health < 100 - 10, `kesehatan turun jauh: ${s.stats.health}`);
  assert.equal(events.filter((e) => e.type === 'weather').length, 1);
  assert.match(events.find((e) => e.type === 'weather').msg, /Beli rumah/);
  assert.ok(s.stats.happiness < 100);
});

test('badai dua kali lebih parah daripada hujan', () => {
  const a = pet(), b = pet();
  const th = slotStart('hujan'), tb = slotStart('badai');
  atSlot(a, th); atSlot(b, tb);
  engine.advance(a, th + 5 * MIN);
  engine.advance(b, tb + 5 * MIN);
  const lostRain = 100 - a.stats.health, lostStorm = 100 - b.stats.health;
  assert.ok(lostStorm > lostRain * 1.6, `hujan -${lostRain.toFixed(1)}, badai -${lostStorm.toFixed(1)}`);
});

test('dengan rumah: berteduh otomatis, kesehatan aman, keluar saat reda', () => {
  const s = pet({}, true);
  const t = slotStart('hujan');
  atSlot(s, t);
  const events = [];
  for (let i = 1; i <= 10; i++) events.push(...engine.advance(s, t + i * MIN).events);
  assert.equal(s.house.inside, true);
  assert.equal(s.house.reason, 'rain');
  assert.equal(s.stats.health, 100);
  assert.ok(events.some((e) => e.type === 'house' && /berteduh/.test(e.msg)));
  assert.ok(!events.some((e) => e.type === 'weather'), 'tidak ada peringatan kehujanan');
  // cari akhir hujan
  let end = t;
  while (['hujan', 'badai'].includes(wx(end + 1000))) end += SLOT;
  const ev2 = [];
  for (let m = 1; m <= 3; m++) ev2.push(...engine.advance(s, end + m * MIN).events);
  assert.equal(s.house.inside, false);
  assert.ok(ev2.some((e) => /keluar dari rumah/.test(e.msg)));
});

test('rumah: harus dibeli (level, koin, sekali), memberi prestasi', () => {
  const s = pet({ coins: 200, level: 1 });
  assert.match(act(s, { type: 'houseBuy' }).error, /level/);
  s.level = C.HOUSE.unlock;
  s.coins = C.HOUSE.cost - 1;
  assert.match(act(s, { type: 'houseBuy' }).error, /Koin/);
  s.coins = 200;
  assert.ok(act(s, { type: 'houseBuy' }).ok);
  assert.equal(s.house.owned, true);
  assert.equal(s.coins, 200 - C.HOUSE.cost + 20, 'dikurangi harga, plus hadiah prestasi 20');
  assert.ok(s.achievements.house);
  assert.match(act(s, { type: 'houseBuy' }).error, /Sudah/);
});

test('masuk/keluar rumah manual: hanya bila punya; tidak bisa keluar saat hujan', () => {
  const s = pet();
  assert.match(act(s, { type: 'home' }).error, /Belum punya rumah/);
  s.house.owned = true;
  const sunny = slotStart('cerah');
  s.lastTickAt = sunny;
  assert.ok(act(s, { type: 'home' }, sunny + MIN).ok);
  assert.equal(s.house.inside, true);
  assert.equal(s.house.reason, 'manual');
  engine.advance(s, sunny + 5 * MIN);
  assert.equal(s.house.inside, true, 'tetap di dalam sampai dikeluarkan');
  assert.ok(act(s, { type: 'home' }, sunny + 6 * MIN).ok);
  assert.equal(s.house.inside, false);

  const rain = slotStart('hujan');
  atSlot(s, rain);
  engine.advance(s, rain + 3 * MIN);
  assert.equal(s.house.inside, true);
  assert.match(act(s, { type: 'home' }, rain + 4 * MIN).error, /hujan/);
  assert.equal(s.house.inside, true);

  const egg = engine.createPet({ name: 'E', species: 'bubu' }, T0, 'egg', 1).state;
  egg.house.owned = true;
  assert.match(engine.perform(egg, T0, { type: 'home' }).error, /Telur/);
});

test('di dalam rumah: tidak bisa main wahana, tetapi bisa makan, ngobrol, dan mini-game', () => {
  const s = pet({ level: 5 }, true);
  const sunny = slotStart('cerah');
  s.lastTickAt = sunny;
  fullStats(s);
  s.stats.hunger = 40;
  assert.ok(act(s, { type: 'home' }, sunny + MIN).ok);
  const r = act(s, { type: 'play', item: 'swing' }, sunny + 2 * MIN);
  assert.equal(r.ok, false);
  assert.match(r.error, /rumah/);
  assert.ok(act(s, { type: 'feed', food: 'bubur' }, sunny + 2 * MIN).ok);
  assert.ok(act(s, { type: 'chat', text: 'halo' }, sunny + 2 * MIN).ok);
  assert.ok(act(s, { type: 'minigame', game: 'memory', score: 20 }, sunny + 2 * MIN).ok);
  assert.ok(act(s, { type: 'home' }, sunny + 3 * MIN).ok);
  assert.ok(act(s, { type: 'play', item: 'swing' }, sunny + 3 * MIN).ok, 'setelah keluar boleh main');
});

test('saat hujan di rumah, pesan main menyarankan mini-game', () => {
  const s = pet({ level: 5 }, true);
  const rain = slotStart('hujan');
  atSlot(s, rain);
  engine.advance(s, rain + 2 * MIN);
  assert.match(act(s, { type: 'play', item: 'ball' }, rain + 2 * MIN).error, /hujan.*mini-game/i);
});

test('tidur otomatis di rumah dan bangun keluar; energi pulih lebih cepat di rumah', () => {
  const a = pet({}, false), b = pet({}, true);
  const sunny = slotStart('cerah');
  for (const s of [a, b]) { s.lastTickAt = sunny; s.stats.energy = 10; }
  assert.ok(engine.perform(a, sunny, { type: 'sleep' }).ok);
  assert.ok(engine.perform(b, sunny, { type: 'sleep' }).ok);
  assert.equal(b.house.inside, true);
  assert.equal(b.house.reason, 'sleep');
  engine.advance(a, sunny + 4 * MIN);
  engine.advance(b, sunny + 4 * MIN);
  assert.ok(b.stats.energy > a.stats.energy * 1.1 || b.stats.energy >= 100, `di rumah ${b.stats.energy} vs luar ${a.stats.energy}`);
  assert.ok(engine.perform(b, sunny + 5 * MIN, { type: 'wake' }).ok);
  assert.equal(b.house.inside, false);
});

test('tidur saat hujan lalu bangun: tetap di rumah sampai hujan reda', () => {
  const s = pet({}, true);
  const rain = slotStart('hujan');
  atSlot(s, rain);
  s.stats.energy = 30;
  engine.advance(s, rain + MIN);
  assert.ok(engine.perform(s, rain + 2 * MIN, { type: 'sleep' }).ok);
  assert.ok(engine.perform(s, rain + 3 * MIN, { type: 'wake' }).ok);
  assert.equal(s.house.inside, true);
  assert.equal(s.house.reason, 'rain');
});

test('catch-up offline lintas hujan: tanpa rumah kesehatan turun (tidak mati), dengan rumah aman', () => {
  const a = pet(), b = pet({}, true);
  const t = slotStart('badai');
  for (const s of [a, b]) { s.lastTickAt = t - HOUR; fullStats(s); }
  engine.advance(a, t + 3 * HOUR);
  engine.advance(b, t + 3 * HOUR);
  assert.ok(a.stats.health < b.stats.health);
  assert.ok(a.stats.health >= 30, `saat ditinggal, hujan tidak menjatuhkan kesehatan terlalu rendah: ${a.stats.health}`);
  assert.ok(b.stats.health >= 90, `dengan rumah ${b.stats.health}`);
  for (const s of [a, b]) for (const v of Object.values(s.stats)) assert.ok(v >= 0 && v <= 100 && Number.isFinite(v));
});

test('migrasi: save lama mendapat data rumah; konfigurasi memuat rumah', () => {
  const s = pet();
  delete s.house;
  engine.migrate(s, s.lastTickAt);
  assert.deepEqual(s.house, { owned: false, inside: false, reason: null, warned: -1 });
  const cfg = engine.buildConfig();
  assert.equal(cfg.house.cost, C.HOUSE.cost);
  assert.equal(cfg.rainDamage.badai, 2 * cfg.rainDamage.hujan);
});

test('obrolan: jawaban cuaca & rumah mengikuti kondisi', () => {
  const rain = slotStart('hujan');
  const a = pet();
  atSlot(a, rain);
  engine.advance(a, rain + MIN);
  const ra = engine.perform(a, rain + MIN, { type: 'chat', text: 'cuaca?' }).reply;
  assert.match(ra, /kehujanan|rumah/i);
  const b = pet({}, true);
  atSlot(b, rain);
  engine.advance(b, rain + MIN);
  assert.match(engine.perform(b, rain + MIN, { type: 'chat', text: 'cuaca?' }).reply, /rumah/i);
  assert.match(engine.perform(a, rain + 2 * MIN + 40000, { type: 'chat', text: 'punya rumah?' }).reply, /belum punya rumah/i);
});

test('saat dimainkan (online) hujan bisa menurunkan kesehatan sampai sangat rendah, tetapi tidak mati', () => {
  const s = pet();
  const t = slotStart('badai');
  atSlot(s, t);
  for (let i = 1; i <= 19; i++) engine.advance(s, t + i * MIN);
  assert.ok(s.stats.health < 45, `online: ${s.stats.health}`);
  assert.ok(s.stats.health >= 1);
});
