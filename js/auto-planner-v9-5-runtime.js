/**
 * Öffentlicher Laufzeitvertrag für Auto-Plan v9.5.
 *
 * Die darunterliegende v8.5-Perfektion besitzt aus Kompatibilitätsgründen eine
 * eigene Abschlussmeldung. v9.5 führt danach jedoch noch Boolean-Modellbau,
 * CP-SAT, LNS, Audit und Alternativen aus. Dieser Adapter unterdrückt deshalb
 * ausschließlich vorzeitige terminale Meldungen und veröffentlicht nach der
 * gesamten Pipeline genau einen finalen Zustand.
 */

import * as V95 from './auto-planner-v9-5.js?v=20260805.1';

export * from './auto-planner-v9-5.js?v=20260805.1';

function isTerminal(update) {
  return update?.phase === 'complete' || update?.phase === 'blocked';
}

function relayWithoutTerminal(onProgress) {
  if (typeof onProgress !== 'function') return null;
  return update => isTerminal(update) ? undefined : onProgress(update);
}

async function reportTerminal(onProgress, result) {
  if (typeof onProgress !== 'function') return;
  const complete = Boolean(result?.complete);
  await onProgress({
    phase: complete ? 'complete' : 'blocked',
    stage: 'abschluss-v9.5',
    progress: 1,
    message: complete
      ? `v9.5 abgeschlossen · ${result?.changes?.length || 0} Vorschläge · ${result?.metrics?.red || 0} rot · ${result?.metrics?.certification?.proven ? 'Modellnachweis erbracht' : 'bester regelgeprüfter Stand'}`
      : `v9.5 blockiert · ${result?.metrics?.unfilled || 0} Felder offen`,
    result
  });
}

export async function perfectAutoPlan(parameters) {
  const result = await V95.perfectAutoPlan({
    ...parameters,
    onProgress: relayWithoutTerminal(parameters?.onProgress)
  });
  await reportTerminal(parameters?.onProgress, result);
  return result;
}

export async function buildAutoPlan(parameters) {
  const constructed = await V95.constructAutoPlan({
    ...parameters,
    onProgress: relayWithoutTerminal(parameters?.onProgress)
  });
  if (parameters?.signal?.aborted) return constructed;
  return perfectAutoPlan({ ...parameters, constructed });
}
