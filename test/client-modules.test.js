'use strict';
// Modul klien murni: kode teman & pengingat notifikasi.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const engine = require('../src/engine');
const imp = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', f)).href);

function pet() {
  const T0 = new Date(2026, 5, 10, 9, 0, 0).getTime();
  const s = engine.createPet({ name: 'Momo', species: 'trenggiling' }, T0, 'client-id-1', 3).state;
  engine.advance(s, T0 + 5 * engine.MIN);
  Object.assign(s, { coins: 999, level: 9 });
  for (const a of [{ type: 'decorBuy', item: 'pohon' }, { type: 'decorBuy', item: 'bunga' }, { type: 'houseBuy' }, { type: 'houseDecorBuy', item: 'mainan' }, { type: 'tintBuy', tint: 'mint' }, { type: 'buy', item: 'pita' }]) {
    assert.equal(engine.perform(s, s.lastTickAt, a).ok, true, JSON.stringify(a));
  }
  return s;
}

test('kode taman: bolak-balik utuh, tanpa data pribadi', async () => {
  const { makeCode, parseCode, friendPet, PREFIX } = await imp('friend.mjs');
  const cfg = engine.buildConfig();
  const s = pet();
  const code = makeCode(s);
  assert.ok(code.startsWith(PREFIX) && code.length < 1200);
  assert.ok(!code.includes('coins'), 'tidak membawa koin');
  const r = parseCode(code, cfg);
  assert.equal(r.ok, true);
  const f = r.friend;
  assert.equal(f.name, 'Momo'); assert.equal(f.species, 'trenggiling'); assert.equal(f.tint, 'mint');
  assert.equal(f.equipped.head, 'pita'); assert.deepEqual(f.houseItems, ['mainan']); assert.equal(f.houseOwned, true);
  assert.deepEqual(Object.keys(f.decor).sort(), ['bunga', 'pohon']);
  const fp = friendPet(f);
  assert.equal(fp.house.owned, true); assert.equal(fp.tint.active, 'mint');
  assert.ok(JSON.parse(JSON.stringify(fp)));
  assert.equal(JSON.stringify(f).includes('999'), false);
});

test('kode taman: input jahat/rusak ditolak atau dibersihkan, tidak pernah melempar', async () => {
  const { makeCode, parseCode, PREFIX } = await imp('friend.mjs');
  const cfg = engine.buildConfig();
  for (const bad of [undefined, null, 42, {}, '', 'halo', 'TAMA1.', 'TAMA1.!!!', 'TAMA1.' + 'A'.repeat(5000), 'TAMA2.abc', `${PREFIX}e30`, `${PREFIX}bnVsbA`]) {
    const r = parseCode(bad, cfg);
    assert.equal(r.ok, false, String(bad).slice(0, 20));
    assert.equal(typeof r.error, 'string');
  }
  const enc = (o) => PREFIX + Buffer.from(JSON.stringify(o)).toString('base64url');
  const base = { v: 1, id: 'friend-1', n: 'Teman', sp: 'mochi', st: 'adult', lv: 5 };
  assert.equal(parseCode(enc({ ...base, sp: '__proto__' }), cfg).ok, false);
  assert.equal(parseCode(enc({ ...base, id: '../../x' }), cfg).ok, false);
  assert.equal(parseCode(enc({ ...base, st: 'constructor' }), cfg).ok, false);
  const dirty = parseCode(enc({ ...base, n: '<img src=x onerror=alert(1)>', lv: 1e9, th: '__proto__', tn: 'constructor', tr: 'x',
    dc: { pohon: 'F1', bunga: 'T1', __proto__: 'T1', kotakpos: 'F1', lampu: 'P1' }, hi: ['mainan', 'mainan', 'x', '__proto__'], eq: { head: 'mint', face: 'pita', neck: 'syal' } }), cfg);
  assert.equal(dirty.ok, true);
  const f = dirty.friend;
  assert.ok(!/[<>]/.test(f.name), f.name);
  assert.equal(f.level, 99); assert.equal(f.theme, 'default'); assert.equal(f.tint, null); assert.equal(f.trait, null);
  assert.deepEqual(f.decor, { kotakpos: 'F1', lampu: 'P1' }, 'tempat salah/ganda dibuang');
  assert.deepEqual(f.houseItems, ['mainan']);
  assert.deepEqual(f.equipped, { head: null, face: null, neck: 'syal' });
  assert.equal(parseCode(makeCode(pet()), cfg).ok, true);
});

test('notifikasi: pengingat sesuai kondisi, dibatasi cooldown, telur & tidur diabaikan', async () => {
  const { alertsFor, COOLDOWN_MS } = await imp('notify.mjs');
  const mk = (o = {}) => ({ name: 'Momo', stage: 'child', sleeping: false, sick: false, poop: 0, stats: { hunger: 80, thirst: 80, hygiene: 80, energy: 80 }, house: { owned: false, inside: false }, ...o });
  assert.deepEqual(alertsFor(mk(), { weather: 'cerah' }), []);
  assert.deepEqual(alertsFor(mk({ stage: 'egg', sick: true }), null), []);
  const keys = (p, w, last) => alertsFor(p, w, last).map((a) => a.key).sort();
  assert.deepEqual(keys(mk({ sick: true, stats: { hunger: 5, thirst: 5, hygiene: 5, energy: 5 } }), { weather: 'hujan' }), ['dirty', 'hungry', 'rain', 'sick', 'thirsty', 'tired']);
  assert.deepEqual(keys(mk({ sleeping: true, stats: { hunger: 5, thirst: 5, hygiene: 5, energy: 5 } }), { weather: 'cerah' }), [], 'tidur: tak diganggu');
  assert.deepEqual(keys(mk({ house: { owned: true, inside: true } }), { weather: 'badai' }), [], 'sudah berteduh');
  assert.deepEqual(keys(mk(), { weather: 'meteor', wishable: true }), ['meteor']);
  const now = Date.now();
  assert.deepEqual(alertsFor(mk({ sick: true }), null, { sick: now - 1000 }, now), []);
  assert.equal(alertsFor(mk({ sick: true }), null, { sick: now - COOLDOWN_MS - 1 }, now).length, 1);
});
