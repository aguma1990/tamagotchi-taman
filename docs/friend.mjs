// Kode taman: bagikan tampilan taman & peliharaan ke teman (tanpa server). Murni, diuji di Node.
export const PREFIX = 'TAMA1.';
const MAX_LEN = 2400;

const b64 = {
  enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  },
};

/** Ringkasan publik peliharaan (tanpa koin, tanpa data pribadi). */
export function makeCode(pet) {
  const data = {
    v: 1, id: pet.id, n: pet.name, sp: pet.species, st: pet.stage, lv: pet.level, sh: !!pet.shiny, f: pet.form || null,
    tr: pet.trait || null, tn: pet.tint?.active || null, th: pet.decor?.theme || 'default',
    ho: !!pet.house?.owned, hi: pet.house?.items || [], dc: pet.decor?.slots ? Object.fromEntries(Object.entries(pet.decor.slots).filter(([id]) => pet.decor.placed.includes(id))) : {},
    eq: { head: pet.equipped?.head || null, face: pet.equipped?.face || null, neck: pet.equipped?.neck || null }, g: pet.generation || 1,
  };
  return PREFIX + b64.enc(JSON.stringify(data));
}

const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const has = (obj, k) => typeof k === 'string' && Object.hasOwn(obj || {}, k);

/** Baca & validasi kode teman. `cfg` = konfigurasi dari server (daftar yang sah). Tidak pernah melempar. */
export function parseCode(raw, cfg) {
  try {
    const text = String(raw ?? '').trim();
    if (!text.startsWith(PREFIX)) return { ok: false, error: 'Kode tidak dikenal. Kode taman diawali "TAMA1."' };
    if (text.length > MAX_LEN) return { ok: false, error: 'Kode terlalu panjang.' };
    if (!/^[A-Za-z0-9_-]+$/.test(text.slice(PREFIX.length))) return { ok: false, error: 'Kode berisi karakter yang tidak valid.' };
    const d = JSON.parse(b64.dec(text.slice(PREFIX.length)));
    if (!d || typeof d !== 'object' || d.v !== 1) return { ok: false, error: 'Versi kode tidak didukung.' };
    if (typeof d.id !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(d.id)) return { ok: false, error: 'Kode tidak lengkap.' };
    if (!cfg.species.includes(d.sp) || !has(cfg.stageStarts, d.st)) return { ok: false, error: 'Kode berisi peliharaan yang tidak dikenal.' };
    const name = cleanText(d.n, 16);
    if (!name) return { ok: false, error: 'Kode tidak lengkap.' };
    const slots = new Set();
    const dc = {};
    for (const [id, slot] of Object.entries(d.dc && typeof d.dc === 'object' ? d.dc : {})) {
      if (has(cfg.decor, id) && cfg.decorSlots.includes(slot) && cfg.decor[id].slots.includes(slot) && !slots.has(slot)) { slots.add(slot); dc[id] = slot; }
    }
    const eq = {};
    for (const slot of ['head', 'face', 'neck']) eq[slot] = has(cfg.cosmetics, d.eq?.[slot]) && cfg.cosmetics[d.eq[slot]].slot === slot ? d.eq[slot] : null;
    const friend = {
      id: d.id, name, species: d.sp, stage: d.st, level: Math.max(1, Math.min(99, Math.floor(Number(d.lv)) || 1)), shiny: d.sh === true,
      form: d.f === 'radiant' ? 'radiant' : null, trait: has(cfg.traits, d.tr) ? d.tr : null, tint: has(cfg.tints, d.tn) ? d.tn : null,
      theme: has(cfg.themes, d.th) ? d.th : 'default', houseOwned: d.ho === true,
      houseItems: Array.isArray(d.hi) ? [...new Set(d.hi.filter((x) => has(cfg.houseDecor, x)))] : [], decor: dc, equipped: eq,
      generation: Math.max(1, Math.min(99, Math.floor(Number(d.g)) || 1)),
    };
    return { ok: true, friend };
  } catch {
    return { ok: false, error: 'Kode rusak atau tidak bisa dibaca.' };
  }
}

/** Bentuk objek "peliharaan" siap-gambar untuk Scene dari data teman (mode baca saja). */
export function friendPet(f) {
  return {
    id: f.id, name: f.name, species: f.species, stage: f.stage, level: f.level, shiny: f.shiny, form: f.form, trait: f.trait,
    tint: { owned: f.tint ? [f.tint] : [], active: f.tint }, equipped: { ...f.equipped }, sleeping: false, sick: false, poop: 0,
    stats: { hunger: 85, happiness: 90, energy: 85, hygiene: 95, thirst: 85, health: 100 }, treasure: null, visitor: null, generation: f.generation,
    decor: { theme: f.theme, placed: Object.keys(f.decor), slots: { ...f.decor }, owned: Object.keys(f.decor), themes: [f.theme] },
    house: { owned: f.houseOwned, inside: false, reason: null, items: f.houseItems },
  };
}
