// Pengingat perawatan lewat notifikasi browser. Murni: memutuskan pengingat apa yang perlu dikirim.
export const COOLDOWN_MS = 30 * 60 * 1000;

/** @returns {{key:string,title:string,body:string}[]} pengingat yang layak dikirim sekarang (belum di-cooldown). */
export function alertsFor(pet, world, last = {}, now = Date.now()) {
  if (!pet || pet.stage === 'egg') return [];
  const out = [];
  const add = (key, title, body) => { if (now - (last[key] || 0) >= COOLDOWN_MS) out.push({ key, title, body }); };
  const st = pet.stats || {};
  const name = pet.name;
  if (pet.sick) add('sick', `💊 ${name} sakit!`, 'Beri obat (🪙5) supaya cepat sembuh.');
  if (!pet.sleeping) {
    if (st.hunger < 20) add('hungry', `🍽️ ${name} lapar`, 'Kasih makan sebelum kesehatannya turun.');
    if (st.thirst < 20) add('thirsty', `💧 ${name} haus`, 'Beri minum ya.');
    if (st.hygiene < 20 || pet.poop >= 3) add('dirty', `🛁 ${name} kotor`, 'Mandikan atau bersihkan kotorannya.');
    if (st.energy < 15) add('tired', `😴 ${name} kelelahan`, 'Biarkan ia tidur.');
  }
  const wet = ['hujan', 'badai', 'salju'].includes(world?.weather);
  if (wet && !pet.house?.inside) add('rain', `🌧️ ${name} kehujanan!`, pet.house?.owned ? 'Ketuk rumah hewan supaya ia masuk.' : 'Beli rumah hewan di Toko agar ia bisa berteduh.');
  if (world?.wishable) add('meteor', '🌠 Hujan meteor!', 'Buka taman dan ketuk langit untuk membuat permohonan.');
  return out;
}
