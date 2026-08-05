import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HUE_SECTOR_MEMORY_MONTHS,
  NAME_COOLDOWN_MONTHS,
  SPECTRUM_COLOR_ANCHORS,
  SPECTRUM_CYCLE_YEARS,
  SPECTRUM_MONTH_PROFILES,
  SPECTRUM_PALETTES,
  SPECTRUM_REFERENCE_YEAR,
  VISUAL_MEMORY_MONTHS,
  colorProfileForDate,
  describeColor,
  perceptualDistance,
  rgbToOklab,
  spectrumVariables,
  trendTone
} from '../js/color-director.js';

const channel = value => {
  const v = value / 255;
  return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b);
const contrast = (first, second) => {
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
};
const hueDegrees = color => {
  const [, a, b] = rgbToOklab(color);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
};
const hueSector = color => Math.floor(hueDegrees(color) / 30);
const angularDistance = (first, second) => {
  const delta = Math.abs(((first - second) % 360 + 360) % 360);
  return delta > 180 ? 360 - delta : delta;
};

test('Trend Atlas builds a deterministic 24-year calendar', () => {
  assert.equal(SPECTRUM_REFERENCE_YEAR, 2026);
  assert.equal(SPECTRUM_CYCLE_YEARS, 24);
  assert.equal(SPECTRUM_PALETTES.length, 288);
  assert.equal(new Set(SPECTRUM_PALETTES.map(palette => palette.key)).size, 288);
  assert.equal(new Set(SPECTRUM_PALETTES.map(palette => palette.accentHex)).size, 288);
  assert.equal(colorProfileForDate(2026, 1).accentHex, colorProfileForDate(2050, 1).accentHex);
});

test('every year spans at least nine hue sectors with strong luminance and chroma dynamics', () => {
  for (let year = 2026; year < 2050; year += 1) {
    const palettes = Array.from({ length: 12 }, (_, index) => colorProfileForDate(year, index + 1));
    const sectors = new Set(palettes.map(palette => hueSector(palette.accent)));
    const lightnesses = palettes.map(palette => palette.lightness);
    const chromas = palettes.map(palette => palette.chroma);
    assert.ok(sectors.size >= 9, `${year}: only ${sectors.size} distinct 30° hue sectors`);
    assert.ok(Math.max(...lightnesses) - Math.min(...lightnesses) >= .24, `${year}: insufficient lightness range`);
    assert.ok(Math.max(...chromas) - Math.min(...chromas) >= .08, `${year}: insufficient chroma range`);
  }
});

test('adjacent months remain clearly separated on distance, hue and lightness', () => {
  let minimumDistance = Infinity;
  let minimumHue = Infinity;
  let minimumLightness = Infinity;
  for (let index = 1; index < SPECTRUM_PALETTES.length; index += 1) {
    const previous = SPECTRUM_PALETTES[index - 1];
    const current = SPECTRUM_PALETTES[index];
    minimumDistance = Math.min(minimumDistance, perceptualDistance(previous.accent, current.accent));
    minimumHue = Math.min(minimumHue, angularDistance(hueDegrees(previous.accent), hueDegrees(current.accent)));
    minimumLightness = Math.min(minimumLightness, Math.abs(previous.lightness - current.lightness));
  }
  assert.ok(minimumDistance >= .13, `minimum adjacent distance only ${minimumDistance.toFixed(3)}`);
  assert.ok(minimumHue >= 42, `minimum adjacent hue separation only ${minimumHue.toFixed(1)}°`);
  assert.ok(minimumLightness >= .038, `minimum adjacent lightness separation only ${minimumLightness.toFixed(3)}`);
});

test('the rolling visual-memory window prevents near-duplicates beyond the immediate neighbour', () => {
  assert.equal(VISUAL_MEMORY_MONTHS, 6);
  assert.equal(HUE_SECTOR_MEMORY_MONTHS, 3);
  let minimum = Infinity;
  for (let index = 0; index < SPECTRUM_PALETTES.length; index += 1) {
    for (let previous = Math.max(0, index - VISUAL_MEMORY_MONTHS); previous < index; previous += 1) {
      minimum = Math.min(minimum, perceptualDistance(
        SPECTRUM_PALETTES[index].accent,
        SPECTRUM_PALETTES[previous].accent
      ));
    }
  }
  assert.ok(minimum >= .075, `a visually similar colour returns within six months (${minimum.toFixed(3)})`);
});

test('the same calendar month remains distinct in consecutive years', () => {
  let minimumAnnual = Infinity;
  for (let month = 1; month <= 12; month += 1) {
    for (let year = 2027; year < 2050; year += 1) {
      minimumAnnual = Math.min(minimumAnnual, perceptualDistance(
        colorProfileForDate(year - 1, month).accent,
        colorProfileForDate(year, month).accent
      ));
    }
  }
  assert.ok(minimumAnnual >= .089, `minimum annual distance only ${minimumAnnual.toFixed(3)}`);
});

test('the rhythm alternates between lighter and deeper months', () => {
  for (let year = 2026; year < 2050; year += 1) {
    const lightness = Array.from({ length: 12 }, (_, index) => colorProfileForDate(year, index + 1).lightness);
    const swings = lightness.slice(1).map((value, index) => value - lightness[index]);
    const directionChanges = swings.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(swings[index])).length;
    assert.ok(directionChanges >= 6, `${year}: only ${directionChanges} lightness direction changes`);
  }
});

test('monthly accents retain regular trend-colour strength without neon spill', () => {
  for (const palette of SPECTRUM_PALETTES) {
    assert.ok(palette.lightness >= .53 && palette.lightness <= .92,
      `${palette.key} ${palette.name}: outside working band (${palette.lightness.toFixed(3)})`);
    const ceiling = .195 - Math.max(0, palette.lightness - .78) * .80;
    assert.ok(palette.chroma <= ceiling + .013 && palette.chroma <= .21,
      `${palette.key} ${palette.name}: excessive chroma at this lightness (${palette.chroma.toFixed(3)})`);
  }
  assert.ok(SPECTRUM_PALETTES.filter(palette => palette.chroma >= .15).length >= 48);
  assert.ok(SPECTRUM_PALETTES.filter(palette => palette.lightness <= .62).length >= 48);
});

test('all derived table surfaces retain WCAG AA contrast', () => {
  for (const palette of SPECTRUM_PALETTES) {
    const variables = spectrumVariables(palette);
    const ink = variables['--month-ink'];
    for (const name of ['--weekday-field-bg', '--saturday-row-bg', '--sunday-row-bg', '--holiday-row-bg']) {
      const ratio = contrast(variables[name], ink);
      assert.ok(ratio >= 4.5, `${palette.key} ${palette.name} ${name}: ${ratio.toFixed(2)}:1`);
    }
    assert.equal(variables['--month-glow'].length, 4);
    assert.ok(variables['--month-glow'][3] < .5);
  }
});

test('every visible name belongs to the researched trend atlas and matches the rendered tone', () => {
  const trendNames = new Set(SPECTRUM_COLOR_ANCHORS.map(anchor => anchor.name));
  assert.ok(trendNames.size >= 60, `only ${trendNames.size} named trend colours`);
  const shown = new Set();
  for (const palette of SPECTRUM_PALETTES) {
    const profile = SPECTRUM_MONTH_PROFILES.find(entry => entry.month === palette.month);
    const anchor = SPECTRUM_COLOR_ANCHORS.find(entry => entry.name === palette.name);
    assert.ok(anchor, `${palette.key}: ${palette.name} is not in the trend atlas`);
    assert.equal(describeColor(profile, palette.lightness, palette.chroma, palette.hue), palette.name);
    assert.ok(angularDistance(hueDegrees(palette.accent), anchor.hue) <= 42);
    assert.ok(Math.abs(palette.lightness - anchor.lightness) <= .16);
    assert.ok(palette.source);
    assert.match(palette.sourceHex, /^#[0-9a-f]{6}$/);
    shown.add(palette.name);
  }
  assert.ok(shown.size >= 48, `only ${shown.size} trend names appear in the cycle`);
});

test('current reference colours are represented with their original English names', () => {
  const names = new Set(SPECTRUM_COLOR_ANCHORS.map(anchor => anchor.name));
  for (const name of [
    'Cloud Dancer', 'Mocha Mousse', 'Transformative Teal', 'Future Dusk',
    'Electric Fuchsia', 'Blue Aura', 'Hidden Gem', 'Universal Khaki',
    'Silhouette', 'Warm Eucalyptus'
  ]) assert.ok(names.has(name), `${name} missing from trend atlas`);
});

test('source anchors preserve hue and stay inside the UI working band', () => {
  for (const anchor of SPECTRUM_COLOR_ANCHORS) {
    assert.match(anchor.hex, /^#[0-9a-f]{6}$/);
    const original = trendTone([
      parseInt(anchor.hex.slice(1, 3), 16),
      parseInt(anchor.hex.slice(3, 5), 16),
      parseInt(anchor.hex.slice(5, 7), 16),
      1
    ]);
    assert.ok(Math.abs(anchor.lightness - original.lightness) < 1e-9);
    assert.ok(anchor.lightness >= .55 && anchor.lightness <= .89);
    assert.ok(anchor.chroma <= .215);
    assert.ok(anchor.source);
  }
});

test('colour names have an eighteen-month cooldown across year boundaries', () => {
  assert.equal(NAME_COOLDOWN_MONTHS, 18);
  let shortestGap = Infinity;
  const lastSeen = new Map();
  SPECTRUM_PALETTES.forEach((palette, index) => {
    if (lastSeen.has(palette.name)) shortestGap = Math.min(shortestGap, index - lastSeen.get(palette.name));
    lastSeen.set(palette.name, index);
  });
  assert.ok(shortestGap >= NAME_COOLDOWN_MONTHS,
    `a colour name returns after only ${shortestGap} months`);
  for (let year = 2026; year < 2050; year += 1) {
    const names = Array.from({ length: 12 }, (_, index) => colorProfileForDate(year, index + 1).name);
    assert.equal(new Set(names).size, 12, `${year}: duplicate colour name within one year`);
  }
});
