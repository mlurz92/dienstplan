import test from 'node:test';
import assert from 'node:assert/strict';

import { MONTH_PALETTES, deepen, easeOut, mixColors, mixWithWhite, paletteForMonth, parseColor } from '../js/theme.js';

test('every month maps to its own palette, out-of-range values wrap safely', () => {
  assert.equal(MONTH_PALETTES.length, 12);
  assert.equal(new Set(MONTH_PALETTES.map(item => item.accent)).size, 12);
  assert.equal(paletteForMonth(1).name, 'Eisblau');
  assert.equal(paletteForMonth(12).name, 'Tannengrün & Rubin');
  assert.equal(paletteForMonth(13).name, 'Eisblau');
  assert.equal(paletteForMonth(0).name, 'Tannengrün & Rubin');
  assert.equal(paletteForMonth(-1).name, 'Schieferblau');
});

test('parseColor reads hex, short hex and rgba', () => {
  assert.deepEqual(parseColor('#4f8fbd'), [79, 143, 189, 1]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('rgba(78, 151, 205, .34)'), [78, 151, 205, 0.34]);
});

test('mixWithWhite keeps the row hierarchy saturday < sunday < holiday and the weekday strip darkest', () => {
  const accent = parseColor('#4f8fbd');
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const [saturday, sunday, holiday, weekday] = [0.14, 0.22, 0.3, 0.46].map(amount => luminance(mixWithWhite(accent, amount)));
  assert.ok(sunday < saturday, 'Sonntag muss kräftiger sein als Samstag');
  assert.ok(holiday < sunday, 'Feiertag muss kräftiger sein als Sonntag');
  assert.ok(weekday < holiday, 'die Wochentagsspalte trägt die dunkelste Nuance');
  assert.ok(luminance(mixWithWhite(accent, 0)) > 254, '0 % ergibt Weiß');
});

test('the table ink keeps WCAG AA on every surface of all twelve palettes', () => {
  const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const relative = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => {
    const [x, y] = [relative(a), relative(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  for (const palette of MONTH_PALETTES) {
    const accent = parseColor(palette.accent);
    const ink = deepen(accent);
    for (const amount of [0.14, 0.22, 0.3, 0.46]) {
      const ratio = contrast(mixWithWhite(accent, amount), ink);
      assert.ok(ratio >= 4.5, `${palette.name} bei ${Math.round(amount * 100)} %: nur ${ratio.toFixed(2)}:1`);
    }
  }
});

test('deepen keeps the palette hue and lands on a constant lightness', () => {
  const hue = ([r, g, b]) => Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
  for (const palette of MONTH_PALETTES) {
    const accent = parseColor(palette.accent);
    const ink = deepen(accent);
    // Winkeldifferenz über den kürzeren Bogen, sonst meldet der Nulldurchgang
    // fälschlich eine Drift von rund 2π.
    const raw = Math.abs(hue(accent) - hue(ink)) % (2 * Math.PI);
    const drift = Math.min(raw, 2 * Math.PI - raw);
    assert.ok(drift < 0.25, `${palette.name}: Farbton driftet um ${drift.toFixed(3)}`);
    assert.ok(relativeLuminanceIsDark(ink), `${palette.name}: Schriftton zu hell`);
  }
  function relativeLuminanceIsDark([r, g, b]) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 110; }
});

test('mixColors interpolates without a washed-out midpoint and hits both ends exactly', () => {
  const from = parseColor('#c66c5a');
  const to = parseColor('#416f62');
  assert.deepEqual(mixColors(from, to, 0).slice(0, 3).map(Math.round), from.slice(0, 3));
  assert.deepEqual(mixColors(from, to, 1).slice(0, 3).map(Math.round), to.slice(0, 3));
  // Gegenüberliegende Farbtöne: über den Farbtonbogen gedreht bleibt die
  // Buntheit auf dem gesamten Weg erhalten, statt in der Mitte auszugrauen.
  const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
  const floor = Math.min(chroma(from), chroma(to));
  for (let t = 0.1; t < 1; t += 0.1) {
    const value = chroma(mixColors(from, to, t));
    assert.ok(value > floor * 0.55, `bei t=${t.toFixed(1)} nur Buntheit ${value.toFixed(1)} von mindestens ${floor}`);
  }
});

test('mixColors carries alpha, so the glow stays translucent throughout', () => {
  const [, , , alpha] = mixColors(parseColor('rgba(211, 99, 79, .31)'), parseColor('rgba(43, 115, 92, .30)'), 0.5);
  assert.ok(alpha > 0.3 && alpha < 0.31);
});

test('easeOut is clamped, monotonic and spreads motion across the whole duration', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(easeOut(-1), 0);
  assert.equal(easeOut(5), 1);
  let previous = 0;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const value = easeOut(t);
    assert.ok(value >= previous, 'darf nicht zurücklaufen');
    previous = value;
  }
  // Kein Schnappen: Nach einem Drittel darf die Farbe noch nicht praktisch fertig
  // sein, nach zwei Dritteln muss der Großteil aber liegen.
  assert.ok(easeOut(1 / 3) < 0.7, `nach einem Drittel erst ${easeOut(1 / 3).toFixed(2)}`);
  assert.ok(easeOut(2 / 3) > 0.8 && easeOut(2 / 3) < 0.98, `nach zwei Dritteln ${easeOut(2 / 3).toFixed(2)}`);
  assert.ok(easeOut(0.5) > 0.55 && easeOut(0.5) < 0.85, `zur Hälfte ${easeOut(0.5).toFixed(2)}`);
});
