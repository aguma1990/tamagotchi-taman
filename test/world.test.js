'use strict';
// Tes sistem baru: mini-game, cuaca, acara, tamu, album, keterampilan, watak, generasi, dekorasi.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const C = engine.C;

const { MIN, HOUR } = engine;
const T0 = new Date(2026, 5, 10, 9, 0, 0).getTime(); // waktu setempat, agar hari/minggu konsisten

function pet(extra = {}, species = 'mochi', seed = 42) {
  const r = engine.createPet({ name: 'Momo', species }, T0, 'pet-id-1', seed);
  assert.ok(r.ok);
  const s = r.state;
  engine.advance(s, T0 + 2 * MIN);
  Object.assign(s, extra);
  return s;
}
const act = (s, a, t = s.lastTickAt) => engine.perform(s, t, a);

// ---------- mini-game ----------
test('mini-game: semua jenis diterima, jenis tak dikenal & kunci berbahaya ditolak', () => {
  for (const game of Object.keys(C.MINIGAMES)) {
    const s = pet();
    assert.ok(act(s, { type: 'minigame', game, score: 20 }).ok, game);
  }
  const s = pet();
  assert.ok(act(s, { type: 'minigame', score: 20 }).ok, 'default = stars (kompatibel)');
  for (const bad of ['catur', '__proto__', 'constructor', 5, null]) {
    assert.equal(act(pet(), { type: 'minigame', game: bad, score: 20 }).ok, false, String(bad));
  }
});

test('mini-game: rekor baru memberi bonus sekali, stiker bintang di skor ≥30', () => {
  const s = pet();
  s.stats.energy = 100;
  const c0 = s.coins;
  const r = act(s, { type: 'minigame', game: 'memory', score: 32 });
  assert.ok(r.ok);
  assert.equal(s.highscores.memory, 32);
  assert.ok(s.album.bintang);
  const c1 = s.coins;
  assert.equal(c1 - c0 >= 12 + C.RECORD_BONUS, true);
  // skor lebih rendah tidak memberi rekor
  s.stats.energy = 100;
  const t = s.lastTickAt + 200000;
  engine.perform(s, t, { type: 'minigame', game: 'memory', score: 20 });
  assert.equal(s.highscores.memory, 32);
  // skor di bawah 10 tidak dihitung rekor
  const s2 = pet();
  act(s2, { type: 'minigame', game: 'rhythm', score: 6 });
  assert.equal(s2.highscores.rhythm, undefined);
});

// ---------- cuaca ----------
test('cuaca: deterministik, bervariasi, pelangi hanya setelah hujan/badai', () => {
  const s = pet();
  const seen = new Set();
  const at = (slot) => engine.weatherAt(s, slot * C.WEATHER_SLOT_MS + 1000);
  for (let slot = 1; slot < 600; slot++) {
    const w = at(slot);
    assert.equal(w, engine.weatherAt(s, slot * C.WEATHER_SLOT_MS + 15 * MIN), 'stabil dalam satu slot');
    seen.add(w);
    if (w === 'pelangi') assert.ok(['hujan', 'badai'].includes(at(slot - 1)), `pelangi setelah ${at(slot - 1)}`);
  }
  for (const w of Object.keys(C.WEATHERS)) assert.ok(seen.has(w), `cuaca ${w} muncul`);
});

function findWeather(s, name, from = T0) {
  for (let slot = Math.floor(from / C.WEATHER_SLOT_MS); slot < Math.floor(from / C.WEATHER_SLOT_MS) + 2000; slot++) {
    const t = slot * C.WEATHER_SLOT_MS + 60000;
    if (engine.weatherAt(s, t) === name) return t;
  }
  throw new Error(`cuaca ${name} tidak ditemukan`);
}

test('cuaca: hujan menambah senang saat bermain; pelangi menambah koin', () => {
  const sunny = pet();
  const rainy = pet();
  const tSun = findWeather(sunny, 'cerah'), tRain = findWeather(rainy, 'hujan'), tRb = findWeather(sunny, 'pelangi');
  for (const [s, t] of [[sunny, tSun], [rainy, tRain]]) { s.lastTickAt = t - MIN; s.stats.happiness = 40; s.stats.energy = 100; s.level = 5; }
  const a = engine.perform(sunny, tSun, { type: 'play', item: 'swing' });
  const b = engine.perform(rainy, tRain, { type: 'play', item: 'swing' });
  assert.ok(a.ok && b.ok);
  assert.ok(b.effects.happiness > a.effects.happiness, 'hujan lebih menyenangkan');
  const c = pet(); c.lastTickAt = tRb - MIN; c.stats.energy = 100;
  const coins0 = c.coins;
  engine.perform(c, tRb, { type: 'play', item: 'swing' });
  assert.ok(c.coins - coins0 >= 2, 'bonus koin pelangi');
});

test('harta karun pelangi memberi stiker pelangi', () => {
  const s = pet();
  s.treasure = { x: 300, amount: 10, t: 0, rainbow: true };
  assert.ok(act(s, { type: 'collect' }).ok);
  assert.ok(s.album.pelangi);
});

// ---------- acara ----------
test('acara: hari raya tetap, ulang tahun mingguan, klaim sekali sehari', () => {
  const s = pet();
  const aug17 = new Date(2026, 7, 17, 12).getTime();
  assert.equal(engine.eventOn(s, aug17).id, 'kemerdekaan');
  assert.equal(engine.eventOn(s, new Date(2026, 11, 25, 9).getTime()).id, 'natal');
  assert.equal(engine.eventOn(s, new Date(2026, 5, 11, 9).getTime()), null, 'hari biasa');
  const bday = new Date(2026, 5, 17, 10).getTime(); // tepat 7 hari setelah lahir
  assert.equal(engine.eventOn(s, bday).id, 'ultah');

  s.lastTickAt = aug17;
  const c0 = s.coins;
  assert.ok(engine.perform(s, aug17, { type: 'event' }).ok);
  assert.ok(s.coins - c0 >= 20);
  assert.ok(s.album.perayaan);
  assert.equal(engine.perform(s, aug17, { type: 'event' }).ok, false, 'tidak dua kali');
  assert.equal(act(pet(), { type: 'event' }).ok, false, 'hari biasa tidak ada hadiah');
});

test('acara: kalender Hijriah (Ramadhan & Idul Fitri) bila didukung', (t) => {
  if (!C.hijri(T0)) return t.skip('Intl Hijriah tidak tersedia');
  const s = pet();
  assert.equal(engine.eventOn(s, new Date(2026, 1, 25, 12).getTime()).id, 'ramadhan');
  assert.equal(engine.eventOn(s, new Date(2026, 2, 20, 12).getTime()).id, 'idulfitri');
});

// ---------- mingguan & kotak keberuntungan ----------
test('hadiah mingguan: butuh target misi, sekali per minggu, reset minggu berikutnya', () => {
  const s = pet();
  assert.equal(act(s, { type: 'weekly' }).ok, false);
  s.weekly.quests = engine.CONFIG.weeklyGoal;
  const c0 = s.coins;
  assert.ok(act(s, { type: 'weekly' }).ok);
  assert.ok(s.coins - c0 >= engine.CONFIG.weeklyReward);
  assert.ok(s.album.berlian);
  assert.equal(act(s, { type: 'weekly' }).ok, false);
  engine.advance(s, s.lastTickAt + 8 * 24 * HOUR);
  assert.equal(s.weekly.claimed, false);
  assert.equal(s.weekly.quests, 0);
});

test('klaim misi menambah progres mingguan', () => {
  const s = pet();
  s.daily.quests = [{ id: 'clean', progress: 1, claimed: false }, { id: 'feed', progress: 0, claimed: false }, { id: 'chat', progress: 0, claimed: false }];
  assert.ok(act(s, { type: 'quest', id: 'clean' }).ok);
  assert.equal(s.weekly.quests, 1);
});

test('kotak keberuntungan: sekali sehari dan selalu memberi sesuatu', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = pet({}, 'mochi', seed);
    const before = s.coins + Object.keys(s.album).length * 1000;
    assert.ok(act(s, { type: 'lucky' }).ok);
    assert.ok(s.coins + Object.keys(s.album).length * 1000 > before, `seed ${seed}`);
    assert.equal(act(s, { type: 'lucky' }).ok, false);
  }
});

// ---------- tamu & album ----------
test('tamu taman: muncul seiring waktu, bisa disapa sekali, hilang bila terlambat', () => {
  const s = pet();
  s.visitor = null;
  engine.advance(s, s.lastTickAt + 6 * HOUR);
  engine.advance(s, s.lastTickAt + 1000);
  for (let i = 0; i < 400 && !s.visitor; i++) engine.advance(s, s.lastTickAt + 10 * MIN);
  assert.ok(s.visitor && C.VISITORS[s.visitor.kind], 'tamu muncul');
  assert.ok(s.visitor.until > s.lastTickAt - 20 * MIN);

  const c0 = s.coins;
  const kind = s.visitor.kind;
  assert.ok(act(s, { type: 'greet' }).ok);
  assert.equal(s.visitor, null);
  assert.ok(s.coins > c0);
  assert.ok(s.album[kind]);
  assert.equal(act(s, { type: 'greet' }).ok, false);

  s.visitor = { kind: 'kupu', x: 200, until: s.lastTickAt + MIN };
  engine.advance(s, s.lastTickAt + 5 * MIN);
  assert.equal(s.visitor === null || s.visitor.kind !== 'kupu' || s.visitor.until > s.lastTickAt, true);
});

test('burung hantu hanya datang malam hari (waktu-game)', () => {
  const s = pet();
  let owlAtDay = 0, owlAtNight = 0;
  for (let i = 0; i < 6000; i++) {
    s.visitor = null;
    s.seed = i * 7919;
    const before = s.lastTickAt;
    engine.advance(s, before + MIN);
    if (s.visitor?.kind === 'hantu') {
      const h = engine.gameHour(s, s.lastTickAt);
      if (h >= 19 || h < 5) owlAtNight++; else owlAtDay++;
    }
  }
  assert.equal(owlAtDay, 0, `tidak ada burung hantu siang hari (malam: ${owlAtNight})`);
});

test('album: duplikat menambah hitungan, hadiah koleksi sekali', () => {
  const s = pet();
  const c0 = s.coins;
  // gunakan aksi nyata (menyapa tamu) untuk 4 stiker berbeda
  for (const id of ['kupu', 'burung', 'kelinci', 'kucing']) {
    s.visitor = { kind: id, x: 100, until: s.lastTickAt + 10 * MIN };
    assert.ok(act(s, { type: 'greet' }).ok);
  }
  assert.equal(Object.keys(s.album).length, 4);
  assert.ok(s.albumClaimed.includes(4));
  assert.ok(s.coins - c0 >= 15);
  s.visitor = { kind: 'kupu', x: 100, until: s.lastTickAt + 10 * MIN };
  act(s, { type: 'greet' });
  assert.equal(s.album.kupu, 2);
  assert.deepEqual(s.albumClaimed, [4]);
});

// ---------- keterampilan ----------
test('latihan: butuh energi & cooldown, naik level, ada batas maksimum', () => {
  const s = pet();
  s.stats.energy = 100;
  assert.equal(act(s, { type: 'train', skill: 'terbang' }).ok, false);
  assert.equal(act(s, { type: 'train', skill: '__proto__' }).ok, false);
  let t = s.lastTickAt;
  for (let i = 0; i < C.skillNeed(0); i++) {
    s.stats.energy = 100;
    assert.ok(engine.perform(s, t, { type: 'train', skill: 'lari' }).ok);
    assert.equal(engine.perform(s, t, { type: 'train', skill: 'lari' }).ok, false, 'cooldown');
    t += (C.TRAIN.cooldown + 1) * 1000;
  }
  assert.equal(s.skills.lari.lv, 1);
  s.stats.energy = 10;
  assert.match(engine.perform(s, t, { type: 'train', skill: 'pintar' }).error, /lelah/);
  s.skills.tangguh.lv = C.SKILL_MAX;
  s.stats.energy = 100;
  assert.match(engine.perform(s, t, { type: 'train', skill: 'tangguh' }).error, /maksimal/);
});

test('perk keterampilan: Lari hemat energi, Pintar tambah XP, Tangguh memperlambat lapar', () => {
  const a = pet({ level: 5 }), b = pet({ level: 5 });
  b.skills.lari.lv = 10;
  a.stats.energy = b.stats.energy = 100;
  const ra = act(a, { type: 'play', item: 'trampoline' }), rb = act(b, { type: 'play', item: 'trampoline' });
  assert.ok(rb.effects.energy > ra.effects.energy, 'energi terpakai lebih sedikit');

  const x = pet(), y = pet();
  y.skills.pintar.lv = 10;
  const xx = x.xp, yy = y.xp;
  act(x, { type: 'cuddle' }); act(y, { type: 'cuddle' });
  assert.ok(y.xp - yy > x.xp - xx || y.xp - yy >= 1);
  x.stats.hunger = y.stats.hunger = 100;
  const p = pet(), q = pet();
  q.skills.tangguh.lv = 10;
  p.stats.hunger = q.stats.hunger = 100;
  engine.advance(p, p.lastTickAt + 3 * HOUR / 6);
  engine.advance(q, q.lastTickAt + 3 * HOUR / 6);
  assert.ok(q.stats.hunger > p.stats.hunger, 'tangguh lebih lambat lapar');
});

// ---------- watak & favorit ----------
test('watak ditentukan dari kebiasaan saat remaja, dan memberi efek', () => {
  const s = pet();
  s.pc = { meals: 0, plays: 0, cuddles: 30, chats: 10, cleans: 0, trains: 0 };
  s.ageMinutes = engine.CONFIG.stageStarts.teen - 1;
  s.stage = 'child';
  engine.advance(s, s.lastTickAt + MIN);
  assert.equal(s.trait, 'manja');

  const b = pet();
  b.pc = { meals: 1, plays: 1, cuddles: 0, chats: 0, cleans: 0, trains: 0 };
  b.ageMinutes = engine.CONFIG.stageStarts.teen - 1; b.stage = 'child';
  engine.advance(b, b.lastTickAt + MIN);
  assert.equal(b.trait, 'seimbang');

  const m = pet({ trait: 'manja' }), n = pet({ trait: 'seimbang' });
  m.stats.happiness = n.stats.happiness = 20;
  const rm = act(m, { type: 'cuddle' }), rn = act(n, { type: 'cuddle' });
  assert.equal(rm.effects.happiness - rn.effects.happiness, 4);
});

test('makanan favorit & tidak suka: efek, terungkap setelah dicoba, stabil per peliharaan', () => {
  const s = pet();
  assert.notEqual(s.prefs.fav, s.prefs.hate);
  const again = engine.createPet({ name: 'X', species: 'bubu' }, T0, 'pet-id-1', 99).state;
  assert.equal(again.prefs.fav, s.prefs.fav, 'berasal dari id & waktu lahir, bukan RNG');

  s.stats.hunger = 20; s.stats.happiness = 50;
  assert.equal(s.prefs.known.fav, false);
  const r = act(s, { type: 'feed', food: s.prefs.fav });
  assert.ok(r.ok);
  assert.equal(s.prefs.known.fav, true);
  assert.ok(C.PREF_FOODS.includes(s.prefs.hate));
  s.stats.hunger = 20; s.stats.happiness = 50;
  const h = act(s, { type: 'feed', food: s.prefs.hate });
  assert.ok(h.ok);
  assert.equal(s.prefs.known.hate, true);
});

test('warna langka: sekitar 8% dan stabil untuk id yang sama', () => {
  let shiny = 0;
  for (let i = 0; i < 3000; i++) {
    const s = engine.createPet({ name: 'A', species: 'mochi' }, T0 + i, `id-${i}`, 1).state;
    if (s.shiny) shiny++;
    assert.equal(engine.createPet({ name: 'A', species: 'mochi' }, T0 + i, `id-${i}`, 5).state.shiny, s.shiny);
  }
  assert.ok(shiny / 3000 > 0.05 && shiny / 3000 < 0.11, `rasio ${shiny / 3000}`);
});

// ---------- lansia & generasi ----------
function makeElder() {
  const s = pet({ level: 4, coins: 50 });
  s.inventory.push('pita');
  s.equipped.head = 'pita';
  s.skills.lari = { lv: 6, xp: 0 };
  s.achievements.testflag = 1;
  s.form = 'radiant';
  s.ageMinutes = engine.CONFIG.stageStarts.elder - 1;
  s.stage = 'adult';
  engine.advance(s, s.lastTickAt + MIN);
  assert.equal(s.stage, 'elder');
  return s;
}

test('lansia: bisa pensiun, mewariskan telur baru, data akun terjaga', () => {
  const s = makeElder();
  const oldId = s.id, oldName = s.name, coins = s.coins, level = s.level;
  assert.equal(act(pet(), { type: 'retire', name: 'Baru', species: 'bubu' }).ok, false, 'belum lansia');
  assert.equal(act(s, { type: 'retire', name: '  ', species: 'bubu' }).ok, false);
  assert.equal(act(s, { type: 'retire', name: 'Baru', species: 'naga' }).ok, false);
  assert.equal(s.stage, 'elder', 'gagal tidak mengubah apa pun');

  assert.ok(act(s, { type: 'retire', name: 'Si Baru', species: 'trenggiling' }).ok);
  assert.equal(s.family.length, 1);
  assert.equal(s.family[0].name, oldName);
  assert.equal(s.generation, 2);
  assert.equal(s.stage, 'egg');
  assert.equal(s.species, 'trenggiling');
  assert.equal(s.name, 'Si Baru');
  assert.equal(s.ageMinutes, 0);
  assert.equal(s.skills.lari.lv, 3, 'mewarisi setengah keterampilan');
  assert.deepEqual(s.equipped, { head: null, face: null, neck: null });
  assert.ok(s.inventory.includes('pita'), 'aksesori milik akun tetap');
  assert.ok(s.achievements.testflag);
  assert.equal(s.id, oldId);
  assert.equal(s.level, level);
  assert.ok(s.coins >= coins + 30, 'warisan koin');
  assert.ok(s.album.mahkota);
  assert.ok(s.achievements.gen2 && s.achievements.elder);
  // generasi baru berjalan normal
  engine.advance(s, s.lastTickAt + 3 * MIN);
  assert.equal(s.stage, 'baby');
});

test('galeri keluarga dibatasi 50 dan tetap valid', () => {
  const s = makeElder();
  s.family = Array.from({ length: 50 }, (_, i) => ({ name: `L${i}` }));
  assert.ok(act(s, { type: 'retire', name: 'X', species: 'mochi' }).ok);
  assert.equal(s.family.length, 50);
  assert.equal(s.family.at(-1).name, 'Momo');
});

// ---------- dekorasi & tema ----------
test('dekorasi: beli, pasang/lepas, tingkat & koin dicek', () => {
  const s = pet({ coins: 200, level: 1 });
  assert.equal(act(s, { type: 'decorBuy', item: 'kincir' }).ok, false, 'butuh level 5');
  assert.equal(act(s, { type: 'decorBuy', item: '__proto__' }).ok, false);
  assert.ok(act(s, { type: 'decorBuy', item: 'bunga' }).ok);
  assert.ok(s.decor.placed.includes('bunga'));
  assert.equal(act(s, { type: 'decorBuy', item: 'bunga' }).ok, false, 'sudah punya');
  assert.ok(act(s, { type: 'decorPlace', item: 'bunga' }).ok);
  assert.ok(!s.decor.placed.includes('bunga'));
  assert.ok(act(s, { type: 'decorPlace', item: 'bunga' }).ok);
  assert.equal(act(s, { type: 'decorPlace', item: 'pohon' }).ok, false, 'belum dimiliki');
  s.coins = 5;
  assert.equal(act(s, { type: 'decorBuy', item: 'semak' }).ok, false, 'koin kurang');
});

test('tema taman: beli, ganti, tidak bisa memakai yang belum dimiliki', () => {
  const s = pet({ coins: 300, level: 5 });
  assert.equal(s.decor.theme, 'default');
  assert.equal(act(s, { type: 'themeSet', theme: 'sakura' }).ok, false);
  assert.ok(act(s, { type: 'themeBuy', theme: 'sakura' }).ok);
  assert.equal(s.decor.theme, 'sakura');
  assert.ok(act(s, { type: 'themeSet', theme: 'default' }).ok);
  assert.equal(s.decor.theme, 'default');
  assert.equal(act(s, { type: 'themeBuy', theme: 'sakura' }).ok, false);
  assert.equal(act(s, { type: 'themeSet', theme: 'constructor' }).ok, false);
});

// ---------- konfigurasi & migrasi ----------
test('konfigurasi klien lengkap dan tidak membocorkan fungsi', () => {
  const cfg = engine.buildConfig();
  for (const k of ['decor', 'themes', 'stickers', 'visitors', 'minigames', 'skills', 'traits', 'weathers', 'albumRewards', 'skillNeeds']) assert.ok(cfg[k], k);
  assert.equal(cfg.skillNeeds.length, C.SKILL_MAX);
  assert.ok(cfg.achievements.every((a) => typeof a.test === 'undefined'));
  assert.doesNotThrow(() => JSON.stringify(cfg));
  const v = engine.viewExtras(pet(), T0 + 5 * MIN);
  assert.ok(C.WEATHERS[v.world.weather]);
});

test('migrasi save lama: semua field baru terisi tanpa mengubah yang lama', () => {
  const s = pet();
  for (const k of ['generation', 'family', 'shiny', 'trait', 'prefs', 'pc', 'skills', 'highscores', 'album', 'albumClaimed', 'decor', 'visitor', 'eventClaimed', 'memory', 'weekly']) delete s[k];
  delete s.totals.visitors; delete s.totals.trains; delete s.totals.lucky; delete s.totals.weeklies;
  const coins = s.coins;
  engine.migrate(s, s.lastTickAt);
  assert.equal(s.generation, 1);
  assert.deepEqual(s.family, []);
  assert.equal(s.shiny, false, 'peliharaan lama tidak tiba-tiba menjadi langka');
  assert.ok(s.prefs.fav && s.prefs.hate);
  assert.equal(s.skills.lari.lv, 0);
  assert.equal(s.decor.theme, 'default');
  assert.equal(s.coins, coins);
  assert.equal(s.totals.weeklies, 0);
  assert.equal(s.weekly.claimed, false);
});

test('simulasi panjang 7 hari offline tidak merusak state & tetap cepat', () => {
  const s = pet();
  const t0 = Date.now();
  engine.advance(s, s.lastTickAt + 7 * 24 * HOUR);
  assert.ok(Date.now() - t0 < 1500, 'catch-up cukup cepat');
  assert.equal(s.stage, 'elder');
  for (const v of Object.values(s.stats)) assert.ok(v >= 0 && v <= 100 && Number.isFinite(v));
  assert.ok(Number.isFinite(s.coins));
  JSON.stringify(s);
});

test('migrasi: peliharaan lama yang sudah remaja mendapat watak', () => {
  const s = pet();
  s.stage = 'adult';
  delete s.trait;
  delete s.pc;
  engine.migrate(s, s.lastTickAt);
  assert.equal(s.trait, 'seimbang');
});

// ---------- ganti karakter & jeda 30 detik ----------
test('jeda main: semua wahana & mini-game 30 detik', () => {
  for (const [id, ride] of Object.entries(engine.PLAYGROUND)) assert.equal(ride.cooldown, 30, id);
  assert.equal(C.PLAY_COOLDOWN, 30);
  for (const item of Object.keys(engine.PLAYGROUND)) {
    const s = pet({ level: 5 });
    s.stats.energy = 100;
    const t = s.lastTickAt;
    assert.ok(engine.perform(s, t, { type: 'play', item }).ok, item);
    const early = engine.perform(s, t + 29000, { type: 'play', item });
    assert.equal(early.ok, false, `${item} @29 dtk`);
    assert.match(early.error, /Tunggu 1 detik/);
    assert.ok(engine.perform(s, t + 30000, { type: 'play', item }).ok, `${item} @30 dtk`);
  }
  const s = pet();
  s.stats.energy = 100;
  const t = s.lastTickAt;
  assert.ok(engine.perform(s, t, { type: 'minigame', game: 'food', score: 20 }).ok);
  assert.equal(engine.perform(s, t + 29000, { type: 'minigame', game: 'rhythm', score: 20 }).ok, false);
  assert.ok(engine.perform(s, t + 30000, { type: 'minigame', game: 'rhythm', score: 20 }).ok);
  assert.equal(engine.buildConfig().minigameCooldown, 30);
});

test('ganti karakter: jenis berubah, kemajuan tetap, biaya dipotong', () => {
  const s = pet({ level: 4, coins: 40 });
  s.skills.lari = { lv: 3, xp: 1 };
  const keep = { age: s.ageMinutes, level: s.level, xp: s.xp, stage: s.stage, stats: { ...s.stats }, skills: JSON.stringify(s.skills), shiny: s.shiny, id: s.id };
  const r = act(s, { type: 'morph', species: 'trenggiling' });
  assert.ok(r.ok);
  assert.equal(s.species, 'trenggiling');
  assert.equal(s.coins, 40 - C.MORPH_COST);
  assert.equal(s.totals.morphs, 1);
  assert.deepEqual({ age: s.ageMinutes, level: s.level, xp: s.xp, stage: s.stage, skills: JSON.stringify(s.skills), shiny: s.shiny, id: s.id }, { age: keep.age, level: keep.level, xp: keep.xp, stage: keep.stage, skills: keep.skills, shiny: keep.shiny, id: keep.id });
  assert.equal(s.name, 'Momo', 'nama tidak berubah bila tidak diisi');
  assert.ok(r.effects.coins === -C.MORPH_COST);
});

test('ganti karakter: ganti nama gratis, validasi, dan penolakan', () => {
  const s = pet({ coins: 100 });
  assert.ok(act(s, { type: 'morph', name: '  Kiko<b> ' }).ok);
  assert.equal(s.name, 'Kikob', 'nama dibersihkan');
  assert.equal(s.coins, 100, 'ganti nama gratis');
  assert.equal(s.species, 'mochi');
  assert.equal(act(s, { type: 'morph', species: 'mochi', name: 'Kikob' }).ok, false, 'tidak ada perubahan');
  assert.equal(act(s, { type: 'morph', species: 'naga' }).ok, false);
  for (const bad of ['__proto__', 'constructor', 5, null, {}]) assert.equal(act(s, { type: 'morph', species: bad }).ok, false, String(bad));
  assert.equal(act(s, { type: 'morph', name: '   ' }).ok, false, 'nama kosong');
  assert.equal(s.coins, 100);
  s.coins = C.MORPH_COST - 1;
  assert.match(act(s, { type: 'morph', species: 'babi' }).error, /koin/i);
  assert.equal(s.species, 'mochi', 'gagal tidak mengubah apa pun');
  s.coins = C.MORPH_COST;
  assert.ok(act(s, { type: 'morph', species: 'babi' }).ok);
  assert.equal(s.coins, 0);
});

test('ganti karakter: bisa saat masih telur & saat tidur; prestasi Si Bunglon', () => {
  const egg = engine.createPet({ name: 'Telur', species: 'bubu' }, T0, 'egg-1', 9).state;
  egg.coins = 50;
  assert.ok(engine.perform(egg, T0, { type: 'morph', species: 'leafy' }).ok);
  assert.equal(egg.species, 'leafy');
  assert.equal(egg.stage, 'egg');

  const s = pet({ coins: 100, sleeping: true });
  for (const sp of ['babi', 'bubu', 'trenggiling']) assert.ok(act(s, { type: 'morph', species: sp }).ok, sp);
  assert.equal(s.totals.morphs, 3);
  assert.ok(s.achievements.morph3);
  assert.equal(s.sleeping, true, 'tetap tidur');
});

test('ganti karakter: obrolan memakai gaya jenis yang baru', () => {
  const s = pet({ coins: 100 });
  act(s, { type: 'morph', species: 'babi' });
  let oink = 0;
  for (let i = 0; i < 40; i++) if (/Oink/.test(engine.perform(s, s.lastTickAt + (i + 1) * 40000, { type: 'chat', text: 'apa kabar' }).reply)) oink++;
  assert.ok(oink > 5, `gaya babi muncul (${oink}/40)`);
});
