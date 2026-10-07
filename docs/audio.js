// Efek suara sintetis (WebAudio) — tanpa file, mati bila dibisukan.
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

function tone(freq, dur = 0.12, { type = 'sine', vol = 0.07, delay = 0, to = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
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
};

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }
