import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readBinary = path => readFile(new URL(`../${path}`, import.meta.url));
const exists = async path => {
  try {
    await access(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
};

const pngSize = async path => {
  const data = await readBinary(path);
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} ist keine PNG-Datei`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

test('algorithm spectrum app icons are complete, accessible and correctly wired', async () => {
  const [html, manifestSource, icon, animated] = await Promise.all([
    read('index.html'),
    read('manifest.webmanifest'),
    read('icons/icon.svg'),
    read('icons/icon-animated.svg')
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.match(icon, /farbiges Constraint-Netz/i);
  assert.match(icon, /Auto-Plan-Kern/i);
  assert.match(animated, /prefers-reduced-motion:reduce/);
  assert.match(html, /icon\.svg\?icon=algorithm-spectrum-2/);
  assert.match(html, /icon-32\.png\?icon=algorithm-spectrum-2/);
  assert.match(html, /icon-180\.png\?icon=algorithm-spectrum-2/);
  assert.match(html, /manifest\.webmanifest\?manifest=algorithm-spectrum-2/);

  assert.deepEqual(await pngSize('icons/icon-32.png'), [32, 32]);
  assert.deepEqual(await pngSize('icons/icon-180.png'), [180, 180]);
  assert.deepEqual(await pngSize('icons/icon-192.png'), [192, 192]);
  assert.deepEqual(await pngSize('icons/icon-512.png'), [512, 512]);
  assert.deepEqual(await pngSize('icons/icon-maskable-512.png'), [512, 512]);

  const rasterIcons = manifest.icons.filter(item => item.type === 'image/png');
  assert.deepEqual(rasterIcons.map(item => item.sizes), ['192x192', '512x512', '512x512']);
  const maskable = manifest.icons.filter(item => item.purpose === 'maskable');
  assert.equal(maskable.length, 1);
  assert.match(maskable[0].src, /icon-maskable-512\.png/);
});

/**
 * Die Anwendung hat keinen Service Worker mehr – und darf auch keinen
 * zurückbekommen. Der frühere Worker lieferte eigenen Code Cache-First aus und
 * hat ausgerollte Korrekturen dauerhaft von den Clients ferngehalten. Dieser
 * Test ist die Sperre dagegen: Er schlägt an, sobald wieder eine Worker-Datei
 * im Projekt liegt oder irgendwo eine Registrierung erfolgt.
 */
test('the application ships without any service worker and never registers one', async () => {
  assert.equal(await exists('service-worker.js'), false, 'kein Worker unter alternativem Namen');

  const sources = await Promise.all(['index.html', 'js/app.js', 'js/state.js', 'js/theme.js'].map(read));
  for (const source of sources) {
    const registrations = [...source.matchAll(/serviceWorker\s*\.\s*register\s*\(/g)];
    assert.equal(registrations.length, 0, 'kein serviceWorker.register() im Auslieferungsstand');
  }
});

/**
 * `/sw.js` existiert wieder – aber ausschließlich als Grabstein.
 *
 * Das bloße Löschen der Datei hat den Worker nachweislich NICHT entfernt: Der
 * Cloudflare-Edge lieferte das alte Skript bis zu sieben Tage weiter aus, und
 * danach antwortete der SPA-Rückfall mit `index.html` als `text/html`, was die
 * Updateprüfung mit einem MIME-Fehler abbricht, ohne die Registrierung zu
 * lösen. Beides in der Produktion gemessen, siehe Kopf von `sw.js`.
 *
 * Dieser Test hält die Grenze: Der Grabstein darf abmelden und aufräumen – und
 * sonst nichts. Keine Zwischenspeicherung, kein Eingriff in Anfragen.
 */
test('the /sw.js route is a Function, not an asset, and only unregisters and purges', async () => {
  assert.equal(await exists('sw.js'), false, 'sw.js darf nicht als Asset zurückkehren');

  const fn = await read('functions/sw.js.js');

  assert.match(fn, /export const onRequestGet/, '/sw.js muss von einer Function bedient werden');
  assert.match(fn, /self\.registration\.unregister\(\)/, 'das Skript muss sich selbst abmelden');
  assert.match(fn, /caches\.delete\(/, 'und die Caches des Altbestands löschen');
  assert.match(fn, /application\/javascript/, 'ohne korrekten MIME-Typ greift die Updateprüfung nicht');
  assert.match(fn, /'Cache-Control': 'no-store/);
  assert.match(fn, /'CDN-Cache-Control': 'no-store'/);
  assert.doesNotMatch(fn, /addEventListener\(\s*\\?['"]fetch\\?['"]/, 'kein fetch-Handler');
  assert.doesNotMatch(fn, /respondWith/, 'das Skript darf keine Anfrage beantworten');
  assert.doesNotMatch(fn, /cache\.addAll|caches\.match|cache\.put/, 'keine Zwischenspeicherung');
  assert.doesNotMatch(await read('_headers'), /^\/sw\.js/m, 'kein Asset-Header für einen Function-Pfad');
});

/**
 * Ein bereits installierter Worker aus früheren Fassungen muss trotzdem
 * verschwinden. Das erledigen zwei voneinander unabhängige Schichten: ein
 * Inline-Skript vor der ersten eigenen Asset-Anfrage und zusätzlich der
 * Anwendungsstart. Beide bleiben dauerhaft bestehen – es ist nicht absehbar,
 * wann der letzte betroffene Client das nächste Mal vorbeikommt.
 */
test('legacy service workers are neutralized before versioned application assets load', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('js/app.js')]);

  const cleanupPosition = html.indexOf('dienstplanrad:legacy-cleanup');
  const stylesheetPosition = html.indexOf('rel="stylesheet"');
  const modulePosition = html.indexOf('type="module"');

  assert.ok(cleanupPosition > 0, 'index.html needs an inline legacy-worker cleanup');
  assert.ok(cleanupPosition < stylesheetPosition, 'cleanup must start before the stylesheet request');
  assert.ok(cleanupPosition < modulePosition, 'cleanup must start before the module graph request');
  assert.match(html, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(html, /caches\.keys\(\)/);

  assert.match(app, /getRegistrations\(\)/, 'der Anwendungsstart räumt zusätzlich auf');
  assert.match(app, /caches\.delete\(/);
});

/**
 * v9.5 ist bewusst eine additive Kompatibilitätsschicht: Der unveränderte
 * Anwendungsshell bleibt auf dem ausgerollten Basistoken, während ausschließlich
 * die neuen v9.5-Einstiegspunkte und ihre gegenseitigen Imports einen eigenen
 * Token tragen. Damit werden bestehende, breit getestete Module nicht künstlich
 * neu adressiert, die geänderten Engine-/Studio-Dateien aber sicher invalidiert.
 */
test('the compatibility shell and additive v9.5 layer use only their declared cache tokens', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = ['index.html', 'js/app.js', 'js/state.js', 'js/rules.js'];
  const sources = await Promise.all(files.map(read));
  const moduleFiles = (await readdir(new URL('../js/', import.meta.url), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `js/${entry.name}`);
  const releaseSources = [sources[0], ...await Promise.all(moduleFiles.map(read))];
  const tokens = releaseSources.flatMap(source =>
    [...source.matchAll(/\?v=([a-z0-9.-]+)/gi)].map(match => match[1]));
  const allowed = new Set(['20260803.4', '20260805.1']);

  assert.ok(tokens.length >= 50, 'entry assets and the full module graph need version tokens');
  assert.ok(tokens.every(token => allowed.has(token)), `unerwarteter Release-Token: ${[...new Set(tokens)].filter(token => !allowed.has(token)).join(', ')}`);
  assert.deepEqual([...new Set(tokens)].sort(), [...allowed].sort(), 'Basis- und v9.5-Schicht müssen beide ausdrücklich vorkommen');

  const publicPlanner = await read('js/auto-planner.js');
  const autoPlanUi = await read('js/auto-plan-ui.js');
  assert.match(publicPlanner, /auto-planner-v9-5-runtime\.js\?v=20260805\.1/);
  assert.match(autoPlanUi, /auto-plan-studio-v9-5\.js\?v=20260805\.1/);

  for (let index = 1; index < files.length; index += 1) {
    const localImports = [...sources[index].matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
    assert.ok(localImports.length > 0, `${files[index]} should contain local imports`);
    assert.ok(localImports.every(specifier => specifier.includes('?v=')), `${files[index]} contains an unversioned browser import`);
  }
});

test('every relative browser-module import resolves after removing its release token', async () => {
  const { readdir } = await import('node:fs/promises');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const jsDir = resolve(root, 'js');

  for (const entry of await readdir(jsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const sourcePath = resolve(jsDir, entry.name);
    const source = await read(`js/${entry.name}`);
    const specifiers = [...source.matchAll(/(?:from\s+|import\s*)['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
    for (const specifier of specifiers) {
      const clean = specifier.replace(/\?v=[^#]+$/, '');
      await access(resolve(dirname(sourcePath), clean));
    }
  }
});

test('Cloudflare revalidates the app shell and application assets on every visit', async () => {
  const headers = await read('_headers');

  for (const route of ['/', '/index.html']) {
    assert.match(
      headers,
      new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n\\s+Cache-Control: no-cache, no-store, must-revalidate`),
      `${route} must never be reused without validation`
    );
  }

  for (const route of ['/styles.css', '/js/*']) {
    assert.match(
      headers,
      new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n\\s+Cache-Control: no-cache, must-revalidate`),
      `${route} must be revalidated`
    );
  }
});

/**
 * Der Auslieferungsstempel muss zum Release-Token des Modulgraphen passen.
 * Er bezeichnet weiterhin den kompatiblen Anwendungsshell; die additive
 * v9.5-Schicht besitzt ihren separat geprüften Featuretoken.
 */
test('the deployed build stamp matches the shell module release token', async () => {
  const html = await read('index.html');
  const stamp = html.match(/name="dienstplanrad-build"\s+content="([^"]+)"/)?.[1];
  const token = html.match(/\?v=([a-z0-9.-]+)/i)?.[1];

  assert.ok(stamp, 'index.html braucht einen Auslieferungsstempel');
  assert.equal(stamp, token, 'Stempel und Shell-Release-Token müssen denselben Stand bezeichnen');

  const app = await read('js/app.js');
  assert.match(app, /dienstplanrad-build/, 'der Stempel muss zur Laufzeit ausgelesen werden');
});

/**
 * `npm run check` muss jedes ausgelieferte Modul erfassen.
 */
test('the syntax check covers every shipped module under js/ and functions/', async () => {
  const { readdir } = await import('node:fs/promises');
  const { resolve, relative, dirname, sep } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  async function module_(verzeichnis) {
    const einträge = await readdir(verzeichnis, { withFileTypes: true });
    const treffer = [];
    for (const eintrag of einträge) {
      const pfad = resolve(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) treffer.push(...await module_(pfad));
      else if (eintrag.name.endsWith('.js')) treffer.push(relative(wurzel, pfad).split(sep).join('/'));
    }
    return treffer;
  }

  const erwartet = [...await module_(resolve(wurzel, 'js')), ...await module_(resolve(wurzel, 'functions'))];
  const { scripts } = JSON.parse(await read('package.json'));
  const fehlend = erwartet.filter(datei => !scripts.check.includes(datei));
  assert.deepEqual(fehlend, [], `nicht von "npm run check" erfasst: ${fehlend.join(', ')}`);
});

/**
 * Die Bereinigung des historischen Workers darf zwei Dinge nicht tun: fremde
 * Registrierungen desselben Origin anfassen, und in eine Neustartschleife
 * laufen. Beide Grenzen sind hier festgeschrieben.
 */
test('the legacy cleanup is scoped to the own worker and reloads at most once per tab', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('js/app.js')]);

  for (const [name, quelle] of [['index.html', html], ['js/app.js', app]]) {
    assert.match(quelle, /pathname === '\/sw\.js'/, `${name} muss die Abmeldung auf den eigenen Worker begrenzen`);
    assert.doesNotMatch(
      quelle,
      /getRegistrations\(\)\s*\.?\s*\n?\s*\.?then\(registrations => Promise\.all\(registrations\.map/,
      `${name} darf nicht alle Registrierungen des Origin abmelden`
    );
  }

  assert.match(html, /serviceWorker\.controller !== null/);
  const markePosition = html.indexOf("sessionStorage.setItem(reloadKey");
  const reloadPosition = html.indexOf('location.reload()');
  assert.ok(markePosition > 0 && reloadPosition > markePosition, 'die Neustartmarke muss vor dem Neuladen gesetzt werden');
  assert.match(app, /if \(await legacyNeustartAngekuendigt\(\)\) return;/);
});
