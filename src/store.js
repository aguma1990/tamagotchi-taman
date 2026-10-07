'use strict';
/**
 * Penyimpanan tahan banting:
 *  - pet.json ditulis atomik (tulis ke .tmp → fsync → rename), tidak pernah setengah-tertulis
 *  - backup per jam (48 terakhir) dan pemulihan otomatis bila file utama rusak
 *  - events.jsonl / samples.jsonl bersifat append-only (riwayat tidak pernah ditimpa)
 */
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_EVERY_MS = 60 * 60 * 1000;
const BACKUP_KEEP = 48;
const TAIL_BYTES = 512 * 1024;

function isValidState(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.name !== 'string' || typeof s.id !== 'string') return false;
  if (!Number.isFinite(s.lastTickAt) || !Number.isFinite(s.ageMinutes)) return false;
  if (!s.stats || typeof s.stats !== 'object') return false;
  for (const k of ['hunger', 'happiness', 'energy', 'hygiene', 'health']) {
    if (!Number.isFinite(s.stats[k])) return false;
  }
  return !!s.cooldowns && !!s.totals;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.petFile = path.join(dir, 'pet.json');
    this.eventsFile = path.join(dir, 'events.jsonl');
    this.samplesFile = path.join(dir, 'samples.jsonl');
    this.chatFile = path.join(dir, 'chat.jsonl');
    this.backupDir = path.join(dir, 'backups');
    this.lastBackupAt = 0;
    fs.mkdirSync(this.backupDir, { recursive: true });
  }

  /** Muat state; jika pet.json rusak, coba backup terbaru. Mengembalikan null bila tidak ada. */
  load() {
    const candidates = [this.petFile, ...this._backupsNewestFirst()];
    for (const file of candidates) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (isValidState(data)) {
          if (file !== this.petFile) {
            console.warn(`[store] pet.json rusak/hilang, dipulihkan dari ${path.basename(file)}`);
            this.save(data, Date.now(), true);
          }
          return data;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') console.warn(`[store] gagal membaca ${path.basename(file)}: ${err.message}`);
      }
    }
    return null;
  }

  save(state, now = Date.now(), skipBackup = false) {
    const tmp = `${this.petFile}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(state));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.petFile);
    if (!skipBackup && now - this.lastBackupAt >= BACKUP_EVERY_MS) this._backup(now);
  }

  _backup(now) {
    try {
      const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(this.petFile, path.join(this.backupDir, `pet-${stamp}.json`));
      this.lastBackupAt = now;
      for (const old of this._backupsNewestFirst().slice(BACKUP_KEEP)) fs.rmSync(old, { force: true });
    } catch (err) {
      console.warn(`[store] backup gagal: ${err.message}`);
    }
  }

  _backupsNewestFirst() {
    try {
      return fs
        .readdirSync(this.backupDir)
        .filter((f) => /^pet-.*\.json$/.test(f))
        .sort()
        .reverse()
        .map((f) => path.join(this.backupDir, f));
    } catch {
      return [];
    }
  }

  appendEvents(events) {
    this._append(this.eventsFile, events);
  }
  appendChat(rows) {
    this._append(this.chatFile, rows);
  }
  readChat(limit = 60) {
    return this._tail(this.chatFile).slice(-limit);
  }
  appendSamples(samples) {
    this._append(this.samplesFile, samples);
  }
  _append(file, rows) {
    if (!rows.length) return;
    fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }

  readEvents(limit = 80) {
    return this._tail(this.eventsFile).slice(-limit).reverse();
  }
  readSamples(sinceMs) {
    return this._tail(this.samplesFile).filter((r) => r.t >= sinceMs);
  }

  /** Baca ekor file JSONL (maks TAIL_BYTES) dan parse baris yang valid. */
  _tail(file) {
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const { size } = fs.fstatSync(fd);
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      if (size > len) lines.shift(); // baris pertama bisa terpotong
      const out = [];
      for (const line of lines) {
        if (!line) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          /* lewati baris rusak */
        }
      }
      return out;
    } catch {
      return [];
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
}

module.exports = { Store, isValidState };
