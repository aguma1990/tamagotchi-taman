'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const engine = require('../src/engine');
const { Store } = require('../src/store');
const { Game } = require('../src/game');

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const { MIN, HOUR } = engine;

function newPet(extra = {}) {
  const r = engine.createPet({ name: 'Momo', species: 'mochi' }, T0, 'id-1', 42);
  assert.ok(r.ok);
  Object.assign(r.state, extra);
  return r.state;
}
function hatched() {
  const s = newPet();
  engine.advance(s, T0 + 2 * MIN);
  return s;
}

test('createPet memvalidasi nama & spesies', () => {
  assert.equal(engine.createPet({ name: '  ', species: 'mochi' }, T0, 'x', 1).ok, false);
  assert.equal(engine.createPet({ name: 'A', species: 'naga' }, T0, 'x', 1).ok, false);
  const r = engine.createPet({ name: '<b>Bo\u0000bo</b>', species: 'bubu' }, T0, 'x', 1);
  assert.equal(r.state.name, 'bBobo/b');
});

test('telur menetas setelah 1 menit', () => {
  const s = newPet();
  const ctx = engine.advance(s, T0 + 90 * 1000);
  assert.equal(s.stage, 'baby');
  assert.ok(ctx.events.some((e) => e.type === 'hatch'));
});

test('deterministik: seed sama + langkah sama = hasil sama', () => {
  const a = hatched();
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 240; i++) {
    engine.advance(a, a.lastTickAt + MIN);
    engine.advance(b, b.lastTickAt + MIN);
  }
  assert.deepEqual(a, b);
  assert.ok(a.stats.hunger < 100);
});

test('ditinggal lama: lebih lambat lapar & tidak pernah mati', () => {
  const s = hatched();
  const ctx = engine.advance(s, s.lastTickAt + 30 * 24 * HOUR);
  assert.ok(ctx.events.some((e) => e.type === 'away'));
  assert.ok(s.stats.health >= 1);
  for (const v of Object.values(s.stats)) assert.ok(v >= 0 && v <= 100);
});

test('batas catch-up 7 hari', () => {
  const s = hatched();
  const age = s.ageMinutes;
  engine.advance(s, s.lastTickAt + 365 * 24 * HOUR);
  assert.equal(s.ageMinutes - age, 7 * 24 * 60 * engine.CONFIG.speed);
});

test('jam mundur tidak merusak state', () => {
  const s = hatched();
  const before = s.ageMinutes;
  engine.advance(s, s.lastTickAt - HOUR);
  assert.equal(s.ageMinutes, before);
});

test('makan: kenyang ditolak, koin dipotong', () => {
  const s = hatched();
  s.stats.hunger = 30;
  s.coins = 20;
  let r = engine.perform(s, s.lastTickAt, { type: 'feed', food: 'burger' });
  assert.ok(r.ok);
  assert.equal(s.coins, 15);
  s.stats.hunger = 99;
  s.stats.thirst = 99;
  s.stats.energy = 99;
  r = engine.perform(s, s.lastTickAt, { type: 'feed', food: 'apel' });
  assert.equal(r.ok, false);
  r = engine.perform(s, s.lastTickAt, { type: 'feed', food: 'tidakada' });
  assert.equal(r.ok, false);
});

test('taman bermain: level terkunci & cooldown', () => {
  const s = hatched();
  let r = engine.perform(s, s.lastTickAt, { type: 'play', item: 'trampoline' });
  assert.equal(r.ok, false);
  r = engine.perform(s, s.lastTickAt, { type: 'play', item: 'swing' });
  assert.ok(r.ok);
  assert.ok(r.effects.coins >= 1);
  r = engine.perform(s, s.lastTickAt, { type: 'play', item: 'swing' });
  assert.equal(r.ok, false);
});

test('minigame: skor dibatasi & input tidak valid ditolak', () => {
  const s = hatched();
  assert.equal(engine.perform(s, s.lastTickAt, { type: 'minigame', score: 'abc' }).ok, false);
  assert.equal(engine.perform(s, s.lastTickAt, { type: 'minigame', score: -5 }).ok, false);
  s.coins = 0;
  const r = engine.perform(s, s.lastTickAt, { type: 'minigame', score: 99999 });
  assert.ok(r.ok);
  // 12 koin (batas) + 3 bonus rekor + 25 prestasi "Pemecah Rekor" (skor 60 ≥ 40)
  assert.equal(s.highscores.stars, 60);
  assert.equal(s.coins, 12 + engine.C.RECORD_BONUS + 25);
});

test('sakit lalu sembuh dengan obat', () => {
  const s = hatched();
  s.sick = true;
  s.coins = 10;
  assert.ok(engine.perform(s, s.lastTickAt, { type: 'medicine' }).ok);
  assert.equal(s.sick, false);
  assert.equal(engine.perform(s, s.lastTickAt, { type: 'medicine' }).ok, false);
});

test('tidur otomatis ketika energi habis & bangun saat penuh', () => {
  const s = hatched();
  s.stats.energy = 8.05;
  engine.advance(s, s.lastTickAt + 2 * MIN);
  assert.equal(s.sleeping, true);
  s.stats.energy = 99.9;
  engine.advance(s, s.lastTickAt + 2 * MIN);
  assert.equal(s.sleeping, false);
});

test('evolusi dewasa: radiant bila perawatan baik', () => {
  const s = hatched();
  s.ageMinutes = engine.CONFIG.stageStarts.adult - 1;
  s.stage = 'teen';
  s.careSum = 90;
  s.careSamples = 1;
  engine.advance(s, s.lastTickAt + MIN);
  assert.equal(s.stage, 'adult');
  assert.equal(s.form, 'radiant');
});

test('level & xp', () => {
  assert.equal(engine.levelForXp(0), 1);
  assert.equal(engine.levelForXp(25), 2);
  assert.equal(engine.levelForXp(400), 5);
  assert.equal(engine.xpForLevel(5), 400);
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tama-'));
}

test('persistensi: service mati lalu hidup lagi = riwayat & state tetap', () => {
  const dir = tmpDir();
  let now = T0;
  const clock = () => now;

  let game = new Game(new Store(dir), clock);
  assert.ok(game.create({ name: 'Momo', species: 'bubu' }).ok);
  now += 3 * MIN;
  assert.ok(game.act({ type: 'play', item: 'swing' }).ok);
  game.shutdown();

  // service mati 6 jam
  now += 6 * HOUR;
  game = new Game(new Store(dir), clock);
  assert.equal(game.state.name, 'Momo');
  assert.ok(game.state.stats.hunger < 80, 'waktu berjalan selama mati');
  const types = game.store.readEvents(50).map((e) => e.type);
  for (const t of ['birth', 'hatch', 'play', 'away']) assert.ok(types.includes(t), `riwayat memuat ${t}`);
  assert.ok(game.store.readSamples(0).length > 0);
});

test('pemulihan: pet.json rusak → pulih dari backup', () => {
  const dir = tmpDir();
  const store = new Store(dir);
  const game = new Game(store, () => T0);
  game.create({ name: 'Momo', species: 'leafy' });
  store._backup(T0);
  fs.writeFileSync(path.join(dir, 'pet.json'), '{rusak');
  const again = new Game(new Store(dir), () => T0);
  assert.equal(again.state.name, 'Momo');
});

test('tulis atomik: tidak ada .tmp tersisa & JSONL rusak dilewati', () => {
  const dir = tmpDir();
  const store = new Store(dir);
  store.save(newPet(), T0);
  assert.equal(fs.existsSync(path.join(dir, 'pet.json.tmp')), false);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"t":1,"type":"a","msg":"x"}\nrusak\n{"t":2,"type":"b","msg":"y"}\n');
  assert.deepEqual(store.readEvents(10).map((e) => e.t), [2, 1]);
});

// ---------- ekonomi, misi, toko, prestasi ----------
const act = (s, a, t = s.lastTickAt) => engine.perform(s, t, a);

test('keamanan: kunci berbahaya (__proto__, constructor) ditolak, koin tidak rusak', () => {
  const s = hatched();
  s.coins = 10;
  for (const key of ['__proto__', 'constructor', 'toString', 5, null, {}]) {
    assert.equal(act(s, { type: 'feed', food: key }).ok, false);
    assert.equal(act(s, { type: 'play', item: key }).ok, false);
    assert.equal(act(s, { type: 'buy', item: key }).ok, false);
  }
  assert.ok(Number.isFinite(s.coins));
});

test('hadiah harian: sekali per hari & streak naik berurutan', () => {
  const s = hatched();
  const c0 = s.coins;
  let r = act(s, { type: 'daily' });
  assert.ok(r.ok);
  assert.equal(s.streak.count, 1);
  assert.equal(s.coins - c0 >= 7, true);
  assert.equal(act(s, { type: 'daily' }).ok, false);
  // hari berikutnya
  const next = s.lastTickAt + 24 * HOUR;
  r = engine.perform(s, next, { type: 'daily' });
  assert.ok(r.ok);
  assert.equal(s.streak.count, 2);
  // bolos 3 hari → streak reset
  r = engine.perform(s, next + 4 * 24 * HOUR, { type: 'daily' });
  assert.ok(r.ok);
  assert.equal(s.streak.count, 1);
});

test('misi harian: progres, klaim, bonus semua selesai', () => {
  const s = hatched();
  s.coins = 0;
  s.stats.hunger = 10;
  s.daily.quests = [
    { id: 'feed', progress: 0, claimed: false },
    { id: 'clean', progress: 0, claimed: false },
    { id: 'cuddle', progress: 0, claimed: false },
  ];
  assert.equal(act(s, { type: 'quest', id: 'feed' }).ok, false, 'belum selesai');
  s.stats.hunger = 10; act(s, { type: 'feed', food: 'bubur' });
  s.stats.hunger = 10; act(s, { type: 'feed', food: 'bubur' });
  s.stats.hunger = 10; act(s, { type: 'feed', food: 'bubur' });
  s.stats.hygiene = 50; act(s, { type: 'clean' });
  for (let i = 0; i < 5; i++) { act(s, { type: 'cuddle' }, s.lastTickAt + i * 25000); }
  const before = s.coins;
  for (const id of ['feed', 'clean', 'cuddle']) assert.ok(engine.perform(s, s.lastTickAt + 200000, { type: 'quest', id }).ok, id);
  const gain = s.coins - before;
  const expected = engine.QUESTS.feed.reward + engine.QUESTS.clean.reward + engine.QUESTS.cuddle.reward + engine.QUEST_BONUS;
  assert.ok(gain >= expected);
  assert.equal(act(s, { type: 'quest', id: 'feed' }).ok, false, 'tidak bisa klaim dua kali');
});

test('misi diganti saat ganti hari', () => {
  const s = hatched();
  const d0 = s.daily.date;
  engine.perform(s, s.lastTickAt + 30 * HOUR, { type: 'wake' });
  assert.notEqual(s.daily.date, d0);
  assert.equal(s.daily.quests.length, 3);
});

test('harta karun: bisa diambil sekali', () => {
  const s = hatched();
  s.treasure = null;
  assert.equal(act(s, { type: 'collect' }).ok, false);
  s.treasure = { x: 300, amount: 6, t: 0 };
  const c = s.coins;
  assert.ok(act(s, { type: 'collect' }).ok);
  assert.ok(s.coins - c >= 6);
  assert.equal(s.treasure, null);
  assert.equal(s.totals.treasures, 1);
  assert.equal(act(s, { type: 'collect' }).ok, false);
});

test('harta karun muncul seiring waktu & tidak menumpuk', () => {
  const s = hatched();
  s.treasure = null;
  engine.advance(s, s.lastTickAt + 6 * HOUR);
  assert.ok(s.treasure && engine.C.TREASURE_SPOTS.includes(s.treasure.x), 'harta muncul di titik aman');
  assert.ok(s.treasure.amount >= 3 && s.treasure.amount <= 8);
});

test('toko: beli, level terkunci, koin kurang, pasang/lepas', () => {
  const s = hatched();
  s.coins = 100;
  assert.equal(act(s, { type: 'buy', item: 'mahkota' }).ok, false, 'butuh level 5');
  s.coins = 10;
  assert.equal(act(s, { type: 'buy', item: 'pita' }).ok, false, 'koin kurang');
  s.coins = 100;
  assert.ok(act(s, { type: 'buy', item: 'pita' }).ok);
  assert.equal(s.equipped.head, 'pita');
  assert.equal(act(s, { type: 'buy', item: 'pita' }).ok, false, 'sudah dimiliki');
  assert.ok(act(s, { type: 'equip', item: 'pita' }).ok);
  assert.equal(s.equipped.head, null, 'toggle melepas');
  assert.equal(act(s, { type: 'equip', item: 'baret' }).ok, false, 'belum dimiliki');
});

test('prestasi terbuka sekali & memberi koin', () => {
  const s = hatched();
  assert.ok(s.achievements.hatch);
  const c = s.coins;
  s.totals.meals = 10;
  engine.advance(s, s.lastTickAt + MIN);
  assert.ok(s.achievements.meals10);
  const gain = s.coins - c;
  engine.advance(s, s.lastTickAt + MIN);
  assert.equal(s.coins - c, gain, 'tidak diberikan dua kali');
});

test('naik level memberi bonus koin', () => {
  const s = hatched();
  s.xp = 24;
  s.coins = 0;
  s.stats.hunger = 10;
  act(s, { type: 'feed', food: 'bubur' });
  assert.equal(s.level, 2);
  assert.ok(s.coins >= 10);
});

test('migrasi: save lama dilengkapi field baru', () => {
  const s = hatched();
  for (const k of ['inventory', 'equipped', 'daily', 'streak', 'achievements', 'treasure']) delete s[k];
  delete s.totals.treasures;
  delete s.totals.quests;
  engine.migrate(s, s.lastTickAt);
  assert.deepEqual(s.inventory, []);
  assert.equal(s.equipped.head, null);
  assert.equal(s.daily.quests.length, 3);
  assert.equal(s.totals.treasures, 0);
});

// ---------- obrolan ----------
const say = (s, text, t = s.lastTickAt) => engine.perform(s, t, { type: 'chat', text });

test('obrolan: validasi input', () => {
  const s = hatched();
  assert.equal(say(s, '   ').ok, false);
  assert.equal(say(s, 'a'.repeat(161)).ok, false);
  assert.equal(say(s, 123).ok, false);
  assert.equal(engine.perform(s, s.lastTickAt, { type: 'chat' }).ok, false);
  assert.ok(say(s, 'a'.repeat(160)).ok);
});

test('obrolan: balasan mengikuti kondisi (lapar / ngantuk / kenyang)', () => {
  const s = hatched();
  s.stats.hunger = 10;
  assert.match(say(s, 'kamu lapar nggak?').reply, /lapar/i);
  s.stats.hunger = 95;
  assert.match(say(s, 'lapar?', s.lastTickAt + 40000).reply, /kenyang/i);
  s.stats.energy = 15;
  assert.match(say(s, 'ngantuk ya', s.lastTickAt + 80000).reply, /ngantuk|bobo/i);
});

test('obrolan: ingat nama pemilik & nama disanitasi', () => {
  const s = hatched();
  const r = say(s, 'Namaku Budi ya');
  assert.equal(s.owner, 'Budi');
  assert.match(r.reply, /Budi/);
  assert.match(say(s, 'halo', s.lastTickAt + 40000).reply, /Budi/);
  say(s, 'panggil aku <script>', s.lastTickAt + 80000);
  assert.ok(!/[<>]/.test(s.owner));
});

test('obrolan: pesan tak dikenal tetap dibalas, tidak error', () => {
  const s = hatched();
  for (const msg of ['asdfghjkl', '???', '🙂🙂', '__proto__', 'constructor']) {
    const r = say(s, msg, s.lastTickAt + 40000);
    assert.ok(r.ok && typeof r.reply === 'string' && r.reply.length > 0, msg);
  }
});

test('obrolan: hadiah hanya tiap 30 detik (anti-spam), tidur & telur tidak memberi hadiah', () => {
  const s = hatched();
  s.stats.happiness = 50;
  const t = s.lastTickAt;
  assert.ok(say(s, 'halo', t).ok);
  assert.equal(s.totals.chats, 1);
  const h = s.stats.happiness;
  say(s, 'halo lagi', t + 1000);
  assert.equal(s.totals.chats, 1);
  assert.ok(Math.abs(s.stats.happiness - h) < 0.5);
  say(s, 'halo lagi', t + 31000);
  assert.equal(s.totals.chats, 2);

  s.sleeping = true;
  const r = say(s, 'bangun dong', t + 70000);
  assert.match(r.reply, /Zzz/);
  assert.equal(s.totals.chats, 2);

  const egg = engine.createPet({ name: 'Egg', species: 'bubu' }, T0, 'e', 1).state;
  assert.match(engine.perform(egg, T0, { type: 'chat', text: 'halo' }).reply, /Telur/);
});

test('obrolan: deterministik untuk state yang sama', () => {
  const a = hatched();
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(say(a, 'ceritakan lelucon').reply, say(b, 'ceritakan lelucon').reply);
});

test('obrolan: tersimpan permanen di chat.jsonl dan selamat dari restart', () => {
  const dir = tmpDir();
  let now = T0;
  const clock = () => now;
  let game = new Game(new Store(dir), clock);
  game.create({ name: 'Momo', species: 'mochi' });
  now += 3 * MIN;
  const r = game.act({ type: 'chat', text: 'Halo Momo' });
  assert.ok(r.ok && r.reply);
  game.shutdown();
  game = new Game(new Store(dir), () => now + HOUR);
  const log = game.store.readChat(10);
  assert.deepEqual(log.map((m) => m.from), ['you', 'pet']);
  assert.equal(log[0].text, 'Halo Momo');
  assert.equal(log[1].text, r.reply);
});

// ---------- haus, minum, spesies baru ----------
test('haus: menurun seiring waktu & dipulihkan oleh air putih', () => {
  const s = hatched();
  const t0 = s.stats.thirst;
  engine.advance(s, s.lastTickAt + 3 * MIN);
  assert.ok(s.stats.thirst < t0);
  s.stats.thirst = 20;
  const r = act(s, { type: 'feed', food: 'air' });
  assert.ok(r.ok);
  assert.ok(s.stats.thirst >= 60);
  assert.equal(r.effects.thirst > 0, true);
  assert.equal(s.coins >= 0, true);
});

test('minum ditolak bila tidak haus, makan tidak ditolak karena haus saja', () => {
  const s = hatched();
  s.stats.thirst = 99;
  assert.match(act(s, { type: 'feed', food: 'air' }).error, /tidak haus/);
  s.stats.hunger = 30;
  assert.ok(act(s, { type: 'feed', food: 'burger' }).ok);
});

test('haus parah menurunkan kesehatan tetapi tidak mematikan', () => {
  const s = hatched();
  s.stats.thirst = 0; s.stats.hunger = 100; s.stats.energy = 100; s.stats.hygiene = 100;
  const h = s.stats.health;
  engine.advance(s, s.lastTickAt + 4 * MIN);
  assert.ok(s.stats.health < h);
  engine.advance(s, s.lastTickAt + 40 * 24 * HOUR);
  assert.ok(s.stats.health >= 1);
});

test('obrolan: pertanyaan soal haus dibalas sesuai kondisi', () => {
  const s = hatched();
  s.stats.thirst = 10;
  assert.match(say(s, 'kamu haus nggak?').reply, /haus/i);
  s.stats.thirst = 95;
  assert.match(say(s, 'haus?', s.lastTickAt + 40000).reply, /nggak haus/i);
});

test('spesies babi & trenggiling bisa dibuat dan berbicara', () => {
  for (const sp of ['babi', 'trenggiling']) {
    const r = engine.createPet({ name: 'X', species: sp }, T0, `id-${sp}`, 3);
    assert.ok(r.ok, sp);
    const s = r.state;
    engine.advance(s, T0 + 5 * MIN);
    assert.ok(say(s, 'apa kabar', T0 + 5 * MIN).reply.length > 0);
  }
  assert.equal(engine.createPet({ name: 'X', species: 'naga' }, T0, 'i', 1).ok, false);
});

test('migrasi: save lama tanpa stat haus diberi nilai awal', () => {
  const s = hatched();
  delete s.stats.thirst;
  engine.migrate(s, s.lastTickAt);
  assert.equal(s.stats.thirst, 80);
});
