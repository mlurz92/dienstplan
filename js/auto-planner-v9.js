/**
 * Auto-Plan v9 – kostenlose Hybridengine für Cloudflare Pages.
 *
 * v9 verbindet die bewährte v8.5-Portfolio-/ALNS-Engine mit einer exakten,
 * zeitbegrenzten Constraint-Tiefensuche im Browser. Der Worker bleibt die
 * Recheneinheit, der KV-Worker bleibt unverändert reine Persistenz. Externe
 * Solver, Container, Durable Objects und kostenpflichtige Dienste sind nicht
 * erforderlich.
 */

import * as V85 from './auto-planner-v8-5.js?v=20260804.9';
import {
  compareObjectiveKeys,
  evaluatePlanObjective,
  normalizeAutoPlanConfig
} from './auto-planner-engine.js?v=20260804.9';
import {
  solveExactly as enumerateExactSearch,
  V9_SOLVER_STATUSES
} from './auto-planner-v9-exact.js?v=20260804.9';

export * from './auto-planner-v8-5.js?v=20260804.9';
export { V9_SOLVER_STATUSES } from './auto-planner-v9-exact.js?v=20260804.9';

export const AUTO_PLAN_REVISION = 9;
export const AUTO_PLAN_ENGINE_ID = 'v9-free-hybrid-exact-browser';
export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'analysis', title: 'Fixpunkte und Domänen', detail: 'Fixpunkte, Laufgrenzen, Qualifikationen, Wünsche und der unveränderliche Monatssnapshot werden katalogisiert.' }),
  Object.freeze({ id: 'construct', title: 'Constraint-Konstruktion', detail: 'Das v8.5-Profilportfolio erzeugt mehrere vollständige Startlösungen mit MRV und Vorwärts-Checking.' }),
  Object.freeze({ id: 'rescue', title: 'Null-Rot-Intensivierung', detail: 'Strikte Eskalationswellen verbreitern Suchstrahl, Kandidatenfächer und Restbacktracking vor jedem Rot-Fallback.' }),
  Object.freeze({ id: 'repair', title: 'Iterative Tauschreparatur', detail: 'Einzelzüge, Paare, Dreierketten, Tagespakete und lokale Neuplanung beseitigen strukturelle Schwächen.' }),
  Object.freeze({ id: 'perfect', title: 'Adaptive ALNS-Perfektion', detail: 'Diversifizierte Ruin-and-Recreate-Stränge lernen geeignete Zerstörungs- und Reparaturoperatoren.' }),
  Object.freeze({ id: 'exact', title: 'Exakte Constraint-Tiefensuche', detail: 'Eine verlustfreie MRV-Tiefensuche prüft den globalen Suchraum bis zum Zeit- oder Knotenlimit.' }),
  Object.freeze({ id: 'certify', title: 'Unabhängiger Schlussaudit', detail: 'Regelengine, Laufgrenzen, Fixpunkte und Solverstatus werden vor der Vorschau vollständig und wahrheitsgetreu geprüft.' })
]);

const MODES = new Set(['fast', 'hybrid', 'exact', 'diagnose']);
const TARGETS = new Set(['first-feasible', 'high-quality', 'best-within-budget', 'prove-optimal']);
const TARGET_NODE_FACTOR = Object.freeze({
  'first-feasible': .25,
  'high-quality': .65,
  'best-within-budget': 1,
  'prove-optimal': 2
});

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
};

function bridgedPreferences(source) {
  const match = /^v9:(fast|hybrid|exact|diagnose):(first-feasible|high-quality|best-within-budget|prove-optimal)$/.exec(String(source?.performanceProfile || ''));
  return match ? { solverMode: match[1], proofTarget: match[2] } : {};
}

function hasFiniteValue(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
}

function exactBudgetShare(solverMode, proofTarget) {
  if (solverMode === 'fast') return 0;
  const base = solverMode === 'exact' ? .68 : solverMode === 'diagnose' ? .82 : .38;
  if (proofTarget === 'first-feasible') return Math.min(base, .32);
  if (proofTarget === 'high-quality') return Math.max(.20, base * .72);
  if (proofTarget === 'prove-optimal') {
    if (solverMode === 'diagnose') return .90;
    if (solverMode === 'exact') return .84;
    return Math.max(base, .62);
  }
  return base;
}

export function deriveV9Tuning(source = {}) {
  const bridged = bridgedPreferences(source);
  // Direkte/ältere API-Aufrufe ohne expliziten v9-Vertrag behalten das schnelle
  // v8.5-Verhalten. Das Studio schreibt vor jedem Start bewusst seinen
  // standardmäßigen Hybridvertrag in `performanceProfile`.
  const solverMode = MODES.has(source.solverMode) ? source.solverMode : bridged.solverMode || 'fast';
  const proofTarget = TARGETS.has(source.proofTarget) ? source.proofTarget : bridged.proofTarget || 'best-within-budget';
  const hasExplicitTimeBudget = hasFiniteValue(source.timeBudgetMs);
  const totalBudgetMs = clamp(source.timeBudgetMs, 10_000, 900_000, 120_000);
  const exactShare = exactBudgetShare(solverMode, proofTarget);
  const explicitExactMs = Number(source.exactTimeBudgetMs);
  const exactTimeBudgetMs = exactShare === 0 ? 0 : clamp(
    Number.isFinite(explicitExactMs) ? explicitExactMs : totalBudgetMs * exactShare,
    2_000,
    600_000,
    Math.round(totalBudgetMs * exactShare)
  );
  const heuristicTimeBudgetMs = Math.max(2_000, totalBudgetMs - exactTimeBudgetMs);
  const baseNodeLimit = solverMode === 'exact' || solverMode === 'diagnose' ? 3_000_000 : 1_200_000;
  const targetNodeLimit = Math.round(baseNodeLimit * TARGET_NODE_FACTOR[proofTarget]);
  const exactNodeLimit = clamp(source.exactNodeLimit, 10_000, 20_000_000, targetNodeLimit);
  return {
    solverMode,
    proofTarget,
    totalBudgetMs,
    heuristicTimeBudgetMs,
    exactTimeBudgetMs,
    exactNodeLimit,
    exactEnabled: exactShare > 0,
    exactShare,
    hasExplicitTimeBudget,
    stopAtFirstFeasible: proofTarget === 'first-feasible',
    forceStrict: solverMode === 'diagnose'
  };
}

function settingsOf(parameters) {
  return {
    ...(parameters?.state?.settings?.autoPlan || {}),
    ...(parameters?.runConfig || {})
  };
}

function heuristicConfigFor(parameters, tuning) {
  const config = {
    ...(parameters.runConfig || {}),
    // Solange die exakte Suche die strikte Unlösbarkeit nicht bewiesen hat,
    // darf auch der Heuristik-Incumbent keinen roten Fallback vorwegnehmen.
    allowRedFallback: tuning.exactEnabled || tuning.forceStrict
      ? false
      : parameters.runConfig?.allowRedFallback
  };
  // Die bloße Existenz der v9-Schicht darf den deterministischen
  // Konvergenzmodus älterer direkter API-Aufrufe nicht in einen zeitabhängigen
  // Budgetmodus verwandeln. Nur ein ausdrücklich geliefertes Budget oder ein
  // tatsächlich aktiver exakter v9-Lauf teilt den Zeitrahmen auf.
  if (tuning.exactEnabled || tuning.hasExplicitTimeBudget) config.timeBudgetMs = tuning.heuristicTimeBudgetMs;
  else delete config.timeBudgetMs;
  return config;
}

function objectiveFor(result, state, config) {
  if (!result?.plannedMonth || !result?.baseline) return null;
  return evaluatePlanObjective(state, result.plannedMonth, result.baseline, normalizeAutoPlanConfig(state, result.baseline, config));
}

function betterResult(candidate, incumbent, state, config) {
  if (!candidate) return incumbent;
  if (!incumbent) return candidate;
  if (candidate.complete !== incumbent.complete) return candidate.complete ? candidate : incumbent;
  const left = objectiveFor(candidate, state, config);
  const right = objectiveFor(incumbent, state, config);
  if (!left) return incumbent;
  if (!right) return candidate;
  return compareObjectiveKeys(left.key, right.key) < 0 ? candidate : incumbent;
}

function normalizeSearchIdentity(search, overrides = {}) {
  return {
    ...(search || {}),
    solver: 'native-js-exact-mrv-dfs',
    ...overrides
  };
}

function attachSearch(result, search, allowRed) {
  if (!result) return null;
  result.searchProfile = `v9-${search.mode}-${allowRed ? 'minimal-red' : 'strict'}`;
  result.metrics ||= {};
  result.metrics.exactSearch = { ...search };
  return result;
}

/**
 * Verlustfreier strikter Suchvertrag.
 *
 * Rote Bewertungen können von noch offenen, später erfüllbaren Kopplungen
 * abhängen. Würden solche Kandidaten bereits im Teilzustand entfernt, wäre ein
 * späterer INFEASIBLE- oder OPTIMAL-Nachweis nicht global belastbar. Die rohe
 * Tiefensuche enumeriert deshalb auch rote Zwischenzweige. Da Rot in der
 * lexikografischen Zielfunktion vor allen weichen Zielen steht, ist ihr global
 * bestes vollständiges Ergebnis automatisch Null-Rot, sofern ein solches
 * existiert. Erst an dieser vollständigen Lösung wird der strikte Status
 * abgeleitet.
 */
export async function solveExactly(parameters) {
  const requireZeroRed = parameters?.allowRed !== true;
  const firstTargetRequested = Boolean(parameters?.stopAtFirstFeasible);
  const raw = await enumerateExactSearch({
    ...parameters,
    allowRed: true,
    // Bei einem strikten Lauf ist eine rote Komplettbelegung noch nicht das
    // angeforderte Ziel. Der rohe Enumerator stoppt dann ausschließlich bei der
    // ersten vollständig auditierten Null-Rot-Lösung.
    stopAtFirstFeasible: !requireZeroRed && firstTargetRequested,
    stopAtFirstZeroRed: requireZeroRed && firstTargetRequested
  });
  const relaxedSearch = normalizeSearchIdentity(raw.search, { allowRed: true });
  const relaxedResult = attachSearch(raw.result, relaxedSearch, true);

  if (!requireZeroRed) {
    return {
      ...raw,
      search: relaxedSearch,
      result: relaxedResult
    };
  }

  const bestRed = Number(raw.bestObjective?.audit?.red || 0);
  if (raw.bestMonth && bestRed === 0) {
    const strictSearch = normalizeSearchIdentity(raw.search, { allowRed: false });
    return {
      ...raw,
      search: strictSearch,
      result: attachSearch(raw.result, strictSearch, false)
    };
  }

  const solverStatus = raw.completeSearch
    ? V9_SOLVER_STATUSES.INFEASIBLE
    : V9_SOLVER_STATUSES.UNKNOWN;
  const strictSearch = normalizeSearchIdentity(raw.search, {
    solverStatus,
    allowRed: false,
    relaxedCandidateAvailable: Boolean(relaxedResult),
    relaxedCandidateRed: relaxedResult ? Number(relaxedResult.metrics?.red || 0) : null
  });
  return {
    ...raw,
    solverStatus,
    search: strictSearch,
    result: null,
    bestMonth: null,
    bestObjective: null,
    relaxedResult,
    relaxedObjective: raw.bestObjective,
    relaxedSearch
  };
}

/**
 * Die v8.5-Perfektion betrachtet ihren Incumbent zu Recht als eigenes
 * Endergebnis und meldet deshalb intern `complete` oder `blocked`. Innerhalb der
 * v9-Pipeline folgt danach jedoch noch die exakte Suche. Die Ereignisse werden
 * daher in den reservierten Perfektionsbereich 55–80 % abgebildet und als
 * nichtterminal markiert. So kann weder die sichtbare Prozentanzeige noch ihr
 * ARIA-Wert von 96 % auf 82 % zurückspringen.
 */
export function mapHeuristicProgress(onProgress, { floor = .55, ceiling = .80 } = {}) {
  if (typeof onProgress !== 'function') return undefined;
  const lower = Math.max(0, Math.min(1, Number(floor) || 0));
  const upper = Math.max(lower, Math.min(1, Number(ceiling) || lower));
  let lastProgress = lower;
  return update => {
    const raw = Math.max(0, Math.min(1, Number(update?.progress) || 0));
    const terminal = update?.phase === 'complete' || update?.phase === 'blocked';
    const mapped = terminal ? upper : lower + raw * (upper - lower);
    lastProgress = Math.max(lastProgress, Math.min(upper, mapped));
    return onProgress({
      ...update,
      phase: terminal ? 'perfect' : update?.phase,
      stage: terminal ? 'incumbent-ready' : update?.stage,
      progress: lastProgress,
      heuristicTerminal: terminal,
      message: terminal
        ? 'v8.5-Incumbent abgeschlossen · exakte v9-Prüfung folgt'
        : update?.message
    });
  };
}

function annotate(result, parameters, tuning, exact = null) {
  if (!result) return result;
  const objective = objectiveFor(result, parameters.state, parameters.runConfig);
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.objectiveKey = objective?.key ? [...objective.key] : result.objectiveKey;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  result.metrics.engineFamily = 'free-browser-hybrid';
  result.metrics.costModel = 'zero-recurring-cost';
  result.metrics.solverMode = tuning.solverMode;
  result.metrics.proofTarget = tuning.proofTarget;
  result.metrics.v9Budget = {
    totalMs: tuning.exactEnabled || tuning.hasExplicitTimeBudget ? tuning.totalBudgetMs : null,
    heuristicMs: tuning.exactEnabled || tuning.hasExplicitTimeBudget ? tuning.heuristicTimeBudgetMs : null,
    exactMs: tuning.exactTimeBudgetMs,
    exactShare: tuning.exactShare,
    exactNodeLimit: tuning.exactNodeLimit
  };

  const exactStatus = exact?.solverStatus || null;
  const relaxedProof = Boolean(exact?.search?.allowRed);
  const overallStatus = exactStatus === V9_SOLVER_STATUSES.OPTIMAL
    ? V9_SOLVER_STATUSES.OPTIMAL
    : exactStatus === V9_SOLVER_STATUSES.INFEASIBLE && !result.complete
      ? V9_SOLVER_STATUSES.INFEASIBLE
      : result.complete
        ? V9_SOLVER_STATUSES.FEASIBLE
        : exactStatus || V9_SOLVER_STATUSES.UNKNOWN;
  result.metrics.solverStatus = overallStatus;
  result.metrics.exactSearch = exact?.search || result.metrics.exactSearch || null;
  result.metrics.proof = {
    status: overallStatus,
    exactAttempted: Boolean(exact),
    globalSearchComplete: Boolean(exact?.completeSearch),
    relaxed: relaxedProof,
    scope: exact?.completeSearch
      ? relaxedProof ? 'global-relaxed' : 'global-strict'
      : result.complete ? 'feasible-incumbent' : 'unresolved',
    truthfulLabel: overallStatus === V9_SOLVER_STATUSES.OPTIMAL
      ? relaxedProof ? 'Globales Minimal-Rot-Optimum bewiesen' : 'Globales Null-Rot-Optimum bewiesen'
      : overallStatus === V9_SOLVER_STATUSES.INFEASIBLE
        ? 'Unlösbarkeit bewiesen'
        : overallStatus === V9_SOLVER_STATUSES.FEASIBLE
          ? 'Zulässige Lösung, Optimum nicht bewiesen'
          : 'Zeit-/Knotenlimit ohne vollständigen Nachweis'
  };
  result.metrics.phaseContract = {
    mandatory: AUTO_PLAN_STAGES.map(stage => stage.id),
    exactEnabled: tuning.exactEnabled,
    exactAttempted: Boolean(exact),
    certificationEnabled: true
  };
  result.v9RunConfig = {
    solverMode: tuning.solverMode,
    proofTarget: tuning.proofTarget,
    exactTimeBudgetMs: tuning.exactTimeBudgetMs,
    exactNodeLimit: tuning.exactNodeLimit
  };
  return result;
}

export async function constructAutoPlan(parameters) {
  const tuning = deriveV9Tuning(settingsOf(parameters));
  const runConfig = heuristicConfigFor(parameters, tuning);
  const result = await V85.constructAutoPlan({ ...parameters, runConfig });
  return annotate(result, { ...parameters, runConfig }, tuning);
}

export async function perfectAutoPlan(parameters) {
  const tuning = deriveV9Tuning(settingsOf(parameters));
  const heuristicConfig = heuristicConfigFor(parameters, tuning);
  const heuristicProgress = tuning.exactEnabled && Number(parameters.runConfig?.portfolioVariant || 0) === 0
    ? mapHeuristicProgress(parameters.onProgress)
    : parameters.onProgress;
  let incumbent = await V85.perfectAutoPlan({
    ...parameters,
    runConfig: heuristicConfig,
    onProgress: heuristicProgress
  });
  incumbent = annotate(incumbent, { ...parameters, runConfig: heuristicConfig }, tuning);

  // Nur der erste Perfektionsstrang führt die exakte Suche aus. Weitere
  // Portfolio-Worker liefern weiterhin diversifizierte ALNS-Incumbents, ohne
  // denselben globalen Suchraum mehrfach zu enumerieren.
  const portfolioVariant = Number(parameters.runConfig?.portfolioVariant || 0);
  if (!tuning.exactEnabled || portfolioVariant > 0 || !incumbent?.baseline) return incumbent;

  // „Erste gültige Lösung“ endet ohne zusätzlichen globalen Suchlauf, wenn der
  // strikt konstruierte Incumbent bereits vollständig und Null-Rot ist.
  if (tuning.stopAtFirstFeasible && incumbent.complete && !incumbent.requiresConfirmation) {
    return annotate(incumbent, parameters, tuning);
  }

  const exact = await solveExactly({
    state: parameters.state,
    monthData: incumbent.baseline,
    runConfig: { ...parameters.runConfig, allowRedFallback: false },
    incumbent,
    allowRed: false,
    stopAtFirstFeasible: tuning.stopAtFirstFeasible,
    timeLimitMs: tuning.exactTimeBudgetMs,
    nodeLimit: tuning.exactNodeLimit,
    onProgress: parameters.onProgress,
    signal: parameters.signal
  });

  let selected = betterResult(exact.result, incumbent, parameters.state, parameters.runConfig);
  let proof = exact;

  // Die verlustfreie strikte Suche hat rote Zweige bereits vollständig
  // mituntersucht. Ist ihr global bestes Resultat rot, beweist derselbe Lauf
  // gleichzeitig die Null-Rot-Unlösbarkeit und das Minimal-Rot-Optimum. Ein
  // zweiter identischer Suchlauf wäre reine Doppelarbeit.
  if (exact.solverStatus === V9_SOLVER_STATUSES.INFEASIBLE
    && exact.relaxedResult
    && parameters.runConfig?.allowRedFallback !== false
    && !tuning.forceStrict) {
    selected = betterResult(exact.relaxedResult, selected, parameters.state, parameters.runConfig);
    proof = {
      solverStatus: V9_SOLVER_STATUSES.OPTIMAL,
      completeSearch: true,
      search: normalizeSearchIdentity(exact.relaxedSearch, {
        solverStatus: V9_SOLVER_STATUSES.OPTIMAL,
        allowRed: true,
        reusedFromStrictEnumeration: true
      })
    };
  }

  return annotate(selected || incumbent, parameters, tuning, proof);
}

export async function buildAutoPlan(parameters) {
  const tuning = deriveV9Tuning(settingsOf(parameters));
  const constructed = await constructAutoPlan(parameters);
  const result = await perfectAutoPlan({ ...parameters, constructed });
  return annotate(result, parameters, tuning, result?.metrics?.exactSearch ? {
    solverStatus: result.metrics.exactSearch.solverStatus,
    completeSearch: result.metrics.exactSearch.completeSearch,
    search: result.metrics.exactSearch
  } : null);
}
