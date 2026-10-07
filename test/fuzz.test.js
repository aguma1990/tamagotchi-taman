'use strict';
// Uji acak: ribuan aksi acak (valid & sampah) + lompatan waktu; invarian harus selalu terjaga.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const C = engine.C;

const MIN = 60000, HOUR = 3600000;
const T0 = new Date(2026, 5, 10, 9, 0, 0).getTime();

function lcg(seed) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const GARBAGE = [null, undefined, 0, -1, 1e308, NaN, '', '__proto__', 'constructor', 'toString', {}, [], 'x'.repeat(500), true, () => 1, Symbol.iterator.toString()];
const FOOD = Object.keys(engine.FOODS), RIDE = Object.keys(engine.PLAYGROUND), SPECIES = engine.SPECIES;
const SKILL = Object.keys(C.SKILLS), DECOR = Object.keys(C.DECOR), THEME = Object.keys(C.THEMES), COSM = Object.keys(engine.COSMETICS), GAME = Object.keys(C.MINIGAMES);

function randomAction(r, s) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const junk = () => pick(GARBAGE);
  const mixed = (valid) => (r() < 0.25 ? junk() : pick(valid));
  switch (Math.floor(r() * 23)) {
    case 0: return { type: 'feed', food: mixed(FOOD) };
    case 1: return { type: 'clean' };
    case 2: return { type: 'medicine' };
    case 3: return { type: r() < 0.5 ? 'sleep' : 'wake' };
    case 4: return { type: 'cuddle' };
    case 5: return { type: 'play', item: mixed(RIDE) };
    case 6: return { type: 'minigame', game: mixed(GAME), score: r() < 0.3 ? junk() : Math.floor(r() * 100) - 10 };
    case 7: return { type: 'chat', text: r() < 0.3 ? junk() : pick(['halo', 'namaku Budi', 'cuaca?', 'lapar?', 'haus?', 'ceritakan lelucon', 'album', 'sifat', 'keluarga', 'asdf', '!!!', 'x'.repeat(200)]) };
    case 8: return { type: 'daily' };
    case 9: return { type: 'lucky' };
    case 10: return { type: 'weekly' };
    case 11: return { type: 'event' };
    case 12: return { type: 'quest', id: r() < 0.5 && s.daily ? pick(s.daily.quests).id : junk() };
    case 13: return { type: 'collect' };
    case 14: return { type: 'greet' };
    case 15: return { type: 'train', skill: mixed(SKILL) };
    case 16: return { type: 'buy', item: mixed(COSM) };
    case 17: return { type: r() < 0.5 ? 'decorBuy' : 'decorPlace', item: mixed(DECOR) };
    case 18: return { type: r() < 0.5 ? 'themeBuy' : 'themeSet', theme: mixed(THEME) };
    case 19: return { type: 'equip', item: mixed(COSM) };
    case 20: return { type: 'retire', name: r() < 0.3 ? junk() : 'Anak', species: mixed(SPECIES) };
    case 21: return { type: 'morph', species: mixed(SPECIES), name: r() < 0.5 ? undefined : (r() < 0.3 ? junk() : pick(['Baru', 'Momo', '  ', 'X'.repeat(40)])) };
    default: return r() < 0.5 ? { type: junk() } : junk();
  }
}

function checkInvariants(s, ctx) {
  for (const [k, v] of Object.entries(s.stats)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `${ctx}: stat ${k}=${v}`);
  assert.ok(s.stats.health >= 1, `${ctx}: kesehatan`);
  for (const k of ['coins', 'xp', 'level', 'ageMinutes', 'generation']) assert.ok(Number.isFinite(s[k]), `${ctx}: ${k}=${s[k]}`);
  assert.ok(s.coins >= 0, `${ctx}: koin negatif ${s.coins}`);
  assert.ok(s.level >= 1 && s.generation >= 1);
  assert.ok(s.poop >= 0 && s.poop <= engine.CONFIG.maxPoop, `${ctx}: poop ${s.poop}`);
  for (const [k, v] of Object.entries(s.skills)) assert.ok(v.lv >= 0 && v.lv <= C.SKILL_MAX && v.xp >= 0, `${ctx}: skill ${k}`);
  for (const [k, v] of Object.entries(s.album)) assert.ok(C.STICKERS[k] && Number.isInteger(v) && v > 0, `${ctx}: album ${k}`);
  assert.ok(s.family.length <= 50);
  assert.ok(new Set(s.inventory).size === s.inventory.length && new Set(s.decor.placed).size === s.decor.placed.length, `${ctx}: duplikat`);
  for (const slot of ['head', 'face', 'neck']) assert.ok(s.equipped[slot] === null || s.inventory.includes(s.equipped[slot]), `${ctx}: aksesori ${slot}`);
  assert.ok(s.decor.themes.includes(s.decor.theme), `${ctx}: tema`);
  assert.ok(['egg', 'baby', 'child', 'teen', 'adult', 'elder'].includes(s.stage));
  assert.ok(s.daily.quests.length === 3 && s.weekly.quests >= 0);
  assert.ok(!s.sleeping || s.stage !== 'egg', `${ctx}: telur tidur`);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(s)), `${ctx}: serialisasi`);
}

test('fuzz: 120 peliharaan × 250 langkah acak tidak melanggar invarian atau melempar error', () => {
  let actions = 0, okCount = 0;
  const okByType = {};
  for (let run = 0; run < 120; run++) {
    const r = lcg(1000 + run);
    const species = SPECIES[run % SPECIES.length];
    const s = engine.createPet({ name: `P${run}`, species }, T0, `fuzz-${run}`, run * 7919).state;
    let now = T0;
    for (let step = 0; step < 250; step++) {
      const jump = r();
      now += jump < 0.6 ? Math.floor(r() * 90e3) : jump < 0.9 ? Math.floor(r() * 3 * HOUR) : jump < 0.97 ? Math.floor(r() * 3 * 24 * HOUR) : -Math.floor(r() * HOUR); // kadang jam mundur
      if (r() < 0.04) { s.stage = r() < 0.5 ? 'elder' : s.stage; if (s.stage === 'elder') s.ageMinutes = Math.max(s.ageMinutes, engine.CONFIG.stageStarts.elder); }
      if (r() < 0.05) { s.coins += 100; s.level = Math.max(s.level, 1 + Math.floor(r() * 6)); }
      const a = randomAction(r, s);
      let res;
      assert.doesNotThrow(() => { res = engine.perform(s, now, a); }, `run ${run} langkah ${step}: ${JSON.stringify(a)}`);
      actions++;
      if (res.ok) { okCount++; okByType[a.type] = (okByType[a.type] || 0) + 1; }
      else assert.equal(typeof res.error, 'string');
      checkInvariants(s, `run ${run} langkah ${step} aksi ${JSON.stringify(a)}`);
    }
  }
  assert.ok(okCount > actions * 0.15, `terlalu sedikit aksi sukses: ${okCount}/${actions}`);
  // setiap jenis aksi penting harus benar-benar pernah berhasil (uji ini tidak boleh lolos karena semuanya ditolak)
  for (const type of ['feed', 'clean', 'sleep', 'cuddle', 'play', 'minigame', 'chat', 'daily', 'lucky', 'quest', 'collect', 'greet', 'train', 'buy', 'decorBuy', 'themeBuy', 'equip', 'retire', 'medicine', 'morph']) {
    assert.ok(okByType[type] > 0, `aksi "${type}" tidak pernah berhasil di uji acak (${JSON.stringify(okByType)})`);
  }
  process.stdout.write(`# fuzz: ${actions} aksi, ${okCount} sukses\n`);
});

test('fuzz: peliharaan lintas generasi tetap konsisten dan bisa diserialisasi ulang', () => {
  const r = lcg(777);
  const s = engine.createPet({ name: 'Lintas', species: 'mochi' }, T0, 'gen-test', 3).state;
  let now = T0;
  for (let gen = 0; gen < 6; gen++) {
    now += 4 * 24 * HOUR;
    engine.advance(s, now);
    assert.equal(s.stage, 'elder', `generasi ${gen + 1} mencapai lansia`);
    const res = engine.perform(s, now, { type: 'retire', name: `G${gen + 2}`, species: SPECIES[Math.floor(r() * SPECIES.length)] });
    assert.ok(res.ok, res.error);
    checkInvariants(s, `generasi ${gen + 2}`);
    const copy = JSON.parse(JSON.stringify(s));
    engine.migrate(copy, now);
    assert.deepEqual(copy.family, s.family);
  }
  assert.equal(s.generation, 7);
  assert.equal(s.family.length, 6);
});
