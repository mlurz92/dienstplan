/**
 * Monatsfarbsystem.
 *
 * Der Farbwechsel wird bewusst NICHT über CSS-Transitions registrierter
 * Custom Properties gefahren. Deren Start hängt davon ab, ob der Main-Thread
 * im richtigen Frame frei ist – und genau dann wird der Monat neu gerendert.
 * Das Ergebnis war nicht reproduzierbar: mal ein weicher Verlauf, mal ein
 * Sprung am Ende. Zusätzlich lösen abgeleitete, nicht registrierte Variablen
 * (color-mix über var(--month-accent)) nicht in jeder Engine zuverlässig neu
 * auf, während die Basisvariable animiert wird.
 *
 * Stattdessen interpoliert dieses Modul selbst: eine rAF-Schleife schreibt in
 * jedem Frame fertige, konkrete Farbwerte. Das ist in jeder Engine identisch,
 * unabhängig von @property, und die Zeitbasis ist performance.now() – blockiert
 * ein langer Renderframe die Schleife, springt sie auf den korrekten Fortschritt
 * und läuft weich weiter, statt stehenzubleiben.
 *
 * Interpoliert wird in OKLab. Lineare sRGB-Mischung führt bei Farbtonwechseln
 * (Koralle → Bernstein, Pflaume → Kupfer) über ausgegraute Zwischentöne; OKLab
 * hält Helligkeit und Buntheit über den gesamten Weg konstant.
 */

export const MONTH_PALETTES = [
  { name: 'Eisblau',            accent: '#4f8fbd', accentStrong: '#1f5f8f', glow: 'rgba(78, 151, 205, .34)', panelTint: 'rgba(211, 235, 250, .24)' },
  { name: 'Rubinrose',          accent: '#b46483', accentStrong: '#8d365d', glow: 'rgba(190, 91, 132, .30)', panelTint: 'rgba(249, 219, 232, .24)' },
  { name: 'Salbeigrün',         accent: '#5d9476', accentStrong: '#377057', glow: 'rgba(76, 151, 112, .30)', panelTint: 'rgba(218, 239, 226, .24)' },
  { name: 'Lavendel',           accent: '#8273bd', accentStrong: '#5b4a9c', glow: 'rgba(129, 105, 196, .31)', panelTint: 'rgba(232, 226, 250, .25)' },
  { name: 'Frühlingsgrün',      accent: '#4d9b62', accentStrong: '#2f743f', glow: 'rgba(73, 164, 95, .30)', panelTint: 'rgba(214, 242, 220, .24)' },
  { name: 'Türkis',             accent: '#3c9b9b', accentStrong: '#1f7476', glow: 'rgba(55, 171, 171, .30)', panelTint: 'rgba(207, 242, 241, .24)' },
  { name: 'Koralle',            accent: '#c66c5a', accentStrong: '#9b4437', glow: 'rgba(211, 99, 79, .31)', panelTint: 'rgba(252, 223, 215, .24)' },
  { name: 'Bernstein',          accent: '#bd812d', accentStrong: '#8c5b16', glow: 'rgba(213, 151, 49, .31)', panelTint: 'rgba(252, 236, 205, .24)' },
  { name: 'Pflaume',            accent: '#94618f', accentStrong: '#6f3d6b', glow: 'rgba(157, 87, 151, .30)', panelTint: 'rgba(239, 220, 238, .24)' },
  { name: 'Kupfer',             accent: '#aa6f45', accentStrong: '#7d4c2b', glow: 'rgba(182, 111, 60, .31)', panelTint: 'rgba(244, 225, 211, .24)' },
  { name: 'Schieferblau',       accent: '#657b9d', accentStrong: '#455b7c', glow: 'rgba(92, 118, 159, .31)', panelTint: 'rgba(222, 229, 240, .24)' },
  { name: 'Tannengrün & Rubin', accent: '#416f62', accentStrong: '#285247', glow: 'rgba(43, 115, 92, .30)', panelTint: 'rgba(214, 234, 226, .24)' }
];

/**
 * Anteil der Grundfarbe an der jeweiligen Flächenfarbe (Rest ist Weiß).
 *
 * Die Wochentagsspalte trägt die kräftige, dunkle Nuance und bildet als
 * durchgehender senkrechter Streifen den Anker der Tabelle. Die Wochenend- und
 * Feiertagszeilen liegen als helle, waagerechte Wäschen darüber und behalten
 * untereinander ihre Wertigkeit: Samstag < Sonntag < Feiertag.
 *
 * Die Werte sind nicht geschätzt, sondern über alle zwölf Paletten auf
 * Textkontrast geprüft: 46 % ergeben mit --month-ink im schlechtesten Fall
 * 5,63:1 und halten damit durchgängig WCAG AA.
 */
const SURFACE_MIX = {
  '--weekday-field-bg': 0.46,
  '--saturday-row-bg': 0.14,
  '--sunday-row-bg': 0.22,
  '--holiday-row-bg': 0.30
};

/** Zielhelligkeit (OKLab L) des Schrifttons auf farbigen Tabellenflächen. */
const INK_LIGHTNESS = 0.34;

/**
 * Die Farbwäsche läuft bewusst länger und ruhiger als die Inhaltsbewegung.
 *
 * Die sonst in der Oberfläche verwendete Kurve cubic-bezier(.22, 1, .36, 1)
 * legt rund 98 % des Weges im ersten Drittel zurück – gemessen war die
 * Zielfarbe nach 245 von 640 ms erreicht, der Rest der Dauer blieb wirkungslos.
 * Für eine großflächige Farbfläche liest sich das als Schnappen. Diese Kurve
 * verteilt die Bewegung über die volle Dauer: ruhiger Antritt, getragene Mitte,
 * weiches Auslaufen. Zusammen mit dem schnelleren Inhalts-Slide entstehen zwei
 * Geschwindigkeiten – der Plan ist sofort da, die Farbe zieht darunter nach.
 */
export const THEME_DURATION_MS = 720;
const EASE = [0.40, 0.00, 0.22, 1.00];

/* -------------------------------------------------------------------------
   Farbparsing und Farbraum
   ------------------------------------------------------------------------- */

/** Akzeptiert `#rgb`, `#rrggbb`, `rgb(...)` und `rgba(...)` → [r, g, b, a] mit 0–255 / 0–1. */
export function parseColor(value) {
  const input = String(value).trim();
  if (input.startsWith('#')) {
    const hex = input.slice(1);
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      1
    ];
  }
  const parts = input.replace(/^rgba?\(/i, '').replace(/\)$/, '').split(/[\s,/]+/).filter(Boolean);
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts[3] === undefined ? 1 : Number(parts[3])];
}

function toCss([r, g, b, a]) {
  const round = value => Math.max(0, Math.min(255, Math.round(value)));
  return a >= 1
    ? `rgb(${round(r)}, ${round(g)}, ${round(b)})`
    : `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000})`;
}

const toLinear = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fromLinear = v => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** sRGB → OKLab (Björn Ottosson). */
function rgbToOklab([r, g, b, a]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    a
  ];
}

/** OKLab → sRGB. */
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

/**
 * Interpoliert in OKLCH und dreht den Farbton über den kürzeren Bogen.
 *
 * Eine Gerade durch OKLab ist bei gegenüberliegenden Farbtönen (Koralle →
 * Tannengrün) trotz gleichbleibender Helligkeit problematisch: Sie führt nahe
 * an der Neutralachse vorbei, gemessen fiel die Buntheit in der Mitte von 59
 * auf 11 – die Fläche wurde für einen Moment grau. Über den Farbtonwinkel
 * gedreht bleibt die Buntheit über den gesamten Weg erhalten; die Farbe wandert
 * sichtbar von einem Ton zum anderen, statt durch Grau zu tauchen.
 */
function mixOklch(fromRgb, toRgb, t) {
  const [L1, C1, h1raw, a1] = labToLch(rgbToOklab(fromRgb));
  const [L2, C2, h2raw, a2] = labToLch(rgbToOklab(toRgb));
  // Ist eine Seite unbunt, hat ihr Winkel keine Aussage – dann den der anderen übernehmen.
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

/** Mischt eine Farbe mit Weiß; `amount` ist der Anteil der Farbe (0–1). Der Farbton bleibt dabei exakt erhalten. */
export function mixWithWhite(color, amount) {
  return mixOklch([255, 255, 255, 1], color, amount);
}

/** Interpoliert zwei sRGB-Farben farbtonerhaltend. */
export function mixColors(fromRgb, toRgb, t) {
  return mixOklch(fromRgb, toRgb, t);
}

/**
 * Tiefer Schriftton der Palette: Farbton und Buntheit bleiben erhalten, nur die
 * Helligkeit wird auf einen festen Zielwert gezogen. Dadurch trägt die Schrift
 * sichtbar die Monatsfarbe und hält trotzdem in jeder Palette denselben
 * Kontrast – anders als ein je Palette von Hand gewählter Ton.
 */
export function deepen(color, lightness = INK_LIGHTNESS) {
  const [, a, b, alpha] = rgbToOklab(color);
  return oklabToRgb([lightness, a * 0.95, b * 0.95, alpha]);
}

/* -------------------------------------------------------------------------
   Zeitverlauf
   ------------------------------------------------------------------------- */

/** Löst die CSS-Kurve cubic-bezier(EASE) numerisch nach y(x) auf. */
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

/* -------------------------------------------------------------------------
   Anwendung
   ------------------------------------------------------------------------- */

/** Vollständiger Variablensatz einer Palette – alle Werte als konkrete Farben. */
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

export function paletteForMonth(month) {
  const index = ((Math.trunc(Number(month)) - 1) % 12 + 12) % 12;
  return MONTH_PALETTES[Number.isFinite(index) ? index : 0] || MONTH_PALETTES[0];
}

function writeVariables(root, values) {
  for (const [name, color] of Object.entries(values)) root.style.setProperty(name, toCss(color));
}

/** Liest die aktuell gesetzten Werte, damit ein laufender Wechsel weich weiterläuft. */
function readVariables(root, fallback) {
  const computed = getComputedStyle(root);
  const current = {};
  for (const name of Object.keys(fallback)) {
    const raw = computed.getPropertyValue(name).trim();
    current[name] = raw ? parseColor(raw) : fallback[name];
  }
  return current;
}

let animationHandle = null;
let activeMonth = null;

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Setzt die Palette des Monats und blendet weich dorthin über.
 *
 * @param {number} month              1–12
 * @param {object} [options]
 * @param {boolean} [options.animate] false setzt die Farben ohne Übergang
 * @returns {{palette: object, changed: boolean}}
 */
export function applyMonthTheme(month, { animate = true } = {}) {
  const palette = paletteForMonth(month);
  const monthNumber = MONTH_PALETTES.indexOf(palette) + 1;
  const root = document.documentElement;
  const target = paletteVariables(palette);
  const changed = activeMonth !== monthNumber;

  // Läuft bereits ein Übergang auf genau dieses Ziel, bleibt er unangetastet.
  // Ohne diese Sperre killt der Sicherheitsnetz-Aufruf aus render() den gerade
  // gestarteten Verlauf und die Farbe springt mitten in der Bewegung ans Ziel –
  // exakt das Verhalten, das nach außen wie "gar keine Animation" aussah.
  if (!changed && animationHandle !== null && animate) return { palette, changed: false };

  if (animationHandle !== null) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }

  const finish = () => {
    writeVariables(root, target);
    root.dataset.month = String(monthNumber);
    root.dataset.palette = palette.name;
    activeMonth = monthNumber;
    const label = document.getElementById('monthPaletteLabel');
    if (label) label.textContent = `Monatskontrast · ${palette.name}`;
  };

  if (!animate || !changed || activeMonth === null || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    finish();
    return { palette, changed };
  }

  // Ausgangspunkt ist der tatsächlich sichtbare Zustand – auch mitten in einem
  // noch laufenden Übergang. Schnelles Blättern kettet dadurch weich, statt zu springen.
  const from = readVariables(root, paletteVariables(paletteForMonth(activeMonth)));
  const started = performance.now();

  // Beschriftung und Datensätze sofort, damit die Oberfläche nie hinterherhinkt.
  root.dataset.month = String(monthNumber);
  root.dataset.palette = palette.name;
  activeMonth = monthNumber;
  const label = document.getElementById('monthPaletteLabel');
  if (label) label.textContent = `Monatskontrast · ${palette.name}`;

  const step = now => {
    // Zeitbasiert statt frameweise: ein blockierter Frame verschluckt den
    // Übergang nicht, er läuft am korrekten Fortschritt weiter.
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
