import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = async path => {
  try {
    await access(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
};

/**
 * Die Anwendung hat keinen Service Worker mehr – und darf auch keinen
 * zurückbekommen. Der frühere Worker lieferte eigenen Code Cache-First aus und
 * hat ausgerollte Korrekturen dauerhaft von den Clients ferngehalten. Dieser
 * Test ist die Sperre dagegen: Er schlägt an, sobald wieder eine Worker-Datei
 * im Projekt liegt oder irgendwo eine Registrierung erfolgt.
 */
test('the application ships without any service worker and never registers one', async () => {
  assert.equal(await exists('sw.js'), false, 'sw.js darf nicht wieder eingeführt werden');
  assert.equal(await exists('service-worker.js'), false, 'kein Worker unter alternativem Namen');

  const sources = await Promise.all(['index.html', 'js/app.js', 'js/state.js', 'js/theme.js'].map(read));
  for (const source of sources) {
    const registrations = [...source.matchAll(/serviceWorker\s*\.\s*register\s*\(/g)];
    assert.equal(registrations.length, 0, 'kein serviceWorker.register() im Auslieferungsstand');
  }
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

test('all release-critical shell and module assets share one cache-busting token', async () => {
  const files = ['index.html', 'js/app.js', 'js/state.js', 'js/rules.js'];
  const sources = await Promise.all(files.map(read));
  const tokens = sources.flatMap(source => [...source.matchAll(/\?v=([a-z0-9.-]+)/gi)].map(match => match[1]));

  assert.ok(tokens.length >= 10, 'entry assets and the full module graph need version tokens');
  assert.equal(new Set(tokens).size, 1, 'one release must use one asset version everywhere');

  for (let index = 1; index < files.length; index += 1) {
    const localImports = [...sources[index].matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
    assert.ok(localImports.length > 0, `${files[index]} should contain local imports`);
    assert.ok(localImports.every(specifier => specifier.includes('?v=')), `${files[index]} contains an unversioned browser import`);
  }
});

test('Cloudflare revalidates the app shell and application assets on every visit', async () => {
  const headers = await read('_headers');

  assert.doesNotMatch(headers, /^\/sw\.js/m, 'kein Eintrag für eine nicht mehr existierende Worker-Datei');

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
 *
 * Er ist die Antwort auf einen realen Vorfall: Die Live-Seite lief auf einem
 * Zweig, dem das Monatsfarbsystem vollständig fehlte – `applyMonthTheme` kam
 * dort kein einziges Mal vor. Von außen war das nicht zu erkennen, weil die
 * Anwendung im Übrigen normal aussah. Mit dem Stempel genügt ein Aufruf:
 *
 *     curl -s https://dienstplanrad.pages.dev/ | grep dienstplanrad-build
 */
test('the deployed build stamp matches the module graph release token', async () => {
  const html = await read('index.html');
  const stamp = html.match(/name="dienstplanrad-build"\s+content="([^"]+)"/)?.[1];
  const token = html.match(/\?v=([a-z0-9.-]+)/i)?.[1];

  assert.ok(stamp, 'index.html braucht einen Auslieferungsstempel');
  assert.equal(stamp, token, 'Stempel und Release-Token müssen denselben Stand bezeichnen');

  const app = await read('js/app.js');
  assert.match(app, /dienstplanrad-build/, 'der Stempel muss zur Laufzeit ausgelesen werden');
});
