'use strict';
// Membuat ikon PNG (telur bermotif di latar gradasi) tanpa dependensi. Jalankan: npm run icons
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t));

/** Warna piksel pada koordinat satuan (0..1). null = transparan. */
function shade(u, v, { rounded, scale }) {
  if (rounded) { // sudut membulat
    const r = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    if (dx * dx + dy * dy > r * r) return null;
  }
  let col = mix([42, 47, 110], [88, 42, 110], (u + v) / 2); // gradasi latar
  const g = Math.hypot(u - 0.3, v - 0.25); // cahaya lembut
  col = mix(col, [120, 130, 220], Math.max(0, 0.35 - g) * 0.8);

  const x = (u - 0.5) / scale, y = (v - 0.55) / scale;
  const t = y / 0.34; // -1 (atas) .. 1 (bawah)
  if (Math.abs(t) < 1) {
    const halfW = 0.24 * Math.sqrt(1 - t * t) * (1 + 0.16 * t);
    if (Math.abs(x) < halfW) {
      col = mix([255, 246, 229], [255, 226, 200], (t + 1) / 2);
      for (const [sx, sy, r, c] of [[-0.08, -0.12, 0.05, [255, 150, 185]], [0.08, 0.02, 0.06, [255, 150, 185]], [-0.03, 0.15, 0.04, [160, 205, 255]], [0.1, -0.2, 0.035, [255, 209, 102]]]) {
        if (Math.hypot(x - sx, y - sy) < r) col = c;
      }
      if (Math.hypot(x + 0.1, y + 0.19) < 0.05) col = mix(col, [255, 255, 255], 0.8);
    }
  }
  return col;
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, opts);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (py * size + px) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; buf[i + 3] = Math.round((a / (SS * SS)) * 255); }
    }
  }
  return png(size, buf);
}

const dir = path.join(__dirname, '..', 'web', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon-192.png'), render(192, { rounded: true, scale: 1 }));
fs.writeFileSync(path.join(dir, 'icon-512.png'), render(512, { rounded: true, scale: 1 }));
fs.writeFileSync(path.join(dir, 'maskable-512.png'), render(512, { rounded: false, scale: 0.78 })); // zona aman
fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), render(180, { rounded: false, scale: 0.9 }));
console.log('ikon dibuat di web/icons');
