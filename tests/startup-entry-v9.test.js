import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
