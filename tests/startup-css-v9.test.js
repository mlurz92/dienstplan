import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const criticalStyles = Object.freeze([
  ['/app-v8-5.css', 'data-v85-shell-style="/app-v8-5.css"'],
  ['/toolbar-v8-5.css', 'data-v85-shell-style="/toolbar-v8-5.css"'],
  ['/auto-plan-studio.css', 'data-auto-plan-style="/auto-plan-studio.css"'],
  ['/auto-plan-studio-v6.css', 'data-auto-plan-v6-style="true"'],
  ['/auto-plan-studio-v7.css', 'data-auto-plan-v7-style="true"'],
  ['/auto-plan-studio-v7-5.css', 'data-auto-plan-v7-5-style="true"'],
  ['/auto-plan-studio-v8.css', 'data-auto-plan-v8-style="true"'],
  ['/auto-plan-studio-v8-5.css', 'data-auto-plan-v85-style="true"'],
  ['/auto-plan-studio-v9.css', 'data-auto-plan-v9-style="true"']
]);

test('startkritische Shell- und Studio-Styles sind parserseitig vor den Modulen eingebunden', async () => {
  const html = await read('../index.html');
  const firstModule = html.indexOf('<script type="module"');
  assert.ok(firstModule > 0, 'erstes Modulskript fehlt');

  for (const [href, marker] of criticalStyles) {
    const linkPattern = new RegExp(`<link[^>]+href="${href.replaceAll('/', '\\/')}\\?v=[^"]+"[^>]*>`);
    const match = html.match(linkPattern);
    assert.ok(match, `${href} fehlt als deklaratives Stylesheet`);
    assert.ok(match[0].includes(marker), `${href} besitzt nicht den Marker des idempotenten JS-Fallbacks`);
    assert.ok(html.indexOf(match[0]) < firstModule, `${href} wird erst nach dem ersten Modul geladen`);
  }
});

test('dynamische Stylesheet-Fallbacks erkennen die parserseitig eingebundenen Links', async () => {
  const sources = await Promise.all([
    read('../js/ui-v8-5.js'),
    read('../js/auto-plan-studio-v5.js'),
    read('../js/auto-plan-studio-v6.js'),
    read('../js/auto-plan-studio-v7.js'),
    read('../js/auto-plan-studio-v7-5.js'),
    read('../js/auto-plan-studio-v8.js'),
    read('../js/auto-plan-studio-v8-5.js'),
    read('../js/auto-plan-studio-v9.js')
  ]);
  const combined = sources.join('\n');

  for (const marker of [
    'data-v85-shell-style',
    'data-auto-plan-style',
    'data-auto-plan-v6-style',
    'data-auto-plan-v7-style',
    'data-auto-plan-v7-5-style',
    'data-auto-plan-v8-style',
    'data-auto-plan-v85-style',
    'data-auto-plan-v9-style'
  ]) assert.match(combined, new RegExp(marker));
});
