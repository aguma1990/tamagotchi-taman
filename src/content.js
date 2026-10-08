'use strict';
/** Data konten permainan (murni, tanpa logika state): dekorasi, stiker, tamu, mini-game, keterampilan, acara. */

const MIN = 60 * 1000;

// ---------- Dekorasi taman & tema ----------
const TALL = ['T1', 'T2', 'T3']; // 3 tempat tinggi di barisan belakang
const DECOR = Object.freeze({
  kotakpos: { label: 'Kotak Pos', emoji: '📮', cost: 35, unlock: 1, slots: ['F1', 'F2', 'F4', 'F5'] },
  bunga: { label: 'Bunga Matahari', emoji: '🌻', cost: 20, unlock: 1, slots: ['F1', 'F2', 'F4', 'F5'] },
  semak: { label: 'Semak Bunga', emoji: '🌸', cost: 30, unlock: 1, slots: ['F1', 'F2', 'F3', 'F4'] },
  pohon: { label: 'Pohon Rindang', emoji: '🌳', cost: 60, unlock: 2, slots: TALL },
  bangku: { label: 'Bangku Taman', emoji: '🪑', cost: 45, unlock: 2, slots: ['F1', 'F2', 'F3', 'F4'] },
  lampu: { label: 'Lampu Taman', emoji: '🏮', cost: 50, unlock: 2, slots: ['P1'] },
  balon: { label: 'Balon Udara', emoji: '🎈', cost: 40, unlock: 3, slots: ['S1'] },
  payung: { label: 'Payung Pantai', emoji: '⛱️', cost: 55, unlock: 3, slots: TALL },
  tenda: { label: 'Tenda Piknik', emoji: '⛺', cost: 90, unlock: 4, slots: TALL },
  kincir: { label: 'Kincir Angin', emoji: '🌀', cost: 110, unlock: 5, slots: TALL },
});
const DECOR_SLOTS = Object.freeze(['T1', 'T2', 'T3', 'P1', 'F1', 'F2', 'F3', 'F4', 'F5', 'S1']);
/** Posisi aman tempat harta karun muncul (tidak menimpa kolam, kotak pasir, dll). */
const TREASURE_SPOTS = Object.freeze([200, 560, 610, 660, 700]);

// Rumah peliharaan: harus dibeli. Melindungi dari hujan, dan otomatis dipakai tidur.
const HOUSE = Object.freeze({
  label: 'Rumah Peliharaan', emoji: '🏠', cost: 80, unlock: 2,
  perks: ['Berteduh otomatis saat hujan atau badai', 'Tidur lebih nyenyak (+30% pulih energi)', 'Bisa masuk/keluar sendiri kapan saja'],
});
// Tanpa rumah, hujan/badai langsung menurunkan kesehatan (poin per jam-game).
const RAIN = Object.freeze({ hujan: 45, badai: 90 });

const THEMES = Object.freeze({
  default: { label: 'Hijau Asri', emoji: '🌿', cost: 0, unlock: 1 },
  sakura: { label: 'Taman Sakura', emoji: '🌸', cost: 80, unlock: 2 },
  gugur: { label: 'Musim Gugur', emoji: '🍂', cost: 80, unlock: 2 },
  salju: { label: 'Negeri Salju', emoji: '❄️', cost: 120, unlock: 4 },
});

// ---------- Stiker (album koleksi) ----------
const STICKERS = Object.freeze({
  kupu: { emoji: '🦋', label: 'Kupu-kupu', rarity: 'umum', hint: 'Tamu di taman' },
  burung: { emoji: '🐦', label: 'Burung Kecil', rarity: 'umum', hint: 'Tamu di taman' },
  kelinci: { emoji: '🐇', label: 'Kelinci', rarity: 'tidak umum', hint: 'Tamu di taman' },
  kucing: { emoji: '🐈', label: 'Kucing Liar', rarity: 'tidak umum', hint: 'Tamu di taman' },
  rubah: { emoji: '🦊', label: 'Rubah', rarity: 'langka', hint: 'Tamu langka' },
  hantu: { emoji: '🦉', label: 'Burung Hantu', rarity: 'langka', hint: 'Tamu yang hanya datang malam hari' },
  unicorn: { emoji: '🦄', label: 'Unicorn', rarity: 'legendaris', hint: 'Tamu sangat langka' },
  harta: { emoji: '🗝️', label: 'Kunci Harta', rarity: 'umum', hint: 'Kadang ada di harta karun' },
  pelangi: { emoji: '🌈', label: 'Pelangi', rarity: 'tidak umum', hint: 'Harta di ujung pelangi' },
  bunga: { emoji: '🌼', label: 'Bunga Liar', rarity: 'umum', hint: 'Kotak keberuntungan harian' },
  bintang: { emoji: '🌠', label: 'Bintang Jatuh', rarity: 'tidak umum', hint: 'Pecahkan rekor mini-game' },
  kue: { emoji: '🎂', label: 'Kue Ulang Tahun', rarity: 'tidak umum', hint: 'Hari ulang tahun peliharaan' },
  perayaan: { emoji: '🎊', label: 'Perayaan', rarity: 'tidak umum', hint: 'Hari spesial & hari raya' },
  mahkota: { emoji: '👑', label: 'Mahkota Warisan', rarity: 'langka', hint: 'Pensiunkan peliharaan lansia' },
  berlian: { emoji: '💎', label: 'Berlian', rarity: 'langka', hint: 'Hadiah mingguan' },
  api: { emoji: '🔥', label: 'Api Semangat', rarity: 'tidak umum', hint: 'Streak harian 7 hari' },
});
/** Peluang stiker dari harta karun & kotak keberuntungan. */
const STICKER_DROPS = Object.freeze({ kupu: 10, burung: 10, bunga: 10, harta: 9, kelinci: 5, kucing: 4, bintang: 3, rubah: 1.5, hantu: 1, unicorn: 0.25 });
const ALBUM_REWARDS = Object.freeze([
  { count: 4, coins: 15 },
  { count: 8, coins: 30 },
  { count: 12, coins: 60 },
  { count: Object.keys(STICKERS).length, coins: 120 },
]);

// ---------- Tamu taman ----------
const VISITORS = Object.freeze({
  kupu: { emoji: '🦋', label: 'Kupu-kupu', weight: 30, coins: [1, 3] },
  burung: { emoji: '🐦', label: 'Burung Kecil', weight: 30, coins: [1, 3] },
  kelinci: { emoji: '🐇', label: 'Kelinci', weight: 18, coins: [2, 4] },
  kucing: { emoji: '🐈', label: 'Kucing Liar', weight: 14, coins: [2, 5] },
  rubah: { emoji: '🦊', label: 'Rubah', weight: 6, coins: [4, 8] },
  hantu: { emoji: '🦉', label: 'Burung Hantu', weight: 5, coins: [4, 8], night: true },
  unicorn: { emoji: '🦄', label: 'Unicorn', weight: 1.5, coins: [10, 15] },
});

// ---------- Mini-game ----------
const MINIGAMES = Object.freeze({
  stars: { label: 'Tangkap Bintang', icon: '⭐', desc: 'Ketuk bintang yang jatuh. 🌟 emas bernilai 3.' },
  memory: { label: 'Pasangan Memori', icon: '🃏', desc: 'Cocokkan semua pasangan kartu sebelum waktu habis.' },
  food: { label: 'Tangkap Makanan', icon: '🍎', desc: 'Geser keranjang, tangkap makanan enak, hindari yang busuk.' },
  rhythm: { label: 'Irama Ketuk', icon: '🎵', desc: 'Ketuk jalur saat not menyentuh garis.' },
});
const MINIGAME_MAX = 60;
const PLAY_COOLDOWN = 30; // detik: jeda main wahana & mini-game
const MORPH_COST = 15; // koin untuk mengganti jenis karakter (ganti nama gratis)
const RECORD_BONUS = 3;

// ---------- Keterampilan ----------
const SKILLS = Object.freeze({
  lari: { label: 'Lari', icon: '🏃', perk: 'Hemat energi saat bermain (−5% per level)' },
  pintar: { label: 'Pintar', icon: '🧠', perk: 'XP bertambah (+6% per level)' },
  tangguh: { label: 'Tangguh', icon: '💪', perk: 'Lebih awet & tahan sakit (−3% kebutuhan, −8% risiko sakit per level)' },
});
const SKILL_MAX = 10;
const TRAIN = Object.freeze({ energy: 12, cooldown: 180 });
const skillNeed = (lv) => 3 + 2 * lv; // latihan yang dibutuhkan untuk naik dari level `lv`

// ---------- Kepribadian ----------
const TRAITS = Object.freeze({
  seimbang: { label: 'Seimbang', emoji: '⚖️', desc: 'Tidak condong ke mana pun.' },
  manja: { label: 'Manja', emoji: '🥰', desc: 'Lebih senang dipeluk dan diajak ngobrol.' },
  petualang: { label: 'Petualang', emoji: '🧭', desc: 'Hemat energi dan lebih banyak koin saat bermain.' },
  rapi: { label: 'Rapi', emoji: '🧼', desc: 'Lebih awet bersih.' },
  rakus: { label: 'Rakus', emoji: '🍗', desc: 'Makanan lebih mengenyangkan, tapi lebih cepat lapar.' },
});
const PREF_FOODS = Object.freeze(['bubur', 'apel', 'burger', 'kue']);

// ---------- Cuaca ----------
const WEATHERS = Object.freeze({
  cerah: { label: 'Cerah', emoji: '☀️' },
  berawan: { label: 'Berawan', emoji: '⛅' },
  hujan: { label: 'Hujan', emoji: '🌧️' },
  badai: { label: 'Badai', emoji: '⛈️' },
  pelangi: { label: 'Pelangi', emoji: '🌈' },
});
const WEATHER_SLOT_MS = 20 * MIN;

// ---------- Hari spesial ----------
const HOLIDAYS = Object.freeze([
  { id: 'tahunbaru', md: ['01-01'], emoji: '🎆', label: 'Tahun Baru', reward: 15 },
  { id: 'valentine', md: ['02-14'], emoji: '💝', label: 'Hari Kasih Sayang', reward: 12 },
  { id: 'kemerdekaan', md: ['08-17'], emoji: '🇮🇩', label: 'Hari Kemerdekaan', reward: 20 },
  { id: 'halloween', md: ['10-31'], emoji: '🎃', label: 'Halloween', reward: 15 },
  { id: 'natal', md: ['12-24', '12-25'], emoji: '🎄', label: 'Natal', reward: 20 },
]);

/** Tanggal Hijriah (kalender Umm al-Qura, bisa berbeda ±1 hari dari penetapan resmi). */
function hijri(ms) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    const r = { y: get('year'), m: get('month'), d: get('day') };
    return Number.isFinite(r.m) && Number.isFinite(r.d) ? r : null;
  } catch {
    return null;
  }
}

/** Hari raya yang jatuh pada tanggal `ms` (waktu setempat), atau null. */
function holidayOn(ms) {
  const d = new Date(ms);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fixed = HOLIDAYS.find((h) => h.md.includes(md));
  if (fixed) return { ...fixed };
  const h = hijri(ms);
  if (!h) return null;
  if (h.m === 10 && h.d <= 2) return { id: 'idulfitri', emoji: '🕌', label: 'Idul Fitri', reward: 30 };
  if (h.m === 12 && h.d === 10) return { id: 'iduladha', emoji: '🐑', label: 'Idul Adha', reward: 20 };
  if (h.m === 1 && h.d === 1) return { id: 'tahunbaruislam', emoji: '🌙', label: 'Tahun Baru Islam', reward: 15 };
  if (h.m === 9) return { id: 'ramadhan', emoji: '🌙', label: 'Bulan Ramadhan', reward: 8 };
  return null;
}

/** Kunci minggu ISO (waktu setempat), mis. "2026-W41". */
function weekKey(ms) {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Hash string → [0,1) (FNV-1a), untuk hasil acak yang dapat diulang dari id/waktu. */
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

module.exports = {
  DECOR, DECOR_SLOTS, TREASURE_SPOTS, THEMES, HOUSE, RAIN, STICKERS, STICKER_DROPS, ALBUM_REWARDS, VISITORS, MINIGAMES, MINIGAME_MAX, RECORD_BONUS, PLAY_COOLDOWN, MORPH_COST,
  SKILLS, SKILL_MAX, TRAIN, skillNeed, TRAITS, PREF_FOODS, WEATHERS, WEATHER_SLOT_MS, HOLIDAYS,
  hijri, holidayOn, weekKey, hash01,
};
