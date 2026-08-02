import { applyMonthTheme } from './theme.js?v=20260801.11';
import { applySpectrumProfile } from './color-director.js?v=20260801.11';

/**
 * Stabilisiert den sichtbaren Monatswechsel als atomaren UI-Schritt.
 *
 * app.js rendert den neuen Monat sofort und startet historisch zusätzlich einen
 * rAF-Verlauf des Basisthemes. Der Seasonal Spectrum Director schreibt dieselben
 * CSS-Variablen mit dem endgültigen Spektrumprofil. Ohne Koordination können
 * deshalb Basistheme, Spektrum und Inhaltsanimation nacheinander sichtbar werden.
 *
 * Dieses Modul beendet beide Farbpfade synchron: Zuerst wird das Basistheme ohne
 * Animation auf den Zielmonat gesetzt. Dadurch wird dessen privater rAF-Handle
 * abgebrochen. Unmittelbar danach schreibt der Spectrum Director ebenfalls ohne
 * Animation den endgültigen, priorisierten Zielzustand. Zwischen diesen beiden
 * synchronen Schritten kann der Browser keinen Frame zeichnen.
 *
 * Eine kurze Paint-Barriere wiederholt denselben Abschluss über wenige Frames.
 * Damit gewinnt der identische Endzustand auch dann zuverlässig, wenn ein bereits
 * registrierter Observer oder rAF-Callback später im selben Zyklus erneut schreibt.
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

function writeFinalSpectrum() {
  const { year, month } = selectedDate();

  // Wichtig: Reihenfolge beibehalten. Der atomare Basistheme-Aufruf beendet
  // dessen eventuell laufende rAF-Interpolation; anschließend besitzt das
  // Spektrumprofil als letzter synchroner Schreibvorgang die sichtbare Priorität.
  applyMonthTheme(month, { animate: false, year });
  const palette = applySpectrumProfile(year, month, { animate: false });

  document.documentElement.dataset.monthTransition = 'atomic-spectrum-v1';
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
  if (synchronizationQueued) return;
  synchronizationQueued = true;
  queueMicrotask(() => {
    synchronizationQueued = false;
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
  // Basistheme- oder Spektrumverläufe ohne sichtbaren Zwischenframe.
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
