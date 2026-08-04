/**
 * Auto-Plan v9 – CP-SAT-Remoteorchestrierung mit isoliertem Browserfallback.
 *
 * Direkte ältere Engine-Aufrufe ohne v9-Konfiguration behalten den bewährten
 * v8.5-Workervertrag. Das Auto-Plan Studio v9 aktiviert ausdrücklich den
 * hybriden Pfad aus CP-SAT, v8.5-Warmstart und unabhängigem Browseraudit.
 */
import { buildAutoPlan } from './auto-planner-v8-5.js?v=20260803.4';
import { planProfileIds } from './auto-planner-engine.js?v=20260803.4';
import { compileAutoPlanV9Snapshot } from './constraint-registry-v9.js?v=20260803.4';
import { materializeAutoPlanV9Result } from './auto-plan-contracts-v9.js?v=20260803.4';

const LEGACY_WORKER_URL = '/js/auto-plan-worker.js?v=20260803.4';
const FALLBACK_WORKER_URL = '/js/auto-plan-fallback-worker-v9.js?v=20260803.4';
const DEFAULT_ENDPOINT = '/api/autoplan/v9/runs';
const POLL_INTERVAL_MS = 750;

const abortError = signal => {
  const error = signal?.reason instanceof Error ? signal.reason : new Error('Auto-Plan wurde abgebrochen.');
  error.name = 'AbortError';
  return error;
};

const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(abortError(signal));
  const timer = setTimeout(resolve, Math.max(0, milliseconds));
  const onAbort = () => {
    clearTimeout(timer);
    reject(abortError(signal));
  };
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

function v9Settings(state) {
  return state?.settings?.autoPlan?.v9 || {};
}

function v9Requested(state, runConfig) {
  return Boolean(runConfig?.v9 || state?.settings?.autoPlan?.v9);
}

/**
 * Unveränderter v8.5-Ausführungsplan. Er bleibt öffentliche
 * Kompatibilitätsschnittstelle und beschreibt zugleich das lokale
 * Warmstartbudget hinter v9.
 */
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

export function isBetterAutoPlanResult(candidate, incumbent) {
  if (!incumbent) return Boolean(candidate);
  if (!candidate) return false;
  if (candidate.complete !== incumbent.complete) return Boolean(candidate.complete);
  const left = Array.isArray(candidate.objectiveKey) ? candidate.objectiveKey : [];
  const right = Array.isArray(incumbent.objectiveKey) ? incumbent.objectiveKey : [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0);
    if (Math.abs(difference) > 1e-9) return difference < 0;
  }
  return false;
}

async function runLegacyPortfolio({ state, monthData, year, month, runConfig = {}, onProgress, signal }) {
  const inline = () => buildAutoPlan({
    state,
    monthData,
    year,
    month,
    runConfig,
    signal,
    onProgress: update => onProgress?.({ ...update, searchIndex: 0, searchCount: 1 })
  });
  if (!workersAvailable()) return inline();

  let profileIds;
  try { profileIds = planProfileIds(state, monthData, runConfig); }
  catch { return inline(); }
  if (!profileIds.length) return inline();

  const openSlots = Object.values(monthData?.days || {}).reduce((sum, day) =>
    sum + Number(!day?.bd) + Number(!day?.hg), 0);
  const executionPlan = createAutoPlanExecutionPlan({
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
    deviceMemory: globalThis.navigator?.deviceMemory,
    openSlots,
    profileCount: profileIds.length,
    performanceProfile: runConfig.performanceProfile || state?.settings?.autoPlan?.performanceProfile || 'adaptive',
    parallelSearches: runConfig.parallelSearches ?? state?.settings?.autoPlan?.parallelSearches ?? null
  });
  const perfectionCount = executionPlan.perfectionWorkers;
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
  const diversify = (runConfig.portfolioDiversity ?? state?.settings?.autoPlan?.portfolioDiversity) !== false;
  const perfectionVariant = index => index === 0 || !diversify
    ? { seedSalt: index }
    : {
        seedSalt: index,
        lateAcceptanceSize: Math.round((runConfig.lateAcceptanceSize || 400) * (1 + index * .6)),
        descentInterval: Math.max(8, Math.round(25 / (1 + index * .6))),
        portfolioVariant: index
      };

  onProgress?.({
    phase: 'analysis',
    progress: .035,
    message: `v8.5 Worker-Portfolio · ${executionPlan.constructionWorkers} Aufbau · ${perfectionCount} Perfektion`,
    executionPlan
  });

  try {
    return await new Promise((resolve, reject) => {
      let phase = 'construct';
      let pending = profileIds.length;
      let bestConstruction = null;
      let best = null;
      let firstError = null;
      let closed = false;
      let nextConstruction = 0;
      let completed = 0;
      let failed = 0;
      let cancelled = 0;
      let detachAbort = () => {};

      const total = () => phase === 'construct' ? profileIds.length : perfectionCount;
      const reportPortfolio = () => {
        const size = total();
        const unfinished = Math.max(0, size - completed - failed - cancelled);
        onProgress?.({
          phase: phase === 'construct' ? 'search' : 'perfect',
          stage: phase === 'construct' ? 'aufbau' : 'perfektion',
          progress: phase === 'construct' ? .03 : .55,
          portfolioEvent: true,
          portfolioCompleted: completed,
          portfolioFailed: failed,
          portfolioCancelled: cancelled,
          portfolioActive: Math.min(unfinished, pool.filter(Boolean).length),
          portfolioTotal: size,
          searchCount: size
        });
      };
      const close = callback => value => {
        if (closed) return;
        closed = true;
        detachAbort();
        cleanup();
        callback(value);
      };
      const failRun = close(reject);
      const succeed = result => {
        result.metrics ||= {};
        result.metrics.executionPlan = executionPlan;
        reportPortfolio();
        onProgress?.({
          phase: result.complete ? 'complete' : 'blocked',
          stage: 'abschluss',
          progress: 1,
          message: result.complete
            ? `${result.changes?.length || 0} Vorschläge · Portfolio abgeschlossen`
            : `${result.metrics?.unfilled || 0} Felder offen`,
          result
        });
        close(resolve)(result);
      };
      const onAbort = () => failRun(abortError(signal));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener?.('abort', onAbort, { once: true });
      detachAbort = () => signal?.removeEventListener?.('abort', onAbort);

      const settle = (workerIndex, didFail = false) => {
        if (closed) return;
        if (didFail) failed += 1;
        else completed += 1;
        pending -= 1;
        if (phase === 'construct' && nextConstruction < profileIds.length) startConstruction(workerIndex);
        reportPortfolio();
        if (pending > 0) return;
        if (phase === 'construct') {
          if (!bestConstruction) {
            failRun(firstError || new Error('Kein Konstruktionslauf lieferte ein Ergebnis.'));
            return;
          }
          startPerfection();
          return;
        }
        if (best) succeed(best);
        else failRun(firstError || new Error('Auto-Plan lieferte kein Ergebnis.'));
      };

      const handleMessage = (message, workerIndex) => {
        if (!message || closed) return;
        if (message.type === 'progress') {
          const terminal = ['complete', 'blocked'].includes(message.update?.phase);
          onProgress?.({
            ...message.update,
            ...(terminal ? {
              phase: phase === 'construct' ? 'polish' : 'perfect',
              stage: phase === 'construct' ? 'aufbau' : 'perfektion',
              progress: phase === 'construct' ? .54 : .96,
              workerTerminal: true
            } : {}),
            searchIndex: Number(message.runId) || 0,
            searchCount: total()
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
          const error = new Error(message.message || 'Arbeitsstrang fehlgeschlagen.');
          error.name = message.name || 'Error';
          firstError ||= error;
          settle(workerIndex, true);
          return;
        }
        firstError ||= new Error(`Unbekannte Worker-Antwort: ${String(message.type || 'ohne Typ')}`);
        pool[workerIndex]?.terminate();
        pool[workerIndex] = null;
        settle(workerIndex, true);
      };

      const send = (index, message) => {
        let worker = pool[index];
        if (!worker) {
          try { worker = new Worker(LEGACY_WORKER_URL, { type: 'module' }); }
          catch (error) { failRun(error); return false; }
          pool[index] = worker;
          worker.addEventListener('message', event => handleMessage(event.data, index));
          worker.addEventListener('error', event => {
            event.preventDefault?.();
            firstError ||= new Error(event.message || 'Arbeitsstrang fehlgeschlagen.');
            worker.terminate();
            pool[index] = null;
            settle(index, true);
          });
        }
        try { worker.postMessage(message); return true; }
        catch (error) { failRun(error); return false; }
      };

      const startConstruction = workerIndex => {
        if (nextConstruction >= profileIds.length) return false;
        const runId = nextConstruction;
        const profileId = profileIds[nextConstruction++];
        return send(workerIndex, {
          type: 'construct', runId, state: sharedState, monthData, year, month,
          runConfig: profileId === 'confirmable-balanced'
            ? { ...runConfig, profileFilter: [profileId], zeroRedRescue: false }
            : { ...runConfig, profileFilter: [profileId] }
        });
      };

      const startPerfection = () => {
        phase = 'perfect';
        pending = perfectionCount;
        completed = 0;
        failed = 0;
        cancelled = 0;
        for (let index = 0; index < perfectionCount; index += 1) {
          if (!send(index, {
            type: 'perfect', runId: index, state: sharedState,
            constructed: bestConstruction, progressFloor: .55,
            runConfig: { ...runConfig, ...perfectionVariant(index) }
          })) return;
        }
        for (let index = perfectionCount; index < pool.length; index += 1) pool[index]?.terminate();
        pool.length = Math.min(pool.length, perfectionCount);
        reportPortfolio();
      };

      for (let index = 0; index < executionPlan.constructionWorkers; index += 1) {
        if (!startConstruction(index)) break;
      }
    });
  } finally {
    cleanup();
  }
}

function runLocalFallback({ state, monthData, year, month, runConfig, signal, onProgress }) {
  if (typeof Worker !== 'function') {
    return buildAutoPlan({
      state,
      monthData,
      year,
      month,
      runConfig: { ...runConfig, timeBudgetMs: Math.min(Number(runConfig.timeBudgetMs || 60_000), 45_000) },
      signal,
      onProgress: update => onProgress?.({ ...update, lane: 'local-warmstart', engineRevision: 9 })
    }).then(result => {
      result.algorithmRevision = 9;
      result.engineRevision = 9;
      result.metrics ||= {};
      result.metrics.engine = 'v9-local-v85-fallback';
      result.metrics.solverStatus = 'HEURISTIC';
      result.certified = false;
      return result;
    });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(FALLBACK_WORKER_URL, { type: 'module' });
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener?.('abort', onAbort);
      worker.terminate();
    };
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => finish(reject)(abortError(signal));
    worker.addEventListener('message', event => {
      const message = event.data;
      if (!message || settled) return;
      if (message.type === 'progress') {
        onProgress?.({ ...message.update, lane: 'local-warmstart', engineRevision: 9 });
      } else if (message.type === 'done') finish(resolve)(message.result);
      else if (message.type === 'error') {
        const error = new Error(message.message || 'Lokaler Auto-Plan-Fallback fehlgeschlagen.');
        error.name = message.name || 'Error';
        finish(reject)(error);
      }
    });
    worker.addEventListener('error', event => {
      event.preventDefault?.();
      finish(reject)(new Error(event.message || 'Lokaler Auto-Plan-Worker ist fehlgeschlagen.'));
    });
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    worker.postMessage({
      type: 'run',
      state: {
        months: state.months,
        staff: state.staff,
        currentYear: state.currentYear,
        currentMonth: state.currentMonth,
        monthSources: state.monthSources,
        settings: state.settings
      },
      monthData,
      year,
      month,
      runConfig,
      localBudgetMs: Math.max(10_000, Math.min(45_000, Number(runConfig.timeBudgetMs || 60_000)))
    });
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Solverantwort ist kein gültiges JSON (HTTP ${response.status}).`); }
}

function emitRemoteEvents(body, onProgress) {
  const events = Array.isArray(body?.events) ? body.events : body?.event ? [body.event] : [];
  for (const event of events) {
    onProgress?.({
      ...event,
      phase: event.phase || event.stage || 'perfect',
      lane: 'remote-cpsat',
      engineRevision: 9,
      solverStatus: event.solverStatus || event.status
    });
  }
}

async function cancelRemote(endpoint, runId) {
  if (!runId) return;
  try {
    await fetch(`${endpoint}/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST', headers: { Accept: 'application/json' }, cache: 'no-store', keepalive: true
    });
  } catch { /* best effort */ }
}

async function pollRemote({ endpoint, runId, signal, onProgress, initialSequence = 0 }) {
  let sequence = initialSequence;
  try {
    for (;;) {
      if (signal?.aborted) throw abortError(signal);
      const response = await fetch(`${endpoint}/${encodeURIComponent(runId)}?after=${sequence}`, {
        method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal
      });
      const body = await parseJsonResponse(response);
      if (!response.ok) throw new Error(body?.error?.message || body?.error || `Solverstatus konnte nicht geladen werden (HTTP ${response.status}).`);
      emitRemoteEvents(body, onProgress);
      for (const event of body.events || []) sequence = Math.max(sequence, Number(event.sequence) || 0);
      const status = String(body.status || '').toLowerCase();
      if (body.result) return body.result;
      if (status === 'failed') throw new Error(body.error?.message || body.error || 'Remote-Solverlauf fehlgeschlagen.');
      if (status === 'cancelled') throw abortError(signal);
      await delay(POLL_INTERVAL_MS, signal);
    }
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') await cancelRemote(endpoint, runId);
    throw error;
  }
}

async function runRemote({ snapshot, endpoint, signal, onProgress }) {
  onProgress?.({
    phase: 'analysis', stage: 'snapshot', progress: .02,
    lane: 'remote-cpsat', engineRevision: 9,
    message: `v9-Snapshot ${snapshot.requestFingerprint} · ${snapshot.slots.length} Dienstfelder · Regelwerk ${snapshot.rulesetVersion}`
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      'Idempotency-Key': snapshot.requestFingerprint,
      'X-Auto-Plan-Schema': String(snapshot.schemaVersion)
    },
    body: JSON.stringify(snapshot), cache: 'no-store', signal
  });
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error || `Remote-Solver nicht verfügbar (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  emitRemoteEvents(body, onProgress);
  if (body.result) return body.result;
  if (body.assignments) return body;
  if (!body.runId) throw new Error('Remote-Solver lieferte weder Ergebnis noch Laufkennung.');
  return pollRemote({ endpoint, runId: body.runId, signal, onProgress, initialSequence: Number(body.sequence) || 0 });
}

function normalizedRunConfig(state, runConfig) {
  const settings = v9Settings(state);
  return {
    ...(runConfig || {}),
    v9: { ...settings, ...(runConfig?.v9 || {}) },
    perfectionEnabled: true
  };
}

function warmStartFromResult(result) {
  if (!result?.complete || !Array.isArray(result.changes)) return null;
  const assignments = result.changes
    .filter(item => item?.dateIso && ['bd', 'hg'].includes(item.role) && item.staffId)
    .map(({ dateIso, role, staffId }) => ({ dateIso, role, staffId }));
  return assignments.length ? { source: 'v8.5-browser', assignments } : null;
}

async function runV9({ state, monthData, year, month, runConfig, onProgress, signal }) {
  const config = normalizedRunConfig(state, runConfig);
  const settings = v9Settings(state);
  const endpoint = String(config.v9?.endpoint || settings.endpoint || DEFAULT_ENDPOINT);
  const forceLocal = config.v9?.remoteSolver === false;
  const localController = new AbortController();
  const relayAbort = () => localController.abort(abortError(signal));
  if (signal?.aborted) relayAbort();
  else signal?.addEventListener?.('abort', relayAbort, { once: true });

  const localPromise = runLocalFallback({
    state, monthData, year, month, runConfig: config,
    signal: localController.signal, onProgress
  });
  // Sofort behandeln, damit ein später Remoteerfolg keine unbeobachtete lokale
  // Rejection hinterlässt.
  const handledLocal = localPromise.then(result => ({ result }), error => ({ error }));
  const snapshot = compileAutoPlanV9Snapshot({ state, monthData, runConfig: config });

  onProgress?.({
    phase: 'analysis', progress: .03,
    message: forceLocal
      ? 'Auto-Plan v9 · lokaler Offlinefallback wird ausgeführt'
      : 'Auto-Plan v9 · CP-SAT und lokaler Warmstart werden parallel vorbereitet',
    executionPlan: {
      ...createAutoPlanExecutionPlan({
        hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
        deviceMemory: globalThis.navigator?.deviceMemory,
        openSlots: snapshot.slots.filter(slot => !slot.fixedStaffId).length,
        performanceProfile: config.performanceProfile,
        parallelSearches: config.parallelSearches
      }),
      remoteSolver: !forceLocal
    }
  });

  try {
    if (forceLocal) {
      const local = await handledLocal;
      if (local.error) throw local.error;
      return local.result;
    }

    // Ein bereits sehr schnell vollständiger Browseraufbau wird als echter
    // CP-SAT-Hint übertragen, ohne den Remote-Start länger als 1,2 s zu blockieren.
    const early = await Promise.race([
      handledLocal,
      delay(1200, signal).then(() => null)
    ]);
    const warmStart = early?.result ? warmStartFromResult(early.result) : null;
    if (warmStart) snapshot.warmStarts = [warmStart];

    const remote = await runRemote({ snapshot, endpoint, signal, onProgress });
    const result = materializeAutoPlanV9Result({ state, baseline: monthData, runConfig: config, remote });
    localController.abort(new DOMException('Remoteergebnis übernommen', 'AbortError'));
    onProgress?.({
      phase: 'audit', stage: 'audit', progress: .985,
      lane: 'remote-cpsat',
      message: `Unabhängiger Browseraudit bestanden · ${result.metrics.red} rot · ${result.metrics.orange} orange · Solver ${result.metrics.solverStatus}`,
      improvements: result.metrics.optimizer?.improvements,
      evaluations: result.metrics.branches
    });
    return result;
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw abortError(signal);
    onProgress?.({
      phase: 'repair', stage: 'remote-fallback', progress: .52,
      lane: 'local-warmstart', remoteFallback: true,
      message: `CP-SAT-Pfad nicht verwendbar · lokaler v9-Fallback übernimmt: ${error?.message || 'unbekannter Fehler'}`
    });
    const local = await handledLocal;
    if (local.error) throw local.error;
    local.result.metrics ||= {};
    local.result.metrics.remoteFailure = {
      name: error?.name || 'Error',
      message: error?.message || 'Remote-Solver nicht verfügbar'
    };
    local.result.searchProfile = `Auto-Plan v9 · lokaler Fallback · ${local.result.searchProfile || 'v8.5-Warmstart'}`;
    return local.result;
  } finally {
    signal?.removeEventListener?.('abort', relayAbort);
  }
}

export async function runAutoPlan(parameters) {
  return v9Requested(parameters.state, parameters.runConfig)
    ? runV9(parameters)
    : runLegacyPortfolio(parameters);
}
