// Efek suara & musik latar sintetis (WebAudio) — tanpa file; getar untuk HP. Semua mati saat dibisukan.
let ctx = null;
let muted = false;

function ac() {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { return null; }
  return ctx;
}

function tone(freq, dur = 0.12, { type = 'sine', vol = 0.07, delay = 0, to = 0, attack = 0.012 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur = 0.4, vol = 0.05, freq = 1800) {
  const a = ac();
  if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880];

export const sfx = {
  click: () => tone(620, 0.05, { type: 'triangle', vol: 0.04 }),
  ok: () => { tone(523, 0.09, { type: 'triangle' }); tone(784, 0.14, { type: 'triangle', delay: 0.08 }); },
  error: () => tone(200, 0.2, { type: 'sawtooth', vol: 0.04, to: 120 }),
  coin: () => { tone(988, 0.08, { type: 'square', vol: 0.035 }); tone(1319, 0.2, { type: 'square', vol: 0.035, delay: 0.07 }); },
  eat: () => [0, 0.16, 0.32, 0.48].forEach((d) => tone(220 + Math.random() * 60, 0.08, { type: 'triangle', delay: d, to: 150 })),
  splash: () => { noise(0.7, 0.06, 2400); tone(900, 0.2, { vol: 0.03, to: 400, delay: 0.1 }); },
  pop: () => { tone(520, 0.06, { type: 'triangle', vol: 0.04 }); tone(780, 0.09, { type: 'triangle', vol: 0.04, delay: 0.05 }); },
  heart: () => { tone(660, 0.1, { vol: 0.05 }); tone(880, 0.18, { vol: 0.05, delay: 0.09 }); },
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.06, delay: i * 0.11 })),
  treasure: () => [880, 1109, 1319].forEach((f, i) => tone(f, 0.12, { type: 'sine', vol: 0.05, delay: i * 0.08 })),
  // mini-game & dunia
  flip: () => tone(440, 0.05, { type: 'triangle', vol: 0.035 }),
  match: () => { tone(660, 0.08, { vol: 0.05 }); tone(990, 0.16, { vol: 0.05, delay: 0.07 }); },
  bad: () => tone(160, 0.18, { type: 'sawtooth', vol: 0.04, to: 100 }),
  note: (i = 0) => tone(PENTA[i % PENTA.length], 0.16, { type: 'triangle', vol: 0.06 }),
  thunder: () => { noise(1.6, 0.09, 380); tone(70, 0.9, { vol: 0.06, to: 40 }); },
  sticker: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.05, delay: i * 0.07 })),
  fanfare: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.06, delay: i * 0.1 })),
};

export function setMuted(m) {
  muted = m;
  if (m) music.pause(); else music.resume();
}
export function isMuted() { return muted; }

/** Getar singkat di HP yang mendukung (mengikuti tombol suara). */
export function buzz(pattern = 12) {
  try { if (!muted && navigator.vibrate) navigator.vibrate(pattern); } catch { /* abaikan */ }
}

// ---------- musik latar generatif ----------
const SCALES = {
  day: [261.63, 293.66, 329.63, 392, 440, 523.25],
  night: [220, 261.63, 293.66, 329.63, 392],
  rain: [196, 220, 261.63, 293.66, 329.63],
};
let want = false;
let mood = 'day';
let timer = 0;

function musicTick() {
  timer = 0;
  if (!want || muted) return;
  const a = ac();
  if (!a) return;
  const sc = SCALES[mood] || SCALES.day;
  const root = sc[Math.floor(Math.random() * sc.length)];
  const fifth = sc[(sc.indexOf(root) + 2) % sc.length];
  tone(root / 2, 3.6, { type: 'sine', vol: 0.016, attack: 1.2 });
  tone(fifth / 2, 3.6, { type: 'sine', vol: 0.012, attack: 1.4 });
  const n = mood === 'night' ? 1 : 2;
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.75) tone(sc[Math.floor(Math.random() * sc.length)] * (Math.random() < 0.3 ? 2 : 1), 1.4, { type: 'triangle', vol: 0.02, delay: 0.5 + i * 0.9, attack: 0.06 });
  }
  timer = setTimeout(musicTick, 2400 + Math.random() * 1400);
}

export const music = {
  start() { want = true; if (!timer && !muted) musicTick(); },
  stop() { want = false; clearTimeout(timer); timer = 0; },
  pause() { clearTimeout(timer); timer = 0; },
  resume() { if (want && !timer) musicTick(); },
  setMood(m) { mood = SCALES[m] ? m : 'day'; },
  isOn: () => want,
};
