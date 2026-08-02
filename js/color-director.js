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
 * Trendfarben 2026 als Anker der Monatspaletten.
 *
 * Die Anker sind keine erfundenen Töne, sondern recherchierte Farben der
 * Saisonpaletten 2026: Pantone Fashion Color Trend Report für die New Yorker
 * und Londoner Fashion Week (S/S 26 und A/W 26/27), die Key Colours von WGSN
 * und Coloro sowie die Farben des Jahres 2026 der großen Farbhersteller. Die
 * Hexwerte sind die veröffentlichten sRGB-Näherungen dieser Farben.
 *
 * Jeder Monat trägt acht Anker aus seinem saisonalen Umfeld. Aus ihnen ergeben
 * sich Farbtonmitte, Breite, Helligkeit und Buntheit des Monatskorridors – die
 * Palette ist damit vollständig aus der Trendrecherche abgeleitet und nicht
 * nachträglich daran angenähert.
 *
 * Die Namen bleiben in ihrer englischen Originalform: „Neptune Green“ ist der
 * Name der Farbe, nicht eine Beschreibung, die sich übersetzen ließe.
 */
const TREND_COLORS = Object.freeze([
  {
    month: 1, season: 'Winter', family: 'Eis · Polarlicht',
    colors: [
      ['Ether', '#c7d3da'], ['Vapor Blue', '#b9c4cb'],
      ['Dutch Canal', '#7fa9c9'], ['Blue Aura', '#8eb4de'],
      ['Marina', '#5085c3'], ['All Aboard', '#3f7ca6'],
      ['Poseidon', '#123651'], ['Retro Blue', '#5f7ea8']
    ]
  },
  {
    month: 2, season: 'Spätwinter', family: 'Beere · Lack',
    colors: [
      ['Primrose Pink', '#f0d3d8'], ['Tickled Pink', '#e7b6c0'],
      ['Tea Rose', '#dc7178'], ['Dusky Rose', '#ba7b7c'],
      ['Foxglove', '#c49ba0'], ['Teaberry', '#c6455c'],
      ['Festival Fuchsia', '#b8296a'], ['Cherry Lacquer', '#8e2436']
    ]
  },
  {
    month: 3, season: 'Vorfrühling', family: 'Keimgrün · Botanik',
    colors: [
      ['Jelly Mint', '#a9dbc0'], ['Neptune Green', '#7fbc9c'],
      ['Sage Green', '#b2ac88'], ['Warm Eucalyptus', '#98a189'],
      ['Shale Green', '#79957f'], ['Hidden Gem', '#5e7a72'],
      ['Green Envy', '#6e8b3d'], ['Palm', '#6f7c3f']
    ]
  },
  {
    month: 4, season: 'Frühling', family: 'Blüte · Iris',
    colors: [
      ['Burnished Lilac', '#c5aeb1'], ['Amethyst Orchid', '#9f6ba0'],
      ['Fresh Purple', '#8c63c8'], ['Orchid Bloom', '#c6a4ce'],
      ['Damson', '#8e6f82'], ['Amaranth', '#6e3b4f'],
      ['Electric Fuchsia', '#d2409a'], ['Divine Damson', '#4c2e48']
    ]
  },
  {
    month: 5, season: 'Frühling', family: 'Blattgrün · Zitrus',
    colors: [
      ['Pale Banana', '#f4e3a0'], ['Celestial Yellow', '#efe08c'],
      ['Acacia', '#ded33c'], ['Green Glow', '#c3d63c'],
      ['Lemon Grass', '#ddd5a5'], ['Jelly Mint', '#a9dbc0'],
      ['Green Envy', '#6e8b3d'], ['Palm', '#6f7c3f']
    ]
  },
  {
    month: 6, season: 'Frühsommer', family: 'Wasser · Küste',
    colors: [
      ['Jelly Mint', '#a9dbc0'], ['Neptune Green', '#7fbc9c'],
      ['Satin Lagoon', '#2e7c84'], ['Transformative Teal', '#1c7e84'],
      ['Alexandrite', '#3e7e8c'], ['Dutch Canal', '#7fa9c9'],
      ['Blue Aura', '#8eb4de'], ['Marina', '#5085c3']
    ]
  },
  {
    month: 7, season: 'Hochsommer', family: 'Frucht · Sonnenglut',
    colors: [
      ['Muskmelon', '#e8834a'], ['Mandarin Orange', '#e2703a'],
      ['Amber Haze', '#e0a46b'], ['Brandied Melon', '#c86a4b'],
      ['Burnt Sienna', '#b75b3f'], ['Chili Oil', '#b5462f'],
      ['Poppy Red', '#be3a34'], ['Lava Falls', '#a32b31']
    ]
  },
  {
    month: 8, season: 'Spätsommer', family: 'Gold · Ernte',
    colors: [
      ['Epernay', '#d6b96c'], ['Universal Khaki', '#cbbba1'],
      ['Pale Banana', '#f4e3a0'], ['Acacia', '#ded33c'],
      ['Lemon Grass', '#ddd5a5'], ['Green Glow', '#c3d63c'],
      ['Burnt Olive', '#8a7b4e'], ['Celestial Yellow', '#efe08c']
    ]
  },
  {
    month: 9, season: 'Frühherbst', family: 'Wein · Pflaume',
    colors: [
      ['Foxglove', '#c49ba0'], ['Burnished Lilac', '#c5aeb1'],
      ['Amethyst Orchid', '#9f6ba0'], ['Damson', '#8e6f82'],
      ['Mauve Wine', '#734550'], ['Amaranth', '#6e3b4f'],
      ['Festival Fuchsia', '#b8296a'], ['Divine Damson', '#4c2e48']
    ]
  },
  {
    month: 10, season: 'Herbst', family: 'Kupfer · Erde',
    colors: [
      ['Candied Ginger', '#d8a47f'], ['Caramel', '#c67c4e'],
      ['Amber Haze', '#e0a46b'], ['Muted Clay', '#c08a78'],
      ['Toffee', '#a2704f'], ['Arabian Spice', '#8b4a2f'],
      ['Cocoa Powder', '#7b4a3a'], ['Warm Mahogany', '#7b473c']
    ]
  },
  {
    month: 11, season: 'Spätherbst', family: 'Mineral · Sturm',
    colors: [
      ['Vapor Blue', '#b9c4cb'], ['Underworld', '#8c93a1'],
      ['Future Dusk', '#57668b'], ['Silhouette', '#57504c'],
      ['Crown Blue', '#3a3f63'], ['Evening Blue', '#2c3a4a'],
      ['Rhodonite', '#3e3a55'], ['Retro Blue', '#5f7ea8']
    ]
  },
  {
    month: 12, season: 'Winter', family: 'Immergrün · Festlicht',
    colors: [
      ['Neptune Green', '#7fbc9c'], ['Satin Lagoon', '#2e7c84'],
      ['Transformative Teal', '#1c7e84'], ['Hidden Gem', '#5e7a72'],
      ['Shale Green', '#79957f'], ['Sycamore', '#3f4c42'],
      ['Midnight Garden', '#39463c'], ['Alexandrite', '#3e7e8c']
    ]
  }
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

/**
 * Mindestabstände benachbarter Monate.
 *
 * Der reine OKLab-Abstand genügt nicht: Zwei Töne können ihn allein über die
 * Buntheit erfüllen und trotzdem als „dieselbe Farbe, nur etwas kräftiger“
 * gelesen werden. Gemessen wurden benachbarte Paare mit **1° Farbtonabstand und
 * identischer Helligkeit**. Deshalb müssen jetzt drei Achsen gleichzeitig
 * auseinanderliegen: Gesamtabstand, Farbton und Helligkeit.
 */
const MIN_NEIGHBOUR_DISTANCE = .12;
const MIN_NEIGHBOUR_HUE = 42;
const MIN_NEIGHBOUR_LIGHTNESS = .038;
const MIN_ANNUAL_DISTANCE = .07;
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

/**
 * Arbeitsfassung einer Trendfarbe.
 *
 * Die recherchierten Originale reichen von `Primrose Pink` bis `Poseidon`. Sie
 * werden nicht mehr in ein blasses Pastellband gehoben, sondern in ihrer
 * regulären Stärke übernommen: Der Farbton bleibt unverändert, die Buntheit
 * bleibt erhalten, und die Helligkeit wird lediglich so weit geführt, dass die
 * Fläche als Hintergrund tragfähig bleibt.
 *
 * Das Zielband ist bewusst weit: Von einem tiefen `Poseidon` bis zu einem
 * lichten `Pale Banana` liegen über dreißig Helligkeitspunkte. Genau daraus
 * entsteht das breitere Spektrum – nicht aus zusätzlichen Farbtönen, sondern
 * aus der vollen Spanne, die jeder Ton tatsächlich besitzt.
 */
const TREND_LIGHTNESS = Object.freeze({ min: .555, max: .885 });
const SOURCE_LIGHTNESS = Object.freeze({ min: .30, max: .93 });
const TREND_CHROMA_MAX = .215;

export function trendTone(color) {
  const [lightness, chroma, hue] = labToLch(rgbToOklab(color));
  // Der Helligkeitsbereich der Originale wird als Ganzes in das Arbeitsband
  // abgebildet. Die Reihenfolge bleibt damit erhalten: `Poseidon` ist auch hier
  // der tiefere Ton, `Primrose Pink` der hellere.
  const position = (clamp(lightness, SOURCE_LIGHTNESS.min, SOURCE_LIGHTNESS.max) - SOURCE_LIGHTNESS.min)
    / (SOURCE_LIGHTNESS.max - SOURCE_LIGHTNESS.min);
  const target = TREND_LIGHTNESS.min + position * (TREND_LIGHTNESS.max - TREND_LIGHTNESS.min);
  return {
    // Helle Töne werden nicht künstlich abgedunkelt: Liegt das Original bereits
    // über dem Zielwert, behält es seine eigene Helligkeit.
    lightness: clamp(Math.max(target, lightness * .82 + target * .18), TREND_LIGHTNESS.min, TREND_LIGHTNESS.max),
    chroma: clamp(chroma * 1.06, .055, TREND_CHROMA_MAX),
    hue
  };
}

const circularMean = angles => {
  const x = angles.reduce((sum, angle) => sum + Math.cos(radians(angle)), 0);
  const y = angles.reduce((sum, angle) => sum + Math.sin(radians(angle)), 0);
  return degrees(Math.atan2(y, x));
};

/**
 * Der Monatskorridor entsteht aus den Ankern selbst: Mitte und Breite des
 * Farbtons, mittlere Helligkeit und Buntheit samt ihrer Streuung. Die Palette
 * ist damit vollständig aus der Trendrecherche abgeleitet.
 */
function corridorFromColors(colors) {
  const tones = colors.map(([, hex]) => trendTone(parseHexColor(hex)));
  const hues = tones.map(tone => degrees(tone.hue));
  const center = circularMean(hues);
  const spread = Math.max(...hues.map(hue => angularDistance(hue, center)));
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const lightnessValues = tones.map(tone => tone.lightness);
  const chromaValues = tones.map(tone => tone.chroma);
  // Die Buntheit orientiert sich an der kräftigeren Hälfte der Anker. Ein
  // schlichter Mittelwert zöge jeden Monat auf den blassesten Anker herunter,
  // und benachbarte Monate wären am Ende kaum noch auseinanderzuhalten.
  const strongerHalf = [...chromaValues].sort((left, right) => right - left).slice(0, Math.ceil(chromaValues.length / 2));
  return {
    hue: center,
    // Enger Korridor: Nur so bleiben die Farbtonbereiche benachbarter Monate
    // getrennt. Die Vielfalt entsteht über Helligkeit, Buntheit und den Takt.
    hueSpan: clamp(spread * 1.5, 36, 64),
    lightness: average(lightnessValues),
    lightnessSpan: clamp((Math.max(...lightnessValues) - Math.min(...lightnessValues)) * 1.2, .12, .26),
    chroma: average(strongerHalf),
    chromaSpan: clamp((Math.max(...chromaValues) - Math.min(...chromaValues)) * 1.0, .07, .16)
  };
}

export const SPECTRUM_MONTH_PROFILES = Object.freeze(TREND_COLORS.map(profile =>
  Object.freeze({ ...profile, ...corridorFromColors(profile.colors) })));

const MONTH_PROFILES = SPECTRUM_MONTH_PROFILES;

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
  profile.colors.map(([name, hex]) => {
    const tone = trendTone(parseHexColor(hex));
    return Object.freeze({
      name,
      hex,
      month: profile.month,
      hue: degrees(tone.hue),
      lightness: tone.lightness,
      chroma: tone.chroma
    });
  })
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
    clamp(profile.lightness + lightnessNoise + mood.lightness + lightnessLane * .085,
      profile.lightness - .13, profile.lightness + .13),
    .545, .905
  );
  // Die zulässige Buntheit hängt von der Helligkeit ab. Ohne diese Kopplung
  // kippen sehr helle Töne bei voller Buntheit ins Neon – ein Ton, den keine
  // der recherchierten Trendfarben trägt. Tiefe Töne dürfen dagegen ihre volle
  // Sättigung behalten, dort liegt der kräftige Teil des Spektrums.
  const chromaCeiling = .195 - Math.max(0, lightness - .78) * .80;
  const chroma = clamp(
    clamp(profile.chroma + chromaNoise + mood.chroma * .6 + chromaLane * .050,
      profile.chroma - .055, profile.chroma + .065),
    .052, chromaCeiling
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
function selectCandidate(profile, cycleIndex, previous, sameMonthPreviousYear, usedSectors, usedHexes, brightPhase, usedNames) {
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
  // Ein Farbname darf sich frühestens nach zwölf Monaten wiederholen – über
  // Jahresgrenzen hinweg gerechnet. Zweimal „Neptune Green“ innerhalb eines
  // Jahres liest sich als Wiederholung, auch wenn die beiden Töne messbar
  // auseinanderliegen.
  const freshlyNamed = unique.filter(entry => !usedNames.has(entry.candidate.name));
  const pool = freshlyNamed.length ? freshlyNamed : (unique.length ? unique : ranked);
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
  // Gleitendes Fenster über die zuletzt vergebenen Namen, unabhängig vom
  // Jahreswechsel.
  const recentNames = [];
  const NAME_COOLDOWN_MONTHS = 12;
  for (let cycleIndex = 0; cycleIndex < SPECTRUM_CYCLE_YEARS; cycleIndex += 1) {
    const usedSectors = new Set();
    for (const profile of MONTH_PROFILES) {
      // Der Takt kippt mit jedem Monat und zusätzlich mit jedem Jahr: Ein Monat,
      // der 2026 hell ausfällt, ist 2027 der tiefe Ton seines Jahres.
      const brightPhase = (profile.month + cycleIndex) % 2 === 0;
      const selected = selectCandidate(profile, cycleIndex, previous, sameMonth.get(profile.month), usedSectors, usedHexes, brightPhase, new Set(recentNames));
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
      recentNames.push(candidate.name);
      if (recentNames.length > NAME_COOLDOWN_MONTHS) recentNames.shift();
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
