import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECTRUM_CYCLE_YEARS,
  SPECTRUM_PALETTES,
  SPECTRUM_REFERENCE_YEAR,
  colorProfileForDate,
  perceptualDistance,
  rgbToOklab,
  spectrumVariables
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
const hueSector = color => {
  const [, a, b] = rgbToOklab(color);
  const degrees = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
  return Math.floor(degrees / 30);
};

test('Seasonal Spectrum Director builds a deterministic 24-year calendar', () => {
  assert.equal(SPECTRUM_REFERENCE_YEAR, 2026);
  assert.equal(SPECTRUM_CYCLE_YEARS, 24);
  assert.equal(SPECTRUM_PALETTES.length, 288);
  assert.equal(new Set(SPECTRUM_PALETTES.map(palette => palette.key)).size, 288);
  assert.equal(new Set(SPECTRUM_PALETTES.map(palette => palette.accentHex)).size, 288);
  assert.equal(colorProfileForDate(2026, 1).accentHex, colorProfileForDate(2050, 1).accentHex);
});

test('every year uses a visibly broad spectrum instead of twelve muted neighbours', () => {
  for (let year = 2026; year < 2050; year += 1) {
    const palettes = Array.from({ length: 12 }, (_, index) => colorProfileForDate(year, index + 1));
    const sectors = new Set(palettes.map(palette => hueSector(palette.accent)));
    const lightnesses = palettes.map(palette => rgbToOklab(palette.accent)[0]);
    const chromas = palettes.map(palette => {
      const [, a, b] = rgbToOklab(palette.accent);
      return Math.hypot(a, b);
    });
    assert.ok(sectors.size >= 8, `${year}: nur ${sectors.size} verschiedene 30°-Farbsektoren`);
    assert.ok(Math.max(...lightnesses) - Math.min(...lightnesses) >= .075, `${year}: zu geringe Helligkeitsdynamik`);
    assert.ok(Math.max(...chromas) - Math.min(...chromas) >= .055, `${year}: zu geringe Chromadynamik`);
  }
});

test('calendar neighbours and annual repeats remain perceptually separated', () => {
  let minimumNeighbour = Infinity;
  let minimumAnnual = Infinity;
  for (let index = 1; index < SPECTRUM_PALETTES.length; index += 1) {
    minimumNeighbour = Math.min(minimumNeighbour, perceptualDistance(SPECTRUM_PALETTES[index - 1].accent, SPECTRUM_PALETTES[index].accent));
  }
  for (let month = 1; month <= 12; month += 1) {
    const accents = [];
    for (let year = 2026; year < 2050; year += 1) accents.push(colorProfileForDate(year, month).accent);
    for (let index = 1; index < accents.length; index += 1) {
      minimumAnnual = Math.min(minimumAnnual, perceptualDistance(accents[index - 1], accents[index]));
    }
  }
  assert.ok(minimumNeighbour >= .075, `minimaler Abstand benachbarter Monate nur ${minimumNeighbour.toFixed(3)}`);
  assert.ok(minimumAnnual >= .055, `minimaler Abstand desselben Monats in Folgejahren nur ${minimumAnnual.toFixed(3)}`);
});

test('the same calendar month explores many distinct looks across the cycle', () => {
  for (let month = 1; month <= 12; month += 1) {
    const palettes = Array.from({ length: 24 }, (_, offset) => colorProfileForDate(2026 + offset, month));
    assert.ok(new Set(palettes.map(palette => palette.accentHex)).size >= 22, `Monat ${month}: zu viele Wiederholungen`);
    assert.ok(new Set(palettes.map(palette => palette.name)).size >= 7, `Monat ${month}: zu wenig sichtbare Farbnamen`);
  }
});

test('all derived table surfaces keep WCAG AA contrast', () => {
  for (const palette of SPECTRUM_PALETTES) {
    const variables = spectrumVariables(palette);
    const ink = variables['--month-ink'];
    for (const name of ['--weekday-field-bg', '--saturday-row-bg', '--sunday-row-bg', '--holiday-row-bg']) {
      const ratio = contrast(variables[name], ink);
      assert.ok(ratio >= 4.5, `${palette.key} ${palette.name} ${name}: ${ratio.toFixed(2)}:1`);
    }
    assert.equal(variables['--month-glow'].length, 4);
    assert.ok(variables['--month-glow'][3] < .5, `${palette.key}: Glow muss transparent bleiben`);
  }
});
