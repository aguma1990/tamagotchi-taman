'use strict';
/** Lapisan aplikasi: menggabungkan engine + store, satu-satunya pemilik state yang hidup. */
const crypto = require('node:crypto');
const engine = require('./engine');

class Game {
  constructor(store, clock = Date.now) {
    this.store = store;
    this.clock = clock;
    this.state = store.load();
    if (this.state) {
      engine.migrate(this.state, this.clock());
      this.tick(); // catch-up setelah mati/offline
    }
  }

  _persist(res) {
    if (res.events?.length) this.store.appendEvents(res.events);
    if (res.samples?.length) this.store.appendSamples(res.samples);
    if (res.dirty) this.store.save(this.state, this.clock());
  }

  tick() {
    if (!this.state) return;
    const ctx = engine.advance(this.state, this.clock());
    this._persist({ events: ctx.events, samples: ctx.samples, dirty: ctx.stepped });
  }

  create(input) {
    if (this.state) return { ok: false, error: 'Peliharaan sudah ada.' };
    const now = this.clock();
    const res = engine.createPet(input || {}, now, crypto.randomUUID(), crypto.randomInt(0, 2 ** 31));
    if (!res.ok) return res;
    this.state = res.state;
    this._persist({ events: res.events, samples: [], dirty: true });
    return { ok: true };
  }

  act(action) {
    if (!this.state) return { ok: false, error: 'Belum ada peliharaan.' };
    const res = engine.perform(this.state, this.clock(), action);
    this._persist(res);
    if (res.ok && res.reply) {
      const now = this.clock();
      this.store.appendChat([{ t: now, from: 'you', text: res.said }, { t: now + 1, from: 'pet', text: res.reply }]);
    }
    return { ok: res.ok, error: res.error, effects: res.effects, reply: res.reply };
  }

  snapshot() {
    const now = this.clock();
    return { created: !!this.state, now, pet: this.state, ...engine.viewExtras(this.state, now), config: engine.buildConfig() };
  }

  shutdown() {
    if (this.state) this.store.save(this.state, this.clock(), true);
  }
}

module.exports = { Game };
