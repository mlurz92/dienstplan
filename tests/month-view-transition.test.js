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

test('app navigation starts inside the captured transition before readiness polling', () => {
  const nativeStart = motion.indexOf('const transition = document.startViewTransition(async () => {');
  const dispatch = motion.indexOf('dispatchAppNavigation(date);', nativeStart);
  const readiness = motion.indexOf('await waitForTargetReady(date, generation);', nativeStart);
  assert.ok(nativeStart >= 0 && dispatch > nativeStart);
  assert.ok(readiness > dispatch, 'die App muss direkt nach dem alten Snapshot starten');
  assert.match(motion, /function isLoadingStatus\(\)/);
  assert.match(motion, /document\.getElementById\('saveStatus'\)/);
});

test('new view remains stable for several frames after the load status has settled', () => {
  assert.match(motion, /const STABILIZATION_FRAMES = [3-9];/);
  assert.match(motion, /while \(stableFrames < STABILIZATION_FRAMES\)/);
  assert.match(motion, /rows === expectedRows/);
  assert.match(motion, /consistent && !loading/);
  assert.match(motion, /await waitForTargetReady\(date, generation\)/);
});

test('native state begins at transition.ready and rapid navigation cancels the previous capture', () => {
  assert.match(motion, /await transition\.ready;/);
  assert.match(motion, /setMotionState\('animating', 'native-view-transition', direction\)/);
  assert.match(motion, /activeViewTransition\?\.skipTransition/);
  assert.match(motion, /generation !== navigationGeneration/);
});

test('transition stylesheet and syntax check are shipped', () => {
  assert.match(motion, /\/transitions\.css\?v=20260801\.11/);
  assert.match(packageJson.scripts.check, /js\/month-view-transition\.js/);
});
