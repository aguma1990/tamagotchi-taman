// DIHASILKAN OTOMATIS oleh scripts/build-web.js dari src/engine.js & src/chat.js — jangan diedit.
const __chat = (() => {
const module = { exports: {} };
'use strict';
/**
 * Otak percakapan peliharaan — berbasis aturan, 100% lokal & deterministik (RNG dari state).
 * Balasan bergantung pada suasana hati, statistik, level, waktu taman, dan nama pemilik yang diingat.
 */

const norm = (t) =>
  t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Cocokkan kata/frasa utuh (bukan potongan di tengah kata). */
const has = (t, ...words) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(t));

const FLAVOR = { mochi: ' Nyaa~', bubu: ' Hehe.', leafy: ' 🌱' };

const JOKES = [
  'Kenapa komputer nggak pernah lapar? Karena selalu ada byte-nya! 😄',
  'Apa yang naik tapi nggak pernah turun? Umur! Hehe.',
  'Hewan apa yang paling cepat? Cheetah! Tapi aku lebih cepat kalau lihat kue. 🍰',
  'Kenapa ikan pintar? Karena hidupnya selalu di sekolah (sekolah ikan)! 🐟',
  'Kata apa yang paling sopan? Tolong, maaf, dan terima kasih!',
];
const STORIES = [
  'Dulu ada bintang kecil yang takut gelap. Lalu ia sadar, justru karena gelap ia bisa bersinar paling terang. ✨',
  'Seekor siput ingin melihat pelangi. Ia berjalan pelan tiap hari, dan sampai tepat saat hujan reda. Pelan nggak apa-apa! 🌈',
  'Ada awan yang iri pada matahari. Tapi tanpa awan nggak ada hujan, tanpa hujan nggak ada bunga. 🌼',
  'Si kecil menanam biji dan menyiramnya sabar tiap hari. Kini jadi pohon tempat semua teman berteduh. 🌳',
];
const FAVORITE = { mochi: 'kue, apalagi yang manis banget 🍰', bubu: 'susu segar, glek glek glek 🥛', leafy: 'apel yang renyah 🍎' };

function moodOf(s) {
  if (s.sleeping) return 'sleep';
  const st = s.stats;
  if (s.sick) return 'sick';
  if (st.hunger < 25) return 'hungry';
  if (st.energy < 20) return 'tired';
  if (st.hygiene < 25 || s.poop >= 3) return 'dirty';
  if (st.happiness < 30) return 'sad';
  if (st.happiness > 70 && st.hunger > 40) return 'happy';
  return 'neutral';
}

function part(hour) {
  if (hour < 11) return 'pagi';
  if (hour < 15) return 'siang';
  if (hour < 18) return 'sore';
  return 'malam';
}

function suggestPlay(s, W) {
  const open = Object.entries(W.PLAYGROUND).filter(([, v]) => s.level >= v.unlock).map(([, v]) => v.label.toLowerCase());
  return open[Math.floor(W.rand() * open.length)] || 'ayunan';
}

/**
 * @returns {{reply: string}} — dan boleh mengubah s.owner.
 * W: { FOODS, PLAYGROUND, QUESTS, hour, rand, cleanName }
 */
function reply(s, rawText, W) {
  const raw = String(rawText);
  const t = norm(raw);
  const pick = (arr) => arr[Math.floor(W.rand() * arr.length)];
  const you = s.owner || 'kamu';
  const mood = moodOf(s);
  const st = s.stats;
  const greet = has(t, 'halo', 'hai', 'hi', 'hey', 'hello', 'pagi', 'siang', 'sore', 'malam', 'permisi', 'assalamualaikum');

  const out = (text) => {
    // gaya bicara khas tiap jenis (tidak selalu, supaya tidak monoton)
    const flavor = W.rand() < 0.45 ? FLAVOR[s.species] || '' : '';
    return { reply: `${text}${flavor}` };
  };

  // 1) perkenalan nama pemilik
  const nm = raw.match(/(?:namaku|nama saya|panggil (?:aku|saya)|aku dipanggil)\s+(?:adalah\s+)?([\p{L}][\p{L}0-9']{0,15})/iu);
  if (nm) {
    const name = W.cleanName(nm[1]);
    if (name) {
      s.owner = name;
      return out(pick([`Halo ${name}! Nama yang bagus. Aku akan selalu ingat. 💕`, `${name}… oke, aku ingat! Senang kenal kamu, ${name}!`]));
    }
  }

  if (has(t, 'dadah', 'bye', 'sampai jumpa', 'pamit', 'aku pergi', 'tinggal dulu', 'selamat tinggal', 'daaah')) {
    return out(pick([`Dadah ${you}! Cepat kembali ya, aku bakal kangen. 👋`, `Hati-hati, ${you}! Aku jaga taman sampai kamu balik.`]));
  }
  if (has(t, 'terima kasih', 'makasih', 'thanks', 'thx', 'trims', 'makasi')) {
    return out(pick([`Sama-sama, ${you}! 😊`, 'Aku yang makasih sudah merawatku!', 'Hehe, senang bisa bikin kamu senang.']));
  }
  if (has(t, 'maaf', 'sorry', 'ampun')) return out(pick(['Nggak apa-apa kok, aku nggak marah. 💛', `Dimaafin! Asal kamu tetap main sama aku, ${you}.`]));
  if (has(t, 'bodoh', 'jelek', 'benci', 'nakal', 'goblok', 'bego', 'menyebalkan', 'diam')) {
    return out(pick(['Hiks… itu bikin aku sedih. Tapi aku tetap sayang kamu.', 'Aduh, kok gitu… aku jadi pengin ngumpet. 🥺']));
  }
  if (has(t, 'sedih', 'galau', 'nangis', 'stres', 'kesepian', 'sendirian', 'capek hidup', 'lelah hidup')) {
    return out(pick([`Sini, ${you}, aku peluk. Aku selalu ada di sini. 🤗`, 'Nggak apa-apa merasa sedih. Cerita aja, aku dengerin.', 'Kamu nggak sendirian. Ada aku di taman, nungguin kamu. 💛']));
  }
  if (has(t, 'sayang', 'cinta', 'love', 'suka kamu', 'rindu', 'kangen', 'i love you')) {
    return out(pick([`Aku juga sayang kamu, ${you}! 💖`, 'Dadaku jadi hangat… makasih ya! 💕', `Kamu orang favoritku sedunia, ${you}!`]));
  }
  if (has(t, 'cantik', 'lucu', 'imut', 'pintar', 'keren', 'hebat', 'gemas', 'manis', 'ganteng', 'bagus', 'pinter')) {
    return out(pick(['Eh… jadi malu. 😳', 'Hehe, makasih! Kamu juga keren!', 'Pipiku jadi merah nih, lihat deh! 🥰']));
  }
  if (has(t, 'lelucon', 'joke', 'jokes', 'bercanda', 'lawak', 'humor')) return out(pick(JOKES));
  if (has(t, 'cerita', 'dongeng', 'kisah')) return out(pick(STORIES));
  if (has(t, 'bantuan', 'help', 'bisa apa', 'menu', 'topik')) {
    return out('Tanya aja: kabarku, lapar nggak, mau main, misi hari ini, koin, atau minta lelucon & cerita!');
  }

  if (has(t, 'misi', 'tugas', 'quest', 'hadiah')) {
    const q = s.daily?.quests.find((x) => !x.claimed);
    if (!q) return out(`Semua misi hari ini sudah beres! Hebat, ${you}! 🎉`);
    const def = W.QUESTS[q.id];
    const done = q.progress >= def.goal;
    return out(done ? `Misi "${def.label}" sudah selesai, ambil hadiahnya di tab Misi!` : `Misi yang belum: ${def.label} (${q.progress}/${def.goal}). Yuk kita kerjakan!`);
  }
  if (has(t, 'koin', 'uang', 'kaya', 'duit', 'harta', 'toko', 'beli')) {
    if (s.treasure) return out('Aku lihat sesuatu berkilau di taman! 💰 Ketuk harta karunnya yuk!');
    return out(`Kamu punya ${s.coins} koin. ${s.coins >= 25 ? 'Cukup buat beli aksesori di Toko lho!' : 'Main di taman atau selesaikan misi buat nambah koin.'}`);
  }

  if (has(t, 'main', 'bermain', 'ayo', 'taman', 'ayunan', 'pasir', 'bola', 'kolam', 'trampolin', 'bosan')) {
    if (st.energy < 20) return out('Aku pengin banget, tapi capek… tidur sebentar dulu ya? 😴');
    return out(pick([`Ayo ke ${suggestPlay(s, W)}! Aku duluan! 🏃`, `Seru! Aku mau main ${suggestPlay(s, W)}!`]));
  }
  if (has(t, 'makanan favorit', 'suka apa', 'favorit')) return out(`Aku paling suka ${FAVORITE[s.species]}`);
  if (has(t, 'lapar', 'laper', 'makan', 'kenyang', 'ngemil', 'makanan', 'haus', 'minum')) {
    if (st.hunger < 30) return out(`Iya, aku lapar banget! Kenyangku tinggal ${Math.round(st.hunger)}%. Kasih apel dong 🍎`);
    if (st.hunger < 70) return out('Lumayan sih… ngemil dikit boleh. 😋');
    return out(`Aku masih kenyang banget (${Math.round(st.hunger)}%)! Makasih udah perhatian.`);
  }
  if (has(t, 'ngantuk', 'tidur', 'capek', 'lelah', 'istirahat', 'energi', 'bobo')) {
    if (st.energy < 25) return out(`Ngantuk banget… energiku ${Math.round(st.energy)}%. Boleh bobo dulu? 😴`);
    if (st.energy < 60) return out('Agak capek sih, tapi masih kuat main sebentar.');
    return out(`Aku segar! Energiku ${Math.round(st.energy)}%. ⚡`);
  }
  if (has(t, 'mandi', 'kotor', 'bersih', 'bau')) {
    if (st.hygiene < 40 || s.poop > 0) return out('Iya, aku agak kotor… mandiin dong biar wangi! 🛁');
    return out('Aku bersih dan wangi dong! ✨');
  }
  if (has(t, 'sakit', 'obat', 'demam', 'pusing')) {
    return out(s.sick ? 'Badanku nggak enak… tolong kasih obat ya. 💊' : 'Aku sehat kok! Makasih udah nanya. ❤️');
  }

  if (has(t, 'siapa nama', 'namamu', 'kamu siapa', 'siapa kamu')) return out(`Aku ${s.name}! Kamu bisa bilang "namaku …" biar aku ingat namamu.`);
  if (has(t, 'umur', 'berapa tahun', 'level', 'lahir', 'tumbuh')) {
    const d = Math.floor(s.ageMinutes / 1440), h = Math.floor((s.ageMinutes % 1440) / 60);
    return out(`Umurku ${d ? `${d} hari ` : ''}${h} jam, sekarang level ${s.level}. Aku makin besar berkat kamu!`);
  }

  if (has(t, 'apa kabar', 'kabar', 'gimana', 'bagaimana', 'how are you', 'lagi apa', 'sehat', 'baik')) {
    const hi = greet ? `Hai ${you}! ` : '';
    const byMood = {
      hungry: `Perutku keroncongan… kenyangku ${Math.round(st.hunger)}%.`,
      tired: `Aku ngantuk berat, energiku ${Math.round(st.energy)}%.`,
      dirty: 'Aku merasa kurang bersih. Mandiin dong.',
      sick: 'Badanku nggak enak… butuh obat.',
      sad: 'Agak sepi, tapi ada kamu jadi lumayan.',
      happy: pick(['Aku senang banget hari ini!', 'Senang! Kenyang, bersih, dan ada kamu.']),
      neutral: 'Baik-baik aja kok. Kamu sendiri gimana?',
    };
    return out(hi + byMood[mood]);
  }

  if (greet) {
    const p = part(W.hour);
    const base = pick([`Halo ${you}! Selamat ${p}!`, `Hai hai ${you}! Lagi ${p} nih di taman.`, `Eh, ${you} datang! Selamat ${p}!`]);
    const add = { hungry: ' Aku lapar nih…', tired: ' Aku ngantuk sih…', dirty: ' Aku agak kotor…', sick: ' Aku kurang sehat…', sad: ' Aku agak murung…', happy: ' Aku lagi senang! 😄', neutral: '' }[mood];
    return out(base + add);
  }

  return out(pick([
    `Hmm, aku belum ngerti, tapi aku suka dengerin kamu, ${you}.`,
    'Wah, menarik! Coba tanya soal kabarku, makan, atau ajak main. 💬',
    'Aku belum paham itu, tapi ceritain terus ya, aku dengerin.',
    `Hehe, ${you}, ketik "bantuan" kalau mau tahu aku bisa ngobrol apa aja.`,
  ]));
}

module.exports = { reply, moodOf };

return module.exports;
})();
export const engine = (() => {
const module = { exports: {} };
const require = () => __chat;
'use strict';
/**
 * Game engine — murni (tanpa I/O), deterministik (RNG di-seed dari state),
 * sehingga mudah dites dan aman dijalankan ulang untuk "catch-up" saat offline.
 */

const chat = require('./chat');

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
  stageStarts: Object.freeze({ egg: 0, baby: 1, child: 360, teen: 1440, adult: 4320 }),
  // laju per jam
  awake: Object.freeze({ hunger: 6, happiness: 3.5, energy: 4.5, hygiene: 2.5 }),
  asleep: Object.freeze({ hunger: 2, happiness: 0.8, energy: -200, hygiene: 0.8 }), // tidur: kosong → penuh ±15 menit nyata
});

const SPECIES = Object.freeze(['mochi', 'bubu', 'leafy']);

const FOODS = Object.freeze({
  bubur: { label: 'Bubur', emoji: '🥣', cost: 0, hunger: 20, happiness: 1, health: 0, energy: 5 },
  apel: { label: 'Apel', emoji: '🍎', cost: 0, hunger: 14, happiness: 3, health: 1, energy: 8 },
  susu: { label: 'Susu Segar', emoji: '🥛', cost: 3, hunger: 8, happiness: 2, health: 1, energy: 14 },
  burger: { label: 'Burger', emoji: '🍔', cost: 5, hunger: 32, happiness: 7, health: 0, energy: 6 },
  kue: { label: 'Kue', emoji: '🍰', cost: 12, hunger: 18, happiness: 22, health: 2, energy: 8 },
  jus: { label: 'Jus Energi', emoji: '🧃', cost: 8, hunger: 6, happiness: 6, health: 2, energy: 30 },
});

const PLAYGROUND = Object.freeze({
  swing: { label: 'Ayunan', unlock: 1, energy: 6, happiness: 10, hunger: 2, hygiene: 0, coins: 1, xp: 4, cooldown: 60 },
  ball: { label: 'Bola', unlock: 1, energy: 8, happiness: 12, hunger: 3, hygiene: -2, coins: 1, xp: 4, cooldown: 60 },
  sandbox: { label: 'Kotak Pasir', unlock: 2, energy: 8, happiness: 12, hunger: 3, hygiene: -12, coins: 2, xp: 6, cooldown: 90 },
  pond: { label: 'Kolam', unlock: 3, energy: 10, happiness: 16, hunger: 4, hygiene: 8, coins: 2, xp: 8, cooldown: 120 },
  trampoline: { label: 'Trampolin', unlock: 5, energy: 14, happiness: 20, hunger: 6, hygiene: 0, coins: 4, xp: 12, cooldown: 120 },
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
});

const QUESTS = Object.freeze({
  feed: { label: 'Beri makan 3 kali', icon: '🍽️', goal: 3, reward: 6 },
  play: { label: 'Bermain di taman 4 kali', icon: '🎪', goal: 4, reward: 9 },
  clean: { label: 'Mandikan 1 kali', icon: '🛁', goal: 1, reward: 4 },
  cuddle: { label: 'Peluk 5 kali', icon: '🤗', goal: 5, reward: 6 },
  minigame: { label: 'Main Tangkap Bintang 2 kali', icon: '⭐', goal: 2, reward: 12 },
  treasure: { label: 'Temukan 1 harta karun', icon: '💰', goal: 1, reward: 8 },
  chat: { label: 'Ngobrol dengan peliharaan 3 kali', icon: '💬', goal: 3, reward: 5 },
});
const QUEST_BONUS = 10;

const ACHIEVEMENTS = Object.freeze([
  { id: 'hatch', icon: '🐣', label: 'Lahir ke Dunia', desc: 'Telur menetas', reward: 5, test: (s) => s.stage !== 'egg' },
  { id: 'meals10', icon: '🍔', label: 'Si Rakus', desc: 'Beri makan 10 kali', reward: 10, test: (s) => s.totals.meals >= 10 },
  { id: 'plays25', icon: '🎪', label: 'Anak Taman', desc: 'Bermain di taman 25 kali', reward: 15, test: (s) => s.totals.plays >= 25 },
  { id: 'clean10', icon: '🫧', label: 'Kinclong', desc: 'Mandikan 10 kali', reward: 10, test: (s) => s.totals.cleans >= 10 },
  { id: 'cuddle50', icon: '💕', label: 'Kesayangan', desc: 'Peluk 50 kali', reward: 20, test: (s) => s.totals.cuddles >= 50 },
  { id: 'stars10', icon: '⭐', label: 'Pemburu Bintang', desc: 'Main Tangkap Bintang 10 kali', reward: 20, test: (s) => s.totals.minigames >= 10 },
  { id: 'treasure5', icon: '💰', label: 'Pemburu Harta', desc: 'Temukan 5 harta karun', reward: 20, test: (s) => s.totals.treasures >= 5 },
  { id: 'chat30', icon: '💬', label: 'Teman Curhat', desc: 'Ngobrol 30 kali', reward: 20, test: (s) => s.totals.chats >= 30 },
  { id: 'quests10', icon: '📋', label: 'Rajin', desc: 'Selesaikan 10 misi harian', reward: 25, test: (s) => s.totals.quests >= 10 },
  { id: 'streak3', icon: '🔥', label: 'Setia', desc: 'Ambil hadiah harian 3 hari beruntun', reward: 15, test: (s) => s.streak.count >= 3 },
  { id: 'streak7', icon: '🏅', label: 'Sahabat Sejati', desc: 'Ambil hadiah harian 7 hari beruntun', reward: 40, test: (s) => s.streak.count >= 7 },
  { id: 'level5', icon: '🚀', label: 'Petualang', desc: 'Capai level 5', reward: 20, test: (s) => s.level >= 5 },
  { id: 'level10', icon: '🌋', label: 'Legenda Taman', desc: 'Capai level 10', reward: 60, test: (s) => s.level >= 10 },
  { id: 'fashion', icon: '🎩', label: 'Fashionista', desc: 'Miliki 3 aksesori', reward: 20, test: (s) => s.inventory.length >= 3 },
  { id: 'adult', icon: '🌱', label: 'Dewasa', desc: 'Tumbuh dewasa', reward: 50, test: (s) => s.stage === 'adult' },
  { id: 'radiant', icon: '🌟', label: 'Bersinar', desc: 'Tumbuh dewasa dalam bentuk bersinar', reward: 80, test: (s) => s.form === 'radiant' },
]);

const MEDICINE_COST = 5;
const STAT_KEYS = ['hunger', 'happiness', 'energy', 'hygiene', 'health'];

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

/** Misi harian: 3 dari 6, dipilih deterministik dari tanggal + id peliharaan. */
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
  s.daily = { date: key, loginClaimed: false, bonusClaimed: false, quests: picked.map((id) => ({ id, progress: 0, claimed: false })) };
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

/** Lengkapi field baru pada save lama (migrasi aman, idempotent). */
function migrate(s, now) {
  s.inventory ??= [];
  s.equipped ??= {};
  for (const slot of ['head', 'face', 'neck']) s.equipped[slot] ??= null;
  s.achievements ??= {};
  s.streak ??= { count: 0, lastDate: '' };
  s.treasure ??= null;
  s.owner ??= '';
  for (const k of ['treasures', 'quests', 'chats']) s.totals[k] ??= 0;
  if (!Number.isFinite(s.coins)) s.coins = 0;
  rollDaily(s, now);
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

function cleanName(raw) {
  // eslint-disable-next-line no-control-regex
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return name.slice(0, 16);
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
    stats: { hunger: 80, happiness: 80, energy: 90, hygiene: 100, health: 100 },
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
  const events = [ev(now, 'birth', `🥚 Telur ${clean} ditemukan di taman. Jaga dengan baik!`)];
  return { ok: true, state, events };
}

function ev(t, type, msg) {
  return { t, type, msg };
}

function careAverage(s) {
  return s.careSamples ? s.careSum / s.careSamples : 100;
}

function grantXp(s, amount, t, events) {
  s.xp += amount;
  const level = levelForXp(s.xp);
  if (level > s.level) {
    s.level = level;
    const unlocked = Object.entries(PLAYGROUND)
      .filter(([, v]) => v.unlock === level)
      .map(([, v]) => v.label);
    const extra = unlocked.length ? ` Terbuka: ${unlocked.join(', ')}!` : '';
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
    return;
  }
  const names = { child: 'anak-anak', teen: 'remaja', adult: 'dewasa' };
  if (next === 'adult') {
    s.form = careAverage(s) >= 65 ? 'radiant' : 'regular';
    events.push(
      ev(t, 'evolve', s.form === 'radiant'
        ? `🌟 ${s.name} tumbuh dewasa dan bersinar berkat perawatanmu!`
        : `🌱 ${s.name} tumbuh dewasa.`),
    );
  } else {
    events.push(ev(t, 'evolve', `🌱 ${s.name} tumbuh menjadi ${names[next]}.`));
  }
}

function stepOne(s, t, ctx, mult) {
  const speed = CONFIG.speed;
  s.ageMinutes += speed;
  updateStage(s, t, ctx.events);
  if (s.stage === 'egg') return;

  const st = s.stats;
  const perMin = speed / 60;

  if (s.sleeping) {
    const r = CONFIG.asleep;
    st.hunger -= r.hunger * perMin * mult;
    st.happiness -= r.happiness * perMin * mult;
    st.hygiene -= r.hygiene * perMin * mult;
    st.energy -= r.energy * perMin; // negatif = pulih
    if (st.energy >= 100) {
      s.sleeping = false;
      ctx.events.push(ev(t, 'wake', `☀️ ${s.name} bangun dengan segar.`));
    }
  } else {
    const r = CONFIG.awake;
    st.hunger -= r.hunger * perMin * mult;
    st.happiness -= r.happiness * perMin * mult;
    st.energy -= r.energy * perMin * mult;
    st.hygiene -= (r.hygiene + s.poop * 1.2) * perMin * mult;
    if (s.sick) st.happiness -= 3 * perMin * mult;

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
  if (st.energy < 8) dh -= 1.5;
  if (st.hygiene < 15) dh -= 1.5;
  if (st.happiness < 20) dh -= 1;
  if (s.sick) dh -= 3;
  if (dh < 0) dh *= mult;
  else if (!s.sick && st.hunger >= 40 && st.energy >= 40 && st.hygiene >= 40) dh += 3;
  st.health += dh * perMin;

  // sakit
  if (!s.sick && !s.sleeping) {
    let p = 0;
    if (st.hygiene < 25) p += 1 / 240;
    if (s.poop >= 3) p += 1 / 240;
    if (st.health < 30) p += 1 / 480;
    if (p > 0 && rand(s) < p * speed * mult) {
      s.sick = true;
      ctx.events.push(ev(t, 'sick', `🤒 ${s.name} jatuh sakit. Beri obat!`));
    }
  }

  if (!s.treasure && rand(s) < 1 / 25) {
    s.treasure = { x: 100 + Math.floor(rand(s) * 700), amount: 3 + Math.floor(rand(s) * 6), t };
    ctx.events.push(ev(t, 'treasure', '💰 Ada harta karun berkilau di taman!'));
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
      if (s.stats.hunger >= TOO_FULL) return `${s.name} sudah kenyang.`;
      if (s.coins < food.cost) return 'Koin tidak cukup.';
      s.coins -= food.cost;
      applyEffect(s, { hunger: food.hunger, happiness: food.happiness, health: food.health, energy: food.energy });
      s.totals.meals += 1;
      grantXp(s, 2, now, events);
      track(s, 'feed', now, events);
      events.push(ev(now, 'feed', `${food.emoji} ${s.name} makan ${food.label.toLowerCase()}.`));
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
      events.push(ev(now, 'sleep', `😴 ${s.name} tidur.`));
      return null;
    }
    case 'wake': {
      if (!s.sleeping) return `${s.name} sudah bangun.`;
      s.sleeping = false;
      s.stats.happiness = clamp(s.stats.happiness - (s.stats.energy < 60 ? 6 : 0));
      events.push(ev(now, 'wake', `☀️ ${s.name} dibangunkan.`));
      return null;
    }
    case 'cuddle': {
      const e = guard(needHatched, needAwake);
      if (e) return e;
      const left = cooldownLeft(s, 'cuddle', now);
      if (left) return waitMsg(left);
      setCooldown(s, 'cuddle', now, 20);
      applyEffect(s, { happiness: 8 });
      s.totals.cuddles += 1;
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
      if (s.stats.energy < item.energy + 5) return `${s.name} terlalu lelah.`;
      const key = `play:${a.item}`;
      const left = cooldownLeft(s, key, now);
      if (left) return waitMsg(left);
      setCooldown(s, key, now, item.cooldown);
      const sickPenalty = s.sick ? 0.5 : 1;
      applyEffect(s, {
        energy: -item.energy,
        happiness: item.happiness * sickPenalty,
        hunger: -item.hunger,
        hygiene: item.hygiene,
      });
      s.coins += Math.max(1, Math.round(item.coins * sickPenalty));
      s.totals.plays += 1;
      grantXp(s, item.xp, now, events);
      track(s, 'play', now, events);
      events.push(ev(now, 'play', `🎪 ${s.name} bermain di ${item.label.toLowerCase()}.`));
      return null;
    }
    case 'minigame': {
      const e = guard(needHatched, needAwake);
      if (e) return e;
      const score = Math.floor(Number(a.score));
      if (!Number.isFinite(score) || score < 0) return 'Skor tidak valid.';
      if (s.stats.energy < 15) return `${s.name} terlalu lelah.`;
      const left = cooldownLeft(s, 'minigame', now);
      if (left) return waitMsg(left);
      const sc = Math.min(score, 60);
      setCooldown(s, 'minigame', now, 120);
      applyEffect(s, { energy: -10, happiness: Math.min(25, sc), hunger: -4 });
      s.coins += Math.min(12, Math.floor(sc / 2));
      s.totals.minigames += 1;
      grantXp(s, 4 + Math.floor(sc / 3), now, events);
      track(s, 'minigame', now, events);
      events.push(ev(now, 'minigame', `⭐ Tangkap Bintang: skor ${sc}.`));
      return null;
    }
    case 'chat': {
      const text = typeof a.text === 'string' ? a.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
      if (!text) return 'Ketik sesuatu dulu.';
      if (text.length > 160) return 'Pesannya terlalu panjang (maks. 160 huruf).';
      out.said = text;
      if (s.stage === 'egg') { out.reply = '(Telurnya bergetar pelan… sepertinya ia mendengarmu.)'; return null; }
      if (s.sleeping) { out.reply = `Zzz… (${s.name} mengigau pelan)`; return null; }
      const world = { FOODS, PLAYGROUND, QUESTS, hour: gameHour(s, now), rand: () => rand(s), cleanName };
      out.reply = chat.reply(s, text, world).reply;
      if (!cooldownLeft(s, 'chat', now)) { // hadiah hanya tiap 30 detik agar tidak bisa di-spam
        setCooldown(s, 'chat', now, 30);
        applyEffect(s, { happiness: 3 });
        s.totals.chats += 1;
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
      s.treasure = null;
      s.totals.treasures += 1;
      grantXp(s, 2, now, events);
      track(s, 'treasure', now, events);
      return null;
    }
    case 'buy': {
      const it = own(COSMETICS, a.item);
      if (!it) return 'Barang tidak dikenal.';
      if (s.inventory.includes(a.item)) return 'Sudah dimiliki.';
      if (s.level < it.unlock) return `${it.label} terbuka di level ${it.unlock}.`;
      if (s.coins < it.cost) return 'Koin tidak cukup.';
      s.coins -= it.cost;
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
  if (!error) checkAchievements(s, now, events);
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

module.exports = {
  CONFIG, FOODS, PLAYGROUND, COSMETICS, QUESTS, QUEST_BONUS, ACHIEVEMENTS, SPECIES, STAT_KEYS, MEDICINE_COST, MIN, HOUR,
  createPet, advance, perform, migrate, gameHour, effectiveStreak, dateKey, levelForXp, xpForLevel, stageFor, careAverage, cleanName,
};

return module.exports;
})();
