# 🐣 Tamagotchi Taman

Hewan peliharaan virtual yang berjalan 100% di PC/laptop Anda — tanpa internet, tanpa `npm install`.

## Versi HP / bagikan ke teman (PWA)

Folder `docs/` adalah **versi web mandiri**: seluruh game berjalan di browser HP, tanpa server. Peliharaan tersimpan di
perangkat masing-masing, waktu tetap berjalan saat aplikasi ditutup, dan bisa dipasang ke layar utama (bisa offline).

- Dibuat ulang dengan `npm run build:web` (otomatis juga saat `npm test`). Logika game sama persis dengan versi PC.
- Hosting gratis lewat GitHub Pages: unggah repo ini, lalu **Settings → Pages → Deploy from a branch → `main` / `/docs`**.
  Alamat: `https://<username>.github.io/<nama-repo>/`. Bagikan link itu ke teman.
- Pasang di HP: **iPhone** Safari → Bagikan → *Tambah ke Layar Utama*. **Android** Chrome → ⋮ → *Pasang aplikasi*
  (atau tombol 📲 Pasang di pojok atas).
- Data hanya ada di browser perangkat itu. Pakai **Statistik → Ekspor cadangan** untuk memindahkan ke HP lain atau berjaga-jaga
  bila data browser dibersihkan. Versi PC (folder `data/`) dan versi web punya peliharaan terpisah.

## Menjalankan

Butuh [Node.js](https://nodejs.org) 18+.

| Cara | Perintah |
|---|---|
| macOS | klik dua kali `start.command` |
| Windows | klik dua kali `start.bat` |
| Terminal | `npm start` lalu buka http://localhost:3777 |

Hentikan dengan `Ctrl+C` (state disimpan dulu).

## Energi

Tidur memulihkan energi dari kosong ke penuh dalam ±15 menit nyata (bangun otomatis di 100; bisa dibangunkan kapan saja). Cara cepat tanpa tidur: Jus Energi (+30), Susu Segar (+14), Apel gratis (+8).

## Kecepatan game

Semua proses (lapar, kantuk, pertumbuhan) berjalan 2× lebih cepat dari jam nyata. Ubah `speed` di `CONFIG` pada `src/engine.js` (1 = normal, 2 = default, 3 = lebih cepat lagi); tidak perlu menghapus data.

## Riwayat tetap ada walau laptop/service mati

- **Waktu tetap berjalan.** Saat service hidup lagi, game mensimulasikan menit-menit yang terlewat
  (maks. 7 hari). Saat ditinggal, peliharaan lapar 60% lebih lambat dan **tidak pernah mati** — paling parah ia
  lemah/sakit dan butuh dirawat.
- **Data di folder `data/`:**
  - `pet.json` — kondisi terkini (ditulis atomik: tulis → fsync → rename, tidak pernah setengah-tertulis)
  - `events.jsonl` — riwayat kejadian, append-only (tab *Riwayat*)
  - `samples.jsonl` — rekaman status tiap 15 menit (tab *Grafik*)
  - `backups/` — salinan per jam (48 terakhir); jika `pet.json` rusak, dipulihkan otomatis
- Cadangkan peliharaan dengan menyalin folder `data/`. Mulai ulang dari nol: hentikan game, hapus isi `data/`.

## Cara dapat koin 🪙

| Sumber | Koin |
|---|---|
| 🎪 Main di wahana taman | 1–4 per main (ada cooldown) |
| ⭐ Tangkap Bintang | sampai 12 per 30 detik |
| 💰 Harta karun di taman (muncul ±tiap 25 menit, ketuk) | 3–8 |
| 🎁 Hadiah harian + streak hari beruntun | 7–19 |
| 📋 Misi harian (3 misi/hari, ganti tiap tengah malam) | 4–12 per misi + bonus 10 bila semua selesai |
| 🚀 Naik level | 5 × level |
| 🏆 Prestasi (15 buah) | 5–80, sekali |

Koin dipakai untuk makanan, obat, dan **Toko** aksesori (kepala, wajah, leher — tampil langsung di peliharaan).
Pintasan keyboard: `M` makan, `B` mandi, `T` tidur/bangun, `P` peluk, `O` obat, `G` Tangkap Bintang.

## Ngobrol dengan peliharaan 💬

Tab **Obrolan**: ketik bebas atau pakai tombol cepat. Balasan sesuai suasana hati dan statusnya (lapar, ngantuk, sakit, senang…),
punya gaya bicara tiap jenis, dan peliharaan **mengingat namamu** — ketik `namaku Budi`. Bisa minta lelucon, cerita, info misi,
koin, atau ajak main. Berjalan 100% lokal (tanpa internet/AI luar). Riwayat obrolan tersimpan di `data/chat.jsonl`.
Ngobrol memberi +3 senang & XP (maks. sekali per 30 detik, anti-spam) dan menghitung untuk misi/prestasi.

## Fitur utama

- **6 jenis peliharaan** (Mochi, Bubu, Leafy, Babi, Trenggiling — yang bisa menggulung & berputar — dan Tikus Petir ⚡ berkaki-tangan dengan telinga panjang & ekor petir) dengan **warna langka ✨ (8%)**.
- **Siklus hidup:** Telur → Bayi → Anak → Remaja (terbentuk *watak*) → Dewasa → **Lansia** → **pensiun** ke Galeri Keluarga dan mewariskan
  **telur generasi berikutnya** (mewarisi setengah keterampilan; data akun seperti koin, aksesori, album tetap).
- **Kebutuhan:** kenyang, haus, senang, energi, bersih, sehat. Peliharaan bicara sendiri saat lapar/haus/ngantuk. Punya **makanan favorit & tidak suka**.
- **Ganti karakter** kapan saja (🪙 15; ganti nama gratis): jenis dan gaya bicara berubah, umur/level/status/keterampilan tetap.
- **Taman bermain** 5 wahana + **4 mini-game** (jeda main 30 detik) (Tangkap Bintang, Pasangan Memori, Tangkap Makanan, Irama Ketuk) dengan rekor & bonus.
- **Dunia yang hidup:** jam taman sendiri, **cuaca** (cerah, berawan, hujan + genangan, badai + petir, pelangi), **tamu taman** (kupu-kupu, kelinci,
  rubah, burung hantu malam, unicorn…), **hari spesial** (ulang tahun mingguan, Tahun Baru, Kemerdekaan, Natal, Halloween, Ramadhan, Idul Fitri…).
- **Koleksi:** album 16 stiker dengan hadiah milestone, kotak keberuntungan harian, tantangan mingguan, 25 prestasi.
- **Toko:** aksesori, **dekorasi taman** (10) dan **tema** (Sakura, Musim Gugur, Salju).
- **Latihan:** keterampilan Lari / Pintar / Tangguh (level 1–10) yang memberi keuntungan nyata.
- **Obrolan** lokal yang mengingat namamu, sesuai suasana hati, cuaca, dan kebiasaan.
- **Kartu peliharaan** PNG untuk dibagikan, musik latar generatif, efek suara, getar di HP.

## Fitur lanjutan

- **Toko berputar 🌟:** tiap hari ada **3 aksesori langka** (topi koboi, mahkota bunga, kacamata selam, kalung lonceng, medali, topi jerami) dan **2 promo diskon** 20–50%
  (aksesori, dekorasi, warna, atau isi rumah). Stok dan promo berganti tiap hari; barang yang dibeli tetap milikmu. Lihat tab Toko → *Hari ini*.
- **Isi rumah hewan:** bantal (tidur +15%), boneka (senang perlahan), lampu tidur (tidak takut gelap), karpet (kesehatan pulih perlahan), foto, dan bendera hias. Semua tampak di rumah.
- **Warna bulu 🖌️:** 5 warna (🪙40–50) dan **Pelangi Ajaib** (🪙160, level 6) yang berputar warna. Ganti kapan saja tanpa biaya setelah dibeli.
- **Telur keturunan 🥚:** saat dewasa, titipkan telur (🪙40). Saat peliharaan pensiun, telur menetas dan mewarisi **75% keterampilan** (bukan 50%), makanan favorit, warna,
  dan peluang warna langka lebih besar. Ada peluang 25% jenisnya berbeda dari induk. Lihat tab Koleksi.
- **Taman teman 🤝:** tombol 🤝 di atas membuat **kode taman** (tanpa koin/data pribadi) untuk dibagikan. Tempel kode teman untuk melihat tamannya (hanya lihat) dan dapat 🪙5
  (maks. 3 kunjungan/hari). Kode divalidasi ketat dan tidak butuh server.
- **Mini-game baru:** 🎣 Memancing dan 🏃 Lari Rintangan.
- **Pengingat 🔔:** notifikasi saat peliharaan lapar, haus, kotor, kelelahan, sakit, atau kehujanan. Bekerja **selama aplikasi masih terbuka di latar belakang**; push saat
  aplikasi ditutup total butuh server push yang sengaja tidak dipakai agar tetap lokal.
- **Cuaca khusus:** ❄️ *Salju* (di tema Negeri Salju, hujan menjadi salju; tanpa rumah kesehatan turun lebih pelan daripada hujan) dan 🌠 *Hujan Meteor* (malam hari;
  ketuk langit atau chip cuaca untuk membuat permohonan, hadiah koin & kadang stiker).

## Rumah, toko, dan taman yang hidup

- **Rumah hewan 🐾** (kandang kayu, 🪙 80, level 2) harus dibeli. **Tanpa rumah, hujan menurunkan kesehatan dengan cepat** (hujan ~45/jam-game, badai ~90) dan
  memperbesar risiko sakit. Dengan rumah, peliharaan **berteduh otomatis** saat hujan, **tidur di dalam** (energi pulih +30%), dan bisa
  dimasukkan/dikeluarkan dengan mengetuk rumah hewan. Saat ditinggal (offline) hujan tidak menurunkan kesehatan di bawah 35.
- **Toko 🛍️** selalu ada di taman. Setiap kali kamu membeli sesuatu (aksesori, dekorasi, tema, rumah) peliharaan **berjalan ke toko,
  masuk, lalu keluar membawa tas belanja**. Ketuk toko untuk membuka tab Toko.
- **Tata letak tanpa tumpang tindih:** posisi wahana, rumah, toko, dan tempat dekorasi didefinisikan di `public/layout.mjs` dan **diuji otomatis**
  (`test/layout.test.js`). Dekorasi menempati *slot*; bila slot penuh, dekorasi disimpan dulu.
- **Tampilan utama tetap:** taman bermain (dan kolom status) menempel di layar saat digulir; di HP bilah aksi menetap di bawah.
- **Lebih hidup:** burung melintas, kupu-kupu & kunang-kunang, rumput bergoyang, kilau air, bayangan mengikuti matahari, mata peliharaan
  mengikuti kursor, gerak santai (menoleh, menguap, duduk, mengendus, melambai), sapaan pagi/siang/sore/malam, dan suasana suara
  (kicau burung, jangkrik, hujan) lewat tombol 🎵.

## Karakter & kebutuhan

Enam jenis peliharaan (plus **Tikus Petir** ⚡): **Mochi** (kucing), **Bubu** (beruang), **Leafy** (tunas), **Babi** 🐷, dan **Trenggiling** 🌰 —
trenggiling bisa **menggulung jadi bola**: ia berguling saat berpindah tempat, main bola, dan berputar di tempat saat diketuk/dipeluk.

Status: kenyang, **haus** 💧, senang, energi, bersih, sehat. Saat lapar, haus, atau ngantuk peliharaan **bicara sendiri**
lewat gelembung ucapan (diulang tiap ±45 detik selama masih butuh). Air putih gratis; susu & jus juga menghilangkan haus.

## Cara bermain

- **Taman bermain:** ketuk wahana untuk mengajak bermain (dapat 🪙 koin & XP). Wahana baru terbuka seiring level:
  Ayunan & Bola (Lv 1) → Kotak Pasir (2) → Kolam (3) → Trampolin (5). Setiap wahana punya cooldown.
- **Rawat:** makan (bubur/apel gratis; susu, jus energi, burger, kue pakai koin — susu dan jus menambah energi), mandi, tidur, peluk, obat saat sakit.
- **Tangkap Bintang:** mini-game 20 detik untuk koin & kebahagiaan.
- **Tumbuh:** Telur → Bayi → Anak → Remaja → Dewasa. Perawatan yang konsisten membuat bentuk dewasa **Bersinar ✨**.
- Taman punya jam sendiri (bukan jam laptop): 1 hari game = 48 menit nyata. Atur `dayRealMinutes` di `src/engine.js`. Pratinjau: `?jam=22`.

## Arsitektur

```
src/content.js  tabel data (dekorasi, stiker, tamu, acara…)
src/engine.js   logika game murni & deterministik (tanpa I/O) — mudah dites
src/store.js    penyimpanan atomik, backup, pemulihan, log JSONL
src/game.js     menggabungkan engine + store, pemilik state
src/server.js   server HTTP (hanya 127.0.0.1), API JSON, file statis
web/            backend lokal & aset PWA; scripts/build-web.js → docs/
public/         UI: scene.js (canvas), minigame.js, app.js, style.css
test/           node --test
```

Praktik yang diterapkan: nol dependensi, bind hanya ke localhost, validasi Host/Origin/Content-Type
(anti DNS-rebinding & CSRF), batas ukuran body, CSP ketat, UI dirender dengan `textContent` (anti-XSS),
validasi semua aksi di server (klien tidak dipercaya), shutdown yang rapi, `prefers-reduced-motion`.

```bash
npm test      # 125 tes (engine, rumah & hujan, tata letak, generasi, persistensi, uji acak, server, versi web): engine, catch-up offline, persistensi, pemulihan backup
PORT=4000 npm start   # ganti port (opsional)
```
