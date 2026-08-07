/**
 * Die Regenbogenfamilie — drei Farbsysteme auf einem Farbkreis.
 *
 * Anders als der Trend-Atlas ist hier nichts gesucht und nichts gewichtet: Der
 * Januar beginnt beim Rot, und die zwölf Monate gehen der Reihe nach durch das
 * Spektrum bis zum Magenta. Die Folge ist jahresunabhängig — derselbe Monat
 * trägt in jedem Jahr dieselbe Farbe, was diese Systeme gerade für den Ausdruck
 * und für den Vergleich zweier Jahre brauchbar macht.
 *
 * `rainbow` nimmt die klassischen Regenbogenfarben so, wie man sie kennt: volle
 * sRGB-Werte, Rot ist Rot und Gelb ist Gelb. Ein wahrnehmungsgleichmäßiger
 * Kreis wäre gleichmäßiger im Schritt, aber er kennt kein leuchtendes Gelb —
 * bei fester Helligkeit wird daraus Gold. Hier hat die erwartete Farbe Vorrang
 * vor dem gleichmäßigen Abstand.
 *
 * `pastel` und `deep` teilen sich diese zwölf Farbtöne und ändern nur Helligkeit
 * und Buntheit: einmal zart auf hellem Grund, einmal satt und tief. Weil der
 * Farbton derselbe bleibt, bleibt auch die Zuordnung „Monat → Farbe" über alle
 * drei Systeme dieselbe.
 */
import { labToLch, oklchToRgb, rgbToOklab } from './color-atlas-engine.js?v=20260806.1';

const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;

/**
 * Die zwölf klassischen Spektralfarben in Monatsreihenfolge.
 *
 * Die Werte sind bewusst gesetzt und nicht gerechnet: Sie sollen so aussehen,
 * wie ein Regenbogen aussieht.
 */
const RAINBOW_HEXES = Object.freeze([
  ['Rot', '#ff0000'], ['Zinnober', '#ff5a00'], ['Orange', '#ff9900'], ['Gelb', '#ffdd00'],
  ['Limette', '#a6e000'], ['Grün', '#00b400'], ['Smaragd', '#00c281'], ['Türkis', '#00c8d7'],
  ['Blau', '#0066ff'], ['Indigo', '#3f2fd8'], ['Violett', '#8a2be2'], ['Magenta', '#ff00a0']
]);

const SEASONS = Object.freeze([
  'Winter', 'Spätwinter', 'Vorfrühling', 'Frühling', 'Frühling', 'Frühsommer',
  'Hochsommer', 'Spätsommer', 'Frühherbst', 'Herbst', 'Spätherbst', 'Winter'
]);

/**
 * Die drei Tonlagen desselben Farbkreises.
 *
 * `lightness: null` heißt: den Originalwert behalten. Nur so bleiben die
 * Regenbogenfarben die Farben, die auf der Verpackung stehen.
 */
const TONE_FAMILIES = Object.freeze({
  rainbow: { label: 'Regenbogen', lightness: null, chroma: null, tone: 'voll · spektral' },
  pastel: { label: 'Pastell', lightness: 0.895, chroma: 0.072, tone: 'zart · pastell' },
  deep: { label: 'Tiefton', lightness: 0.485, chroma: 0.155, tone: 'satt · tief' }
});
export const RAINBOW_FAMILIES = Object.freeze(Object.keys(TONE_FAMILIES));

function parseHex(value) {
  return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
}
function toHex(color) {
  return `#${color.slice(0, 3).map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`;
}

function buildPalette(family, monthIndex) {
  const [baseName, hex] = RAINBOW_HEXES[monthIndex];
  const profile = TONE_FAMILIES[family];
  const [L, C, hue] = labToLch(rgbToOklab([...parseHex(hex), 1]));
  const accent = profile.lightness === null
    ? [...parseHex(hex), 1]
    : oklchToRgb(profile.lightness, profile.chroma, hue);
  const [lightness, chroma] = labToLch(rgbToOklab(accent));
  return Object.freeze({
    month: monthIndex + 1,
    season: SEASONS[monthIndex],
    family: profile.label,
    name: family === 'rainbow' ? baseName : `${baseName} ${profile.label.toLowerCase()}`,
    source: `${profile.label} · zwölf Monate im Spektrum`,
    sourceHex: hex,
    tone: profile.tone,
    mood: profile.label,
    accent,
    accentHex: toHex(accent),
    lightness,
    chroma,
    hue,
    // Der Farbton der Vorlage — er ist über alle drei Systeme derselbe.
    baseLightness: L,
    baseChroma: C
  });
}

export const RAINBOW_PALETTES = Object.freeze(Object.fromEntries(
  RAINBOW_FAMILIES.map(family => [family, Object.freeze(Array.from({ length: 12 }, (_, index) => buildPalette(family, index)))])
));

/** Die Monatsfarbe einer Tonlage — das Jahr spielt hier keine Rolle. */
export function rainbowProfileForDate(year, month, family = 'rainbow') {
  const resolved = TONE_FAMILIES[family] ? family : 'rainbow';
  const monthIndex = positiveMod(Math.trunc(Number(month)) - 1, 12);
  const safeYear = Number.isInteger(Number(year)) ? Number(year) : new Date().getFullYear();
  const palette = RAINBOW_PALETTES[resolved][monthIndex];
  return Object.freeze({
    ...palette,
    year: safeYear,
    key: `${resolved}-${safeYear}-${String(monthIndex + 1).padStart(2, '0')}`
  });
}
