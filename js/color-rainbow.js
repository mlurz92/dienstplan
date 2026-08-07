/**
 * Regenbogen — die zwölf Monate als geschlossener Farbkreis.
 *
 * Anders als der Trend-Atlas ist hier nichts gesucht und nichts gewichtet: Der
 * Januar beginnt beim Rot, jeder Folgemonat rückt um genau ein Zwölftel des
 * Farbkreises weiter, der Dezember schließt vor dem Rot wieder auf. Die Folge
 * ist damit jahresunabhängig — dieselbe Farbe steht in jedem Jahr für denselben
 * Monat, was diese Palette gerade für den Ausdruck brauchbar macht.
 *
 * Helligkeit und Buntheit werden bewusst nicht je Farbton nachgeregelt: Der
 * Abstand zwischen den Monaten soll allein aus dem Farbton kommen. Die
 * Gamut-Anpassung in `oklchToRgb` nimmt die Buntheit dort zurück, wo sRGB sie
 * nicht trägt — Gelb und Grün werden dadurch etwas ruhiger als Blau, der
 * gleichmäßige Schritt im Farbton bleibt erhalten.
 */
import { labToLch, oklchToRgb, rgbToOklab } from './color-atlas-engine.js?v=20260806.1';

const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;

/** Der Rotton des Januars — der Anfang des Kreises, in Grad auf dem OkLCh-Rad. */
const RAINBOW_START_HUE = 29;
const RAINBOW_LIGHTNESS = 0.72;
const RAINBOW_CHROMA = 0.165;

const RAINBOW_NAMES = Object.freeze([
  'Rot', 'Orange', 'Gold', 'Limette', 'Grün', 'Smaragd',
  'Türkis', 'Azur', 'Blau', 'Violett', 'Magenta', 'Rosa'
]);

const SEASONS = Object.freeze([
  'Winter', 'Spätwinter', 'Vorfrühling', 'Frühling', 'Frühling', 'Frühsommer',
  'Hochsommer', 'Spätsommer', 'Frühherbst', 'Herbst', 'Spätherbst', 'Winter'
]);

function toHex(color) {
  return `#${color.slice(0, 3).map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`;
}

function buildRainbowPalette(monthIndex) {
  const hueDegrees = positiveMod(RAINBOW_START_HUE + monthIndex * 30, 360);
  const accent = oklchToRgb(RAINBOW_LIGHTNESS, RAINBOW_CHROMA, hueDegrees * Math.PI / 180);
  const [lightness, chroma, hue] = labToLch(rgbToOklab(accent));
  return Object.freeze({
    month: monthIndex + 1,
    season: SEASONS[monthIndex],
    family: 'Regenbogen',
    name: RAINBOW_NAMES[monthIndex],
    source: 'Regenbogen · zwölf gleiche Schritte auf dem Farbkreis',
    sourceHex: null,
    tone: `${Math.round(hueDegrees)}° · Farbkreis`,
    mood: 'Regenbogen',
    accent,
    accentHex: toHex(accent),
    lightness,
    chroma,
    hue
  });
}

export const RAINBOW_PALETTES = Object.freeze(Array.from({ length: 12 }, (_, index) => buildRainbowPalette(index)));

/** Die Monatsfarbe des Regenbogens — das Jahr spielt hier keine Rolle. */
export function rainbowProfileForDate(year, month) {
  const monthIndex = positiveMod(Math.trunc(Number(month)) - 1, 12);
  const safeYear = Number.isInteger(Number(year)) ? Number(year) : new Date().getFullYear();
  const palette = RAINBOW_PALETTES[monthIndex];
  return Object.freeze({
    ...palette,
    year: safeYear,
    key: `rainbow-${safeYear}-${String(monthIndex + 1).padStart(2, '0')}`
  });
}
