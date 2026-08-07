/**
 * Ein Ort für die Frage „welche Monatsfarbe gilt gerade?".
 *
 * Die Einfärbung hat mehrere Quellen — Trend-Atlas, die drei Tonlagen des
 * Farbkreises, die klassische Monatspalette, keine —, und bisher kannte jede
 * Schicht nur ihre eigene. Der
 * PDF-Export etwa griff immer zum Trend-Atlas und druckte damit eine Farbe, die
 * auf dem Bildschirm gar nicht zu sehen war. Wer die sichtbare Farbe braucht,
 * fragt hier.
 */
import { colorProfileForDate, spectrumVariables } from './color-atlas-engine.js?v=20260806.1';
import { RAINBOW_FAMILIES, rainbowProfileForDate } from './color-rainbow.js?v=20260806.1';
import { paletteForDate, paletteVariables } from './theme.js?v=20260806.1';

export const MONTH_COLOR_MODES = Object.freeze(['spectrum', ...RAINBOW_FAMILIES, 'classic', 'neutral']);
export const DEFAULT_MONTH_COLOR_MODE = 'spectrum';

/** Der Grundton des Stylesheets — er steht, wenn keine Monatsfarbe gesetzt wird. */
const NEUTRAL_ACCENT = Object.freeze([79, 143, 189, 1]);

export function normalizeMonthColorMode(mode) {
  return MONTH_COLOR_MODES.includes(mode) ? mode : DEFAULT_MONTH_COLOR_MODE;
}

/** Das eingestellte Farbsystem, wie es an der Wurzel steht. */
export function activeMonthColorMode() {
  if (typeof document === 'undefined') return DEFAULT_MONTH_COLOR_MODE;
  return normalizeMonthColorMode(document.documentElement?.dataset?.monthColors);
}

/**
 * Die Monatsfarbe eines Modus — Palette und fertige Farbtoken in einem.
 *
 * Die Token entstehen bewusst über denselben Weg wie auf dem Bildschirm:
 * `spectrumVariables` für Trend-Atlas, Farbkreis und den neutralen Grundton,
 * `paletteVariables` für die klassische Palette.
 */
export function monthColorProfile(year, month, mode = activeMonthColorMode(), { scheme = 'light' } = {}) {
  const resolved = normalizeMonthColorMode(mode);
  if (resolved === 'classic') {
    const palette = paletteForDate(year, month);
    return { mode: resolved, palette, name: palette.name, variables: paletteVariables(palette) };
  }
  if (resolved === 'neutral') {
    const palette = Object.freeze({ year, month, name: 'Neutral', accent: NEUTRAL_ACCENT });
    return { mode: resolved, palette, name: palette.name, variables: spectrumVariables(palette, { scheme }) };
  }
  const palette = resolved === 'spectrum'
    ? colorProfileForDate(year, month)
    : rainbowProfileForDate(year, month, resolved);
  return { mode: resolved, palette, name: palette.name, variables: spectrumVariables(palette, { scheme }) };
}
