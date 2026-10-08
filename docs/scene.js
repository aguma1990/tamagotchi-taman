// Adegan taman bermain: render canvas, AI jalan peliharaan, partikel.
import { W, H, HORIZON, RIDES, BUILDINGS, SLOTS, DECOR_SIZE, TREASURE_Y, LANE_Y, abs as absBox } from './layout.mjs';

const PALETTES = {
  mochi: { body: '#ffb3c7', light: '#ffe0e9', dark: '#f27ea1', accent: '#ff6f9c' },
  bubu: { body: '#9cc8ff', light: '#dcecff', dark: '#5e9be8', accent: '#3f7fd6' },
  leafy: { body: '#a6e6a1', light: '#e3f9df', dark: '#62c46b', accent: '#3fae56' },
  babi: { body: '#ffc2c4', light: '#ffe9e6', dark: '#f08c92', accent: '#e86a74' },
  trenggiling: { body: '#cfa97f', light: '#eddcc4', dark: '#8a6540', accent: '#6b4a2b' },
};

// Posisi wahana berasal dari layout.mjs (diuji agar tidak tumpang tindih). Kunci harus cocok dengan PLAYGROUND di server.
const HIT_R = { swing: 70, sandbox: 70, ball: 45, pond: 80, trampoline: 65 };
const SPOTS = Object.fromEntries(Object.entries(RIDES).map(([k, r]) => [k, { x: r.x, y: r.y, r: HIT_R[k], label: r.label }]));
const ease = (p) => p * p * (3 - 2 * p);

const SKY = [
  [0, '#0b1030', '#1b2457'],
  [5.5, '#2b2f6b', '#f09a7a'],
  [8, '#6fb8f5', '#cfeeff'],
  [16, '#6fb8f5', '#d9f1ff'],
  [18.5, '#5d4aa0', '#ff9a76'],
  [20.5, '#161a45', '#2b2f6b'],
  [24, '#0b1030', '#1b2457'],
];

const CONFETTI = ['#ff6b9d', '#ffd166', '#6ee7a8', '#7fd6ff', '#b79cff'];
const SWING_L = 108; // panjang tali ayunan
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (c1, c2, t) => {
  const a = hex(c1), b = hex(c2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
};

function skyAt(hour) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i];
    const [h1, t1, b1] = SKY[i + 1];
    if (hour >= h0 && hour <= h1) {
      const k = (hour - h0) / (h1 - h0);
      return { top: mix(t0, t1, k), bottom: mix(b0, b1, k) };
    }
  }
  return { top: SKY[0][1], bottom: SKY[0][2] };
}
function darkness(hour) {
  if (hour < 5.5 || hour >= 20.5) return 1;
  if (hour < 8) return 1 - (hour - 5.5) / 2.5;
  if (hour < 18.5) return 0;
  return (hour - 18.5) / 2;
}

export function moodOf(p) {
  if (!p) return 'neutral';
  if (p.stage === 'egg') return 'egg';
  if (p.sleeping) return 'sleep';
  const s = p.stats;
  if (p.sick) return 'sick';
  if (s.hunger < 25) return 'hungry';
  if (s.thirst < 25) return 'thirsty';
  if (s.energy < 20) return 'tired';
  if (s.hygiene < 25 || p.poop >= 3) return 'dirty';
  if (s.happiness < 30) return 'sad';
  if (s.happiness > 70 && s.hunger > 40) return 'happy';
  return 'neutral';
}
const SHINY = {
  mochi: { body: '#ffc78a', light: '#ffeacf', dark: '#f09a4a', accent: '#e07a1c' },
  bubu: { body: '#c9a8ff', light: '#ece0ff', dark: '#9a73e6', accent: '#7a4fd0' },
  leafy: { body: '#8fe8e0', light: '#dcfbf7', dark: '#4fc9bf', accent: '#2fa89f' },
  babi: { body: '#fff0b3', light: '#fffbe3', dark: '#f0c14b', accent: '#d9a21f' },
  trenggiling: { body: '#9fb7e8', light: '#dbe5fa', dark: '#6f86bf', accent: '#4a60a0' },
};
const palOf = (p) => (p.shiny ? SHINY[p.species] : PALETTES[p.species]) || PALETTES.mochi;

// Tema taman: [siang, malam] untuk tiap lapisan.
const THEME_COLORS = {
  default: { hill1: ['#8fd19e', '#2c5a58'], hill2: ['#6cc07f', '#244c4a'], g0: ['#7ed48b', '#2f6a55'], g1: ['#4fae67', '#1c4a3f'], blade: ['#5fbe74', '#2a6150'], fence: ['#f3e3c3', '#6a6a86'], dots: ['#fff', '#ffd6e0', '#fff3a8'] },
  sakura: { hill1: ['#b9dca6', '#34585a'], hill2: ['#9ccf9a', '#2a4c4c'], g0: ['#a5dc96', '#356a52'], g1: ['#7cc486', '#1f4a3c'], blade: ['#8fd08f', '#2c6350'], fence: ['#fbe3e8', '#7a6a86'], dots: ['#ffc8dc', '#ffe3ee', '#fff'] },
  gugur: { hill1: ['#d8b765', '#5a4a2c'], hill2: ['#c98f4a', '#4a3a24'], g0: ['#cdb56a', '#4f5a38'], g1: ['#a9954a', '#33401f'], blade: ['#c4a24a', '#4a5a30'], fence: ['#e8d3a8', '#6a6070'], dots: ['#ffb75e', '#e5703a', '#ffe08a'] },
  salju: { hill1: ['#e8f2fa', '#4a5878'], hill2: ['#d6e6f3', '#3f4c6c'], g0: ['#f3f8fc', '#52618a'], g1: ['#d9e7f3', '#3a4870'], blade: ['#c8dcec', '#46557c'], fence: ['#ffffff', '#8c96b4'], dots: ['#ffffff', '#dff0ff', '#cfe6ff'] },
};
const EVENT_COLORS = {
  kemerdekaan: ['#e8203a', '#ffffff'], natal: ['#d63a3a', '#2f9e5b'], halloween: ['#f08a1f', '#7a4fd0'], ramadhan: ['#2f9e5b', '#f2c94c'],
  idulfitri: ['#2f9e5b', '#f2c94c'], iduladha: ['#2f9e5b', '#f2c94c'], tahunbaruislam: ['#2f9e5b', '#f2c94c'], tahunbaru: ['#f2c94c', '#4a90e2'],
  valentine: ['#ff6b9d', '#e8203a'], ultah: ['#ff6b9d', '#4a90e2', '#f2c94c', '#6ee7a8'],
};
const CONFETTI_PETAL = ['#ffc8dc', '#ffb3cf', '#ffe3ee'];
const NEED_ICON = { hungry: '🍎', thirsty: '💧', tired: '💤', dirty: '🛁', sick: '💊', sad: '💭' };

export class Scene {
  constructor(canvas, { reducedMotion = false, headless = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.pet = null;
    this.t = 0;
    this.x = 450;
    this.y = 410;
    this.targetX = 450;
    this.facing = 1;
    this.idleTimer = 2;
    this.walking = false;
    this.activity = null; // {kind, until, start}
    this.eating = null; // {emoji, start, until}
    this.treasure = null; // {x, amount}
    this.curl = 0; // 0 = berdiri, 1 = menggulung jadi bola (trenggiling)
    this.rollAngle = 0;
    this.rollMode = false;
    this.spinUntil = 0;
    this.bubble = null; // {text, until}
    this.world = null; // {weather, event}
    this.theme = 'default';
    this.decor = []; // id dekorasi yang terpasang
    this.visitor = null; // {kind, x}
    this.training = null; // {kind, start, until, x0}
    this.cloud = 0; this.wet = 0; this.rb = 0; this.flash = 0; this.bolt = null;
    this.ambient = [];
    this.onThunder = null;
    this.headless = headless;
    this.house = { owned: false, inside: false, reason: null }; // dari status peliharaan
    this.decorSlots = {}; // id dekorasi → tempat
    this.depth = 1; // skala kedalaman (mengecil saat masuk bangunan)
    this.hidden = false; // peliharaan sedang di dalam bangunan
    this.inHouse = false; // peliharaan sudah berada di dalam rumah
    this.visit = null; // {building, phase, t0, ...} kunjungan ke toko/rumah
    this.carry = null; // tas belanja {emoji, item, until}
    this.cold = false; // kehujanan tanpa rumah
    this._firstSync = true;
    this.birds = []; // burung yang melintas (hiasan hidup)
    this.birdTimer = 4;
    this.idleAct = null; // gerak santai: look|hop|sit|yawn|sniff|wave
    this.actTimer = 3;
    this.lookX = 450; this.lookT = -99; // mata mengikuti kursor
    this._hour = 12;
    this._seenVisitor = null;
    this.bathing = null; // {start, until}
    this.blink = 0;
    this.blinkTimer = 3;
    this.particles = [];
    this.hover = null;
    this.getLocked = () => ({}); // (item) => {locked, label}
    this.getHour = null; // jam waktu-game (0-24)
    this.clouds = Array.from({ length: 9 }, () => ({ x: rand(0, W), y: rand(30, 170), s: rand(0.7, 1.4), v: rand(4, 10) }));
    this.stars = Array.from({ length: 60 }, () => ({ x: rand(0, W), y: rand(0, HORIZON - 40), r: rand(0.6, 1.6), p: rand(0, 6) }));
    this.ballX = SPOTS.ball.x;
    this.lastStage = null;
    if (headless) this.k = canvas.width / W;
    else {
      this._resize();
      new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
    }
  }

  _resize() {
    const cssW = this.canvas.parentElement.clientWidth || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = cssW / W;
    this.canvas.style.height = `${cssW * (H / W)}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssW * (H / W) * dpr);
    this.k = this.canvas.width / W;
    try { this.draw(); } catch { /* belum siap */ } // jangan biarkan kanvas kosong sampai frame berikutnya (mencegah kedip)
  }

  setPet(pet) {
    const prev = this.pet;
    this.pet = pet;
    if (pet && prev && prev.stage === 'egg' && pet.stage !== 'egg') this.burst(this.x, this.y - 50, 'spark', 24);
    if (pet && prev && prev.stage !== pet.stage && prev.stage !== 'egg') this.burst(this.x, this.y - 60, 'spark', 30);
    if (pet && prev && prev.species !== pet.species && pet.stage !== 'egg') { this.burst(this.x, this.y - 60, 'spark', 28); this.rollMode = false; this.curl = 0; this.training = null; }
    if (pet?.sleeping && !prev?.sleeping) this.activity = null;
  }

  toWorld(evt) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((evt.clientX - r.left) / r.width) * W, y: ((evt.clientY - r.top) / r.height) * H };
  }

  hitTest(pt) {
    const vp = this._visitorPos();
    if (vp && Math.hypot(pt.x - vp.x, pt.y - (vp.y - 14)) < 40) return { type: 'visitor' };
    if (this.treasure && Math.hypot(pt.x - this.treasure.x, pt.y - (TREASURE_Y - 20)) < 44) return { type: 'treasure' };
    if (!this.hidden && this.pet && this.pet.stage !== 'egg' && Math.hypot(pt.x - this.x, pt.y - (this.y - 45)) < 55) return { type: 'pet' };
    if (!this.hidden && this.pet?.stage === 'egg' && Math.hypot(pt.x - this.x, pt.y - (this.y - 45)) < 45) return { type: 'pet' };
    for (const [key, b] of Object.entries(BUILDINGS)) {
      const [x0, y0, x1, y1] = absBox(b);
      if (pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1 + 6) return { type: 'building', key };
    }
    for (const [key, s] of Object.entries(SPOTS)) {
      if (Math.hypot(pt.x - s.x, (pt.y - (s.y - 30)) * 1.2) < s.r) return { type: 'item', key, spot: s };
    }
    return null;
  }

  goPlay(kind) {
    const s = SPOTS[kind];
    if (!s) return;
    this.activity = { kind, start: this.t, until: this.t + 4.2, arrived: false };
    this.targetX = kind === 'ball' ? s.x - 60 : s.x;
  }

  /** Peliharaan menoleh ke arah x (mis. kursor) selama beberapa detik. */
  lookAt(x) { this.lookX = x; this.lookT = this.t; }

  _cancelActs() {
    this.activity = null; this.eating = null; this.bathing = null; this.training = null;
    this.walking = false; this.spinUntil = 0; this.rollMode = false; this.curl = 0;
  }

  /** Peliharaan berjalan ke toko, masuk, lalu keluar membawa tas belanja. */
  shopVisit(itemEmoji = '🛍️') {
    if (!this.pet || this.pet.stage === 'egg' || this.hidden || this.visit || this.house.inside) return false;
    this._cancelActs();
    this.visit = { building: 'shop', phase: 'walk', t0: this.t, stayFor: 1.5, carry: { bag: '🛍️', item: itemEmoji } };
    return true;
  }

  _startHouse(dir, instant = false) {
    this._cancelActs();
    const door = BUILDINGS.house.door;
    if (dir === 'enter') {
      if (instant) { this.hidden = true; this.inHouse = true; this.x = door.x; this.y = door.y + 10; this.depth = 0.72; this.visit = { building: 'house', phase: 'inside-hold', t0: this.t }; return; }
      this.visit = { building: 'house', phase: 'walk', t0: this.t, hold: true };
    } else {
      this.hidden = false; this.x = door.x; this.y = door.y + 10; this.depth = 0.72;
      this.visit = { building: 'house', phase: 'exit', t0: this.t, leave: true };
    }
  }

  /** Sinkronkan animasi dengan status rumah dari server (masuk saat hujan/tidur, keluar saat reda). */
  _syncHouse() {
    const want = !!this.house.inside && !!this.pet && this.pet.stage !== 'egg';
    if (this._firstSync && this.pet) {
      this._firstSync = false;
      if (want) this._startHouse('enter', true);
      return;
    }
    if (want && !this.inHouse && !this.visit) this._startHouse('enter');
    else if (!want && this.inHouse && this.visit?.phase === 'inside-hold') this._startHouse('exit');
  }

  _updateVisit(dt) {
    const v = this.visit, door = BUILDINGS[v.building].door, k = this.t - v.t0, inY = door.y + 10;
    switch (v.phase) {
      case 'walk': {
        const dx = door.x - this.x;
        if (Math.abs(dx) > 6) { this._walk(dx, dt, 150); return; }
        this.walking = false; this.facing = 1; v.phase = 'enter'; v.t0 = this.t;
        break;
      }
      case 'enter': {
        const p = Math.min(1, k / 0.8);
        this.walking = true;
        this.y = lerp(LANE_Y, inY, ease(p));
        this.depth = lerp(1, 0.72, ease(p));
        if (p >= 1) {
          this.walking = false; this.hidden = true; v.t0 = this.t;
          v.phase = v.hold ? 'inside-hold' : 'inside';
          if (v.hold) this.inHouse = true;
          else this.burst(door.x, door.y - 40, 'spark', 6);
        }
        break;
      }
      case 'inside':
        if (k >= v.stayFor) { this.hidden = false; v.phase = 'exit'; v.t0 = this.t; }
        break;
      case 'inside-hold':
        break; // menunggu _syncHouse
      case 'exit': {
        const p = Math.min(1, k / 0.8);
        this.walking = true;
        this.y = lerp(inY, LANE_Y, ease(p));
        this.depth = lerp(0.72, 1, ease(p));
        if (p >= 1) {
          this.y = LANE_Y; this.depth = 1; this.walking = false; v.t0 = this.t; v.phase = 'return';
          this.targetX = door.x + (Math.random() < 0.5 ? -80 : 80);
          if (v.carry) { this.carry = { ...v.carry, until: this.t + 3.2 }; this.burst(this.x, this.y - 70, 'heart', 4); }
          if (v.leave) this.inHouse = false;
        }
        break;
      }
      case 'return': {
        const dx = this.targetX - this.x;
        if (Math.abs(dx) > 5 && k < 2.6) this._walk(dx, dt, 60); else this.walking = false;
        if (k >= (v.carry ? 3.2 : 0.4)) { this.visit = null; this.idleTimer = 1; this.carry = null; }
        break;
      }
      default: this.visit = null;
    }
  }

  /** Mulai animasi latihan: lari | pintar | tangguh. */
  train(kind) {
    if (!this.pet || this.pet.sleeping || this.pet.stage === 'egg') return;
    this.activity = null; this.eating = null; this.bathing = null; this.walking = false; this.spinUntil = 0; this.rollMode = false;
    this.training = { kind, start: this.t, until: this.t + 3.4, x0: this.x };
  }

  /** Gambar hanya peliharaan (untuk kartu bagikan). */
  renderPortrait() {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.clearRect(0, 0, W, H);
    if (this.pet) this._pet(c);
  }

  /** Trenggiling menggulung dan berputar di tempat. */
  petSpin() {
    if (!this.pet || this.pet.sleeping || this.pet.stage === 'egg') return;
    if (this.pet.species === 'trenggiling') { this.spinUntil = this.t + 1.7; this.activity = null; this.walking = false; }
  }

  say(text, secs) {
    if (!this.pet || this.pet.sleeping || this.pet.stage === 'egg') return;
    this.bubble = { text, until: this.t + (secs ?? Math.min(9, 2.8 + text.length / 16)) };
  }

  _wrap(c, text, maxW, maxLines = 4) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`; }
    return lines;
  }

  eat(emoji) {
    this.activity = null;
    this.walking = false;
    this.eating = { emoji, start: this.t, until: this.t + 3.2 };
    this._lastBite = -1;
  }

  bathe() {
    this.activity = null;
    this.eating = null;
    this.walking = false;
    this.bathing = { start: this.t, until: this.t + 3.8 };
  }

  burst(x, y, kind, n = 8) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = kind === 'spark' ? rand(40, 130) : kind === 'confetti' ? rand(90, 240) : kind === 'coin' ? rand(40, 120) : rand(20, 70);
      this.particles.push({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'heart' ? 50 : kind === 'confetti' || kind === 'coin' ? 130 : 20),
        life: 0, max: rand(0.9, 1.6), size: rand(10, 18), color: CONFETTI[i % CONFETTI.length], rot: rand(0, 6),
      });
    }
  }
  confetti(x, y, n = 24) { this.burst(x, y, 'confetti', n); }
  float(text, x = this.x, y = this.y - 110, color = '#fff') {
    this.particles.push({ kind: 'text', text, x, y, vx: 0, vy: -34, life: 0, max: 1.8, color });
  }

  // ---------- update ----------
  update(dt) {
    this.t += dt;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 120) c.x = -140;
    }
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.14;
      this.blinkTimer = rand(2.5, 6);
    }
    if (this.blink > 0) this.blink -= dt;

    const p = this.pet;
    this.cold = !!p && p.stage !== 'egg' && !this.house.inside && (this.world?.weather === 'hujan' || this.world?.weather === 'badai') && !this.hidden;
    this._syncHouse();
    if (this.visit) this._updateVisit(dt);
    else if (p && p.stage !== 'egg' && !p.sleeping) this._updatePetMotion(dt);
    else {
      this.walking = false;
      this.training = null;
      this.eating = null; // animasi tidak boleh macet bila peliharaan tertidur
      this.bathing = null;
    }

    this._updateWorld(dt);
    // peliharaan langka berkilau
    if (p?.shiny && p.stage !== 'egg' && !this.reduced && Math.random() < dt * 1.6) {
      this.particles.push({ kind: 'spark', x: this.x + rand(-44, 44), y: this.y - rand(10, 90), vx: 0, vy: -14, life: 0, max: 1.1, size: rand(8, 13) });
    }
    // trenggiling: menggulung jadi bola saat berguling, berputar, atau main bola
    const pang = p?.species === 'trenggiling' && p.stage !== 'egg' && !p.sleeping;
    const spinning = this.t < this.spinUntil;
    const ballPlay = this.activity?.kind === 'ball' && this.activity.arrived;
    const want = pang && (spinning || this.rollMode || ballPlay) ? 1 : 0;
    this.curl += (want - this.curl) * Math.min(1, dt * 9);
    if (Math.abs(this.curl - want) < 0.01) this.curl = want;
    if (!pang) { this.curl = 0; this.rollMode = false; }
    const rad = 36 * this._stageScale(p || { stage: 'adult' });
    if (spinning) this.rollAngle += 13 * dt;
    else if (this.walking && this.rollMode) this.rollAngle += this.facing * (170 / rad) * dt;
    else if (ballPlay) this.rollAngle += 5 * dt;

    // bola menggelinding kembali
    this.ballX += (SPOTS.ball.x - this.ballX) * Math.min(1, dt * 1.2);

    for (const q of this.particles) {
      q.life += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind !== 'text') q.vy += (q.kind === 'sand' || q.kind === 'drop' ? 220 : q.kind === 'coin' || q.kind === 'confetti' ? 320 : 10) * dt;
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
    if (p?.sleeping && Math.random() < dt * 0.6) this.particles.push({ kind: 'zzz', x: this.x + 30, y: this.y - 100, vx: 10, vy: -22, life: 0, max: 2.4 });
  }

  _updateWorld(dt) {
    // burung melintas saat cerah di siang hari
    this.birdTimer -= dt;
    const day = this._hour > 6 && this._hour < 18.5;
    if (this.birdTimer <= 0) {
      this.birdTimer = rand(9, 20);
      if (day && !this.reduced && (this.world?.weather ?? 'cerah') !== 'badai' && this.birds.length < 3) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.birds.push({ x: dir > 0 ? -30 : W + 30, y: rand(50, 170), vx: dir * rand(45, 80), ph: rand(0, 6), s: rand(0.8, 1.2) });
        if (Math.random() < 0.5) this.birds.push({ x: dir > 0 ? -60 : W + 60, y: rand(60, 180), vx: dir * rand(45, 80), ph: rand(0, 6), s: rand(0.7, 1) });
      }
    }
    for (const b of this.birds) { b.x += b.vx * dt; b.y += Math.sin(this.t * 1.5 + b.ph) * 8 * dt; }
    this.birds = this.birds.filter((b) => b.x > -80 && b.x < W + 80);
    // peliharaan menyadari tamu baru: menoleh dan melambai
    const vk = this.visitor ? `${this.visitor.kind}:${this.visitor.until}` : null;
    if (vk && vk !== this._seenVisitor && this.pet && this.pet.stage !== 'egg' && !this.pet.sleeping && !this.hidden && !this.visit && !this.activity) {
      this.lookAt(this.visitor.x); this.facing = this.visitor.x > this.x ? 1 : -1;
      this.idleAct = { kind: 'wave', start: this.t, until: this.t + 2 };
    }
    this._seenVisitor = vk;
    const wx = this.world?.weather || 'cerah';
    const wet = wx === 'hujan' || wx === 'badai';
    const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
    this.cloud = ease(this.cloud, wx === 'cerah' ? 0 : wx === 'pelangi' ? 0.25 : 1, 0.7);
    this.wet = ease(this.wet, wet ? 1 : 0, wet ? 0.5 : 0.05);
    this.rb = ease(this.rb, wx === 'pelangi' ? 1 : 0, 0.5);
    if (wx === 'badai' && Math.random() < dt * 0.14) { this.flash = 1; this.bolt = { x: rand(120, 780), seed: Math.random() }; this.onThunder?.(); }
    this.flash = Math.max(0, this.flash - dt * 2.4);

    const rate = this.reduced ? 0.4 : 1;
    if (wet && this.ambient.length < (wx === 'badai' ? 420 : 260)) {
      for (let i = 0, n = Math.round((wx === 'badai' ? 260 : 150) * dt * rate); i < n; i++) {
        this.ambient.push({ kind: 'rain', x: rand(-60, W), y: -12, vx: -90 - (wx === 'badai' ? 70 : 0), vy: rand(560, 760), len: rand(10, 17) });
      }
    }
    const th = this.theme;
    if ((th === 'sakura' || th === 'gugur' || th === 'salju') && this.ambient.length < 90 && Math.random() < dt * 7 * rate) {
      this.ambient.push({ kind: th, x: rand(-20, W), y: -10, vx: rand(-20, 20), vy: rand(30, th === 'salju' ? 55 : 45), ph: rand(0, 6), r: rand(2.4, 4.6), c: Math.floor(rand(0, 3)) });
    }
    if (this.world?.event?.id === 'tahunbaru' && !this.reduced && Math.random() < dt * 0.7) {
      this.burst(rand(150, 750), rand(60, 190), 'spark', 14);
    }
    for (const q of this.ambient) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.kind !== 'rain') { q.x += Math.sin(this.t * 1.6 + q.ph) * 24 * dt; }
    }
    this.ambient = this.ambient.filter((q) => q.y < H + 20 && q.x > -80 && q.x < W + 80);
    // tamu unicorn berkilau
    const vp = this._visitorPos();
    if (vp && this.visitor.kind === 'unicorn' && Math.random() < dt * 6) this.particles.push({ kind: 'spark', x: vp.x, y: vp.y - 20, vx: rand(-10, 10), vy: rand(-20, 0), life: 0, max: 0.9, size: 11 });
  }

  _updatePetMotion(dt) {
    if (this.training) {
      const tr = this.training, k = this.t - tr.start;
      this.walking = false;
      if (this.t >= tr.until) { this.training = null; this.idleTimer = 1.2; this.targetX = this.x; this.burst(this.x, this.y - 70, 'spark', 10); return; }
      if (tr.kind === 'lari') {
        this.x = tr.x0 + Math.sin(k * 3.4) * 95;
        this.facing = Math.cos(k * 3.4) >= 0 ? 1 : -1;
        this.walking = true;
        if (Math.random() < dt * 16) this.particles.push({ kind: 'sand', x: this.x - this.facing * 20, y: this.y - 4, vx: -this.facing * rand(15, 50), vy: rand(-60, -20), life: 0, max: 0.5 });
      }
      return;
    }
    if (this.bathing) {
      this.walking = false;
      const b = this.bathing;
      if (this.t >= b.until) {
        this.bathing = null;
        this.idleTimer = 1.5;
        this.burst(this.x, this.y - 70, 'spark', 16);
      } else {
        if (Math.random() < dt * 28) this.particles.push({ kind: 'drop', x: this.x + rand(-34, 34), y: this.y - 190, vx: 0, vy: rand(180, 260), life: 0, max: 0.55 });
        if (Math.random() < dt * 9) this.particles.push({ kind: 'bubble', x: this.x + rand(-50, 50), y: this.y - rand(20, 70), vx: rand(-8, 8), vy: rand(-45, -25), life: 0, max: rand(1.2, 2), size: rand(4, 10) });
      }
      return;
    }
    if (this.eating) {
      this.walking = false;
      if (this.t >= this.eating.until) {
        this.eating = null;
        this.idleTimer = 1.5;
        this.burst(this.x, this.y - 60, 'heart', 3);
      } else if (this.t - this.eating.start > 0.6 && Math.random() < dt * 9) {
        this.particles.push({ kind: 'sand', x: this.x + rand(-10, 10), y: this.y - 34, vx: rand(-40, 40), vy: rand(-60, -20), life: 0, max: 0.7 });
      }
      return;
    }
    const act = this.activity;
    if (act) {
      const spot = SPOTS[act.kind];
      const dx = this.targetX - this.x;
      if (!act.arrived && Math.abs(dx) > 6) {
        this._walk(dx, dt, 130);
        act.until = this.t + 4.2;
        return;
      }
      if (!act.arrived) {
        act.arrived = true;
        act.start = this.t;
        act.until = this.t + 4.2;
        this.burst(this.x, this.y - 40, 'heart', 3);
      }
      this.walking = false;
      const k = this.t - act.start;
      if (this.t >= act.until) {
        this.activity = null;
        this.idleTimer = 1.5;
        return;
      }
      if (act.kind === 'ball') {
        this.ballX = spot.x + Math.sin(k * 3) * 28 + 20;
        if (Math.sin(k * 6) > 0.95) this.burst(this.ballX, spot.y - 6, 'spark', 1);
      }
      if (act.kind === 'sandbox') {
        const sv = this._shovel(k);
        if (sv.rising && sv.phase > 0.55 && Math.random() < dt * 26) {
          this.particles.push({ kind: 'sand', x: sv.tx, y: sv.ty, vx: rand(35, 95), vy: rand(-150, -95), life: 0, max: 0.8 });
        }
      }
      if (act.kind === 'pond' && k > 0.3 && Math.random() < dt * 26) {
        const d = Math.random() < 0.5 ? -1 : 1, sc = this._stageScale(this.pet);
        this.particles.push({ kind: 'drop', x: this.x + d * 52 * sc, y: SPOTS.pond.y + 14 - 44 * sc, vx: d * rand(25, 95), vy: rand(-190, -100), life: 0, max: 0.75 });
      }
      if (act.kind === 'trampoline') {
        const tr = this._tramp(k);
        if (tr.p > 0.5 && this._tPeak !== tr.idx) {
          this._tPeak = tr.idx;
          if (tr.h > 40) this.burst(this.x, this.y - tr.h - 95 * this._stageScale(this.pet), 'spark', 3);
        }
      }
      return;
    }
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.targetX = rand(90, W - 90);
      this.idleTimer = rand(3, 7);
      this.rollMode = this.pet.species === 'trenggiling' && Math.abs(this.targetX - this.x) > 140 && Math.random() < 0.6;
    }
    const dx = this.targetX - this.x;
    if (Math.abs(dx) > 5) {
      if (this.rollMode) {
        if (this.curl > 0.7) this._walk(dx, dt, 170); else this.walking = false; // menggulung dulu, baru berguling
      } else this._walk(dx, dt, 38);
    } else {
      this.walking = false; this.rollMode = false;
      this._idleBehavior(dt);
    }
    if (this.walking) this.idleAct = null;
  }

  /** Gerak santai saat berdiri diam: menoleh, melompat, duduk, menguap, mengendus, melambai. */
  _idleBehavior(dt) {
    if (this.idleAct) { if (this.t >= this.idleAct.until) this.idleAct = null; return; }
    if (this.cold || this.reduced) return;
    this.actTimer -= dt;
    if (this.actTimer > 0) return;
    this.actTimer = rand(3.5, 8);
    const mood = moodOf(this.pet);
    const pool = mood === 'tired' || mood === 'sleep' ? ['yawn', 'yawn', 'sit', 'look']
      : mood === 'happy' ? ['hop', 'wave', 'look', 'hop', 'sniff']
        : ['look', 'sniff', 'sit', 'hop', 'yawn', 'wave'];
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const dur = { look: 2.2, hop: 1.3, sit: 3.2, yawn: 1.9, sniff: 1.8, wave: 1.8 }[kind];
    if (kind === 'look') this.lookT = -99;
    this.idleAct = { kind, start: this.t, until: this.t + dur };
    if (kind === 'wave' || kind === 'sniff') this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  _walk(dx, dt, speed) {
    this.walking = true;
    this.facing = dx > 0 ? 1 : -1;
    const slow = this.pet?.stage === 'elder' ? 0.72 : 1; // lansia berjalan pelan
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * slow * dt);
  }

  // ---------- draw ----------
  draw() {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    const now = new Date();
    const forced = Number(new URLSearchParams(location.search).get('jam'));
    const hour = Number.isFinite(forced) && forced >= 0 && forced < 24 && location.search.includes('jam')
      ? forced : (this.getHour ? this.getHour() : now.getHours() + now.getMinutes() / 60);
    const dark = darkness(hour);
    this._hour = hour;
    const th = THEME_COLORS[this.theme] || THEME_COLORS.default;
    this._sky(c, hour, dark);
    this._rainbow(c, dark);
    this._birdsDraw(c, dark);
    this._decorLayer(c, dark, 'sky');
    this._hills(c, dark, th);
    this._ground(c, dark, th);
    this._paths(c, dark);
    this._puddles(c, dark);
    this._decorLayer(c, dark, 'back');
    this._buildings(c, dark);
    this._fence(c, dark, th);
    this._eventDecor(c, dark);
    this._items(c);
    this._poop(c);
    this._treasureChest(c);
    this._visitorDraw(c);
    this._critters(c, dark);
    if (this.pet) this._pet(c);
    this._decorLayer(c, dark, 'front');
    this._sandboxFront(c);
    this._particles(c);
    this._weatherFront(c);
    if (this.pet?.sleeping) {
      c.fillStyle = 'rgba(8,10,40,.35)';
      c.fillRect(0, 0, W, H);
    } else if (dark > 0.2) {
      c.fillStyle = `rgba(10,14,50,${0.22 * dark})`;
      c.fillRect(0, 0, W, H);
    }
    if (this.cloud > 0.05) { // mendung: suasana sedikit lebih redup
      c.fillStyle = `rgba(40,52,84,${0.16 * this.cloud})`;
      c.fillRect(0, 0, W, H);
    }
    if (this.flash > 0.02) { c.fillStyle = `rgba(255,255,255,${this.flash * 0.45})`; c.fillRect(0, 0, W, H); }
  }

  _sky(c, hour, dark) {
    const { top, bottom } = skyAt(hour);
    const g = c.createLinearGradient(0, 0, 0, HORIZON + 40);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, W, HORIZON + 40);

    if (dark > 0.05) {
      for (const s of this.stars) {
        c.globalAlpha = dark * (0.5 + 0.5 * Math.sin(this.t * 1.5 + s.p)) * (1 - this.cloud * 0.85);
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, 7);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // matahari / bulan mengikuti jam nyata
    const dayK = (hour - 6) / 12;
    const night = hour >= 18 || hour < 6;
    const k = night ? ((hour + 6) % 24) / 12 : dayK;
    const cx = lerp(80, W - 80, Math.min(1, Math.max(0, k)));
    const cy = HORIZON - 40 - Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 220;
    if (night) {
      c.fillStyle = '#f4f1de';
      c.beginPath(); c.arc(cx, cy, 26, 0, 7); c.fill();
      c.fillStyle = skyAt(hour).top;
      c.beginPath(); c.arc(cx + 10, cy - 6, 24, 0, 7); c.fill();
    } else {
      c.globalAlpha = 1 - this.cloud * 0.8; // matahari redup saat mendung
      const glow = c.createRadialGradient(cx, cy, 10, cx, cy, 90);
      glow.addColorStop(0, 'rgba(255,230,150,.7)');
      glow.addColorStop(1, 'rgba(255,230,150,0)');
      c.fillStyle = glow;
      c.fillRect(cx - 100, cy - 100, 200, 200);
      c.fillStyle = '#ffe27a';
      c.beginPath(); c.arc(cx, cy, 30, 0, 7); c.fill();
      c.globalAlpha = 1;
    }
    // awan (lebih banyak & kelabu saat mendung)
    this.clouds.forEach((cl, i) => {
      const vis = i < 5 ? 1 : this.cloud;
      if (vis < 0.02) return;
      c.globalAlpha = (0.85 - dark * 0.55) * vis;
      c.fillStyle = mix('#ffffff', '#7d869c', this.cloud * 0.85);
      c.beginPath();
      c.ellipse(cl.x, cl.y, 46 * cl.s, 16 * cl.s, 0, 0, 7);
      c.ellipse(cl.x - 26 * cl.s, cl.y + 4, 28 * cl.s, 12 * cl.s, 0, 0, 7);
      c.ellipse(cl.x + 28 * cl.s, cl.y + 5, 30 * cl.s, 12 * cl.s, 0, 0, 7);
      c.fill();
    });
    c.globalAlpha = 1;
  }

  _rainbow(c, dark) {
    if (this.rb < 0.02) return;
    const cols = ['#ff5a5a', '#ffa14a', '#ffe14a', '#6bdc6b', '#5ab8ff', '#8a6bff'];
    c.save();
    c.lineWidth = 13;
    cols.forEach((col, i) => {
      c.globalAlpha = 0.42 * this.rb * (1 - dark * 0.6);
      c.strokeStyle = col;
      c.beginPath(); c.arc(W * 0.56, HORIZON + 80, 370 - i * 12.5, Math.PI, 0); c.stroke();
    });
    c.restore();
  }

  _hills(c, dark, th) {
    const col = (a, b) => mix(a, b, dark);
    c.fillStyle = col(th.hill1[0], th.hill1[1]);
    c.beginPath();
    c.moveTo(0, HORIZON);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, HORIZON - 50 - Math.sin(x / 130) * 26);
    c.lineTo(W, HORIZON + 10); c.lineTo(0, HORIZON + 10); c.fill();
    c.fillStyle = col(th.hill2[0], th.hill2[1]);
    c.beginPath();
    c.moveTo(0, HORIZON);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, HORIZON - 20 - Math.sin(x / 90 + 2) * 16);
    c.lineTo(W, HORIZON + 10); c.lineTo(0, HORIZON + 10); c.fill();
  }

  _ground(c, dark, th) {
    const g = c.createLinearGradient(0, HORIZON - 10, 0, H);
    g.addColorStop(0, mix(th.g0[0], th.g0[1], dark));
    g.addColorStop(1, mix(th.g1[0], th.g1[1], dark));
    c.fillStyle = g;
    c.fillRect(0, HORIZON - 10, W, H - HORIZON + 10);
    c.strokeStyle = mix(th.blade[0], th.blade[1], dark);
    c.lineWidth = 2;
    const wind = (this.world?.weather === 'badai' ? 3.2 : this.world?.weather === 'hujan' ? 1.8 : 1) * (this.reduced ? 0.3 : 1);
    for (let i = 0; i < 70; i++) {
      const x = (i * 137) % W, y = HORIZON + 20 + ((i * 53) % (H - HORIZON - 20));
      const sw = Math.sin(this.t * 1.6 + x * 0.05 + y * 0.03) * 2.2 * wind;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3 + sw, y - 8); c.moveTo(x, y); c.lineTo(x + 3 + sw, y - 9); c.stroke();
    }
    // bunga
    for (let i = 0; i < 14; i++) {
      const x = (i * 211 + 40) % W, y = HORIZON + 30 + ((i * 97) % (H - HORIZON - 50));
      c.fillStyle = th.dots[i % 3];
      c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill();
    }
  }

  _fence(c, dark, th) {
    c.fillStyle = mix(th.fence[0], th.fence[1], dark);
    const y = HORIZON + 2;
    const gates = Object.values(BUILDINGS).map((b) => [b.door.x - 28, b.door.x + 28]).sort((p, q) => p[0] - q[0]);
    const inGate = (x0, x1) => gates.some(([g0, g1]) => x1 > g0 && x0 < g1);
    let cursor = 0;
    for (const [g0, g1] of [...gates, [W, W]]) { // palang antar gerbang
      c.fillRect(cursor, y + 14, g0 - cursor, 6);
      c.fillRect(cursor, y + 30, g0 - cursor, 5);
      cursor = g1;
    }
    for (let x = 10; x < W; x += 46) {
      if (inGate(x, x + 16)) continue;
      c.beginPath();
      c.moveTo(x, y + 40); c.lineTo(x, y + 6); c.lineTo(x + 8, y - 4); c.lineTo(x + 16, y + 6); c.lineTo(x + 16, y + 40);
      c.fill();
    }
    c.fillStyle = mix('#d9c39a', '#6a6a86', dark); // tiang gerbang
    for (const [g0, g1] of gates) for (const gx of [g0 - 4, g1 - 2]) { c.fillRect(gx, y - 8, 7, 50); c.beginPath(); c.arc(gx + 3.5, y - 8, 5, Math.PI, 0); c.fill(); }
  }

  _puddles(c, dark) {
    if (this.wet < 0.03) return;
    const spots = [[150, 440, 46], [400, 488, 58], [570, 428, 38], [770, 486, 54], [265, 506, 42], [880, 436, 30]];
    const raining = (this.world?.weather === 'hujan' || this.world?.weather === 'badai');
    spots.forEach(([x, y, r], i) => {
      c.fillStyle = `rgba(${150 - dark * 70},${200 - dark * 90},${240 - dark * 70},${0.5 * this.wet})`;
      c.beginPath(); c.ellipse(x, y, r * this.wet, r * 0.27 * this.wet, 0, 0, 7); c.fill();
      c.fillStyle = `rgba(255,255,255,${0.25 * this.wet})`;
      c.beginPath(); c.ellipse(x - r * 0.25, y - 2, r * 0.28 * this.wet, r * 0.06, 0, 0, 7); c.fill();
      if (raining) {
        const k = (this.t * 0.9 + i * 0.37) % 1;
        c.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.6})`; c.lineWidth = 1.4;
        c.beginPath(); c.ellipse(x + Math.sin(i * 7) * r * 0.3, y, r * 0.45 * k, r * 0.12 * k, 0, 0, 7); c.stroke();
      }
    });
  }

  /** Dekorasi yang dibeli & dipasang; tiap dekorasi punya tempat sendiri (lihat layout.mjs) sehingga tidak tumpang tindih. */
  _decorLayer(c, dark, layer) {
    for (const id of this.decor) {
      const pos = SLOTS[this.decorSlots?.[id]];
      const fn = this[`_dc_${id}`];
      if (!pos || pos.layer !== layer || !fn) continue;
      const sc = DECOR_SIZE[id]?.scale ?? 1;
      c.save(); c.translate(pos.x, pos.y); c.scale(sc, sc);
      fn.call(this, c, dark);
      c.restore();
    }
  }
  _dc_shadow(c, rx) { this._shadow(c, 0, 3, rx); }
  _dc_pohon(c, dark) {
    const th = this.theme;
    const leaf = { sakura: '#f6a9c4', gugur: '#e2893a', salju: '#e9f3fb' }[th] || '#4fae67';
    const leaf2 = { sakura: '#fbc6da', gugur: '#f2b04e', salju: '#ffffff' }[th] || '#6cc47a';
    this._dc_shadow(c, 54);
    c.fillStyle = mix('#8a5a34', '#3a2a22', dark); c.beginPath(); c.roundRect(-12, -78, 24, 82, 6); c.fill();
    c.fillStyle = mix(leaf, '#1f4a3f', dark * 0.7);
    for (const [dx, dy, r] of [[0, -112, 54], [-38, -86, 40], [38, -88, 42]]) { c.beginPath(); c.arc(dx, dy, r, 0, 7); c.fill(); }
    c.fillStyle = mix(leaf2, '#2a5a48', dark * 0.7);
    for (const [dx, dy, r] of [[-10, -122, 30], [22, -98, 22], [-36, -92, 18]]) { c.beginPath(); c.arc(dx, dy, r, 0, 7); c.fill(); }
  }
  _dc_bunga(c, dark) {
    for (const [dx, h] of [[-15, 52], [15, 40]]) {
      const sw = Math.sin(this.t * 1.5 + dx) * 2.5;
      c.strokeStyle = mix('#3fae56', '#1c4a3f', dark); c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(dx, 2); c.quadraticCurveTo(dx + sw, -h / 2, dx + sw * 1.4, -h); c.stroke();
      const fx = dx + sw * 1.4, fy = -h;
      c.fillStyle = mix('#ffd93d', '#8a7a2a', dark);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; c.beginPath(); c.ellipse(fx + Math.cos(a) * 10, fy + Math.sin(a) * 10, 6, 3.4, a, 0, 7); c.fill(); }
      c.fillStyle = '#7a4a22'; c.beginPath(); c.arc(fx, fy, 6, 0, 7); c.fill();
    }
  }
  _dc_semak(c, dark) {
    this._dc_shadow(c, 46);
    c.fillStyle = mix('#3f9a52', '#1c4a3f', dark);
    for (const [dx, dy, r] of [[-22, -14, 20], [0, -22, 24], [22, -14, 20], [0, -6, 22]]) { c.beginPath(); c.arc(dx, dy, r, 0, 7); c.fill(); }
    const cols = this.theme === 'sakura' ? ['#ffc8dc', '#fff'] : ['#ff7aa8', '#ffd1e0'];
    for (let i = 0; i < 7; i++) { c.fillStyle = cols[i % 2]; c.beginPath(); c.arc(-26 + i * 9, -18 - Math.sin(i * 2) * 10, 3.6, 0, 7); c.fill(); }
  }
  _dc_tenda(c, dark) {
    this._dc_shadow(c, 56);
    c.fillStyle = mix('#ff8a5b', '#6a4a5a', dark * 0.8);
    c.beginPath(); c.moveTo(-50, 0); c.lineTo(0, -76); c.lineTo(50, 0); c.closePath(); c.fill();
    c.fillStyle = mix('#fff4e6', '#8a8aa0', dark * 0.8);
    c.beginPath(); c.moveTo(-17, 0); c.lineTo(0, -76); c.lineTo(17, 0); c.closePath(); c.fill();
    c.fillStyle = mix('#7a3d2a', '#2a1a2a', dark);
    c.beginPath(); c.moveTo(-15, 0); c.lineTo(0, -40); c.lineTo(15, 0); c.closePath(); c.fill();
    c.strokeStyle = '#6b5b4b'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -76); c.lineTo(0, -94); c.stroke();
    c.fillStyle = '#ef476f'; c.beginPath(); c.moveTo(0, -94); c.lineTo(18 + Math.sin(this.t * 4) * 2, -89); c.lineTo(0, -84); c.fill();
  }
  _dc_payung(c, dark) {
    this._dc_shadow(c, 40);
    c.strokeStyle = mix('#8a5a34', '#3a2a22', dark); c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(2, -74); c.stroke();
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI + (i / 6) * Math.PI, a1 = Math.PI + ((i + 1) / 6) * Math.PI;
      c.fillStyle = mix(i % 2 ? '#ffffff' : '#ef476f', '#3a3a58', dark * 0.7);
      c.beginPath(); c.moveTo(2, -74); c.arc(2, -74, 40, a0, a1); c.closePath(); c.fill();
    }
  }
  _dc_kincir(c, dark) {
    this._dc_shadow(c, 36);
    c.fillStyle = mix('#f5e9d3', '#6a6a86', dark);
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 0); c.lineTo(11, -96); c.lineTo(-11, -96); c.closePath(); c.fill();
    c.fillStyle = mix('#c0392b', '#4a2030', dark);
    c.beginPath(); c.moveTo(-17, -94); c.lineTo(0, -116); c.lineTo(17, -94); c.closePath(); c.fill();
    c.save(); c.translate(0, -100); c.rotate(this.t * (this.world?.weather === 'badai' ? 2.4 : 0.9));
    c.fillStyle = mix('#ffffff', '#8a8aa0', dark);
    for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.fillRect(-4, -46, 8, 44); c.fillStyle = mix('#e8d7b8', '#7a7a90', dark); c.fillRect(-14, -46, 10, 30); c.fillStyle = mix('#ffffff', '#8a8aa0', dark); }
    c.fillStyle = '#6b5b4b'; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
    c.restore();
  }
  _dc_bangku(c, dark) {
    this._dc_shadow(c, 50);
    c.fillStyle = mix('#a8703c', '#3a2a22', dark);
    c.beginPath(); c.roundRect(-44, -56, 88, 9, 3); c.fill();
    c.beginPath(); c.roundRect(-44, -40, 88, 10, 3); c.fill();
    c.fillRect(-40, -30, 7, 30); c.fillRect(33, -30, 7, 30);
    c.fillRect(-40, -58, 7, 22); c.fillRect(33, -58, 7, 22);
  }
  _dc_balon(c, dark) {
    const bx = Math.sin(this.t * 0.22) * 26, by = Math.sin(this.t * 0.8) * 9;
    const cols = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'];
    for (let i = 0; i < 4; i++) {
      c.fillStyle = mix(cols[i], '#3a3a58', dark * 0.6);
      c.beginPath(); c.ellipse(bx, by, 36 * (1 - i * 0.22), 44, 0, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(bx - 12, by - 14, 8, 18, -0.4, 0, 7); c.fill();
    c.strokeStyle = '#6b5b4b'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(bx - 20, by + 36); c.lineTo(bx - 10, by + 56); c.moveTo(bx + 20, by + 36); c.lineTo(bx + 10, by + 56); c.stroke();
    c.fillStyle = mix('#a8703c', '#3a2a22', dark); c.beginPath(); c.roundRect(bx - 12, by + 56, 24, 15, 3); c.fill();
  }
  _dc_lampu(c, dark) {
    this._dc_shadow(c, 22);
    if (dark > 0.15) {
      const g = c.createRadialGradient(0, -88, 4, 0, -88, 95);
      g.addColorStop(0, `rgba(255,220,120,${0.65 * dark})`); g.addColorStop(1, 'rgba(255,220,120,0)');
      c.fillStyle = g; c.fillRect(-100, -190, 200, 200);
    }
    c.fillStyle = '#3a3a4a'; c.beginPath(); c.roundRect(-3.5, -80, 7, 82, 2); c.fill();
    c.beginPath(); c.roundRect(-11, -8, 22, 8, 3); c.fill();
    c.fillStyle = dark > 0.15 ? '#ffe9a3' : '#f2dca0'; c.beginPath(); c.roundRect(-11, -102, 22, 26, 6); c.fill();
    c.fillStyle = '#3a3a4a'; c.beginPath(); c.moveTo(-14, -102); c.lineTo(0, -114); c.lineTo(14, -102); c.closePath(); c.fill();
  }
  _dc_kotakpos(c, dark) {
    this._dc_shadow(c, 22);
    c.fillStyle = mix('#8a5a34', '#3a2a22', dark); c.fillRect(-3.5, -48, 7, 50);
    c.fillStyle = mix('#ef476f', '#6a2a3a', dark); c.beginPath(); c.roundRect(-21, -74, 42, 28, [14, 14, 4, 4]); c.fill();
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(-12, -60, 24, 3);
    c.fillStyle = '#ffd166'; c.fillRect(21, -70, 4, 16); c.fillRect(21, -70, 12, 7);
  }

  // ---------- jalan setapak, gerbang pagar, bangunan ----------
  _paths(c, dark) {
    for (const b of Object.values(BUILDINGS)) {
      const d = b.door;
      c.fillStyle = mix('#dcc79e', '#5a5240', dark * 0.7);
      c.beginPath(); c.moveTo(d.x - 20, d.y); c.lineTo(d.x + 20, d.y); c.lineTo(d.x + 44, LANE_Y + 14); c.lineTo(d.x - 44, LANE_Y + 14); c.closePath(); c.fill();
      c.fillStyle = mix('#c9b283', '#4c4535', dark * 0.7);
      for (let i = 0; i < 7; i++) { const yy = d.y + 6 + i * 6.5, w = 5 + i * 0.9; c.beginPath(); c.ellipse(d.x + ((i * 17) % 28) - 14, yy, w, 2.2, 0, 0, 7); c.fill(); }
    }
  }

  _buildings(c, dark) {
    this._house(c, dark);
    this._shop(c, dark);
    const ev = this.world?.event;
    if (ev) this._buildingOrnaments(c, ev, dark);
    for (const [key, b] of Object.entries(BUILDINGS)) {
      if (this.hover !== key) continue;
      const label = key === 'shop' ? 'Toko — ketuk untuk belanja' : this.house.owned ? (this.house.inside ? 'Rumah — ketuk untuk keluar' : 'Rumah — ketuk untuk masuk') : `Rumah dijual 🪙${this.houseCost ?? 80} — ketuk`;
      this._tag(c, b.x, b.y + b.box[1] - 14, label);
    }
  }

  _house(c, dark) {
    const { x, y } = BUILDINGS.house, owned = this.house.owned;
    const lit = dark > 0.35 || this.inHouse;
    c.save(); c.translate(x, y);
    this._shadow(c, 0, 5, 104);
    c.globalAlpha = owned ? 1 : 0.28;
    const wall = mix('#fdebd0', '#3a3a58', dark * 0.6), roof = mix('#c8553d', '#4a2a3a', dark * 0.6);
    c.fillStyle = wall; c.beginPath(); c.roundRect(-70, -90, 140, 90, 3); c.fill();
    c.strokeStyle = 'rgba(120,90,60,.12)'; c.lineWidth = 1;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-70, -80 + i * 14); c.lineTo(70, -80 + i * 14); c.stroke(); }
    // cerobong
    c.fillStyle = mix('#a8573f', '#3a2030', dark * 0.6); c.fillRect(38, -146, 20, 52);
    c.fillStyle = mix('#8a4630', '#2e1a28', dark * 0.6); c.fillRect(35, -150, 26, 7);
    // atap
    c.fillStyle = roof; c.beginPath(); c.moveTo(-92, -86); c.lineTo(0, -152); c.lineTo(92, -86); c.closePath(); c.fill();
    c.strokeStyle = mix('#a8412c', '#32202c', dark * 0.6); c.lineWidth = 1.5;
    for (let r = 0; r < 4; r++) { const yy = -96 - r * 14; const half = 78 - r * 17; c.beginPath(); c.moveTo(-half, yy); c.lineTo(half, yy); c.stroke(); }
    c.fillStyle = mix('#8a3a28', '#2a1a24', dark * 0.6); c.fillRect(-94, -88, 188, 5);
    // pintu
    c.fillStyle = mix('#8a5a34', '#3a2a22', dark * 0.6); c.beginPath(); c.roundRect(-18, -58, 36, 58, [18, 18, 0, 0]); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -58); c.lineTo(0, 0); c.stroke();
    c.fillStyle = '#ffd166'; c.beginPath(); c.arc(9, -26, 2.6, 0, 7); c.fill();
    c.fillStyle = mix('#c9b283', '#4c4535', dark * 0.6); c.fillRect(-24, -2, 48, 5);
    // jendela
    for (const wx of [-56, 28]) {
      c.fillStyle = mix('#8a6a4a', '#2e2230', dark * 0.5); c.fillRect(wx - 3, -75, 34, 36);
      c.fillStyle = lit ? '#ffe08a' : mix('#a8dcff', '#25305a', dark);
      c.fillRect(wx, -72, 28, 30);
      if (lit) { const g = c.createRadialGradient(wx + 14, -57, 2, wx + 14, -57, 46); g.addColorStop(0, 'rgba(255,224,138,.35)'); g.addColorStop(1, 'rgba(255,224,138,0)'); c.fillStyle = g; c.fillRect(wx - 34, -100, 96, 90); }
      c.strokeStyle = mix('#8a6a4a', '#2e2230', dark * 0.5); c.lineWidth = 2;
      c.beginPath(); c.moveTo(wx + 14, -72); c.lineTo(wx + 14, -42); c.moveTo(wx, -57); c.lineTo(wx + 28, -57); c.stroke();
      c.fillStyle = mix('#5aa860', '#1c4a3f', dark); c.fillRect(wx - 2, -37, 32, 7);
      for (let i = 0; i < 4; i++) { c.fillStyle = ['#ff7aa8', '#ffd166', '#fff'][i % 3]; c.beginPath(); c.arc(wx + 3 + i * 8, -39, 3, 0, 7); c.fill(); }
    }
    c.restore();
    if (owned && this.inHouse && this.pet) { // siluet peliharaan di jendela kanan
      const pal = (this.pet.shiny ? SHINY : PALETTES)[this.pet.species] || PALETTES.mochi;
      const wx = x + 42, wy = y - 54;
      c.save();
      c.beginPath(); c.rect(x + 28, y - 72, 28, 30); c.clip();
      c.fillStyle = pal.body; c.beginPath(); c.arc(wx, wy + 6, 11, 0, 7); c.fill();
      c.fillStyle = '#2b2440'; c.beginPath(); c.arc(wx - 4, wy + 4, 1.6, 0, 7); c.arc(wx + 4, wy + 4, 1.6, 0, 7); c.fill();
      c.restore();
      if (this.pet.sleeping) {
        c.fillStyle = '#e8ecff'; c.font = '700 14px system-ui'; c.textAlign = 'center';
        for (let i = 0; i < 3; i++) { const ph = (this.t * 0.6 + i / 3) % 1; c.globalAlpha = 1 - ph; c.fillText('z', x + 62 + ph * 18 + i * 3, y - 80 - ph * 34 - i * 8); }
        c.globalAlpha = 1; c.textAlign = 'start';
      }
    }
    if (owned) { // asap cerobong
      for (let i = 0; i < 4; i++) {
        const ph = (this.t * 0.35 + i / 4) % 1;
        c.fillStyle = `rgba(230,230,240,${0.5 * (1 - ph)})`;
        c.beginPath(); c.arc(x + 48 + Math.sin(ph * 6 + i) * 6 + ph * 14, y - 156 - ph * 40, 5 + ph * 8, 0, 7); c.fill();
      }
    } else { // papan "dijual"
      c.fillStyle = mix('#8a5a34', '#3a2a22', dark * 0.6); c.fillRect(x - 2.5, y - 34, 5, 36);
      c.fillStyle = mix('#fff3d6', '#6a6a86', dark * 0.5); c.beginPath(); c.roundRect(x - 36, y - 62, 72, 32, 5); c.fill();
      c.strokeStyle = '#8a5a34'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#c0392b'; c.font = '800 13px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('DIJUAL', x, y - 46);
      c.fillStyle = '#5a3a1a'; c.font = '700 12px system-ui, sans-serif';
      c.fillText(`🪙 ${this.houseCost ?? 80}`, x, y - 33);
      c.textAlign = 'start';
    }
  }

  _shop(c, dark) {
    const { x, y } = BUILDINGS.shop;
    const lit = dark > 0.3;
    c.save(); c.translate(x, y);
    this._shadow(c, 0, 5, 90);
    c.fillStyle = mix('#ffe8c8', '#3a3a58', dark * 0.6); c.beginPath(); c.roundRect(-66, -84, 132, 84, 3); c.fill();
    c.fillStyle = mix('#b8603f', '#4a2a3a', dark * 0.6); c.fillRect(-72, -98, 144, 14);
    c.fillStyle = mix('#8a4630', '#2e1a28', dark * 0.6); c.fillRect(-72, -100, 144, 4);
    // papan nama
    c.fillStyle = mix('#8a5a34', '#3a2a22', dark * 0.5); c.beginPath(); c.roundRect(-40, -124, 80, 28, 6); c.fill();
    c.strokeStyle = '#d9a770'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#ffd166'; c.font = '800 18px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('TOKO', 0, -109);
    c.textBaseline = 'alphabetic';
    // kanopi bergaris
    for (let i = 0; i < 8; i++) {
      c.fillStyle = mix(i % 2 ? '#ffffff' : '#e8453c', '#3a3a58', dark * 0.5);
      c.beginPath(); c.moveTo(-72 + i * 18, -84); c.lineTo(-54 + i * 18, -84); c.lineTo(-54 + i * 18, -68); c.arc(-63 + i * 18, -68, 9, 0, Math.PI); c.lineTo(-72 + i * 18, -84); c.fill();
    }
    // etalase
    c.fillStyle = mix('#8a6a4a', '#2e2230', dark * 0.5); c.fillRect(-62, -58, 56, 44);
    c.fillStyle = lit ? '#ffe9a8' : mix('#cfeaff', '#25305a', dark);
    c.fillRect(-59, -55, 50, 38);
    if (lit) { const g = c.createRadialGradient(-34, -36, 2, -34, -36, 60); g.addColorStop(0, 'rgba(255,230,160,.35)'); g.addColorStop(1, 'rgba(255,230,160,0)'); c.fillStyle = g; c.fillRect(-90, -70, 110, 80); }
    c.font = '18px system-ui'; c.textAlign = 'center'; c.fillStyle = '#000';
    c.fillText('🎩', -46, -34); c.fillText('🍰', -22, -34); c.fillText('🎀', -46, -20); c.fillText('🧣', -22, -20);
    c.textAlign = 'start';
    // pintu kaca
    c.fillStyle = mix('#8a6a4a', '#2e2230', dark * 0.5); c.fillRect(12, -60, 42, 60);
    c.fillStyle = lit ? '#ffe9a8' : mix('#cfeaff', '#25305a', dark); c.fillRect(15, -57, 36, 54);
    c.fillStyle = '#ffd166'; c.beginPath(); c.arc(46, -28, 2.4, 0, 7); c.fill();
    c.fillStyle = '#e8453c'; c.beginPath(); c.roundRect(22, -48, 22, 11, 3); c.fill();
    c.fillStyle = '#fff'; c.font = '700 8px system-ui'; c.textAlign = 'center'; c.fillText('BUKA', 33, -40); c.textAlign = 'start';
    c.fillStyle = mix('#c9b283', '#4c4535', dark * 0.6); c.fillRect(8, -2, 50, 5);
    // lampu hias malam hari
    if (lit) for (let i = 0; i < 9; i++) { const bx = -66 + i * 16.5, by = -86 + Math.sin(i) * 2; c.fillStyle = ['#ffd166', '#ff7aa8', '#7fd6ff'][i % 3]; c.globalAlpha = 0.65 + 0.35 * Math.sin(this.t * 3 + i); c.beginPath(); c.arc(bx, by, 2.6, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    c.restore();
  }

  /** Hiasan hari spesial yang menempel pada rumah & toko. */
  _buildingOrnaments(c, ev, dark) {
    const house = BUILDINGS.house, shop = BUILDINGS.shop;
    const flag = (px, py) => {
      c.strokeStyle = '#8a8a9a'; c.lineWidth = 3; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 38); c.stroke();
      for (let i = 0; i < 12; i++) {
        const fx = px + i * 3, wave = Math.sin(this.t * 3 + i * 0.5) * 1.8;
        c.fillStyle = '#e8203a'; c.fillRect(fx, py - 38 + wave, 3.2, 10);
        c.fillStyle = '#fff'; c.fillRect(fx, py - 28 + wave, 3.2, 10);
      }
    };
    c.save();
    c.font = '34px system-ui'; c.textAlign = 'center'; c.fillStyle = '#000';
    switch (ev.id) {
      case 'kemerdekaan': flag(house.x + 56, house.y - 130); flag(shop.x + 40, house.y - 100); break;
      case 'natal':
        c.fillText('🎄', house.x - 50, house.y - 2); c.fillText('🎄', shop.x + 62, shop.y - 2);
        for (let i = 0; i < 14; i++) { c.fillStyle = ['#ff5a5a', '#ffd166', '#6ee7a8', '#7fd6ff'][i % 4]; c.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 4 + i); c.beginPath(); c.arc(house.x - 80 + i * 11.5, house.y - 88 - Math.abs(Math.sin(i * 0.9)) * 4, 2.6, 0, 7); c.fill(); }
        c.globalAlpha = 1; break;
      case 'halloween': c.fillText('🎃', house.x - 50, house.y - 2); c.fillText('🎃', shop.x + 62, shop.y - 2); c.fillText('🦇', house.x + 60 + Math.sin(this.t) * 12, house.y - 168 + Math.sin(this.t * 2) * 5); break;
      case 'ramadhan': case 'idulfitri': case 'iduladha': case 'tahunbaruislam':
        for (const [bx, by] of [[house.x - 52, house.y - 82], [house.x + 52, house.y - 82], [shop.x - 52, shop.y - 62], [shop.x + 52, shop.y - 62]]) {
          const sw = Math.sin(this.t * 1.5 + bx) * 2;
          c.font = '24px system-ui'; c.fillText('🏮', bx + sw, by + 14);
          if (dark > 0.2) { const g = c.createRadialGradient(bx, by + 8, 2, bx, by + 8, 40); g.addColorStop(0, `rgba(255,190,90,${0.5 * dark})`); g.addColorStop(1, 'rgba(255,190,90,0)'); c.fillStyle = g; c.fillRect(bx - 40, by - 30, 80, 80); c.fillStyle = '#000'; }
        } break;
      case 'ultah': c.fillText('🎈', house.x - 52, house.y - 22 + Math.sin(this.t * 1.6) * 6); c.fillText('🎈', shop.x + 62, shop.y - 22 + Math.sin(this.t * 1.6 + 1) * 6); break;
      case 'valentine': c.fillText('💝', house.x, house.y - 64 + Math.sin(this.t * 2) * 3); break;
      default:
    }
    c.restore();
  }

  /** Hiasan hari spesial: untaian bendera di langit. */
  _eventDecor(c, dark) {
    const e = this.world?.event;
    if (!e) return;
    const cols = EVENT_COLORS[e.id] || ['#ff6b9d', '#6c7bd9', '#ffd166'];
    c.save();
    c.lineWidth = 2; c.strokeStyle = 'rgba(70,60,60,.6)';
    c.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = 10 + Math.sin((x / W) * Math.PI) * 24; if (x === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    for (let x = 14, i = 0; x < W - 10; x += 34, i++) {
      const y = 10 + Math.sin((x / W) * Math.PI) * 24, sw = Math.sin(this.t * 2 + i) * 1.5;
      c.fillStyle = mix(cols[i % cols.length], '#444466', dark * 0.5);
      c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x + 10, y); c.lineTo(x + sw, y + 24); c.closePath(); c.fill();
    }
    c.restore();
  }

  _visitorPos() {
    const v = this.visitor;
    if (!v) return null;
    const t = this.t, x0 = v.x;
    switch (v.kind) {
      case 'kupu': return { x: x0 + Math.sin(t * 1.3) * 70, y: 320 + Math.sin(t * 3.1) * 22, flip: Math.cos(t * 1.3) < 0, air: true };
      case 'burung': return { x: ((x0 + t * 28) % (W + 80)) - 40, y: 250 + Math.sin(t * 2) * 18, flip: false, air: true };
      case 'kelinci': return { x: x0 + Math.sin(t * 0.45) * 90, y: 418 - Math.abs(Math.sin(t * 4.2)) * 20, flip: Math.cos(t * 0.45) < 0 };
      case 'kucing': return { x: x0, y: 354 + Math.sin(t * 1.2), flip: false };
      case 'rubah': return { x: x0 + Math.sin(t * 0.5) * 100, y: 432 - Math.abs(Math.sin(t * 3)) * 4, flip: Math.cos(t * 0.5) < 0 };
      case 'hantu': return { x: x0, y: 348 + Math.sin(t * 1.6) * 2, flip: false };
      case 'unicorn': return { x: ((x0 + t * 45) % (W + 100)) - 50, y: 408 - Math.abs(Math.sin(t * 5)) * 14, flip: false };
      default: return { x: x0, y: 400, flip: false };
    }
  }

  _visitorDraw(c) {
    const pos = this._visitorPos();
    if (!pos) return;
    const em = this.visitorEmoji || '🦋';
    if (!pos.air) { c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.ellipse(pos.x, 440, 18, 5, 0, 0, 7); c.fill(); }
    c.save();
    c.translate(pos.x, pos.y);
    if (pos.flip) c.scale(-1, 1);
    c.font = '40px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillStyle = '#000'; c.globalAlpha = 1; // emoji ikut alpha warna isi, jadi harus opak
    c.fillText(em, 0, 0);
    c.restore();
    c.textAlign = 'start';
    this._tag(c, pos.x, pos.y - 46, this.hover === 'visitor' ? `Sapa ${this.visitorLabel || 'tamu'}! 👋` : '👋');
  }

  _birdsDraw(c, dark) {
    if (!this.birds.length) return;
    c.save(); c.strokeStyle = mix('#3a3f55', '#aab0d0', dark); c.lineWidth = 2; c.lineCap = 'round';
    for (const b of this.birds) {
      const f = Math.sin(this.t * 9 + b.ph) * 5 * b.s;
      c.beginPath();
      c.moveTo(b.x - 9 * b.s, b.y + f * 0.4); c.quadraticCurveTo(b.x - 4 * b.s, b.y - 5 * b.s - f, b.x, b.y);
      c.quadraticCurveTo(b.x + 4 * b.s, b.y - 5 * b.s - f, b.x + 9 * b.s, b.y + f * 0.4);
      c.stroke();
    }
    c.restore();
  }

  /** Makhluk kecil hiasan: kupu-kupu di siang hari, kunang-kunang di malam hari. */
  _critters(c, dark) {
    if (this.reduced) return;
    const dry = 1 - this.wet;
    if (dark < 0.45 && dry > 0.5 && this.theme !== 'salju') {
      for (let i = 0; i < 3; i++) {
        const bx = 170 + i * 280 + Math.sin(this.t * 0.35 + i * 2) * 90, by = 352 + i * 22 + Math.sin(this.t * 1.1 + i) * 16;
        const flap = Math.abs(Math.sin(this.t * 14 + i * 1.7));
        c.save(); c.translate(bx, by); c.globalAlpha = 0.9 * dry;
        c.fillStyle = ['#ffb347', '#ff7aa8', '#9ad0ff'][i];
        for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 4.2 * flap + d * 1, -1, 4.8 * flap + 0.8, 5.4, d * 0.4, 0, 7); c.fill(); }
        c.fillStyle = '#3a3040'; c.fillRect(-0.8, -4, 1.6, 8);
        c.restore();
      }
    }
    if (dark > 0.45 && this.wet < 0.3) {
      for (let i = 0; i < 14; i++) {
        const fx = 40 + ((i * 163) % 820) + Math.sin(this.t * 0.5 + i) * 26, fy = 350 + ((i * 71) % 150) + Math.cos(this.t * 0.7 + i * 1.3) * 18;
        const a = Math.max(0, Math.sin(this.t * 1.8 + i * 2.3)) * dark;
        if (a < 0.05) continue;
        const g = c.createRadialGradient(fx, fy, 0, fx, fy, 9);
        g.addColorStop(0, `rgba(230,255,150,${0.9 * a})`); g.addColorStop(1, 'rgba(230,255,150,0)');
        c.fillStyle = g; c.fillRect(fx - 9, fy - 9, 18, 18);
      }
    }
  }

  _weatherFront(c) {
    if (this.ambient.length) {
      for (const q of this.ambient) {
        if (q.kind === 'rain') {
          c.strokeStyle = 'rgba(195,218,255,.5)'; c.lineWidth = 1.3;
          c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x + q.vx * 0.022, q.y + q.len); c.stroke();
        } else if (q.kind === 'sakura') {
          c.fillStyle = CONFETTI_PETAL[q.c]; c.beginPath(); c.ellipse(q.x, q.y, q.r * 1.5, q.r, q.ph + this.t, 0, 7); c.fill();
        } else if (q.kind === 'gugur') {
          c.fillStyle = ['#e5703a', '#f2a33a', '#c9552a'][q.c]; c.beginPath(); c.ellipse(q.x, q.y, q.r * 1.8, q.r * 0.9, q.ph + this.t * 1.5, 0, 7); c.fill();
        } else {
          c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(q.x, q.y, q.r * 0.8, 0, 7); c.fill();
        }
      }
    }
    if (this.flash > 0.05 && this.bolt) {
      let x = this.bolt.x, y = 0, seed = this.bolt.seed * 1000;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      c.strokeStyle = `rgba(255,255,255,${this.flash})`; c.lineWidth = 3.5; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x, y);
      while (y < HORIZON) { y += 26 + rnd() * 18; x += (rnd() - 0.5) * 46; c.lineTo(x, y); }
      c.stroke();
    }
  }

  _items(c) {
    const info = this.getLocked();
    for (const [key, s] of Object.entries(SPOTS)) {
      const st = info[key] || {};
      c.save();
      if (st.locked) c.globalAlpha = 0.5;
      const hot = this.hover === key;
      if (hot && !st.locked) {
        c.fillStyle = 'rgba(255,255,255,.18)';
        c.beginPath(); c.ellipse(s.x, s.y + 2, s.r * 0.95, 20, 0, 0, 7); c.fill();
      }
      this[`_draw_${key}`](c, s, st);
      c.restore();
      if (st.locked) this._tag(c, s.x, s.y - 70, `🔒 Lv ${st.unlock}`);
      else if (st.cooldown > 0) { const sec = Math.ceil(st.cooldown / 1000); this._tag(c, s.x, s.y - 70, `⏳ ${sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}d`}`); }
      else if (hot) this._tag(c, s.x, s.y - 70, s.label);
    }
  }

  _tag(c, x, y, text) {
    c.font = '600 15px system-ui, sans-serif';
    const w = c.measureText(text).width + 18;
    c.fillStyle = 'rgba(15,18,38,.78)';
    c.beginPath(); c.roundRect(x - w / 2, y - 14, w, 26, 13); c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.fillText(text, x, y + 4);
    c.textAlign = 'start';
  }

  /** Fisika lompatan trampolin: parabola, alas melesak saat mendarat, salto tiap lompatan ketiga. */
  _tramp(k) {
    const act = this.activity;
    const T = 0.95;
    const amp = Math.min(1, k / 1.4, Math.max(0, (act.until - this.t) / 0.7)); // makin tinggi lalu pelan di akhir
    const idx = Math.floor(k / T), p = (k % T) / T;
    const h = 4 * p * (1 - p) * 135 * amp * (this.reduced ? 0.45 : 1);
    const near = Math.min(p, 1 - p);
    const press = Math.max(0, 1 - near / 0.16) * (0.35 + 0.65 * amp); // 0..1 saat menyentuh alas
    const stretch = 1 + 0.08 * Math.sin(Math.PI * p) * amp;
    return {
      idx, p, h, up: Math.min(1, h / 100), sag: press * 11,
      sqx: (1 / stretch) * (1 + 0.16 * press), sqy: stretch * (1 - 0.2 * press),
      flip: idx % 3 === 2 && amp > 0.95 && !this.reduced ? p * Math.PI * 2 : 0,
    };
  }

  _swingAngle() {
    const act = this.activity;
    if (act?.kind !== 'swing' || !act.arrived) return Math.sin(this.t * 1.1) * 0.08;
    const k = this.t - act.start;
    return Math.sin(k * 3.2) * 0.65 * Math.min(1, k / 0.9, Math.max(0, (act.until - this.t) / 0.6));
  }

  /** Posisi sekop: tangan peliharaan di sisi kanan, ujung sekop menyendok pasir lalu melempar ke samping. */
  _shovel(k) {
    const sc = this._stageScale(this.pet);
    const phase = Math.sin(k * 5) * 0.5 + 0.5;
    const hx = SPOTS.sandbox.x + 30 * sc;
    const hy = SPOTS.sandbox.y + 2 - 30 * sc;
    const th = lerp(0.7, 2.3, phase); // 0 = lurus ke bawah, searah jarum jam
    const len = 30 + 8 * sc;
    return { hx, hy, th, phase, rising: Math.cos(k * 5) > 0, tx: hx + Math.sin(th) * len, ty: hy + Math.cos(th) * len };
  }

  _treasureChest(c) {
    const tr = this.treasure;
    if (!tr) return;
    const x = tr.x, y = TREASURE_Y;
    const hop = Math.abs(Math.sin(this.t * 3)) * 7;
    const g = c.createRadialGradient(x, y - 22, 4, x, y - 22, 64);
    g.addColorStop(0, `rgba(255,224,120,${0.55 + Math.sin(this.t * 4) * 0.15})`);
    g.addColorStop(1, 'rgba(255,224,120,0)');
    c.fillStyle = g;
    c.fillRect(x - 70, y - 90, 140, 130);
    this._shadow(c, x, y + 2, 26);
    c.save();
    c.translate(x, y - hop);
    c.fillStyle = '#9a5b2e';
    c.beginPath(); c.roundRect(-24, -30, 48, 30, 5); c.fill();
    c.fillStyle = '#b87a43';
    c.beginPath(); c.roundRect(-24, -44, 48, 18, [10, 10, 2, 2]); c.fill();
    c.fillStyle = '#ffd166';
    c.fillRect(-26, -30, 52, 5);
    c.fillRect(-4, -34, 8, 14);
    c.fillStyle = '#7a4520';
    c.beginPath(); c.arc(0, -25, 2.6, 0, 7); c.fill();
    c.restore();
    for (let i = 0; i < 3; i++) {
      const a = this.t * 1.6 + i * 2.1;
      c.globalAlpha = 0.5 + 0.5 * Math.sin(a * 2);
      c.font = '14px system-ui'; c.fillText('✨', x + Math.cos(a) * 34 - 7, y - 30 + Math.sin(a * 1.3) * 22);
    }
    c.globalAlpha = 1;
    if (this.hover === 'treasure') this._tag(c, x, y - 78, `Ketuk! +${tr.amount} 🪙`);
    else this._tag(c, x, y - 78, '💰');
  }

  /** Arah & panjang bayangan peliharaan mengikuti posisi matahari (jam waktu-game). */
  _sunShadow() {
    const h = this._hour;
    const dayK = Math.min(1, Math.max(0, (h - 6) / 12));
    const sunX = lerp(-1, 1, dayK); // -1 pagi (timur) … +1 sore (barat)
    const night = h < 6 || h >= 18;
    return { dx: night ? 0 : -sunX * 26, k: night ? 1 : 1 + Math.abs(sunX) * 0.45, a: night ? 0.07 : 0.16 - Math.abs(sunX) * 0.02 };
  }

  _shadow(c, x, y, rx, alpha = 0.16) {
    c.fillStyle = `rgba(0,0,0,${alpha})`;
    c.beginPath(); c.ellipse(x, y, rx, rx * 0.22, 0, 0, 7); c.fill();
  }

  _draw_swing(c, s) {
    const ang = this._swingAngle();
    this._shadow(c, s.x, s.y, 70);
    c.strokeStyle = '#a86b3c'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(s.x - 64, s.y); c.lineTo(s.x - 40, s.y - 130); c.lineTo(s.x + 40, s.y - 130); c.lineTo(s.x + 64, s.y); c.stroke();
    c.save();
    c.translate(s.x, s.y - 130);
    c.rotate(ang);
    c.strokeStyle = '#6b5b4b'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-34, 0); c.lineTo(-34, SWING_L); c.moveTo(34, 0); c.lineTo(34, SWING_L); c.stroke();
    c.fillStyle = '#ff8a5b';
    c.beginPath(); c.roundRect(-44, SWING_L - 2, 88, 10, 5); c.fill();
    c.restore();
  }

  _draw_sandbox(c, s) {
    this._shadow(c, s.x, s.y + 6, 80);
    c.fillStyle = '#b97b45';
    c.beginPath(); c.roundRect(s.x - 76, s.y - 22, 152, 38, 10); c.fill();
    c.fillStyle = '#f2d79b';
    c.beginPath(); c.roundRect(s.x - 68, s.y - 18, 136, 26, 8); c.fill();
    // istana pasir: tumbuh saat peliharaan menyekop
    const act = this.activity?.kind === 'sandbox' && this.activity.arrived;
    const g = act ? 0.45 + 0.55 * Math.min(1, (this.t - this.activity.start) / 3.4) : 0.45;
    const cx = s.x - 54, base = s.y + 2, h = 24 * g;
    c.fillStyle = '#e0b96a';
    c.beginPath(); c.moveTo(cx - 17, base); c.lineTo(cx - 12, base - h); c.lineTo(cx + 12, base - h); c.lineTo(cx + 17, base); c.fill();
    if (g > 0.6) for (const dx of [-12, -3, 6]) c.fillRect(cx + dx, base - h - 5, 6, 6);
    if (g > 0.95) {
      c.strokeStyle = '#8a5a2b'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, base - h - 5); c.lineTo(cx, base - h - 20); c.stroke();
      c.fillStyle = '#ef476f'; c.beginPath(); c.moveTo(cx, base - h - 20); c.lineTo(cx + 12, base - h - 15); c.lineTo(cx, base - h - 10); c.fill();
    }
    c.fillStyle = '#ef476f'; // ember
    c.fillRect(s.x + 40, s.y - 34, 14, 18);
    c.fillStyle = '#ffd166';
    c.fillRect(s.x + 46, s.y - 50, 3, 18);
  }

  /** Bibir depan kotak pasir, digambar setelah peliharaan agar ia tampak duduk di dalam pasir. */
  _sandboxFront(c) {
    const s = SPOTS.sandbox;
    const locked = this.getLocked().sandbox?.locked;
    c.save();
    if (locked) c.globalAlpha = 0.5;
    c.fillStyle = '#b97b45';
    c.beginPath(); c.roundRect(s.x - 76, s.y - 4, 152, 20, [0, 0, 10, 10]); c.fill();
    c.fillStyle = '#cf9560';
    c.beginPath(); c.roundRect(s.x - 76, s.y - 4, 152, 5, 3); c.fill();
    c.restore();
  }

  _draw_ball(c, s) {
    const bx = this.ballX;
    const act = this.activity?.kind === 'ball' && this.activity.arrived;
    const bounce = act ? Math.abs(Math.sin((this.t - this.activity.start) * 6)) * 26 : 0;
    this._shadow(c, bx, s.y, 16);
    c.save();
    c.translate(bx, s.y - 14 - bounce);
    c.rotate(this.t * (act ? 6 : 0));
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
    c.fillStyle = '#ef476f'; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI / 2); c.lineTo(0, 0); c.fill();
    c.fillStyle = '#118ab2'; c.beginPath(); c.arc(0, 0, 15, Math.PI, Math.PI * 1.5); c.lineTo(0, 0); c.fill();
    c.restore();
  }

  _draw_pond(c, s) {
    const g = c.createRadialGradient(s.x, s.y, 10, s.x, s.y, 90);
    g.addColorStop(0, '#8fe0ff'); g.addColorStop(1, '#3aa0d8');
    c.fillStyle = '#9a8a6a';
    c.beginPath(); c.ellipse(s.x, s.y + 3, 96, 34, 0, 0, 7); c.fill();
    c.fillStyle = g;
    c.beginPath(); c.ellipse(s.x, s.y, 88, 28, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const r = ((this.t * 0.5 + i / 3) % 1);
      c.globalAlpha = 1 - r;
      c.beginPath(); c.ellipse(s.x - 20 + i * 18, s.y - 2, 10 + r * 30, 3 + r * 8, 0, 0, 7); c.stroke();
    }
    c.globalAlpha = 1;
    if (!this.reduced) for (let i = 0; i < 5; i++) { // kilau cahaya di air
      const a = (Math.sin(this.t * 1.7 + i * 2.1) + 1) / 2;
      c.fillStyle = `rgba(255,255,255,${0.1 + a * 0.55})`;
      c.beginPath(); c.ellipse(s.x - 56 + i * 27, s.y - 6 + Math.sin(i * 3) * 8, 2.6 + a * 1.8, 1.1, 0, 0, 7); c.fill();
    }
    c.fillStyle = '#4fbf6a';
    c.beginPath(); c.ellipse(s.x + 40, s.y - 4, 13, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#ff8fab';
    c.beginPath(); c.arc(s.x + 42, s.y - 8, 4, 0, 7); c.fill();
    c.font = '26px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText('🦆', s.x - 64, s.y - 2 + Math.sin(this.t * 1.6) * 2);
    c.textAlign = 'start';
  }

  /** Lapisan air depan: menutupi bagian bawah badan sehingga peliharaan tampak berendam. */
  _pondFront(c) {
    const act = this.activity;
    const wl = this._pondWL;
    if (act?.kind !== 'pond' || !act.arrived || !wl) return;
    const s = SPOTS.pond, k = this.t - act.start;
    c.save();
    c.beginPath(); c.ellipse(s.x, s.y, 87, 27, 0, 0, 7); c.clip();
    c.globalAlpha = wl.blend;
    const g = c.createLinearGradient(0, wl.y, 0, s.y + 28);
    g.addColorStop(0, 'rgba(150,225,255,.66)'); g.addColorStop(1, 'rgba(58,160,216,.86)');
    c.fillStyle = g;
    c.fillRect(wl.x - 130, wl.y, 260, 80);
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2.2;
    c.beginPath();
    for (let i = -62; i <= 62; i += 4) {
      const y = wl.y + Math.sin(this.t * 6 + i * 0.25) * 1.6;
      if (i === -62) c.moveTo(wl.x + i, y); else c.lineTo(wl.x + i, y);
    }
    c.stroke();
    c.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const r = (k * 0.9 + i / 3) % 1;
      c.globalAlpha = wl.blend * (1 - r) * 0.7;
      c.strokeStyle = 'rgba(255,255,255,.95)';
      c.beginPath(); c.ellipse(wl.x, wl.y + 5, 28 + r * 48, 6 + r * 10, 0, 0, 7); c.stroke();
    }
    c.restore();
  }

  _draw_trampoline(c, s) {
    const act = this.activity?.kind === 'trampoline' && this.activity.arrived;
    const sag = act ? this._tramp(this.t - this.activity.start).sag : 0;
    this._shadow(c, s.x, s.y + 4, 76);
    c.strokeStyle = '#555c7a'; c.lineWidth = 5; c.lineCap = 'round';
    for (const dx of [-58, -40, 40, 58]) { c.beginPath(); c.moveTo(s.x + dx, s.y - 12); c.lineTo(s.x + dx * 1.05, s.y + 6); c.stroke(); }
    c.fillStyle = '#2d3561';
    c.beginPath(); c.ellipse(s.x, s.y - 14 + sag, 66, 14, 0, 0, 7); c.fill();
    c.fillStyle = '#6c7bd9';
    c.beginPath(); c.ellipse(s.x, s.y - 16 + sag, 58, 10, 0, 0, 7); c.fill();
  }

  _poop(c) {
    const n = this.pet?.poop || 0;
    for (let i = 0; i < n; i++) {
      const x = 90 + ((i * 197 + 60) % (W - 180)), y = HORIZON + 95 + (i % 2) * 30;
      c.font = '30px system-ui, sans-serif';
      c.fillText('💩', x, y);
      if (Math.sin(this.t * 3 + i) > 0.6) { c.font = '14px system-ui'; c.fillText('~', x + 8, y - 28); }
    }
  }

  _pet(c) {
    const p = this.pet;
    if (this.hidden) return; // sedang di dalam rumah/toko
    const act = this.activity?.arrived ? this.activity : null;
    let lift = 0, rot = 0, px = this.x, py = this.y, sit = false, sqx = 1, sqy = 1, flip = 0, shadowY = this.y + 2;
    const kk = act ? this.t - act.start : 0;
    if (this.walking && this.curl < 0.45) lift = Math.abs(Math.sin(this.t * 11)) * 9;
    if (this.curl >= 0.45 && this.t < this.spinUntil) lift = Math.abs(Math.sin(this.t * 9)) * 6;
    if (act) {
      const k = this.t - act.start;
      const blend = Math.min(1, k / 0.5, Math.max(0, (act.until - this.t) / 0.4));
      if (act.kind === 'swing') {
        // duduk di dudukan: kaki menapak di atas papan, badan miring mengikuti tali
        const a = this._swingAngle();
        const sp = SPOTS.swing;
        const seatX = sp.x - Math.sin(a) * SWING_L, seatY = sp.y - 130 + Math.cos(a) * SWING_L - 1;
        px = lerp(this.x, seatX, blend);
        py = lerp(this.y, seatY, blend);
        rot = a * blend;
        sit = true;
      } else if (act.kind === 'trampoline') {
        const tr = this._tramp(k), sp = SPOTS.trampoline;
        px = lerp(this.x, sp.x, blend);
        py = lerp(this.y, sp.y - 18 + tr.sag, blend);
        lift = tr.h * blend;
        sqx = lerp(1, tr.sqx, blend); sqy = lerp(1, tr.sqy, blend); flip = tr.flip * blend;
        shadowY = sp.y - 14;
      } else if (act.kind === 'ball') lift = Math.abs(Math.sin(k * 6)) * 14;
      else if (act.kind === 'sandbox') {
        // berdiri di dalam pasir, badan bergoyang saat menyekop
        py = lerp(this.y, SPOTS.sandbox.y + 2, blend);
        rot = Math.sin(k * 5 + 1.2) * 0.07 * blend;
        sit = true;
      }
      else if (act.kind === 'pond') {
        // berendam di kolam: air menutupi bagian bawah badan, tangan memercik
        const sp = SPOTS.pond, sc = this._stageScale(p);
        py = lerp(this.y, sp.y + 14, blend);
        lift = Math.abs(Math.sin(k * 4.5)) * 7 * blend;
        rot = Math.sin(k * 4) * 0.07 * blend;
        sit = true;
        this._pondWL = { x: px, y: py - 18 * sc, blend };
      }
    }
    if (this.training) {
      const tr = this.training, k = this.t - tr.start;
      if (tr.kind === 'lari') { lift = Math.abs(Math.sin(k * 14)) * 9; rot = 0.1 * this.facing; }
      else if (tr.kind === 'tangguh') { sqy = 0.9 + 0.1 * Math.sin(k * 5); sqx = 2 - sqy; }
      else rot = Math.sin(k * 3) * 0.03;
    }
    if (this.eating && this.t - this.eating.start > 0.5) { lift += Math.abs(Math.sin(this.t * 9)) * 4; rot = Math.sin(this.t * 9) * 0.05; }
    if (this.bathing) { rot = Math.sin(this.t * 7) * 0.09; px += Math.sin(this.t * 7) * 3; }
    const ia = this.idleAct;
    if (ia && !this.walking && !act && !this.eating && !this.bathing && !this.training) {
      const k = this.t - ia.start;
      if (ia.kind === 'hop') lift = Math.abs(Math.sin(k * 9)) * 14;
      else if (ia.kind === 'sit') { sqy = 0.9; sqx = 1.07; }
      else if (ia.kind === 'yawn') { sqy = 1 + 0.06 * Math.sin(Math.min(1, k / 0.9) * Math.PI); sqx = 2 - sqy; }
      else if (ia.kind === 'sniff') { rot += 0.1 * this.facing; lift += Math.abs(Math.sin(k * 10)) * 2; }
    }
    if (this.cold && !this.visit && !this.reduced) { rot += Math.sin(this.t * 38) * 0.035; px += Math.sin(this.t * 47) * 1.3; }
    if (!sit || act?.kind === 'swing') { const sh = this._sunShadow(); this._shadow(c, px + sh.dx, shadowY, 38 * this._stageScale(p) * sh.k * (1 - Math.min(lift, 140) / 260), sh.a); }
    c.save();
    c.translate(px, py - lift);
    c.rotate(rot);
    if (flip) { const cy = -40 * this._stageScale(p); c.translate(0, cy); c.rotate(flip); c.translate(0, -cy); }
    c.scale(sqx, sqy);
    if (p.stage === 'egg') this._egg(c, p);
    else { this._creature(c, p); if (act) this._playArms(c, p, act, kk); }
    c.restore();
    this._pondFront(c);
    this._trainProps(c, px, py, p);
    this._idleProps(c, px, py, p);
    if (this.carry && this.t < this.carry.until) { // tas belanja + barang yang dibeli
      const sc = this._stageScale(p), bob = Math.sin(this.t * 8) * 2;
      c.font = `${Math.round(30 * sc + 6)}px system-ui`; c.textAlign = 'center'; c.fillStyle = '#000';
      c.fillText(this.carry.bag, px + this.facing * 44 * sc, py - 30 * sc + bob);
      c.font = '26px system-ui'; c.fillText(this.carry.item, px, py - 128 * sc - 6 + Math.sin(this.t * 3) * 3);
      c.textAlign = 'start';
    }
    if (act?.kind === 'swing') this._swingHands(c);
    if (act?.kind === 'sandbox') this._shovelDraw(c, this.t - act.start);
    this._food(c, px, py);
    this._bath(c, px, py);

    const mood = this.visit && p.sleeping ? 'neutral' : moodOf(p);
    if (this.bubble && this.t < this.bubble.until) {
      const sc = this._stageScale(p);
      c.font = '600 15px system-ui, sans-serif';
      const lines = this._wrap(c, this.bubble.text, 250);
      const lh = 20, w = Math.max(...lines.map((l) => c.measureText(l).width)) + 28, h = lines.length * lh + 14;
      const bottom = this.y - 150 * sc + Math.sin(this.t * 2.4) * 2;
      const top = bottom - h;
      const bx = Math.min(W - w / 2 - 8, Math.max(w / 2 + 8, px));
      c.globalAlpha = Math.min(1, (this.bubble.until - this.t) / 0.3);
      c.fillStyle = 'rgba(255,255,255,.96)';
      c.beginPath(); c.roundRect(bx - w / 2, top, w, h, 16); c.fill();
      c.beginPath(); c.moveTo(px - 7, bottom - 1); c.lineTo(px + 3, bottom + 12); c.lineTo(px + 8, bottom - 1); c.fill();
      c.fillStyle = '#2b2440'; c.textAlign = 'center';
      lines.forEach((l, i) => c.fillText(l, bx, top + 24 + i * lh - 2));
      c.textAlign = 'start';
      c.globalAlpha = 1;
    } else if (NEED_ICON[mood]) {
      const by = this.y - 135 * this._stageScale(p) - 24 + Math.sin(this.t * 2.4) * 3;
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.beginPath(); c.arc(px + 36, by, 19, 0, 7); c.fill();
      c.font = '20px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(NEED_ICON[mood], px + 36, by + 7);
      c.textAlign = 'start';
    }
  }

  _idleProps(c, px, py, p) {
    const ia = this.idleAct;
    if (!ia || ia.kind !== 'wave' || this.walking || p.stage === 'egg' || this.activity || this.hidden) return;
    const k = this.t - ia.start, sc = this._stageScale(p), d = this.facing;
    const hx = px + d * 54 * sc, hy = py - 78 * sc + Math.sin(k * 14) * 7;
    c.strokeStyle = palOf(p).body; c.fillStyle = palOf(p).body; c.lineWidth = 6 * sc + 1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px + d * 40 * sc, py - 42 * sc); c.lineTo(hx, hy); c.stroke();
    c.beginPath(); c.arc(hx, hy, 7 * sc + 1.5, 0, 7); c.fill();
  }

  _trainProps(c, px, py, p) {
    const tr = this.training;
    if (!tr || p.stage === 'egg') return;
    const k = this.t - tr.start, sc = this._stageScale(p);
    if (tr.kind === 'pintar') {
      c.save(); c.translate(px, py - 22 * sc);
      c.fillStyle = '#3f7fd6'; c.beginPath(); c.roundRect(-30, -2, 60, 22, 3); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-27, -4); c.lineTo(-27, 16); c.lineTo(0, 18); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(27, -4); c.lineTo(27, 16); c.lineTo(0, 18); c.closePath(); c.fill();
      c.strokeStyle = '#b8c2e0'; c.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-22, 3 + i * 4.5); c.lineTo(-5, 4 + i * 4.5); c.moveTo(5, 4 + i * 4.5); c.lineTo(22, 3 + i * 4.5); c.stroke(); }
      c.restore();
      if (k > 1.2) { c.font = '30px system-ui'; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText('💡', px + 38 * sc, py - 118 * sc - Math.sin(k * 4) * 3); c.textAlign = 'start'; }
    } else if (tr.kind === 'tangguh') {
      const lift = (0.5 + 0.5 * Math.sin(k * 5)) * 24, hy = py - 98 * sc - lift;
      c.strokeStyle = '#3a3a4a'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(px - 38 * sc, hy); c.lineTo(px + 38 * sc, hy); c.stroke();
      c.fillStyle = '#4a4a5e';
      for (const d of [-1, 1]) { c.beginPath(); c.roundRect(px + d * 38 * sc - 7, hy - 15, 14, 30, 4); c.fill(); c.fillStyle = '#6a6a80'; c.beginPath(); c.roundRect(px + d * (38 * sc + 12) - 4, hy - 10, 8, 20, 3); c.fill(); c.fillStyle = '#4a4a5e'; }
      c.strokeStyle = palOf(p).body; c.lineWidth = 6 * sc + 1;
      for (const d of [-1, 1]) { c.beginPath(); c.moveTo(px + d * 40 * sc, py - 40 * sc); c.lineTo(px + d * 34 * sc, hy + 4); c.stroke(); }
    } else if (tr.kind === 'lari') {
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const y = py - 20 * sc - i * 16 * sc; c.beginPath(); c.moveTo(px - this.facing * 52 * sc, y); c.lineTo(px - this.facing * (80 + i * 8) * sc, y); c.stroke(); }
    }
  }

  /** Penanda usia lanjut: alis putih & tongkat. */
  _elder(c, p) {
    if (p.stage !== 'elder') return;
    c.save();
    c.fillStyle = 'rgba(255,255,255,.88)';
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 17, -66, 10, 3.6, d * 0.3, 0, 7); c.fill(); }
    c.strokeStyle = '#8a5a34'; c.lineWidth = 4.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(54, -4); c.lineTo(54, -40); c.arc(60, -40, 6, Math.PI, Math.PI * 2); c.stroke();
    c.restore();
  }

  /** Lengan: terangkat saat melompat di trampolin, memercik air di kolam. */
  _playArms(c, p, act, k) {
    const sc = this._stageScale(p);
    let hands = null;
    if (act.kind === 'trampoline') {
      const up = this._tramp(k).up;
      hands = [-1, 1].map((d) => [d * (44 - up * 14) * sc, (-30 - up * 58) * sc]);
    } else if (act.kind === 'pond') {
      hands = [-1, 1].map((d, i) => [d * 50 * sc, (-34 - Math.max(0, Math.sin(k * 8 + i * Math.PI)) * 28) * sc]);
    }
    if (!hands) return;
    const col = p.sick ? '#9dc070' : palOf(p).body;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 6 * sc + 1; c.lineCap = 'round';
    for (const [x, y] of hands) {
      c.beginPath(); c.moveTo(Math.sign(x) * 38 * sc, -36 * sc); c.lineTo(x, y); c.stroke();
      c.beginPath(); c.arc(x, y, 7 * sc + 1.5, 0, 7); c.fill();
    }
  }

  _swingHands(c) {
    const sp = SPOTS.swing, a = this._swingAngle(), sc = this._stageScale(this.pet);
    const cos = Math.cos(a), sin = Math.sin(a);
    c.fillStyle = this.pet.sick ? '#9dc070' : palOf(this.pet).body;
    for (const d of [-1, 1]) {
      const lx = d * 34, ly = SWING_L - 34 * sc;
      c.beginPath(); c.arc(sp.x + lx * cos - ly * sin, sp.y - 130 + lx * sin + ly * cos, 6.5, 0, 7); c.fill();
    }
  }

  _shovelDraw(c, k) {
    const sv = this._shovel(k);
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = '#d9a066'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(sv.hx, sv.hy); c.lineTo(sv.tx, sv.ty); c.stroke();
    c.fillStyle = '#ef476f';
    c.beginPath(); c.ellipse(sv.tx, sv.ty, 11, 6.5, Math.PI / 2 - sv.th, 0, 7); c.fill();
    if (sv.phase > 0.3) { // pasir di sekop
      c.fillStyle = '#e4c27f';
      c.beginPath(); c.ellipse(sv.tx - Math.cos(sv.th) * 1, sv.ty - 3, 7, 3.5, 0, 0, 7); c.fill();
    }
    c.fillStyle = this.pet.sick ? '#9dc070' : palOf(this.pet).body;
    c.beginPath(); c.arc(sv.hx, sv.hy, 6.5, 0, 7); c.fill();
    c.restore();
  }

  _food(c, px, py) {
    const e = this.eating;
    if (!e) return;
    const k = this.t - e.start;
    const s = this._stageScale(this.pet);
    const mouthY = py - 34 * s;
    const fall = Math.min(1, k / 0.6);
    const held = k >= 0.6;
    const total = e.until - e.start - 0.6;
    const bites = held ? Math.floor(((k - 0.6) / total) * 4) : 0; // 4 gigitan
    const size = held ? Math.max(12, 38 * (1 - bites * 0.22)) : 38;
    const bob = held ? Math.abs(Math.sin(this.t * 9)) * 3 : 0;
    const fx = px + (held ? 0 : Math.sin(k * 10) * 4);
    const fy = held ? mouthY + 14 * s - bob : lerp(py - 170, mouthY + 14 * s, fall * fall);
    if (held) {
      c.fillStyle = this.pet.sick ? '#9dc070' : palOf(this.pet).body;
      for (const d of [-1, 1]) { c.beginPath(); c.ellipse(fx + d * (size * 0.5 + 4), fy + 6, 9 * s + 3, 6 * s + 3, d * 0.5, 0, 7); c.fill(); }
    }
    c.font = `${size}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText(e.emoji, fx, fy + size * 0.35);
    c.textAlign = 'start';
    if (held && bites !== this._lastBite) { this._lastBite = bites; this.burst(fx, fy, 'sand', 5); this.float('nyam!', px + 40, py - 120 * s - 20, '#ffe9a8'); }
  }

  _bath(c, px, py) {
    const b = this.bathing;
    if (!b) return;
    const s = Math.max(0.85, this._stageScale(this.pet));
    const k = this.t - b.start;
    const fadeIn = Math.min(1, k / 0.35), fadeOut = Math.min(1, (b.until - this.t) / 0.4);
    const a = Math.max(0, Math.min(fadeIn, fadeOut));
    c.save();
    c.globalAlpha = a;
    // pancuran
    c.strokeStyle = '#8b93b8'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px + 70, py - 300); c.lineTo(px + 70, py - 215); c.lineTo(px, py - 215); c.stroke();
    c.fillStyle = '#c9cff0';
    c.beginPath(); c.ellipse(px, py - 208, 26, 9, 0, 0, 7); c.fill();
    // bak
    const sc = this._stageScale(this.pet);
    const w = 140 * s, top = py - 20 * sc, h = 40;
    c.fillStyle = '#b7824f';
    c.beginPath(); c.roundRect(px - w / 2, top, w, h, 14); c.fill();
    c.fillStyle = '#d9a770';
    c.beginPath(); c.roundRect(px - w / 2, top, w, 10, 8); c.fill();
    c.fillStyle = 'rgba(0,0,0,.12)';
    for (const f of [-0.28, 0, 0.28]) c.fillRect(px + f * w - 1.5, top + 12, 3, h - 16);
    // busa di tepi bak & kepala
    c.fillStyle = '#fff';
    for (let i = -4; i <= 4; i++) {
      const wob = Math.sin(this.t * 4 + i) * 2;
      c.beginPath(); c.arc(px + i * (w / 9), top + wob, 11 + (i % 2 ? 3 : 0), 0, 7); c.fill();
    }
    const hy = py - 84 * sc;
    for (const [dx, dy, r] of [[-12, 2, 9 * sc + 3], [4, -6, 11 * sc + 3], [16, 3, 8 * sc + 3]]) {
      c.beginPath(); c.arc(px + dx * sc + Math.sin(this.t * 6 + dx) * 1.5, hy + dy, r, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(190,225,255,.6)';
    for (const [dx, dy, r] of [[-6, 0, 3], [10, -4, 2.5]]) { c.beginPath(); c.arc(px + dx, hy + dy, r, 0, 7); c.fill(); }
    c.restore();
  }

  _stageScale(p) {
    return (({ egg: 1, baby: 0.62, child: 0.8, teen: 0.95, adult: 1.1, elder: 1.04 })[p.stage] || 1) * this.depth;
  }

  _egg(c, p) {
    const pal = PALETTES[p.species] || PALETTES.mochi;
    const wob = Math.sin(this.t * 3) * 0.08 * (1 + Math.sin(this.t * 0.7));
    c.rotate(wob);
    c.fillStyle = '#fff6e5';
    c.beginPath();
    c.moveTo(0, -105);
    c.bezierCurveTo(46, -105, 56, -40, 44, -14);
    c.bezierCurveTo(30, 8, -30, 8, -44, -14);
    c.bezierCurveTo(-56, -40, -46, -105, 0, -105);
    c.fill();
    c.fillStyle = pal.body;
    for (const [x, y, r] of [[-18, -70, 9], [14, -52, 11], [-8, -26, 8], [24, -86, 6]]) {
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath(); c.ellipse(-20, -85, 7, 14, -0.5, 0, 7); c.fill();
  }

  _creature(c, p) {
    const pal = palOf(p);
    const s = this._stageScale(p);
    const mood = this.visit && p.sleeping ? 'neutral' : moodOf(p);
    const breathe = Math.sin(this.t * (p.sleeping ? 1.4 : 3)) * 0.03;
    const sx = (1 - breathe) * s, sy = (1 + breathe) * s;

    if (p.form === 'radiant') {
      const g = c.createRadialGradient(0, -48 * s, 10, 0, -48 * s, 100 * s);
      g.addColorStop(0, 'rgba(255,240,170,.55)'); g.addColorStop(1, 'rgba(255,240,170,0)');
      c.fillStyle = g;
      c.fillRect(-120, -170, 240, 240);
      for (let i = 0; i < 4; i++) {
        const a = this.t * 0.8 + i * 1.57;
        c.fillStyle = '#fff3b0';
        c.font = '16px system-ui'; c.fillText('✦', Math.cos(a) * 78 * s - 6, -50 * s + Math.sin(a) * 62 * s);
      }
    }

    if (p.species === 'trenggiling' && this.curl > 0.45) { this._pangolinBall(c, p, s); return; }
    c.save();
    c.scale(sx * (1 + this.curl * 0.25), sy * (1 - this.curl * 0.45));
    const tint = p.sick ? '#b9d98a' : pal.body;

    // telinga / aksesori belakang
    c.fillStyle = tint;
    if (p.species === 'mochi') {
      for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 18, -78); c.lineTo(d * 44, -112); c.lineTo(d * 44, -66); c.fill(); }
      c.fillStyle = pal.light;
      for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 28, -80); c.lineTo(d * 40, -100); c.lineTo(d * 40, -72); c.fill(); }
    } else if (p.species === 'bubu') {
      for (const d of [-1, 1]) { c.beginPath(); c.arc(d * 36, -78, 17, 0, 7); c.fill(); }
      c.fillStyle = pal.light;
      for (const d of [-1, 1]) { c.beginPath(); c.arc(d * 36, -78, 9, 0, 7); c.fill(); }
    }
    if (p.species === 'babi') { // ekor keriting & telinga lipat
      c.strokeStyle = pal.dark; c.lineWidth = 4;
      c.beginPath(); c.arc(52, -34, 7, 0.3, Math.PI * 1.55); c.stroke();
      for (const d of [-1, 1]) {
        c.fillStyle = pal.dark; c.beginPath(); c.moveTo(d * 14, -80); c.lineTo(d * 46, -98); c.lineTo(d * 48, -66); c.closePath(); c.fill();
        c.fillStyle = pal.body; c.beginPath(); c.moveTo(d * 20, -79); c.lineTo(d * 41, -91); c.lineTo(d * 42, -71); c.closePath(); c.fill();
      }
    } else if (p.species === 'trenggiling') { // ekor panjang bersisik & telinga kecil
      c.strokeStyle = pal.dark; c.lineWidth = 13; c.lineCap = 'round';
      c.beginPath(); c.moveTo(40, -14); c.quadraticCurveTo(82, -6, 90, -34); c.stroke();
      c.strokeStyle = pal.body; c.lineWidth = 8;
      c.beginPath(); c.moveTo(42, -15); c.quadraticCurveTo(80, -8, 87, -33); c.stroke();
      c.fillStyle = pal.dark;
      for (const d of [-1, 1]) { c.beginPath(); c.arc(d * 34, -78, 9, 0, 7); c.fill(); }
    }
    // kaki
    c.fillStyle = p.sick ? '#9dc070' : pal.dark;
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 20, -4, 15, 9, 0, 0, 7); c.fill(); }

    // badan
    const g = c.createRadialGradient(-14, -64, 8, 0, -42, 56);
    g.addColorStop(0, p.sick ? '#d8efb0' : pal.light);
    g.addColorStop(1, tint);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, -42, 48, 42, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath(); c.ellipse(0, -28, 28, 22, 0, 0, 7); c.fill();

    if (p.species === 'babi') { // moncong
      c.fillStyle = '#ffa3a8'; c.beginPath(); c.ellipse(0, -34, 17, 11.5, 0, 0, 7); c.fill();
      c.fillStyle = '#e8737e';
      for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 6, -34, 2.8, 4.2, 0, 0, 7); c.fill(); }
    } else if (p.species === 'trenggiling') { // sisik di punggung & moncong lancip
      c.save();
      c.beginPath(); c.ellipse(0, -42, 48, 42, 0, 0, 7); c.clip();
      c.lineWidth = 1.7;
      for (let r = 0; r < 9; r++) {
        const y = -84 + r * 10.5;
        for (let x = -56 + (r % 2) * 8; x < 58; x += 16) {
          const dx = x / 31, dy = (y + 34) / 27;
          if (dx * dx + dy * dy < 1) continue; // wajah dibiarkan polos
          c.fillStyle = r % 2 ? pal.body : '#d8b58d'; c.strokeStyle = pal.dark;
          c.beginPath(); c.arc(x, y, 9.5, 0, Math.PI); c.fill(); c.stroke();
        }
      }
      c.restore();
      c.fillStyle = pal.light; c.beginPath(); c.ellipse(0, -34, 12, 9, 0, 0, 7); c.fill();
      c.fillStyle = pal.accent; c.beginPath(); c.ellipse(0, -38, 4.2, 3, 0, 0, 7); c.fill();
    }
    const eq = p.equipped || {};
    if (p.species === 'leafy' && !eq.head) {
      c.fillStyle = '#3fae56';
      const sway = Math.sin(this.t * 2) * 0.12;
      c.save(); c.translate(0, -82); c.rotate(sway);
      c.strokeStyle = '#3fae56'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -16); c.stroke();
      for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 14, -20, 16, 8, d * -0.5, 0, 7); c.fill(); }
      c.restore();
    }
    if (p.stage === 'adult' && p.form === 'radiant' && !eq.head) {
      c.fillStyle = '#ffd166';
      c.beginPath(); c.moveTo(-14, -82); c.lineTo(-14, -96); c.lineTo(-7, -88); c.lineTo(0, -100); c.lineTo(7, -88); c.lineTo(14, -96); c.lineTo(14, -82); c.fill();
    }

    this._face(c, p, mood, pal);
    this._wear(c, p);
    this._elder(c, p);
    c.restore();
  }

  /** Trenggiling menggulung: bola bersisik yang berputar. */
  _pangolinBall(c, p, s) {
    const pal = palOf(p);
    const R = 38 * s * (0.62 + 0.38 * Math.min(1, (this.curl - 0.45) / 0.55));
    c.save();
    c.translate(0, -R);
    c.rotate(this.rollAngle);
    c.fillStyle = p.sick ? '#b9d98a' : pal.body;
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    c.save();
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.clip();
    c.lineWidth = 1.6; c.strokeStyle = pal.dark;
    const step = R / 3.3;
    for (let r = -4, i = 0; r <= 4; r++, i++) {
      const y = r * step * 0.9;
      for (let x = -R - 10 + (i % 2) * (step * 0.9); x < R + 10; x += step * 1.8) {
        c.fillStyle = i % 2 ? pal.body : '#d8b58d';
        c.beginPath(); c.arc(x, y, step * 0.95, 0, Math.PI); c.fill(); c.stroke();
      }
    }
    c.restore();
    c.strokeStyle = pal.dark; c.lineWidth = 2.2; // lingkar ekor yang melilit
    c.beginPath(); c.arc(0, 0, R * 0.62, 0.4, 2.5); c.stroke();
    c.fillStyle = pal.accent; c.beginPath(); c.ellipse(R * 0.62, R * 0.18, 5 * s + 1, 3.6 * s + 1, 0.5, 0, 7); c.fill(); // ujung moncong
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.28)'; // kilau diam (tidak ikut berputar)
    c.beginPath(); c.ellipse(-R * 0.35, -R * 1.35, R * 0.28, R * 0.16, -0.5, 0, 7); c.fill();
  }

  /** Aksesori dari toko, digambar di koordinat badan (kaki di y=0, kepala di y≈-84). */
  _wear(c, p) {
    const eq = p.equipped || {};
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    switch (eq.neck) {
      case 'syal':
        c.strokeStyle = '#ef476f'; c.lineWidth = 11;
        c.beginPath(); c.ellipse(0, -27, 39, 10, 0, 0.04 * Math.PI, 0.96 * Math.PI); c.stroke();
        c.fillStyle = '#ef476f'; c.beginPath(); c.roundRect(13, -26, 14, 30, 5); c.fill();
        c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(13, -12, 14, 3); c.fillRect(13, -2, 14, 3);
        break;
      case 'dasi':
        c.fillStyle = '#6c7bd9';
        c.beginPath(); c.moveTo(0, -19); c.lineTo(-18, -29); c.lineTo(-18, -9); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(0, -19); c.lineTo(18, -29); c.lineTo(18, -9); c.closePath(); c.fill();
        c.fillStyle = '#4a58b5'; c.beginPath(); c.roundRect(-5, -25, 10, 12, 3); c.fill();
        break;
      default:
    }
    switch (eq.face) {
      case 'kacamata':
        c.fillStyle = 'rgba(24,20,48,.94)';
        for (const x of [-31, 5]) { c.beginPath(); c.roundRect(x, -61, 26, 19, 6); c.fill(); }
        c.strokeStyle = '#18142f'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-5, -53); c.lineTo(5, -53); c.moveTo(-31, -54); c.lineTo(-40, -58); c.moveTo(31, -54); c.lineTo(40, -58); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
        for (const x of [-27, 9]) { c.beginPath(); c.moveTo(x, -57); c.lineTo(x + 8, -57); c.stroke(); }
        break;
      case 'bulat':
        c.strokeStyle = '#e0a526'; c.lineWidth = 3;
        c.fillStyle = 'rgba(190,225,255,.22)';
        for (const x of [-17, 17]) { c.beginPath(); c.arc(x, -50, 13.5, 0, 7); c.fill(); c.stroke(); }
        c.beginPath(); c.arc(0, -52, 4, Math.PI, 0); c.stroke();
        break;
      default:
    }
    switch (eq.head) {
      case 'pita':
        c.save(); c.translate(27, -77); c.rotate(0.4);
        c.fillStyle = '#ff6b9d';
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-19, -11); c.lineTo(-19, 11); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(0, 0); c.lineTo(19, -11); c.lineTo(19, 11); c.closePath(); c.fill();
        c.fillStyle = '#e63e7d'; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
        c.restore();
        break;
      case 'baret':
        c.fillStyle = '#3f7fd6';
        c.beginPath(); c.ellipse(0, -80, 33, 21, 0, Math.PI, 0); c.fill();
        c.fillStyle = '#2f64b0'; c.beginPath(); c.ellipse(6, -80, 38, 6, 0, 0, 7); c.fill();
        c.fillStyle = '#ffd166'; c.beginPath(); c.arc(0, -101, 3.5, 0, 7); c.fill();
        break;
      case 'penyihir':
        c.fillStyle = '#2b2440';
        c.beginPath(); c.ellipse(0, -81, 40, 9, 0, 0, 7); c.fill();
        c.beginPath(); c.roundRect(-23, -124, 46, 44, [6, 6, 0, 0]); c.fill();
        c.fillStyle = '#ff6b9d'; c.fillRect(-23, -93, 46, 9);
        c.fillStyle = '#3a3258'; c.beginPath(); c.ellipse(0, -124, 23, 6, 0, 0, 7); c.fill();
        break;
      case 'mahkota':
        c.fillStyle = '#ffd166'; c.strokeStyle = '#e0a526'; c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(-27, -80); c.lineTo(-29, -108); c.lineTo(-14, -94); c.lineTo(0, -114); c.lineTo(14, -94); c.lineTo(29, -108); c.lineTo(27, -80);
        c.closePath(); c.fill(); c.stroke();
        for (const [x, col] of [[-14, '#ef476f'], [0, '#6ee7ff'], [14, '#ef476f']]) { c.fillStyle = col; c.beginPath(); c.arc(x, -87, 3.4, 0, 7); c.fill(); }
        break;
      default:
    }
    c.restore();
  }

  _face(c, p, mood, pal) {
    if (mood === 'thirsty') mood = 'hungry'; // ekspresi serupa (mulut terbuka)
    const arrived = this.activity?.arrived;
    if (this.bathing || arrived) mood = 'happy';
    const ey = -50 + (arrived && this.activity.kind === 'sandbox' ? 4 : 0); // menunduk melihat pasir
    const ia = !this.walking && !this.activity ? this.idleAct : null;
    let look = this.walking ? this.facing * 3 : Math.sin(this.t * 0.5) * 2;
    if (!this.walking && this.t - this.lookT < 2.6) look = Math.max(-3.6, Math.min(3.6, (this.lookX - this.x) / 45)); // ikuti kursor
    else if (ia?.kind === 'look') look = Math.sin((this.t - ia.start) * 3) * 3.6;
    const yawning = ia?.kind === 'yawn';
    const blinking = this.blink > 0 || yawning;

    c.fillStyle = 'rgba(255,120,150,.4)';
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 30, -34, 8, 5, 0, 0, 7); c.fill(); }

    c.strokeStyle = '#2b2440'; c.fillStyle = '#2b2440'; c.lineWidth = 3.4; c.lineCap = 'round';
    for (const d of [-1, 1]) {
      const ex = d * 17 + look;
      if (mood === 'sleep' || blinking) {
        c.beginPath(); c.arc(ex, ey, 7, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
      } else if (mood === 'sick') {
        c.beginPath(); c.moveTo(ex - 6, ey - 5); c.lineTo(ex + 6, ey + 5); c.moveTo(ex + 6, ey - 5); c.lineTo(ex - 6, ey + 5); c.stroke();
      } else if (mood === 'happy' && (this.bathing || Math.sin(this.t * 0.9) > 0.55)) {
        c.beginPath(); c.arc(ex, ey + 4, 7, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
      } else {
        c.beginPath(); c.ellipse(ex, ey, 6.5, mood === 'tired' ? 4 : 8.5, 0, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + 2, ey - 3, 2.4, 0, 7); c.fill();
        c.fillStyle = '#2b2440';
      }
    }
    if (mood === 'sad' || mood === 'hungry') {
      c.lineWidth = 2.6;
      for (const d of [-1, 1]) {
        const ex = d * 17 + look;
        c.beginPath(); c.moveTo(ex - 6, ey - 16 + (d < 0 ? 3 : 0)); c.lineTo(ex + 6, ey - 16 + (d < 0 ? 0 : 3)); c.stroke();
      }
    }
    // mulut
    const my = p.species === 'babi' ? -19 : p.species === 'trenggiling' ? -23 : -30;
    c.lineWidth = 3.2;
    c.beginPath();
    if (yawning) { const o = Math.sin(Math.min(1, (this.t - ia.start) / 0.9) * Math.PI); c.ellipse(0, my + 3, 8, 3 + o * 9, 0, 0, 7); c.fillStyle = '#7a2d4b'; c.fill(); }
    else if (this.eating && this.t - this.eating.start > 0.4) { c.ellipse(0, my + 2, 7, 3 + Math.abs(Math.sin(this.t * 9)) * 7, 0, 0, 7); c.fillStyle = '#7a2d4b'; c.fill(); }
    else if (mood === 'happy') { c.arc(0, my - 4, 11, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke(); c.fillStyle = '#ff7a9c'; c.beginPath(); c.arc(0, my + 2, 6, 0, Math.PI); c.fill(); }
    else if (mood === 'sad' || mood === 'sick' || mood === 'dirty') { c.arc(0, my + 10, 9, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
    else if (mood === 'hungry') { c.ellipse(0, my + 2, 6, 8 + Math.sin(this.t * 6) * 1.5, 0, 0, 7); c.stroke(); }
    else if (mood === 'sleep') { c.arc(0, my, 5, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
    else { c.arc(0, my - 2, 8, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    if (mood === 'sick') { c.fillStyle = 'rgba(120,200,255,.9)'; c.beginPath(); c.ellipse(36, -66 + Math.sin(this.t * 4) * 3, 4, 6, 0, 0, 7); c.fill(); }
    if (mood === 'dirty') { c.font = '14px system-ui'; c.fillText('🪰', 34 + Math.sin(this.t * 5) * 6, -90 + Math.cos(this.t * 4) * 5); }
  }

  _particles(c) {
    for (const q of this.particles) {
      const a = 1 - q.life / q.max;
      c.globalAlpha = Math.max(0, a);
      if (q.kind === 'heart') { c.font = `${q.size}px system-ui`; c.fillText('💖', q.x, q.y); }
      else if (q.kind === 'coin') { c.font = `${q.size + 6}px system-ui`; c.fillText('🪙', q.x, q.y); }
      else if (q.kind === 'confetti') { c.save(); c.translate(q.x, q.y); c.rotate(q.rot + q.life * 7); c.fillStyle = q.color; c.fillRect(-4, -2, 8, 4); c.restore(); }
      else if (q.kind === 'spark') { c.font = `${q.size}px system-ui`; c.fillText('✨', q.x, q.y); }
      else if (q.kind === 'zzz') { c.font = '700 20px system-ui'; c.fillStyle = '#e8ecff'; c.fillText('Z', q.x, q.y); }
      else if (q.kind === 'sand') { c.fillStyle = '#e4c27f'; c.beginPath(); c.arc(q.x, q.y, 3, 0, 7); c.fill(); }
      else if (q.kind === 'bubble') { const wx = q.x + Math.sin(q.life * 5) * 4; c.strokeStyle = 'rgba(255,255,255,.9)'; c.fillStyle = 'rgba(200,235,255,.35)'; c.lineWidth = 1.6; c.beginPath(); c.arc(wx, q.y, q.size, 0, 7); c.fill(); c.stroke(); }
      else if (q.kind === 'drop') { c.fillStyle = '#bfeaff'; c.beginPath(); c.arc(q.x, q.y, 3.4, 0, 7); c.fill(); }
      else if (q.kind === 'text') {
        c.font = '700 20px system-ui, sans-serif';
        c.lineWidth = 4; c.strokeStyle = 'rgba(20,20,50,.7)'; c.strokeText(q.text, q.x, q.y);
        c.fillStyle = q.color; c.fillText(q.text, q.x, q.y);
      }
      c.globalAlpha = 1;
    }
  }
}

export { SPOTS };
