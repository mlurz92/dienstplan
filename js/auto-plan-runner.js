/**
 * Auto-Plan v9 – CP-SAT-Remoteorchestrierung mit isoliertem Browserfallback.
 *
 * Der native Solver ist der primäre Pfad. Parallel entsteht in einem Web Worker
 * ein vollständig regelgeprüfter v8.5-Warmstart. Ist der Solver nicht
 * konfiguriert, nicht erreichbar oder besteht sein Ergebnis den unabhängigen
 * Browseraudit nicht, bleibt die Anwendung mit diesem lokalen Vorschlag voll
 * funktionsfähig. Es gibt keinen zweiten fachlichen Auditpfad.
 */
import { compileAutoPlanV9Snapshot } from './constraint-registry-v9.js?v=20260804.1';
import { materializeAutoPlanV9Result } from './auto-plan-contracts-v9.js?v=20260804.1';

const FALLBACK_WORKER_URL = '/js/auto-plan-fallback-worker-v9.js?v=20260804.1';
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
  signal?.addEventListener?.('abort', () => {
    clearTimeout(timer);
    reject(abortError(signal));
  }, { once: true });
});

function v9Settings(state) {
  return state?.settings?.autoPlan?.v9 || {};
}

export function createAutoPlanExecutionPlan({
  hardwareConcurrency = 2,
  deviceMemory,
  openSlots = 62,
  performanceProfile = 'adaptive',
  parallelSearches = null
} = {}) {
  const cores = Math.max(1, Math.min(64, Math.round(Number(hardwareConcurrency) || 2)));
  const reserveCores = cores >= 12 ? 2 : cores > 1 ? 1 : 0;
  const localWorkers = typeof Worker === 'function' ? 1 : 0;
  const requested = parallelSearches === null || parallelSearches === undefined
    ? null
    : Math.max(1, Math.min(8, Math.round(Number(parallelSearches) || 1)));
  return {
    performanceProfile,
    hardwareConcurrency: cores,
    deviceMemory: Number.isFinite(Number(deviceMemory)) ? Number(deviceMemory) : null,
    openSlots: Math.max(0, Math.round(Number(openSlots) || 0)),
    reserveCores,
    workerBudget: localWorkers,
    constructionWorkers: localWorkers,
    perfectionWorkers: localWorkers,
    remoteSolver: true,
    remoteThreads: requested,
    reason: localWorkers ? 'remote-cpsat-with-local-fallback' : 'remote-cpsat-inline-fallback'
  };
}

export function parallelSearchCount() {
  return 1;
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

function runLocalFallback({ state, monthData, year, month, runConfig, signal, onProgress }) {
  if (typeof Worker !== 'function') {
    return import('./auto-planner-v8-5.js?v=20260803.4').then(module => module.buildAutoPlan({
      state,
      monthData,
      year,
      month,
      runConfig: { ...runConfig, timeBudgetMs: Math.min(Number(runConfig.timeBudgetMs || 60_000), 45_000) },
      signal,
      onProgress: update => onProgress?.({ ...update, lane: 'local-warmstart', engineRevision: 9 })
    })).then(result => {
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
        return;
      }
      if (message.type === 'done') finish(resolve)(message.result);
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
  try { return JSON.parse(text); } catch {
    throw new Error(`Solverantwort ist kein gültiges JSON (HTTP ${response.status}).`);
  }
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

async function pollRemote({ endpoint, runId, signal, onProgress, initialSequence = 0 }) {
  let sequence = initialSequence;
  for (;;) {
    if (signal?.aborted) throw abortError(signal);
    const response = await fetch(`${endpoint}/${encodeURIComponent(runId)}?after=${sequence}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.error || `Solverstatus konnte nicht geladen werden (HTTP ${response.status}).`);
    emitRemoteEvents(body, onProgress);
    if (Array.isArray(body.events)) {
      for (const event of body.events) sequence = Math.max(sequence, Number(event.sequence) || 0);
    }
    const status = String(body.status || '').toLowerCase();
    if (body.result) return body.result;
    if (status === 'failed') throw new Error(body.error?.message || body.error || 'Remote-Solverlauf fehlgeschlagen.');
    if (status === 'cancelled') throw abortError(signal);
    await delay(POLL_INTERVAL_MS, signal);
  }
}

async function runRemote({ snapshot, endpoint, signal, onProgress }) {
  onProgress?.({
    phase: 'analysis',
    stage: 'snapshot',
    progress: .02,
    lane: 'remote-cpsat',
    engineRevision: 9,
    message: `v9-Snapshot ${snapshot.requestFingerprint} · ${snapshot.slots.length} Dienstfelder · Regelwerk ${snapshot.rulesetVersion}`
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': snapshot.requestFingerprint,
      'X-Auto-Plan-Schema': String(snapshot.schemaVersion)
    },
    body: JSON.stringify(snapshot),
    cache: 'no-store',
    signal
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

/**
 * Primärer Laufvertrag für das bestehende Studio.
 */
export async function runAutoPlan({ state, monthData, year, month, runConfig, onProgress, signal }) {
  const config = normalizedRunConfig(state, runConfig);
  const settings = v9Settings(state);
  const endpoint = String(settings.endpoint || DEFAULT_ENDPOINT);
  const forceLocal = settings.remoteSolver === false || config.v9?.remoteSolver === false;
  const snapshot = compileAutoPlanV9Snapshot({ state, monthData, runConfig: config });
  const localPromise = runLocalFallback({ state, monthData, year, month, runConfig: config, signal, onProgress });

  onProgress?.({
    phase: 'analysis',
    progress: .03,
    message: forceLocal
      ? 'Auto-Plan v9 · lokaler Offlinefallback wird ausgeführt'
      : 'Auto-Plan v9 · CP-SAT und lokaler Warmstart werden parallel vorbereitet',
    executionPlan: createAutoPlanExecutionPlan({
      hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
      deviceMemory: globalThis.navigator?.deviceMemory,
      openSlots: snapshot.slots.filter(slot => !slot.fixedStaffId).length,
      performanceProfile: config.performanceProfile,
      parallelSearches: config.parallelSearches
    })
  });

  if (forceLocal) return localPromise;

  try {
    const remote = await runRemote({ snapshot, endpoint, signal, onProgress });
    const result = materializeAutoPlanV9Result({ state, baseline: monthData, runConfig: config, remote });
    onProgress?.({
      phase: 'audit',
      stage: 'audit',
      progress: .985,
      lane: 'remote-cpsat',
      message: `Unabhängiger Browseraudit bestanden · ${result.metrics.red} rot · ${result.metrics.orange} orange · Solver ${result.metrics.solverStatus}`,
      improvements: result.metrics.optimizer?.improvements,
      evaluations: result.metrics.branches
    });
    return result;
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw abortError(signal);
    onProgress?.({
      phase: 'repair',
      stage: 'remote-fallback',
      progress: .52,
      lane: 'local-warmstart',
      message: `CP-SAT-Pfad nicht verwendbar · lokaler v9-Fallback übernimmt: ${error?.message || 'unbekannter Fehler'}`,
      remoteFallback: true
    });
    const local = await localPromise;
    local.metrics ||= {};
    local.metrics.remoteFailure = {
      name: error?.name || 'Error',
      message: error?.message || 'Remote-Solver nicht verfügbar'
    };
    local.searchProfile = `Auto-Plan v9 · lokaler Fallback · ${local.searchProfile || 'v8.5-Warmstart'}`;
    return local;
  }
}
