// Tata letak taman (koordinat dunia 900×520). Dipakai adegan untuk menggambar DAN diuji otomatis agar tidak ada objek yang
// tumpang tindih. Kotak (box) = [kiri, atas, kanan, bawah] relatif terhadap (x, y) objek.
export const W = 900;
export const H = 520;
export const HORIZON = 330;
export const FENCE_TOP = 328;
export const FENCE_BOTTOM = 372;
export const BACK_Y = 372; // alas barisan belakang (di balik pagar)
export const FRONT_Y = 512; // alas barisan depan
export const LANE_Y = 410; // jalur jalan peliharaan
export const TREASURE_Y = 420; // alas peti (kotak ±24 lebar, 46 tinggi)

export const RIDES = {
  swing: { x: 105, y: 410, box: [-70, -140, 70, 6], label: 'Ayunan' },
  sandbox: { x: 300, y: 450, box: [-76, -52, 76, 18], label: 'Kotak Pasir' },
  ball: { x: 450, y: 440, box: [-55, -60, 55, 5], label: 'Bola' },
  pond: { x: 610, y: 455, box: [-96, -34, 96, 37], label: 'Kolam' },
  trampoline: { x: 810, y: 425, box: [-68, -32, 68, 8], label: 'Trampolin' },
};

export const BUILDINGS = {
  house: { x: 270, y: 372, box: [-70, -108, 70, 0], door: { x: 270, y: 372, w: 44 }, label: 'Rumah hewan' },
  shop: { x: 655, y: 372, box: [-75, -122, 75, 0], door: { x: 655, y: 372, w: 36 }, label: 'Toko' },
};

/** Ukuran akhir (setelah skala) tiap dekorasi. */
export const DECOR_SIZE = {
  pohon: { w: 104, h: 108, scale: 0.65 },
  kincir: { w: 92, h: 150, scale: 1 },
  tenda: { w: 100, h: 98, scale: 1 },
  payung: { w: 84, h: 114, scale: 1 },
  lampu: { w: 26, h: 116, scale: 1 },
  kotakpos: { w: 66, h: 78, scale: 1 },
  bunga: { w: 64, h: 70, scale: 1 },
  semak: { w: 92, h: 50, scale: 1 },
  bangku: { w: 92, h: 62, scale: 1 },
  balon: { w: 76, h: 116, scale: 1 },
};

/** Tempat dekorasi. layer: back (di balik pagar), front (di depan peliharaan), sky (di langit). */
export const SLOTS = {
  T1: { x: 416, y: BACK_Y, layer: 'back' },
  T2: { x: 522, y: BACK_Y, layer: 'back' },
  T3: { x: 788, y: BACK_Y, layer: 'back' },
  P1: { x: 868, y: BACK_Y, layer: 'back' },
  F1: { x: 60, y: FRONT_Y, layer: 'front' },
  F2: { x: 170, y: FRONT_Y, layer: 'front' },
  F3: { x: 450, y: FRONT_Y, layer: 'front' },
  F4: { x: 775, y: FRONT_Y, layer: 'front' },
  F5: { x: 858, y: FRONT_Y, layer: 'front' },
  S1: { x: 640, y: 130, layer: 'sky' },
};

export const abs = (o) => [o.x + o.box[0], o.y + o.box[1], o.x + o.box[2], o.y + o.box[3]];
export const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
export function itemBox(slotId, itemId) {
  const s = SLOTS[slotId], d = DECOR_SIZE[itemId];
  return [s.x - d.w / 2, s.y - d.h, s.x + d.w / 2, s.y];
}
