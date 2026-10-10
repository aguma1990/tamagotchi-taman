// Kartu peliharaan (PNG 720×960) untuk dibagikan ke teman.
import { Scene } from './scene.js';

const CW = 720;
const CH = 960;
const SCENE_W = 900;
const SCENE_H = 520;

const SPECIES = { mochi: 'Mochi', bubu: 'Bubu', leafy: 'Leafy', babi: 'Babi', trenggiling: 'Trenggiling', pika: 'Tikus Petir' };
const STAGE = { egg: 'Telur', baby: 'Bayi', child: 'Anak', teen: 'Remaja', adult: 'Dewasa', elder: 'Lansia' };
const GLOW = { mochi: '#ff9ec0', bubu: '#8cbcff', leafy: '#8fe39a', babi: '#ffb0b6', trenggiling: '#d9b58a', pika: '#ffe066' };
const GLOW_SHINY = { mochi: '#ffc78a', bubu: '#c9a8ff', leafy: '#8fe8e0', babi: '#fff0b3', trenggiling: '#9fb7e8', pika: '#ffb35c' };

function pill(c, text, x, y, color) {
  c.font = '600 24px system-ui, sans-serif';
  const w = c.measureText(text).width + 36;
  c.fillStyle = color;
  c.beginPath(); c.roundRect(x - w / 2, y - 22, w, 44, 22); c.fill();
  c.fillStyle = '#1d1633'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, y + 1);
  return w;
}

/** @returns {Promise<Blob>} */
export async function makeCard(pet, cfg, { url = '' } = {}) {
  // potret peliharaan di kanvas tersembunyi (resolusi 2×)
  const tmp = document.createElement('canvas');
  tmp.width = SCENE_W * 2;
  tmp.height = SCENE_H * 2;
  const sc = new Scene(tmp, { headless: true });
  sc.setPet({ ...pet, sleeping: false, sick: false, poop: 0 });
  sc.x = 450; sc.y = 470;
  sc.renderPortrait();

  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const c = cv.getContext('2d');

  // latar
  const g = c.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#1b1f55'); g.addColorStop(0.55, '#3b2a73'); g.addColorStop(1, '#0d1024');
  c.fillStyle = g; c.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 70; i++) {
    c.globalAlpha = 0.25 + ((i * 37) % 60) / 100;
    c.fillStyle = '#fff';
    c.beginPath(); c.arc((i * 211) % CW, (i * 97) % 520, 0.6 + ((i * 13) % 14) / 10, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  const glowCol = (pet.shiny ? GLOW_SHINY : GLOW)[pet.species] || '#ff9ec0';
  const rg = c.createRadialGradient(CW / 2, 400, 20, CW / 2, 400, 340);
  rg.addColorStop(0, `${glowCol}aa`); rg.addColorStop(1, `${glowCol}00`);
  c.fillStyle = rg; c.fillRect(0, 100, CW, 600);

  // judul
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '700 34px system-ui, sans-serif'; c.fillStyle = '#ffb86b';
  c.fillText('🐣 Tamagotchi Taman', CW / 2, 70);

  // potret
  c.drawImage(tmp, 600, 560, 600, 420, 60, 150, 600, 420);
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath(); c.ellipse(CW / 2, 585, 170, 22, 0, 0, 7); c.fill();

  // nama & info
  c.fillStyle = '#fff';
  c.font = '800 70px system-ui, sans-serif';
  c.fillText(pet.name, CW / 2, 660);
  c.font = '500 28px system-ui, sans-serif'; c.fillStyle = '#c8cdf5';
  c.fillText(`${SPECIES[pet.species] || pet.species} · ${STAGE[pet.stage] || pet.stage} · Generasi ${pet.generation || 1}`, CW / 2, 714);

  // lencana
  const badges = [];
  if (pet.shiny && pet.stage !== 'egg') badges.push(['✨ Warna Langka', '#fff0b3']);
  if (pet.form === 'radiant') badges.push(['🌟 Bersinar', '#ffe27a']);
  if (pet.trait && cfg.traits?.[pet.trait]) badges.push([`${cfg.traits[pet.trait].emoji} ${cfg.traits[pet.trait].label}`, '#b8e6ff']);
  const widths = badges.map(([t]) => { c.font = '600 24px system-ui'; return c.measureText(t).width + 36 + 14; });
  let x = CW / 2 - widths.reduce((a, b) => a + b, 0) / 2 + 7;
  badges.forEach(([t, col], i) => { pill(c, t, x + widths[i] / 2 - 7, 772, col); x += widths[i]; });

  // statistik
  const album = Object.keys(pet.album || {}).length, albumAll = Object.keys(cfg.stickers || {}).length;
  const boxes = [['Level', `${pet.level}`], ['Koin', `🪙 ${pet.coins}`], ['Album', `${album}/${albumAll}`], ['Keluarga', `${(pet.family || []).length + 1} gen`]];
  boxes.forEach(([label, val], i) => {
    const bx = 40 + i * 166, by = 820, bw = 150, bh = 84;
    c.fillStyle = 'rgba(255,255,255,.09)';
    c.beginPath(); c.roundRect(bx, by, bw, bh, 18); c.fill();
    c.fillStyle = '#9aa0cf'; c.font = '500 20px system-ui'; c.fillText(label, bx + bw / 2, by + 26);
    c.fillStyle = '#fff'; c.font = '700 30px system-ui'; c.fillText(val, bx + bw / 2, by + 58);
  });

  // kaki
  c.fillStyle = '#9aa0cf'; c.font = '500 22px system-ui';
  c.fillText(url ? `Rawat peliharaanmu juga! ${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : 'Rawat peliharaanmu juga!', CW / 2, 934);

  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), 'image/png'));
}
