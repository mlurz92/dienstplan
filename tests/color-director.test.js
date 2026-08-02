import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECTRUM_CYCLE_YEARS,
  SPECTRUM_COLOR_ANCHORS,
  SPECTRUM_MONTH_PROFILES,
  SPECTRUM_PALETTES,
  SPECTRUM_REFERENCE_YEAR,
  colorProfileForDate,
  describeColor,
  pastelize,
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
const hueDegrees = color => {
  const [, a, b] = rgbToOklab(color);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
};
const hueSector = color => Math.floor(hueDegrees(color) / 30);
const angularDistance = (first, second) => {
  const delta = Math.abs(((first - second) % 360 + 360) % 360);
  return delta > 180 ? 360 - delta : delta;
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

test('benachbarte Monate liegen auf drei Achsen gleichzeitig auseinander', () => {
  // Der reine OKLab-Abstand genügt nicht: Zwei Töne können ihn allein über die
  // Buntheit erfüllen und trotzdem als dieselbe Farbe gelesen werden. Gemessen
  // wurden zuvor benachbarte Paare mit 1° Farbtonabstand und identischer
  // Helligkeit. Farbton und Helligkeit sind deshalb eigene Zusagen.
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
  // Der Gesamtabstand fällt im Pastellband naturgemäß kleiner aus als bei
  // kräftigen Tönen; die wahrnehmbare Trennung tragen Farbton und Helligkeit.
  assert.ok(minimumDistance >= .095, `minimaler Abstand benachbarter Monate nur ${minimumDistance.toFixed(3)}`);
  assert.ok(minimumHue >= 38, `minimaler Farbtonabstand benachbarter Monate nur ${minimumHue.toFixed(0)}°`);
  assert.ok(minimumLightness >= .034, `minimaler Helligkeitsabstand benachbarter Monate nur ${minimumLightness.toFixed(3)}`);
});

test('derselbe Monat bleibt auch von Jahr zu Jahr unterscheidbar', () => {
  let minimumAnnual = Infinity;
  for (let month = 1; month <= 12; month += 1) {
    const accents = [];
    for (let year = 2026; year < 2050; year += 1) accents.push(colorProfileForDate(year, month).accent);
    for (let index = 1; index < accents.length; index += 1) {
      minimumAnnual = Math.min(minimumAnnual, perceptualDistance(accents[index - 1], accents[index]));
    }
  }
  assert.ok(minimumAnnual >= .04, `minimaler Abstand desselben Monats in Folgejahren nur ${minimumAnnual.toFixed(3)}`);
});

test('der Takt wechselt zwischen hellen und tieferen Monaten', () => {
  // Ohne diesen Wechsel wirkte ein Jahr trotz unterschiedlicher Farbtöne wie
  // eine durchgehende Reihe gleich heller Flächen.
  for (let year = 2026; year < 2050; year += 1) {
    const lightness = Array.from({ length: 12 }, (_, index) => colorProfileForDate(year, index + 1).lightness);
    const swings = lightness.slice(1).map((value, index) => value - lightness[index]);
    const directionChanges = swings.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(swings[index])).length;
    assert.ok(directionChanges >= 6, `${year}: nur ${directionChanges} Helligkeitswechsel im Jahresverlauf`);
  }
});

test('alle Monatsfarben bleiben im pastelligen Bereich', () => {
  for (const palette of SPECTRUM_PALETTES) {
    assert.ok(palette.lightness >= .68, `${palette.key} ${palette.name}: zu dunkel (${palette.lightness.toFixed(3)})`);
    assert.ok(palette.chroma <= .15, `${palette.key} ${palette.name}: zu bunt (${palette.chroma.toFixed(3)})`);
  }
});

test('the same calendar month explores many distinct looks across the cycle', () => {
  for (let month = 1; month <= 12; month += 1) {
    const palettes = Array.from({ length: 24 }, (_, offset) => colorProfileForDate(2026 + offset, month));
    assert.ok(new Set(palettes.map(palette => palette.accentHex)).size >= 22, `Monat ${month}: zu viele Wiederholungen`);
    assert.ok(new Set(palettes.map(palette => palette.name)).size >= 5, `Monat ${month}: zu wenig sichtbare Farbnamen`);
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

test('the visible colour name always describes the colour that is actually shown', () => {
  for (const palette of SPECTRUM_PALETTES) {
    const profile = SPECTRUM_MONTH_PROFILES.find(entry => entry.month === palette.month);
    const anchor = SPECTRUM_COLOR_ANCHORS.find(entry => entry.name === palette.name);
    assert.ok(anchor, `${palette.key}: ${palette.name} gehört nicht zum Farblexikon`);

    // Der Name muss aus dem tatsächlich gerenderten Ton abgeleitet sein.
    assert.equal(describeColor(profile, palette.lightness, palette.chroma, palette.hue), palette.name);

    const distance = angularDistance(hueDegrees(palette.accent), anchor.hue);
    assert.ok(distance <= 42, `${palette.key} ${palette.name}: Farbton weicht ${distance.toFixed(0)}° vom Namensanker ab`);

    assert.ok(Math.abs(palette.lightness - anchor.lightness) <= .16,
      `${palette.key} ${palette.name}: Helligkeitscharakter passt nicht zum Namen`);
    assert.match(palette.tone, /^(tief|satt|mittelhell|hell|licht) · (zart|gedämpft|ausgewogen|kräftig|leuchtend)$/);
  }
});

test('jede angezeigte Farbe trägt den Namen einer recherchierten Trendfarbe 2026', () => {
  // Die Anker stammen aus den Saisonpaletten 2026 (Pantone Fashion Color Trend
  // Report, WGSN/Coloro Key Colours, Farben des Jahres). Ein Name, der dort
  // nicht vorkommt, wäre eine Erfindung.
  const trendNames = new Set(SPECTRUM_COLOR_ANCHORS.map(anchor => anchor.name));
  assert.ok(trendNames.size >= 45, `nur ${trendNames.size} recherchierte Trendfarben im Lexikon`);
  for (const palette of SPECTRUM_PALETTES) {
    assert.ok(trendNames.has(palette.name), `${palette.key}: „${palette.name}“ ist keine recherchierte Trendfarbe`);
  }
  const shown = new Set(SPECTRUM_PALETTES.map(palette => palette.name));
  assert.ok(shown.size >= 40, `nur ${shown.size} verschiedene Trendfarben werden im Zyklus tatsächlich gezeigt`);
});

test('die Anker sind die Pastellfassung ihrer Originalfarbe', () => {
  for (const anchor of SPECTRUM_COLOR_ANCHORS) {
    assert.match(anchor.hex, /^#[0-9a-f]{6}$/, `${anchor.name}: kein Originalwert hinterlegt`);
    const original = pastelize([
      parseInt(anchor.hex.slice(1, 3), 16),
      parseInt(anchor.hex.slice(3, 5), 16),
      parseInt(anchor.hex.slice(5, 7), 16),
      1
    ]);
    // Der Farbton – das Kennzeichnende – bleibt unverändert; gehoben werden
    // ausschließlich Helligkeit und gedämpfte Buntheit.
    assert.ok(Math.abs(anchor.lightness - original.lightness) < 1e-9);
    assert.ok(anchor.lightness >= .69 && anchor.lightness <= .90, `${anchor.name}: außerhalb des Pastellbands`);
    assert.ok(anchor.chroma <= .145, `${anchor.name}: zu bunt für das Pastellband`);
  }
});

test('ein Farbname wiederholt sich frühestens nach zwölf Monaten', () => {
  // „Nichts soll sich zu schnell wiederholen“: Innerhalb eines gleitenden
  // Jahresfensters ist jeder Name einmalig – auch über Jahresgrenzen hinweg.
  let shortestGap = Infinity;
  const lastSeen = new Map();
  SPECTRUM_PALETTES.forEach((palette, index) => {
    if (lastSeen.has(palette.name)) shortestGap = Math.min(shortestGap, index - lastSeen.get(palette.name));
    lastSeen.set(palette.name, index);
  });
  assert.ok(shortestGap >= 12, `ein Name kehrt bereits nach ${shortestGap} Monaten zurück`);

  for (let year = 2026; year < 2050; year += 1) {
    const names = Array.from({ length: 12 }, (_, index) => colorProfileForDate(year, index + 1).name);
    assert.equal(new Set(names).size, 12, `${year}: doppelter Farbname im Jahr`);
  }
});
