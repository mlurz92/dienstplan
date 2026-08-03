import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const motion = await readFile(new URL('../js/month-view-transition.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../transitions.css', import.meta.url), 'utf8');
const controls = await readFile(new URL('../js/ui-controls.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('month motion is initialized before the color and stability layers', () => {
  const motionImport = controls.indexOf("import './month-view-transition.js?v=20260803.4';");
  const directorImport = controls.indexOf("import './color-director.js?v=20260803.4';");
  const stabilityImport = controls.indexOf("import './month-transition-stability.js?v=20260803.4';");
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

  assert.match(css, /view-transition-name:\s*month-sheet/);
  assert.match(css, /::view-transition-old\(month-sheet\)/);
  assert.match(css, /::view-transition-new\(month-sheet\)/);
  assert.match(css, /translate3d\(/);
  assert.doesNotMatch(css, /filter:\s*blur/);
});

test('target month is prefetched once and handed to the existing app loader', () => {
  assert.match(motion, /const monthLoadHandoffs = new Map\(\)/);
  assert.match(motion, /api\.getMonth = \(year, month\) =>/);
  assert.match(motion, /loadMonth\(date\.year, date\.month\)/);
  assert.match(motion, /primeAppLoadHandoff\(date\)/);
  assert.match(motion, /monthLoadHandoffs\.delete\(key\)/);
});

test('view-transition callback waits on DOM mutations and never on requestAnimationFrame', () => {
  const nativeStart = motion.indexOf('const transition = document.startViewTransition(async () => {');
  const nativeEnd = motion.indexOf('activeViewTransition = transition;', nativeStart);
  const callback = motion.slice(nativeStart, nativeEnd);
  assert.match(callback, /waitForTargetDom\(date, generation, signal\)/);
  assert.match(callback, /dispatchAppNavigation\(date\)/);
  assert.doesNotMatch(callback, /requestAnimationFrame/);
  assert.match(motion, /const observer = new MutationObserver\(check\)/);
  assert.match(motion, /attributeFilter: \['data-month', 'data-year'\]/);
});

test('rapid navigation aborts preload, DOM wait and active visual transition', () => {
  assert.match(motion, /activeAbortController\?\.abort\(\)/);
  assert.match(motion, /signal\.addEventListener\('abort', onAbort/);
  assert.match(motion, /activeViewTransition\?\.skipTransition/);
  assert.match(motion, /generation !== navigationGeneration/);
});

test('native animation state begins only when transition layers are ready', () => {
  assert.match(motion, /await transition\.ready;/);
  assert.match(motion, /setMotionState\('animating', 'native-view-transition', direction\)/);
});

test('transition stylesheet and syntax check are shipped', () => {
  assert.match(motion, /\/transitions\.css\?v=20260803\.4/);
  assert.match(packageJson.scripts.check, /js\/month-view-transition\.js/);
});
