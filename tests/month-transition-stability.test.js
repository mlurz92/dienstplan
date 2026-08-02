import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stability = await readFile(new URL('../js/month-transition-stability.js', import.meta.url), 'utf8');
const colorDirector = await readFile(new URL('../js/color-director.js', import.meta.url), 'utf8');
const controls = await readFile(new URL('../controls.css', import.meta.url), 'utf8');
const uiControls = await readFile(new URL('../js/ui-controls.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('month transition stability is loaded after the spectrum director', () => {
  const spectrumImport = uiControls.indexOf("import './color-director.js?v=20260801.11';");
  const stabilityImport = uiControls.indexOf("import './month-transition-stability.js?v=20260801.11';");
  assert.ok(spectrumImport >= 0, 'der Spectrum Director muss eingebunden bleiben');
  assert.ok(stabilityImport > spectrumImport, 'die Stabilisierung muss den Director nachgelagert abschließen');
});

test('automatic director updates are atomic while explicit API calls may still animate', () => {
  const initializer = colorDirector.slice(colorDirector.indexOf('function initializeColorDirector()'));
  assert.match(initializer, /const update = \(\) => \{/);
  assert.match(initializer, /applySpectrumProfile\(year, month, \{ animate: false \}\)/);
  assert.match(initializer, /new MutationObserver\(update\)/);
  assert.match(initializer, /monthSelect'\)\?\.addEventListener\('change', update\)/);
  assert.match(initializer, /yearSelect'\)\?\.addEventListener\('change', update\)/);
  assert.doesNotMatch(initializer, /update\(\{ animate: true \}\)/);
  assert.match(colorDirector, /export function applySpectrumProfile\(year, month, \{ animate = true \} = \{\}\)/);
});

test('every synchronization cancels the base animation before writing the final spectrum', () => {
  assert.match(stability, /import \{ applyMonthTheme \} from '.\/theme\.js\?v=20260801\.11';/);
  assert.match(stability, /applyMonthTheme\(month, \{ animate: false, year \}\);/);
  assert.match(stability, /applySpectrumProfile\(year, month, \{ animate: false \}\)/);

  const baseCall = stability.indexOf('applyMonthTheme(month, { animate: false, year });');
  const spectrumCall = stability.indexOf('applySpectrumProfile(year, month, { animate: false });');
  assert.ok(baseCall >= 0 && spectrumCall > baseCall, 'Basistheme muss vor dem priorisierten Spektrum abgeschlossen werden');

  assert.match(stability, /monthSelect'\)\?\.addEventListener\('change', settleMonthSpectrum\)/);
  assert.match(stability, /yearSelect'\)\?\.addEventListener\('change', settleMonthSpectrum\)/);
  assert.match(stability, /attributeFilter: \['data-month', 'data-year'\]/);
  assert.match(stability, /data.*monthTransition|dataset\.monthTransition/);
});

test('a short paint guard reinforces the final colour after competing callbacks', () => {
  assert.match(stability, /const PAINT_GUARD_FRAMES = [3-9];/);
  assert.match(stability, /paintGuardHandle = requestAnimationFrame\(reinforce\)/);
  assert.match(stability, /writeFinalSpectrum\(\);\s*remaining -= 1;/s);
  assert.match(stability, /cancelAnimationFrame\(paintGuardHandle\)/);
});

test('legacy month-enter classes can no longer hide the freshly rendered table', () => {
  const blockStart = controls.indexOf('.month-enter-next');
  const blockEnd = controls.indexOf('body.month-content-transition .month-palette-label', blockStart);
  assert.ok(blockStart >= 0, 'CSS-Schutzregel fehlt');
  const rule = controls.slice(blockStart, blockEnd > blockStart ? blockEnd : undefined);
  assert.match(rule, /\.month-enter-next,\s*\.month-enter-prev\s*\{[^}]*animation:\s*none\s*!important;/s);
  assert.match(rule, /opacity:\s*1\s*!important;/);
  assert.match(rule, /transform:\s*none\s*!important;/);
  assert.doesNotMatch(rule, /opacity:\s*0(?:\D|$)/);
});

test('syntax verification covers the stability module', () => {
  assert.match(packageJson.scripts.check, /js\/month-transition-stability\.js/);
});
