// Adegan taman bermain: render canvas, AI jalan peliharaan, partikel.
const W = 900;
const H = 520;
const HORIZON = 330;

const PALETTES = {
  mochi: { body: '#ffb3c7', light: '#ffe0e9', dark: '#f27ea1', accent: '#ff6f9c' },
  bubu: { body: '#9cc8ff', light: '#dcecff', dark: '#5e9be8', accent: '#3f7fd6' },
  leafy: { body: '#a6e6a1', light: '#e3f9df', dark: '#62c46b', accent: '#3fae56' },
};

// Posisi wahana (x, y dasar). Kunci harus cocok dengan PLAYGROUND di server.
const SPOTS = {
  swing: { x: 150, y: 410, r: 70, label: 'Ayunan' },
  sandbox: { x: 330, y: 450, r: 70, label: 'Kotak Pasir' },
  ball: { x: 490, y: 440, r: 45, label: 'Bola' },
  pond: { x: 650, y: 455, r: 80, label: 'Kolam' },
  trampoline: { x: 800, y: 425, r: 65, label: 'Trampolin' },
};

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
const TREASURE_Y = 432;
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
  if (s.energy < 20) return 'tired';
  if (s.hygiene < 25 || p.poop >= 3) return 'dirty';
  if (s.happiness < 30) return 'sad';
  if (s.happiness > 70 && s.hunger > 40) return 'happy';
  return 'neutral';
}
const NEED_ICON = { hungry: '🍎', tired: '💤', dirty: '🛁', sick: '💊', sad: '💭' };

export class Scene {
  constructor(canvas, { reducedMotion = false } = {}) {
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
    this.bubble = null; // {text, until}
    this.bathing = null; // {start, until}
    this.blink = 0;
    this.blinkTimer = 3;
    this.particles = [];
    this.hover = null;
    this.getLocked = () => ({}); // (item) => {locked, label}
    this.getHour = null; // jam waktu-game (0-24)
    this.clouds = Array.from({ length: 5 }, () => ({ x: rand(0, W), y: rand(30, 170), s: rand(0.7, 1.4), v: rand(4, 10) }));
    this.stars = Array.from({ length: 60 }, () => ({ x: rand(0, W), y: rand(0, HORIZON - 40), r: rand(0.6, 1.6), p: rand(0, 6) }));
    this.ballX = SPOTS.ball.x;
    this.lastStage = null;
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
  }

  _resize() {
    const cssW = this.canvas.parentElement.clientWidth || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = cssW / W;
    this.canvas.style.height = `${cssW * (H / W)}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssW * (H / W) * dpr);
    this.k = this.canvas.width / W;
  }

  setPet(pet) {
    const prev = this.pet;
    this.pet = pet;
    if (pet && prev && prev.stage === 'egg' && pet.stage !== 'egg') this.burst(this.x, this.y - 50, 'spark', 24);
    if (pet && prev && prev.stage !== pet.stage && prev.stage !== 'egg') this.burst(this.x, this.y - 60, 'spark', 30);
    if (pet?.sleeping && !prev?.sleeping) this.activity = null;
  }

  toWorld(evt) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((evt.clientX - r.left) / r.width) * W, y: ((evt.clientY - r.top) / r.height) * H };
  }

  hitTest(pt) {
    if (this.treasure && Math.hypot(pt.x - this.treasure.x, pt.y - (TREASURE_Y - 20)) < 44) return { type: 'treasure' };
    if (this.pet && this.pet.stage !== 'egg' && Math.hypot(pt.x - this.x, pt.y - (this.y - 45)) < 55) return { type: 'pet' };
    if (this.pet?.stage === 'egg' && Math.hypot(pt.x - this.x, pt.y - (this.y - 45)) < 45) return { type: 'pet' };
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
    if (p && p.stage !== 'egg' && !p.sleeping) this._updatePetMotion(dt);
    else {
      this.walking = false;
      this.eating = null; // animasi tidak boleh macet bila peliharaan tertidur
      this.bathing = null;
    }

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

  _updatePetMotion(dt) {
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
      if (act.kind === 'pond' && Math.sin(k * 5) > 0.9 && Math.random() < dt * 20) this.burst(this.x, this.y - 8, 'drop', 2);
      return;
    }
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.targetX = rand(90, W - 90);
      this.idleTimer = rand(3, 7);
    }
    const dx = this.targetX - this.x;
    if (Math.abs(dx) > 5) this._walk(dx, dt, 38);
    else this.walking = false;
  }

  _walk(dx, dt, speed) {
    this.walking = true;
    this.facing = dx > 0 ? 1 : -1;
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
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
    this._sky(c, hour, dark);
    this._hills(c, dark);
    this._ground(c, dark);
    this._fence(c, dark);
    this._items(c);
    this._poop(c);
    this._treasureChest(c);
    if (this.pet) this._pet(c);
    this._sandboxFront(c);
    this._particles(c);
    if (this.pet?.sleeping) {
      c.fillStyle = 'rgba(8,10,40,.35)';
      c.fillRect(0, 0, W, H);
    } else if (dark > 0.2) {
      c.fillStyle = `rgba(10,14,50,${0.22 * dark})`;
      c.fillRect(0, 0, W, H);
    }
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
        c.globalAlpha = dark * (0.5 + 0.5 * Math.sin(this.t * 1.5 + s.p));
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
      const glow = c.createRadialGradient(cx, cy, 10, cx, cy, 90);
      glow.addColorStop(0, 'rgba(255,230,150,.7)');
      glow.addColorStop(1, 'rgba(255,230,150,0)');
      c.fillStyle = glow;
      c.fillRect(cx - 100, cy - 100, 200, 200);
      c.fillStyle = '#ffe27a';
      c.beginPath(); c.arc(cx, cy, 30, 0, 7); c.fill();
    }
    // awan
    for (const cl of this.clouds) {
      c.fillStyle = `rgba(255,255,255,${0.85 - dark * 0.55})`;
      c.beginPath();
      c.ellipse(cl.x, cl.y, 46 * cl.s, 16 * cl.s, 0, 0, 7);
      c.ellipse(cl.x - 26 * cl.s, cl.y + 4, 28 * cl.s, 12 * cl.s, 0, 0, 7);
      c.ellipse(cl.x + 28 * cl.s, cl.y + 5, 30 * cl.s, 12 * cl.s, 0, 0, 7);
      c.fill();
    }
  }

  _hills(c, dark) {
    const col = (a, b) => mix(a, b, dark);
    c.fillStyle = col('#8fd19e', '#2c5a58');
    c.beginPath();
    c.moveTo(0, HORIZON);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, HORIZON - 50 - Math.sin(x / 130) * 26);
    c.lineTo(W, HORIZON + 10); c.lineTo(0, HORIZON + 10); c.fill();
    c.fillStyle = col('#6cc07f', '#244c4a');
    c.beginPath();
    c.moveTo(0, HORIZON);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, HORIZON - 20 - Math.sin(x / 90 + 2) * 16);
    c.lineTo(W, HORIZON + 10); c.lineTo(0, HORIZON + 10); c.fill();
  }

  _ground(c, dark) {
    const g = c.createLinearGradient(0, HORIZON - 10, 0, H);
    g.addColorStop(0, mix('#7ed48b', '#2f6a55', dark));
    g.addColorStop(1, mix('#4fae67', '#1c4a3f', dark));
    c.fillStyle = g;
    c.fillRect(0, HORIZON - 10, W, H - HORIZON + 10);
    c.strokeStyle = mix('#5fbe74', '#2a6150', dark);
    c.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = (i * 137) % W, y = HORIZON + 20 + ((i * 53) % (H - HORIZON - 20));
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y - 8); c.moveTo(x, y); c.lineTo(x + 3, y - 9); c.stroke();
    }
    // bunga
    for (let i = 0; i < 14; i++) {
      const x = (i * 211 + 40) % W, y = HORIZON + 30 + ((i * 97) % (H - HORIZON - 50));
      c.fillStyle = ['#fff', '#ffd6e0', '#fff3a8'][i % 3];
      c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill();
    }
  }

  _fence(c, dark) {
    c.fillStyle = mix('#f3e3c3', '#6a6a86', dark);
    const y = HORIZON + 2;
    c.fillRect(0, y + 14, W, 6);
    c.fillRect(0, y + 30, W, 5);
    for (let x = 10; x < W; x += 46) {
      c.beginPath();
      c.moveTo(x, y + 40); c.lineTo(x, y + 6); c.lineTo(x + 8, y - 4); c.lineTo(x + 16, y + 6); c.lineTo(x + 16, y + 40);
      c.fill();
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
      else if (st.cooldown > 0) this._tag(c, s.x, s.y - 70, `⏳ ${Math.ceil(st.cooldown / 1000)}d`);
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

  _shadow(c, x, y, rx) {
    c.fillStyle = 'rgba(0,0,0,.16)';
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
    c.fillStyle = '#4fbf6a';
    c.beginPath(); c.ellipse(s.x + 40, s.y - 4, 13, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#ff8fab';
    c.beginPath(); c.arc(s.x + 42, s.y - 8, 4, 0, 7); c.fill();
  }

  _draw_trampoline(c, s) {
    const act = this.activity?.kind === 'trampoline' && this.activity.arrived;
    const sag = act ? Math.max(0, Math.sin((this.t - this.activity.start) * 7)) * 4 : 0;
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
    const act = this.activity?.arrived ? this.activity : null;
    let lift = 0, rot = 0, px = this.x, py = this.y, sit = false;
    if (this.walking) lift = Math.abs(Math.sin(this.t * 11)) * 9;
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
        lift = Math.abs(Math.sin(k * 3.5)) * 120;
        if (this.reduced) lift *= 0.4;
      } else if (act.kind === 'ball') lift = Math.abs(Math.sin(k * 6)) * 14;
      else if (act.kind === 'sandbox') {
        // berdiri di dalam pasir, badan bergoyang saat menyekop
        py = lerp(this.y, SPOTS.sandbox.y + 2, blend);
        rot = Math.sin(k * 5 + 1.2) * 0.07 * blend;
        sit = true;
      }
      else if (act.kind === 'pond') { py -= 6; lift = Math.abs(Math.sin(k * 5)) * 18; }
    }
    if (this.eating && this.t - this.eating.start > 0.5) { lift += Math.abs(Math.sin(this.t * 9)) * 4; rot = Math.sin(this.t * 9) * 0.05; }
    if (this.bathing) { rot = Math.sin(this.t * 7) * 0.09; px += Math.sin(this.t * 7) * 3; }
    if (!sit || act?.kind === 'swing') this._shadow(c, px, this.y + 2, 38 * this._stageScale(p) * (1 - Math.min(lift, 140) / 260));
    c.save();
    c.translate(px, py - lift);
    c.rotate(rot);
    if (p.stage === 'egg') this._egg(c, p);
    else this._creature(c, p);
    c.restore();
    if (act?.kind === 'swing') this._swingHands(c);
    if (act?.kind === 'sandbox') this._shovelDraw(c, this.t - act.start);
    this._food(c, px, py);
    this._bath(c, px, py);

    const mood = moodOf(p);
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

  _swingHands(c) {
    const sp = SPOTS.swing, a = this._swingAngle(), sc = this._stageScale(this.pet);
    const cos = Math.cos(a), sin = Math.sin(a);
    c.fillStyle = this.pet.sick ? '#9dc070' : PALETTES[this.pet.species].body;
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
    c.fillStyle = this.pet.sick ? '#9dc070' : PALETTES[this.pet.species].body;
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
      c.fillStyle = this.pet.sick ? '#9dc070' : PALETTES[this.pet.species].body;
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
    return { egg: 1, baby: 0.62, child: 0.8, teen: 0.95, adult: 1.1 }[p.stage] || 1;
  }

  _egg(c, p) {
    const pal = PALETTES[p.species];
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
    const pal = PALETTES[p.species];
    const s = this._stageScale(p);
    const mood = moodOf(p);
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

    c.save();
    c.scale(sx, sy);
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
    c.restore();
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
    const arrived = this.activity?.arrived;
    if (this.bathing || arrived) mood = 'happy';
    const ey = -50 + (arrived && this.activity.kind === 'sandbox' ? 4 : 0); // menunduk melihat pasir
    const look = this.walking ? this.facing * 3 : Math.sin(this.t * 0.5) * 2;
    const blinking = this.blink > 0;

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
    const my = -30;
    c.lineWidth = 3.2;
    c.beginPath();
    if (this.eating && this.t - this.eating.start > 0.4) { c.ellipse(0, my + 2, 7, 3 + Math.abs(Math.sin(this.t * 9)) * 7, 0, 0, 7); c.fillStyle = '#7a2d4b'; c.fill(); }
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
