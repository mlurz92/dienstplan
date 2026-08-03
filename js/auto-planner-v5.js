/**
 * Auto-Plan v5 – vollständige Pipeline vom Ausgangsmonat zum zertifizierten Plan.
 *
 * Der Lauf besteht aus vier klar getrennten Stufen:
 *
 * 1. **Konstruktion** (Beam-Suche mit Vorwärts-Checking) erzeugt eine erste
 *    vollständige, regelgeprüfte Belegung.
 * 2. **Iterative Tauschreparatur** glättet grobe Ausreißer.
 * 3. **Perfektionsphase** (Ruin-and-Recreate mit Late-Acceptance-Annahme und
 *    absteigenden Nachbarschaften) arbeitet den eigentlichen Qualitätsvorsprung
 *    heraus und bekommt dafür das gesamte Zeitbudget.
 * 4. **Zertifizierung** prüft am Ende jede Einzelumsetzung und jeden Paartausch
 *    vollständig und weist nach, dass keine dieser Änderungen das Ergebnis noch
 *    verbessert.
 *
 * Über allen Stufen stehen zwei Zusicherungen: Vom Nutzer gesetzte Dienste
 * bleiben unverändert, und keine übernommene Belegung verletzt eine harte Regel
 * oder eine vor dem Lauf festgelegte Obergrenze.
 */

import {
  applyAutoPlanProposal as applyV4Proposal,
  buildAutoPlan as buildV4Plan
} from './auto-planner-v4.js?v=20260803.5';
import {
  assertFixedAssignmentsUntouched,
  emptyOptimizerStats,
  perfect,
  proposedChanges
} from './auto-planner-optimizer.js?v=20260803.5';
import { evaluatePlanObjective } from './auto-planner-engine.js?v=20260803.5';

export * from './auto-planner-v4.js?v=20260803.5';

const OPTIMIZER_REVISION = 5;
const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
};

/**
 * Zeitrahmen und Suchtiefe der Perfektionsphase.
 *
 * Der Zeitrahmen ist die entscheidende Stellgröße: Die Suche nutzt ihn
 * vollständig aus und liefert mit mehr Zeit verlässlich bessere Pläne. Ohne
 * ausdrückliche Angabe richtet er sich nach der gewählten Suchintensität.
 */
export function optimizerDefaults(runConfig) {
  const intensity = runConfig?.searchIntensity;
  const explicitBudget = Number.isFinite(Number(runConfig?.timeBudgetMs));
  const fallbackBudget = intensity === 'maximum' ? 300000 : intensity === 'standard' ? 45000 : 120000;
  const fallbackLate = intensity === 'maximum' ? 800 : intensity === 'standard' ? 150 : 400;
  return {
    /**
     * Ohne ausdrücklichen Zeitrahmen läuft die Perfektionsphase im
     * Konvergenzmodus: Sie steigt vollständig ab und zertifiziert, hört aber
     * auf, sobald nichts mehr zu verbessern ist, statt einen Zeitrahmen
     * auszureizen. Das Studio gibt immer einen Zeitrahmen vor; direkte
     * Aufrufe aus Tests und Integrationen bekommen so ein ebenso geprüftes
     * Ergebnis ohne festen Zeitverbrauch.
     */
    mode: explicitBudget ? 'budget' : 'converge',
    timeBudgetMs: explicitBudget
      ? clampInt(runConfig.timeBudgetMs, 2000, 1800000, fallbackBudget)
      : fallbackBudget,
    lateAcceptanceSize: clampInt(runConfig?.lateAcceptanceSize, 10, 5000, fallbackLate),
    descentInterval: clampInt(runConfig?.descentInterval, 1, 500, intensity === 'standard' ? 40 : 25),
    perfectionEnabled: runConfig?.perfectionEnabled !== false
  };
}

export function optimizerFingerprint(config) {
  return JSON.stringify(stableValue(config));
}

/**
 * Startwert der Perfektionsphase.
 *
 * Abgeleitet wird er aus dem Ausgangsmonat und den Laufparametern. Der
 * zusätzliche Streuwert erlaubt es, denselben Monat mehrfach parallel mit
 * verschiedenen Suchbahnen zu durchsuchen und das beste Ergebnis zu behalten;
 * ohne ihn wären alle Läufe identisch und der Mehrfachstart wertlos.
 */
function seedFor(result, optimizer, runConfig) {
  const salt = Number.isFinite(Number(runConfig?.seedSalt)) ? Number(runConfig.seedSalt) : 0;
  return `${result.baselineFingerprint}|${result.runConfigFingerprint}|${optimizerFingerprint(optimizer)}|${salt}`;
}

function fairnessIndexFrom(objective) {
  if (!objective || objective.audit.gray || objective.unfilled || objective.limitViolations) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function applyObjectiveToResult(state, result, monthData, objective) {
  result.plannedMonth = clone(monthData);
  result.changes = proposedChanges(monthData, result.baseline);
  result.audit = objective.audit.entries.map(entry => ({
    dateIso: entry.dateIso,
    role: entry.role,
    staffId: entry.staffId,
    level: entry.evaluation.level,
    canSelect: entry.evaluation.canSelect,
    confirmationType: entry.evaluation.meta?.confirmationType || null,
    reasons: entry.evaluation.reasons || []
  }));
  result.redViolations = result.audit
    .filter(entry => entry.level === 'red')
    .map(entry => ({ ...entry }));
  result.metrics.proposed = result.changes.length;
  result.metrics.unfilled = objective.unfilled;
  result.metrics.red = objective.audit.red;
  result.metrics.specialRed = objective.audit.specialRed;
  result.metrics.gray = objective.audit.gray;
  result.metrics.orange = objective.audit.orange;
  result.metrics.yellow = objective.audit.yellow;
  result.metrics.wishesFulfilled = objective.wishes.fulfilled;
  result.metrics.wishesPossible = objective.wishes.possible;
  result.metrics.bdTargetPenalty = Number(objective.fairness.bdPenalty.toFixed(2));
  result.metrics.combinedLoadVariance = Number(objective.fairness.combinedVariance.toFixed(3));
  result.metrics.aaHgVariance = Number(objective.fairness.aaHgVariance.toFixed(3));
  result.metrics.weekendVariance = Number(objective.fairness.weekendVariance.toFixed(3));
  result.metrics.fairnessIndex = fairnessIndexFrom(objective);
  result.requiresConfirmation = objective.audit.red > 0;
  result.status = result.requiresConfirmation ? 'confirmation_required' : 'clean';
  return result;
}

/**
 * Legt die lexikografische Zielbewertung des Ergebnisses offen.
 *
 * Mehrere parallel laufende Suchen müssen sich vergleichen lassen, und zwar in
 * genau der Ordnung, nach der auch optimiert wurde. Die Kennzahlen allein
 * genügen dafür nicht: Sie bilden nur die oberen Ebenen ab.
 */
function withObjectiveKey(state, result) {
  if (!result?.plannedMonth || !result?.baseline || !result?.runConfig) return result;
  const objective = evaluatePlanObjective(state, result.plannedMonth, result.baseline, result.runConfig);
  result.objectiveKey = objective.key.map(value => Number(value) || 0);
  return result;
}

function refreshProposalFingerprint(result) {
  result.proposalFingerprint = JSON.stringify(stableValue({
    baselineFingerprint: result.baselineFingerprint,
    runConfigFingerprint: result.runConfigFingerprint,
    iterativeConfigFingerprint: result.iterativeConfigFingerprint,
    changes: result.changes
  }));
  return result;
}

/**
 * Vollständiger Auto-Plan-Lauf.
 *
 * Die Perfektionsphase läuft nur auf einer bereits vollständigen Belegung: Wo
 * keine vollständige, technisch wählbare Lösung existiert, gibt es nichts zu
 * verbessern, und der Befund bleibt unverändert erhalten.
 */
export async function buildAutoPlan(parameters) {
  const constructed = await constructAutoPlan(parameters);
  return perfectAutoPlan({ ...parameters, constructed });
}

/**
 * Erste Hälfte des Laufs: Konstruktion und iterative Tauschreparatur.
 *
 * Getrennt verfügbar, weil mehrere parallele Perfektionsläufe denselben Aufbau
 * verwenden. Ihn in jedem Arbeitsstrang erneut zu berechnen wäre dieselbe
 * Arbeit mehrfach – bei knappen Kernen kostet das mehr, als die zusätzliche
 * Streuung einbringt.
 */
export async function constructAutoPlan(parameters) {
  const runConfig = parameters?.runConfig || null;
  const optimizer = optimizerDefaults(runConfig);

  /**
   * Der Fortschritt darf nie zurückspringen.
   *
   * Die Stufen melden jeweils ihren eigenen Fortschritt von null bis eins und
   * werden auf Abschnitte der Gesamtskala abgebildet. Ohne Sperre erzeugte der
   * Wechsel zwischen zwei Stufen sichtbare Rücksprünge des Balkens.
   */
  let highest = 0;
  const onProgress = parameters?.onProgress
    ? async update => {
      highest = Math.max(highest, Number(update.progress) || 0);
      return parameters.onProgress({ ...update, progress: highest });
    }
    : undefined;

  /**
   * Der Aufbau meldet an seinem Ende „abgeschlossen“. Solange danach noch die
   * Perfektionsphase folgt, wäre das irreführend: Die Anzeige spränge auf
   * fertig und danach wieder zurück. Die Abschlussmeldung des Aufbaus wird
   * deshalb in eine Übergangsmeldung umgedeutet; die einzige echte
   * Abschlussmeldung kommt am Ende dieser Funktion.
   */
  const result = await buildV4Plan({
    ...parameters,
    onProgress: onProgress
      ? async update => {
        const handover = optimizer.perfectionEnabled && (update.phase === 'complete' || update.phase === 'blocked');
        await onProgress({
          ...update,
          phase: handover ? 'polish' : update.phase,
          message: handover ? 'Aufbau abgeschlossen · Perfektionsphase wird vorbereitet' : update.message,
          result: handover ? undefined : update.result,
          progress: Math.min(.55, Number(update.progress || 0) * .55),
          stage: 'aufbau'
        });
      }
      : undefined
  });

  result.optimizerConfig = optimizer;
  result.optimizerConfigFingerprint = optimizerFingerprint(optimizer);
  result.optimizerRevision = OPTIMIZER_REVISION;
  // Damit parallel gestartete Aufbauläufe in derselben Ordnung verglichen
  // werden können, in der auch optimiert wird.
  return withObjectiveKey(parameters.state, result);
}

/**
 * Zweite Hälfte des Laufs: Perfektionsphase und Zertifizierung.
 *
 * Erwartet das Ergebnis des Aufbaus in `constructed`. Ohne vollständige,
 * technisch wählbare Belegung gibt es nichts zu verbessern; der Befund bleibt
 * dann unverändert erhalten.
 */
export async function perfectAutoPlan(parameters) {
  const runConfig = parameters?.runConfig || null;
  const result = parameters.constructed;
  const optimizer = result.optimizerConfig || optimizerDefaults(runConfig);

  let highest = Number(parameters.progressFloor) || 0;
  const onProgress = parameters?.onProgress
    ? async update => {
      highest = Math.max(highest, Number(update.progress) || 0);
      return parameters.onProgress({ ...update, progress: highest });
    }
    : undefined;

  if (!optimizer.perfectionEnabled || !result.complete || !result.changes.length) {
    result.metrics.optimizer = emptyOptimizerStats();
    result.metrics.optimizer.skipped = true;
    return reportCompletion(withObjectiveKey(parameters.state, refreshProposalFingerprint(result)), onProgress);
  }

  const outcome = await perfect({
    state: parameters.state,
    baseline: result.baseline,
    plannedMonth: result.plannedMonth,
    config: result.runConfig,
    allowRed: result.requiresConfirmation,
    timeBudgetMs: optimizer.timeBudgetMs,
    mode: optimizer.mode,
    lateAcceptanceSize: optimizer.lateAcceptanceSize,
    descentInterval: optimizer.descentInterval,
    seed: seedFor(result, optimizer, runConfig),
    onProgress: onProgress
      ? async update => onProgress({ ...update, stage: 'perfektion' })
      : undefined,
    signal: parameters.signal
  });

  assertFixedAssignmentsUntouched(result.baseline, outcome.monthData);

  const before = evaluatePlanObjective(parameters.state, result.plannedMonth, result.baseline, result.runConfig);
  applyObjectiveToResult(parameters.state, result, outcome.monthData, outcome.objective);
  result.metrics.optimizer = outcome.stats;
  result.metrics.optimizer.skipped = Boolean(outcome.skipped);
  result.metrics.qualityBefore = {
    red: before.audit.red,
    orange: before.audit.orange,
    yellow: before.audit.yellow,
    fairnessIndex: fairnessIndexFrom(before),
    wishesFulfilled: before.wishes.fulfilled
  };
  result.certified = Boolean(outcome.stats.certified);
  result.searchProfile = `${result.searchProfile} + Ruin-and-Recreate-Perfektion${outcome.stats.certified ? ' (zertifiziert)' : ''}`;
  return reportCompletion(withObjectiveKey(parameters.state, refreshProposalFingerprint(result)), onProgress);
}

/**
 * Die einzige Abschlussmeldung eines Laufs. Sie kommt erst, wenn wirklich alle
 * Stufen durch sind, und trägt das fertige Ergebnis.
 */
async function reportCompletion(result, onProgress) {
  if (typeof onProgress !== 'function') return result;
  const certified = result.certified ? ' · als nicht weiter verbesserbar zertifiziert' : '';
  await onProgress({
    phase: result.complete ? 'complete' : 'blocked',
    stage: 'abschluss',
    progress: 1,
    message: result.status === 'clean'
      ? `${result.changes.length} Vorschläge · 0 rote Konflikte · Fairness ${result.metrics.fairnessIndex}%${certified}`
      : result.status === 'confirmation_required'
        ? `${result.changes.length} Vorschläge vollständig · ${result.metrics.red} rote Ausnahmen benötigen Bestätigung`
        : `Keine vollständige technisch wählbare Belegung · ${result.metrics.unfilled} Felder offen`,
    improvements: result.metrics.optimizer?.improvements,
    evaluations: result.metrics.optimizer?.evaluations,
    result
  });
  return result;
}

/**
 * Übernahme eines Vorschlags.
 *
 * Zusätzlich zu allen Prüfungen der darunterliegenden Stufen wird der
 * Perfektionsparametersatz gegen seinen Fingerabdruck geprüft und noch einmal
 * ausdrücklich sichergestellt, dass kein gesetzter Dienst berührt wurde.
 */
export function applyAutoPlanProposal(parameters) {
  const proposal = parameters?.proposal;
  if (proposal?.optimizerConfig
    && optimizerFingerprint(proposal.optimizerConfig) !== proposal.optimizerConfigFingerprint) {
    throw new Error('Die Perfektionsparameter des Auto-Plans sind ungültig oder wurden verändert.');
  }
  if (proposal?.baseline && proposal?.plannedMonth) {
    assertFixedAssignmentsUntouched(proposal.baseline, proposal.plannedMonth);
  }
  return applyV4Proposal(parameters);
}
