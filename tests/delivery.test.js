import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy service workers are replaced by the no-op worker before application data loads', async () => {
  const [html, app, migration, worker] = await Promise.all([
    read('index.html'),
    read('js/app.js'),
    read('js/legacy-worker.js').catch(() => ''),
    read('sw.js')
  ]);

  assert.ok(migration, 'the migration needs a dedicated, testable browser module');
  assert.doesNotMatch(html, /getRegistrations\(\)/, 'index.html must not unregister unrelated origin workers');
  assert.match(app, /import \{ neutralizeLegacyServiceWorker \} from '.\/legacy-worker\.js\?v=/);
  const cleanupPosition = app.indexOf('await neutralizeLegacyServiceWorker()');
  const bootstrapPosition = app.indexOf('await bootstrapState()');
  assert.ok(cleanupPosition >= 0 && cleanupPosition < bootstrapPosition, 'legacy cleanup must settle before API bootstrap');
  assert.match(migration, /updateViaCache:\s*'none'/);
  assert.match(migration, /serviceWorker\.register\(/);

  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.match(worker, /self\.registration\.unregister\(\)/);
  assert.match(worker, /caches\.delete\(/);
  assert.doesNotMatch(worker, /addEventListener\(['"]fetch['"]/, 'the tombstone must never intercept application requests');
});

test('legacy cleanup upgrades the historical worker at its existing scope', async () => {
  const migration = await read('js/legacy-worker.js').catch(() => '');
  assert.ok(migration, 'the migration module is missing');
  const { neutralizeLegacyServiceWorker } = await import('../js/legacy-worker.js');
  const calls = [];
  const listeners = new Map();
  const registration = {
    scope: 'https://app.test/',
    active: { scriptURL: 'https://app.test/sw.js?legacy=v9' },
    waiting: null,
    installing: null,
    unregister: async () => { calls.push(['unregister']); return true; }
  };
  const serviceWorker = {
    getRegistration: async () => registration,
    register: async (url, options) => {
      calls.push(['register', url, options]);
      queueMicrotask(() => listeners.get('controllerchange')?.());
      return registration;
    },
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name)
  };
  const cacheStorage = {
    keys: async () => ['dienstplanrad-v6', 'other-product-v1'],
    delete: async key => { calls.push(['delete', key]); return true; }
  };

  const result = await neutralizeLegacyServiceWorker({
    baseUrl: 'https://app.test/',
    serviceWorker,
    cacheStorage,
    settleTimeoutMs: 50
  });

  assert.equal(result.found, true);
  assert.deepEqual(
    calls.find(call => call[0] === 'register'),
    ['register', 'https://app.test/sw.js', { scope: 'https://app.test/', updateViaCache: 'none' }]
  );
  const registerIndex = calls.findIndex(call => call[0] === 'register');
  const legacyDeleteIndexes = calls
    .map((call, index) => call[0] === 'delete' && call[1] === 'dienstplanrad-v6' ? index : -1)
    .filter(index => index >= 0);
  assert.ok(legacyDeleteIndexes.some(index => index < registerIndex), 'stale API entries must be removed before takeover');
  assert.ok(legacyDeleteIndexes.some(index => index > registerIndex), 'entries created during takeover must be removed afterwards');
  assert.ok(!calls.some(call => call[0] === 'delete' && call[1] === 'other-product-v1'));
});

test('legacy cleanup preserves unrelated service-worker registrations', async () => {
  const migration = await read('js/legacy-worker.js').catch(() => '');
  assert.ok(migration, 'the migration module is missing');
  const { neutralizeLegacyServiceWorker } = await import('../js/legacy-worker.js');
  let mutated = false;
  const registration = {
    scope: 'https://app.test/',
    active: { scriptURL: 'https://app.test/other-worker.js' },
    waiting: null,
    installing: null,
    unregister: async () => { mutated = true; return true; }
  };
  const serviceWorker = {
    getRegistration: async () => registration,
    register: async () => { mutated = true; return registration; }
  };
  const cacheStorage = {
    keys: async () => ['other-product-v1'],
    delete: async () => { mutated = true; return true; }
  };

  const result = await neutralizeLegacyServiceWorker({
    baseUrl: 'https://app.test/',
    serviceWorker,
    cacheStorage
  });

  assert.equal(result.found, false);
  assert.equal(mutated, false);
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
  const routeBlocks = new Map(
    headers
      .split(/\r?\n(?=\/)/)
      .map(block => block.trim())
      .filter(block => block.startsWith('/'))
      .map(block => {
        const [route, ...lines] = block.split(/\r?\n/);
        const cacheControl = lines
          .map(line => line.trim())
          .find(line => line.toLowerCase().startsWith('cache-control:'))
          ?.slice('cache-control:'.length)
          .trim();
        return [route, cacheControl];
      })
  );

  for (const route of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/styles.css', '/js/*', '/icons/*']) {
    assert.equal(routeBlocks.get(route), 'no-cache', `${route} must use one unambiguous revalidation directive`);
  }
});
