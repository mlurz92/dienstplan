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
 *
 * Der sichtbare Farbname wird nicht aus einer Reihenfolge gezogen, sondern aus
 * dem tatsächlich gewählten OKLCH-Wert bestimmt: Jeder Monat besitzt ein
 * Lexikon aus Farbankern mit Farbton, Helligkeits- und Buntheitscharakter. Der
 * nächstgelegene Anker benennt die Farbe. Dadurch beschreibt das Badge immer
 * genau den Ton, der tatsächlich auf der Fläche liegt.
 *
 * Der Monatswechsel wird als durchgehender High-Framerate-Verlauf in OKLCH
 * interpoliert. Ein laufender Verlauf auf dasselbe Ziel wird nie neu gestartet,
 * dadurch bleibt die Bewegung auch bei mehrfachen Synchronisationssignalen
 * flüssig und frei von Sprüngen.
 */

export const SPECTRUM_REFERENCE_YEAR = 2026;
export const SPECTRUM_CYCLE_YEARS = 24;
export const SPECTRUM_DURATION_MS = 760;

/**
 * Farbanker: [Name, absoluter OKLCH-Farbton in Grad, Helligkeitscharakter,
 * Buntheitscharakter]. Die Charakterwerte sind -1 (tief/zart), 0 (ausgewogen)
 * und 1 (hell/leuchtend) relativ zur Mitte des jeweiligen Monatskorridors.
 */
export const SPECTRUM_MONTH_PROFILES = Object.freeze([
  {
    month: 1, season: 'Winter', family: 'Eis · Polarlicht',
    hue: 245, hueSpan: 76, lightness: 0.765, lightnessSpan: 0.105, chroma: 0.085, chromaSpan: 0.075,
    names: [
      ['Eiscyan', 210, 1, 1], ['Petrolblau', 210, -1, 0], ['Aquamarin', 210, 1, -1],
      ['Gletscherblau', 232, 1, 1], ['Azurblau', 232, 0, 1], ['Stahlblau', 232, -1, -1],
      ['Nordlichtblau', 254, 1, 1], ['Wintergrau', 254, 0, -1], ['Frostindigo', 254, -1, 0],
      ['Polarviolett', 280, 0, 1], ['Eisflieder', 280, 1, -1], ['Dämmerblau', 280, -1, 1]
    ]
  },
  {
    month: 2, season: 'Spätwinter', family: 'Beere · Lack',
    hue: 5, hueSpan: 54, lightness: 0.745, lightnessSpan: 0.115, chroma: 0.105, chromaSpan: 0.08,
    names: [
      ['Magentarosa', 335, -1, 1], ['Orchidee', 335, 1, -1], ['Fuchsia', 335, 0, 1],
      ['Himbeerlack', 352, 0, 1], ['Rosenquarz', 352, 1, -1], ['Beerenrosa', 352, -1, 1],
      ['Rosenrot', 8, 0, 1], ['Altrosa', 8, 1, -1], ['Himbeerrot', 8, -1, 1],
      ['Korallrot', 28, 0, 1], ['Kirschblüte', 28, -1, 0], ['Korallrosa', 28, 1, -1]
    ]
  },
  {
    month: 3, season: 'Vorfrühling', family: 'Keimgrün · Botanik',
    hue: 150, hueSpan: 78, lightness: 0.775, lightnessSpan: 0.105, chroma: 0.095, chromaSpan: 0.075,
    names: [
      ['Chartreusegrün', 118, 1, 1], ['Wiesengrün', 118, 0, 0], ['Salbeioliv', 118, -1, -1],
      ['Keimgrün', 142, 1, 1], ['Kleegrün', 142, 0, 1], ['Moosgrün', 142, -1, -1],
      ['Celadon', 165, 1, -1], ['Jadegrün', 165, 0, 1], ['Waldjade', 165, -1, 0],
      ['Eukalyptus', 188, 1, -1], ['Frühlingsaqua', 188, 0, 1], ['Türkisgrün', 188, -1, 1]
    ]
  },
  {
    month: 4, season: 'Frühling', family: 'Blüte · Iris',
    hue: 305, hueSpan: 80, lightness: 0.755, lightnessSpan: 0.115, chroma: 0.1, chromaSpan: 0.08,
    names: [
      ['Veilchenblau', 275, 0, 1], ['Glockenblau', 275, 1, -1], ['Dämmerviolett', 275, -1, 0],
      ['Iris', 295, 0, 1], ['Hyazinthe', 295, 1, 0], ['Purpurlila', 295, -1, 1],
      ['Krokusviolett', 315, 0, 0], ['Fliederblitz', 315, 1, 1], ['Amethyst', 315, -1, 1],
      ['Malve', 335, 0, -1], ['Blütenrosa', 335, 1, -1], ['Beerenmagenta', 335, -1, 1]
    ]
  },
  {
    month: 5, season: 'Frühling', family: 'Blattgrün · Zitrus',
    hue: 136, hueSpan: 62, lightness: 0.785, lightnessSpan: 0.105, chroma: 0.105, chromaSpan: 0.08,
    names: [
      ['Zitrusgelb', 95, 1, 1], ['Limonengrün', 95, 0, 1], ['Senfoliv', 95, -1, -1],
      ['Chartreuse', 118, 1, 1], ['Apfelgrün', 118, 0, 1], ['Lindenblatt', 118, 1, -1],
      ['Maigrün', 140, 0, 1], ['Salbei', 140, 1, -1], ['Farngrün', 140, -1, 0],
      ['Minzblatt', 162, 1, -1], ['Smaragdgrün', 162, 0, 1], ['Bambusgrün', 162, -1, 0]
    ]
  },
  {
    month: 6, season: 'Frühsommer', family: 'Wasser · Küste',
    hue: 208, hueSpan: 80, lightness: 0.765, lightnessSpan: 0.105, chroma: 0.095, chromaSpan: 0.075,
    names: [
      ['Seegrün', 178, 0, 1], ['Meeresglas', 178, 1, -1], ['Meergrün', 178, -1, 1],
      ['Türkisstrom', 198, 0, 1], ['Aqua', 198, 1, 1], ['Petroltürkis', 198, -1, 0],
      ['Lagune', 218, 0, 1], ['Poolblau', 218, 1, 0], ['Mineralblau', 218, 0, -1],
      ['Küstenblau', 242, -1, 0], ['Sommerhimmel', 242, 1, -1], ['Ozeanblau', 242, -1, 1]
    ]
  },
  {
    month: 7, season: 'Hochsommer', family: 'Frucht · Sonnenglut',
    hue: 34, hueSpan: 42, lightness: 0.745, lightnessSpan: 0.115, chroma: 0.115, chromaSpan: 0.08,
    names: [
      ['Hibiskusrot', 12, 0, 1], ['Wassermelone', 12, 1, 0], ['Kirschrosa', 12, -1, 1],
      ['Koralle', 30, 1, 1], ['Erdbeerrot', 30, -1, 1], ['Terrakottarot', 30, 0, 0],
      ['Persimone', 46, 0, 1], ['Pfirsichglut', 46, 1, -1], ['Rostorange', 46, -1, 0],
      ['Mandarine', 62, 0, 1], ['Papaya', 62, 1, 1], ['Karamell', 62, -1, -1]
    ]
  },
  {
    month: 8, season: 'Spätsommer', family: 'Gold · Ernte',
    hue: 82, hueSpan: 62, lightness: 0.8, lightnessSpan: 0.1, chroma: 0.105, chromaSpan: 0.075,
    names: [
      ['Bernstein', 58, 0, 1], ['Aprikosengold', 58, 1, 1], ['Karamellbraun', 58, -1, -1],
      ['Safran', 76, 0, 1], ['Honiggold', 76, 1, 0], ['Bronzegold', 76, -1, 0],
      ['Sonnenblume', 94, 1, 1], ['Currygelb', 94, 0, 1], ['Erntegelb', 94, 1, 0],
      ['Goldolive', 112, -1, -1], ['Senfgrün', 112, -1, 0], ['Limonengold', 112, 1, -1]
    ]
  },
  {
    month: 9, season: 'Frühherbst', family: 'Wein · Pflaume',
    hue: 340, hueSpan: 68, lightness: 0.735, lightnessSpan: 0.12, chroma: 0.095, chromaSpan: 0.075,
    names: [
      ['Lavendelgrau', 312, -1, -1], ['Traubenlila', 312, -1, 1], ['Mauve', 312, 1, -1],
      ['Brombeerrosa', 330, -1, 0], ['Pflaume', 330, 0, 0], ['Fuchsienrosa', 330, 1, 1],
      ['Dahlienrot', 348, 0, 1], ['Weinrosé', 348, -1, 1], ['Feige', 348, 1, -1],
      ['Altrosé', 6, 1, -1], ['Rosenholz', 6, 0, -1], ['Beerenrosé', 6, -1, 1]
    ]
  },
  {
    month: 10, season: 'Herbst', family: 'Kupfer · Erde',
    hue: 60, hueSpan: 62, lightness: 0.755, lightnessSpan: 0.115, chroma: 0.1, chromaSpan: 0.075,
    names: [
      ['Rostrosé', 32, -1, 1], ['Terrakotta', 32, 0, 1], ['Lachsrot', 32, 1, -1],
      ['Kupfer', 50, 0, 1], ['Kürbis', 50, 1, 1], ['Zimtbraun', 50, -1, -1],
      ['Ahornorange', 68, 1, 1], ['Bronze', 68, -1, 0], ['Karamellgold', 68, 0, 0],
      ['Ocker', 88, 0, 0], ['Senfocker', 88, -1, -1], ['Strohgold', 88, 1, -1]
    ]
  },
  {
    month: 11, season: 'Spätherbst', family: 'Mineral · Sturm',
    hue: 260, hueSpan: 80, lightness: 0.725, lightnessSpan: 0.12, chroma: 0.07, chromaSpan: 0.065,
    names: [
      ['Petrolgrau', 212, -1, -1], ['Stahlpetrol', 212, 0, -1], ['Nebelblau', 212, 1, -1],
      ['Graphitdunst', 240, -1, -1], ['Sturmblau', 240, -1, 0], ['Rauchblau', 240, 1, -1],
      ['Schiefer', 268, 0, -1], ['Indigonebel', 268, 0, 0], ['Dämmerungsblau', 268, -1, 1],
      ['Basaltlila', 298, -1, -1], ['Nebelviolett', 298, 1, -1], ['Amethystnebel', 298, 0, 1]
    ]
  },
  {
    month: 12, season: 'Winter', family: 'Immergrün · Festlicht',
    hue: 182, hueSpan: 52, lightness: 0.715, lightnessSpan: 0.115, chroma: 0.085, chromaSpan: 0.07,
    names: [
      ['Winterwald', 145, -1, -1], ['Tannengrün', 145, -1, 0], ['Mistelgrün', 145, 1, -1],
      ['Tannenjade', 168, -1, 1], ['Wacholder', 168, 0, -1], ['Festjade', 168, 0, 1],
      ['Pfauengrün', 188, 0, 1], ['Festpetrol', 188, 1, -1], ['Wintertürkis', 188, -1, 1],
      ['Polartürkis', 208, 1, 0], ['Eisblaugrün', 208, 1, -1], ['Winterblau', 208, -1, 0]
    ]
  }
].map(profile => Object.freeze({ ...profile, names: Object.freeze(profile.names.map(entry => Object.freeze(entry))) })));

const MONTH_PROFILES = SPECTRUM_MONTH_PROFILES;

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

/**
 * Mindestabstände benachbarter Monate.
 *
 * Der reine OKLab-Abstand genügt nicht: Zwei Töne können ihn allein über die
 * Buntheit erfüllen und trotzdem als „dieselbe Farbe, nur etwas kräftiger“
 * gelesen werden. Gemessen wurden benachbarte Paare mit **1° Farbtonabstand und
 * identischer Helligkeit**. Deshalb müssen jetzt drei Achsen gleichzeitig
 * auseinanderliegen: Gesamtabstand, Farbton und Helligkeit.
 */
const MIN_NEIGHBOUR_DISTANCE = .10;
const MIN_NEIGHBOUR_HUE = 38;
const MIN_NEIGHBOUR_LIGHTNESS = .045;
const MIN_ANNUAL_DISTANCE = .06;
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
  return Math.floor(degrees(Math.atan2(b, a)) / 30);
}

/**
 * Globales Farblexikon.
 *
 * Jeder Anker kennt seinen Farbton sowie den Helligkeits- und Buntheitswert,
 * den er beschreibt. Die Anker des eigenen Monats werden bevorzugt; verlässt
 * ein Ton seinen saisonalen Korridor, benennt ihn der treffendere Anker eines
 * anderen Monats. Dadurch kann der angezeigte Name nie vom sichtbaren Ton
 * abweichen.
 */
export const SPECTRUM_COLOR_ANCHORS = Object.freeze(MONTH_PROFILES.flatMap(profile =>
  profile.names.map(([name, anchorHue, lightnessBias, chromaBias]) => Object.freeze({
    name,
    month: profile.month,
    hue: anchorHue,
    lightness: profile.lightness + lightnessBias * profile.lightnessSpan * .42,
    chroma: profile.chroma + chromaBias * profile.chromaSpan * .42
  }))
));

const FOREIGN_ANCHOR_PENALTY = 1.15;

function anchorScore(anchor, lightness, chroma, hueDegrees) {
  return (angularDistance(hueDegrees, anchor.hue) / 26) ** 2
    + ((lightness - anchor.lightness) / .085) ** 2
    + ((chroma - anchor.chroma) / .06) ** 2;
}

/**
 * Benennt eine Farbe anhand ihres tatsächlichen OKLCH-Werts.
 */
export function describeColor(profile, lightness, chroma, hueRadians) {
  const hueDegrees = degrees(hueRadians);
  let best = null;
  for (const anchor of SPECTRUM_COLOR_ANCHORS) {
    const penalty = anchor.month === profile.month ? 0 : FOREIGN_ANCHOR_PENALTY;
    const score = anchorScore(anchor, lightness, chroma, hueDegrees) + penalty;
    if (!best || score < best.score) best = { name: anchor.name, score };
  }
  return best.name;
}

const LIGHTNESS_WORDS = Object.freeze(['tief', 'satt', 'mittelhell', 'hell', 'licht']);
const CHROMA_WORDS = Object.freeze(['zart', 'gedämpft', 'ausgewogen', 'kräftig', 'leuchtend']);

function toneWords(lightness, chroma) {
  const lightnessIndex = clamp(Math.floor((lightness - .53) / .06), 0, LIGHTNESS_WORDS.length - 1);
  const chromaIndex = clamp(Math.floor((chroma - .07) / .042), 0, CHROMA_WORDS.length - 1);
  return `${LIGHTNESS_WORDS[lightnessIndex]} · ${CHROMA_WORDS[chromaIndex]}`;
}

const HUE_LANES = Object.freeze([-.5, -.36, -.22, -.08, .08, .22, .36, .5]);
const TONE_LANES = Object.freeze([
  [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0],
  // Halbe Stufen: Sie füllen die Lücken zwischen den Ecken und geben der
  // Auswahl den Spielraum, alle drei Mindestabstände gleichzeitig zu erfüllen.
  [.5, .5], [-.5, .5], [.5, -.5], [-.5, -.5]
]);
export const SPECTRUM_CANDIDATES_PER_MONTH = HUE_LANES.length * TONE_LANES.length;

/**
 * Erzeugt einen Kandidaten aus dem Korridor eines Monats.
 *
 * Farbton, Helligkeit und Buntheit werden unabhängig voneinander aufgespannt.
 * Dadurch stehen pro Monat alle Ecken des Korridors zur Auswahl – ein helles
 * leuchtendes und ein tiefes ruhiges Maigrün sind beide erreichbar, ohne die
 * Jahreszeit zu verlassen.
 */
function candidateFor(profile, cycleIndex, phase) {
  const mood = YEAR_MOODS[cycleIndex];
  const sequence = cycleIndex * 17 + profile.month * 11 + phase * 7 + 1;
  const hueNoise = (radicalInverse(sequence, 2) - .5) * profile.hueSpan * .5;
  const lightnessNoise = (radicalInverse(sequence, 3) - .5) * profile.lightnessSpan * .45;
  const chromaNoise = (radicalInverse(sequence, 5) - .5) * profile.chromaSpan * .45;
  const hueLane = HUE_LANES[phase % HUE_LANES.length];
  const [lightnessLane, chromaLane] = TONE_LANES[Math.floor(phase / HUE_LANES.length) % TONE_LANES.length];

  // Der Farbton bleibt bewusst im saisonalen Korridor. Vielfalt entsteht über
  // die volle Korridorbreite sowie über Helligkeit und Buntheit, nicht durch
  // ein Abwandern in eine fremde Jahreszeit.
  const hueDegrees = profile.hue + clamp(
    hueNoise + mood.hue + hueLane * profile.hueSpan,
    -profile.hueSpan / 2,
    profile.hueSpan / 2
  );
  const hue = radians(hueDegrees);
  const lightness = clamp(
    clamp(profile.lightness + lightnessNoise + mood.lightness + lightnessLane * .055,
      profile.lightness - .075, profile.lightness + .075),
    .66, .90
  );
  const chroma = clamp(
    clamp(profile.chroma + chromaNoise + mood.chroma * .6 + chromaLane * .038,
      profile.chroma - .045, profile.chroma + .05),
    .045, .175
  );
  const accent = oklchToRgb(lightness, chroma, hue);
  const [actualLightness, actualChromaRaw, actualHue] = labToLch(rgbToOklab(accent));
  return {
    accent,
    mood: mood.name,
    hue: actualHue,
    lightness: actualLightness,
    chroma: actualChromaRaw,
    phase,
    sector: hueSector(accent),
    name: describeColor(profile, actualLightness, actualChromaRaw, actualHue)
  };
}

/**
 * Auswahl eines Monatstons.
 *
 * `brightPhase` gibt den Takt vor: Die Monate wechseln reihum zwischen einem
 * hellen, leuchtenden und einem tiefen, satten Charakter. Dieser Wechsel ist
 * der eigentliche Grund, warum aufeinanderfolgende Monate jetzt auch dann
 * verschieden wirken, wenn ihre Farbfamilien benachbart sind.
 */
function selectCandidate(profile, cycleIndex, previous, sameMonthPreviousYear, usedSectors, usedHexes, brightPhase) {
  const previousHue = previous ? degrees(previous.hue) : null;
  const ranked = Array.from({ length: SPECTRUM_CANDIDATES_PER_MONTH }, (_, phase) => candidateFor(profile, cycleIndex, phase))
    .map(candidate => {
      const previousDistance = previous ? perceptualDistance(candidate.accent, previous.accent) : .4;
      const annualDistance = sameMonthPreviousYear ? perceptualDistance(candidate.accent, sameMonthPreviousYear.accent) : .4;
      const sectorBonus = usedSectors.has(candidate.sector) ? 0 : .085;
      const hueSeparation = previousHue === null ? 90 : angularDistance(degrees(candidate.hue), previousHue);
      const lightnessDelta = previous ? Math.abs(candidate.lightness - previous.lightness) : .12;
      const chromaDelta = previous ? Math.abs(candidate.chroma - previous.chroma) : .08;
      // Taktbonus: gerade Monate hell, ungerade tief – oder umgekehrt, je Jahr.
      const rhythmBonus = (candidate.lightness > profile.lightness) === brightPhase ? .07 : 0;
      const score = Math.min(previousDistance * 1.15, annualDistance)
        + Math.max(previousDistance, annualDistance) * .2
        + Math.min(hueSeparation, 90) / 90 * .12
        + Math.min(lightnessDelta, .12) / .12 * .10
        + Math.min(chromaDelta, .08) / .08 * .05
        + candidate.chroma * .06
        + rhythmBonus
        + sectorBonus;
      return { candidate, score, previousDistance, annualDistance, hueSeparation, lightnessDelta };
    })
    .sort((left, right) => right.score - left.score);

  // Ein Farbwert darf im gesamten 24-Jahres-Zyklus nur einmal vorkommen. Nach
  // der Gamut-Begrenzung können zwei Kandidaten sonst auf denselben sRGB-Wert
  // fallen und der Zyklus verlöre sichtbar an Vielfalt.
  const unique = ranked.filter(entry => !usedHexes.has(toHex(entry.candidate.accent)));
  const pool = unique.length ? unique : ranked;
  const separated = entry => entry.previousDistance >= MIN_NEIGHBOUR_DISTANCE
    && entry.hueSeparation >= MIN_NEIGHBOUR_HUE
    && entry.lightnessDelta >= MIN_NEIGHBOUR_LIGHTNESS;

  const fullySafe = pool.filter(entry => separated(entry) && entry.annualDistance >= MIN_ANNUAL_DISTANCE);
  if (fullySafe.length) return fullySafe[0];

  // Zweite Wahl: Der Abstand zum Vormonat ist der sichtbarere von beiden und
  // wird deshalb zuerst gesichert. Unter den verbleibenden Kandidaten gewinnt
  // dann derjenige mit dem größten Jahresabstand – sonst liefe derselbe Monat
  // Jahr für Jahr auf denselben Ton zu, weil die Nachbarregeln seine Lage
  // ohnehin weitgehend festlegen.
  const neighbourSafe = pool.filter(separated);
  if (neighbourSafe.length) {
    return neighbourSafe.reduce((best, entry) => entry.annualDistance > best.annualDistance ? entry : best);
  }

  // Erfüllt kein Kandidat alle Achsen, gewinnt der mit der besten schwächsten:
  // weder Vormonat noch Vorjahr dürfen in einen kaum unterscheidbaren Ton fallen.
  return pool.reduce((best, entry) => {
    const rank = candidate => Math.min(
      candidate.previousDistance / MIN_NEIGHBOUR_DISTANCE,
      candidate.hueSeparation / MIN_NEIGHBOUR_HUE,
      candidate.lightnessDelta / MIN_NEIGHBOUR_LIGHTNESS,
      candidate.annualDistance / MIN_ANNUAL_DISTANCE
    );
    return rank(entry) > rank(best) ? entry : best;
  });
}

function toHex(color) {
  return `#${color.slice(0, 3).map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function buildCanonicalPalettes() {
  const result = [];
  const sameMonth = new Map();
  const usedHexes = new Set();
  let previous = null;
  for (let cycleIndex = 0; cycleIndex < SPECTRUM_CYCLE_YEARS; cycleIndex += 1) {
    const usedSectors = new Set();
    for (const profile of MONTH_PROFILES) {
      // Der Takt kippt mit jedem Monat und zusätzlich mit jedem Jahr: Ein Monat,
      // der 2026 hell ausfällt, ist 2027 der tiefe Ton seines Jahres.
      const brightPhase = (profile.month + cycleIndex) % 2 === 0;
      const selected = selectCandidate(profile, cycleIndex, previous, sameMonth.get(profile.month), usedSectors, usedHexes, brightPhase);
      const year = SPECTRUM_REFERENCE_YEAR + cycleIndex;
      const candidate = selected.candidate;
      const palette = Object.freeze({
        key: `${year}-${String(profile.month).padStart(2, '0')}`,
        year,
        month: profile.month,
        season: profile.season,
        family: profile.family,
        name: candidate.name,
        tone: toneWords(candidate.lightness, candidate.chroma),
        mood: candidate.mood,
        accent: candidate.accent,
        accentHex: toHex(candidate.accent),
        lightness: candidate.lightness,
        chroma: candidate.chroma,
        hue: candidate.hue,
        previousDistance: selected.previousDistance,
        annualDistance: selected.annualDistance
      });
      result.push(palette);
      previous = palette;
      sameMonth.set(profile.month, palette);
      usedSectors.add(candidate.sector);
      usedHexes.add(palette.accentHex);
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

/**
 * Schreibt nur tatsächlich veränderte Variablen.
 *
 * Jede geschriebene Custom Property auf `:root` invalidiert den Stil des
 * gesamten Dokuments. Während eines Verlaufs runden die zarten Flächentöne über
 * mehrere Frames auf denselben sRGB-Wert; diese Frames dürfen keine zusätzliche
 * Style-Recalculation auslösen.
 */
const lastWritten = new Map();

function writeVariables(root, values) {
  for (const [name, value] of Object.entries(values)) {
    const css = toCss(value);
    if (lastWritten.get(name) === css && root.style.getPropertyValue(name) === css) continue;
    root.style.setProperty(name, css, 'important');
    lastWritten.set(name, css);
  }
}

/**
 * Smootherstep. Beginn und Ende sind in der ersten und zweiten Ableitung
 * stetig; dadurch wirkt der Farbverlauf auf 120-Hz-Displays vollkommen
 * ruckfrei und ohne sichtbaren Einsatz- oder Abrisspunkt.
 */
const easeSpectrum = t => t * t * t * (t * (t * 6 - 15) + 10);

let animationHandle = null;
let activeKey = null;
let animatingKey = null;

/**
 * Blendet eine kurze, GPU-getragene Lichtwelle über die Fläche.
 *
 * Bewegt werden ausschließlich `opacity` und `transform`, dadurch entsteht
 * keine zusätzliche Layout- oder Style-Last auf dem Main Thread.
 */
function playSpectrumSweep(root, accent) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;
  const existing = document.querySelector('.month-spectrum-sweep');
  if (existing) existing.remove();
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

export function applySpectrumProfile(year, month, { animate = true } = {}) {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  const palette = colorProfileForDate(year, month);
  const target = spectrumVariables(palette);
  const changed = activeKey !== palette.key;
  const first = activeKey === null;

  root.dataset.colorDirector = 'seasonal-spectrum-v2';
  root.dataset.spectrumPalette = palette.name;
  root.dataset.spectrumMood = palette.mood;
  root.dataset.spectrumKey = palette.key;
  activeKey = palette.key;

  const label = document.getElementById('monthPaletteLabel');
  if (label) {
    const text = `Monatskontrast · ${palette.name}`;
    const title = `${palette.season} · ${palette.family} · ${palette.tone} · ${palette.mood} · ${palette.year}`;
    if (label.textContent !== text) label.textContent = text;
    if (label.title !== title) label.title = title;
  }

  // Ein bereits laufender Verlauf auf dasselbe Ziel wird niemals neu gestartet
  // oder hart überschrieben. Wiederholte Synchronisationssignale bleiben damit
  // wirkungslos und die Bewegung bleibt in jedem Frame stetig.
  if (animate && animatingKey === palette.key && animationHandle !== null) return palette;

  if (animationHandle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }

  if (!animate || !changed || first || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    animatingKey = null;
    writeVariables(root, target);
    // Auch der sofortige Weg endet auf dem Zielprofil – etwa wenn der Druck
    // einen laufenden Verlauf abschließt. Das Attribut muss das abbilden.
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
  // Monats- und Jahreswechsel werden als durchgehender Farbverlauf gefahren.
  // Ein laufender Verlauf auf dasselbe Ziel wird von applySpectrumProfile
  // erkannt und nicht neu gestartet; dadurch bleibt die Bewegung flüssig.
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
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeColorDirector, { once: true });
  else initializeColorDirector();
}
