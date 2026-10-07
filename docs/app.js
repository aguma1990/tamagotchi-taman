import { Scene, moodOf } from './scene.js';
import { playStarCatch } from './minigame.js';
import { sfx, setMuted } from './audio.js';
import { api, LOCAL } from './api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const STAGE = { egg: 'Telur', baby: 'Bayi', child: 'Anak', teen: 'Remaja', adult: 'Dewasa' };
const SPECIES = { mochi: 'Mochi', bubu: 'Bubu', leafy: 'Leafy' };
const EFFECT_ICON = { hunger: '🍖', happiness: '😊', energy: '⚡', hygiene: '🫧', health: '❤️', coins: '🪙', xp: '✨' };
const STAT_COLORS = { hunger: '#ffb86b', happiness: '#ff7aa8', energy: '#ffd166', hygiene: '#7fd6ff', health: '#6ee7a8' };
const STAT_LABEL = { hunger: 'Kenyang', happiness: 'Senang', energy: 'Energi', hygiene: 'Bersih', health: 'Sehat' };
const SLOT_LABEL = { head: 'Kepala', face: 'Wajah', neck: 'Leher' };
const MOOD_LABEL = { sleep: 'tidur 💤', sick: 'sakit', hungry: 'lapar', tired: 'mengantuk', dirty: 'kotor', sad: 'sedih', happy: 'bahagia', neutral: 'tenang' };
const MOOD_MSG = {
  hungry: ['Perutku keroncongan…', 'Lapar nih, kasih makan dong!'],
  tired: ['Ngantuk banget…', 'Aku butuh istirahat…'],
  dirty: ['Aku kotor, mandiin dong!'],
  sick: ['Badanku nggak enak…'],
  sad: ['Main yuk, aku bosan…'],
};
const IDLE_MSG = ['La la la~', 'Tamannya indah ya!', 'Kamu yang terbaik!', 'Ayo main lagi!', 'Hehe~'];
const ACT_MSG = {
  feed: 'Nyam, enak banget!', clean: 'Wangi~ makasih!', cuddle: 'Hehe, sayang kamu!', play: 'Seru banget!',
  minigame: 'Bintangnya cantik!', medicine: 'Udah enakan!', collect: 'Dapat harta!', buy: 'Keren, aku suka!',
};
const TOAST_TYPES = new Set(['achievement', 'quest', 'levelup', 'treasure', 'hatch', 'evolve', 'sick', 'daily']);

let S = null; // snapshot terakhir dari server
let clockOffset = 0; // waktu server - waktu klien
let busy = false;
let gameOpen = false;
let lastToastT = Date.now();
let lastMood = null;
let prevCoins = null;
const rendered = new Map();
const serverNow = () => Date.now() + clockOffset;

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids);
  return n;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function setSaved(ok) {
  const e = $('#saved');
  e.classList.toggle('error', !ok);
  e.lastChild.textContent = ok ? ' Tersimpan' : ' Server mati — mencoba lagi…';
}

function toast(text, error = false) {
  const e = el('div', { class: `toast${error ? ' error' : ''}`, text });
  $('#toasts').append(e);
  setTimeout(() => e.remove(), 2800);
}

// ---------- Suara ----------
const SOUND_KEY = 'tamagotchi:sound';
function soundOn() { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } }
function applySound() {
  setMuted(!soundOn());
  $('#soundBtn').textContent = soundOn() ? '🔊' : '🔇';
}
$('#soundBtn').addEventListener('click', () => {
  try { localStorage.setItem(SOUND_KEY, soundOn() ? 'off' : 'on'); } catch { /* abaikan */ }
  applySound();
  sfx.click();
});
applySound();

// ---------- Scene ----------
const scene = new Scene($('#scene'), { reducedMotion: reduced });
scene.getLocked = () => {
  const out = {};
  if (!S?.pet) return out;
  for (const [key, item] of Object.entries(S.config.playground)) {
    out[key] = {
      locked: S.pet.level < item.unlock,
      unlock: item.unlock,
      cooldown: Math.max(0, (S.pet.cooldowns[`play:${key}`] || 0) - serverNow()),
    };
  }
  return out;
};

// Jam taman: waktu-game sendiri (bukan jam laptop), dihitung dari kelahiran peliharaan.
function gameHour() {
  if (!S?.pet) return 8;
  const { dayRealMinutes, dayStartHour } = S.config;
  const dayMs = dayRealMinutes * 60e3;
  const frac = (((serverNow() - S.pet.createdAt) % dayMs) + dayMs) % dayMs / dayMs;
  return (dayStartHour + frac * 24) % 24;
}
scene.getHour = gameHour;
setInterval(() => {
  const h = gameHour();
  $('#clock b').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}, 1000);

let last = performance.now();
(function loop(now) {
  scene.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  scene.draw();
  requestAnimationFrame(loop);
})(last);

const canvas = $('#scene');
const tip = $('#tooltip');
canvas.addEventListener('pointermove', (e) => {
  const hit = scene.hitTest(scene.toWorld(e));
  scene.hover = hit?.type === 'item' ? hit.key : hit?.type === 'treasure' ? 'treasure' : null;
  canvas.style.cursor = hit ? 'pointer' : 'default';
  if (hit?.type === 'pet' && S?.pet) {
    const r = canvas.parentElement.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = S.pet.stage === 'egg' ? 'Telur' : `${S.pet.name} · ${MOOD_LABEL[moodOf(S.pet)] || ''}`;
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
  } else tip.hidden = true;
});
canvas.addEventListener('pointerleave', () => { scene.hover = null; tip.hidden = true; });
canvas.addEventListener('click', (e) => {
  const hit = scene.hitTest(scene.toWorld(e));
  if (!hit || !S?.pet) return;
  if (hit.type === 'treasure') {
    const x = S.pet.treasure?.x ?? 400;
    return act({ type: 'collect' }, () => { scene.burst(x, 410, 'coin', 10); scene.confetti(x, 400, 16); sfx.treasure(); });
  }
  if (hit.type === 'pet') return doCuddle();
  act({ type: 'play', item: hit.key }, () => scene.goPlay(hit.key));
});

// ---------- Aksi ----------
const doCuddle = () => act({ type: 'cuddle' }, () => { scene.burst(scene.x, scene.y - 70, 'heart', 7); sfx.heart(); });
const SOUND_FOR = { feed: () => sfx.eat(), clean: () => sfx.splash(), play: () => sfx.ok(), minigame: () => sfx.ok(), medicine: () => sfx.ok(), buy: () => sfx.coin(), quest: () => sfx.ok(), daily: () => sfx.coin() };

async function act(action, onOk) {
  if (busy) return;
  busy = true;
  const before = S?.pet;
  try {
    const r = await api('/api/action', action);
    apply(r);
    onOk?.();
    SOUND_FOR[action.type]?.();
    floatEffects(r.effects);
    if (r.effects?.coins > 0 && action.type !== 'buy') setTimeout(() => sfx.coin(), 250);
    if (ACT_MSG[action.type]) scene.say(ACT_MSG[action.type]);
    if (before && S.pet.level > before.level) levelUpFx();
    refreshHistory();
  } catch (err) {
    sfx.error();
    toast(err.message, true);
  } finally {
    busy = false;
  }
}

function levelUpFx() {
  sfx.levelup();
  scene.confetti(scene.x, scene.y - 80, 36);
  scene.say(`Level ${S.pet.level}! Aku makin kuat!`, 4);
}

function floatEffects(effects = {}) {
  let i = 0;
  for (const [k, v] of Object.entries(effects)) {
    if (!v) continue;
    const text = `${EFFECT_ICON[k]}${v > 0 ? '+' : ''}${v}`;
    const n = i++;
    setTimeout(() => scene.float(text, scene.x + (n % 3 - 1) * 46, scene.y - 120 - Math.floor(n / 3) * 26, v > 0 ? '#b8ffd6' : '#ffc2c2'), n * 140);
  }
}

const ACTIONS = {
  feed: () => toggleFood(),
  sleep: () => act({ type: S.pet.sleeping ? 'wake' : 'sleep' }),
  minigame: () => startMinigame(),
  cuddle: () => doCuddle(),
  clean: () => act({ type: 'clean' }, () => scene.bathe()),
  medicine: () => act({ type: 'medicine' }, () => scene.burst(scene.x, scene.y - 60, 'spark', 12)),
};
$$('.act').forEach((btn) => btn.addEventListener('click', () => { sfx.click(); ACTIONS[btn.dataset.act]?.(); }));

const KEYS = { m: 'feed', b: 'clean', t: 'sleep', p: 'cuddle', o: 'medicine', g: 'minigame' };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    foodPop.hidden = true;
    if (gameOpen) $('#gameCanvas')._cancel?.();
    $('#away').hidden = true;
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if ($$('.modal').some((m) => !m.hidden)) return;
  const a = KEYS[e.key.toLowerCase()];
  const btn = a && $(`[data-act="${a}"]`);
  if (btn && !btn.disabled && S?.pet) btn.click();
});

// Menu makanan
const foodPop = $('#foodPop');
function toggleFood() {
  if (!foodPop.hidden) { foodPop.hidden = true; return; }
  foodPop.replaceChildren();
  for (const [id, f] of Object.entries(S.config.foods)) {
    const price = `${f.energy >= 10 ? `⚡+${f.energy}  ` : ''}${f.cost ? `🪙 ${f.cost}` : 'Gratis'}`;
    foodPop.append(el('button', {
      type: 'button',
      disabled: S.pet.coins < f.cost,
      onclick: () => { foodPop.hidden = true; act({ type: 'feed', food: id }, () => scene.eat(f.emoji)); },
    }, el('span', { class: 'em', text: f.emoji }), el('span', { class: 'nm', text: f.label }), el('span', { class: 'pr', text: price })));
  }
  foodPop.hidden = false;
}
document.addEventListener('click', (e) => {
  if (!foodPop.hidden && !e.target.closest('.food-pop') && !e.target.closest('[data-act="feed"]')) foodPop.hidden = true;
});

// ---------- Mini-game ----------
async function startMinigame() {
  if (!S?.pet || gameOpen) return;
  const cd = (S.pet.cooldowns.minigame || 0) - serverNow();
  if (S.pet.sleeping) return toast(`${S.pet.name} sedang tidur.`, true);
  if (S.pet.stage === 'egg') return toast('Telur belum menetas.', true);
  if (S.pet.stats.energy < 15) return toast(`${S.pet.name} terlalu lelah.`, true);
  if (cd > 0) return toast(`Tunggu ${Math.ceil(cd / 1000)} detik lagi.`, true);
  gameOpen = true;
  $('#game').hidden = false;
  const c = $('#gameCanvas');
  $('#gameCancel').onclick = () => c._cancel?.();
  const score = await playStarCatch(c, { reducedMotion: reduced });
  $('#game').hidden = true;
  gameOpen = false;
  if (score === null) return;
  act({ type: 'minigame', score }, () => scene.burst(scene.x, scene.y - 80, 'spark', 20));
}

// ---------- Render ----------
function fmtAge(min) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d}h ${h}j` : h ? `${h}j ${m}m` : `${m}m`;
}

/** Render ulang bagian UI hanya bila datanya berubah (hindari kedip & hilangnya hover). */
function renderIf(key, sig, fn) {
  const s = JSON.stringify(sig);
  if (rendered.get(key) === s) return;
  rendered.set(key, s);
  fn();
}

function apply(snap) {
  S = snap;
  clockOffset = snap.now - Date.now();
  if (!snap.created) { $('#welcome').hidden = false; return; }
  $('#welcome').hidden = true;
  const p = snap.pet;
  scene.setPet(p);
  scene.treasure = p.treasure;

  const coinsEl = $('#coins');
  $('b', coinsEl).textContent = p.coins;
  if (prevCoins !== null && p.coins > prevCoins && !reduced) {
    coinsEl.classList.remove('pop'); void coinsEl.offsetWidth; coinsEl.classList.add('pop');
  }
  prevCoins = p.coins;

  $('#petName').textContent = p.name;
  $('#chatInput').placeholder = `Ngobrol dengan ${p.name}…`;
  const form = p.form === 'radiant' ? ' · Bersinar ✨' : '';
  $('#petSub').textContent = p.stage === 'egg'
    ? `Telur ${SPECIES[p.species]} · segera menetas…`
    : `${SPECIES[p.species]} · ${STAGE[p.stage]}${form} · ${fmtAge(p.ageMinutes)}`;

  const lvl = p.level;
  const base = 25 * (lvl - 1) ** 2, next = 25 * lvl ** 2;
  $('#level').textContent = lvl;
  $('#xpFill').style.width = `${Math.round(((p.xp - base) / (next - base)) * 100)}%`;
  $('#xpLabel').textContent = `${p.xp - base} / ${next - base} XP menuju level ${lvl + 1}`;

  for (const row of $$('.stat')) {
    const v = Math.round(p.stats[row.dataset.k]);
    row.classList.toggle('low', v < 25);
    row.classList.toggle('mid', v >= 25 && v < 50);
    $('.bar i', row).style.width = `${v}%`;
    $('.bar', row).setAttribute('aria-valuenow', v);
    $('.bar', row).setAttribute('aria-label', STAT_LABEL[row.dataset.k]);
    $('b', row).textContent = v;
  }

  const egg = p.stage === 'egg';
  const btn = (a) => $(`[data-act="${a}"]`);
  const set = (a, disabled, why, label) => { btn(a).disabled = disabled; btn(a).title = disabled && why ? why : label; };
  set('feed', egg || p.sleeping, egg ? 'Telur belum menetas' : 'Sedang tidur', 'Makan (M)');
  set('clean', egg || p.sleeping, egg ? 'Telur belum menetas' : 'Sedang tidur', 'Mandi (B)');
  set('cuddle', egg || p.sleeping, egg ? 'Telur belum menetas' : 'Sedang tidur', 'Peluk (P)');
  set('minigame', egg || p.sleeping, egg ? 'Telur belum menetas' : 'Sedang tidur', 'Tangkap Bintang (G)');
  set('medicine', egg || !p.sick, `${p.name} tidak sakit`, `Obat 🪙 ${S.config.medicineCost} (O)`);
  set('sleep', egg, 'Telur belum menetas', p.sleeping ? 'Bangunkan (T)' : 'Tidur (T)');
  $('#sleepBtn').lastChild.textContent = p.sleeping ? 'Bangun' : 'Tidur';
  $('#sleepBtn span').textContent = p.sleeping ? '☀️' : '😴';

  // ucapan saat suasana hati berubah
  const mood = moodOf(p);
  if (lastMood !== null && mood !== lastMood && MOOD_MSG[mood]) scene.say(pick(MOOD_MSG[mood]), 4);
  lastMood = mood;

  renderIf('quests', [p.daily, S.streak, Object.keys(p.achievements), S.config.quests], renderQuests);
  renderIf('shop', [p.coins, p.level, p.inventory, p.equipped], renderShop);
  renderIf('about', [p.totals, p.ageMinutes, p.careSamples > 0 ? Math.round(p.careSum / p.careSamples) : 100], renderAbout);
  updateBadge();
  updateTitle();
}

function questReady(p) {
  const claimable = p.daily.quests.some((q) => !q.claimed && q.progress >= S.config.quests[q.id].goal);
  return claimable || !p.daily.loginClaimed;
}
function updateBadge() { $('#questBadge').hidden = !questReady(S.pet); }

const BASE_TITLE = 'Tamagotchi Taman';
function updateTitle() {
  const p = S.pet;
  const mood = moodOf(p);
  const need = { hungry: '🍎 lapar!', tired: '💤 mengantuk', dirty: '🛁 kotor', sick: '💊 sakit!' }[mood];
  const gift = questReady(p) ? '🎁 ' : '';
  document.title = need ? `${gift}${p.name} ${need} · ${BASE_TITLE}` : `${gift}${BASE_TITLE}`;
}

// ---------- Misi & prestasi ----------
function renderQuests() {
  const p = S.pet, cfg = S.config;
  const claimedToday = p.daily.loginClaimed;
  const nextStreak = claimedToday ? S.streak : S.streak + 1;
  const reward = 5 + Math.min(Math.max(nextStreak, 1), 7) * 2;

  $('#daily').replaceChildren(
    el('div', {},
      el('div', { class: 't', text: '🎁 Hadiah harian' }),
      el('div', { class: 's', text: claimedToday ? `🔥 Streak ${S.streak} hari · kembali besok!` : `🔥 Streak ${S.streak} hari · hari ini +${reward} 🪙` })),
    el('button', {
      class: 'claim', disabled: claimedToday, text: claimedToday ? 'Diambil ✓' : 'Ambil',
      onclick: () => act({ type: 'daily' }, () => { scene.burst(scene.x, scene.y - 80, 'coin', 8); scene.confetti(scene.x, scene.y - 80, 14); }),
    }));

  const list = $('#quests');
  list.replaceChildren();
  for (const q of p.daily.quests) {
    const def = cfg.quests[q.id];
    const done = q.progress >= def.goal;
    const bar = el('i');
    bar.style.width = `${Math.min(100, (q.progress / def.goal) * 100)}%`;
    list.append(el('li', { class: `${done ? 'done' : ''} ${q.claimed ? 'claimed' : ''}` },
      el('span', { class: 'ico', text: def.icon }),
      el('div', {}, el('div', { class: 'nm', text: `${def.label} (${Math.min(q.progress, def.goal)}/${def.goal})` }), el('div', { class: 'qbar' }, bar)),
      done && !q.claimed
        ? el('button', { class: 'claim', text: `+${def.reward} 🪙`, onclick: () => act({ type: 'quest', id: q.id }, () => { scene.burst(scene.x, scene.y - 80, 'coin', 6); }) })
        : el('span', { class: 'rw', text: q.claimed ? '✓' : `🪙 ${def.reward}` })));
  }
  const allDone = p.daily.quests.every((q) => q.claimed);
  list.append(el('li', { class: allDone ? 'claimed' : '' }, el('span', { class: 'ico', text: '🎉' }),
    el('div', { class: 'nm', text: 'Selesaikan semua misi hari ini' }), el('span', { class: 'rw', text: allDone ? '✓' : `🪙 +${cfg.questBonus}` })));

  // cara dapat koin (angka diambil dari konfigurasi server)
  const pg = Object.values(cfg.playground), qr = Object.values(cfg.quests).map((q) => q.reward), ac = cfg.achievements.map((a) => a.reward);
  const lines = [
    ['🎪', 'Main di wahana taman', `${Math.min(...pg.map((x) => x.coins))}–${Math.max(...pg.map((x) => x.coins))} 🪙 tiap main`],
    ['⭐', 'Tangkap Bintang', 'sampai 12 🪙 tiap 2 menit'],
    ['💰', 'Harta karun di taman', 'muncul ±tiap 25 menit, ketuk: 3–8 🪙'],
    ['🎁', 'Hadiah harian + streak', '7–19 🪙 (naik tiap hari beruntun)'],
    ['📋', 'Misi harian', `${Math.min(...qr)}–${Math.max(...qr)} 🪙 per misi + bonus ${cfg.questBonus}`],
    ['🚀', 'Naik level', '5 × level 🪙'],
    ['🏆', 'Prestasi', `${Math.min(...ac)}–${Math.max(...ac)} 🪙 sekali`],
  ];
  $('#howtoList').replaceChildren(...lines.map(([i, a, b]) => el('li', {}, `${i} `, el('b', { text: a }), ` — ${b}`)));

  const got = Object.keys(p.achievements).length;
  $('#achCount').textContent = `${got}/${cfg.achievements.length}`;
  $('#achievements').replaceChildren(...cfg.achievements.map((a) => {
    const on = !!p.achievements[a.id];
    return el('div', { class: on ? '' : 'locked', title: `${a.label} — ${a.desc} (+${a.reward} 🪙)`, 'aria-label': `${a.label}${on ? ' (terbuka)' : ' (terkunci)'}`, text: a.icon });
  }));
}

// ---------- Toko ----------
function renderShop() {
  const p = S.pet, shop = $('#shop');
  shop.replaceChildren();
  for (const slot of ['head', 'face', 'neck']) {
    shop.append(el('h4', { text: SLOT_LABEL[slot] }));
    for (const [id, it] of Object.entries(S.config.cosmetics).filter(([, v]) => v.slot === slot)) {
      const owned = p.inventory.includes(id), on = p.equipped[slot] === id;
      const locked = p.level < it.unlock, poor = p.coins < it.cost;
      let button;
      if (owned) button = el('button', { type: 'button', text: on ? 'Lepas' : 'Pakai', onclick: () => act({ type: 'equip', item: id }, () => sfx.click()) });
      else button = el('button', {
        type: 'button', class: 'buy', disabled: locked || poor, text: locked ? `🔒 Lv ${it.unlock}` : `Beli 🪙 ${it.cost}`,
        title: locked ? `Terbuka di level ${it.unlock}` : poor ? 'Koin belum cukup' : `Beli ${it.label}`,
        onclick: () => act({ type: 'buy', item: id }, () => { scene.confetti(scene.x, scene.y - 80, 18); }),
      });
      shop.append(el('div', { class: `item${on ? ' on' : ''}` },
        el('span', { class: 'em', text: it.emoji }), el('span', { class: 'nm', text: it.label }),
        el('span', { class: 'meta', text: owned ? (on ? 'Dipakai' : 'Dimiliki') : SLOT_LABEL[slot] }), button));
    }
  }
}

// ---------- Riwayat / Grafik / Statistik ----------
function hhmm(t) { return new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
function dayLabel(t) {
  const d = new Date(t), today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
}
function renderEvents(list, events) {
  list.replaceChildren();
  if (!events.length) return list.append(el('li', { class: 'empty', text: 'Belum ada riwayat.' }));
  let day = '';
  for (const e of events) {
    const label = dayLabel(e.t);
    if (label !== day) { day = label; list.append(el('li', { class: 'day', text: label })); }
    list.append(el('li', {}, el('time', { text: hhmm(e.t), datetime: new Date(e.t).toISOString() }), el('span', { text: e.msg })));
  }
}

function handleNewEvents(events) {
  const fresh = events.filter((e) => e.t > lastToastT).sort((a, b) => a.t - b.t);
  for (const e of fresh) {
    lastToastT = Math.max(lastToastT, e.t);
    if (!TOAST_TYPES.has(e.type)) continue;
    if (e.type === 'treasure' && !e.msg.includes('Ada harta')) continue;
    toast(e.msg);
    if (e.type === 'treasure') sfx.treasure();
    else if (e.type === 'achievement' || e.type === 'quest') sfx.ok();
  }
}

async function refreshHistory() {
  try {
    const { events } = await api('/api/history?limit=80');
    renderEvents($('#history'), events);
    handleNewEvents(events);
    return events;
  } catch { return []; }
}

async function drawChart() {
  const c = $('#chart');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = c.clientWidth || 340, h = 170;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  let samples = [];
  try { samples = (await api('/api/samples?hours=24')).samples; } catch { /* kosong */ }
  const L = 26, B = 18, T = 6, R = 6;
  g.font = '10px system-ui'; g.fillStyle = 'rgba(255,255,255,.45)'; g.strokeStyle = 'rgba(255,255,255,.08)';
  for (const v of [0, 50, 100]) {
    const y = T + (1 - v / 100) * (h - T - B);
    g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
    g.fillText(v, 2, y + 3);
  }
  const now = serverNow(), span = 24 * 3600e3;
  const X = (t) => L + ((t - (now - span)) / span) * (w - L - R);
  const Y = (v) => T + (1 - v / 100) * (h - T - B);
  [0, 6, 12, 18, 24].forEach((hrs) => {
    const t = now - span + (hrs / 24) * span;
    g.fillText(new Date(t).getHours().toString().padStart(2, '0'), X(t) - 6, h - 4);
  });
  if (samples.length < 2) {
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '13px system-ui';
    g.fillText('Data grafik muncul setelah ~30 menit bermain.', L + 8, h / 2);
  } else {
    g.lineWidth = 2; g.lineJoin = 'round';
    for (const [k, color] of Object.entries(STAT_COLORS)) {
      g.strokeStyle = color; g.beginPath();
      samples.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s[k])) : g.moveTo(X(s.t), Y(s[k]))));
      g.stroke();
    }
  }
  const legend = $('#legend');
  if (!legend.childElementCount) {
    for (const [k, color] of Object.entries(STAT_COLORS)) {
      const i = el('i'); i.style.background = color;
      legend.append(el('span', {}, i, STAT_LABEL[k]));
    }
  }
}

function renderAbout() {
  const p = S.pet, t = p.totals;
  const rows = [
    ['Lahir', new Date(p.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })],
    ['Umur', fmtAge(p.ageMinutes)],
    ['Kualitas perawatan', `${Math.round(p.careSamples ? p.careSum / p.careSamples : 100)}%`],
    ['Makan', `${t.meals}×`], ['Bermain di taman', `${t.plays}×`], ['Mandi', `${t.cleans}×`],
    ['Dipeluk', `${t.cuddles}×`], ['Minum obat', `${t.medicines}×`], ['Tangkap Bintang', `${t.minigames}×`],
    ['Harta karun', `${t.treasures}×`], ['Misi selesai', `${t.quests}×`],
  ];
  $('#about').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

const TAB_KEY = 'tamagotchi:tab';
function showTab(name) {
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
  for (const n of ['quests', 'shop', 'chat', 'history', 'stats']) $(`#tab-${n}`).hidden = n !== name;
  if (name === 'stats') drawChart();
  try { localStorage.setItem(TAB_KEY, name); } catch { /* abaikan */ }
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  sfx.click();
  showTab(b.dataset.tab);
  if (b.dataset.tab === 'chat') { loadChat(); $('#chatInput').focus(); }
}));
try { const t = localStorage.getItem(TAB_KEY); if (t) { showTab(t); if (t === 'chat') setTimeout(loadChat, 0); } } catch { /* abaikan */ }

// ---------- Obrolan ----------
const AVATAR = { mochi: '🐱', bubu: '🐻', leafy: '🌱' };
const CHIPS = ['Apa kabar?', 'Lapar nggak?', 'Mau main?', 'Misi hari ini?', 'Ceritakan lelucon', 'Sayang kamu'];
let chatBusy = false;
let chatLoaded = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function msgNode(m) {
  const mine = m.from === 'you';
  const body = el('div', { class: 'b' }, el('span', { text: m.text }));
  if (m.t) body.append(el('time', { text: hhmm(m.t) }));
  return el('div', { class: `msg ${mine ? 'you' : 'pet'}` }, ...(mine ? [body] : [el('span', { class: 'av', text: AVATAR[S.pet.species] }), body]));
}
function chatScroll() { const l = $('#chatLog'); l.scrollTop = l.scrollHeight; }
function appendMsg(m) { $('#chatLog').append(msgNode(m)); chatScroll(); }

async function loadChat() {
  if (chatLoaded || !S?.pet) return;
  chatLoaded = true;
  try {
    const { messages } = await api('/api/chat?limit=80');
    const log = $('#chatLog');
    log.replaceChildren();
    if (!messages.length) appendMsg({ from: 'pet', text: `Halo! Aku ${S.pet.name}. Ajak aku ngobrol ya, atau bilang "namaku …" biar aku ingat kamu 💬` });
    for (const m of messages) log.append(msgNode(m));
    chatScroll();
  } catch { chatLoaded = false; }
}

async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy || !S?.pet) return;
  chatBusy = true;
  await loadChat();
  appendMsg({ from: 'you', text, t: serverNow() });
  sfx.click();
  const typing = el('div', { class: 'msg pet typing' }, el('span', { class: 'av', text: AVATAR[S.pet.species] }), el('div', { class: 'b' }, el('i'), el('i'), el('i')));
  $('#chatLog').append(typing);
  chatScroll();
  try {
    const [r] = await Promise.all([api('/api/action', { type: 'chat', text }), sleep(650)]);
    typing.remove();
    apply(r);
    appendMsg({ from: 'pet', text: r.reply, t: serverNow() });
    sfx.pop();
    scene.say(r.reply);
    floatEffects(r.effects);
    if (r.effects?.coins > 0) sfx.coin();
    refreshHistory();
  } catch (err) {
    typing.remove();
    sfx.error();
    toast(err.message, true);
  } finally {
    chatBusy = false;
  }
}
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  const v = input.value;
  input.value = '';
  sendChat(v);
});
$('#chatChips').replaceChildren(...CHIPS.map((c) => el('button', { type: 'button', class: 'qchip', text: c, onclick: () => sendChat(c) })));

// ---------- Cadangan & pasang di HP (versi web mandiri) ----------
if (LOCAL) {
  $('#backup').hidden = false;
  $('#btnExport').addEventListener('click', async () => {
    try {
      const data = await api('/api/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const a = el('a', { href: url, download: `tamagotchi-${S?.pet?.name || 'cadangan'}-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('Cadangan diunduh 💾');
    } catch (err) { toast(err.message, true); }
  });
  $('#fileImport').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Impor akan MENGGANTI peliharaan di perangkat ini dengan isi cadangan. Lanjutkan?')) return;
    try {
      await api('/api/import', JSON.parse(await file.text()));
      location.reload();
    } catch (err) { toast(err.message || 'File cadangan tidak valid', true); }
  });
}
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('#installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; });

// ---------- Onboarding ----------
$('#createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    apply(await api('/api/create', { name: f.get('name'), species: f.get('species') }));
    refreshHistory();
  } catch (err) {
    $('#createError').textContent = err.message;
  }
});

// ---------- Selamat datang kembali ----------
const LAST_SEEN = 'tamagotchi:lastSeen';
function readLastSeen() { try { return Number(localStorage.getItem(LAST_SEEN)) || 0; } catch { return 0; } }
function writeLastSeen() { try { localStorage.setItem(LAST_SEEN, String(Date.now())); } catch { /* abaikan */ } }

function maybeShowAway(events) {
  const seen = readLastSeen();
  if (!seen || Date.now() - seen < 10 * 60e3) return;
  const missed = events.filter((e) => e.t > seen && e.type !== 'away').reverse();
  const mins = Math.round((Date.now() - seen) / 60e3);
  $('#awaySub').textContent = `Kamu pergi ${mins >= 60 ? `${Math.floor(mins / 60)} jam ${mins % 60} menit` : `${mins} menit`}. ${S.pet.name} tetap tumbuh selama itu.${S.pet.treasure ? ' Ada harta karun menunggumu di taman! 💰' : ''}`;
  renderEvents($('#awayList'), missed.slice(-12).reverse());
  $('#away').hidden = false;
}
$('#awayClose').addEventListener('click', () => { $('#away').hidden = true; });

// ---------- Polling ----------
async function poll() {
  try {
    const snap = await api('/api/state');
    if (!busy) apply(snap);
    setSaved(true);
    writeLastSeen();
  } catch {
    setSaved(false);
  }
}

(async function init() {
  try {
    apply(await api('/api/state'));
    const events = await refreshHistory();
    lastToastT = Math.max(Date.now() - 1000, ...events.map((e) => e.t));
    if (S.created) maybeShowAway(events);
    writeLastSeen();
  } catch {
    setSaved(false);
  }
  setInterval(poll, 5000);
  setInterval(() => { if (S?.pet && !$('#tab-stats').hidden) drawChart(); }, 60000);
  setInterval(() => { if (S?.pet) refreshHistory(); }, 8000);
  setInterval(() => {
    if (S?.pet && !S.pet.sleeping && moodOf(S.pet) === 'happy' && Math.random() < 0.5) scene.say(pick(IDLE_MSG), 3);
  }, 40000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
