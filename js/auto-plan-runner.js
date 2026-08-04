/**
 * Ausführung eines Auto-Plan-Laufs auf mehreren Kernen.
 *
 * ZUR GRAFIKKARTE
 *
 * Die naheliegende Idee, diese Rechnung auf die Grafikkarte zu geben, trägt
 * hier nicht. Grafikprozessoren gewinnen ihre Leistung daraus, dass tausende
 * Rechenwerke denselben Befehlsstrom auf flachen Zahlenfeldern ausführen. Die
 * Regelbewertung ist das Gegenteil davon: verzweigungsreich, auf Zeichenketten
 * und Objektgraphen arbeitend, mit Datumsrechnung und Nachschlagen in
 * Nachbarmonaten. Sie ließe sich dort nur ausführen, indem man das gesamte
 * Regelwerk ein zweites Mal als numerische Fassung nachbaut – und genau das ist
 * ausgeschlossen: Die bestehende Regelengine ist die einzige fachliche
 * Wahrheitsquelle; eine zweite Fassung würde von ihr abweichen, ohne dass es
 * jemand bemerkt. Hinzu kommt, dass die Suche in ihrem Kern aufeinanderfolgend
 * ist: Jede Annahmeentscheidung hängt am Ergebnis der vorigen.
 *
 * WAS STATTDESSEN TRÄGT
 *
 * Arbeitsstränge, und zwar in beiden Phasen:
 *
 * 1. **Aufbau.** Alle freigegebenen Konstruktionsprofile laufen vollständig.
 *    Ein früher Null-Rot-Treffer beendet die übrigen Profile bewusst nicht:
 *    Vollständigkeit und Konfliktfreiheit sind nur die obersten Ebenen der
 *    lexikografischen Zielordnung; orange, gelbe, Wünsche und Fairness können
 *    zwischen zwei sauberen Aufbauten erheblich differieren. Erst nach Abschluss
 *    des gesamten Portfolios wird der objektiv beste Aufbau an die Perfektion
 *    übergeben.
 * 2. **Perfektion.** Mehrere Stränge verbessern denselben Aufbau mit
 *    verschiedenen Startwerten. Weil die Suche stochastisch ist, streuen ihre
 *    Ergebnisse; der beste aus mehreren unabhängigen Läufen ist verlässlich
 *    besser als ein einzelner.
 *
 * Der Aufbau wird dabei genau einmal je Suchprofil berechnet und der Gewinner
 * an alle Perfektionsläufe verteilt. Ihn je Perfektionsstrang zu wiederholen
 * wäre dieselbe Arbeit mehrfach.
 *
 * Fehlt die Unterstützung für Arbeitsstränge, läuft alles unverändert im
 * Anzeigestrang weiter.
 */

import { buildAutoPlan } from './auto-planner.js?v=20260803.4';
import { planProfileIds } from './auto-planner-engine.js?v=20260803.4';

const WORKER_URL = '/js/auto-plan-worker.js?v=20260803.4';

export function createAutoPlanExecutionPlan({
  hardwareConcurrency = 2,
  deviceMemory,
  openSlots = 62,
  profileCount = 3,
  performanceProfile = 'adaptive',
  parallelSearches = null
} = {}) {
  const cores = Math.max(1, Math.min(64, Math.round(Number(hardwareConcurrency) || 2)));
  const memory = Number(deviceMemory);
  const slots = Math.max(0, Math.min(62, Math.round(Number(openSlots) || 0)));
  const reserveCores = cores >= 12 ? 2 : cores > 1 ? 1 : 0;
  const coreBudget = Math.max(1, cores - reserveCores);
  const profileCap = performanceProfile === 'power' ? 6 : performanceProfile === 'responsive' ? 2 : 4;
  const memoryCap = Number.isFinite(memory)
    ? memory <= 2 ? 1 : memory <= 4 ? 2 : memory <= 8 ? 3 : 6
    : 4;
  const problemCap = slots <= 8 ? 1 : slots <= 24 ? 2 : performanceProfile === 'power' ? 6 : 4;
  const workerBudget = Math.max(1, Math.min(coreBudget, profileCap, memoryCap, problemCap));
  const explicit = parallelSearches === null || parallelSearches === undefined
    ? null
    : Math.max(1, Math.min(8, Math.round(Number(parallelSearches) || 1)));
  const reason = Number.isFinite(memory) && memory <= 2
    ? 'memory-constrained'
    : slots <= 8
      ? 'small-problem'
      : performanceProfile === 'responsive'
        ? 'responsive-ui'
        : performanceProfile === 'power'
          ? 'maximum-throughput'
          : 'balanced-throughput';
  return {
    performanceProfile,
    hardwareConcurrency: cores,
    deviceMemory: Number.isFinite(memory) ? memory : null,
    openSlots: slots,
    reserveCores,
    workerBudget,
    constructionWorkers: Math.max(1, Math.min(workerBudget, Math.max(1, Number(profileCount) || 1))),
    perfectionWorkers: explicit === null ? workerBudget : Math.min(workerBudget, explicit),
    reason
  };
}

export function parallelSearchCount() {
  return createAutoPlanExecutionPlan({
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
    deviceMemory: globalThis.navigator?.deviceMemory,
    openSlots: 62,
    performanceProfile: 'adaptive'
  }).perfectionWorkers;
}

export function workersAvailable() {
  return typeof Worker === 'function';
}

function proofRank(result) {
  const status = result?.metrics?.proof?.status || result?.metrics?.solverStatus || '';
  if (status === 'OPTIMAL') return 4;
  if (status === 'INFEASIBLE') return 3;
  if (status === 'FEASIBLE' && result?.metrics?.proof?.exactAttempted) return 2;
  if (status === 'FEASIBLE') return 1;
  return 0;
}

export function isBetterAutoPlanResult(candidate, incumbent) {
  if (!incumbent) return Boolean(candidate);
  if (!candidate) return false;
  if (candidate.complete !== incumbent.complete) return Boolean(candidate.complete);
  const left = candidate.objectiveKey;
  const right = incumbent.objectiveKey;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const a = Number(left[index] || 0);
      const b = Number(right[index] || 0);
      if (Math.abs(a - b) > 1e-9) return a < b;
    }
    // Bei objektiv identischen Plänen gewinnt der stärkere Nachweis. Ohne
    // diesen Tiebreak könnte ein schneller ALNS-Strang einen späteren globalen
    // OPTIMAL-Nachweis desselben Plans aus der Ergebnisanzeige verdrängen.
    return proofRank(candidate) > proofRank(incumbent);
  }
  const rank = result => [
    result.metrics?.unfilled || 0,
    result.metrics?.gray || 0,
    result.metrics?.red || 0,
    result.metrics?.orange || 0,
    result.metrics?.yellow || 0
  ];
  const a = rank(candidate);
  const b = rank(incumbent);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] < b[index];
  return proofRank(candidate) > proofRank(incumbent);
}

export async function runAutoPlan({ state, monthData, year, month, runConfig, onProgress, signal }) {
  let lastProgress = 0;
  const emitProgress = update => {
    if (typeof onProgress !== 'function' || !update) return;
    const incoming = Number(update.progress);
    const bounded = Number.isFinite(incoming) ? Math.max(0, Math.min(1, incoming)) : lastProgress;
    lastProgress = Math.max(lastProgress, bounded);
    onProgress({ ...update, progress: lastProgress });
  };

  const inline = () => buildAutoPlan({
    state,
    monthData,
    year,
    month,
    runConfig,
    signal,
    onProgress: update => emitProgress({ ...update, searchIndex: 0, searchCount: 1 })
  });

  if (!workersAvailable()) return inline();

  let profileIds;
  try {
    profileIds = planProfileIds(state, monthData, runConfig);
  } catch {
    return inline();
  }
  if (!profileIds.length) return inline();

  const openSlots = Object.values(monthData?.days || {}).reduce((sum, day) =>
    sum + Number(!day?.bd) + Number(!day?.hg), 0);
  const effectivePerformanceProfile = runConfig?.performanceProfile
    || state?.settings?.autoPlan?.performanceProfile
    || 'adaptive';
  const v9ExactPipeline = /^v9:(hybrid|exact|diagnose):/.test(effectivePerformanceProfile);
  const executionPlan = createAutoPlanExecutionPlan({
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
    deviceMemory: globalThis.navigator?.deviceMemory,
    openSlots,
    profileCount: profileIds.length,
    performanceProfile: effectivePerformanceProfile,
    parallelSearches: runConfig?.parallelSearches ?? state?.settings?.autoPlan?.parallelSearches ?? null
  });
  const perfectionCount = executionPlan.perfectionWorkers;
  emitProgress({
    phase: 'analysis',
    progress: .035,
    message: `${v9ExactPipeline ? 'v9 Hybrid' : 'v8.5'} Worker-Portfolio · ${executionPlan.constructionWorkers} Aufbau · ${executionPlan.perfectionWorkers} Perfektion · ${executionPlan.reserveCores} UI-Reserve`,
    executionPlan
  });

  const pool = [];
  const cleanup = () => {
    for (const worker of pool) worker?.terminate();
    pool.length = 0;
  };
  const sharedState = {
    months: state.months,
    staff: state.staff,
    currentYear: state.currentYear,
    currentMonth: state.currentMonth,
    monthSources: state.monthSources
  };

  const diversify = (runConfig?.portfolioDiversity ?? state?.settings?.autoPlan?.portfolioDiversity) !== false;
  const perfectionVariant = index => {
    if (index === 0 || !diversify) return { seedSalt: index };
    const widen = 1 + index * .6;
    return {
      seedSalt: index,
      lateAcceptanceSize: Math.round((runConfig?.lateAcceptanceSize || 400) * widen),
      descentInterval: Math.max(8, Math.round(25 / widen)),
      portfolioVariant: index
    };
  };

  try {
    return await new Promise((resolve, reject) => {
      let phase = 'construct';
      let pending = profileIds.length;
      let bestConstruction = null;
      let best = null;
      let firstError = null;
      let closed = false;
      let nextConstruction = 0;
      let portfolioCompleted = 0;
      let portfolioCancelled = 0;
      let portfolioFailed = 0;
      let detachAbort = () => {};

      const reportPortfolio = () => {
        const total = phase === 'construct' ? profileIds.length : perfectionCount;
        const unfinished = Math.max(0, total - portfolioCompleted - portfolioCancelled - portfolioFailed);
        emitProgress({
          phase: phase === 'construct' ? 'search' : 'perfect',
          stage: phase === 'construct' ? 'aufbau' : 'perfektion',
          progress: phase === 'construct' ? .03 : .55,
          portfolioEvent: true,
          portfolioCompleted,
          portfolioCancelled,
          portfolioFailed,
          portfolioActive: Math.min(unfinished, pool.filter(Boolean).length),
          portfolioTotal: total,
          searchCount: total
        });
      };

      const fail = error => {
        if (closed) return;
        closed = true;
        detachAbort();
        cleanup();
        reject(error);
      };
      const succeed = result => {
        if (closed) return;
        emitProgress({
          phase: result?.complete ? 'complete' : 'blocked',
          stage: 'abschluss',
          progress: 1,
          message: result?.complete
            ? `${result.changes?.length || 0} Vorschläge · ${result.metrics?.red || 0} rote Konflikte · Portfolio abgeschlossen`
            : `Keine vollständige technisch wählbare Belegung · ${result?.metrics?.unfilled || 0} Felder offen`,
          improvements: result?.metrics?.optimizer?.improvements,
          result
        });
        closed = true;
        detachAbort();
        result.metrics ||= {};
        result.metrics.executionPlan = executionPlan;
        cleanup();
        resolve(result);
      };
      const fallback = () => {
        if (closed) return;
        closed = true;
        detachAbort();
        cleanup();
        resolve(inline());
      };

      const onAbort = () => {
        const error = new Error('Auto-Plan wurde abgebrochen.');
        error.name = 'AbortError';
        fail(error);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      detachAbort = () => signal?.removeEventListener?.('abort', onAbort);

      const send = (index, message) => {
        let worker = pool[index];
        if (!worker) {
          try {
            worker = new Worker(WORKER_URL, { type: 'module' });
          } catch {
            fallback();
            return false;
          }
          pool[index] = worker;
          worker.addEventListener('message', event => handleMessage(event.data, index));
          worker.addEventListener('error', event => {
            event.preventDefault?.();
            if (!firstError) firstError = new Error(event.message || 'Arbeitsstrang fehlgeschlagen.');
            worker.terminate();
            if (pool[index] === worker) pool[index] = null;
            settle(index, { failed: true });
          });
        }
        try {
          worker.postMessage(message);
          return true;
        } catch (error) {
          fail(error);
          return false;
        }
      };

      const startConstruction = workerIndex => {
        if (nextConstruction >= profileIds.length) return false;
        const runId = nextConstruction;
        const profileId = profileIds[nextConstruction];
        nextConstruction += 1;
        return send(workerIndex, {
          type: 'construct',
          runId,
          state: sharedState,
          monthData,
          year,
          month,
          runConfig: profileId === 'confirmable-balanced'
            ? { ...runConfig, profileFilter: [profileId], zeroRedRescue: false }
            : { ...runConfig, profileFilter: [profileId] }
        });
      };

      const startPerfection = () => {
        phase = 'perfect';
        pending = perfectionCount;
        portfolioCompleted = 0;
        portfolioCancelled = 0;
        portfolioFailed = 0;
        for (let index = 0; index < perfectionCount; index += 1) {
          const started = send(index, {
            type: 'perfect',
            runId: index,
            state: sharedState,
            constructed: bestConstruction,
            progressFloor: .55,
            runConfig: { ...runConfig, ...perfectionVariant(index) }
          });
          if (!started) return;
        }
        for (let index = perfectionCount; index < pool.length; index += 1) pool[index]?.terminate();
        pool.length = Math.min(pool.length, perfectionCount);
        reportPortfolio();
      };

      const settle = (workerIndex, { failed = false } = {}) => {
        if (closed) return;
        if (failed) portfolioFailed += 1;
        else portfolioCompleted += 1;
        pending -= 1;
        if (phase === 'construct' && nextConstruction < profileIds.length) startConstruction(workerIndex);
        reportPortfolio();
        if (pending > 0) return;
        if (phase === 'construct') {
          if (!bestConstruction) return fallback();
          startPerfection();
          return;
        }
        if (best) succeed(best);
        else fail(firstError || new Error('Auto-Plan lieferte kein Ergebnis.'));
      };

      const handleMessage = (message, workerIndex) => {
        if (!message || closed) return;
        if (message.type === 'progress') {
          const workerTerminal = message.update?.phase === 'complete' || message.update?.phase === 'blocked';
          const forwarded = workerTerminal
            ? {
                ...message.update,
                phase: phase === 'construct' ? 'polish' : 'perfect',
                stage: phase === 'construct' ? 'aufbau' : 'perfektion',
                progress: phase === 'construct' ? .54 : v9ExactPipeline ? .80 : .96,
                workerTerminal: true,
                message: `Arbeitsstrang ${Number(message.runId) + 1} hat seinen ${phase === 'construct' ? 'Aufbau' : 'Perfektionslauf'} beendet`
              }
            : message.update;
          emitProgress({
            ...forwarded,
            searchIndex: Number(message.runId) || 0,
            searchCount: phase === 'construct' ? profileIds.length : perfectionCount
          });
          return;
        }
        if (message.type === 'constructed') {
          if (isBetterAutoPlanResult(message.result, bestConstruction)) bestConstruction = message.result;
          settle(workerIndex);
          return;
        }
        if (message.type === 'done') {
          if (isBetterAutoPlanResult(message.result, best)) best = message.result;
          settle(workerIndex);
          return;
        }
        if (message.type === 'error') {
          if (!firstError) firstError = new Error(message.message);
          settle(workerIndex, { failed: true });
          return;
        }
        if (!firstError) firstError = new Error(`Unbekannte Worker-Antwort: ${String(message.type || 'ohne Typ')}`);
        pool[workerIndex]?.terminate();
        pool[workerIndex] = null;
        settle(workerIndex, { failed: true });
      };

      for (let index = 0; index < executionPlan.constructionWorkers; index += 1) {
        const started = startConstruction(index);
        if (!started) return;
      }
    });
  } finally {
    cleanup();
  }
}
