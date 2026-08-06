/**
 * Seasonal Spectrum Director — DOM integration and public facade.
 */
import { SPECTRUM_DURATION_MS, VARIABLE_NAMES } from './color-atlas-data.js';
import { colorProfileForDate, spectrumVariables, mixOklch } from './color-atlas-engine.js';

export * from './color-atlas-data.js';
export * from './color-atlas-engine.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const SEASON_LABELS = Object.freeze({
  Winter: 'Winter',
  'Late winter': 'Spätwinter',
  'Early spring': 'Vorfrühling',
  Spring: 'Frühling',
  'Early summer': 'Frühsommer',
  'High summer': 'Hochsommer',
  'Late summer': 'Spätsommer',
  'Early autumn': 'Frühherbst',
  Autumn: 'Herbst',
  'Late autumn': 'Spätherbst'
});

const FAMILY_LABELS = Object.freeze({
  'Ice · Polar light': 'Eis · Polarlicht',
  'Berry · Lacquer': 'Beere · Lack',
  'Bud green · Botanical': 'Knospe · Botanik',
  'Bloom · Iris': 'Blüte · Iris',
  'Leaf green · Citrus': 'Blattgrün · Zitrus',
  'Water · Coast': 'Wasser · Küste',
  'Fruit · Solar heat': 'Frucht · Sonnenhitze',
  'Gold · Harvest': 'Gold · Ernte',
  'Wine · Plum': 'Wein · Pflaume',
  'Copper · Earth': 'Kupfer · Erde',
  'Mineral · Storm': 'Mineral · Sturm',
  'Evergreen · Festive light': 'Immergrün · Festlicht'
});

function localizedMetadata(palette) {
  return {
    season: SEASON_LABELS[palette.season] || palette.season,
    family: FAMILY_LABELS[palette.family] || palette.family
  };
}

function parseCssColor(value) {
  const match = String(value ?? '').match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
}
function toCss(color) {
  const [r, g, b, alpha = 1] = color;
  const rgb = [r, g, b].map(value => Math.round(clamp(value, 0, 255)));
  return alpha >= .999
    ? `rgb(${rgb.join(', ')})`
    : `rgba(${rgb.join(', ')}, ${Math.round(clamp(alpha, 0, 1) * 1000) / 1000})`;
}
function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function readCurrentVariables(root, fallback) {
  if (typeof getComputedStyle !== 'function') return fallback;
  const computed = getComputedStyle(root);
  return Object.fromEntries(VARIABLE_NAMES.map(name => [name, parseCssColor(computed.getPropertyValue(name)) || fallback[name]]));
}

const lastWritten = new Map();
function writeVariables(root, values) {
  for (const [name, value] of Object.entries(values)) {
    const css = toCss(value);
    if (lastWritten.get(name) === css && root.style.getPropertyValue(name) === css) continue;
    root.style.setProperty(name, css, 'important');
    lastWritten.set(name, css);
  }
}
const easeSpectrum = t => t * t * t * (t * (t * 6 - 15) + 10);

let animationHandle = null;
let activeKey = null;
let activeSchemeKey = null;
let animatingKey = null;

function playSpectrumSweep(root, accent) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;
  document.querySelector('.month-spectrum-sweep')?.remove();
  const sweep = document.createElement('div');
  sweep.className = 'month-spectrum-sweep';
  sweep.setAttribute('aria-hidden', 'true');
  sweep.style.setProperty('--sweep-color', toCss([...accent.slice(0, 3), .42]));
  document.body?.appendChild(sweep);
  const animation = sweep.animate([
    { opacity: 0, transform: 'translate3d(-12%, 0, 0) scale(1.04)' },
    { opacity: 1, offset: .32 },
    { opacity: 0, transform: 'translate3d(12%, 0, 0) scale(1.04)' }
  ], { duration: SPECTRUM_DURATION_MS, easing: 'cubic-bezier(.33, 0, .18, 1)', fill: 'none' });
  const remove = () => sweep.remove();
  animation.addEventListener?.('finish', remove);
  animation.addEventListener?.('cancel', remove);
  animation.finished?.then?.(remove, remove);
  void root;
}

/**
 * Das Monatsfarbsystem ist abschaltbar.
 *
 * `spectrum` ist der Trend-Atlas dieses Moduls, `classic` überlässt die
 * Einfärbung der festen Monatspalette aus `theme.js`, `neutral` verzichtet
 * ganz darauf. Der Color Director tritt in den beiden letzten Fällen zurück,
 * statt seine Variablen gegen die der anderen Quelle zu setzen.
 */
function spectrumEnabled() {
  const mode = document.documentElement.dataset.monthColors;
  return mode === undefined || mode === 'spectrum';
}

/** Das aktive Erscheinungsbild — es entscheidet über Tinte und Grundfläche. */
function activeScheme() {
  return document.documentElement.dataset.colorScheme === 'dark' ? 'dark' : 'light';
}

export function applySpectrumProfile(year, month, { animate = true, scheme = activeScheme() } = {}) {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  if (!spectrumEnabled()) {
    delete root.dataset.colorDirector;
    activeKey = null;
    return null;
  }
  const palette = colorProfileForDate(year, month);
  const target = spectrumVariables(palette, { scheme });
  // Ein Wechsel des Erscheinungsbilds ändert dieselben Variablen wie ein
  // Monatswechsel und muss deshalb genauso neu geschrieben werden.
  const changed = activeKey !== palette.key || activeSchemeKey !== scheme;
  activeSchemeKey = scheme;
  const first = activeKey === null;

  root.dataset.colorDirector = 'trend-atlas-v3';
  root.dataset.spectrumPalette = palette.name;
  root.dataset.spectrumMood = palette.mood;
  root.dataset.spectrumKey = palette.key;
  activeKey = palette.key;

  const label = document.getElementById('monthPaletteLabel');
  if (label) {
    const metadata = localizedMetadata(palette);
    const text = `Monatskontrast · ${palette.name}`;
    const title = `${metadata.season} · ${metadata.family} · ${palette.tone} · ${palette.mood} · ${palette.year}`;
    if (label.textContent !== text) label.textContent = text;
    if (label.title !== title) label.title = title;
  }

  if (animate && animatingKey === palette.key && animationHandle !== null) return palette;
  if (animationHandle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }

  if (!animate || !changed || first || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    animatingKey = null;
    writeVariables(root, target);
    root.dataset.spectrumMotion = 'settled';
    return palette;
  }

  const from = readCurrentVariables(root, target);
  const started = performance.now();
  animatingKey = palette.key;
  playSpectrumSweep(root, target['--month-accent']);
  root.dataset.spectrumMotion = 'running';

  const step = now => {
    const progress = Math.min(1, (now - started) / SPECTRUM_DURATION_MS);
    const eased = easeSpectrum(progress);
    const frame = {};
    for (const name of VARIABLE_NAMES) frame[name] = mixOklch(from[name], target[name], eased);
    writeVariables(root, frame);
    if (progress < 1) {
      animationHandle = requestAnimationFrame(step);
    } else {
      animationHandle = null;
      animatingKey = null;
      writeVariables(root, target);
      root.dataset.spectrumMotion = 'settled';
    }
  };
  animationHandle = requestAnimationFrame(step);
  return palette;
}

export function spectrumMotionIsRunning() {
  return animationHandle !== null;
}

function selectedDate() {
  const root = document.documentElement;
  const year = Number(document.getElementById('yearSelect')?.value) || Number(root.dataset.year) || new Date().getFullYear();
  const month = Number(document.getElementById('monthSelect')?.value) || Number(root.dataset.month) || new Date().getMonth() + 1;
  return { year, month };
}

function initializeColorDirector() {
  const update = () => {
    const { year, month } = selectedDate();
    applySpectrumProfile(year, month, { animate: true });
  };
  update();
  const root = document.documentElement;
  if (typeof MutationObserver === 'function') {
    const rootObserver = new MutationObserver(update);
    rootObserver.observe(root, { attributes: true, attributeFilter: ['data-month', 'data-year'] });
    const label = document.getElementById('monthPaletteLabel');
    if (label) {
      const labelObserver = new MutationObserver(() => {
        const { year, month } = selectedDate();
        const expected = colorProfileForDate(year, month);
        if (label.textContent !== `Monatskontrast · ${expected.name}`) applySpectrumProfile(year, month, { animate: true });
      });
      labelObserver.observe(label, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['title'] });
    }
  }
  document.getElementById('monthSelect')?.addEventListener('change', update);
  document.getElementById('yearSelect')?.addEventListener('change', update);
  // Eine Änderung des Farbsystems in den Einstellungen wirkt sofort, ohne dass
  // die Seite neu geladen werden muss.
  window.addEventListener('appsettingschange', update);
  // Hell/Dunkel wechselt die Grundfläche, auf die der Monatsakzent gerechnet
  // ist. Ohne diese Neuberechnung bliebe die helle Tinte im Dunkelmodus stehen.
  window.addEventListener('appcolorschemechange', () => {
    const { year, month } = selectedDate();
    applySpectrumProfile(year, month, { animate: false });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeColorDirector, { once: true });
  else initializeColorDirector();
}
