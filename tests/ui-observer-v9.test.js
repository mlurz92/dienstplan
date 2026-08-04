import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Toolbar-Aufwertung schreibt beobachteten Labeltext nur bei echter Änderung', async () => {
  const source = await read('../js/ui-v8-5.js');
  assert.match(source, /label && label\.textContent !== shortLabel/);
  assert.doesNotMatch(source, /if \(label\) label\.textContent = shortLabel/);
  assert.match(source, /let toolbarTouched = false/);
  assert.match(source, /if \(toolbarTouched\) scheduleToolbarRefresh\(\)/);
  assert.doesNotMatch(source, /safeStep\('mark-late-toolbar', markToolbarReady\);\s*\}\);\s*observer\.observe/s);
});

test('Tooltip-Observer erzeugt keine identischen Attributmutationen', async () => {
  const source = await read('../js/rich-tooltip-v8-5.js');
  assert.match(source, /element\.dataset\.tooltip !== tooltip/);
  assert.match(source, /element\.hasAttribute\('title'\)/);
  assert.match(source, /element\.getAttribute\('title'\) !== element\.dataset\.tooltip/);
  assert.doesNotMatch(source, /element\.dataset\.tooltip = String\(text \|\| ''\)\.trim\(\)/);
});
