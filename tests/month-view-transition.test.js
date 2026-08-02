import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const motion = await readFile(new URL('../js/month-view-transition.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../transitions.css', import.meta.url), 'utf8');
const controls = await readFile(new URL('../js/ui-controls.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('month motion is initialized before the color and stability layers', () => {
  const motionImport = controls.indexOf("import './month-view-transition.js?v=20260801.11';");
  const directorImport = controls.indexOf("import './color-director.js?v=20260801.11';");
  const stabilityImport = controls.indexOf("import './month-transition-stability.js?v=20260801.11';");
  assert.ok(motionImport >= 0);
  assert.ok(directorImport > motionImport);
  assert.ok(stabilityImport > directorImport);
});

test('navigation is intercepted before app handlers and replayed once', () => {
  assert.match(motion, /document\.addEventListener\('click', interceptClick, true\)/);
  assert.match(motion, /document\.addEventListener\('change', interceptSelection, true\)/);
  assert.match(motion, /event\.stopImmediatePropagation\(\)/);
  assert.match(motion, /monthSelect\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(motion, /bypassInterception = true/);
});

test('native view transitions and a compositor-only WAAPI fallback are both present', () => {
  assert.match(motion, /document\.startViewTransition\(async \(\) =>/);
  assert.match(motion, /clone\.animate\(\[/);
  assert.match(motion, /source\.animate\(\[/);
  assert.match(motion, /willChange = 'transform, opacity'/);
  assert.doesNotMatch(motion, /setInterval\(/);

  assert.match(css, /::view-transition-old\(root\)/);
  assert.match(css, /::view-transition-new\(root\)/);
  assert.match(css, /translate3d\(/);
  assert.doesNotMatch(css, /filter:\s*blur/);
});

test('target data is prefetched and handed to app without a duplicate month GET', () => {
  assert.match(motion, /const monthLoadHandoffs = new Map\(\)/);
  assert.match(motion, /api\.getMonth = \(year, month\) =>/);
  assert.match(motion, /monthLoadHandoffs\.delete\(key\)/);
  assert.match(motion, /primeAppLoadHandoff\(date\)/);
  assert.match(motion, /loadMonth\(date\.year, date\.month\)/);
});

test('new view is stable for several animation frames before the snapshot handoff', () => {
  assert.match(motion, /const STABILIZATION_FRAMES = [4-9];/);
  assert.match(motion, /while \(consecutiveStableFrames < STABILIZATION_FRAMES\)/);
  assert.match(motion, /rows === expectedRows/);
  assert.match(motion, /await stabilizeNewView\(date, generation\)/);
});

test('transition stylesheet and syntax check are shipped', () => {
  assert.match(motion, /\/transitions\.css\?v=20260801\.11/);
  assert.match(packageJson.scripts.check, /js\/month-view-transition\.js/);
});
