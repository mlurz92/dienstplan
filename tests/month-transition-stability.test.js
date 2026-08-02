import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stability = await readFile(new URL('../js/month-transition-stability.js', import.meta.url), 'utf8');
const controls = await readFile(new URL('../controls.css', import.meta.url), 'utf8');
const uiControls = await readFile(new URL('../js/ui-controls.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('month transition stability is loaded after the spectrum director', () => {
  const spectrumImport = uiControls.indexOf("import './color-director.js?v=20260801.11';");
  const stabilityImport = uiControls.indexOf("import './month-transition-stability.js?v=20260801.11';");
  assert.ok(spectrumImport >= 0, 'der Spectrum Director muss eingebunden bleiben');
  assert.ok(stabilityImport > spectrumImport, 'die Stabilisierung muss den Director nachgelagert abschließen');
});

test('every synchronization writes the final spectrum without another animation', () => {
  assert.match(stability, /applySpectrumProfile\(year, month, \{ animate: false \}\)/);
  assert.match(stability, /monthSelect'\)\?\.addEventListener\('change', settleMonthSpectrum\)/);
  assert.match(stability, /yearSelect'\)\?\.addEventListener\('change', settleMonthSpectrum\)/);
  assert.match(stability, /attributeFilter: \['data-month', 'data-year'\]/);
  assert.match(stability, /data.*monthTransition|dataset\.monthTransition/);
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
