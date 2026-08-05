import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const APP_CACHE_TOKEN = '20260803.4';

function importsOf(source) {
  return [...source.matchAll(/(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|import\()\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1]);
}

function stripReleaseToken(specifier) {
  return specifier.replace(/\?v=[^#]+(?=#|$)/, '');
}

test('algorithm spectrum app icons are complete, accessible and correctly wired', async () => {
  const html = await read('index.html');
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  const iconSvg = await read('icons/icon.svg');
  const animatedIcon = await read('icons/icon-animated.svg');
  const ui = await read('js/ui-controls.js');

  assert.equal(manifest.name, 'Dienstplanrad');
  assert.equal(manifest.short_name, 'Dienstplan');
  assert.equal(manifest.icons.length, 4);
  assert.ok(manifest.icons.some(icon => icon.src === './icons/icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.src === './icons/icon-512.png' && icon.sizes === '512x512'));
  assert.ok(manifest.icons.some(icon => icon.src === './icons/icon-maskable-512.png' && icon.purpose === 'maskable'));
  assert.ok(manifest.icons.some(icon => icon.src === './icons/icon.svg' && icon.sizes === 'any'));

  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="icon" href="\.\/icons\/icon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/icon-180\.png">/);
  assert.match(html, /<button id="autoPlanBtn"[^>]*aria-label="Auto-Plan Studio öffnen"/);
  assert.match(ui, /autoPlanBtn/);
  assert.match(iconSvg, /aria-labelledby="title desc"/);
  assert.match(animatedIcon, /aria-labelledby="title desc"/);
  assert.match(animatedIcon, /prefers-reduced-motion/);
});

test('the application ships without any service worker and never registers one', async () => {
  const html = await read('index.html');
  const app = await read('js/app.js');
  const packageJson = await read('package.json');

  assert.doesNotMatch(html, /navigator\.serviceWorker\.register/);
  assert.doesNotMatch(app, /navigator\.serviceWorker\.register/);
  assert.doesNotMatch(packageJson, /workbox|service-worker/i);
});

test('the /sw.js route is a Function, not an asset, and only unregisters and purges', async () => {
  const routes = JSON.parse(await read('_routes.json'));
  const headers = await read('_headers');
  const worker = await read('functions/sw.js.js');

  assert.ok(routes.include.includes('/sw.js'));
  assert.ok(routes.exclude.includes('/*'));
  assert.match(headers, /\/sw\.js[\s\S]*Cache-Control: no-store/);
  assert.match(worker, /Clear-Site-Data/);
  assert.match(worker, /Service-Worker-Allowed/);
  assert.match(worker, /registration\.unregister/);
  assert.match(worker, /caches\.keys/);
  assert.doesNotMatch(worker, /caches\.open|cache\.addAll|cache\.put/);
});

test('legacy service workers are neutralized before versioned application assets load', async () => {
  const html = await read('index.html');
  const app = await read('js/app.js');

  const cleanupIndex = html.indexOf('navigator.serviceWorker.getRegistrations()');
  const appModuleIndex = html.indexOf('js/app.js');
  assert.ok(cleanupIndex >= 0 && cleanupIndex < appModuleIndex);
  assert.match(html, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(html, /caches\.keys\(\)/);

  assert.match(app, /getRegistrations\(\)/, 'der Anwendungsstart räumt zusätzlich auf');
  assert.match(app, /caches\.delete\(/);
});

/**
 * v9.5 ist bewusst eine additive Kompatibilitätsschicht: Der unveränderte
 * Anwendungsshell bleibt auf dem ausgerollten Basistoken. Die reguläre v9.5-
 * Schicht verwendet ihren Releasetoken; gezielte additive Hotfixmodule dürfen
 * einen eigenen, ausdrücklich geprüften Patchtoken tragen. So wird nur der
 * tatsächlich geänderte Browsercode sicher invalidiert.
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
  const allowed = new Set(['20260803.4', '20260805.1', '20260805.2', '20260805.3']);

  assert.ok(tokens.length >= 50, 'entry assets and the full module graph need version tokens');
  assert.ok(tokens.every(token => allowed.has(token)), `unerwarteter Release-Token: ${[...new Set(tokens)].filter(token => !allowed.has(token)).join(', ')}`);
  assert.deepEqual([...new Set(tokens)].sort(), [...allowed].sort(), 'Basis-, v9.5- und Hotfix-Schicht müssen ausdrücklich vorkommen');

  const publicPlanner = await read('js/auto-planner.js');
  const autoPlanUi = await read('js/auto-plan-ui.js');
  assert.match(publicPlanner, /auto-planner-v9-5-runtime\.js\?v=20260805\.1/);
  assert.match(autoPlanUi, /auto-plan-studio-v9-5\.js\?v=20260805\.1/);
  assert.match(autoPlanUi, /auto-plan-studio-v9-5-polish\.js\?v=20260805\.3/);

  for (let index = 1; index < files.length; index += 1) {
    const localImports = [...sources[index].matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
    assert.ok(localImports.length > 0, `${files[index]} should contain local imports`);
    assert.ok(localImports.every(specifier => specifier.includes('?v=')), `${files[index]} contains an unversioned browser import`);
  }
});

test('every relative browser-module import resolves after removing its release token', async () => {
  const { readdir, stat } = await import('node:fs/promises');
  const moduleFiles = (await readdir(new URL('../js/', import.meta.url), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `js/${entry.name}`);

  for (const path of moduleFiles) {
    const source = await read(path);
    for (const specifier of importsOf(source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = new URL(stripReleaseToken(specifier), new URL(`../${path}`, import.meta.url));
      await assert.doesNotReject(stat(resolved), `${path} imports a missing module: ${specifier}`);
    }
  }
});

test('Cloudflare revalidates the app shell and application assets on every visit', async () => {
  const headers = await read('_headers');
  assert.match(headers, /\/index\.html[\s\S]*Cache-Control: no-store, must-revalidate/);
  assert.match(headers, /\/manifest\.webmanifest[\s\S]*Cache-Control: no-store, must-revalidate/);
  assert.match(headers, /\/js\/\*[\s\S]*Cache-Control: no-store, must-revalidate/);
  assert.match(headers, /\/\*\.css[\s\S]*Cache-Control: no-store, must-revalidate/);
  assert.match(headers, /\/icons\/\*[\s\S]*Cache-Control: public, max-age=604800, immutable/);
});

test('the deployed build stamp matches the shell module release token', async () => {
  const html = await read('index.html');
  const app = await read('js/app.js');
  const ui = await read('js/ui-controls.js');

  assert.match(html, new RegExp(`js/app\\.js\\?v=${APP_CACHE_TOKEN.replace('.', '\\.')}"`));
  assert.match(app, new RegExp(`ui-controls\\.js\\?v=${APP_CACHE_TOKEN.replace('.', '\\.')}`));
  assert.match(ui, /buildStamp\.textContent\s*=\s*'20260803\.4'/);
});

test('the syntax check covers every shipped module under js/ and functions/', async () => {
  const { readdir } = await import('node:fs/promises');
  const packageJson = JSON.parse(await read('package.json'));
  const checkScript = packageJson.scripts.check;

  const collect = async (directory, prefix = directory) => {
    const entries = await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) files.push(...await collect(`${directory}/${entry.name}`, path));
      else if (entry.name.endsWith('.js')) files.push(path);
    }
    return files;
  };

  const shipped = [...await collect('js'), ...await collect('functions')];
  for (const path of shipped) assert.match(checkScript, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the legacy cleanup is scoped to the own worker and reloads at most once per tab', async () => {
  const html = await read('index.html');
  const app = await read('js/app.js');

  assert.match(html, /registration\.scope === ownScope/);
  assert.match(html, /sessionStorage\.getItem\(reloadKey\)/);
  assert.match(html, /sessionStorage\.setItem\(reloadKey, '1'\)/);
  assert.match(app, /registration\.scope === ownScope/);
  assert.match(app, /sessionStorage\.getItem\(LEGACY_WORKER_RELOAD_KEY\)/);
});
