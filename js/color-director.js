/**
 * Seasonal Spectrum Director
 *
 * Erweitert das bestehende saisonale Grundsystem um eine wahrnehmungsbasierte
 * Auswahl. Nicht ein kleiner Trend-Offset, sondern ein vollständiges Spektrum
 * aus Farbton, Helligkeit, Buntheit und Temperatur bestimmt jeden Monat.
 *
 * Für jeden der 288 kanonischen Monate werden mehrere Kandidaten innerhalb
 * eines saisonal kuratierten Farbkorridors erzeugt. Gewählt wird der Kandidat
 * mit dem größten OKLab-Abstand zum vorherigen Kalendermonat und zum gleichen
 * Monat des Vorjahres. So bleibt die Jahreszeit erkennbar, ohne dass die
 * Oberfläche in einer Folge ähnlich gedämpfter Mitteltöne stecken bleibt.
 */

export const SPECTRUM_REFERENCE_YEAR = 2026;
export const SPECTRUM_CYCLE_YEARS = 24;
export const SPECTRUM_DURATION_MS = 620;

const MONTH_PROFILES = Object.freeze([
  { month: 1, season: 'Winter', family: 'Eis · Polarlicht', hue: 225, hueSpan: 72, lightness: .655, lightnessSpan: .12, chroma: .145, chromaSpan: .10, names: ['Gletscherblau', 'Polarviolett', 'Fjordtürkis', 'Eiscyan', 'Nordlicht', 'Stahlblau', 'Frostindigo', 'Arktisgrün'] },
  { month: 2, season: 'Spätwinter', family: 'Beere · Lack', hue: 352, hueSpan: 62, lightness: .635, lightnessSpan: .13, chroma: .165, chromaSpan: .11, names: ['Himbeerlack', 'Cassis', 'Rubin', 'Rosenquarz', 'Magentawein', 'Granatapfel', 'Orchidee', 'Kirschrot'] },
  { month: 3, season: 'Vorfrühling', family: 'Keimgrün · Botanik', hue: 137, hueSpan: 78, lightness: .65, lightnessSpan: .12, chroma: .155, chromaSpan: .12, names: ['Keimgrün', 'Eukalyptus', 'Jade', 'Junge Olive', 'Klee', 'Celadon', 'Mooslicht', 'Frühlingspetrol'] },
  { month: 4, season: 'Frühling', family: 'Blüte · Himmel', hue: 293, hueSpan: 82, lightness: .67, lightnessSpan: .13, chroma: .15, chromaSpan: .12, names: ['Iris', 'Wisteria', 'Fliederblitz', 'Veilchenblau', 'Blütenrosa', 'Krokus', 'Hyazinthe', 'Frühlingshimmel'] },
  { month: 5, season: 'Frühling', family: 'Blattgrün · Zitrus', hue: 108, hueSpan: 82, lightness: .665, lightnessSpan: .13, chroma: .17, chromaSpan: .14, names: ['Maigrün', 'Minzblatt', 'Chartreuse', 'Lindenblatt', 'Apfelgrün', 'Salbei', 'Bambus', 'Zitrusblatt'] },
  { month: 6, season: 'Frühsommer', family: 'Wasser · Küste', hue: 195, hueSpan: 76, lightness: .65, lightnessSpan: .12, chroma: .16, chromaSpan: .12, names: ['Lagune', 'Aqua', 'Meeresglas', 'Küstenblau', 'Türkisstrom', 'Mineralwasser', 'Poolblau', 'Seegrün'] },
  { month: 7, season: 'Hochsommer', family: 'Frucht · Sonnenuntergang', hue: 24, hueSpan: 64, lightness: .65, lightnessSpan: .13, chroma: .18, chromaSpan: .12, names: ['Koralle', 'Persimone', 'Wassermelone', 'Papaya', 'Hibiskus', 'Sonnenuntergang', 'Tomatenrot', 'Pfirsichglut'] },
  { month: 8, season: 'Spätsommer', family: 'Gold · Ernte', hue: 69, hueSpan: 72, lightness: .69, lightnessSpan: .12, chroma: .17, chromaSpan: .13, names: ['Safran', 'Bernstein', 'Ringelblume', 'Aprikosengold', 'Erntegelb', 'Honig', 'Sonnenblume', 'Goldolive'] },
  { month: 9, season: 'Frühherbst', family: 'Wein · Pflaume', hue: 326, hueSpan: 70, lightness: .61, lightnessSpan: .14, chroma: .145, chromaSpan: .12, names: ['Weinlese', 'Pflaume', 'Feige', 'Aubergine', 'Brombeere', 'Dahlie', 'Traubenrot', 'Cassisnebel'] },
  { month: 10, season: 'Herbst', family: 'Kupfer · Erde', hue: 43, hueSpan: 66, lightness: .62, lightnessSpan: .14, chroma: .155, chromaSpan: .12, names: ['Kupfer', 'Terrakotta', 'Zimt', 'Bronze', 'Rostrot', 'Kürbis', 'Ocker', 'Ahorn'] },
  { month: 11, season: 'Spätherbst', family: 'Mineral · Sturm', hue: 226, hueSpan: 92, lightness: .595, lightnessSpan: .15, chroma: .105, chromaSpan: .11, names: ['Sturmblau', 'Schiefer', 'Petrolgrau', 'Indigonebel', 'Graphitblau', 'Nebelgrün', 'Basaltviolett', 'Regentief'] },
  { month: 12, season: 'Winter', family: 'Immergrün · Festlicht', hue: 164, hueSpan: 76, lightness: .59, lightnessSpan: .13, chroma: .13, chromaSpan: .11, names: ['Tannengrün', 'Smaragdnacht', 'Wacholder', 'Winterwald', 'Pfauengrün', 'Mistel', 'Nordmanntanne', 'Festpetrol'] }
]);

const YEAR_MOODS = Object.freeze([
  ['Kristall', -10, .030, -.010], ['Juwel', 8, -.030, .035], ['Botanisch', -14, .005, .020],
  ['Lack', 13, -.012, .045], ['Mineral', -5, -.035, -.025], ['Solar', 16, .025, .030],
  ['Nordisch', -18, .020, -.010], ['Velours', 6, -.055, .015], ['Elektrisch', 22, .000, .050],
  ['Organisch', -9, .010, -.020], ['Chromatisch', 18, .020, .015], ['Erbe', 3, -.025, -.005],
  ['Aurora', -22, .015, .035], ['Couture', 10, -.015, .005], ['Signal', 25, .005, .055],
  ['Porzellan', -6, .045, -.030], ['Dämmerung', 14, -.060, .020], ['Frisch', -17, .035, .025],
  ['Metallisch', 7, -.035, -.020], ['Blüte', 20, .020, .040], ['Wald', -12, -.020, .015],
  ['Prisma', 28, .000, .045], ['Leinen', -3, .040, -.040], ['Atelier', 12, -.015, .025]
].map(([name, hue, lightness, chroma]) => Object.freeze({ name, hue, lightness, chroma })));

const SURFACE_MIX = Object.freeze({
  '--weekday-field-bg': .49,
  '--saturday-row-bg': .16,
  '--sunday-row-bg': .25,
  '--holiday-row-bg': .34
});

const VARIABLE_NAMES = Object.freeze([
  '--month-accent', '--month-accent-strong', '--month-ink', '--month-glow', '--month-panel-tint',
  ...Object.keys(SURFACE_MIX)
]);

const MIN_NEIGHBOUR_DISTANCE = .075;
const MIN_ANNUAL_DISTANCE = .055;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const radians = degrees => degrees * Math.PI / 180;
const radicalInverse = (value, base) => {
  let n = value;
  let fraction = 1 / base;
  let result = 0;
  while (n > 0) {
    result += (n % base) * fraction;
    n = Math.floor(n / base);
    fraction /= base;
  }
  return result;
};

const toLinear = value => {
  const v = value / 255;
  return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
};
const fromLinear = value => 255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055);

export function rgbToOklab([r, g, b, alpha = 1]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(.4122214708 * lr + .5363325363 * lg + .0514459929 * lb);
  const m = Math.cbrt(.2119034982 * lr + .6806995451 * lg + .1073969566 * lb);
  const s = Math.cbrt(.0883024619 * lr + .2817188376 * lg + .6299787005 * lb);
  return [
    .2104542553 * l + .7936177850 * m - .0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .8086757660 * s,
    alpha
  ];
}

function oklabToRgbRaw([L, A, B, alpha = 1]) {
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3;
  const m = (L - .1055613458 * A - .0638541728 * B) ** 3;
  const s = (L - .0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s),
    fromLinear(-.0041960863 * l - .7034186147 * m + 1.7076147010 * s),
    alpha
  ];
}

const labToLch = ([L, a, b, alpha = 1]) => [L, Math.hypot(a, b), Math.atan2(b, a), alpha];
const lchToLab = ([L, C, h, alpha = 1]) => [L, C * Math.cos(h), C * Math.sin(h), alpha];
const inGamut = color => color.slice(0, 3).every(value => Number.isFinite(value) && value >= 0 && value <= 255);

export function oklchToRgb(L, C, h, alpha = 1) {
  let chroma = C;
  let rgb = oklabToRgbRaw(lchToLab([L, chroma, h, alpha]));
  for (let attempt = 0; attempt < 18 && !inGamut(rgb); attempt += 1) {
    chroma *= .91;
    rgb = oklabToRgbRaw(lchToLab([L, chroma, h, alpha]));
  }
  return rgb.map((value, index) => index < 3 ? clamp(value, 0, 255) : clamp(value, 0, 1));
}

function mixOklch(fromRgb, toRgb, amount) {
  const [L1, C1, h1Raw, a1] = labToLch(rgbToOklab(fromRgb));
  const [L2, C2, h2Raw, a2] = labToLch(rgbToOklab(toRgb));
  const h1 = C1 < 1e-5 ? h2Raw : h1Raw;
  const h2 = C2 < 1e-5 ? h1Raw : h2Raw;
  let delta = h2 - h1;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return oklchToRgb(
    L1 + (L2 - L1) * amount,
    C1 + (C2 - C1) * amount,
    h1 + delta * amount,
    a1 + (a2 - a1) * amount
  );
}

function mixWithWhite(color, amount) {
  return mixOklch([255, 255, 255, 1], color, amount);
}

export function perceptualDistance(first, second) {
  const a = rgbToOklab(first);
  const b = rgbToOklab(second);
  return Math.hypot((a[0] - b[0]) * 1.15, a[1] - b[1], a[2] - b[2]);
}

function hueSector(color) {
  const [, a, b] = rgbToOklab(color);
  const degrees = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
  return Math.floor(degrees / 30);
}

function candidateFor(profile, cycleIndex, phase) {
  const mood = YEAR_MOODS[cycleIndex];
  const sequence = cycleIndex * 17 + profile.month * 11 + phase * 7 + 1;
  const hueNoise = (radicalInverse(sequence, 2) - .5) * profile.hueSpan;
  const lightnessNoise = (radicalInverse(sequence, 3) - .5) * profile.lightnessSpan;
  const chromaNoise = (radicalInverse(sequence, 5) - .5) * profile.chromaSpan;
  const lanes = [-.52, .52, -.36, .36, -.20, .20, -.08, .08];
  const lane = lanes[phase % lanes.length];
  const hue = radians(profile.hue + hueNoise + mood.hue + lane * profile.hueSpan);
  const lightness = clamp(profile.lightness + lightnessNoise + mood.lightness + lane * .03, .525, .765);
  const chroma = clamp(profile.chroma + chromaNoise + mood.chroma + Math.abs(lane) * .022, .075, .25);
  const accent = oklchToRgb(lightness, chroma, hue);
  return { accent, mood: mood.name, hue, lightness, chroma, phase, sector: hueSector(accent) };
}

function selectCandidate(profile, cycleIndex, previous, sameMonthPreviousYear, usedSectors) {
  const ranked = Array.from({ length: 24 }, (_, phase) => candidateFor(profile, cycleIndex, phase))
    .map(candidate => {
      const previousDistance = previous ? perceptualDistance(candidate.accent, previous.accent) : .4;
      const annualDistance = sameMonthPreviousYear ? perceptualDistance(candidate.accent, sameMonthPreviousYear.accent) : .4;
      const sectorBonus = usedSectors.has(candidate.sector) ? 0 : .075;
      const score = Math.min(previousDistance * 1.1, annualDistance) + Math.max(previousDistance, annualDistance) * .18 + candidate.chroma * .08 + sectorBonus;
      return { candidate, score, previousDistance, annualDistance };
    })
    .sort((left, right) => right.score - left.score);

  const neighbourSafe = ranked.filter(entry => entry.previousDistance >= MIN_NEIGHBOUR_DISTANCE);
  const neighbourPool = neighbourSafe.length ? neighbourSafe : ranked;
  const fullySafe = neighbourPool.filter(entry => entry.annualDistance >= MIN_ANNUAL_DISTANCE);
  return (fullySafe.length ? fullySafe : neighbourPool)[0];
}

function toHex(color) {
  return `#${color.slice(0, 3).map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function buildCanonicalPalettes() {
  const result = [];
  const sameMonth = new Map();
  let previous = null;
  for (let cycleIndex = 0; cycleIndex < SPECTRUM_CYCLE_YEARS; cycleIndex += 1) {
    const usedSectors = new Set();
    for (const profile of MONTH_PROFILES) {
      const selected = selectCandidate(profile, cycleIndex, previous, sameMonth.get(profile.month), usedSectors);
      const year = SPECTRUM_REFERENCE_YEAR + cycleIndex;
      const name = profile.names[positiveMod(cycleIndex * 5 + profile.month * 3, profile.names.length)];
      const palette = Object.freeze({
        key: `${year}-${String(profile.month).padStart(2, '0')}`,
        year,
        month: profile.month,
        season: profile.season,
        family: profile.family,
        name,
        mood: selected.candidate.mood,
        accent: selected.candidate.accent,
        accentHex: toHex(selected.candidate.accent),
        lightness: selected.candidate.lightness,
        chroma: selected.candidate.chroma,
        hue: selected.candidate.hue,
        previousDistance: selected.previousDistance,
        annualDistance: selected.annualDistance
      });
      result.push(palette);
      previous = palette;
      sameMonth.set(profile.month, palette);
      usedSectors.add(selected.candidate.sector);
    }
  }
  return Object.freeze(result);
}

export const SPECTRUM_PALETTES = buildCanonicalPalettes();

export function colorProfileForDate(year, month) {
  const safeMonth = positiveMod(Number(month) - 1, 12) + 1;
  const safeYear = Number.isInteger(Number(year)) ? Number(year) : SPECTRUM_REFERENCE_YEAR;
  const cycleIndex = positiveMod(safeYear - SPECTRUM_REFERENCE_YEAR, SPECTRUM_CYCLE_YEARS);
  const canonical = SPECTRUM_PALETTES[cycleIndex * 12 + safeMonth - 1];
  return Object.freeze({ ...canonical, key: `${safeYear}-${String(safeMonth).padStart(2, '0')}`, year: safeYear });
}

export function spectrumVariables(palette) {
  const accent = palette.accent;
  const [L, C, h] = labToLch(rgbToOklab(accent));
  const strong = oklchToRgb(clamp(L - .16, .40, .52), C * .94, h);
  const ink = oklchToRgb(.285, clamp(C * .72, .055, .14), h);
  const values = {
    '--month-accent': accent,
    '--month-accent-strong': strong,
    '--month-ink': ink,
    '--month-glow': [...oklchToRgb(clamp(L + .04, .60, .78), C * 1.04, h).slice(0, 3), .38],
    '--month-panel-tint': [...mixWithWhite(accent, .22).slice(0, 3), .28]
  };
  for (const [name, amount] of Object.entries(SURFACE_MIX)) values[name] = mixWithWhite(accent, amount);
  return values;
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

function writeVariables(root, values) {
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, toCss(value), 'important');
}

let animationHandle = null;
let activeKey = null;

export function applySpectrumProfile(year, month, { animate = true } = {}) {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  const palette = colorProfileForDate(year, month);
  const target = spectrumVariables(palette);
  const changed = activeKey !== palette.key;

  if (animationHandle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }

  root.dataset.colorDirector = 'seasonal-spectrum-v1';
  root.dataset.spectrumPalette = palette.name;
  root.dataset.spectrumMood = palette.mood;
  root.dataset.spectrumKey = palette.key;
  activeKey = palette.key;

  const label = document.getElementById('monthPaletteLabel');
  if (label) {
    label.textContent = `Monatskontrast · ${palette.name}`;
    label.title = `${palette.season} · ${palette.family} · ${palette.year} · ${palette.mood}`;
  }

  if (!animate || !changed || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    writeVariables(root, target);
    return palette;
  }

  const from = readCurrentVariables(root, target);
  const started = performance.now();
  const ease = t => 1 - (1 - t) ** 3;
  const step = now => {
    const progress = Math.min(1, (now - started) / SPECTRUM_DURATION_MS);
    const frame = {};
    for (const name of VARIABLE_NAMES) frame[name] = mixOklch(from[name], target[name], ease(progress));
    writeVariables(root, frame);
    if (progress < 1) animationHandle = requestAnimationFrame(step);
    else {
      animationHandle = null;
      writeVariables(root, target);
    }
  };
  animationHandle = requestAnimationFrame(step);
  return palette;
}

function selectedDate() {
  const root = document.documentElement;
  const year = Number(document.getElementById('yearSelect')?.value) || Number(root.dataset.year) || new Date().getFullYear();
  const month = Number(document.getElementById('monthSelect')?.value) || Number(root.dataset.month) || new Date().getMonth() + 1;
  return { year, month };
}

function initializeColorDirector() {
  const update = ({ animate = true } = {}) => {
    const { year, month } = selectedDate();
    applySpectrumProfile(year, month, { animate });
  };

  update({ animate: false });
  const root = document.documentElement;
  if (typeof MutationObserver === 'function') {
    const rootObserver = new MutationObserver(() => update());
    rootObserver.observe(root, { attributes: true, attributeFilter: ['data-month', 'data-year'] });

    const label = document.getElementById('monthPaletteLabel');
    if (label) {
      const labelObserver = new MutationObserver(() => {
        const { year, month } = selectedDate();
        const expected = colorProfileForDate(year, month);
        if (label.textContent !== `Monatskontrast · ${expected.name}`) applySpectrumProfile(year, month, { animate: false });
      });
      labelObserver.observe(label, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['title'] });
    }
  }

  document.getElementById('monthSelect')?.addEventListener('change', () => update());
  document.getElementById('yearSelect')?.addEventListener('change', () => update());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeColorDirector, { once: true });
  else initializeColorDirector();
}
