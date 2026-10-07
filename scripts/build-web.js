'use strict';
/**
 * Membuat versi web mandiri (PWA) ke folder docs/ — siap dihosting statis (mis. GitHub Pages).
 *  - public/*            → disalin apa adanya (UI yang sama dengan versi PC)
 *  - public/api.js       → diganti web/local-api.js (game berjalan di browser, data di localStorage)
 *  - src/engine.js+chat  → dibungkus jadi docs/core.js (modul ES) — logika game sama persis dengan versi PC
 *  - sw.js, manifest, ikon, meta PWA & CSP ditambahkan
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

const files = {};
const put = (name, content) => {
  files[name] = content;
  fs.writeFileSync(path.join(out, name), content);
};

for (const f of fs.readdirSync(path.join(root, 'public'))) {
  if (f === 'api.js' || f === 'index.html') continue;
  put(f, fs.readFileSync(path.join(root, 'public', f)));
}
put('api.js', rd('web/local-api.js'));

put('core.js', `// DIHASILKAN OTOMATIS oleh scripts/build-web.js dari src/engine.js & src/chat.js — jangan diedit.
const __chat = (() => {
const module = { exports: {} };
${rd('src/chat.js')}
return module.exports;
})();
export const engine = (() => {
const module = { exports: {} };
const require = () => __chat;
${rd('src/engine.js')}
return module.exports;
})();
`);

put('manifest.webmanifest', fs.readFileSync(path.join(root, 'web/manifest.webmanifest')));
for (const f of fs.readdirSync(path.join(root, 'web/icons'))) {
  const buf = fs.readFileSync(path.join(root, 'web/icons', f));
  fs.writeFileSync(path.join(out, 'icons', f), buf);
  files[`icons/${f}`] = buf;
}

const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'";
const head = [
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
  '<meta name="theme-color" content="#0d1024">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Tamagotchi">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
].join('\n  ');
put('index.html', rd('public/index.html').replace('</head>', `  ${head}\n</head>`));

const hash = crypto.createHash('sha256');
for (const k of Object.keys(files).sort()) hash.update(k).update(files[k]);
const assets = ['./', ...Object.keys(files).filter((k) => k !== 'sw.js').map((k) => `./${k}`)];
put('sw.js', rd('web/sw.template.js').replace('__HASH__', hash.digest('hex').slice(0, 10)).replace('__ASSETS__', JSON.stringify(assets, null, 2)));
put('.nojekyll', '');
put('package.json', '{ "type": "module" }\n'); // agar Node (tes) membaca docs/*.js sebagai modul ES

console.log(`docs/ siap (${Object.keys(files).length} file) — hosting statis, tanpa server.`);
