import { applyMonthTheme } from './theme.js?v=20260801.11';
import { applySpectrumProfile } from './color-director.js?v=20260801.11';

/**
 * Führt die konkurrierenden Farbsignale eines Monatswechsels zu genau einem
 * flüssigen Verlauf zusammen.
 *
 * app.js rendert den neuen Monat sofort und startet zusätzlich einen eigenen
 * rAF-Verlauf des Basisthemes. Der Seasonal Spectrum Director beschreibt
 * dieselben CSS-Variablen. Ohne Koordination würden beide Pfade nacheinander
 * sichtbar und der Wechsel wirkte sprunghaft.
 *
 * Reihenfolge pro Wechsel:
 * 1. Das Basistheme wird ohne eigene Animation gesetzt. Damit endet dessen
 *    privater rAF-Handle sofort und es entsteht kein zweiter Verlauf.
 * 2. Der Spectrum Director übernimmt als alleiniger Eigentümer der sichtbaren
 *    Farbe und interpoliert in OKLCH bis zum Zielprofil. Er schreibt mit
 *    `important` und gewinnt dadurch in jedem Frame gegen das Basistheme.
 *
 * Eine kurze Paint-Barriere wiederholt diesen Abschluss über wenige Frames.
 * Sie kann den Verlauf nicht neu starten: Der Director erkennt ein bereits
 * laufendes Ziel und bleibt in diesem Fall wirkungslos. Die idempotente
 * Monatsschlüssel-Sperre verhindert zusätzlich, dass die selbst gesetzten
 * data-month-/data-year-Attribute den Observer erneut auslösen.
 */

const PAINT_GUARD_FRAMES = 4;

function selectedDate() {
  const root = document.documentElement;
  const year = Number(document.getElementById('yearSelect')?.value)
    || Number(root.dataset.year)
    || new Date().getFullYear();
  const month = Number(document.getElementById('monthSelect')?.value)
    || Number(root.dataset.month)
    || new Date().getMonth() + 1;
  return { year, month };
}

function monthKey({ year, month }) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

let lastSettledKey = null;

function writeFinalSpectrum() {
  const date = selectedDate();
  const { year, month } = date;

  // Wichtig: Reihenfolge beibehalten. Der animationsfreie Basistheme-Aufruf
  // beendet dessen eventuell laufende rAF-Interpolation; anschließend besitzt
  // der Spectrum Director als einziger Schreiber mit `important` die sichtbare
  // Priorität und fährt den Zielton als durchgehenden Verlauf an.
  applyMonthTheme(month, { animate: false, year });
  const palette = applySpectrumProfile(year, month, { animate: true });

  lastSettledKey = monthKey(date);
  document.documentElement.dataset.monthTransition = 'fluid-spectrum-v1';
  return palette;
}

let paintGuardHandle = null;
let paintGuardGeneration = 0;

function startPaintGuard() {
  if (typeof requestAnimationFrame !== 'function') return;

  paintGuardGeneration += 1;
  const generation = paintGuardGeneration;
  let remaining = PAINT_GUARD_FRAMES;

  if (paintGuardHandle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(paintGuardHandle);
    paintGuardHandle = null;
  }

  const reinforce = () => {
    if (generation !== paintGuardGeneration) return;
    writeFinalSpectrum();
    remaining -= 1;
    if (remaining > 0) paintGuardHandle = requestAnimationFrame(reinforce);
    else paintGuardHandle = null;
  };

  paintGuardHandle = requestAnimationFrame(reinforce);
}

export function settleMonthSpectrum() {
  if (typeof document === 'undefined') return null;
  const palette = writeFinalSpectrum();
  startPaintGuard();
  return palette;
}

let synchronizationQueued = false;

function queueSettlement() {
  const requestedKey = monthKey(selectedDate());

  // applyMonthTheme schreibt seine Metadaten auch bei identischem Ziel erneut.
  // Der Observer darf diese selbst verursachte Mutation nicht als neuen Wechsel
  // interpretieren, sonst entstünde eine endlose Microtask-/rAF-Schleife.
  if (requestedKey === lastSettledKey || synchronizationQueued) return;

  synchronizationQueued = true;
  queueMicrotask(() => {
    synchronizationQueued = false;
    if (monthKey(selectedDate()) === lastSettledKey) return;
    settleMonthSpectrum();
  });
}

function initializeMonthTransitionStability() {
  settleMonthSpectrum();

  // Die Listener werden nach app.js und color-director.js registriert. Damit
  // schließen sie denselben change-Event synchron mit dem finalen Farbprofil
  // ab, bevor der Browser einen Zwischenzustand zeichnen kann.
  document.getElementById('monthSelect')?.addEventListener('change', settleMonthSpectrum);
  document.getElementById('yearSelect')?.addEventListener('change', settleMonthSpectrum);

  // applyMonthTheme aktualisiert data-month/data-year. MutationObserver laufen
  // noch vor dem nächsten Paint und beenden dadurch auch später gestartete
  // Basistheme- oder Spektrumverläufe ohne sichtbaren Zwischenframe. Die
  // Monatsschlüssel-Sperre filtert anschließend die eigenen Metadatenmutationen.
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(queueSettlement);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-month', 'data-year']
    });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMonthTransitionStability, { once: true });
  } else {
    initializeMonthTransitionStability();
  }
}
