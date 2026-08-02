import { applySpectrumProfile } from './color-director.js?v=20260801.11';

/**
 * Stabilisiert den sichtbaren Monatswechsel als atomaren UI-Schritt.
 *
 * app.js rendert den neuen Monat sofort und setzt anschließend Metadaten des
 * Basisthemes. Der Seasonal Spectrum Director reagiert ebenfalls auf Auswahl-
 * und Metadatenänderungen. Ohne Koordination können dadurch zwei Farbübergänge
 * sowie eine Einblendanimation gleichzeitig starten. Dieses Modul beendet jede
 * noch laufende Spektruminterpolation innerhalb desselben Ereigniszyklus und
 * schreibt genau das endgültige Profil des ausgewählten Monats.
 */

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

export function settleMonthSpectrum() {
  if (typeof document === 'undefined') return null;
  const { year, month } = selectedDate();
  const palette = applySpectrumProfile(year, month, { animate: false });
  document.documentElement.dataset.monthTransition = 'atomic-spectrum-v1';
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
  // noch vor dem nächsten Paint; ein eventuell erneut gestarteter rAF-Verlauf
  // wird deshalb ebenfalls ohne sichtbaren Zwischenframe beendet.
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
