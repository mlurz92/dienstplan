/**
 * Rechenkern des Auto-Plans als eigener Arbeitsstrang.
 *
 * Der Lauf wandert vollständig aus dem Anzeigestrang heraus. Das hält
 * Fortschritt, Animation und Abbruch im Hauptthread reaktionsfähig und gibt der
 * Suche im Worker die vollständige Rechenzeit.
 *
 * Der Worker importiert bewusst die interne v9.5-Pipeline statt des öffentlichen
 * Runtime-Adapters: Die fachliche Pipeline meldet Zwischenstände, der Runner
 * veröffentlicht nach der abschließenden `done`-Nachricht genau einen
 * terminalen Ergebniszustand. So existiert im UI kein doppeltes `complete`.
 */

import { constructAutoPlan, perfectAutoPlan } from './auto-planner-v9-5.js?v=20260805.1';

/**
 * Fortschrittsmeldungen tragen am Ende teilweise das vollständige Ergebnis.
 * Über die Workergrenze wäre das eine unnötige zweite Kopie des gesamten
 * Monats; die `constructed`- beziehungsweise `done`-Nachricht liefert es einmal.
 */
function withoutResult(update) {
  if (!update || update.result === undefined) return update;
  const { result: _ignored, ...rest } = update;
  return rest;
}

function nonTerminalReport(runId) {
  return update => {
    if (update?.phase === 'complete' || update?.phase === 'blocked') return;
    self.postMessage({ type: 'progress', runId, update: withoutResult(update) });
  };
}

/**
 * Zwei Aufträge, die der Anzeigestrang getrennt vergibt:
 *
 * - `construct` baut den Monat einmal mit dem v8.5-Heuristikportfolio auf;
 * - `perfect` verbessert den Gewinner. Nur der führende Strang startet den
 *   globalen Boolean-CP-SAT-/LNS-Pfad, weitere Stränge bleiben diversifizierte
 *   Heuristikläufe.
 */
self.addEventListener('message', async event => {
  const request = event.data;
  if (!request) return;
  const { type, runId, state, monthData, year, month, runConfig, constructed, progressFloor } = request;
  const report = nonTerminalReport(runId);

  try {
    if (type === 'construct') {
      const result = await constructAutoPlan({ state, monthData, year, month, runConfig, onProgress: report });
      self.postMessage({ type: 'constructed', runId, result });
      return;
    }
    if (type === 'perfect') {
      const result = await perfectAutoPlan({ state, runConfig, constructed, progressFloor, onProgress: report });
      self.postMessage({ type: 'done', runId, result });
      return;
    }
    throw new Error(`Unbekannter Auftrag "${String(type)}"`);
  } catch (error) {
    self.postMessage({
      type: 'error',
      runId,
      name: error?.name || 'Error',
      message: error?.message || 'Auto-Plan fehlgeschlagen'
    });
  }
});
