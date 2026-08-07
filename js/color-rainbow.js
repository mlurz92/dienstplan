/**
 * Die Regenbogenfamilie — drei Farbsysteme auf einem Farbkreis.
 *
 * Anders als der Trend-Atlas ist hier nichts gesucht und nichts gewichtet: Der
 * Januar beginnt beim Rot, und die zwölf Monate gehen der Reihe nach durch das
 * Spektrum bis zum Magenta. Die Folge ist jahresunabhängig — derselbe Monat
 * trägt in jedem Jahr dieselbe Farbe, was diese Systeme gerade für den Ausdruck
 * und für den Vergleich zweier Jahre brauchbar macht.
 *
 * ALLE DREI SIND GESETZT, NICHT GERECHNET
 *
 * Die erste Fassung leitete Pastell und Tiefton aus dem Regenbogen ab: gleicher
 * Farbton, feste Helligkeit, feste Buntheit. Das Ergebnis war fahl und
 * eintönig, und zwar aus zwei Gründen. Erstens trägt sRGB nicht jeden Farbton
 * gleich weit — Gelb und Grün verlieren bei der Gamut-Anpassung Buntheit, Blau
 * und Violett behalten sie, und die Reihe fällt in der Mitte zusammen.
 * Zweitens ist eine Reihe mit konstanter Helligkeit für das Auge eine Reihe
 * ohne Rhythmus: Zwölf gleich helle Töne wirken wie eine Farbe in zwölf
 * Anläufen.
 *
 * Deshalb sind jetzt alle drei Tonlagen von Hand gesetzt, nach den etablierten
 * Palettenfamilien:
 *
 *   rainbow  Die klassischen Spektralfarben, volle sRGB-Werte.
 *   pastel   Zarte Töne mit wechselnder Helligkeit — die Vanille des Aprils
 *            ist deutlich heller als das Flieder des Oktobers.
 *   deep     Edelsteintöne (jewel tones): Rubin, Topas, Smaragd, Saphir,
 *            Amethyst — von Natur aus verschieden hell und verschieden bunt.
 *
 * WAS DIE REIHE ZUSAMMENHÄLT
 *
 * Zwei Zusagen gelten für jede Tonlage und werden geprüft
 * (`tests/pdf-export.test.js`):
 *
 *   1. Der Farbton steigt von Januar bis Dezember streng an — der Kreis wird
 *      genau einmal vorwärts durchlaufen, in jeder Tonlage in derselben
 *      Reihenfolge.
 *   2. Je zwei Monate einer Tonlage liegen wahrnehmbar auseinander
 *      (`MIN_FAMILY_DISTANCE`). Ohne diese Untergrenze war genau der Fehler
 *      möglich, den die erste Fassung hatte: benachbarte Monate, die man auf
 *      dem Bildschirm nicht auseinanderhält.
 */
import { labToLch, rgbToOklab } from './color-atlas-engine.js?v=20260806.1';

const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;

/** Untergrenze des wahrnehmbaren Abstands zweier Monate derselben Tonlage. */
export const MIN_FAMILY_DISTANCE = 0.05;

/**
 * Die Tonlagen mit ihren zwölf gesetzten Farben in Monatsreihenfolge.
 *
 * Die Namen sind Teil der Zusage: Sie stehen auf der Plakette im Monatskopf und
 * im PDF-Kopf, und sie sollen die Farbe benennen, die zu sehen ist.
 */
const FAMILIES = Object.freeze({
  rainbow: Object.freeze({
    label: 'Regenbogen',
    tone: 'voll · spektral',
    colors: Object.freeze([
      ['Rot', '#ff0000'], ['Zinnober', '#ff5a00'], ['Orange', '#ff9900'], ['Gelb', '#ffdd00'],
      ['Limette', '#a6e000'], ['Grün', '#00b400'], ['Smaragd', '#00c281'], ['Türkis', '#00c8d7'],
      ['Blau', '#0066ff'], ['Indigo', '#3f2fd8'], ['Violett', '#8a2be2'], ['Magenta', '#ff00a0']
    ])
  }),
  pastel: Object.freeze({
    label: 'Pastell',
    tone: 'zart · pastell',
    colors: Object.freeze([
      ['Rosenquarz', '#ffb3ac'], ['Pfirsich', '#ffc9a8'], ['Sanddorn', '#ffd58a'], ['Vanille', '#fdf1a9'],
      ['Pistazie', '#d4e8a0'], ['Minze', '#a8e6bd'], ['Seegras', '#7fd9c4'], ['Eisblau', '#b2e4f0'],
      ['Puderblau', '#b7c9f5'], ['Flieder', '#b6b3f8'], ['Malve', '#e6b4f2'], ['Altrosa', '#f7a8d1']
    ])
  }),
  deep: Object.freeze({
    label: 'Juwel',
    tone: 'satt · Edelstein',
    colors: Object.freeze([
      ['Rubin', '#a5122f'], ['Karneol', '#c1440e'], ['Topas', '#b8860b'], ['Citrin', '#8c8f14'],
      ['Peridot', '#4f7f1f'], ['Smaragd', '#0b7a41'], ['Malachit', '#00877c'], ['Petrol', '#0f6f80'],
      ['Saphir', '#0f52ba'], ['Lapislazuli', '#33308f'], ['Amethyst', '#6b2fa0'], ['Fuchsit', '#a01a6b']
    ])
  })
});
export const RAINBOW_FAMILIES = Object.freeze(Object.keys(FAMILIES));
export const RAINBOW_FAMILY_LABELS = Object.freeze(
  Object.fromEntries(RAINBOW_FAMILIES.map(family => [family, FAMILIES[family].label]))
);

const SEASONS = Object.freeze([
  'Winter', 'Spätwinter', 'Vorfrühling', 'Frühling', 'Frühling', 'Frühsommer',
  'Hochsommer', 'Spätsommer', 'Frühherbst', 'Herbst', 'Spätherbst', 'Winter'
]);

function parseHex(value) {
  return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
}

function buildPalette(family, monthIndex) {
  const profile = FAMILIES[family];
  const [name, hex] = profile.colors[monthIndex];
  const accent = [...parseHex(hex), 1];
  const [lightness, chroma, hue] = labToLch(rgbToOklab(accent));
  return Object.freeze({
    month: monthIndex + 1,
    season: SEASONS[monthIndex],
    family: profile.label,
    name,
    source: `${profile.label} · zwölf Monate im Spektrum`,
    sourceHex: hex,
    tone: profile.tone,
    mood: profile.label,
    accent,
    accentHex: hex,
    lightness,
    chroma,
    hue
  });
}

export const RAINBOW_PALETTES = Object.freeze(Object.fromEntries(
  RAINBOW_FAMILIES.map(family => [family, Object.freeze(Array.from({ length: 12 }, (_, index) => buildPalette(family, index)))])
));

/** Die Monatsfarbe einer Tonlage — das Jahr spielt hier keine Rolle. */
export function rainbowProfileForDate(year, month, family = 'rainbow') {
  const resolved = FAMILIES[family] ? family : 'rainbow';
  const monthIndex = positiveMod(Math.trunc(Number(month)) - 1, 12);
  const safeYear = Number.isInteger(Number(year)) ? Number(year) : new Date().getFullYear();
  const palette = RAINBOW_PALETTES[resolved][monthIndex];
  return Object.freeze({
    ...palette,
    year: safeYear,
    key: `${resolved}-${safeYear}-${String(monthIndex + 1).padStart(2, '0')}`
  });
}
