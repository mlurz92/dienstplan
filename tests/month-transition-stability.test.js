import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stability = await readFile(new URL('../js/month-transition-stability.js', import.meta.url), 'utf8');
const colorDirector = await readFile(new URL('../js/color-director.js', import.meta.url), 'utf8');
const controls = await readFile(new URL('../controls.css', import.meta.url), 'utf8');
const uiControls = await readFile(new URL('../js/ui-controls.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../js/theme.js', import.meta.url), 'utf8');
const transitions = await readFile(new URL('../transitions.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('month transition stability is loaded after the spectrum director', () => {
  const spectrumImport = uiControls.indexOf("import './color-director.js?v=20260803.4';");
  const stabilityImport = uiControls.indexOf("import './month-transition-stability.js?v=20260803.4';");
  assert.ok(spectrumImport >= 0, 'der Spectrum Director muss eingebunden bleiben');
  assert.ok(stabilityImport > spectrumImport, 'die Stabilisierung muss den Director nachgelagert abschließen');
});

test('director updates run as one continuous transition instead of a hard write', () => {
  const initializer = colorDirector.slice(colorDirector.indexOf('function initializeColorDirector()'));
  assert.match(initializer, /const update = \(\) => \{/);
  assert.match(initializer, /applySpectrumProfile\(year, month, \{ animate: true \}\)/);
  assert.match(initializer, /new MutationObserver\(update\)/);
  assert.match(initializer, /monthSelect'\)\?\.addEventListener\('change', update\)/);
  assert.match(initializer, /yearSelect'\)\?\.addEventListener\('change', update\)/);
  assert.match(colorDirector, /export function applySpectrumProfile\(year, month, \{ animate = true \} = \{\}\)/);
});

test('a running transition towards the same month is never restarted', () => {
  assert.match(colorDirector, /if \(animate && animatingKey === palette\.key && animationHandle !== null\) return palette;/);
  assert.match(colorDirector, /animatingKey = palette\.key;/);
  assert.match(colorDirector, /animatingKey = null;/);
});

test('every synchronization ends the base animation and hands the colour to the director', () => {
  assert.match(stability, /import \{ applyMonthTheme \} from '.\/theme\.js\?v=20260803\.4';/);
  assert.match(stability, /applyMonthTheme\(month, \{ animate: false, year \}\);/);
  assert.match(stability, /applySpectrumProfile\(year, month, \{ animate: true \}\)/);

  const baseCall = stability.indexOf('applyMonthTheme(month, { animate: false, year });');
  const spectrumCall = stability.indexOf('applySpectrumProfile(year, month, { animate: true });');
  assert.ok(baseCall >= 0 && spectrumCall > baseCall, 'Basistheme muss vor dem priorisierten Spektrumverlauf abgeschlossen werden');

  assert.match(stability, /monthSelect'\)\?\.addEventListener\('change', settleMonthSpectrum\)/);
  assert.match(stability, /yearSelect'\)\?\.addEventListener\('change', settleMonthSpectrum\)/);
  assert.match(stability, /attributeFilter: \['data-month', 'data-year'\]/);
  assert.match(stability, /data.*monthTransition|dataset\.monthTransition/);
});

test('metadata observer ignores the month key that it has just settled itself', () => {
  assert.match(stability, /let lastSettledKey = null;/);
  assert.match(stability, /lastSettledKey = monthKey\(date\);/);
  assert.match(stability, /if \(requestedKey === lastSettledKey \|\| synchronizationQueued\) return;/);
  assert.match(stability, /if \(monthKey\(selectedDate\(\)\) === lastSettledKey\) return;/);
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

test('the base theme never overwrites the badge while the director is active', () => {
  assert.match(theme, /root\.dataset\.colorDirector \? null : document\.getElementById\('monthPaletteLabel'\)/);
});

test('the spectrum sweep only animates compositor properties', () => {
  assert.match(colorDirector, /sweep\.animate\(\[/);
  assert.match(transitions, /\.month-spectrum-sweep \{[^}]*will-change: opacity, transform;/s);
  assert.match(transitions, /prefers-reduced-motion: reduce\)[^}]*\{[\s\S]*?\.month-spectrum-sweep \{ display: none !important; \}/);
});

test('the base theme never overwrites the colours owned by the director', () => {
  // setProperty ohne Priorität würde das `important` des Directors entfernen und
  // den kräftigen Monatskontrast gegen den gedämpften Basiston tauschen.
  assert.match(theme, /export function colorDirectorOwnsSurface\(\)/);
  const writer = theme.slice(theme.indexOf('function writeVariables(root, values)'));
  assert.match(writer.slice(0, 200), /if \(colorDirectorOwnsSurface\(\)\) return;/);
  assert.match(theme, /\|\| colorDirectorOwnsSurface\(\)/);
});

test('printing settles the director transition instead of the base theme', () => {
  const prepare = app.slice(app.indexOf('function prepareForPrint()'), app.indexOf('function restoreAfterPrint()'));
  assert.match(prepare, /applySpectrumProfile\(resolveThemeYear\(state\.currentYear\), state\.currentMonth, \{ animate: false \}\)/);
  assert.match(app, /import \{ applySpectrumProfile \} from '\.\/color-director\.js\?v=20260803\.4';/);
});
