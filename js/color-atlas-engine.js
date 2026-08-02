/**
 * Perceptual palette construction for Trend Atlas.
 */
import {
  SPECTRUM_REFERENCE_YEAR, SPECTRUM_CYCLE_YEARS, TREND_COLORS,
  SUPPLEMENTAL_TREND_ANCHORS, YEAR_MOODS, SURFACE_MIX,
  MIN_NEIGHBOUR_DISTANCE, MIN_NEIGHBOUR_HUE, MIN_NEIGHBOUR_LIGHTNESS,
  MIN_ANNUAL_DISTANCE, MIN_RECENT_DISTANCE, NAME_COOLDOWN_MONTHS,
  VISUAL_MEMORY_MONTHS, HUE_SECTOR_MEMORY_MONTHS
} from './color-atlas-data.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const radians = degrees => degrees * Math.PI / 180;
const degrees = radiansValue => positiveMod(radiansValue * 180 / Math.PI, 360);
const angularDistance = (first, second) => {
  const delta = Math.abs(positiveMod(first - second, 360));
  return delta > 180 ? 360 - delta : delta;
};
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

function parseHexColor(value) {
  const hex = String(value).replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
}
const labToLch = ([L, a, b, alpha = 1]) => [L, Math.hypot(a, b), Math.atan2(b, a), alpha];
const lchToLab = ([L, C, h, alpha = 1]) => [L, C * Math.cos(h), C * Math.sin(h), alpha];

function inSrgbGamut(color) {
  return color.slice(0, 3).every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255);
}
function oklchToRgb(lightness, chroma, hue, alpha = 1) {
  let fittedChroma = chroma;
  let rgb = oklabToRgbRaw(lchToLab([lightness, fittedChroma, hue, alpha]));
  for (let i = 0; i < 28 && !inSrgbGamut(rgb); i += 1) {
    fittedChroma *= .92;
    rgb = oklabToRgbRaw(lchToLab([lightness, fittedChroma, hue, alpha]));
  }
  return rgb.map((value, index) => index < 3 ? clamp(value, 0, 255) : clamp(value, 0, 1));
}

const TREND_LIGHTNESS = Object.freeze({ min: .555, max: .885 });
const SOURCE_LIGHTNESS = Object.freeze({ min: .30, max: .95 });
const TREND_CHROMA_MAX = .215;

export function trendTone(color) {
  const [lightness, chroma, hue] = labToLch(rgbToOklab(color));
  const position = (clamp(lightness, SOURCE_LIGHTNESS.min, SOURCE_LIGHTNESS.max) - SOURCE_LIGHTNESS.min)
    / (SOURCE_LIGHTNESS.max - SOURCE_LIGHTNESS.min);
  const target = TREND_LIGHTNESS.min + position * (TREND_LIGHTNESS.max - TREND_LIGHTNESS.min);
  return {
    lightness: clamp(Math.max(target, lightness * .82 + target * .18), TREND_LIGHTNESS.min, TREND_LIGHTNESS.max),
    chroma: clamp(chroma * 1.06, .045, TREND_CHROMA_MAX),
    hue
  };
}

const circularMean = angles => {
  const x = angles.reduce((sum, angle) => sum + Math.cos(radians(angle)), 0);
  const y = angles.reduce((sum, angle) => sum + Math.sin(radians(angle)), 0);
  return degrees(Math.atan2(y, x));
};

function corridorFromColors(colors) {
  const tones = colors.map(([, hex]) => trendTone(parseHexColor(hex)));
  const hues = tones.map(tone => degrees(tone.hue));
  const center = circularMean(hues);
  const spread = Math.max(...hues.map(hue => angularDistance(hue, center)));
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const lightnessValues = tones.map(tone => tone.lightness);
  const chromaValues = tones.map(tone => tone.chroma);
  const strongerHalf = [...chromaValues].sort((left, right) => right - left).slice(0, Math.ceil(chromaValues.length / 2));
  return {
    hue: center,
    hueSpan: clamp(spread * 1.45, 38, 68),
    lightness: average(lightnessValues),
    lightnessSpan: clamp((Math.max(...lightnessValues) - Math.min(...lightnessValues)) * 1.2, .13, .28),
    chroma: average(strongerHalf),
    chromaSpan: clamp((Math.max(...chromaValues) - Math.min(...chromaValues)) * 1.05, .075, .17)
  };
}

export const SPECTRUM_MONTH_PROFILES = Object.freeze(TREND_COLORS.map(profile =>
  Object.freeze({ ...profile, ...corridorFromColors(profile.colors) })));
const MONTH_PROFILES = SPECTRUM_MONTH_PROFILES;

export function mixOklch(fromRgb, toRgb, amount) {
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
const mixWithWhite = (color, amount) => mixOklch([255, 255, 255, 1], color, amount);

export function perceptualDistance(first, second) {
  const a = rgbToOklab(first);
  const b = rgbToOklab(second);
  return Math.hypot((a[0] - b[0]) * 1.15, a[1] - b[1], a[2] - b[2]);
}
const hueSector = color => {
  const [, a, b] = rgbToOklab(color);
  return Math.floor(degrees(Math.atan2(b, a)) / 30);
};

const anchorMap = new Map();
for (const profile of MONTH_PROFILES) {
  for (const [name, hex, source] of profile.colors) {
    if (!anchorMap.has(name)) {
      const tone = trendTone(parseHexColor(hex));
      anchorMap.set(name, Object.freeze({
        name, hex, source, months: [profile.month],
        hue: degrees(tone.hue), lightness: tone.lightness, chroma: tone.chroma
      }));
    } else {
      const anchor = anchorMap.get(name);
      if (!anchor.months.includes(profile.month)) {
        anchorMap.set(name, Object.freeze({ ...anchor, months: [...anchor.months, profile.month] }));
      }
    }
  }
}
for (const [name, hex, source, months] of SUPPLEMENTAL_TREND_ANCHORS) {
  if (anchorMap.has(name)) continue;
  const tone = trendTone(parseHexColor(hex));
  anchorMap.set(name, Object.freeze({
    name, hex, source, months,
    hue: degrees(tone.hue), lightness: tone.lightness, chroma: tone.chroma
  }));
}
export const SPECTRUM_COLOR_ANCHORS = Object.freeze([...anchorMap.values()]);

const FOREIGN_ANCHOR_PENALTY = 1.15;
function anchorScore(anchor, lightness, chroma, hueDegrees) {
  return (angularDistance(hueDegrees, anchor.hue) / 25) ** 2
    + ((lightness - anchor.lightness) / .085) ** 2
    + ((chroma - anchor.chroma) / .06) ** 2;
}
export function describeColor(profile, lightness, chroma, hueRadians) {
  const hueDegrees = degrees(hueRadians);
  let best = null;
  for (const anchor of SPECTRUM_COLOR_ANCHORS) {
    const penalty = anchor.months.includes(profile.month) ? 0 : FOREIGN_ANCHOR_PENALTY;
    const score = anchorScore(anchor, lightness, chroma, hueDegrees) + penalty;
    if (!best || score < best.score) best = { name: anchor.name, score };
  }
  return best.name;
}

const LIGHTNESS_WORDS = Object.freeze(['deep', 'saturated', 'mid-light', 'light', 'luminous']);
const CHROMA_WORDS = Object.freeze(['soft', 'muted', 'balanced', 'strong', 'vivid']);
function toneWords(lightness, chroma) {
  const lightnessIndex = clamp(Math.floor((lightness - .53) / .06), 0, LIGHTNESS_WORDS.length - 1);
  const chromaIndex = clamp(Math.floor((chroma - .06) / .038), 0, CHROMA_WORDS.length - 1);
  return `${LIGHTNESS_WORDS[lightnessIndex]} · ${CHROMA_WORDS[chromaIndex]}`;
}

const HUE_LANES = Object.freeze([-.5, -.36, -.22, -.08, .08, .22, .36, .5]);
const TONE_LANES = Object.freeze([
  [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0],
  [.5, .5], [-.5, .5], [.5, -.5], [-.5, -.5]
]);
export const SPECTRUM_CANDIDATES_PER_MONTH = HUE_LANES.length * TONE_LANES.length;

function candidateFor(profile, cycleIndex, phase) {
  const mood = YEAR_MOODS[cycleIndex];
  const sequence = cycleIndex * 17 + profile.month * 11 + phase * 7 + 1;
  const hueNoise = (radicalInverse(sequence, 2) - .5) * profile.hueSpan * .5;
  const lightnessNoise = (radicalInverse(sequence, 3) - .5) * profile.lightnessSpan * .45;
  const chromaNoise = (radicalInverse(sequence, 5) - .5) * profile.chromaSpan * .45;
  const hueLane = HUE_LANES[phase % HUE_LANES.length];
  const [lightnessLane, chromaLane] = TONE_LANES[Math.floor(phase / HUE_LANES.length) % TONE_LANES.length];

  const hueDegrees = profile.hue + clamp(
    hueNoise + mood.hue + hueLane * profile.hueSpan,
    -profile.hueSpan / 2,
    profile.hueSpan / 2
  );
  const hue = radians(hueDegrees);
  const lightness = clamp(
    clamp(profile.lightness + lightnessNoise + mood.lightness + lightnessLane * .09,
      profile.lightness - .14, profile.lightness + .14),
    .545, .905
  );
  const chromaCeiling = .195 - Math.max(0, lightness - .78) * .80;
  const chroma = clamp(
    clamp(profile.chroma + chromaNoise + mood.chroma * .6 + chromaLane * .052,
      profile.chroma - .06, profile.chroma + .07),
    .048, chromaCeiling
  );
  const accent = encodeCycleSignature(oklchToRgb(lightness, chroma, hue), cycleIndex, profile.month);
  const [actualLightness, actualChroma, actualHue] = labToLch(rgbToOklab(accent));
  return {
    accent,
    mood: mood.name,
    hue: actualHue,
    lightness: actualLightness,
    chroma: actualChroma,
    phase,
    sector: hueSector(accent),
    name: describeColor(profile, actualLightness, actualChroma, actualHue)
  };
}

function toHex(color) {
  return `#${color.slice(0, 3).map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}
function encodeCycleSignature(color, cycleIndex, month) {
  const encoded = [...color];
  const signature = cycleIndex * 12 + month - 1;
  encoded[0] = Math.floor(clamp(encoded[0], 0, 255) / 8) * 8 + (signature % 8);
  encoded[1] = Math.floor(clamp(encoded[1], 0, 255) / 4) * 4 + (Math.floor(signature / 8) % 4);
  encoded[2] = Math.floor(clamp(encoded[2], 0, 255) / 2) * 2 + (Math.floor(signature / 32) % 2);
  return encoded;
}

function candidateMetrics(candidate, previous, sameMonthPreviousYear, recent) {
  const previousHue = previous ? degrees(previous.hue) : null;
  const previousDistance = previous ? perceptualDistance(candidate.accent, previous.accent) : .4;
  const annualDistance = sameMonthPreviousYear ? perceptualDistance(candidate.accent, sameMonthPreviousYear.accent) : .4;
  const hueSeparation = previousHue === null ? 90 : angularDistance(degrees(candidate.hue), previousHue);
  const lightnessDelta = previous ? Math.abs(candidate.lightness - previous.lightness) : .12;
  const chromaDelta = previous ? Math.abs(candidate.chroma - previous.chroma) : .08;
  const recentDistance = recent.length
    ? Math.min(...recent.map(palette => perceptualDistance(candidate.accent, palette.accent)))
    : .4;
  const recentHueSectors = recent.slice(-HUE_SECTOR_MEMORY_MONTHS).map(palette => hueSector(palette.accent));
  const sectorCollision = recentHueSectors.includes(candidate.sector);
  return {
    previousDistance, annualDistance, hueSeparation, lightnessDelta, chromaDelta,
    recentDistance, sectorCollision
  };
}

function selectCandidate(profile, cycleIndex, previous, sameMonthPreviousYear, usedSectors, usedHexes, brightPhase, recentPalettes, recentNames) {
  const ranked = Array.from({ length: SPECTRUM_CANDIDATES_PER_MONTH }, (_, phase) => candidateFor(profile, cycleIndex, phase))
    .map(candidate => {
      const metrics = candidateMetrics(candidate, previous, sameMonthPreviousYear, recentPalettes);
      const sectorBonus = usedSectors.has(candidate.sector) ? 0 : .07;
      const rhythmBonus = (candidate.lightness > profile.lightness) === brightPhase ? .07 : 0;
      const memoryBonus = Math.min(metrics.recentDistance, .18) / .18 * .16;
      const score = Math.min(metrics.previousDistance * 1.15, metrics.annualDistance)
        + Math.max(metrics.previousDistance, metrics.annualDistance) * .2
        + Math.min(metrics.hueSeparation, 90) / 90 * .12
        + Math.min(metrics.lightnessDelta, .13) / .13 * .10
        + Math.min(metrics.chromaDelta, .09) / .09 * .05
        + candidate.chroma * .06
        + memoryBonus + rhythmBonus + sectorBonus
        - (metrics.sectorCollision ? .10 : 0);
      return { candidate, score, ...metrics };
    })
    .sort((left, right) => right.score - left.score);

  const unique = ranked.filter(entry => !usedHexes.has(toHex(entry.candidate.accent)));
  const freshlyNamed = unique.filter(entry => !recentNames.has(entry.candidate.name));
  const pool = freshlyNamed.length ? freshlyNamed : (unique.length ? unique : ranked);
  const neighbourSafe = entry => entry.previousDistance >= MIN_NEIGHBOUR_DISTANCE
    && entry.hueSeparation >= MIN_NEIGHBOUR_HUE
    && entry.lightnessDelta >= MIN_NEIGHBOUR_LIGHTNESS;
  const memorySafe = entry => entry.recentDistance >= MIN_RECENT_DISTANCE && !entry.sectorCollision;

  const fullySafe = pool.filter(entry => neighbourSafe(entry)
    && entry.annualDistance >= MIN_ANNUAL_DISTANCE && memorySafe(entry));
  if (fullySafe.length) return fullySafe[0];

  const noSectorRepeat = pool.filter(entry => neighbourSafe(entry)
    && entry.annualDistance >= MIN_ANNUAL_DISTANCE && entry.recentDistance >= MIN_RECENT_DISTANCE);
  if (noSectorRepeat.length) return noSectorRepeat[0];

  const neighbourAndAnnual = pool.filter(entry => neighbourSafe(entry) && entry.annualDistance >= MIN_ANNUAL_DISTANCE);
  if (neighbourAndAnnual.length) return neighbourAndAnnual.reduce((best, entry) =>
    entry.recentDistance > best.recentDistance ? entry : best);

  const neighbourOnly = pool.filter(neighbourSafe);
  if (neighbourOnly.length) return neighbourOnly.reduce((best, entry) =>
    Math.min(entry.annualDistance, entry.recentDistance) > Math.min(best.annualDistance, best.recentDistance) ? entry : best);

  return pool.reduce((best, entry) => {
    const rank = candidate => Math.min(
      candidate.previousDistance / MIN_NEIGHBOUR_DISTANCE,
      candidate.hueSeparation / MIN_NEIGHBOUR_HUE,
      candidate.lightnessDelta / MIN_NEIGHBOUR_LIGHTNESS,
      candidate.annualDistance / MIN_ANNUAL_DISTANCE,
      candidate.recentDistance / MIN_RECENT_DISTANCE
    );
    return rank(entry) > rank(best) ? entry : best;
  });
}

function buildCanonicalPalettes() {
  const result = [];
  const sameMonth = new Map();
  const usedHexes = new Set();
  let previous = null;
  const recentNames = [];
  const recentPalettes = [];

  for (let cycleIndex = 0; cycleIndex < SPECTRUM_CYCLE_YEARS; cycleIndex += 1) {
    const usedSectors = new Set();
    for (const profile of MONTH_PROFILES) {
      const brightPhase = (profile.month + cycleIndex) % 2 === 0;
      const selected = selectCandidate(
        profile, cycleIndex, previous, sameMonth.get(profile.month), usedSectors, usedHexes,
        brightPhase, recentPalettes, new Set(recentNames)
      );
      const year = SPECTRUM_REFERENCE_YEAR + cycleIndex;
      const candidate = selected.candidate;
      const accent = candidate.accent;
      const [lightness, chroma, hue] = labToLch(rgbToOklab(accent));
      const name = candidate.name;
      const anchor = SPECTRUM_COLOR_ANCHORS.find(item => item.name === name);
      const palette = Object.freeze({
        key: `${year}-${String(profile.month).padStart(2, '0')}`,
        year,
        month: profile.month,
        season: profile.season,
        family: profile.family,
        name,
        source: anchor?.source || 'Curated trend palette',
        sourceHex: anchor?.hex || null,
        tone: toneWords(lightness, chroma),
        mood: candidate.mood,
        accent,
        accentHex: toHex(accent),
        lightness,
        chroma,
        hue,
        previousDistance: selected.previousDistance,
        annualDistance: selected.annualDistance,
        recentDistance: selected.recentDistance
      });
      result.push(palette);
      previous = palette;
      sameMonth.set(profile.month, palette);
      usedSectors.add(hueSector(accent));
      usedHexes.add(palette.accentHex);

      recentNames.push(name);
      if (recentNames.length > NAME_COOLDOWN_MONTHS) recentNames.shift();
      recentPalettes.push(palette);
      if (recentPalettes.length > VISUAL_MEMORY_MONTHS) recentPalettes.shift();
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
