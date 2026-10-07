// Mini-game "Tangkap Bintang": 20 detik, klik/ketuk bintang yang jatuh.
const DURATION = 20;
const GW = 480;
const GH = 360;

export function playStarCatch(canvas, { reducedMotion = false } = {}) {
  return new Promise((resolve) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GW * dpr;
    canvas.height = GH * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    let score = 0;
    let t = 0;
    let spawn = 0;
    let last = performance.now();
    let raf = 0;
    let stopped = false;
    const items = [];
    const pops = [];

    function onDown(e) {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * GW;
      const y = ((e.clientY - r.top) / r.height) * GH;
      for (let i = items.length - 1; i >= 0; i--) {
        const s = items[i];
        if (Math.hypot(x - s.x, y - s.y) < s.r + 10) {
          score += s.gold ? 3 : 1;
          pops.push({ x: s.x, y: s.y, t: 0, text: s.gold ? '+3' : '+1' });
          items.splice(i, 1);
          return;
        }
      }
    }
    canvas.addEventListener('pointerdown', onDown);

    function finish(cancelled) {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      resolve(cancelled ? null : score);
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      spawn -= dt;
      if (spawn <= 0 && t < DURATION) {
        const gold = Math.random() < 0.15;
        items.push({ x: 30 + Math.random() * (GW - 60), y: -20, v: (reducedMotion ? 60 : 90) + Math.random() * 70 + t * 3, r: gold ? 15 : 19, gold, rot: Math.random() * 6 });
        spawn = Math.max(0.28, 0.75 - t * 0.02);
      }
      for (const s of items) { s.y += s.v * dt; s.rot += dt * 2; }
      for (let i = items.length - 1; i >= 0; i--) if (items[i].y > GH + 30) items.splice(i, 1);
      for (const p of pops) p.t += dt;

      const g = c.createLinearGradient(0, 0, 0, GH);
      g.addColorStop(0, '#12154a'); g.addColorStop(1, '#3b2f7a');
      c.fillStyle = g; c.fillRect(0, 0, GW, GH);
      for (const s of items) {
        c.save(); c.translate(s.x, s.y); c.rotate(Math.sin(s.rot) * 0.4);
        c.font = `${s.r * 2}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(s.gold ? '🌟' : '⭐', 0, 0);
        c.restore();
      }
      c.textBaseline = 'alphabetic';
      for (const p of pops) {
        c.globalAlpha = Math.max(0, 1 - p.t / 0.7);
        c.font = '700 22px system-ui'; c.fillStyle = '#ffe27a'; c.fillText(p.text, p.x, p.y - p.t * 40);
      }
      c.globalAlpha = 1;
      c.textAlign = 'start';
      c.font = '700 18px system-ui'; c.fillStyle = '#fff';
      c.fillText(`Skor ${score}`, 14, 28);
      const left = Math.max(0, DURATION - t);
      c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(GW - 134, 16, 120, 8);
      c.fillStyle = '#ffd166'; c.fillRect(GW - 134, 16, 120 * (left / DURATION), 8);

      if (t >= DURATION + 0.4) return finish(false);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    canvas._cancel = () => finish(true);
  });
}
