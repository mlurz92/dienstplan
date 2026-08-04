import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Hauptentrypoint startet vor und nach DOMContentLoaded genau einmal', async () => {
  const app = await read('../js/app.js');
  assert.doesNotMatch(app, /window\.addEventListener\('DOMContentLoaded',\s*init\)/);
  assert.match(app, /let startupPromise = null/);
  assert.match(app, /if \(startupPromise\) return startupPromise/);
  assert.match(app, /document\.readyState === 'loading'/);
  assert.match(app, /document\.addEventListener\('DOMContentLoaded', startApplication, \{ once: true \}\)/);
  assert.match(app, /else \{\s*startApplication\(\);\s*\}/s);
  assert.match(app, /__dienstplanStartupHealth/);
  assert.match(app, /'app-init'/);
});

test('E2E-Bereitschaft folgt dem App-Vertrag statt dem vollständigen load-Ereignis', async () => {
  const helper = await read('../tests/e2e/open-app.js');
  assert.match(helper, /waitUntil: 'domcontentloaded'/);
  assert.match(helper, /#monthSelect option/);
  assert.match(helper, /#planTableBody tr/);
  assert.match(helper, /#saveStatus/);
  assert.match(helper, /#startupFailureV9/);
});

test('reguläre E2E-Spezifikationen verwenden keinen unqualifizierten load-Wait mehr', async () => {
  const directory = new URL('../tests/e2e/', import.meta.url);
  const names = (await readdir(directory)).filter(name => name.endsWith('.spec.js'));
  const allowCustomStartupNavigation = new Set(['startup-v9.spec.js']);
  for (const name of names) {
    const source = await read(`../tests/e2e/${name}`);
    assert.doesNotMatch(source, /await page\.goto\('\/'\);/, `${name} wartet noch auf das vollständige load-Ereignis`);
    if (!allowCustomStartupNavigation.has(name) && source.includes("page.goto('/')")) {
      assert.match(source, /openApp\(page\)/, `${name} besitzt keinen expliziten App-Ready-Vertrag`);
    }
  }
});
