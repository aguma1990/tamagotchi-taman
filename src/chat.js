'use strict';
/**
 * Otak percakapan peliharaan — berbasis aturan, 100% lokal & deterministik (RNG dari state).
 * Balasan bergantung pada suasana hati, statistik, level, waktu taman, dan nama pemilik yang diingat.
 */

const norm = (t) =>
  t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Cocokkan kata/frasa utuh (bukan potongan di tengah kata). */
const has = (t, ...words) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(t));

const FLAVOR = { mochi: ' Nyaa~', bubu: ' Hehe.', leafy: ' 🌱', babi: ' Oink!', trenggiling: ' Krk~', pika: ' Zzt!' };

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
const FAVORITE = { mochi: 'kue, apalagi yang manis banget 🍰', bubu: 'susu segar, glek glek glek 🥛', leafy: 'apel yang renyah 🍎', babi: 'burger, nyam nyam nyam! 🍔', trenggiling: 'air putih dingin, segar banget 💧', pika: 'apel merah yang manis, bikin listriknya penuh ⚡🍎' };

function moodOf(s) {
  if (s.sleeping) return 'sleep';
  const st = s.stats;
  if (s.sick) return 'sick';
  if (st.hunger < 25) return 'hungry';
  if (st.thirst < 25) return 'thirsty';
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

  // ---- topik dunia: cuaca, tamu, album, latihan, watak, keluarga, acara ----
  if (has(t, 'cuaca', 'hujan', 'panas', 'pelangi', 'mendung', 'badai', 'petir', 'cerah', 'berawan')) {
    const wx = {
      cerah: 'Cerah banget hari ini, cocok buat main di luar! ☀️',
      berawan: 'Agak berawan, tapi adem. ⛅',
      hujan: 'Lagi hujan! Seru sih main hujan-hujanan, tapi aku jadi kotor. 🌧️',
      badai: 'Badai nih, petirnya bikin deg-degan… peluk aku dong! ⛈️',
      pelangi: 'Lihat pelangi itu! Katanya ada harta di ujungnya. 🌈',
    };
    const wet = W.weather === 'hujan' || W.weather === 'badai';
    if (wet && s.house?.owned) return out(s.house.inside ? 'Di luar hujan, tapi aku aman dan hangat di rumah hewanku. 🐾' : 'Hujan! Aku mau masuk rumah hewanku dulu ya. 🐾');
    if (wet) return out('Aku kehujanan! Badanku mulai lemas… tolong belikan rumah di Toko supaya aku bisa berteduh. 🥶');
    return out(wx[W.weather] || wx.cerah);
  }
  if (has(t, 'rumah', 'berteduh', 'rumahku')) {
    if (!s.house?.owned) return out('Aku belum punya rumah hewan. Kalau hujan aku kehujanan lho… belikan di Toko → Rumah ya. 🥺');
    return out(s.house.inside ? 'Aku lagi meringkuk di rumah hewanku, nyaman banget! Ketuk rumahnya kalau mau mengajakku keluar.' : 'Rumah hewanku imut! Kalau hujan aku langsung berteduh ke sana. 🐾');
  }
  if (has(t, 'toko', 'belanja', 'beli')) {
    return out(`Toko di ujung taman buka terus! Kamu punya ${s.coins} koin. Aku suka lihat kamu belanja. 🛍️`);
  }
  if (has(t, 'tamu', 'kedatangan', 'pengunjung')) {
    if (s.visitor) return out(`Lihat! ada ${W.C.VISITORS[s.visitor.kind].label.toLowerCase()} ${W.C.VISITORS[s.visitor.kind].emoji} di taman. Ayo sapa!`);
    return out(`Belum ada tamu sekarang. Tamu sering mampir, kamu sudah menyapa ${s.totals.visitors} kali.`);
  }
  if (has(t, 'album', 'stiker', 'koleksi')) {
    const have = Object.keys(s.album).length, all = Object.keys(W.C.STICKERS).length;
    return out(`Album stikerku: ${have} dari ${all}. ${have < all ? 'Sapa tamu & cari harta karun buat nambah!' : 'Lengkap! Kamu hebat!'}`);
  }
  if (has(t, 'latihan', 'berlatih', 'keterampilan', 'skill')) {
    const [name, v] = Object.entries(s.skills).sort((a, b) => b[1].lv - a[1].lv)[0];
    return out(v.lv > 0 ? `Aku paling jago ${W.C.SKILLS[name].label.toLowerCase()} (level ${v.lv})! Latihan di tab Latihan yuk.` : 'Aku belum pernah latihan. Yuk coba di tab Latihan!');
  }
  if (has(t, 'sifat', 'watak', 'kepribadian', 'karakter')) {
    const tr = s.trait && W.C.TRAITS[s.trait];
    return out(tr ? `Aku ini ${tr.label.toLowerCase()} ${tr.emoji}. ${tr.desc}` : 'Wataku masih terbentuk. Tunggu aku remaja ya!');
  }
  if (has(t, 'keluarga', 'generasi', 'pensiun', 'lansia', 'anak cucu')) {
    if (s.stage === 'elder') return out('Aku sudah lansia… kalau mau, aku bisa pensiun dan mewariskan telur baru. Lihat tab Koleksi.');
    return out(s.family.length ? `Keluargaku sudah ${s.family.length} generasi sebelumnya. Aku generasi ke-${s.generation}!` : `Aku generasi ke-${s.generation}. Nanti kalau sudah tua aku bisa pensiun dan mewariskan telur.`);
  }
  if (has(t, 'acara', 'libur', 'hari raya', 'spesial', 'ulang tahun', 'ultah')) {
    return out(W.event ? `Hari ini ${W.event.label} ${W.event.emoji}! Jangan lupa ambil hadiah hari spesial.` : 'Hari ini biasa aja, tapi tiap hari bareng kamu itu spesial.');
  }
  if (has(t, 'tidak suka', 'benci makan', 'makanan tidak enak')) {
    return out(s.prefs.known.hate ? `Aku nggak suka ${W.FOODS[s.prefs.hate].label.toLowerCase()} ${W.FOODS[s.prefs.hate].emoji}… kurang enak.` : 'Entah ya, belum ketahuan. Coba kasih aku macam-macam makanan.');
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
  if (has(t, 'makanan favorit', 'suka apa', 'favorit')) {
    if (s.prefs.known.fav) return out(`Makanan favoritku ${W.FOODS[s.prefs.fav].label.toLowerCase()} ${W.FOODS[s.prefs.fav].emoji}! Enak banget.`);
    return out('Hmm, aku sendiri belum yakin. Coba kasih aku macam-macam, nanti ketahuan favoritku. 😋');
  }
  if (has(t, 'haus', 'minum', 'dahaga', 'air', 'tenggorokan')) {
    if (st.thirst < 30) return out(`Iya, aku haus banget! Tinggal ${Math.round(st.thirst)}%. Minum dong 💧`);
    if (st.thirst < 70) return out('Lumayan haus sih… seteguk air putih enak nih.');
    return out(`Aku nggak haus (${Math.round(st.thirst)}%). Makasih udah nanya!`);
  }
  if (has(t, 'lapar', 'laper', 'makan', 'kenyang', 'ngemil', 'makanan')) {
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
      thirsty: `Tenggorokanku kering… hausku ${Math.round(st.thirst)}%.`,
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
    const away = W.now - (s.memory?.interact || W.now);
    const last = s.memory?.play && W.now - s.memory.play.t < 6 * 3600e3 ? W.PLAYGROUND[s.memory.play.item]?.label.toLowerCase() : null;
    const base = away > 6 * 3600e3
      ? `${you}! Lama banget nggak ketemu, aku kangen! Selamat ${p}!`
      : last && W.rand() < 0.6
        ? `Halo ${you}! Tadi aku seru banget main di ${last}. Selamat ${p}!`
        : pick([`Halo ${you}! Selamat ${p}!`, `Hai hai ${you}! Lagi ${p} nih di taman.`, `Eh, ${you} datang! Selamat ${p}!`]);
    const add = { hungry: ' Aku lapar nih…', thirsty: ' Aku haus nih…', tired: ' Aku ngantuk sih…', dirty: ' Aku agak kotor…', sick: ' Aku kurang sehat…', sad: ' Aku agak murung…', happy: ' Aku lagi senang! 😄', neutral: '' }[mood];
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
