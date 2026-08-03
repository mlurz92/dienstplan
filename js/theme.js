/**
 * Saisonales Langzeit-Monatsfarbsystem.
 *
 * Die Auswahl ist deterministisch aus Jahr und Monat abgeleitet. Vier
 * handkuratierte, jahreszeitlich passende Grundtöne je Kalendermonat werden mit
 * 24 behutsamen Trend-Editionen kombiniert. Damit entstehen 288 eindeutige
 * Monatspaletten und ein 24-jähriger Zyklus statt einer jährlichen Wiederholung.
 *
 * Der Farbwechsel wird bewusst nicht über CSS-Transitions registrierter Custom
 * Properties gefahren. Eine zeitbasierte rAF-Schleife schreibt in jedem Frame
 * konkrete Werte und interpoliert in OKLCH, damit die Fläche beim Wechsel nicht
 * über ausgegraute Zwischentöne läuft.
 */

export const PALETTE_REFERENCE_YEAR = 2026;
export const PALETTE_CYCLE_YEARS = 24;

const MONTH_BASES = [
  {
    month: 1, season: 'Winter', family: 'Frost',
    variants: [
      ['Eisnebel', '#4f8fbd'], ['Polarlicht', '#3f94a8'], ['Winterflieder', '#777fbd'], ['Arktischer Stahl', '#607f9f']
    ]
  },
  {
    month: 2, season: 'Spätwinter', family: 'Beere',
    variants: [
      ['Rubinrose', '#b46483'], ['Winterbeere', '#a85b72'], ['Orchideenrauch', '#9a668f'], ['Granatapfel', '#b15f69']
    ]
  },
  {
    month: 3, season: 'Vorfrühling', family: 'Botanik',
    variants: [
      ['Salbeigrün', '#5d9476'], ['Eukalyptus', '#579083'], ['Junge Olive', '#7d935a'], ['Celadon', '#60998c']
    ]
  },
  {
    month: 4, season: 'Frühling', family: 'Blüte',
    variants: [
      ['Lavendel', '#8273bd'], ['Wisteria', '#8d6fb0'], ['Irisblau', '#697fc0'], ['Fliederregen', '#936fa5']
    ]
  },
  {
    month: 5, season: 'Frühling', family: 'Grün',
    variants: [
      ['Frühlingsgrün', '#4d9b62'], ['Minzblatt', '#4f9d78'], ['Chartreuse-Salbei', '#789847'], ['Maigrün', '#5b9b50']
    ]
  },
  {
    month: 6, season: 'Frühsommer', family: 'Wasser',
    variants: [
      ['Türkis', '#3c9b9b'], ['Lagune', '#3594a5'], ['Aqua Mineral', '#4796ad'], ['Meeresglas', '#4b9c8e']
    ]
  },
  {
    month: 7, season: 'Hochsommer', family: 'Sonnenfrucht',
    variants: [
      ['Koralle', '#c66c5a'], ['Persimone', '#c8734c'], ['Wassermelone', '#c7646c'], ['Sonnenuntergang', '#bf725f']
    ]
  },
  {
    month: 8, season: 'Spätsommer', family: 'Gold',
    variants: [
      ['Bernstein', '#bd812d'], ['Safran', '#b98932'], ['Aprikosengold', '#c57f43'], ['Ringelblume', '#b58b2c']
    ]
  },
  {
    month: 9, season: 'Frühherbst', family: 'Pflaume',
    variants: [
      ['Pflaume', '#94618f'], ['Feige', '#8f637f'], ['Aubergine', '#80617f'], ['Weinlese', '#9c5d72']
    ]
  },
  {
    month: 10, season: 'Herbst', family: 'Erde',
    variants: [
      ['Kupfer', '#aa6f45'], ['Terrakotta', '#b16a4f'], ['Zimt', '#9f754f'], ['Bronze', '#9a7a45']
    ]
  },
  {
    month: 11, season: 'Spätherbst', family: 'Mineral',
    variants: [
      ['Schieferblau', '#657b9d'], ['Sturmblau', '#5c7890'], ['Petrolgrau', '#557d82'], ['Indigonebel', '#68739a']
    ]
  },
  {
    month: 12, season: 'Winter', family: 'Immergrün',
    variants: [
      ['Tannengrün', '#416f62'], ['Wacholder', '#4b7469'], ['Smaragdnacht', '#3f7569'], ['Winterwald', '#50705d']
    ]
  }
];

/**
 * Kleine, kontrollierte OKLCH-Modifikatoren. Sie greifen aktuelle Richtungen
 * wie luftige Neutrals, kühle Blautöne, Jade, dunkle Pflaume, expressive
 * Gelbgrüns und Persimone auf, ohne die saisonale Grundfamilie zu verlassen.
 */
const TREND_EDITIONS = [
  ['Cloud Veil',       -2,  0.030, 0.88],
  ['Cool Current',    -10,  0.010, 1.02],
  ['Botanical Jade',   -4,  0.000, 1.08],
  ['Plum Noir',         7, -0.025, 1.07],
  ['Wasabi Spark',     12,  0.005, 1.13],
  ['Persimmon Pop',    -8,  0.010, 1.11],
  ['Quiet Luxury',      1, -0.005, 0.80],
  ['Neo Mineral',       5, -0.010, 0.91],
  ['Digital Bloom',    15,  0.000, 1.05],
  ['Soft Chrome',      -6,  0.020, 0.82],
  ['Organic Modern',  -12, -0.005, 0.89],
  ['Future Heritage',   4, -0.020, 0.97],
  ['Airy Contrast',     8,  0.025, 0.93],
  ['Glacial Pulse',   -15,  0.005, 1.04],
  ['Verdant Signal',   -7, -0.005, 1.10],
  ['Velvet Depth',     10, -0.030, 1.03],
  ['Acid Botanical',   16,  0.000, 1.10],
  ['Solar Fruit',     -11,  0.012, 1.08],
  ['Calm Couture',      2,  0.012, 0.84],
  ['Stone Future',      7, -0.012, 0.88],
  ['Chromatic Mist',   18,  0.018, 0.98],
  ['Liquid Metal',     -9,  0.008, 0.86],
  ['Earth Digital',   -15, -0.010, 0.94],
  ['Modern Heirloom',   6, -0.024, 1.00]
].map(([name, hueDegrees, lightness, chroma]) => ({ name, hueDegrees, lightness, chroma }));

const SURFACE_MIX = {
  '--weekday-field-bg': 0.46,
  '--saturday-row-bg': 0.14,
  '--sunday-row-bg': 0.22,
  '--holiday-row-bg': 0.30
};

const INK_LIGHTNESS = 0.34;
export const THEME_DURATION_MS = 720;
const EASE = [0.40, 0.00, 0.22, 1.00];

const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function parseColor(value) {
  const input = String(value ?? '').trim();
  if (!input) return null;

  if (input.startsWith('#')) {
    const hex = input.slice(1);
    if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null;
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), 1];
  }

  const srgb = input.match(/^color\(\s*srgb\s+([^)]+)\)$/i);
  if (srgb) {
    const parts = srgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts[3] === undefined || Number.isNaN(parts[3]) ? 1 : parts[3]];
  }

  const rgb = input.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  return [parts[0], parts[1], parts[2], parts[3] === undefined || Number.isNaN(parts[3]) ? 1 : parts[3]];
}

function toCss(color) {
  if (!Array.isArray(color) || color.slice(0, 3).some(value => !Number.isFinite(value))) return null;
  const [r, g, b, a] = color;
  const round = value => Math.max(0, Math.min(255, Math.round(value)));
  return a >= 1
    ? `rgb(${round(r)}, ${round(g)}, ${round(b)})`
    : `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;
}

function toHex(color) {
  return `#${color.slice(0, 3).map(value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fromLinear = v => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b, a]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827716620 * m - 0.8086757660 * s,
    a
  ];
}

function oklabToRgb([L, A, B, a]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    fromLinear(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    a
  ];
}

const labToLch = ([L, a, b, alpha]) => [L, Math.hypot(a, b), Math.atan2(b, a), alpha];
const lchToLab = ([L, C, h, alpha]) => [L, C * Math.cos(h), C * Math.sin(h), alpha];

function mixOklch(fromRgb, toRgb, t) {
  const [L1, C1, h1raw, a1] = labToLch(rgbToOklab(fromRgb));
  const [L2, C2, h2raw, a2] = labToLch(rgbToOklab(toRgb));
  const EPS = 1e-4;
  const h1 = C1 < EPS ? h2raw : h1raw;
  const h2 = C2 < EPS ? h1raw : h2raw;
  let delta = h2 - h1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return oklabToRgb(lchToLab([
    L1 + (L2 - L1) * t,
    C1 + (C2 - C1) * t,
    h1 + delta * t,
    a1 + (a2 - a1) * t
  ]));
}

export function mixWithWhite(color, amount) {
  return mixOklch([255, 255, 255, 1], color, amount);
}

export function mixColors(fromRgb, toRgb, t) {
  return mixOklch(fromRgb, toRgb, t);
}

export function deepen(color, lightness = INK_LIGHTNESS) {
  const [, a, b, alpha] = rgbToOklab(color);
  return oklabToRgb([lightness, a * 0.95, b * 0.95, alpha]);
}

function transformAccent(baseAccent, edition, cycleIndex) {
  const [L, C, h, alpha] = labToLch(rgbToOklab(parseColor(baseAccent)));
  const transformed = oklabToRgb(lchToLab([
    clamp(L + edition.lightness, 0.55, 0.72),
    clamp(C * edition.chroma, 0.055, 0.19),
    h + (edition.hueDegrees + cycleIndex * 0.43) * Math.PI / 180,
    alpha
  ]));
  return transformed.map((value, index) => index < 3 ? clamp(value, 0, 255) : value);
}

function encodeCycleSignature(color, cycleIndex) {
  const encoded = [...color];
  encoded[0] = Math.floor(clamp(encoded[0], 0, 255) / 8) * 8 + (cycleIndex % 8);
  encoded[1] = Math.floor(clamp(encoded[1], 0, 255) / 4) * 4 + Math.floor(cycleIndex / 8);
  encoded[2] = clamp(encoded[2], 0, 255);
  return encoded;
}

function buildPalette(year, month) {
  const monthIndex = positiveMod(Math.trunc(Number(month)) - 1, 12);
  const safeYear = Number.isFinite(Number(year)) ? Math.trunc(Number(year)) : PALETTE_REFERENCE_YEAR;
  const cycleIndex = positiveMod(safeYear - PALETTE_REFERENCE_YEAR, PALETTE_CYCLE_YEARS);
  const base = MONTH_BASES[monthIndex];
  const edition = TREND_EDITIONS[cycleIndex];
  const variantIndex = positiveMod(cycleIndex * 5 + monthIndex * 3, base.variants.length);
  const [variantName, baseAccent] = base.variants[variantIndex];
  const accentRgb = encodeCycleSignature(transformAccent(baseAccent, edition, cycleIndex), cycleIndex);
  const strongRgb = deepen(accentRgb, 0.37);
  const glowRgb = [...accentRgb.slice(0, 3), 0.32];
  const panelRgb = [...mixWithWhite(accentRgb, 0.18).slice(0, 3), 0.24];
  return Object.freeze({
    key: `${safeYear}-${String(monthIndex + 1).padStart(2, '0')}`,
    year: safeYear,
    month: monthIndex + 1,
    season: base.season,
    family: base.family,
    edition: edition.name,
    name: `${variantName} · ${edition.name}`,
    accent: toHex(accentRgb),
    accentStrong: toHex(strongRgb),
    glow: toCss(glowRgb),
    panelTint: toCss(panelRgb)
  });
}

export const MONTH_PALETTES = Object.freeze(
  Array.from({ length: PALETTE_CYCLE_YEARS }, (_, yearOffset) =>
    Array.from({ length: 12 }, (_, monthIndex) => buildPalette(PALETTE_REFERENCE_YEAR + yearOffset, monthIndex + 1))
  ).flat()
);

export function paletteForMonth(month, year = PALETTE_REFERENCE_YEAR) {
  return buildPalette(year, month);
}

export function paletteForDate(year, month) {
  return buildPalette(year, month);
}

export function paletteVariables(palette) {
  const accent = parseColor(palette.accent);
  const values = {
    '--month-accent': accent,
    '--month-accent-strong': parseColor(palette.accentStrong),
    '--month-ink': deepen(accent),
    '--month-glow': parseColor(palette.glow),
    '--month-panel-tint': parseColor(palette.panelTint)
  };
  for (const [name, amount] of Object.entries(SURFACE_MIX)) values[name] = mixWithWhite(accent, amount);
  return values;
}

export function easeOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = EASE;
  const bezier = (p1, p2, u) => {
    const v = 1 - u;
    return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
  };
  let low = 0, high = 1, guess = t;
  for (let i = 0; i < 24; i += 1) {
    const x = bezier(x1, x2, guess);
    if (Math.abs(x - t) < 1e-5) break;
    if (x < t) low = guess; else high = guess;
    guess = (low + high) / 2;
  }
  return bezier(y1, y2, guess);
}

/**
 * Sobald der Seasonal Spectrum Director geladen ist, gehört ihm die sichtbare
 * Farbe. Das Basistheme bleibt die Rückfallebene für Umgebungen ohne diese
 * Schicht und schreibt dann unverändert weiter.
 *
 * Der Director schreibt mit `important`. `setProperty` ohne Priorität würde
 * diese Kennzeichnung entfernen und den Wert ersetzen – der Ausdruck, jedes
 * erneute `render()` und jede Statusaktualisierung hätten den kräftigen
 * Monatskontrast dadurch gegen den gedämpften Basiston getauscht.
 */
export function colorDirectorOwnsSurface() {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  /**
   * `neutral` verzichtet vollständig auf die monatliche Einfärbung.
   *
   * Behandelt wird das wie eine fremde Zuständigkeit für die Farbfläche: Diese
   * Schicht schreibt dann keine Variablen, und die Grundwerte des Stylesheets
   * bleiben stehen. Das ist genau die Wirkung, die gewünscht ist – und sie
   * kommt ohne einen zweiten Weg durch dieselbe Funktion aus.
   */
  if (root?.dataset?.monthColors === 'neutral') return true;
  return Boolean(root?.dataset?.colorDirector);
}

function writeVariables(root, values) {
  if (colorDirectorOwnsSurface()) return;
  for (const [name, color] of Object.entries(values)) {
    const css = toCss(color);
    if (css) root.style.setProperty(name, css);
  }
}

function readVariables(root, fallback) {
  const computed = getComputedStyle(root);
  const current = {};
  for (const name of Object.keys(fallback)) {
    const value = parseColor(computed.getPropertyValue(name));
    current[name] = value || fallback[name];
  }
  return current;
}

let animationHandle = null;
let activeThemeKey = null;

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function resolveThemeYear(explicitYear) {
  const numeric = Number(explicitYear);
  if (Number.isInteger(numeric)) return numeric;
  if (typeof document !== 'undefined') {
    const selected = Number(document.getElementById('yearSelect')?.value);
    if (Number.isInteger(selected)) return selected;
    const dataYear = Number(document.documentElement?.dataset?.year);
    if (Number.isInteger(dataYear)) return dataYear;
  }
  return new Date().getFullYear();
}

/**
 * Setzt die Palette des Monats und blendet weich dorthin über.
 *
 * Bestehende Aufrufe `applyMonthTheme(month, { animate })` bleiben kompatibel;
 * das Jahr wird aus dem Jahresselektor gelesen. Für Tests oder unabhängige
 * Nutzung kann `options.year` explizit gesetzt werden.
 */
export function applyMonthTheme(month, { animate = true, year } = {}) {
  const themeYear = resolveThemeYear(year);
  const palette = paletteForMonth(month, themeYear);
  const root = document.documentElement;
  const target = paletteVariables(palette);
  const changed = activeThemeKey !== palette.key;

  if (!changed && animationHandle !== null && animate) return { palette, changed: false };

  if (animationHandle !== null) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }

  const updateMetadata = () => {
    root.dataset.month = String(palette.month);
    root.dataset.year = String(themeYear);
    root.dataset.palette = palette.name;
    root.dataset.paletteEdition = palette.edition;
    activeThemeKey = palette.key;
    // Sobald der Seasonal Spectrum Director aktiv ist, gehört das Badge ihm.
    // Das Basistheme würde sonst kurzzeitig einen Namen anzeigen, der nicht zur
    // sichtbaren Farbe gehört.
    const label = root.dataset.colorDirector ? null : document.getElementById('monthPaletteLabel');
    if (label) {
      label.textContent = `Monatskontrast · ${palette.name}`;
      label.title = `${palette.season} · ${palette.family} · Edition ${palette.edition} · ${themeYear}`;
    }
  };

  const finish = () => {
    writeVariables(root, target);
    updateMetadata();
  };

  // Ohne eigene Farbhoheit gibt es auch keinen Grund für eine eigene
  // rAF-Interpolation: Sie liefe unsichtbar gegen den Verlauf des Directors.
  if (!animate || !changed || activeThemeKey === null || colorDirectorOwnsSurface()
    || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    finish();
    return { palette, changed };
  }

  const previousYear = Number(root.dataset.year) || themeYear;
  const previousMonth = Number(root.dataset.month) || palette.month;
  const from = readVariables(root, paletteVariables(paletteForMonth(previousMonth, previousYear)));
  const started = performance.now();
  updateMetadata();

  const step = now => {
    const linear = Math.min(1, (now - started) / THEME_DURATION_MS);
    const eased = easeOut(linear);
    const frame = {};
    for (const name of Object.keys(target)) frame[name] = mixColors(from[name], target[name], eased);
    writeVariables(root, frame);
    if (linear < 1) {
      animationHandle = requestAnimationFrame(step);
    } else {
      animationHandle = null;
      writeVariables(root, target);
    }
  };

  animationHandle = requestAnimationFrame(step);
  return { palette, changed };
}

/**
 * Sofortige Wirkung des gewählten Monatsfarbsystems.
 *
 * Ohne diesen Weg wirkte eine Umstellung erst beim nächsten Monatswechsel:
 * `neutral` ließ die zuletzt geschriebenen Inline-Variablen stehen, und
 * `classic` wartete auf den nächsten Aufruf von `applyMonthTheme`. Beides
 * widerspricht dem, was das Einstellungsmodal zusagt.
 *
 * Bei `neutral` werden die Inline-Variablen entfernt, statt neue zu schreiben —
 * damit greifen wieder die Grundwerte des Stylesheets. Bei `classic` wird die
 * feste Monatspalette unmittelbar und ohne Übergang gesetzt; ein Übergang wäre
 * hier irreführend, weil er einen Monatswechsel andeutet, der nicht stattfand.
 */
export function refreshMonthColorMode() {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  const mode = root.dataset.monthColors || 'spectrum';
  const month = Number(root.dataset.month) || new Date().getMonth() + 1;

  if (mode === 'neutral') {
    activeThemeKey = null;
    for (const name of Object.keys(paletteVariables(paletteForMonth(month, resolveThemeYear())))) {
      root.style.removeProperty(name);
    }
    return null;
  }

  if (mode === 'classic') {
    // Der Director hat seine Zuständigkeit bereits abgegeben; der
    // Zwischenspeicher muss zurückgesetzt werden, damit der nächste Aufruf die
    // Palette tatsächlich schreibt statt sie als unverändert zu überspringen.
    activeThemeKey = null;
    return applyMonthTheme(month, { animate: false });
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('appsettingschange', () => refreshMonthColorMode());
}
