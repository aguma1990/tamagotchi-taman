// Versi web mandiri: seluruh game berjalan di browser. Menggantikan public/api.js saat build.
// Data disimpan di localStorage perangkat ini; waktu tetap berjalan saat aplikasi ditutup (catch-up).
import { engine } from './core.js';

export const LOCAL = true;

const PREFIX = 'tamagotchi:v1:';
const LIMITS = { events: 600, samples: 7 * 96, chat: 300 };
const STAT_KEYS = ['hunger', 'happiness', 'energy', 'hygiene', 'health'];

function isValidState(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.name !== 'string' || typeof s.id !== 'string') return false;
  if (!Number.isFinite(s.lastTickAt) || !Number.isFinite(s.ageMinutes) || !Number.isFinite(s.createdAt)) return false;
  if (!s.stats || typeof s.stats !== 'object' || STAT_KEYS.some((k) => !Number.isFinite(s.stats[k]))) return false;
  return !!s.cooldowns && !!s.totals && Number.isFinite(s.seed);
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(`${PREFIX}probe`);
    return s;
  } catch {
    return memoryStorage(); // mode privat / penyimpanan diblokir
  }
}
function defaultUuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function randomSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  return Math.floor(Math.random() * 2 ** 31);
}

export function createLocalApi({ storage = defaultStorage(), clock = Date.now } = {}) {
  const read = (k, fallback) => {
    try {
      const v = storage.getItem(PREFIX + k);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (k, v) => {
    try {
      storage.setItem(PREFIX + k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  };
  const append = (k, rows) => {
    if (!rows?.length) return;
    const list = read(k, []);
    list.push(...rows);
    const kept = list.slice(-LIMITS[k]);
    if (!write(k, kept)) write(k, kept.slice(-50)); // kuota penuh: pangkas
  };

  let state = read('pet', null);
  if (!isValidState(state)) state = null;
  if (state) engine.migrate(state, clock());

  const persist = (res) => {
    if (res.events?.length) append('events', res.events);
    if (res.samples?.length) append('samples', res.samples);
    if (res.dirty && state) write('pet', state);
  };
  const tick = () => {
    if (!state) return;
    const ctx = engine.advance(state, clock());
    persist({ events: ctx.events, samples: ctx.samples, dirty: ctx.stepped });
  };
  tick(); // catch-up setelah aplikasi lama ditutup

  const config = {
    foods: engine.FOODS,
    playground: engine.PLAYGROUND,
    species: engine.SPECIES,
    medicineCost: engine.MEDICINE_COST,
    stageStarts: engine.CONFIG.stageStarts,
    cosmetics: engine.COSMETICS,
    quests: engine.QUESTS,
    questBonus: engine.QUEST_BONUS,
    achievements: engine.ACHIEVEMENTS.map(({ test, ...a }) => a),
    dayRealMinutes: engine.CONFIG.dayRealMinutes,
    dayStartHour: engine.CONFIG.dayStartHour,
  };
  const snapshot = () => structuredClone({
    created: !!state,
    now: clock(),
    pet: state,
    streak: state ? engine.effectiveStreak(state, clock()) : 0,
    config,
  });
  const fail = (message) => { throw Object.assign(new Error(message), { data: { error: message } }); };
  const obj = (b) => (b && typeof b === 'object' ? b : {});
  const num = (v, def, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || def));

  async function api(path, body) {
    const url = new URL(path, 'http://local');
    const route = `${body === undefined ? 'GET' : 'POST'} ${url.pathname}`;
    tick();
    switch (route) {
      case 'GET /api/state':
        return snapshot();
      case 'GET /api/history':
        return { events: read('events', []).slice(-num(url.searchParams.get('limit'), 60, 1, 200)).reverse() };
      case 'GET /api/chat':
        return { messages: read('chat', []).slice(-num(url.searchParams.get('limit'), 60, 1, 200)) };
      case 'GET /api/samples': {
        const since = clock() - num(url.searchParams.get('hours'), 24, 1, 168) * 3600e3;
        return { samples: read('samples', []).filter((r) => r.t >= since) };
      }
      case 'POST /api/create': {
        if (state) fail('Peliharaan sudah ada.');
        const res = engine.createPet(obj(body), clock(), defaultUuid(), randomSeed());
        if (!res.ok) fail(res.error);
        state = res.state;
        persist({ events: res.events, samples: [], dirty: true });
        return snapshot();
      }
      case 'POST /api/action': {
        if (!state) fail('Belum ada peliharaan.');
        const action = obj(body);
        const res = engine.perform(state, clock(), action);
        persist(res);
        if (!res.ok) fail(res.error);
        if (res.reply) {
          const now = clock();
          append('chat', [{ t: now, from: 'you', text: res.said }, { t: now + 1, from: 'pet', text: res.reply }]);
        }
        return { ...snapshot(), effects: res.effects, reply: res.reply };
      }
      case 'GET /api/export':
        return {
          app: 'tamagotchi-taman', version: 1, exportedAt: clock(),
          pet: state, events: read('events', []), samples: read('samples', []), chat: read('chat', []),
        };
      case 'POST /api/import': {
        const data = obj(body);
        if (data.app !== 'tamagotchi-taman' || !isValidState(data.pet)) fail('File cadangan tidak valid.');
        const arr = (v, max) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').slice(-max) : []);
        state = data.pet;
        engine.migrate(state, clock());
        write('events', arr(data.events, LIMITS.events));
        write('samples', arr(data.samples, LIMITS.samples));
        write('chat', arr(data.chat, LIMITS.chat));
        write('pet', state);
        tick();
        return { ok: true };
      }
      default:
        return fail('Endpoint tidak ada');
    }
  }
  return { api, isValidState };
}

export const { api } = createLocalApi();

// PWA: simpan offline & minta penyimpanan permanen agar data tidak dibersihkan browser.
if (typeof navigator !== 'undefined' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker?.register('./sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
}
