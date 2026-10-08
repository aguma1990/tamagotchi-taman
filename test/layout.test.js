'use strict';
// Tata letak: tidak boleh ada objek tetap yang tumpang tindih, dan semua harus berada di dalam dunia.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const C = require('../src/content');
const engine = require('../src/engine');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'public', 'layout.mjs')).href);

async function objects() {
  const L = await load();
  const list = [];
  for (const [id, r] of Object.entries(L.RIDES)) list.push({ name: `wahana:${id}`, box: L.abs(r) });
  for (const [id, b] of Object.entries(L.BUILDINGS)) list.push({ name: `bangunan:${id}`, box: L.abs(b) });
  for (const [id, d] of Object.entries(C.DECOR)) {
    for (const slot of d.slots) {
      if (L.SLOTS[slot].layer === 'sky') continue;
      list.push({ name: `dekorasi:${id}@${slot}`, slot, box: L.itemBox(slot, id) });
    }
  }
  return { L, list };
}

test('tata letak: tidak ada wahana, bangunan, atau dekorasi yang tumpang tindih', async () => {
  const { L, list } = await objects();
  const clashes = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.slot && a.slot === b.slot) continue; // pilihan berbeda untuk tempat yang sama
      if (L.overlaps(a.box, b.box)) clashes.push(`${a.name} ⟷ ${b.name}`);
    }
  }
  assert.deepEqual(clashes, [], `objek tumpang tindih:\n${clashes.join('\n')}`);
});

test('tata letak: semua objek berada di dalam dunia 900×520', async () => {
  const { L, list } = await objects();
  for (const o of list) {
    assert.ok(o.box[0] >= 0 && o.box[2] <= L.W && o.box[1] >= 0 && o.box[3] <= L.H, `${o.name} keluar dunia: ${o.box}`);
  }
});

test('tata letak: setiap dekorasi punya tempat yang valid & ukuran tercatat', async () => {
  const L = await load();
  assert.deepEqual(Object.keys(L.SLOTS).sort(), [...C.DECOR_SLOTS].sort());
  for (const [id, d] of Object.entries(C.DECOR)) {
    assert.ok(L.DECOR_SIZE[id], `ukuran ${id}`);
    assert.ok(d.slots.length >= 1);
    for (const s of d.slots) assert.ok(L.SLOTS[s], `${id} → slot ${s}`);
  }
});

test('tata letak: pintu rumah & toko berada di dalam bangunan masing-masing dan tidak saling menutupi', async () => {
  const { BUILDINGS, abs } = await load();
  for (const b of Object.values(BUILDINGS)) {
    const [x0, , x1, y1] = abs(b);
    assert.ok(b.door.x - b.door.w / 2 >= x0 && b.door.x + b.door.w / 2 <= x1 && b.door.y === y1);
  }
  const gap = Math.abs(BUILDINGS.house.door.x - BUILDINGS.shop.door.x);
  assert.ok(gap > 200);
});

test('harta karun hanya muncul di titik aman (tidak menimpa wahana)', async () => {
  const { RIDES, BUILDINGS, TREASURE_Y, abs, overlaps } = await load();
  assert.deepEqual([...C.TREASURE_SPOTS].sort((a, b) => a - b), [...C.TREASURE_SPOTS]);
  for (const x of C.TREASURE_SPOTS) {
    const chest = [x - 24, TREASURE_Y - 46, x + 24, TREASURE_Y];
    for (const [id, r] of Object.entries(RIDES)) assert.equal(overlaps(chest, abs(r)), false, `harta di x=${x} menimpa ${id}`);
    for (const [id, b] of Object.entries(BUILDINGS)) assert.equal(overlaps(chest, abs(b)), false, `harta di x=${x} menimpa ${id}`);
  }
});

test('penempatan dekorasi berslot: tidak ada dua dekorasi di tempat yang sama', () => {
  const s = engine.createPet({ name: 'A', species: 'mochi' }, 1, 'slot-test', 3).state;
  s.coins = 5000; s.level = 9;
  for (const id of Object.keys(C.DECOR)) engine.perform(s, s.lastTickAt, { type: 'decorBuy', item: id });
  const slots = Object.values(s.decor.slots);
  assert.equal(new Set(slots).size, slots.length, 'slot unik');
  assert.deepEqual(Object.keys(s.decor.slots).sort(), [...s.decor.placed].sort());
  // 4 dekorasi tinggi untuk 3 tempat → satu tersimpan dan tidak terpasang
  const tall = ['pohon', 'payung', 'tenda', 'kincir'];
  assert.equal(tall.filter((id) => s.decor.placed.includes(id)).length, 3);
  assert.equal(s.decor.owned.length, Object.keys(C.DECOR).length);
  const stored = tall.find((id) => !s.decor.placed.includes(id));
  const r = engine.perform(s, s.lastTickAt, { type: 'decorPlace', item: stored });
  assert.equal(r.ok, false);
  assert.match(r.error, /penuh/);
  // setelah salah satu disimpan, yang lain bisa dipasang & memakai tempat yang dilepas
  const placed = tall.find((id) => s.decor.placed.includes(id));
  const freed = s.decor.slots[placed];
  assert.ok(engine.perform(s, s.lastTickAt, { type: 'decorPlace', item: placed }).ok);
  assert.ok(engine.perform(s, s.lastTickAt, { type: 'decorPlace', item: stored }).ok);
  assert.equal(s.decor.slots[stored], freed);
});

test('migrasi: save lama dengan dekorasi terpasang mendapat tempat yang valid', () => {
  const s = engine.createPet({ name: 'A', species: 'mochi' }, 1, 'mig-slot', 3).state;
  s.decor.owned = ['pohon', 'bunga', 'bangku'];
  s.decor.placed = ['pohon', 'bunga', 'bangku', 'tidak-ada'];
  delete s.decor.slots;
  engine.migrate(s, s.lastTickAt);
  assert.deepEqual(s.decor.placed.sort(), ['bangku', 'bunga', 'pohon']);
  for (const id of s.decor.placed) assert.ok(C.DECOR[id].slots.includes(s.decor.slots[id]), id);
});
