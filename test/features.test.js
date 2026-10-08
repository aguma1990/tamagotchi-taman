'use strict';
// Fitur lanjutan: toko berputar, isi rumah, warna bulu, telur keturunan, kunjungan teman, mini-game baru, salju & meteor.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const C = engine.C;
const { MIN, HOUR } = engine;
const T0 = new Date(2026, 5, 10, 9, 0, 0).getTime();
const DAY = 24 * HOUR;

function pet(extra = {}) {
  const s = engine.createPet({ name: 'Momo', species: 'mochi' }, T0, 'feat-id', 5).state;
  engine.advance(s, T0 + 2 * MIN);
  s.coins = 1000; s.level = 8;
  Object.assign(s, extra);
  return s;
}
const act = (s, a, t = s.lastTickAt) => engine.perform(s, t, a);
const keepFull = (s) => Object.assign(s.stats, { hunger: 100, happiness: 100, energy: 100, hygiene: 100, thirst: 100, health: 100 });

test('toko berputar: stok langka & promo deterministik per hari, berganti antarhari', () => {
  const s = pet();
  const a = engine.shopToday(s, T0), b = engine.shopToday(s, T0 + 3 * HOUR);
  assert.deepEqual(a, b, 'stabil dalam sehari');
  assert.equal(a.rare.length, C.SHOP_RARE_COUNT);
  assert.equal(new Set(a.rare).size, a.rare.length);
  assert.ok(a.rare.every((id) => C.RARE_COSMETICS[id]));
  assert.equal(a.deals.length, 2);
  assert.ok(a.deals.every((d) => C.SHOP_DEAL_PCTS.includes(d.pct)));
  assert.ok(a.endsAt > T0 && a.endsAt - T0 <= DAY);
  const seen = new Set();
  for (let d = 0; d < 20; d++) engine.shopToday(s, T0 + d * DAY).rare.forEach((id) => seen.add(id));
  assert.equal(seen.size, Object.keys(C.RARE_COSMETICS).length, 'semua barang langka pernah muncul');
});

test('barang langka hanya bisa dibeli saat dijual hari itu; promo memotong harga', () => {
  const s = pet();
  const shop = engine.shopToday(s, s.lastTickAt);
  const missing = Object.keys(C.RARE_COSMETICS).find((id) => !shop.rare.includes(id));
  const r1 = act(s, { type: 'buy', item: missing });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /tidak dijual hari ini/);
  const id = shop.rare[0];
  const before = s.coins;
  const price = engine.shopToday(s, s.lastTickAt).deals.some((d) => d.kind === 'cosmetic' && d.id === id) ? null : C.RARE_COSMETICS[id].cost;
  assert.equal(act(s, { type: 'buy', item: id }).ok, true);
  if (price) assert.equal(before - s.coins, price);
  assert.ok(s.inventory.includes(id));
  assert.equal(act(s, { type: 'buy', item: id }).ok, false, 'tidak bisa dua kali');
  // promo
  const deal = shop.deals.find((d) => d.kind === 'decor');
  if (deal) {
    const c0 = s.coins;
    if (act(s, { type: 'decorBuy', item: deal.id }).ok) assert.equal(c0 - s.coins, Math.floor(C.DECOR[deal.id].cost * (100 - deal.pct) / 100));
  }
  // barang langka tidak ikut daftar "terbuka di level"
  assert.ok(!Object.values(engine.COSMETICS).some((v) => v.rare && v.unlock === 99));
});

test('isi rumah hewan: wajib punya rumah, beli sekali, dan bermanfaat saat di dalam', () => {
  const s = pet();
  assert.equal(act(s, { type: 'houseDecorBuy', item: 'bantal' }).ok, false);
  assert.equal(act(s, { type: 'houseBuy' }).ok, true);
  assert.equal(act(s, { type: 'houseDecorBuy', item: 'nope' }).ok, false);
  assert.equal(act(s, { type: 'houseDecorBuy', item: 'mainan' }).ok, true);
  assert.equal(act(s, { type: 'houseDecorBuy', item: 'mainan' }).ok, false);
  assert.deepEqual(s.house.items, ['mainan']);
  // mainan: bahagia perlahan saat di dalam rumah
  const a = pet(), b = pet();
  for (const x of [a, b]) { act(x, { type: 'houseBuy' }); Object.assign(x.stats, { hunger: 100, thirst: 100, hygiene: 100, energy: 100, happiness: 50, health: 100 }); x.house.inside = true; x.house.reason = 'manual'; }
  act(b, { type: 'houseDecorBuy', item: 'mainan' }); act(b, { type: 'houseDecorBuy', item: 'lampu' });
  for (const x of [a, b]) { x.house.inside = true; x.house.reason = 'manual'; }
  // cuaca cerah dipaksa: gunakan tema default; langkah per menit (online)
  for (let i = 1; i <= 20; i++) { engine.advance(a, a.lastTickAt + MIN); engine.advance(b, b.lastTickAt + MIN); a.house.inside = b.house.inside = true; a.house.reason = b.house.reason = 'manual'; }
  assert.ok(b.stats.happiness > a.stats.happiness, `boneka+lampu membantu: ${b.stats.happiness} vs ${a.stats.happiness}`);
});

test('bantal mempercepat pulih energi saat tidur di rumah', () => {
  const mk = (bantal) => {
    const s = pet(); act(s, { type: 'houseBuy' });
    if (bantal) act(s, { type: 'houseDecorBuy', item: 'bantal' });
    Object.assign(s.stats, { energy: 10, hunger: 100, thirst: 100, hygiene: 100, happiness: 100 });
    s.sleeping = true; s.house.inside = true; s.house.reason = 'sleep';
    engine.advance(s, s.lastTickAt + MIN);
    return s.stats.energy;
  };
  assert.ok(mk(true) > mk(false));
});

test('warna bulu: beli, ganti gratis, tolak yang tidak dikenal/belum dimiliki', () => {
  const s = pet();
  assert.equal(act(s, { type: 'tintSet', tint: 'mint' }).ok, false, 'belum dimiliki');
  assert.equal(act(s, { type: 'tintBuy', tint: '__proto__' }).ok, false);
  const c0 = s.coins;
  assert.equal(act(s, { type: 'tintBuy', tint: 'mint' }).ok, true);
  assert.ok(c0 - s.coins <= C.TINTS.mint.cost);
  assert.equal(s.tint.active, 'mint');
  assert.equal(act(s, { type: 'tintBuy', tint: 'mint' }).ok, false);
  assert.equal(act(s, { type: 'tintBuy', tint: 'ungu' }).ok, true);
  assert.equal(act(s, { type: 'tintSet', tint: 'mint' }).ok, true);
  assert.equal(s.tint.active, 'mint');
  assert.equal(act(s, { type: 'tintSet', tint: null }).ok, true);
  assert.equal(s.tint.active, null);
  const low = pet({ level: 1 });
  assert.equal(act(low, { type: 'tintBuy', tint: 'pelangi' }).ok, false);
});

test('telur keturunan: hanya dewasa, bayar, sekali; diwarisi saat pensiun', () => {
  const s = pet();
  assert.equal(act(s, { type: 'breed' }).ok, false, 'belum dewasa');
  s.stage = 'adult'; s.ageMinutes = engine.CONFIG.stageStarts.adult;
  s.skills.lari.lv = 8; s.prefs.fav = 'kue'; s.prefs.hate = 'apel';
  act(s, { type: 'tintBuy', tint: 'langit' });
  const c0 = s.coins;
  const r = act(s, { type: 'breed' });
  assert.equal(r.ok, true);
  assert.ok(c0 - s.coins > 0 && c0 - s.coins <= C.BREED_COST, 'bayar (dikurangi hadiah prestasi)');
  assert.ok(s.nest && engine.SPECIES.includes(s.nest.species));
  assert.equal(act(s, { type: 'breed' }).ok, false, 'sudah ada telur');
  assert.equal(s.totals.breeds, 1);
  s.stage = 'elder'; s.ageMinutes = engine.CONFIG.stageStarts.elder;
  const nestSpecies = s.nest.species;
  const rr = act(s, { type: 'retire', name: 'Kecil', species: nestSpecies === 'bubu' ? 'mochi' : 'bubu' });
  assert.equal(rr.ok, true);
  assert.equal(s.species, nestSpecies, 'jenis mengikuti telur, bukan pilihan');
  assert.equal(s.nest, null);
  assert.equal(s.skills.lari.lv, 6, '75% warisan (bukan 50%)');
  assert.equal(s.prefs.fav, 'kue');
  assert.notEqual(s.prefs.hate, 'kue');
  assert.equal(s.tint.active, 'langit');
  assert.equal(s.generation, 2);
});

test('pensiun tanpa telur keturunan tetap seperti semula (warisan 50%)', () => {
  const s = pet({ stage: 'elder' }); s.ageMinutes = engine.CONFIG.stageStarts.elder; s.skills.lari.lv = 8;
  assert.equal(act(s, { type: 'retire', name: 'Baru', species: 'bubu' }).ok, true);
  assert.equal(s.species, 'bubu');
  assert.equal(s.skills.lari.lv, 4);
});

test('kunjungan teman: validasi kode, hadiah, batas harian, bukan diri sendiri', () => {
  const s = pet();
  for (const bad of [undefined, '', 'ab', 'a b c d e', '../etc', 'x'.repeat(41), 123, {}, null]) assert.equal(act(s, { type: 'visit', fid: bad, fname: 'T' }).ok, false, String(bad));
  assert.equal(act(s, { type: 'visit', fid: s.id, fname: 'Aku' }).ok, false);
  const c0 = s.coins;
  assert.equal(act(s, { type: 'visit', fid: 'teman-001', fname: 'Bubu' }).ok, true);
  assert.equal(s.coins - c0, C.VISIT_REWARD);
  assert.equal(act(s, { type: 'visit', fid: 'teman-001', fname: 'Bubu' }).ok, false, 'sama hari');
  assert.equal(act(s, { type: 'visit', fid: 'teman-002', fname: 'Bibi' }).ok, true);
  assert.equal(act(s, { type: 'visit', fid: 'teman-003', fname: 'Bobo' }).ok, true);
  assert.ok(s.album.teman, 'stiker sahabat setelah 3 kunjungan');
  assert.equal(act(s, { type: 'visit', fid: 'teman-004', fname: 'Baba' }).ok, false, 'batas harian');
  const next = s.lastTickAt + DAY;
  assert.equal(act(s, { type: 'visit', fid: 'teman-001', fname: 'Bubu' }, next).ok, true, 'hari baru');
});

test('mini-game baru: memancing & lari rintangan terdaftar dan memberi hadiah', () => {
  for (const g of ['fishing', 'runner']) {
    assert.ok(C.MINIGAMES[g]);
    const s = pet(); keepFull(s);
    const c0 = s.coins;
    const r = act(s, { type: 'minigame', game: g, score: 30 });
    assert.equal(r.ok, true, g);
    assert.equal(s.coins - c0 >= 15, true, 'koin dari skor + rekor');
  }
});

// ---- cuaca khusus ----
function findSlot(s, name, from = T0, max = 5000) {
  for (let slot = Math.floor(from / C.WEATHER_SLOT_MS); slot < Math.floor(from / C.WEATHER_SLOT_MS) + max; slot++) {
    const t = slot * C.WEATHER_SLOT_MS + 1000;
    if (engine.weatherAt(s, t) === name) return t;
  }
  throw new Error(`cuaca ${name} tidak ditemukan`);
}

test('hujan meteor: stabil per slot, hanya malam, permohonan sekali per slot memberi koin', () => {
  const s = pet();
  const t = findSlot(s, 'meteor');
  const slot = Math.floor(t / C.WEATHER_SLOT_MS);
  const mid = (slot + 0.5) * C.WEATHER_SLOT_MS;
  const h = engine.gameHour(s, mid);
  assert.ok(h >= 20 || h < 4.5, `malam: ${h}`);
  assert.equal(engine.weatherAt(s, slot * C.WEATHER_SLOT_MS + 5), engine.weatherAt(s, (slot + 1) * C.WEATHER_SLOT_MS - 5));
  assert.equal(engine.worldView(s, t).wishable, true);
  s.lastTickAt = t - MIN; keepFull(s);
  const c0 = s.coins;
  const r = act(s, { type: 'wish' }, t);
  assert.equal(r.ok, true);
  assert.ok(s.coins - c0 >= 8, 'hadiah permohonan (+ prestasi)');
  assert.equal(act(s, { type: 'wish' }, t + MIN).ok, false, 'sekali per slot');
  assert.equal(engine.worldView(s, t + MIN).wishable, false);
  const clear = findSlot(s, 'cerah');
  assert.equal(act(s, { type: 'wish' }, clear).ok, false, 'bukan hujan meteor');
});

test('Negeri Salju: hujan menjadi salju yang juga menurunkan kesehatan tanpa rumah, aman dengan rumah', () => {
  const s = pet();
  const base = findSlot(s, 'hujan');
  s.decor.themes.push('salju'); s.decor.theme = 'salju';
  assert.equal(engine.weatherAt(s, base), 'salju');
  assert.ok(C.RAIN.salju > 0 && C.RAIN.salju < C.RAIN.hujan);
  const a = pet(), b = pet();
  for (const x of [a, b]) { x.decor.themes.push('salju'); x.decor.theme = 'salju'; }
  b.house.owned = true;
  const t = base;
  for (const x of [a, b]) { x.lastTickAt = t - MIN; keepFull(x); }
  for (let i = 0; i < 12; i++) { engine.advance(a, t + i * MIN); engine.advance(b, t + i * MIN); }
  assert.ok(a.stats.health < 100 - 3, `salju menurunkan kesehatan: ${a.stats.health}`);
  assert.ok(b.house.inside && b.stats.health > a.stats.health);
});

test('migrasi: save lama mendapat field fitur baru', () => {
  const s = pet();
  delete s.tint; delete s.nest; delete s.friends; delete s.wish; delete s.house.items;
  for (const k of ['breeds', 'visits', 'wishes']) delete s.totals[k];
  engine.migrate(s, s.lastTickAt);
  assert.deepEqual(s.tint, { owned: [], active: null });
  assert.equal(s.nest, null);
  assert.deepEqual(s.house.items, []);
  assert.equal(s.totals.visits, 0);
  const cfg = engine.buildConfig();
  assert.ok(cfg.houseDecor.bantal && cfg.tints.mint && cfg.cosmetics.koboi.rare);
});
