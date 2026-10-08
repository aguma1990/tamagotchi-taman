import { Scene, moodOf } from './scene.js';
import { playGame } from './minigame.js';
import { sfx, setMuted, music, buzz } from './audio.js';
import { api, LOCAL } from './api.js';
import { makeCard } from './card.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const STAGE = { egg: 'Telur', baby: 'Bayi', child: 'Anak', teen: 'Remaja', adult: 'Dewasa', elder: 'Lansia' };
const SPECIES = { mochi: 'Mochi', bubu: 'Bubu', leafy: 'Leafy', babi: 'Babi', trenggiling: 'Trenggiling' };
const SAY_FLAVOR = { mochi: ' Nyaa~', bubu: ' Hehe.', leafy: ' 🌱', babi: ' Oink!', trenggiling: ' Krk~' };
const AVATAR = { mochi: '🐱', bubu: '🐻', leafy: '🌱', babi: '🐷', trenggiling: '🌰' };
const AVATAR_BG = { mochi: '#ffb3c7', bubu: '#9cc8ff', leafy: '#a6e6a1', babi: '#ffc2c4', trenggiling: '#cfa97f' };
const EFFECT_ICON = { hunger: '🍖', thirst: '💧', happiness: '😊', energy: '⚡', hygiene: '🫧', health: '❤️', coins: '🪙', xp: '✨' };
const STAT_COLORS = { hunger: '#ffb86b', thirst: '#4d8dff', happiness: '#ff7aa8', energy: '#ffd166', hygiene: '#7fd6ff', health: '#6ee7a8' };
const STAT_LABEL = { hunger: 'Kenyang', thirst: 'Haus', happiness: 'Senang', energy: 'Energi', hygiene: 'Bersih', health: 'Sehat' };
const SLOT_LABEL = { head: 'Kepala', face: 'Wajah', neck: 'Leher' };
const MOOD_LABEL = { sleep: 'tidur 💤', sick: 'sakit', hungry: 'lapar', thirsty: 'haus', tired: 'mengantuk', dirty: 'kotor', sad: 'sedih', happy: 'bahagia', neutral: 'tenang' };
const MOOD_MSG = {
  dirty: ['Aku kotor, mandiin dong!'],
  sick: ['Badanku nggak enak…'],
  sad: ['Main yuk, aku bosan…'],
};
const IDLE_MSG = ['La la la~', 'Tamannya indah ya!', 'Kamu yang terbaik!', 'Ayo main lagi!', 'Hehe~'];
const WEATHER_MSG = {
  hujan: ['Hujan! Seru, tapi dingin…', 'Tik tik tik, hujan turun!'],
  badai: ['Aaa, petir! Peluk aku…', 'Badainya seram…'],
  pelangi: ['Lihat, pelangi! 🌈', 'Katanya ada harta di ujung pelangi!'],
};
const ACT_MSG = {
  feed: 'Nyam, enak banget!', clean: 'Wangi~ makasih!', cuddle: 'Hehe, sayang kamu!', play: 'Seru banget!',
  minigame: 'Seru! Main lagi yuk!', medicine: 'Udah enakan!', collect: 'Dapat harta!', buy: 'Keren, aku suka!',
  greet: 'Halo, teman baru!', train: 'Huff, capek tapi senang!', decorBuy: 'Tamannya makin bagus!',
};
const TOAST_TYPES = new Set(['achievement', 'quest', 'levelup', 'treasure', 'hatch', 'evolve', 'sick', 'daily', 'sticker', 'record', 'weekly', 'event', 'skill', 'lucky', 'retire', 'visitor', 'morph', 'weather', 'house']);

let S = null; // snapshot terakhir dari server
let clockOffset = 0; // waktu server - waktu klien
let busy = false;
let gameOpen = false;
let lastToastT = Date.now();
let lastMood = null;
let lastWeather = null;
let prevCoins = null;
let shopTab = 'acc';
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
  n.append(...kids.filter((k) => k != null));
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
  setTimeout(() => e.remove(), 3000);
}

// ---------- Suara & musik ----------
const SOUND_KEY = 'tamagotchi:sound';
const MUSIC_KEY = 'tamagotchi:music';
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};
const soundOn = () => store.get(SOUND_KEY, 'on') !== 'off';
const musicWanted = () => store.get(MUSIC_KEY, 'off') === 'on';
function applySound() {
  setMuted(!soundOn());
  $('#soundBtn').textContent = soundOn() ? '🔊' : '🔇';
}
function applyMusic() {
  $('#musicBtn').textContent = musicWanted() ? '🎵' : '🎶';
  $('#musicBtn').classList.toggle('on', musicWanted());
  $('#musicBtn').title = musicWanted() ? 'Musik & suasana: nyala' : 'Musik & suasana (kicau burung, jangkrik, hujan): mati';
  if (musicWanted()) music.start(); else music.stop();
}
$('#soundBtn').addEventListener('click', () => {
  store.set(SOUND_KEY, soundOn() ? 'off' : 'on');
  applySound();
  sfx.click();
});
$('#musicBtn').addEventListener('click', () => {
  store.set(MUSIC_KEY, musicWanted() ? 'off' : 'on');
  applyMusic();
  sfx.click();
});
applySound();
$('#musicBtn').textContent = musicWanted() ? '🎵' : '🎶';
if (musicWanted()) document.addEventListener('pointerdown', () => applyMusic(), { once: true }); // browser butuh sentuhan pertama

// ---------- Scene ----------
const scene = new Scene($('#scene'), { reducedMotion: reduced });
scene.onThunder = () => { sfx.thunder(); buzz([40, 80, 40]); };
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
  if (S?.pet) music.setMood(S.world?.weather === 'hujan' || S.world?.weather === 'badai' ? 'rain' : h >= 19.5 || h < 5.5 ? 'night' : 'day');
}, 1000);

let last = performance.now();
(function loop(now) {
  scene.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  scene.draw();
  requestAnimationFrame(loop);
})(last);

// tinggi taman (yang menempel) dipakai agar gulir otomatis tidak tertutup olehnya
new ResizeObserver(() => document.documentElement.style.setProperty('--stage-h', `${$('.stage').offsetHeight}px`)).observe($('.stage'));

// mode ringkas: di layar pendek, taman mengecil saat halaman digulir (dengan histeresis agar tidak berkedip)
addEventListener('scroll', () => {
  const stage = $('.stage');
  const short = innerHeight < 900 && innerWidth > 980;
  if (short && scrollY > 60) stage.classList.add('compact');
  else if (!short || scrollY < 10) stage.classList.remove('compact');
}, { passive: true });

const canvas = $('#scene');
const tip = $('#tooltip');
canvas.addEventListener('pointermove', (e) => {
  const wp = scene.toWorld(e);
  scene.lookAt(wp.x);
  const hit = scene.hitTest(wp);
  scene.hover = hit?.type === 'item' || hit?.type === 'building' ? hit.key : hit?.type === 'treasure' ? 'treasure' : hit?.type === 'visitor' ? 'visitor' : null;
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
    return act({ type: 'collect' }, () => { scene.burst(x, 410, 'coin', 10); scene.confetti(x, 400, 16); sfx.treasure(); buzz([15, 30, 15]); });
  }
  if (hit.type === 'visitor') {
    return act({ type: 'greet' }, () => { scene.burst(scene.x, scene.y - 80, 'heart', 6); scene.confetti(scene.x, scene.y - 90, 14); sfx.sticker(); buzz(14); });
  }
  if (hit.type === 'building') return hit.key === 'shop' ? openShop('acc') : tapHouse();
  if (hit.type === 'pet') return doCuddle();
  act({ type: 'play', item: hit.key }, () => scene.goPlay(hit.key));
});

// ---------- Aksi ----------
const doCuddle = () => act({ type: 'cuddle' }, () => { scene.burst(scene.x, scene.y - 70, 'heart', 7); scene.petSpin(); sfx.heart(); buzz(14); });
const SOUND_FOR = {
  feed: () => sfx.eat(), clean: () => sfx.splash(), play: () => sfx.ok(), minigame: () => sfx.ok(), medicine: () => sfx.ok(),
  buy: () => sfx.coin(), decorBuy: () => sfx.coin(), themeBuy: () => sfx.coin(), quest: () => sfx.ok(), daily: () => sfx.coin(),
  train: () => sfx.ok(), lucky: () => sfx.treasure(), weekly: () => sfx.fanfare(), event: () => sfx.sticker(), retire: () => sfx.fanfare(),
};

/** @returns {Promise<boolean>} true bila aksi berhasil */
async function act(action, onOk) {
  if (busy) return false;
  busy = true;
  const before = S?.pet;
  try {
    const r = await api('/api/action', action);
    apply(r);
    onOk?.();
    SOUND_FOR[action.type]?.();
    floatEffects(r.effects);
    if (r.effects?.coins > 0 && !['buy', 'decorBuy', 'themeBuy'].includes(action.type)) setTimeout(() => sfx.coin(), 250);
    if (ACT_MSG[action.type]) scene.say(ACT_MSG[action.type]);
    if (before && S.pet.level > before.level) levelUpFx();
    refreshHistory();
    return true;
  } catch (err) {
    sfx.error();
    toast(err.message, true);
    return false;
  } finally {
    busy = false;
  }
}

function levelUpFx() {
  sfx.levelup();
  buzz([20, 40, 20, 40, 30]);
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
  minigame: () => openPicker(),
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
    for (const id of ['#away', '#picker', '#retire', '#morph']) $(id).hidden = true;
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
  const prefs = S.pet.prefs;
  for (const [id, f] of Object.entries(S.config.foods)) {
    const tag = prefs.known.fav && prefs.fav === id ? ' ❤️' : prefs.known.hate && prefs.hate === id ? ' 🤢' : '';
    const price = `${f.energy >= 10 ? `⚡+${f.energy}  ` : ''}${f.cost ? `🪙 ${f.cost}` : 'Gratis'}`;
    foodPop.append(el('button', {
      type: 'button',
      disabled: S.pet.coins < f.cost,
      onclick: () => { foodPop.hidden = true; act({ type: 'feed', food: id }, () => scene.eat(f.emoji)); },
    }, el('span', { class: 'em', text: f.emoji }), el('span', { class: 'nm', text: f.label + tag }), el('span', { class: 'pr', text: price })));
  }
  foodPop.hidden = false;
}
document.addEventListener('click', (e) => {
  if (!foodPop.hidden && !e.target.closest('.food-pop') && !e.target.closest('[data-act="feed"]')) foodPop.hidden = true;
});

// ---------- Mini-game ----------
function gameBlock() {
  const p = S.pet;
  if (p.stage === 'egg') return 'Telur belum menetas.';
  if (p.sleeping) return `${p.name} sedang tidur.`;
  if (p.stats.energy < 15) return `${p.name} terlalu lelah.`;
  return null;
}

function openPicker() {
  if (!S?.pet || gameOpen) return;
  const block = gameBlock();
  if (block) return toast(block, true);
  const cd = (S.pet.cooldowns.minigame || 0) - serverNow();
  const list = $('#pickerList');
  list.replaceChildren();
  for (const [id, g] of Object.entries(S.config.minigames)) {
    const hs = S.pet.highscores[id];
    list.append(el('button', { type: 'button', class: 'pick', disabled: cd > 0, 'data-cd': cd > 0 ? String(serverNow() + cd) : false, onclick: () => { $('#picker').hidden = true; startGame(id); } },
      el('span', { class: 'em', text: g.icon }), el('span', { class: 'nm', text: g.label }), el('span', { class: 'ds', text: g.desc }),
      el('span', { class: 'hs', text: hs ? `🏅 Rekor ${hs}` : 'Belum ada rekor' })));
  }
  $('#pickerSub').textContent = cd > 0
    ? `Tunggu ${Math.ceil(cd / 1000)} detik lagi untuk bermain.`
    : `Semua memberi koin & XP. Jeda ${S.config.minigameCooldown} detik di antara permainan. Pecahkan rekor untuk bonus!`;
  $('#picker').hidden = false;
}
$('#pickerCancel').addEventListener('click', () => { $('#picker').hidden = true; });

async function startGame(id) {
  const g = S.config.minigames[id];
  gameOpen = true;
  $('#gameTitle').textContent = `${g.label} ${g.icon}`;
  $('#gameDesc').textContent = g.desc;
  $('#game').hidden = false;
  const c = $('#gameCanvas');
  $('#gameCancel').onclick = () => c._cancel?.();
  const score = await playGame(id, c, { reducedMotion: reduced });
  $('#game').hidden = true;
  gameOpen = false;
  if (score === null) return;
  act({ type: 'minigame', game: id, score }, () => scene.burst(scene.x, scene.y - 80, 'spark', 20));
}

// ---------- Render ----------
function fmtAge(min) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d}h ${h}j` : h ? `${h}j ${m}m` : `${m}m`;
}
const fmtCd = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}d`; };
function fmtSpan(ms) {
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d ? `${d} hari ${h} jam` : `${h} jam ${Math.floor((ms % 36e5) / 6e4)} mnt`;
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
  const cfg = snap.config;
  scene.setPet(p);
  scene.treasure = p.treasure;
  scene.world = snap.world;
  scene.theme = p.decor.theme;
  scene.decor = p.decor.placed;
  scene.decorSlots = p.decor.slots;
  scene.house = p.house;
  scene.houseCost = cfg.house.cost;
  scene.visitor = p.visitor;
  scene.visitorEmoji = p.visitor ? cfg.visitors[p.visitor.kind]?.emoji : null;
  scene.visitorLabel = p.visitor ? cfg.visitors[p.visitor.kind]?.label.toLowerCase() : null;

  const coinsEl = $('#coins');
  $('b', coinsEl).textContent = p.coins;
  if (prevCoins !== null && p.coins > prevCoins && !reduced) {
    coinsEl.classList.remove('pop'); void coinsEl.offsetWidth; coinsEl.classList.add('pop');
  }
  prevCoins = p.coins;

  $('#petName').textContent = p.name;
  $('#chatInput').placeholder = `Ngobrol dengan ${p.name}…`;
  const bits = [SPECIES[p.species], STAGE[p.stage]];
  if (p.shiny && p.stage !== 'egg') bits.push('Langka ✨');
  if (p.form === 'radiant') bits.push('Bersinar 🌟');
  if (p.trait) bits.push(`${cfg.traits[p.trait].label} ${cfg.traits[p.trait].emoji}`);
  if (p.generation > 1) bits.push(`Gen ${p.generation}`);
  if (p.house.inside) bits.push('🐾 di rumah');
  $('#petSub').textContent = p.stage === 'egg' ? `Telur ${SPECIES[p.species]} · segera menetas…` : `${bits.join(' · ')} · ${fmtAge(p.ageMinutes)}`;

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
  set('minigame', egg || p.sleeping, egg ? 'Telur belum menetas' : 'Sedang tidur', 'Mini-game (G)');
  set('medicine', egg || !p.sick, `${p.name} tidak sakit`, `Obat 🪙 ${cfg.medicineCost} (O)`);
  set('sleep', egg, 'Telur belum menetas', p.sleeping ? 'Bangunkan (T)' : 'Tidur (T)');
  $('#sleepBtn').lastChild.textContent = p.sleeping ? 'Bangun' : 'Tidur';
  $('#sleepBtn span').textContent = p.sleeping ? '☀️' : '😴';

  renderWorld();

  // ucapan saat suasana hati berubah & saat cuaca berubah
  const mood = moodOf(p);
  if (lastMood !== null && mood !== lastMood && MOOD_MSG[mood]) scene.say(pick(MOOD_MSG[mood]), 4);
  lastMood = mood;
  const wx = snap.world?.weather;
  if (lastWeather !== null && wx !== lastWeather && WEATHER_MSG[wx] && !p.sleeping) scene.say(pick(WEATHER_MSG[wx]), 4.5);
  lastWeather = wx;

  const cdSig = (key, step = 5000) => Math.ceil(Math.max(0, (p.cooldowns[key] || 0) - serverNow()) / step);
  renderIf('quests', [p.daily, p.weekly, snap.streak, snap.world?.event, Object.keys(p.achievements), cfg.quests], renderQuests);
  renderIf('shop', [shopTab, p.coins, p.level, p.inventory, p.equipped, p.decor, p.house, p.stage], renderShop);
  renderIf('train', [p.skills, p.trait, p.prefs, p.highscores, p.stats.energy > 20, ...Object.keys(cfg.skills).map((k) => cdSig(`train:${k}`)), p.sleeping, p.stage], renderTrain);
  renderIf('collection', [p.album, p.albumClaimed, p.family, p.stage, p.generation, p.stage === 'elder' ? 0 : Math.floor(p.ageMinutes / 60)], renderCollection);
  renderIf('about', [p.totals, Math.floor(p.ageMinutes / 5), p.trait, p.generation, p.careSamples > 0 ? Math.round(p.careSum / p.careSamples) : 100], renderAbout);
  updateBadge();
  updateTitle();
  watchNeeds();
}

function renderWorld() {
  const w = S.world, cfg = S.config;
  const chip = $('#weather');
  chip.hidden = !w;
  if (w) {
    const def = cfg.weathers[w.weather];
    chip.firstChild.textContent = `${def.emoji} `;
    const wet = w.weather === 'hujan' || w.weather === 'badai';
    const exposed = wet && !S.pet.house.inside && S.pet.stage !== 'egg';
    $('b', chip).textContent = exposed ? `${def.label} — kehujanan!` : wet && S.pet.house.inside ? `${def.label} — berteduh 🐾` : def.label;
    chip.classList.toggle('danger', exposed);
  }
  const ec = $('#eventChip');
  ec.hidden = !w?.event;
  if (w?.event) {
    $('b', ec).textContent = w.event.label;
    ec.firstChild.textContent = `${w.event.emoji} `;
    ec.classList.toggle('fresh', !w.event.claimed);
  }
}
$('#eventChip').addEventListener('click', () => { showTab('quests'); $('#eventCard').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

// Toko & rumah di adegan
function openShop(tab) {
  showTab('shop');
  shopTab = tab;
  rendered.delete('shop');
  renderShop();
  $('#tab-shop').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function tapHouse() {
  const h = S.pet.house;
  if (!h.owned) { toast(`Rumah hewan dijual 🪙 ${S.config.house.cost}. Beli di Toko → Rumah.`); return openShop('house'); }
  act({ type: 'home' }, () => sfx.click());
}

// Sapaan saat waktu taman berganti (pagi → siang → sore → malam)
const BANDS = [[5, 11, 'pagi', ['Selamat pagi! Semangat hari ini!', 'Pagi~ udaranya segar banget!']], [11, 15, 'siang', ['Wah, sudah siang. Matahari terik ya!', 'Siang-siang enaknya main di taman!']], [15, 18.5, 'sore', ['Sore yang cantik… langitnya jingga!', 'Sudah sore, sebentar lagi gelap.']], [18.5, 29, 'malam', ['Malam sudah tiba, bintangnya bagus ya.', 'Selamat malam… aku mulai ngantuk.']]];
let lastBand = null;
function bandOf(h) { const x = h < 5 ? h + 24 : h; return BANDS.find(([a, b]) => x >= a && x < b); }
setInterval(() => {
  if (!S?.pet || document.hidden) return;
  const b = bandOf(gameHour());
  if (!b) return;
  if (lastBand && lastBand !== b[2] && !S.pet.sleeping && S.pet.stage !== 'egg' && !S.pet.house.inside && !(scene.bubble && scene.t < scene.bubble.until)) scene.say(pick(b[3]), 4);
  lastBand = b[2];
}, 4000);

// Peliharaan bicara sendiri saat lapar, haus, atau ngantuk (diulang tiap ±45 detik selama masih butuh).
const NEEDS = [
  { key: 'hunger', at: 30, msgs: ['Aku lapar…', 'Perutku keroncongan, kasih makan dong!', 'Lapar nih, ada makanan nggak?'] },
  { key: 'thirst', at: 30, msgs: ['Aku haus…', 'Tenggorokanku kering, minum dong!', 'Haus banget nih, mau air…'] },
  { key: 'energy', at: 25, msgs: ['Aku ngantuk…', 'Mataku udah berat, boleh tidur?', 'Huaaam… ngantuk banget.'] },
];
const needLast = {};
function watchNeeds() {
  const p = S.pet;
  if (document.hidden || p.stage === 'egg') return;
  const wx = S.world?.weather;
  if ((wx === 'hujan' || wx === 'badai') && !p.house.inside && Date.now() - (needLast.rain || 0) > 40000 && !(scene.bubble && scene.t < scene.bubble.until)) {
    needLast.rain = Date.now();
    scene.say(p.house.owned ? 'Brrr, aku kehujanan! Ketuk rumah supaya aku masuk…' : pick(['Brrr, dingin! Aku kehujanan… beli rumah di Toko dong!', 'Aku basah kuyup! Kesehatanku turun… butuh rumah!']), 5);
    sfx.pop();
    return;
  }
  if (p.sleeping) return;
  const worst = NEEDS.filter((n) => p.stats[n.key] < n.at).sort((a, b) => p.stats[a.key] / a.at - p.stats[b.key] / b.at)[0];
  if (!worst) return;
  const now = Date.now();
  if (now - (needLast[worst.key] || 0) < 45000) return;
  if (scene.bubble && scene.t < scene.bubble.until) return; // jangan menimpa ucapan yang sedang tampil
  needLast[worst.key] = now;
  scene.say(pick(worst.msgs) + (Math.random() < 0.4 ? SAY_FLAVOR[p.species] || '' : ''), 4.5);
  sfx.pop();
}

function questReady(p) {
  const claimable = p.daily.quests.some((q) => !q.claimed && q.progress >= S.config.quests[q.id].goal);
  const weekly = p.weekly.quests >= S.config.weeklyGoal && !p.weekly.claimed;
  const event = S.world?.event && !S.world.event.claimed;
  return claimable || !p.daily.loginClaimed || !p.daily.luckyClaimed || weekly || !!event;
}
function updateBadge() {
  $('#questBadge').hidden = !questReady(S.pet);
  $('#collBadge').hidden = S.pet.stage !== 'elder';
}

const BASE_TITLE = 'Tamagotchi Taman';
function updateTitle() {
  const p = S.pet;
  const mood = moodOf(p);
  const need = { hungry: '🍎 lapar!', thirsty: '💧 haus!', tired: '💤 mengantuk', dirty: '🛁 kotor', sick: '💊 sakit!' }[mood];
  const gift = questReady(p) ? '🎁 ' : '';
  document.title = need ? `${gift}${p.name} ${need} · ${BASE_TITLE}` : `${gift}${BASE_TITLE}`;
}

// ---------- Misi, hadiah, prestasi ----------
function giftCard(box, title, sub, label, disabled, onclick) {
  box.replaceChildren(
    el('div', {}, el('div', { class: 't', text: title }), el('div', { class: 's', text: sub })),
    el('button', { class: 'claim', disabled, text: label, onclick }),
  );
}

function renderQuests() {
  const p = S.pet, cfg = S.config, ev = S.world?.event;
  const burst = () => { scene.burst(scene.x, scene.y - 80, 'coin', 8); scene.confetti(scene.x, scene.y - 80, 14); };

  const ec = $('#eventCard');
  ec.hidden = !ev;
  if (ev) giftCard(ec, `${ev.emoji} ${ev.label}`, ev.claimed ? 'Hadiah hari spesial sudah diambil ✓' : `Hadiah hari spesial: +${ev.reward} 🪙 dan stiker`, ev.claimed ? 'Diambil ✓' : 'Ambil', ev.claimed, () => act({ type: 'event' }, burst));

  const claimedToday = p.daily.loginClaimed;
  const nextStreak = claimedToday ? S.streak : S.streak + 1;
  const reward = 5 + Math.min(Math.max(nextStreak, 1), 7) * 2;
  giftCard($('#daily'), '🎁 Hadiah harian', claimedToday ? `🔥 Streak ${S.streak} hari · kembali besok!` : `🔥 Streak ${S.streak} hari · hari ini +${reward} 🪙`, claimedToday ? 'Diambil ✓' : 'Ambil', claimedToday, () => act({ type: 'daily' }, burst));
  giftCard($('#lucky'), '🎲 Kotak keberuntungan', p.daily.luckyClaimed ? 'Sudah dibuka hari ini · kembali besok' : 'Buka sekali sehari: koin, stiker, atau jackpot!', p.daily.luckyClaimed ? 'Dibuka ✓' : 'Buka', p.daily.luckyClaimed, () => act({ type: 'lucky' }, burst));

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

  // tantangan mingguan
  const wk = p.weekly, goal = cfg.weeklyGoal, wbar = el('i');
  wbar.style.width = `${Math.min(100, (wk.quests / goal) * 100)}%`;
  const ready = wk.quests >= goal && !wk.claimed;
  $('#weekly').replaceChildren(
    el('div', { class: 'row' }, el('b', { text: '🏆 Tantangan mingguan' }), el('span', { class: 'rw', text: `${Math.min(wk.quests, goal)}/${goal} misi` })),
    el('div', { class: 'qbar' }, wbar),
    el('div', { class: 'row' }, el('span', { class: 'sub', text: wk.claimed ? 'Hadiah minggu ini sudah diambil ✓' : `Hadiah: +${cfg.weeklyReward} 🪙 dan stiker berlian 💎` }),
      el('button', { class: 'claim', disabled: !ready, text: wk.claimed ? 'Diambil ✓' : ready ? 'Ambil' : 'Belum', onclick: () => act({ type: 'weekly' }, burst) })),
  );

  // cara dapat koin (angka diambil dari konfigurasi server)
  const pg = Object.values(cfg.playground), qr = Object.values(cfg.quests).map((q) => q.reward), ac = cfg.achievements.map((a) => a.reward);
  const lines = [
    ['🎪', 'Main di wahana taman', `${Math.min(...pg.map((x) => x.coins))}–${Math.max(...pg.map((x) => x.coins))} 🪙 tiap main`],
    ['🎮', '4 mini-game', `sampai 12 🪙 tiap ${cfg.minigameCooldown} detik + bonus rekor`],
    ['💰', 'Harta karun di taman', 'muncul ±tiap 25 menit; lebih besar di ujung pelangi 🌈'],
    ['🦋', 'Sapa tamu taman', 'hewan yang mampir memberi koin & stiker'],
    ['🎁', 'Hadiah harian + streak', '7–19 🪙 (naik tiap hari beruntun)'],
    ['🎲', 'Kotak keberuntungan', 'sekali sehari, kadang jackpot 25–40 🪙'],
    ['📋', 'Misi harian & mingguan', `${Math.min(...qr)}–${Math.max(...qr)} 🪙 per misi, bonus ${cfg.questBonus}; mingguan +${cfg.weeklyReward}`],
    ['🎉', 'Hari spesial', 'ulang tahun peliharaan tiap 7 hari & hari raya'],
    ['🚀', 'Naik level', '5 × level 🪙'],
    ['📖', 'Album stiker', 'hadiah tiap milestone koleksi'],
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

// ---------- Toko: aksesori, dekorasi, tema ----------
function shopCard({ on, emoji, label, meta, button }) {
  return el('div', { class: `item${on ? ' on' : ''}` }, el('span', { class: 'em', text: emoji }), el('span', { class: 'nm', text: label }), el('span', { class: 'meta', text: meta }), button);
}
function buyBtn(it, onclick, label) {
  const locked = S.pet.level < it.unlock, poor = S.pet.coins < it.cost;
  return el('button', {
    type: 'button', class: 'buy', disabled: locked || poor, text: locked ? `🔒 Lv ${it.unlock}` : `${label} 🪙 ${it.cost}`,
    title: locked ? `Terbuka di level ${it.unlock}` : poor ? 'Koin belum cukup' : `${label} ${it.label}`, onclick,
  });
}

function renderShop() {
  const p = S.pet, cfg = S.config, shop = $('#shop');
  shop.replaceChildren();
  $$('#shopSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.shop === shopTab)));
  // setiap pembelian: peliharaan berjalan ke toko, masuk, lalu keluar membawa tas (bila sedang di luar)
  const celebrate = (emoji) => () => { if (!scene.shopVisit(emoji)) scene.confetti(scene.x, scene.y - 80, 18); };
  if (shopTab === 'acc') {
    for (const slot of ['head', 'face', 'neck']) {
      shop.append(el('h4', { text: SLOT_LABEL[slot] }));
      for (const [id, it] of Object.entries(cfg.cosmetics).filter(([, v]) => v.slot === slot)) {
        const owned = p.inventory.includes(id), on = p.equipped[slot] === id;
        const button = owned
          ? el('button', { type: 'button', text: on ? 'Lepas' : 'Pakai', onclick: () => act({ type: 'equip', item: id }, () => sfx.click()) })
          : buyBtn(it, () => act({ type: 'buy', item: id }, celebrate(it.emoji)), 'Beli');
        shop.append(shopCard({ on, emoji: it.emoji, label: it.label, meta: owned ? (on ? 'Dipakai' : 'Dimiliki') : SLOT_LABEL[slot], button }));
      }
    }
  } else if (shopTab === 'decor') {
    shop.append(el('h4', { text: 'Dekorasi taman' }));
    for (const [id, it] of Object.entries(cfg.decor)) {
      const owned = p.decor.owned.includes(id), on = p.decor.placed.includes(id);
      const button = owned
        ? el('button', { type: 'button', text: on ? 'Simpan' : 'Pasang', onclick: () => act({ type: 'decorPlace', item: id }, () => sfx.click()) })
        : buyBtn(it, () => act({ type: 'decorBuy', item: id }, celebrate(it.emoji)), 'Beli');
      shop.append(shopCard({ on, emoji: it.emoji, label: it.label, meta: owned ? (on ? 'Terpasang' : 'Disimpan') : 'Dekorasi', button }));
    }
  } else if (shopTab === 'house') {
    const hc = cfg.house, h = p.house;
    const locked = p.level < hc.unlock, poor = p.coins < hc.cost;
    const rain = cfg.rainDamage;
    const buy = el('button', {
      type: 'button', class: 'buy', disabled: locked || poor, text: locked ? `🔒 Level ${hc.unlock}` : `Beli 🪙 ${hc.cost}`,
      title: locked ? `Terbuka di level ${hc.unlock}` : poor ? 'Koin belum cukup' : 'Beli rumah',
      onclick: () => act({ type: 'houseBuy' }, () => { if (!scene.shopVisit(hc.emoji)) scene.confetti(scene.x, scene.y - 80, 24); }),
    });
    const toggle = el('button', {
      type: 'button', class: 'buy', text: h.inside ? '🚪 Keluarkan dari rumah' : '🐾 Masukkan ke rumah hewan',
      disabled: p.stage === 'egg' || (h.inside && h.reason !== 'manual'),
      title: h.inside && h.reason === 'rain' ? 'Masih hujan — tetap di dalam' : h.inside && h.reason === 'sleep' ? 'Sedang tidur' : '',
      onclick: () => act({ type: 'home' }, () => sfx.click()),
    });
    const status = h.owned
      ? (h.inside ? `${p.name} sedang di dalam rumah${h.reason === 'rain' ? ' (berteduh dari hujan)' : h.reason === 'sleep' ? ' (tidur)' : ''}.` : `${p.name} sedang di luar. Ia berteduh otomatis saat hujan.`)
      : `Tanpa rumah, hujan menurunkan kesehatan ${p.name} sekitar ${rain.hujan}/jam-game (badai ${rain.badai}/jam).`;
    shop.append(el('div', { class: 'housecard' },
      el('div', { class: 'big', text: hc.emoji }),
      el('div', { class: 't', text: h.owned ? 'Rumah hewan milikmu' : hc.label }),
      el('ul', {}, ...hc.perks.map((x) => el('li', { text: x }))),
      el('div', { class: `s${!h.owned ? ' warn' : ''}`, text: status }),
      h.owned ? toggle : buy));
  } else {
    shop.append(el('h4', { text: 'Tema taman' }));
    for (const [id, it] of Object.entries(cfg.themes)) {
      const owned = p.decor.themes.includes(id), on = p.decor.theme === id;
      const button = owned
        ? el('button', { type: 'button', disabled: on, text: on ? 'Dipakai' : 'Pakai', onclick: () => act({ type: 'themeSet', theme: id }, () => sfx.click()) })
        : buyBtn(it, () => act({ type: 'themeBuy', theme: id }, celebrate(it.emoji)), 'Beli');
      shop.append(shopCard({ on, emoji: it.emoji, label: it.label, meta: owned ? (on ? 'Aktif' : 'Dimiliki') : 'Tema', button }));
    }
  }
}
$$('#shopSeg button').forEach((b) => b.addEventListener('click', () => {
  sfx.click();
  shopTab = b.dataset.shop;
  rendered.delete('shop');
  renderShop();
}));

// ---------- Latihan ----------
function renderTrain() {
  const p = S.pet, cfg = S.config;
  const tr = p.trait && cfg.traits[p.trait];
  const food = (id, known) => (known ? `${cfg.foods[id].emoji} ${cfg.foods[id].label}` : '❓ belum ketahuan');
  const prefs = `Favorit: ${food(p.prefs.fav, p.prefs.known.fav)} · Tidak suka: ${food(p.prefs.hate, p.prefs.known.hate)}`;
  $('#trainInfo').replaceChildren(
    el('span', { class: 'big', text: tr ? tr.emoji : '🥚' }),
    el('div', { class: 't', text: tr ? `Watak: ${tr.label}` : 'Watak belum terbentuk' }),
    el('div', { class: 's', text: tr ? `${tr.desc} · ${prefs}` : `Terbentuk saat remaja, dari kebiasaan merawat. ${prefs}` }),
  );

  const box = $('#skills');
  box.replaceChildren();
  for (const [id, sk] of Object.entries(cfg.skills)) {
    const cur = p.skills[id], max = cur.lv >= cfg.skillMax;
    const need = cfg.skillNeeds[cur.lv] || 1, bar = el('i');
    bar.style.width = `${max ? 100 : (cur.xp / need) * 100}%`;
    const cd = Math.max(0, (p.cooldowns[`train:${id}`] || 0) - serverNow());
    const block = p.stage === 'egg' ? 'Telur belum menetas' : p.sleeping ? 'Sedang tidur' : p.stats.energy < cfg.train.energy + 8 ? 'Terlalu lelah' : null;
    const btn = el('button', {
      class: 'claim', type: 'button', disabled: max || cd > 0 || !!block, 'data-cd': cd > 0 ? String(serverNow() + cd) : false,
      title: block || `Biaya energi ${cfg.train.energy}`, text: max ? 'Maks' : cd > 0 ? `⏳ ${fmtCd(cd)}` : 'Latih',
      onclick: () => act({ type: 'train', skill: id }, () => scene.train(id)),
    });
    box.append(el('div', { class: 'skill' },
      el('span', { class: 'ico', text: sk.icon }),
      el('div', { class: 'nm' }, sk.label, el('small', { text: `Lv ${cur.lv}/${cfg.skillMax}` })),
      btn,
      el('div', { class: 'perk', text: sk.perk }),
      el('div', { class: 'qbar' }, bar)));
  }

  $('#records').replaceChildren(...Object.entries(cfg.minigames).map(([id, g]) =>
    el('div', { class: 'record' }, el('span', { text: `${g.icon} ${g.label}` }), el('b', { text: p.highscores[id] || '—' }))));
}

// ---------- Koleksi: album, keluarga, pensiun ----------
function renderCollection() {
  const p = S.pet, cfg = S.config;
  const all = Object.keys(cfg.stickers).length, have = Object.keys(p.album).length;
  $('#albumCount').textContent = `${have}/${all}`;
  $('#albumMilestones').replaceChildren(...cfg.albumRewards.map((r) => el('span', { class: `milestone${p.albumClaimed.includes(r.count) ? ' done' : ''}`, text: `${r.count} stiker → 🪙 ${r.coins}` })));
  $('#album').replaceChildren(...Object.entries(cfg.stickers).map(([id, st]) => {
    const n = p.album[id];
    const rare = st.rarity === 'legendaris' ? ' legendaris' : st.rarity === 'langka' ? ' langka' : '';
    return el('div', { class: `sticker${n ? rare : ' locked'}`, title: n ? `${st.label} (${st.rarity}) — dimiliki ${n}×` : `??? — ${st.hint}`, 'aria-label': n ? st.label : 'Stiker terkunci' },
      el('span', { class: 'em', text: n ? st.emoji : '❔' }), el('span', { class: 'nm', text: n ? st.label : '???' }), n > 1 ? el('span', { class: 'cnt', text: `×${n}` }) : null);
  }));

  $('#familyCount').textContent = `${p.family.length} pensiunan · generasi ${p.generation}`;
  const fam = $('#family');
  fam.replaceChildren();
  if (!p.family.length) fam.append(el('div', { class: 'fam empty', text: 'Belum ada pensiunan. Saat peliharaanmu lansia, ia bisa pensiun dan mewariskan telur baru.' }));
  for (const f of [...p.family].reverse()) {
    const tr = f.trait && cfg.traits[f.trait];
    const av = el('div', { class: 'av', text: AVATAR[f.species] || '🐾' });
    av.style.background = AVATAR_BG[f.species] || '#ddd';
    fam.append(el('div', { class: 'fam' }, av,
      el('div', { class: 'nm', text: `${f.name}${f.shiny ? ' ✨' : ''}${f.form === 'radiant' ? ' 🌟' : ''}` }),
      el('div', { class: 'meta', text: `Gen ${f.generation} · ${SPECIES[f.species]} · Lv ${f.level}${tr ? ` · ${tr.label}` : ''} · hidup ${fmtSpan(f.retiredAt - f.bornAt)}` })));
  }

  const elder = p.stage === 'elder';
  $('#legacy').replaceChildren(
    el('button', {
      class: 'claim danger', type: 'button', disabled: !elder, title: elder ? '' : `Pensiun dibuka saat lansia (umur ${fmtAge(cfg.stageStarts.elder)})`,
      text: elder ? '🎓 Pensiun & telur baru' : `🎓 Pensiun (lansia ${fmtAge(Math.max(0, cfg.stageStarts.elder - p.ageMinutes))} lagi)`, onclick: openRetire,
    }),
    el('button', { class: 'claim ghostbtn', type: 'button', text: '📸 Bagikan kartu', onclick: shareCard }),
  );
}

// Ganti karakter (jenis & nama) — umur, level, status, dan keterampilan tetap
function speciesPicker(box, selected) {
  box.replaceChildren(...S.config.species.map((sp) => {
    const face = el('span', { class: 'sp', text: AVATAR[sp] });
    face.style.background = AVATAR_BG[sp];
    return el('label', {}, el('input', { type: 'radio', name: 'species', value: sp, checked: sp === selected }), face, SPECIES[sp]);
  }));
}
function updateMorphHint(form) {
  const p = S.pet, cost = S.config.morphCost;
  const sp = new FormData(form).get('species');
  const changed = sp !== p.species;
  $('#morphSubmit').textContent = changed ? `Ganti karakter · 🪙 ${cost}` : 'Simpan nama';
  $('#morphSubmit').disabled = changed && p.coins < cost;
  $('#morphError').textContent = changed && p.coins < cost ? `Koin belum cukup (butuh ${cost}).` : '';
}
function openMorph() {
  if (!S?.pet) return;
  const p = S.pet;
  $('#morphSub').textContent = `Ubah jenis karakter (🪙 ${S.config.morphCost}) atau cukup ganti nama (gratis). ${p.name} tetap ${STAGE[p.stage].toLowerCase()} dengan level, status, dan keterampilan yang sama.`;
  speciesPicker($('#morphSpecies'), p.species);
  const form = $('#morphForm');
  form.elements.name.value = p.name;
  updateMorphHint(form);
  $('#morph').hidden = false;
}
$('#morphBtn').addEventListener('click', () => { sfx.click(); openMorph(); });
$('#morphCancel').addEventListener('click', () => { $('#morph').hidden = true; });
$('#morphForm').addEventListener('change', (e) => updateMorphHint(e.currentTarget));
$('#morphForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const species = f.get('species');
  const changed = species !== S.pet.species;
  const ok = await act({ type: 'morph', species, name: f.get('name') }, () => {
    if (changed) { scene.confetti(scene.x, scene.y - 70, 40); scene.burst(scene.x, scene.y - 60, 'spark', 26); sfx.sticker(); buzz([20, 40, 20]); }
  });
  if (ok) $('#morph').hidden = true; else $('#morphError').textContent = 'Belum bisa — lihat pesan di atas.';
});

// Pensiun
function openRetire() {
  const p = S.pet;
  $('#retireSub').textContent = `${p.name} akan masuk Galeri Keluarga dan mewariskan setengah keterampilannya. Koin, aksesori, dekorasi, album, dan prestasimu tetap.`;
  speciesPicker($('#retireSpecies'), p.species);
  $('#retireError').textContent = '';
  $('#retire').hidden = false;
}
$('#retireCancel').addEventListener('click', () => { $('#retire').hidden = true; });
$('#retireForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const ok = await act({ type: 'retire', name: f.get('name'), species: f.get('species') }, () => { scene.confetti(450, 300, 50); buzz([30, 60, 30]); });
  if (ok) { $('#retire').hidden = true; form.reset(); showTab('collection'); } else $('#retireError').textContent = 'Belum bisa pensiun — lihat pesan di atas.';
});

// Kartu bagikan
async function shareCard() {
  try {
    const url = LOCAL ? `${location.origin}${location.pathname.replace(/index\.html$/, '')}` : '';
    const blob = await makeCard(S.pet, S.config, { url });
    const file = new File([blob], `${S.pet.name}-tamagotchi.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Tamagotchi Taman', text: `Kenalkan ${S.pet.name}!` }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const href = URL.createObjectURL(blob);
    const a = el('a', { href, download: file.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
    toast('Kartu peliharaan diunduh 📸');
  } catch (err) { toast(err.message || 'Gagal membuat kartu', true); }
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

function toastWorthy(e) {
  if (!TOAST_TYPES.has(e.type)) return false;
  if (e.type === 'treasure') return e.msg.includes('Ada harta') || e.msg.includes('ujung pelangi');
  if (e.type === 'visitor') return e.msg.includes('mampir');
  return true;
}
function handleNewEvents(events) {
  const fresh = events.filter((e) => e.t > lastToastT).sort((a, b) => a.t - b.t);
  for (const e of fresh) {
    lastToastT = Math.max(lastToastT, e.t);
    if (!toastWorthy(e)) continue;
    toast(e.msg);
    if (e.type === 'treasure' || e.type === 'visitor') sfx.treasure();
    else if (e.type === 'sticker' || e.type === 'record') sfx.sticker();
    else if (e.type === 'achievement' || e.type === 'quest' || e.type === 'skill') sfx.ok();
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
      samples.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s[k] ?? 0)) : g.moveTo(X(s.t), Y(s[k] ?? 0))));
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
  const p = S.pet, t = p.totals, cfg = S.config;
  const tr = p.trait && cfg.traits[p.trait];
  const rows = [
    ['Generasi', `ke-${p.generation}`],
    ['Lahir', new Date(p.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })],
    ['Umur', fmtAge(p.ageMinutes)],
    ['Watak', tr ? `${tr.emoji} ${tr.label}` : '—'],
    ['Kualitas perawatan', `${Math.round(p.careSamples ? p.careSum / p.careSamples : 100)}%`],
    ['Makan', `${t.meals}×`], ['Bermain di taman', `${t.plays}×`], ['Mandi', `${t.cleans}×`],
    ['Dipeluk', `${t.cuddles}×`], ['Minum obat', `${t.medicines}×`], ['Mini-game', `${t.minigames}×`],
    ['Latihan', `${t.trains}×`], ['Tamu disapa', `${t.visitors}×`],
    ['Harta karun', `${t.treasures}×`], ['Misi selesai', `${t.quests}×`], ['Hadiah mingguan', `${t.weeklies}×`],
  ];
  $('#about').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

const TAB_KEY = 'tamagotchi:tab';
const TABS = ['quests', 'shop', 'train', 'collection', 'chat', 'history', 'stats'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'quests';
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === name)));
  for (const n of TABS) $(`#tab-${n}`).hidden = n !== name;
  if (name === 'stats') drawChart();
  store.set(TAB_KEY, name);
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  sfx.click();
  showTab(b.dataset.tab);
  if (b.dataset.tab === 'chat') { loadChat(); $('#chatInput').focus(); }
}));
{ const t = store.get(TAB_KEY, null); if (t) { showTab(t); if (t === 'chat') setTimeout(loadChat, 0); } }

// Hitung mundur tombol berjeda tanpa merender ulang seluruh panel.
setInterval(() => {
  const now = serverNow();
  let expired = false;
  for (const b of $$('[data-cd]')) {
    const left = Number(b.dataset.cd) - now;
    if (left > 0) { if (b.classList.contains('claim')) b.textContent = `⏳ ${fmtCd(left)}`; continue; }
    b.removeAttribute('data-cd');
    if (b.classList.contains('pick')) b.disabled = false; else expired = true;
  }
  if (expired && S?.pet) { rendered.delete('train'); renderTrain(); }
}, 1000);

// ---------- Obrolan ----------
const CHIPS = ['Apa kabar?', 'Lapar nggak?', 'Haus nggak?', 'Cuaca hari ini?', 'Ada tamu?', 'Ceritakan lelucon', 'Sayang kamu'];
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
const readLastSeen = () => Number(store.get(LAST_SEEN, 0)) || 0;
const writeLastSeen = () => store.set(LAST_SEEN, String(Date.now()));

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
    if (!$('#tab-chat').hidden) loadChat(); // tab obrolan dipulihkan dari sesi sebelumnya
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
