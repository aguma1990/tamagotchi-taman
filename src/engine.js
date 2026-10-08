'use strict';
/**
 * Game engine — murni (tanpa I/O), deterministik (RNG di-seed dari state),
 * sehingga mudah dites dan aman dijalankan ulang untuk "catch-up" saat offline.
 */

const chat = require('./chat');
const C = require('./content');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const CONFIG = Object.freeze({
  schemaVersion: 1,
  dayRealMinutes: 48, // satu hari game = 48 menit nyata (1 jam game = 2 menit nyata)
  dayStartHour: 8, // peliharaan lahir pukul 08.00 waktu game
  speed: 2, // kecepatan game: 2 = semua proses berjalan 2x lebih cepat dari jam nyata
  maxCatchUpMs: 7 * 24 * HOUR, // batas simulasi saat ditinggal lama
  offlineThresholdMs: 5 * MIN, // jeda > ini dianggap "ditinggal"
  offlineMultiplier: 0.4, // peliharaan lebih lambat lapar saat ditinggal
  hatchMinutes: 1,
  healthFloor: 1, // peliharaan tidak pernah mati, hanya lemah
  maxPoop: 4,
  // umur (menit waktu-game): lansia ±3 hari nyata, setelah itu bisa pensiun & mengasuh telur baru
  stageStarts: Object.freeze({ egg: 0, baby: 1, child: 360, teen: 1440, adult: 4320, elder: 8640 }),
  weeklyGoal: 12, // misi harian yang diklaim dalam seminggu untuk hadiah mingguan
  weeklyReward: 45,
  shinyChance: 0.08,
  // laju per jam
  awake: Object.freeze({ hunger: 6, happiness: 3.5, energy: 4.5, hygiene: 2.5, thirst: 7 }),
  asleep: Object.freeze({ hunger: 2, happiness: 0.8, energy: -200, hygiene: 0.8, thirst: 2 }), // tidur: kosong → penuh ±15 menit nyata
});

const SPECIES = Object.freeze(['mochi', 'bubu', 'leafy', 'babi', 'trenggiling']);

const FOODS = Object.freeze({
  air: { label: 'Air Putih', emoji: '💧', kind: 'drink', cost: 0, hunger: 0, happiness: 1, health: 1, energy: 0, thirst: 42 },
  bubur: { label: 'Bubur', emoji: '🥣', cost: 0, hunger: 20, happiness: 1, health: 0, energy: 5, thirst: 4 },
  apel: { label: 'Apel', emoji: '🍎', cost: 0, hunger: 14, happiness: 3, health: 1, energy: 8, thirst: 8 },
  susu: { label: 'Susu Segar', emoji: '🥛', kind: 'drink', cost: 3, hunger: 8, happiness: 2, health: 1, energy: 14, thirst: 24 },
  burger: { label: 'Burger', emoji: '🍔', cost: 5, hunger: 32, happiness: 7, health: 0, energy: 6, thirst: -4 },
  kue: { label: 'Kue', emoji: '🍰', cost: 12, hunger: 18, happiness: 22, health: 2, energy: 8, thirst: -3 },
  jus: { label: 'Jus Energi', emoji: '🧃', kind: 'drink', cost: 8, hunger: 6, happiness: 6, health: 2, energy: 30, thirst: 30 },
});

const PLAYGROUND = Object.freeze({
  swing: { label: 'Ayunan', unlock: 1, energy: 6, happiness: 10, hunger: 2, hygiene: 0, coins: 1, xp: 4, cooldown: C.PLAY_COOLDOWN },
  ball: { label: 'Bola', unlock: 1, energy: 8, happiness: 12, hunger: 3, hygiene: -2, coins: 1, xp: 4, cooldown: C.PLAY_COOLDOWN },
  sandbox: { label: 'Kotak Pasir', unlock: 2, energy: 8, happiness: 12, hunger: 3, hygiene: -12, coins: 2, xp: 6, cooldown: C.PLAY_COOLDOWN },
  pond: { label: 'Kolam', unlock: 3, energy: 10, happiness: 16, hunger: 4, hygiene: 8, coins: 2, xp: 8, cooldown: C.PLAY_COOLDOWN },
  trampoline: { label: 'Trampolin', unlock: 5, energy: 14, happiness: 20, hunger: 6, hygiene: 0, coins: 4, xp: 12, cooldown: C.PLAY_COOLDOWN },
});

const COSMETICS = Object.freeze({
  pita: { label: 'Pita Imut', emoji: '🎀', slot: 'head', cost: 25, unlock: 1 },
  baret: { label: 'Topi Baret', emoji: '🧢', slot: 'head', cost: 40, unlock: 1 },
  penyihir: { label: 'Topi Sulap', emoji: '🎩', slot: 'head', cost: 70, unlock: 3 },
  mahkota: { label: 'Mahkota', emoji: '👑', slot: 'head', cost: 150, unlock: 5 },
  kacamata: { label: 'Kacamata Keren', emoji: '🕶️', slot: 'face', cost: 45, unlock: 1 },
  bulat: { label: 'Kacamata Bulat', emoji: '👓', slot: 'face', cost: 35, unlock: 2 },
  syal: { label: 'Syal Hangat', emoji: '🧣', slot: 'neck', cost: 35, unlock: 1 },
  dasi: { label: 'Dasi Kupu', emoji: '🦋', slot: 'neck', cost: 50, unlock: 2 },
  ...C.RARE_COSMETICS, // hanya dijual bila muncul di toko hari ini (lihat shopToday)
});

const QUESTS = Object.freeze({
  feed: { label: 'Beri makan atau minum 3 kali', icon: '🍽️', goal: 3, reward: 6 },
  play: { label: 'Bermain di taman 4 kali', icon: '🎪', goal: 4, reward: 9 },
  clean: { label: 'Mandikan 1 kali', icon: '🛁', goal: 1, reward: 4 },
  cuddle: { label: 'Peluk 5 kali', icon: '🤗', goal: 5, reward: 6 },
  minigame: { label: 'Main mini-game 2 kali', icon: '🎮', goal: 2, reward: 12 },
  treasure: { label: 'Temukan 1 harta karun', icon: '💰', goal: 1, reward: 8 },
  chat: { label: 'Ngobrol dengan peliharaan 3 kali', icon: '💬', goal: 3, reward: 5 },
  train: { label: 'Berlatih 2 kali', icon: '🏋️', goal: 2, reward: 8 },
  visitor: { label: 'Sapa 1 tamu di taman', icon: '🦋', goal: 1, reward: 6 },
});
const QUEST_BONUS = 10;

const ACHIEVEMENTS = Object.freeze([
  { id: 'hatch', icon: '🐣', label: 'Lahir ke Dunia', desc: 'Telur menetas', reward: 5, test: (s) => s.stage !== 'egg' },
  { id: 'meals10', icon: '🍔', label: 'Si Rakus', desc: 'Beri makan 10 kali', reward: 10, test: (s) => s.totals.meals >= 10 },
  { id: 'plays25', icon: '🎪', label: 'Anak Taman', desc: 'Bermain di taman 25 kali', reward: 15, test: (s) => s.totals.plays >= 25 },
  { id: 'clean10', icon: '🫧', label: 'Kinclong', desc: 'Mandikan 10 kali', reward: 10, test: (s) => s.totals.cleans >= 10 },
  { id: 'cuddle50', icon: '💕', label: 'Kesayangan', desc: 'Peluk 50 kali', reward: 20, test: (s) => s.totals.cuddles >= 50 },
  { id: 'stars10', icon: '🎮', label: 'Pemain Handal', desc: 'Main mini-game 10 kali', reward: 20, test: (s) => s.totals.minigames >= 10 },
  { id: 'record40', icon: '🌠', label: 'Pemecah Rekor', desc: 'Capai skor 40 di salah satu mini-game', reward: 25, test: (s) => Object.values(s.highscores).some((v) => v >= 40) },
  { id: 'treasure5', icon: '💰', label: 'Pemburu Harta', desc: 'Temukan 5 harta karun', reward: 20, test: (s) => s.totals.treasures >= 5 },
  { id: 'visitor10', icon: '🏡', label: 'Tuan Rumah', desc: 'Sapa 10 tamu taman', reward: 25, test: (s) => s.totals.visitors >= 10 },
  { id: 'chat30', icon: '💬', label: 'Teman Curhat', desc: 'Ngobrol 30 kali', reward: 20, test: (s) => s.totals.chats >= 30 },
  { id: 'quests10', icon: '📋', label: 'Rajin', desc: 'Selesaikan 10 misi harian', reward: 25, test: (s) => s.totals.quests >= 10 },
  { id: 'weekly1', icon: '🏆', label: 'Juara Mingguan', desc: 'Ambil hadiah mingguan', reward: 30, test: (s) => s.totals.weeklies >= 1 },
  { id: 'streak3', icon: '🔥', label: 'Setia', desc: 'Ambil hadiah harian 3 hari beruntun', reward: 15, test: (s) => s.streak.count >= 3 },
  { id: 'streak7', icon: '🏅', label: 'Sahabat Sejati', desc: 'Ambil hadiah harian 7 hari beruntun', reward: 40, test: (s) => s.streak.count >= 7 },
  { id: 'level5', icon: '🚀', label: 'Petualang', desc: 'Capai level 5', reward: 20, test: (s) => s.level >= 5 },
  { id: 'level10', icon: '🌋', label: 'Legenda Taman', desc: 'Capai level 10', reward: 60, test: (s) => s.level >= 10 },
  { id: 'fashion', icon: '🎩', label: 'Fashionista', desc: 'Miliki 3 aksesori', reward: 20, test: (s) => s.inventory.length >= 3 },
  { id: 'decor5', icon: '🌷', label: 'Tukang Taman', desc: 'Miliki 5 dekorasi taman', reward: 25, test: (s) => s.decor.owned.length >= 5 },
  { id: 'skill5', icon: '🏃', label: 'Atlet', desc: 'Capai level 5 di salah satu keterampilan', reward: 25, test: (s) => Object.values(s.skills).some((k) => k.lv >= 5) },
  { id: 'house', icon: '🐾', label: 'Punya Rumah Hewan', desc: 'Membeli rumah hewan untuk peliharaan', reward: 20, test: (s) => s.house.owned },
  { id: 'morph3', icon: '🎭', label: 'Si Bunglon', desc: 'Ganti karakter 3 kali', reward: 15, test: (s) => s.totals.morphs >= 3 },
  { id: 'album8', icon: '📖', label: 'Kolektor', desc: 'Kumpulkan 8 stiker berbeda', reward: 30, test: (s) => Object.keys(s.album).length >= 8 },
  { id: 'shiny', icon: '✨', label: 'Langka!', desc: 'Menetaskan peliharaan warna langka', reward: 60, test: (s) => s.shiny && s.stage !== 'egg' },
  { id: 'adult', icon: '🌱', label: 'Dewasa', desc: 'Tumbuh dewasa', reward: 50, test: (s) => s.stage === 'adult' || s.stage === 'elder' },
  { id: 'radiant', icon: '🌟', label: 'Bersinar', desc: 'Tumbuh dewasa dalam bentuk bersinar', reward: 80, test: (s) => s.form === 'radiant' },
  { id: 'elder', icon: '🧓', label: 'Panjang Umur', desc: 'Peliharaan mencapai usia lansia', reward: 60, test: (s) => s.stage === 'elder' || s.family.length > 0 },
  { id: 'breed', icon: '🥚', label: 'Calon Orang Tua', desc: 'Titipkan telur keturunan', reward: 25, test: (s) => s.totals.breeds >= 1 },
  { id: 'visit3', icon: '🤝', label: 'Tetangga Ramah', desc: 'Kunjungi taman teman 3 kali', reward: 20, test: (s) => s.totals.visits >= 3 },
  { id: 'wish', icon: '🌠', label: 'Pemburu Bintang', desc: 'Membuat permohonan di hujan meteor', reward: 20, test: (s) => s.totals.wishes >= 1 },
  { id: 'gen2', icon: '👨‍👩‍👧', label: 'Generasi Kedua', desc: 'Mengasuh telur dari peliharaan pensiunan', reward: 60, test: (s) => s.generation >= 2 },
]);

const MEDICINE_COST = 5;
const STAT_KEYS = ['hunger', 'happiness', 'energy', 'hygiene', 'thirst', 'health'];

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** Ambil properti milik sendiri saja (menolak kunci seperti "__proto__" / "constructor"). */
function own(obj, key) {
  return typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/** Jam waktu-game (0–24), sama dengan yang ditampilkan di taman. */
function gameHour(s, now) {
  const dayMs = CONFIG.dayRealMinutes * MIN;
  const frac = ((((now - s.createdAt) % dayMs) + dayMs) % dayMs) / dayMs;
  return (CONFIG.dayStartHour + frac * 24) % 24;
}

function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterdayKey(ms) {
  const d = new Date(ms);
  d.setDate(d.getDate() - 1);
  return dateKey(d.getTime());
}
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

// ---------- cuaca & acara (murni dari waktu + id) ----------
const baseWeather = (s, slot) => {
  const r = C.hash01(`${s.id}:w:${slot}`);
  return r < 0.55 ? 'cerah' : r < 0.78 ? 'berawan' : r < 0.94 ? 'hujan' : 'badai';
};
function weatherAt(s, now) {
  const slot = Math.floor(now / C.WEATHER_SLOT_MS);
  const w = baseWeather(s, slot);
  const prev = baseWeather(s, slot - 1);
  if (w === 'cerah' && (prev === 'hujan' || prev === 'badai') && C.hash01(`${s.id}:r:${slot}`) < 0.5) return 'pelangi';
  if (w === 'hujan' && s.decor?.theme === 'salju') return 'salju'; // di Negeri Salju, hujan berubah jadi salju
  if (w === 'cerah' || w === 'berawan') { // hujan meteor: hanya malam hari
    const h = gameHour(s, (slot + 0.5) * C.WEATHER_SLOT_MS); // jam di tengah slot → cuaca stabil sepanjang slot
    if ((h >= 20 || h < 4.5) && C.hash01(`${s.id}:m:${slot}`) < 0.45) return 'meteor';
  }
  return w;
}

/** Acara hari ini: ulang tahun mingguan peliharaan, atau hari raya. */
function eventOn(s, now) {
  const age = daysBetween(s.createdAt, now);
  if (age > 0 && age % 7 === 0) return { id: 'ultah', emoji: '🎂', label: `Ulang tahun ${s.name}`, reward: 20, sticker: 'kue' };
  const h = C.holidayOn(now);
  return h ? { ...h, sticker: 'perayaan' } : null;
}

const isWet = (wx) => Object.hasOwn(C.RAIN, wx); // cuaca yang membuat basah/dingin di luar rumah

function worldView(s, now) {
  const e = eventOn(s, now);
  return {
    weather: weatherAt(s, now),
    weatherEnds: (Math.floor(now / C.WEATHER_SLOT_MS) + 1) * C.WEATHER_SLOT_MS,
    wishable: weatherAt(s, now) === 'meteor' && s.wish !== Math.floor(now / C.WEATHER_SLOT_MS),
    event: e ? { ...e, claimed: s.eventClaimed[e.id] === dateKey(now) } : null,
  };
}

// ---------- toko berputar ----------
const nextMidnight = (ms) => { const d = new Date(ms); d.setHours(24, 0, 0, 0); return d.getTime(); };
/** Stok toko hari ini: barang langka (berganti tiap hari) + promo diskon. Deterministik dari tanggal & id peliharaan. */
function shopToday(s, now) {
  const date = dateKey(now);
  const byHash = (tag, ids) => ids.map((id) => ({ id, k: C.hash01(`${s.id}:${tag}:${date}:${id}`) })).sort((a, b) => a.k - b.k).map((x) => x.id);
  const rare = byHash('rare', Object.keys(C.RARE_COSMETICS)).slice(0, C.SHOP_RARE_COUNT);
  const pool = [
    ...Object.entries(COSMETICS).filter(([, v]) => !v.rare).map(([id]) => `cosmetic:${id}`),
    ...Object.keys(C.DECOR).map((id) => `decor:${id}`),
    ...Object.keys(C.TINTS).map((id) => `tint:${id}`),
    ...Object.keys(C.HOUSE_DECOR).map((id) => `hdecor:${id}`),
  ];
  const deals = byHash('deal', pool).slice(0, 2).map((key, i) => {
    const [kind, id] = key.split(':');
    return { kind, id, pct: C.SHOP_DEAL_PCTS[Math.floor(C.hash01(`${s.id}:pct:${date}:${i}`) * C.SHOP_DEAL_PCTS.length)] };
  });
  return { date, rare, deals, endsAt: nextMidnight(now) };
}
function priceOf(s, now, kind, id, base) {
  const d = shopToday(s, now).deals.find((x) => x.kind === kind && x.id === id);
  return d ? Math.max(1, Math.floor((base * (100 - d.pct)) / 100)) : base;
}

// ---------- misi, mingguan, prestasi ----------
/** Misi harian: 3 dari semua misi, dipilih deterministik dari tanggal + id peliharaan. */
function rollDaily(s, now) {
  const key = dateKey(now);
  if (s.daily && s.daily.date === key) return false;
  let h = 2166136261;
  for (const ch of key + s.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const pool = Object.keys(QUESTS);
  const picked = [];
  for (let i = 0; i < 3; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]);
  }
  s.daily = { date: key, loginClaimed: false, bonusClaimed: false, luckyClaimed: false, quests: picked.map((id) => ({ id, progress: 0, claimed: false })) };
  return true;
}

function rollWeekly(s, now) {
  const key = C.weekKey(now);
  if (s.weekly && s.weekly.week === key) return false;
  s.weekly = { week: key, quests: 0, claimed: false };
  return true;
}

function track(s, id, t, events) {
  const q = s.daily?.quests.find((x) => x.id === id);
  const def = QUESTS[id];
  if (!q || q.claimed || q.progress >= def.goal) return;
  q.progress += 1;
  if (q.progress >= def.goal) events.push(ev(t, 'quest', `📋 Misi selesai: ${def.label}. Ambil hadiahnya!`));
}

function checkAchievements(s, t, events) {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] || !a.test(s)) continue;
    s.achievements[a.id] = t;
    s.coins += a.reward;
    events.push(ev(t, 'achievement', `🏆 Prestasi "${a.label}" terbuka! +${a.reward} 🪙`));
    changed = true;
  }
  return changed;
}

/** Streak yang masih hidup (diambil hari ini atau kemarin), untuk tampilan. */
function effectiveStreak(s, now) {
  const last = s.streak.lastDate;
  return last === dateKey(now) || last === yesterdayKey(now) ? s.streak.count : 0;
}

// ---------- album stiker ----------
function pickWeighted(weights, r) {
  const entries = Object.entries(weights);
  let x = r * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) if ((x -= w) < 0) return k;
  return entries[0][0];
}

/** Beri stiker; mengembalikan true bila stiker baru. Hadiah koin tercapai otomatis saat koleksi bertambah. */
function giveSticker(s, id, t, events) {
  const def = C.STICKERS[id];
  if (!def) return false;
  const isNew = !s.album[id];
  s.album[id] = (s.album[id] || 0) + 1;
  if (isNew) {
    events.push(ev(t, 'sticker', `🎴 Stiker baru: ${def.emoji} ${def.label}!`));
    const have = Object.keys(s.album).length;
    for (const r of C.ALBUM_REWARDS) {
      if (have >= r.count && !s.albumClaimed.includes(r.count)) {
        s.albumClaimed.push(r.count);
        s.coins += r.coins;
        events.push(ev(t, 'sticker', `📖 Album ${r.count} stiker lengkap! +${r.coins} 🪙`));
      }
    }
  }
  return isNew;
}

// ---------- kepribadian & lahir ----------
function rollPrefs(s) {
  const pool = C.PREF_FOODS;
  const fav = Math.floor(C.hash01(`${s.id}:${s.createdAt}:fav`) * pool.length);
  const hate = (fav + 1 + Math.floor(C.hash01(`${s.id}:${s.createdAt}:hate`) * (pool.length - 1))) % pool.length;
  return { fav: pool[fav], hate: pool[hate], known: { fav: false, hate: false } };
}

/** Tentukan ciri khas (warna langka, makanan favorit/tidak suka) untuk peliharaan baru. */
function rollBirth(s, shinyBonus = 0) {
  s.shiny = C.hash01(`${s.id}:${s.createdAt}:shiny`) < CONFIG.shinyChance + shinyBonus;
  s.prefs = rollPrefs(s);
}

function determineTrait(s) {
  const p = s.pc;
  const score = { manja: p.cuddles * 1.5 + p.chats, petualang: p.plays + p.trains, rapi: p.cleans * 2, rakus: p.meals };
  const total = Object.values(score).reduce((a, b) => a + b, 0);
  if (total < 10) return 'seimbang';
  const [best, top] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return top >= total * 0.4 ? best : 'seimbang';
}

const freshPcounts = () => ({ meals: 0, plays: 0, cuddles: 0, chats: 0, cleans: 0, trains: 0 });
const freshSkills = () => ({ lari: { lv: 0, xp: 0 }, pintar: { lv: 0, xp: 0 }, tangguh: { lv: 0, xp: 0 } });
const bump = (s, k) => { s.pc[k] = (s.pc[k] || 0) + 1; };
const skillLv = (s, k) => s.skills[k]?.lv || 0;
const hasTrait = (s, t) => s.trait === t;

/** Pasang dekorasi di tempat kosong yang cocok. Mengembalikan pesan galat bila penuh, atau null bila berhasil. */
function placeDecor(s, id, alreadyListed = false) {
  const def = C.DECOR[id];
  const used = new Set(Object.entries(s.decor.slots).filter(([k]) => k !== id).map(([, v]) => v));
  const slot = def.slots.find((x) => !used.has(x));
  if (!slot) return `Tempat untuk ${def.label.toLowerCase()} sudah penuh. Simpan dekorasi lain dulu.`;
  s.decor.slots[id] = slot;
  if (!alreadyListed && !s.decor.placed.includes(id)) s.decor.placed.push(id);
  return null;
}
function unplaceDecor(s, id) {
  const i = s.decor.placed.indexOf(id);
  if (i >= 0) s.decor.placed.splice(i, 1);
  delete s.decor.slots[id];
}

/** Lengkapi field baru pada save lama (migrasi aman, idempotent). */
function migrate(s, now) {
  s.inventory ??= [];
  s.equipped ??= {};
  for (const slot of ['head', 'face', 'neck']) s.equipped[slot] ??= null;
  s.achievements ??= {};
  s.streak ??= { count: 0, lastDate: '' };
  s.treasure ??= null;
  s.owner ??= '';
  s.stats.thirst ??= 80;
  for (const k of ['treasures', 'quests', 'chats', 'visitors', 'trains', 'lucky', 'weeklies', 'morphs']) s.totals[k] ??= 0;
  s.generation ??= 1;
  s.family ??= [];
  s.shiny ??= false;
  s.trait ??= null;
  s.prefs ??= rollPrefs(s);
  s.pc ??= freshPcounts();
  s.skills ??= freshSkills();
  if (!s.trait && ['teen', 'adult', 'elder'].includes(s.stage)) s.trait = determineTrait(s); // peliharaan lama yang sudah remaja
  for (const k of Object.keys(freshSkills())) s.skills[k] ??= { lv: 0, xp: 0 };
  s.highscores ??= {};
  s.album ??= {};
  s.albumClaimed ??= [];
  s.decor ??= { owned: [], placed: [], theme: 'default', themes: ['default'] };
  s.decor.slots ??= {};
  for (const id of [...s.decor.placed]) { // save lama: pastikan tiap dekorasi terpasang punya tempat
    if (!C.DECOR[id]) { s.decor.placed.splice(s.decor.placed.indexOf(id), 1); continue; }
    if (!s.decor.slots[id] || Object.entries(s.decor.slots).some(([k, v]) => k !== id && v === s.decor.slots[id])) {
      delete s.decor.slots[id];
      if (placeDecor(s, id, true)) s.decor.placed.splice(s.decor.placed.indexOf(id), 1);
    }
  }
  s.visitor ??= null;
  s.eventClaimed ??= {};
  s.memory ??= {};
  s.house ??= { owned: false, inside: false, reason: null, warned: -1 };
  s.house.items ??= [];
  s.tint ??= { owned: [], active: null };
  s.nest ??= null;
  s.friends ??= { date: '', ids: [] };
  s.wish ??= -1;
  for (const k of ['breeds', 'visits', 'wishes']) s.totals[k] ??= 0;
  if (!Number.isFinite(s.coins)) s.coins = 0;
  rollDaily(s, now);
  rollWeekly(s, now);
  return s;
}

function levelForXp(xp) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 25));
}
function xpForLevel(level) {
  return 25 * (level - 1) ** 2;
}

function stageFor(ageMinutes) {
  const s = CONFIG.stageStarts;
  if (ageMinutes >= s.elder) return 'elder';
  if (ageMinutes >= s.adult) return 'adult';
  if (ageMinutes >= s.teen) return 'teen';
  if (ageMinutes >= s.child) return 'child';
  if (ageMinutes >= s.baby) return 'baby';
  return 'egg';
}

/** mulberry32 — state.seed maju setiap panggilan agar urutannya bisa direplikasi. */
function rand(state) {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (s, lo, hi) => lo + Math.floor(rand(s) * (hi - lo + 1));

function cleanName(raw) {
  // eslint-disable-next-line no-control-regex
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return name.slice(0, 16);
}

function ev(t, type, msg) {
  return { t, type, msg };
}

function createPet({ name, species }, now, id, seed) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: 'Nama tidak boleh kosong.' };
  if (!SPECIES.includes(species)) return { ok: false, error: 'Spesies tidak dikenal.' };
  const state = {
    version: CONFIG.schemaVersion,
    id,
    name: clean,
    species,
    createdAt: now,
    lastTickAt: now,
    ageMinutes: 0,
    stage: 'egg',
    form: null,
    stats: { hunger: 80, happiness: 80, energy: 90, hygiene: 100, thirst: 85, health: 100 },
    sleeping: false,
    sick: false,
    poop: 0,
    coins: 10,
    xp: 0,
    level: 1,
    careSum: 0,
    careSamples: 0,
    cooldowns: {},
    owner: '',
    totals: { meals: 0, plays: 0, cleans: 0, cuddles: 0, medicines: 0, minigames: 0, treasures: 0, quests: 0, chats: 0 },
    seed: seed | 0,
  };
  migrate(state, now);
  rollBirth(state, 0);
  const events = [ev(now, 'birth', `🥚 Telur ${clean} ditemukan di taman. Jaga dengan baik!`)];
  return { ok: true, state, events };
}

function careAverage(s) {
  return s.careSamples ? s.careSum / s.careSamples : 100;
}

function grantXp(s, amount, t, events) {
  if (amount > 0) amount = Math.max(1, Math.round(amount * (1 + 0.06 * skillLv(s, 'pintar'))));
  s.xp += amount;
  const level = levelForXp(s.xp);
  if (level > s.level) {
    s.level = level;
    const unlocked = [
      ...Object.values(PLAYGROUND).filter((v) => v.unlock === level).map((v) => v.label),
      ...Object.values(C.DECOR).filter((v) => v.unlock === level).map((v) => v.label),
      ...Object.values(COSMETICS).filter((v) => !v.rare && v.unlock === level).map((v) => v.label),
    ];
    const extra = unlocked.length ? ` Terbuka: ${unlocked.slice(0, 4).join(', ')}${unlocked.length > 4 ? '…' : ''}!` : '';
    const bonus = 5 * level;
    s.coins += bonus;
    events.push(ev(t, 'levelup', `⭐ ${s.name} naik ke level ${level}! +${bonus} 🪙${extra}`));
  }
}

function updateStage(s, t, events) {
  const next = stageFor(s.ageMinutes);
  if (next === s.stage) return;
  const prev = s.stage;
  s.stage = next;
  if (prev === 'egg') {
    events.push(ev(t, 'hatch', `🐣 Telur menetas! ${s.name} lahir ke dunia.`));
    if (s.shiny) events.push(ev(t, 'evolve', `✨ Wow, ${s.name} berwarna langka! Hanya sebagian kecil yang seperti ini.`));
    return;
  }
  const names = { child: 'anak-anak', teen: 'remaja', adult: 'dewasa' };
  if (next === 'teen') {
    s.trait = determineTrait(s);
    const tr = C.TRAITS[s.trait];
    events.push(ev(t, 'evolve', `🌱 ${s.name} tumbuh menjadi remaja. Wataknya: ${tr.emoji} ${tr.label}.`));
  } else if (next === 'adult') {
    s.form = careAverage(s) >= 65 ? 'radiant' : 'regular';
    events.push(
      ev(t, 'evolve', s.form === 'radiant'
        ? `🌟 ${s.name} tumbuh dewasa dan bersinar berkat perawatanmu!`
        : `🌱 ${s.name} tumbuh dewasa.`),
    );
  } else if (next === 'elder') {
    events.push(ev(t, 'evolve', `🧓 ${s.name} kini lansia yang bijak. Ia bisa pensiun dan mewariskan telur baru kapan saja.`));
  } else {
    events.push(ev(t, 'evolve', `🌱 ${s.name} tumbuh menjadi ${names[next]}.`));
  }
}

function pickVisitor(s, t) {
  const h = gameHour(s, t);
  const night = h >= 19 || h < 5;
  const weights = {};
  for (const [k, v] of Object.entries(C.VISITORS)) if (!v.night || night) weights[k] = v.weight;
  return pickWeighted(weights, rand(s));
}

/** Rumah: berteduh otomatis saat hujan, tidur di dalam, keluar saat reda/bangun. */
function syncHouse(s, wet, events, t) {
  const h = s.house;
  if (!h.owned) return;
  if (wet && !h.inside) {
    h.inside = true; h.reason = 'rain';
    events.push(ev(t, 'house', `🐾 ${s.name} berteduh di rumah hewannya karena hujan.`));
  } else if (s.sleeping && !h.inside) {
    h.inside = true; h.reason = 'sleep';
  } else if (h.inside) {
    if (h.reason === 'sleep' && !s.sleeping) {
      if (wet) h.reason = 'rain'; else { h.inside = false; h.reason = null; }
    } else if (h.reason === 'rain' && !wet) {
      if (s.sleeping) h.reason = 'sleep';
      else { h.inside = false; h.reason = null; events.push(ev(t, 'house', `☀️ Hujan reda, ${s.name} keluar dari rumah.`)); }
    }
  }
}

const hItem = (s, id) => s.house.items?.includes(id);

function stepOne(s, t, ctx, mult) {
  const speed = CONFIG.speed;
  s.ageMinutes += speed;
  updateStage(s, t, ctx.events);
  if (s.stage === 'egg') return;

  const st = s.stats;
  const perMin = speed / 60;
  const tg = skillLv(s, 'tangguh');
  const keep = 1 - 0.03 * tg; // keterampilan Tangguh: kebutuhan turun lebih lambat

  // cuaca & rumah: tanpa rumah, hujan/badai langsung menggerogoti kesehatan
  const wx = weatherAt(s, t);
  const wet = isWet(wx);
  syncHouse(s, wet, ctx.events, t);
  const exposed = wet && !s.house.inside;
  if (exposed) {
    const slot = Math.floor(t / C.WEATHER_SLOT_MS);
    if (s.house.warned !== slot) {
      s.house.warned = slot;
      ctx.events.push(ev(t, 'weather', s.house.owned
        ? `🌧️ ${s.name} kehujanan di luar! Kesehatannya turun.`
        : `🌧️ ${wx === 'badai' ? 'Badai' : wx === 'salju' ? 'Salju' : 'Hujan'}! ${s.name} ${wx === 'salju' ? 'kedinginan' : 'kehujanan'} dan kesehatannya turun cepat. Beli rumah di Toko agar ia bisa berteduh.`));
    }
  }

  if (s.sleeping) {
    const r = CONFIG.asleep;
    st.hunger -= r.hunger * perMin * mult;
    st.happiness -= r.happiness * perMin * mult;
    st.hygiene -= r.hygiene * perMin * mult;
    st.thirst -= r.thirst * perMin * mult;
    st.energy -= r.energy * perMin * (s.house.inside ? 1.3 + (hItem(s, 'bantal') ? 0.15 : 0) : 1); // negatif = pulih; di rumah lebih nyenyak
    if (st.energy >= 100) {
      s.sleeping = false;
      ctx.events.push(ev(t, 'wake', `☀️ ${s.name} bangun dengan segar.`));
    }
  } else {
    const r = CONFIG.awake;
    st.hunger -= r.hunger * perMin * mult * keep * (hasTrait(s, 'rakus') ? 1.15 : 1);
    st.happiness -= r.happiness * perMin * mult;
    st.energy -= r.energy * perMin * mult * keep;
    st.hygiene -= (r.hygiene + s.poop * 1.2) * perMin * mult * keep * (hasTrait(s, 'rapi') ? 0.75 : 1);
    st.thirst -= r.thirst * perMin * mult * keep;
    if (s.sick) st.happiness -= 3 * perMin * mult;
    if (exposed) st.happiness -= (wx === 'badai' ? 6 : 3) * perMin * mult;
    if (s.house.inside) { // isi rumah hewan
      if (hItem(s, 'mainan')) st.happiness += 2 * perMin;
      if (hItem(s, 'lampu')) st.happiness += r.happiness * 0.4 * perMin * mult; // ~40% lebih sedikit turun
    }

    if (s.poop < CONFIG.maxPoop && rand(s) < (speed / 150) * mult) {
      s.poop += 1;
      ctx.events.push(ev(t, 'poop', `💩 ${s.name} buang kotoran. Bersihkan ya!`));
    }
    if (st.energy <= 8) {
      s.sleeping = true;
      ctx.events.push(ev(t, 'sleep', `😴 ${s.name} kelelahan dan tertidur.`));
    }
  }

  // kesehatan
  let dh = 0;
  if (st.hunger < 12) dh -= 2.5;
  if (st.thirst < 12) dh -= 2;
  if (st.energy < 8) dh -= 1.5;
  if (st.hygiene < 15) dh -= 1.5;
  if (st.happiness < 20) dh -= 1;
  if (s.sick) dh -= 3;
  // saat ditinggal (offline), hujan tidak menurunkan kesehatan di bawah 35 — drama saat dimainkan, bukan hukuman saat pergi
  if (exposed && !(mult < 1 && st.health <= 35)) dh -= C.RAIN[wx];
  if (s.house.inside && hItem(s, 'karpet') && !s.sick) dh += 1.5;
  if (dh < 0) dh *= mult;
  else if (!s.sick && st.hunger >= 40 && st.energy >= 40 && st.hygiene >= 40) dh += 3;
  st.health += dh * perMin;

  // sakit
  if (!s.sick && !s.sleeping) {
    let p = 0;
    if (st.hygiene < 25) p += 1 / 240;
    if (s.poop >= 3) p += 1 / 240;
    if (st.health < 30) p += 1 / 480;
    if (exposed) p += wx === 'badai' ? 1 / 20 : 1 / 60;
    if (p > 0 && rand(s) < p * speed * mult * (1 - 0.08 * tg)) {
      s.sick = true;
      ctx.events.push(ev(t, 'sick', `🤒 ${s.name} jatuh sakit. Beri obat!`));
    }
  }

  // harta karun (lebih sering & lebih besar saat ada pelangi)
  const rainbow = wx === 'pelangi';
  if (!s.treasure && rand(s) < (rainbow ? 1 / 6 : 1 / 25)) {
    s.treasure = { x: C.TREASURE_SPOTS[Math.floor(rand(s) * C.TREASURE_SPOTS.length)], amount: rainbow ? 8 + Math.floor(rand(s) * 7) : 3 + Math.floor(rand(s) * 6), t, rainbow };
    ctx.events.push(ev(t, 'treasure', rainbow ? '🌈 Ada harta karun di ujung pelangi!' : '💰 Ada harta karun berkilau di taman!'));
  }

  // tamu taman
  if (s.visitor && t >= s.visitor.until) s.visitor = null;
  if (!s.visitor && rand(s) < 1 / 50) {
    const kind = pickVisitor(s, t);
    s.visitor = { kind, x: 90 + Math.floor(rand(s) * 720), until: t + (6 + Math.floor(rand(s) * 7)) * MIN };
    ctx.events.push(ev(t, 'visitor', `${C.VISITORS[kind].emoji} ${C.VISITORS[kind].label} mampir ke taman!`));
  }

  for (const k of STAT_KEYS) st[k] = clamp(st[k]);
  if (st.health < CONFIG.healthFloor) st.health = CONFIG.healthFloor;

  if (!s.sleeping) {
    s.careSum += STAT_KEYS.reduce((a, k) => a + st[k], 0) / STAT_KEYS.length;
    s.careSamples += 1;
  }

  if ((t / MIN) % 15 === 0) {
    ctx.samples.push({
      t,
      hunger: Math.round(st.hunger),
      happiness: Math.round(st.happiness),
      energy: Math.round(st.energy),
      hygiene: Math.round(st.hygiene),
      thirst: Math.round(st.thirst),
      health: Math.round(st.health),
    });
  }
}

/**
 * Majukan waktu game hingga `now`. Aman dipanggil berulang; memproses per menit,
 * sehingga hasil sama persis baik berjalan terus maupun di-catch-up setelah mati.
 */
function advanceTime(s, now) {
  const ctx = { events: [], samples: [], stepped: false };
  let dt = now - s.lastTickAt;
  if (dt < 0) {
    s.lastTickAt = now; // jam sistem mundur; jangan simulasi apa pun
    return ctx;
  }
  const offline = dt > CONFIG.offlineThresholdMs;
  if (dt > CONFIG.maxCatchUpMs) {
    dt = CONFIG.maxCatchUpMs;
    s.lastTickAt = now - dt;
  }
  const steps = Math.floor(dt / MIN);
  if (steps <= 0) return ctx;

  const mult = offline ? CONFIG.offlineMultiplier : 1;
  const before = s.lastTickAt;
  for (let i = 0; i < steps; i++) {
    s.lastTickAt += MIN;
    stepOne(s, s.lastTickAt, ctx, mult);
  }
  ctx.stepped = true;
  if (offline) {
    const away = `${Math.floor((steps * MIN) / HOUR)} jam ${Math.round(((steps * MIN) % HOUR) / MIN)} menit`;
    ctx.events.unshift(ev(before, 'away', `🌙 Ditinggal ${away}. ${s.name} menunggumu.`));
  }
  return ctx;
}

function advance(s, now) {
  const ctx = advanceTime(s, now);
  if (rollDaily(s, now)) ctx.stepped = true;
  if (rollWeekly(s, now)) ctx.stepped = true;
  if (s.visitor && now >= s.visitor.until) { s.visitor = null; ctx.stepped = true; }
  if (checkAchievements(s, now, ctx.events)) ctx.stepped = true;
  return ctx;
}

const TOO_FULL = 95;
const needAwake = (s) => (s.sleeping ? `${s.name} sedang tidur.` : null);
const needHatched = (s) => (s.stage === 'egg' ? 'Telur belum menetas.' : null);

function cooldownLeft(s, key, now) {
  return Math.max(0, (s.cooldowns[key] || 0) - now);
}
function setCooldown(s, key, now, seconds) {
  s.cooldowns[key] = now + seconds * 1000;
}
const waitMsg = (ms) => `Tunggu ${Math.ceil(ms / 1000)} detik lagi.`;

function applyEffect(s, eff) {
  for (const k of STAT_KEYS) if (eff[k]) s.stats[k] = clamp(s.stats[k] + eff[k]);
  if (s.stats.health < CONFIG.healthFloor) s.stats.health = CONFIG.healthFloor;
}

/** Pensiunkan peliharaan lansia dan mulai telur generasi berikutnya. */
function retire(s, now, a, events) {
  if (s.stage !== 'elder') return `${s.name} belum cukup tua untuk pensiun.`;
  const name = cleanName(a.name);
  if (!name) return 'Nama telur baru tidak boleh kosong.';
  const nest = s.nest;
  const species = nest ? nest.species : a.species;
  if (!SPECIES.includes(species)) return 'Spesies tidak dikenal.';
  const old = {
    name: s.name, species: s.species, form: s.form, shiny: s.shiny, trait: s.trait, generation: s.generation,
    level: s.level, ageMinutes: s.ageMinutes, bornAt: s.createdAt, retiredAt: now, equipped: { ...s.equipped },
    fav: s.prefs.fav, bestSkill: Object.entries(s.skills).sort((x, y) => y[1].lv - x[1].lv)[0][0],
  };
  s.family.push(old);
  if (s.family.length > 50) s.family.shift();

  const bonus = (s.form === 'radiant' ? 0.04 : 0) + (nest ? 0.06 : 0);
  const keepRatio = nest ? 0.75 : 0.5; // telur keturunan mewarisi lebih banyak
  const inherited = Object.fromEntries(Object.entries(s.skills).map(([k, v]) => [k, { lv: Math.floor(v.lv * keepRatio), xp: 0 }]));
  Object.assign(s, {
    name, species, createdAt: now, lastTickAt: now, ageMinutes: 0, stage: 'egg', form: null, trait: null,
    stats: { hunger: 80, happiness: 80, energy: 90, hygiene: 100, thirst: 85, health: 100 },
    sleeping: false, sick: false, poop: 0, careSum: 0, careSamples: 0, cooldowns: {},
    equipped: { head: null, face: null, neck: null }, pc: freshPcounts(), skills: inherited, visitor: null,
    generation: s.generation + 1, memory: {}, nest: null,
  });
  rollBirth(s, bonus);
  if (nest) { // warisan dari induk: makanan favorit & warna bulu
    s.prefs.fav = nest.fav;
    if (s.prefs.hate === nest.fav) s.prefs.hate = C.PREF_FOODS.find((f) => f !== nest.fav);
    if (nest.tint && s.tint.owned.includes(nest.tint)) s.tint.active = nest.tint;
  }
  const legacy = 20 + 10 * old.generation;
  s.coins += legacy;
  giveSticker(s, 'mahkota', now, events);
  events.push(ev(now, 'retire', `🎓 ${old.name} pensiun dengan bahagia dan masuk Galeri Keluarga. Warisan: +${legacy} 🪙`));
  events.push(ev(now, 'birth', `🥚 Telur ${name} (generasi ${s.generation}) ditemukan di taman. Ia mewarisi ${nest ? 'banyak' : 'sebagian'} keterampilan ${old.name}${nest ? ', juga makanan favorit dan warnanya' : ''}.`));
  return null;
}

function doAction(s, now, a, events, out = {}) {
  const guard = (...checks) => {
    for (const c of checks) {
      const e = c(s);
      if (e) return e;
    }
    return null;
  };

  switch (a.type) {
    case 'feed': {
      const food = own(FOODS, a.food);
      if (!food) return 'Makanan tidak dikenal.';
      const e = guard(needHatched, needAwake);
      if (e) return e;
      const st = s.stats;
      const useful = (food.hunger > 0 && st.hunger < TOO_FULL) || (food.thirst > 0 && st.thirst < TOO_FULL) || (food.energy >= 10 && st.energy < TOO_FULL);
      if (!useful) return food.kind === 'drink' ? `${s.name} tidak haus.` : `${s.name} sudah kenyang.`;
      if (s.coins < food.cost) return 'Koin tidak cukup.';
      s.coins -= food.cost;
      const hungerGain = food.hunger * (hasTrait(s, 'rakus') && food.hunger > 0 ? 1.2 : 1);
      applyEffect(s, { hunger: hungerGain, thirst: food.thirst, happiness: food.happiness, health: food.health, energy: food.energy });
      let note = '';
      if (s.prefs.fav === a.food) { applyEffect(s, { happiness: 8 }); s.prefs.known.fav = true; note = ' ❤️ Ini favoritnya!'; }
      else if (s.prefs.hate === a.food) { applyEffect(s, { happiness: -5 }); s.prefs.known.hate = true; note = ' 🤢 Ia kurang suka ini.'; }
      s.totals.meals += 1;
      bump(s, 'meals');
      s.memory.food = { id: a.food, t: now };
      grantXp(s, 2, now, events);
      track(s, 'feed', now, events);
      events.push(ev(now, 'feed', `${food.emoji} ${s.name} ${food.kind === 'drink' ? 'minum' : 'makan'} ${food.label.toLowerCase()}.${note}`));
      return null;
    }
    case 'clean': {
      const e = guard(needHatched, needAwake);
      if (e) return e;
      if (s.poop === 0 && s.stats.hygiene >= 90) return `${s.name} sudah bersih.`;
      const had = s.poop;
      s.poop = 0;
      s.stats.hygiene = 100;
      s.totals.cleans += 1;
      bump(s, 'cleans');
      grantXp(s, 2, now, events);
      track(s, 'clean', now, events);
      events.push(ev(now, 'clean', had ? '🧼 Kotoran dibersihkan, kinclong lagi!' : '🧼 Mandi gelembung sabun!'));
      return null;
    }
    case 'medicine': {
      const e = guard(needHatched);
      if (e) return e;
      if (!s.sick) return `${s.name} tidak sedang sakit.`;
      if (s.coins < MEDICINE_COST) return `Butuh ${MEDICINE_COST} koin untuk obat.`;
      s.coins -= MEDICINE_COST;
      s.sick = false;
      applyEffect(s, { health: 25 });
      s.totals.medicines += 1;
      grantXp(s, 3, now, events);
      events.push(ev(now, 'recover', `💊 ${s.name} sembuh. Syukurlah!`));
      return null;
    }
    case 'sleep': {
      const e = guard(needHatched);
      if (e) return e;
      if (s.sleeping) return `${s.name} sudah tidur.`;
      if (s.stats.energy >= 95) return `${s.name} belum mengantuk.`;
      s.sleeping = true;
      if (s.house.owned && !s.house.inside) { s.house.inside = true; s.house.reason = 'sleep'; }
      events.push(ev(now, 'sleep', `😴 ${s.name} tidur.`));
      return null;
    }
    case 'wake': {
      if (!s.sleeping) return `${s.name} sudah bangun.`;
      s.sleeping = false;
      s.stats.happiness = clamp(s.stats.happiness - (s.stats.energy < 60 ? 6 : 0));
      syncHouse(s, isWet(weatherAt(s, now)), events, now);
      events.push(ev(now, 'wake', `☀️ ${s.name} dibangunkan.`));
      return null;
    }
    case 'cuddle': {
      const e = guard(needHatched, needAwake);
      if (e) return e;
      const left = cooldownLeft(s, 'cuddle', now);
      if (left) return waitMsg(left);
      setCooldown(s, 'cuddle', now, 20);
      applyEffect(s, { happiness: 8 + (hasTrait(s, 'manja') ? 4 : 0) });
      s.totals.cuddles += 1;
      bump(s, 'cuddles');
      grantXp(s, 1, now, events);
      track(s, 'cuddle', now, events);
      if (s.totals.cuddles % 10 === 1) events.push(ev(now, 'cuddle', `💕 ${s.name} senang dipeluk.`));
      return null;
    }
    case 'play': {
      const item = own(PLAYGROUND, a.item);
      if (!item) return 'Wahana tidak dikenal.';
      const e = guard(needHatched, needAwake);
      if (e) return e;
      if (s.level < item.unlock) return `${item.label} terbuka di level ${item.unlock}.`;
      if (s.house.inside) return s.house.reason === 'rain' ? `Sedang hujan — ${s.name} berteduh di rumah. Coba mini-game di dalam!` : `${s.name} sedang di dalam rumah. Ketuk rumah untuk mengeluarkannya.`;
      const cost = Math.max(1, Math.round(item.energy * (1 - 0.05 * skillLv(s, 'lari')) * (hasTrait(s, 'petualang') ? 0.8 : 1)));
      if (s.stats.energy < cost + 5) return `${s.name} terlalu lelah.`;
      const key = `play:${a.item}`;
      const left = cooldownLeft(s, key, now);
      if (left) return waitMsg(left);
      setCooldown(s, key, now, item.cooldown);
      const w = weatherAt(s, now);
      const sickPenalty = s.sick ? 0.5 : 1;
      const wet = isWet(w);
      applyEffect(s, {
        energy: -cost,
        happiness: item.happiness * sickPenalty * (wet ? 1.25 : 1),
        hunger: -item.hunger,
        hygiene: item.hygiene - (wet && a.item !== 'pond' ? 4 : 0),
      });
      const bonusCoin = (hasTrait(s, 'petualang') ? 1 : 0) + (w === 'pelangi' ? 1 : 0);
      s.coins += Math.max(1, Math.round(item.coins * sickPenalty)) + bonusCoin;
      s.totals.plays += 1;
      bump(s, 'plays');
      s.memory.play = { item: a.item, t: now };
      grantXp(s, item.xp, now, events);
      track(s, 'play', now, events);
      const mood = wet ? ' sambil hujan-hujanan' : w === 'pelangi' ? ' di bawah pelangi' : '';
      events.push(ev(now, 'play', `🎪 ${s.name} bermain di ${item.label.toLowerCase()}${mood}.`));
      return null;
    }
    case 'minigame': {
      const gameId = a.game === undefined ? 'stars' : a.game;
      const g = own(C.MINIGAMES, gameId);
      if (!g) return 'Mini-game tidak dikenal.';
      const e = guard(needHatched, needAwake);
      if (e) return e;
      const score = Math.floor(Number(a.score));
      if (!Number.isFinite(score) || score < 0) return 'Skor tidak valid.';
      if (s.stats.energy < 15) return `${s.name} terlalu lelah.`;
      const left = cooldownLeft(s, 'minigame', now);
      if (left) return waitMsg(left);
      const sc = Math.min(score, C.MINIGAME_MAX);
      setCooldown(s, 'minigame', now, C.PLAY_COOLDOWN);
      applyEffect(s, { energy: -10, happiness: Math.min(25, sc), hunger: -4, thirst: -3 });
      s.coins += Math.min(12, Math.floor(sc / 2));
      s.totals.minigames += 1;
      grantXp(s, 4 + Math.floor(sc / 3), now, events);
      track(s, 'minigame', now, events);
      events.push(ev(now, 'minigame', `${g.icon} ${g.label}: skor ${sc}.`));
      const prev = s.highscores[gameId] || 0;
      if (sc > prev && sc >= 10) {
        s.highscores[gameId] = sc;
        s.coins += C.RECORD_BONUS;
        events.push(ev(now, 'record', `🏅 Rekor baru ${g.label}: ${sc}! +${C.RECORD_BONUS} 🪙`));
        if (sc >= 30) giveSticker(s, 'bintang', now, events);
      }
      return null;
    }
    case 'chat': {
      const text = typeof a.text === 'string' ? a.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
      if (!text) return 'Ketik sesuatu dulu.';
      if (text.length > 160) return 'Pesannya terlalu panjang (maks. 160 huruf).';
      out.said = text;
      if (s.stage === 'egg') { out.reply = '(Telurnya bergetar pelan… sepertinya ia mendengarmu.)'; return null; }
      if (s.sleeping) { out.reply = `Zzz… (${s.name} mengigau pelan)`; return null; }
      const world = {
        FOODS, PLAYGROUND, QUESTS, hour: gameHour(s, now), rand: () => rand(s), cleanName, now,
        weather: weatherAt(s, now), event: eventOn(s, now), C,
      };
      out.reply = chat.reply(s, text, world).reply;
      if (!cooldownLeft(s, 'chat', now)) { // hadiah hanya tiap 30 detik agar tidak bisa di-spam
        setCooldown(s, 'chat', now, 30);
        applyEffect(s, { happiness: 3 + (hasTrait(s, 'manja') ? 2 : 0) });
        s.totals.chats += 1;
        bump(s, 'chats');
        grantXp(s, 1, now, events);
        track(s, 'chat', now, events);
      }
      return null;
    }
    case 'daily': {
      if (s.daily.loginClaimed) return 'Hadiah harian sudah diambil.';
      s.streak.count = s.streak.lastDate === yesterdayKey(now) ? s.streak.count + 1 : 1;
      s.streak.lastDate = s.daily.date;
      s.daily.loginClaimed = true;
      const coins = 5 + Math.min(s.streak.count, 7) * 2;
      s.coins += coins;
      grantXp(s, 3, now, events);
      events.push(ev(now, 'daily', `🎁 Hadiah harian hari ke-${s.streak.count}: +${coins} 🪙`));
      if (s.streak.count === 7) giveSticker(s, 'api', now, events);
      return null;
    }
    case 'lucky': {
      if (s.daily.luckyClaimed) return 'Kotak keberuntungan hari ini sudah dibuka.';
      s.daily.luckyClaimed = true;
      const r = rand(s);
      s.totals.lucky += 1;
      if (r < 0.45) { const c = randInt(s, 3, 8); s.coins += c; events.push(ev(now, 'lucky', `🎲 Kotak keberuntungan: +${c} 🪙`)); }
      else if (r < 0.75) { const c = randInt(s, 8, 15); s.coins += c; events.push(ev(now, 'lucky', `🎲 Lumayan! Kotak keberuntungan: +${c} 🪙`)); }
      else if (r < 0.92) {
        const id = pickWeighted(C.STICKER_DROPS, rand(s));
        events.push(ev(now, 'lucky', `🎲 Kotak keberuntungan berisi stiker ${C.STICKERS[id].emoji} ${C.STICKERS[id].label}!`));
        if (!giveSticker(s, id, now, events)) { s.coins += 4; events.push(ev(now, 'lucky', 'Stiker sudah dimiliki, ditukar +4 🪙')); }
      } else { const c = randInt(s, 25, 40); s.coins += c; events.push(ev(now, 'lucky', `🎰 JACKPOT! Kotak keberuntungan: +${c} 🪙`)); }
      grantXp(s, 2, now, events);
      return null;
    }
    case 'weekly': {
      if (s.weekly.claimed) return 'Hadiah mingguan sudah diambil.';
      if (s.weekly.quests < CONFIG.weeklyGoal) return `Selesaikan ${CONFIG.weeklyGoal} misi minggu ini (baru ${s.weekly.quests}).`;
      s.weekly.claimed = true;
      s.totals.weeklies += 1;
      s.coins += CONFIG.weeklyReward;
      grantXp(s, 15, now, events);
      giveSticker(s, 'berlian', now, events);
      events.push(ev(now, 'weekly', `🏆 Hadiah mingguan: +${CONFIG.weeklyReward} 🪙 dan stiker berlian!`));
      return null;
    }
    case 'event': {
      const e = eventOn(s, now);
      if (!e) return 'Hari ini bukan hari spesial.';
      const today = dateKey(now);
      if (s.eventClaimed[e.id] === today) return 'Hadiah hari spesial ini sudah diambil.';
      s.eventClaimed[e.id] = today;
      s.coins += e.reward;
      giveSticker(s, e.sticker || 'perayaan', now, events);
      grantXp(s, 5, now, events);
      events.push(ev(now, 'event', `${e.emoji} ${e.label}! Hadiah hari spesial: +${e.reward} 🪙`));
      return null;
    }
    case 'quest': {
      const q = s.daily.quests.find((x) => x.id === a.id);
      if (!q) return 'Misi tidak ditemukan.';
      const def = QUESTS[q.id];
      if (q.claimed) return 'Hadiah misi sudah diambil.';
      if (q.progress < def.goal) return 'Misi belum selesai.';
      q.claimed = true;
      s.coins += def.reward;
      s.totals.quests += 1;
      s.weekly.quests += 1;
      grantXp(s, 5, now, events);
      events.push(ev(now, 'quest', `✅ Misi "${def.label}" selesai: +${def.reward} 🪙`));
      if (!s.daily.bonusClaimed && s.daily.quests.every((x) => x.claimed)) {
        s.daily.bonusClaimed = true;
        s.coins += QUEST_BONUS;
        events.push(ev(now, 'quest', `🎉 Semua misi hari ini beres! Bonus +${QUEST_BONUS} 🪙`));
      }
      return null;
    }
    case 'collect': {
      if (!s.treasure) return 'Tidak ada harta karun di taman.';
      s.coins += s.treasure.amount;
      events.push(ev(now, 'treasure', `💰 Harta karun ditemukan: +${s.treasure.amount} 🪙`));
      if (s.treasure.rainbow) giveSticker(s, 'pelangi', now, events);
      else if (rand(s) < 0.18) giveSticker(s, pickWeighted(C.STICKER_DROPS, rand(s)), now, events);
      s.treasure = null;
      s.totals.treasures += 1;
      grantXp(s, 2, now, events);
      track(s, 'treasure', now, events);
      return null;
    }
    case 'greet': {
      const v = s.visitor;
      if (!v) return 'Tidak ada tamu di taman.';
      const def = C.VISITORS[v.kind];
      const coins = randInt(s, def.coins[0], def.coins[1]);
      s.coins += coins;
      applyEffect(s, { happiness: 6 });
      s.visitor = null;
      s.totals.visitors += 1;
      s.memory.visitor = { kind: v.kind, t: now };
      grantXp(s, 3, now, events);
      track(s, 'visitor', now, events);
      events.push(ev(now, 'visitor', `${def.emoji} ${s.name} menyapa ${def.label.toLowerCase()} dan dapat hadiah +${coins} 🪙`));
      if (!giveSticker(s, v.kind, now, events)) s.coins += 1;
      return null;
    }
    case 'train': {
      const sk = own(C.SKILLS, a.skill);
      if (!sk) return 'Keterampilan tidak dikenal.';
      const e = guard(needHatched, needAwake);
      if (e) return e;
      const cur = s.skills[a.skill];
      if (cur.lv >= C.SKILL_MAX) return `${sk.label} sudah maksimal.`;
      if (s.stats.energy < C.TRAIN.energy + 8) return `${s.name} terlalu lelah untuk berlatih.`;
      const key = `train:${a.skill}`;
      const left = cooldownLeft(s, key, now);
      if (left) return waitMsg(left);
      setCooldown(s, key, now, C.TRAIN.cooldown);
      applyEffect(s, { energy: -C.TRAIN.energy, hunger: -4, thirst: -4, happiness: 3 });
      s.totals.trains += 1;
      bump(s, 'trains');
      cur.xp += 1;
      grantXp(s, 3, now, events);
      track(s, 'train', now, events);
      if (cur.xp >= C.skillNeed(cur.lv)) {
        cur.lv += 1;
        cur.xp = 0;
        events.push(ev(now, 'skill', `${sk.icon} ${sk.label} naik ke level ${cur.lv}! ${sk.perk}`));
      } else events.push(ev(now, 'train', `${sk.icon} ${s.name} berlatih ${sk.label.toLowerCase()}.`));
      return null;
    }
    case 'retire':
      return retire(s, now, a, events);
    case 'morph': {
      // ganti jenis karakter (penampilan & gaya bicara) tanpa kehilangan umur, level, status, atau keterampilan
      const species = a.species === undefined ? s.species : a.species;
      if (!SPECIES.includes(species)) return 'Spesies tidak dikenal.';
      const name = a.name === undefined ? s.name : cleanName(a.name);
      if (!name) return 'Nama tidak boleh kosong.';
      const changed = species !== s.species;
      if (!changed && name === s.name) return 'Tidak ada yang berubah.';
      if (changed && s.coins < C.MORPH_COST) return `Butuh ${C.MORPH_COST} koin untuk ganti karakter.`;
      const old = s.species, oldName = s.name;
      if (changed) { s.coins -= C.MORPH_COST; s.species = species; s.totals.morphs += 1; }
      s.name = name;
      const cap = (x) => x[0].toUpperCase() + x.slice(1);
      if (changed) events.push(ev(now, 'morph', `🎭 ${oldName} berubah menjadi ${name !== oldName ? `${name} si ` : ''}${cap(species)}! (sebelumnya ${cap(old)})`));
      else events.push(ev(now, 'morph', `✏️ ${oldName} sekarang bernama ${name}.`));
      return null;
    }
    case 'buy': {
      const it = own(COSMETICS, a.item);
      if (!it) return 'Barang tidak dikenal.';
      if (s.inventory.includes(a.item)) return 'Sudah dimiliki.';
      if (s.level < it.unlock) return `${it.label} terbuka di level ${it.unlock}.`;
      if (it.rare && !shopToday(s, now).rare.includes(a.item)) return `${it.label} tidak dijual hari ini. Cek lagi besok!`;
      const price = priceOf(s, now, 'cosmetic', a.item, it.cost);
      if (s.coins < price) return 'Koin tidak cukup.';
      s.coins -= price;
      s.inventory.push(a.item);
      s.equipped[it.slot] = a.item;
      events.push(ev(now, 'buy', `🛍️ ${s.name} sekarang memakai ${it.label.toLowerCase()}.`));
      return null;
    }
    case 'equip': {
      const it = own(COSMETICS, a.item);
      if (!it) return 'Barang tidak dikenal.';
      if (!s.inventory.includes(a.item)) return 'Belum dimiliki.';
      s.equipped[it.slot] = s.equipped[it.slot] === a.item ? null : a.item;
      return null;
    }
    case 'houseBuy': {
      if (s.house.owned) return 'Sudah punya rumah.';
      if (s.level < C.HOUSE.unlock) return `Rumah terbuka di level ${C.HOUSE.unlock}.`;
      if (s.coins < C.HOUSE.cost) return 'Koin tidak cukup.';
      s.coins -= C.HOUSE.cost;
      s.house.owned = true;
      events.push(ev(now, 'buy', `🐾 Rumah hewan baru untuk ${s.name}! Ia kini bisa berteduh saat hujan.`));
      return null;
    }
    case 'houseDecorBuy': {
      const it = own(C.HOUSE_DECOR, a.item);
      if (!it) return 'Isi rumah tidak dikenal.';
      if (!s.house.owned) return 'Beli rumah hewan dulu di Toko → Rumah.';
      if (s.house.items.includes(a.item)) return 'Sudah dimiliki.';
      const price = priceOf(s, now, 'hdecor', a.item, it.cost);
      if (s.coins < price) return 'Koin tidak cukup.';
      s.coins -= price;
      s.house.items.push(a.item);
      events.push(ev(now, 'buy', `${it.emoji} ${it.label} ditaruh di rumah hewan ${s.name}.`));
      return null;
    }
    case 'tintBuy': {
      const it = own(C.TINTS, a.tint);
      if (!it) return 'Warna tidak dikenal.';
      if (s.tint.owned.includes(a.tint)) return 'Sudah dimiliki.';
      if (s.level < it.unlock) return `${it.label} terbuka di level ${it.unlock}.`;
      const price = priceOf(s, now, 'tint', a.tint, it.cost);
      if (s.coins < price) return 'Koin tidak cukup.';
      s.coins -= price;
      s.tint.owned.push(a.tint);
      s.tint.active = a.tint;
      events.push(ev(now, 'buy', `${it.emoji} Bulu ${s.name} kini berwarna ${it.label.toLowerCase()}!`));
      return null;
    }
    case 'tintSet': {
      if (a.tint === null || a.tint === 'asli') { s.tint.active = null; return null; }
      if (!own(C.TINTS, a.tint)) return 'Warna tidak dikenal.';
      if (!s.tint.owned.includes(a.tint)) return 'Belum dimiliki.';
      s.tint.active = a.tint;
      return null;
    }
    case 'breed': {
      if (!['adult', 'elder'].includes(s.stage)) return `${s.name} belum dewasa.`;
      if (s.nest) return 'Telur keturunan sudah dititipkan. Ia akan menetas saat peliharaan pensiun.';
      if (s.coins < C.BREED_COST) return `Butuh ${C.BREED_COST} koin untuk menitipkan telur.`;
      s.coins -= C.BREED_COST;
      const mutate = rand(s) < 0.25;
      const others = SPECIES.filter((x) => x !== s.species);
      s.nest = {
        species: mutate ? others[Math.floor(rand(s) * others.length)] : s.species,
        parent: s.name, gen: s.generation, shiny: s.shiny, fav: s.prefs.fav,
        tint: s.tint.active, form: s.form, at: now,
      };
      s.totals.breeds += 1;
      grantXp(s, 10, now, events);
      events.push(ev(now, 'breed', `🥚 ${s.name} menitipkan telur keturunan${mutate ? ' (jenisnya berbeda dari induk!)' : ''}. Telur ini menetas saat ${s.name} pensiun, membawa warisan lebih banyak.`));
      return null;
    }
    case 'visit': {
      const fid = typeof a.fid === 'string' ? a.fid : '';
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(fid)) return 'Kode teman tidak valid.';
      if (fid === s.id) return 'Itu kode tamanmu sendiri.';
      const fname = cleanName(a.fname) || 'teman';
      const e = guard(needHatched);
      if (e) return e;
      const today = dateKey(now);
      if (s.friends.date !== today) s.friends = { date: today, ids: [] };
      if (s.friends.ids.includes(fid)) return `Kamu sudah mengunjungi ${fname} hari ini.`;
      if (s.friends.ids.length >= C.VISIT_DAILY_MAX) return `Maksimal ${C.VISIT_DAILY_MAX} kunjungan teman per hari.`;
      s.friends.ids.push(fid);
      s.coins += C.VISIT_REWARD;
      s.totals.visits += 1;
      applyEffect(s, { happiness: 6 });
      grantXp(s, 3, now, events);
      events.push(ev(now, 'visit', `🤝 ${s.name} berkunjung ke taman ${fname}. +${C.VISIT_REWARD} 🪙`));
      if (s.totals.visits >= 3) giveSticker(s, 'teman', now, events);
      return null;
    }
    case 'wish': {
      const slot = Math.floor(now / C.WEATHER_SLOT_MS);
      if (weatherAt(s, now) !== 'meteor') return 'Tidak ada hujan meteor sekarang.';
      if (s.wish === slot) return 'Permohonan sudah dibuat untuk hujan meteor ini.';
      const e = guard(needHatched);
      if (e) return e;
      s.wish = slot;
      const gain = 8 + Math.floor(rand(s) * 8);
      s.coins += gain;
      s.totals.wishes += 1;
      applyEffect(s, { happiness: 10 });
      grantXp(s, 4, now, events);
      events.push(ev(now, 'wish', `🌠 ${s.name} membuat permohonan pada bintang jatuh. +${gain} 🪙`));
      if (rand(s) < 0.4) giveSticker(s, 'bintang', now, events);
      return null;
    }
    case 'home': {
      const h = s.house;
      if (!h.owned) return 'Belum punya rumah. Beli di Toko → Rumah.';
      const e = guard(needHatched);
      if (e) return e;
      const wet = isWet(weatherAt(s, now));
      if (h.inside) {
        if (h.reason === 'sleep') return `${s.name} sedang tidur di rumah.`;
        if (wet) return `Masih hujan — ${s.name} tetap di dalam rumah.`;
        h.inside = false; h.reason = null;
        events.push(ev(now, 'house', `🚪 ${s.name} keluar dari rumah.`));
      } else {
        h.inside = true; h.reason = wet ? 'rain' : 'manual';
        events.push(ev(now, 'house', `🏠 ${s.name} masuk ke rumah.`));
      }
      return null;
    }
    case 'decorBuy': {
      const it = own(C.DECOR, a.item);
      if (!it) return 'Dekorasi tidak dikenal.';
      if (s.decor.owned.includes(a.item)) return 'Sudah dimiliki.';
      if (s.level < it.unlock) return `${it.label} terbuka di level ${it.unlock}.`;
      const price = priceOf(s, now, 'decor', a.item, it.cost);
      if (s.coins < price) return 'Koin tidak cukup.';
      s.coins -= price;
      s.decor.owned.push(a.item);
      const full = placeDecor(s, a.item);
      events.push(ev(now, 'buy', full ? `🏡 ${it.label} dibeli, tetapi tempatnya penuh — disimpan dulu.` : `🏡 ${it.label} dipasang di taman.`));
      return null;
    }
    case 'decorPlace': {
      if (!own(C.DECOR, a.item)) return 'Dekorasi tidak dikenal.';
      if (!s.decor.owned.includes(a.item)) return 'Belum dimiliki.';
      if (s.decor.placed.includes(a.item)) { unplaceDecor(s, a.item); return null; }
      return placeDecor(s, a.item);
    }
    case 'themeBuy': {
      const it = own(C.THEMES, a.theme);
      if (!it) return 'Tema tidak dikenal.';
      if (s.decor.themes.includes(a.theme)) return 'Sudah dimiliki.';
      if (s.level < it.unlock) return `${it.label} terbuka di level ${it.unlock}.`;
      if (s.coins < it.cost) return 'Koin tidak cukup.';
      s.coins -= it.cost;
      s.decor.themes.push(a.theme);
      s.decor.theme = a.theme;
      events.push(ev(now, 'buy', `🎨 Tema taman diganti: ${it.label}.`));
      return null;
    }
    case 'themeSet': {
      if (!own(C.THEMES, a.theme)) return 'Tema tidak dikenal.';
      if (!s.decor.themes.includes(a.theme)) return 'Belum dimiliki.';
      s.decor.theme = a.theme;
      return null;
    }
    default:
      return 'Aksi tidak dikenal.';
  }
}

/** Jalankan aksi pemain: majukan waktu dulu, lalu terapkan aksi. */
function perform(s, now, action) {
  const ctx = advance(s, now);
  const events = ctx.events;
  const before = { ...s.stats, coins: s.coins, xp: s.xp };
  const out = {};
  const error = doAction(s, now, action || {}, events, out);
  if (!error) {
    syncHouse(s, isWet(weatherAt(s, now)), events, now);
    checkAchievements(s, now, events);
    s.memory.interact = now;
  }
  if (error) return { ok: false, error, events: ctx.events, samples: ctx.samples, dirty: ctx.stepped };
  const effects = {};
  for (const k of STAT_KEYS) {
    const d = Math.round(s.stats[k] - before[k]);
    if (d) effects[k] = d;
  }
  if (s.coins !== before.coins) effects.coins = s.coins - before.coins;
  if (s.xp !== before.xp) effects.xp = s.xp - before.xp;
  return { ok: true, effects, events, samples: ctx.samples, dirty: true, reply: out.reply, said: out.said };
}

/** Konfigurasi statis untuk klien (dipakai server & versi web). */
function buildConfig() {
  return {
    foods: FOODS,
    playground: PLAYGROUND,
    species: SPECIES,
    medicineCost: MEDICINE_COST,
    stageStarts: CONFIG.stageStarts,
    cosmetics: COSMETICS,
    quests: QUESTS,
    questBonus: QUEST_BONUS,
    achievements: ACHIEVEMENTS.map(({ test, ...a }) => a),
    dayRealMinutes: CONFIG.dayRealMinutes,
    dayStartHour: CONFIG.dayStartHour,
    decor: C.DECOR,
    decorSlots: C.DECOR_SLOTS,
    house: C.HOUSE,
    houseDecor: C.HOUSE_DECOR,
    tints: C.TINTS,
    breedCost: C.BREED_COST,
    visitReward: C.VISIT_REWARD,
    visitMax: C.VISIT_DAILY_MAX,
    rainDamage: C.RAIN,
    themes: C.THEMES,
    stickers: C.STICKERS,
    albumRewards: C.ALBUM_REWARDS,
    visitors: C.VISITORS,
    minigames: C.MINIGAMES,
    skills: C.SKILLS,
    skillMax: C.SKILL_MAX,
    skillNeeds: Array.from({ length: C.SKILL_MAX }, (_, lv) => C.skillNeed(lv)),
    train: C.TRAIN,
    traits: C.TRAITS,
    weathers: C.WEATHERS,
    weeklyGoal: CONFIG.weeklyGoal,
    weeklyReward: CONFIG.weeklyReward,
    shinyChance: CONFIG.shinyChance,
    minigameCooldown: C.PLAY_COOLDOWN,
    morphCost: C.MORPH_COST,
  };
}

/** Isi dinamis untuk klien: streak, cuaca, acara. */
function viewExtras(s, now) {
  return s ? { streak: effectiveStreak(s, now), world: worldView(s, now), shop: shopToday(s, now) } : { streak: 0, world: null, shop: null };
}

module.exports = {
  CONFIG, FOODS, PLAYGROUND, COSMETICS, QUESTS, QUEST_BONUS, ACHIEVEMENTS, SPECIES, STAT_KEYS, MEDICINE_COST, MIN, HOUR, C,
  createPet, advance, perform, migrate, gameHour, effectiveStreak, dateKey, levelForXp, xpForLevel, stageFor, careAverage, cleanName,
  weatherAt, eventOn, worldView, shopToday, buildConfig, viewExtras,
};
