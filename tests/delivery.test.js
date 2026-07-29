import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy service workers are neutralized before versioned application assets load', async () => {
  const [html, worker] = await Promise.all([
    read('index.html'),
    read('sw.js')
  ]);

  const cleanupPosition = html.indexOf('dienstplanrad:legacy-cleanup');
  const stylesheetPosition = html.indexOf('rel="stylesheet"');
  const modulePosition = html.indexOf('type="module"');

  assert.ok(cleanupPosition > 0, 'index.html needs an inline legacy-worker cleanup');
  assert.ok(cleanupPosition < stylesheetPosition, 'cleanup must start before the stylesheet request');
  assert.ok(cleanupPosition < modulePosition, 'cleanup must start before the module graph request');
  assert.match(html, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(html, /caches\.keys\(\)/);

  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.match(worker, /self\.registration\.unregister\(\)/);
  assert.match(worker, /caches\.delete\(/);
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

  for (const route of ['/', '/index.html', '/sw.js']) {
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
