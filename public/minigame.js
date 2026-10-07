// Mini-game (canvas 480×360). Setiap game mengembalikan Promise<skor 0..60 | null bila dibatalkan>.
import { sfx, buzz } from './audio.js';

const GW = 480;
const GH = 360;
const MAX = 60;
const rnd = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

/** Kerangka bersama: menyiapkan kanvas, loop, input pointer, pembatalan. */
function run(canvas, spec, opts = {}) {
  return new Promise((resolve) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GW * dpr;
    canvas.height = GH * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const state = spec.init(opts);
    let t = 0, last = performance.now(), raf = 0, stopped = false, endAt = null;

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * GW, y: ((e.clientY - r.top) / r.height) * GH };
    };
    const down = (e) => { if (endAt === null) spec.down?.(state, local(e), t); };
    const move = (e) => { if (endAt === null) spec.move?.(state, local(e), t); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);

    function finish(cancelled) {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      resolve(cancelled ? null : Math.max(0, Math.min(MAX, Math.round(spec.score(state, t)))));
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      spec.update(state, dt, t);
      spec.draw(c, state, t);
      if (endAt === null && spec.done(state, t)) endAt = t + 0.5;
      if (endAt !== null && t >= endAt) return finish(false);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    canvas._cancel = () => finish(true);
  });
}

function bg(c, a = '#12154a', b = '#3b2f7a') {
  const g = c.createLinearGradient(0, 0, 0, GH);
  g.addColorStop(0, a); g.addColorStop(1, b);
  c.fillStyle = g; c.fillRect(0, 0, GW, GH);
}
function hud(c, label, left, total) {
  c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  c.font = '700 18px system-ui'; c.fillStyle = '#fff'; c.fillText(label, 14, 28);
  c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(GW - 134, 16, 120, 8);
  c.fillStyle = left < total * 0.25 ? '#ff6b81' : '#ffd166'; c.fillRect(GW - 134, 16, 120 * Math.max(0, left / total), 8);
}
function pops(c, list, dt) {
  c.textAlign = 'center';
  for (const p of list) {
    p.t += dt;
    c.globalAlpha = Math.max(0, 1 - p.t / 0.8);
    c.font = '700 22px system-ui'; c.fillStyle = p.color || '#ffe27a';
    c.fillText(p.text, p.x, p.y - p.t * 44);
  }
  c.globalAlpha = 1;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].t > 0.8) list.splice(i, 1);
  c.textAlign = 'start';
}

// ---------- 1) Tangkap Bintang ----------
const stars = {
  init: (o) => ({ items: [], pops: [], score: 0, spawn: 0, dur: 20, slow: o.reducedMotion }),
  down(s, p) {
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      if (Math.hypot(p.x - it.x, p.y - it.y) < it.r + 12) {
        s.score += it.gold ? 3 : 1;
        s.pops.push({ x: it.x, y: it.y, t: 0, text: it.gold ? '+3' : '+1' });
        s.items.splice(i, 1);
        sfx.coin(); buzz(8);
        return;
      }
    }
  },
  update(s, dt, t) {
    s.spawn -= dt;
    if (s.spawn <= 0 && t < s.dur) {
      const gold = Math.random() < 0.15;
      s.items.push({ x: rnd(30, GW - 30), y: -20, v: (s.slow ? 60 : 90) + Math.random() * 70 + t * 3, r: gold ? 15 : 19, gold, rot: Math.random() * 6 });
      s.spawn = Math.max(0.28, 0.75 - t * 0.02);
    }
    for (const it of s.items) { it.y += it.v * dt; it.rot += dt * 2; }
    s.items = s.items.filter((it) => it.y < GH + 30);
  },
  draw(c, s, t) {
    bg(c);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const it of s.items) {
      c.save(); c.translate(it.x, it.y); c.rotate(Math.sin(it.rot) * 0.4);
      c.font = `${it.r * 2}px system-ui, sans-serif`; c.fillText(it.gold ? '🌟' : '⭐', 0, 0);
      c.restore();
    }
    c.textBaseline = 'alphabetic';
    pops(c, s.pops, 1 / 60);
    hud(c, `Skor ${s.score}`, s.dur - t, s.dur);
  },
  done: (s, t) => t >= s.dur + 0.4,
  score: (s) => s.score,
};

// ---------- 2) Pasangan Memori ----------
const EMOJI = ['🍎', '🍰', '🦋', '⭐', '🌸', '🐟', '🎈', '🍄'];
const memory = {
  init() {
    const cards = shuffle([...EMOJI, ...EMOJI]).map((e) => ({ e, flip: 0, up: false, done: false, shake: 0 }));
    return { cards, first: null, lock: 0, pending: null, matches: 0, dur: 50, pops: [], end: null };
  },
  geom(i) {
    const col = i % 4, row = Math.floor(i / 4), w = 84, h = 66, gx = 12, gy = 10;
    return { x: (GW - (4 * w + 3 * gx)) / 2 + col * (w + gx), y: 38 + row * (h + gy), w, h };
  },
  down(s, p) {
    if (s.lock > 0 || s.end !== null) return;
    for (let i = 0; i < s.cards.length; i++) {
      const g = memory.geom(i), cd = s.cards[i];
      if (p.x < g.x || p.x > g.x + g.w || p.y < g.y || p.y > g.y + g.h || cd.up || cd.done) continue;
      cd.up = true; sfx.flip(); buzz(6);
      if (s.first === null) { s.first = i; return; }
      const a = s.cards[s.first];
      if (a.e === cd.e) {
        a.done = cd.done = true; s.first = null; s.matches += 1;
        s.pops.push({ x: g.x + g.w / 2, y: g.y, t: 0, text: '+6', color: '#6ee7a8' });
        sfx.match(); buzz([10, 30, 10]);
      } else { s.lock = 0.8; s.pending = [s.first, i]; s.first = null; sfx.bad(); }
      return;
    }
  },
  update(s, dt, t) {
    for (const cd of s.cards) {
      const target = cd.up || cd.done ? 1 : 0;
      cd.flip += Math.sign(target - cd.flip) * Math.min(Math.abs(target - cd.flip), dt * 7);
    }
    if (s.lock > 0) {
      s.lock -= dt;
      if (s.lock <= 0 && s.pending) { for (const i of s.pending) s.cards[i].up = false; s.pending = null; }
    }
    if (s.matches === 8 && s.end === null) s.end = t;
  },
  draw(c, s, t) {
    bg(c, '#1a1450', '#3d2a6e');
    for (let i = 0; i < s.cards.length; i++) {
      const g = memory.geom(i), cd = s.cards[i];
      const sx = Math.abs(Math.cos(Math.PI * cd.flip)), face = cd.flip > 0.5;
      c.save(); c.translate(g.x + g.w / 2, g.y + g.h / 2); c.scale(Math.max(0.02, sx), 1);
      c.fillStyle = face ? (cd.done ? '#d8fbe6' : '#fff6e5') : '#6c7bd9';
      c.beginPath(); c.roundRect(-g.w / 2, -g.h / 2, g.w, g.h, 12); c.fill();
      if (!face) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.beginPath(); c.roundRect(-g.w / 2 + 6, -g.h / 2 + 6, g.w - 12, g.h - 12, 8); c.stroke(); c.font = '24px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText('✦', 0, 2); }
      else { c.font = '34px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(cd.e, 0, 3); }
      c.restore();
    }
    c.textBaseline = 'alphabetic';
    pops(c, s.pops, 1 / 60);
    hud(c, `Pasangan ${s.matches}/8`, s.dur - t, s.dur);
  },
  done: (s, t) => s.end !== null || t >= s.dur,
  score: (s, t) => s.matches * 6 + (s.matches === 8 ? Math.min(12, Math.floor((s.dur - (s.end ?? s.dur)) / 3)) : 0),
};

// ---------- 3) Tangkap Makanan ----------
const GOOD = [['🍎', 1], ['🍰', 2], ['🍔', 2], ['🌟', 3]];
const BAD = [['🧦', -2], ['🪨', -2], ['🦠', -3]];
const food = {
  init: (o) => ({ x: GW / 2, tx: GW / 2, items: [], pops: [], score: 0, spawn: 0.4, dur: 25, slow: o.reducedMotion, shake: 0 }),
  down(s, p) { s.tx = p.x; },
  move(s, p) { s.tx = p.x; },
  update(s, dt, t) {
    s.x += (s.tx - s.x) * Math.min(1, dt * 14);
    s.x = Math.max(44, Math.min(GW - 44, s.x));
    s.spawn -= dt;
    if (s.spawn <= 0 && t < s.dur) {
      const bad = Math.random() < 0.3 + Math.min(0.12, t * 0.005);
      const [e, v] = bad ? BAD[Math.floor(Math.random() * BAD.length)] : (Math.random() < 0.12 ? GOOD[3] : GOOD[Math.floor(Math.random() * 3)]);
      s.items.push({ x: rnd(30, GW - 30), y: -20, v: (s.slow ? 90 : 120) + t * 5 + rnd(0, 50), e, val: v, rot: rnd(0, 6) });
      s.spawn = Math.max(0.3, 0.62 - t * 0.012);
    }
    for (const it of s.items) {
      it.y += it.v * dt; it.rot += dt * 3;
      if (!it.got && it.y > GH - 62 && it.y < GH - 28 && Math.abs(it.x - s.x) < 46) {
        it.got = true;
        s.score = Math.max(0, s.score + it.val);
        s.pops.push({ x: it.x, y: GH - 70, t: 0, text: it.val > 0 ? `+${it.val}` : `${it.val}`, color: it.val > 0 ? '#6ee7a8' : '#ff6b81' });
        if (it.val > 0) { sfx.coin(); buzz(8); } else { sfx.bad(); buzz([20, 40, 20]); s.shake = 0.25; }
      }
    }
    s.items = s.items.filter((it) => !it.got && it.y < GH + 30);
    s.shake = Math.max(0, s.shake - dt);
  },
  draw(c, s, t) {
    bg(c, '#173a56', '#2f6a5a');
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0, GH - 30, GW, 30);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const it of s.items) { c.save(); c.translate(it.x, it.y); c.rotate(Math.sin(it.rot) * 0.4); c.font = '34px system-ui'; c.fillText(it.e, 0, 0); c.restore(); }
    c.textBaseline = 'alphabetic';
    // keranjang
    c.save(); c.translate(s.x + (s.shake > 0 ? Math.sin(t * 60) * 4 : 0), GH - 44);
    c.fillStyle = '#b87a43'; c.beginPath(); c.moveTo(-46, -6); c.lineTo(46, -6); c.lineTo(34, 30); c.lineTo(-34, 30); c.closePath(); c.fill();
    c.strokeStyle = '#8a5a2e'; c.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 12, -6); c.lineTo(i * 9, 30); c.stroke(); }
    c.beginPath(); c.moveTo(-42, 8); c.lineTo(42, 8); c.moveTo(-38, 19); c.lineTo(38, 19); c.stroke();
    c.fillStyle = '#d9a770'; c.beginPath(); c.roundRect(-50, -12, 100, 9, 4); c.fill();
    c.restore();
    pops(c, s.pops, 1 / 60);
    hud(c, `Skor ${s.score}`, s.dur - t, s.dur);
    if (t < 3) { c.textAlign = 'center'; c.font = '600 14px system-ui'; c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText('Geser untuk menggerakkan keranjang', GW / 2, 56); c.textAlign = 'start'; }
  },
  done: (s, t) => t >= s.dur + 0.4,
  score: (s) => s.score,
};

// ---------- 4) Irama Ketuk ----------
const LANES = ['#ff6b9d', '#ffd166', '#6ee7a8', '#7fd6ff'];
const HIT_Y = 292;
const FALL = 1.3; // detik dari atas ke garis
const rhythm = {
  init() {
    const notes = [];
    let lastLane = -1;
    for (let b = 1.8; b < 21; b += 0.52) {
      if (Math.random() < 0.72) {
        let lane = Math.floor(Math.random() * 4);
        if (lane === lastLane && Math.random() < 0.6) lane = (lane + 1 + Math.floor(Math.random() * 3)) % 4;
        notes.push({ lane, tm: b, done: false, miss: false });
        lastLane = lane;
      }
    }
    return { notes, score: 0, combo: 0, best: 0, pops: [], flash: [0, 0, 0, 0], dur: 22.5 };
  },
  down(s, p, t) {
    const lane = Math.max(0, Math.min(3, Math.floor(p.x / (GW / 4))));
    s.flash[lane] = 1;
    let best = null;
    for (const n of s.notes) if (n.lane === lane && !n.done && !n.miss && Math.abs(n.tm - t) < 0.24 && (!best || Math.abs(n.tm - t) < Math.abs(best.tm - t))) best = n;
    sfx.note(lane);
    if (!best) { s.score = Math.max(0, s.score - 1); s.combo = 0; s.pops.push({ x: lane * 120 + 60, y: HIT_Y - 20, t: 0, text: '−1', color: '#ff6b81' }); return; }
    best.done = true;
    const perfect = Math.abs(best.tm - t) < 0.09;
    s.score += perfect ? 2 : 1;
    s.combo += 1; s.best = Math.max(s.best, s.combo);
    s.pops.push({ x: lane * 120 + 60, y: HIT_Y - 20, t: 0, text: perfect ? 'Sempurna!' : 'Bagus', color: perfect ? '#ffe27a' : '#b8ffd6' });
    buzz(8);
  },
  update(s, dt, t) {
    for (const n of s.notes) if (!n.done && !n.miss && t > n.tm + 0.26) { n.miss = true; s.combo = 0; }
    for (let i = 0; i < 4; i++) s.flash[i] = Math.max(0, s.flash[i] - dt * 4);
  },
  draw(c, s, t) {
    bg(c, '#150f3a', '#2f1f66');
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)'; c.fillRect(i * 120, 0, 120, GH);
      if (s.flash[i] > 0) { c.fillStyle = `${LANES[i]}${Math.round(s.flash[i] * 70).toString(16).padStart(2, '0')}`; c.fillRect(i * 120, HIT_Y - 60, 120, 100); }
    }
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, HIT_Y); c.lineTo(GW, HIT_Y); c.stroke();
    for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(i * 120 + 60, HIT_Y, 22, 0, 7); c.fill(); }
    for (const n of s.notes) {
      if (n.done) continue;
      const y = HIT_Y - ((n.tm - t) / FALL) * (HIT_Y + 20);
      if (y < -30 || y > GH + 30) continue;
      c.globalAlpha = n.miss ? 0.25 : 1;
      c.fillStyle = LANES[n.lane];
      c.beginPath(); c.roundRect(n.lane * 120 + 14, y - 14, 92, 28, 12); c.fill();
      c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.roundRect(n.lane * 120 + 20, y - 10, 80, 7, 4); c.fill();
      c.globalAlpha = 1;
    }
    pops(c, s.pops, 1 / 60);
    hud(c, `Skor ${s.score}${s.combo > 2 ? `  🔥${s.combo}` : ''}`, s.dur - t, s.dur);
    if (t < 1.6) { c.textAlign = 'center'; c.font = '600 14px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('Ketuk jalur saat not menyentuh garis', GW / 2, 56); c.textAlign = 'start'; }
  },
  done: (s, t) => t >= s.dur,
  score: (s) => s.score,
};

const GAMES = { stars, memory, food, rhythm };

/** Mainkan satu mini-game. */
export function playGame(id, canvas, opts = {}) {
  const spec = GAMES[id];
  if (!spec) return Promise.resolve(null);
  return run(canvas, spec, opts);
}

/** Dipertahankan agar kompatibel dengan kode lama. */
export const playStarCatch = (canvas, opts) => playGame('stars', canvas, opts);
