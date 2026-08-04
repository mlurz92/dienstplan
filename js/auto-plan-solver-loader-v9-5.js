/**
 * Auto-Plan v9.5 – Laufzeitlader für CP-SAT-WebAssembly.
 *
 * Der Solver läuft im Modul-Web-Worker. Ein Worker besitzt absichtlich kein
 * `document`; das ist kein Hinweis auf fehlende Browserunterstützung. Der
 * Loader prüft deshalb ausschließlich tatsächlich benötigte Fähigkeiten wie
 * WebAssembly und dynamische Modulimporte. Jede Bindung muss vor Verwendung
 * außerdem eine kleine bekannte Binärinstanz korrekt lösen.
 */

export const V95_SOLVER_LOAD_ORDER = Object.freeze([
  Object.freeze({ id: 'or-tools-wasm', source: 'local', url: '/vendor/or-tools-wasm/cp-sat/index.js', version: '0.9.1' }),
  Object.freeze({ id: 'or-tools-wasm', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/or-tools-wasm@0.9.1/cp-sat/+esm', version: '0.9.1' }),
  Object.freeze({ id: 'cpsat-js', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/cpsat-js@1.0.0/+esm', version: '1.0.0' })
]);

let loaderPromise = null;
let state = 'idle';
let failure = null;
let attempts = [];

function expressionOf(terms) {
  return terms.reduce((accumulator, [variable, coefficient]) => {
    const term = variable.times(coefficient);
    return accumulator === null ? term : accumulator.plus(term);
  }, null);
}

function modernFactoryApi(module, id) {
  if (!module?.CpModel || typeof module?.CpSolver?.create !== 'function') return null;
  return {
    id,
    createModel() { return new module.CpModel(); },
    newIntVar(model, lb, ub, name) { return model.newIntVar(lb, ub, name); },
    addLinear(model, terms, lb, ub) {
      const expression = expressionOf(terms);
      return expression ? model.addLinearConstraint(expression, lb, ub) : null;
    },
    minimize(model, terms) {
      const expression = expressionOf(terms);
      if (expression && typeof model.minimize === 'function') model.minimize(expression);
    },
    addHint(model, variable, value) {
      if (typeof model.addHint === 'function') model.addHint(variable, value);
    },
    async solve(model, parameters) {
      const solver = await module.CpSolver.create();
      try {
        const result = await solver.solve(model, parameters);
        return {
          status: result?.status,
          statusName: String(result?.status || 'UNKNOWN'),
          objectiveValue: () => Number(result?.objectiveValue ?? 0),
          bestBound: () => Number.isFinite(Number(result?.bestObjectiveBound))
            ? Number(result.bestObjectiveBound)
            : null,
          value: variable => Number(result?.value(variable) ?? 0)
        };
      } finally {
        if (typeof solver?.delete === 'function') solver.delete();
        else if (typeof solver?.dispose === 'function') solver.dispose();
      }
    }
  };
}

function constructorApi(module, id) {
  if (!module?.CpModel || typeof module?.CpSolver !== 'function') return null;
  return {
    id,
    createModel() { return new module.CpModel(); },
    newIntVar(model, lb, ub, name) { return model.newIntVar(lb, ub, name); },
    addLinear(model, terms, lb, ub) {
      const expression = expressionOf(terms);
      return expression ? model.addLinearConstraint(expression, lb, ub) : null;
    },
    minimize(model, terms) {
      const expression = expressionOf(terms);
      if (expression && typeof model.minimize === 'function') model.minimize(expression);
    },
    addHint(model, variable, value) {
      if (typeof model.addHint === 'function') model.addHint(variable, value);
    },
    async solve(model, parameters) {
      const solver = new module.CpSolver();
      try {
        const status = await solver.solve(model, parameters);
        return {
          status,
          statusName: String(solver.statusName?.(status) || status || 'UNKNOWN'),
          objectiveValue: () => Number(solver.objectiveValue?.() ?? 0),
          bestBound: () => {
            const value = solver.bestObjectiveBound?.();
            return Number.isFinite(Number(value)) ? Number(value) : null;
          },
          value: variable => Number(solver.value(variable) ?? 0)
        };
      } finally {
        if (typeof solver?.delete === 'function') solver.delete();
        else if (typeof solver?.dispose === 'function') solver.dispose();
      }
    }
  };
}

export function normalizeV95SolverApi(module, id = 'unknown') {
  // Factory-Bindungen müssen vor dem allgemeinen Konstruktorzweig geprüft
  // werden, weil `CpSolver` dort ebenfalls ein wahrer Funktions-/Objektwert ist.
  return modernFactoryApi(module, id) || constructorApi(module, id);
}

function statusNameOf(result) {
  const upper = String(result?.statusName || result?.status || 'UNKNOWN').toUpperCase();
  if (upper.includes('OPTIMAL')) return 'OPTIMAL';
  if (upper.includes('FEASIBLE')) return 'FEASIBLE';
  if (upper.includes('INFEASIBLE')) return 'INFEASIBLE';
  return 'UNKNOWN';
}

export async function selfTestV95Solver(api) {
  const model = api.createModel();
  const variable = api.newIntVar(model, 0, 1, 'v95_worker_loader_self_test');
  api.addLinear(model, [[variable, 1]], 1, 1);
  api.minimize(model, [[variable, 1]]);
  const result = await api.solve(model, {
    max_time_in_seconds: 2,
    random_seed: 95,
    num_search_workers: 1,
    log_search_progress: false
  });
  const status = statusNameOf(result);
  if (!['OPTIMAL', 'FEASIBLE'].includes(status) || Number(result.value(variable)) !== 1) {
    throw new Error(`CP-SAT-Selbsttest fehlgeschlagen (${status}).`);
  }
  return true;
}

export function v95SolverEnvironment() {
  return Object.freeze({
    webAssembly: typeof WebAssembly === 'object',
    worker: typeof WorkerGlobalScope !== 'undefined'
      && typeof self !== 'undefined'
      && self instanceof WorkerGlobalScope,
    document: typeof document !== 'undefined',
    crossOriginIsolated: globalThis.crossOriginIsolated === true
  });
}

export async function loadV95Solver({ signal = null, candidates = V95_SOLVER_LOAD_ORDER } = {}) {
  if (loaderPromise) return loaderPromise;
  state = 'loading';
  failure = null;
  attempts = [];
  loaderPromise = (async () => {
    if (typeof globalThis === 'undefined' || typeof WebAssembly !== 'object') {
      state = 'unavailable';
      failure = 'WebAssembly wird in dieser Laufzeit nicht unterstützt.';
      return null;
    }
    for (const candidate of candidates) {
      if (signal?.aborted) {
        state = 'aborted';
        return null;
      }
      const startedAt = Date.now();
      try {
        const module = await import(/* webpackIgnore: true */ candidate.url);
        const api = normalizeV95SolverApi(module, candidate.id);
        if (!api) throw new Error('Unbekannte CP-SAT-Bindungsoberfläche.');
        await selfTestV95Solver(api);
        api.loadedFrom = candidate;
        api.environment = v95SolverEnvironment();
        attempts.push({ ...candidate, ok: true, elapsedMs: Date.now() - startedAt });
        state = 'ready';
        failure = null;
        return api;
      } catch (error) {
        failure = error?.message || String(error);
        attempts.push({ ...candidate, ok: false, error: failure, elapsedMs: Date.now() - startedAt });
      }
    }
    state = 'unavailable';
    return null;
  })();
  return loaderPromise;
}

export function v95SolverLoadState() {
  return {
    state,
    failure,
    attempts: attempts.map(item => ({ ...item })),
    environment: v95SolverEnvironment()
  };
}

export function resetV95SolverLoaderForTests() {
  loaderPromise = null;
  state = 'idle';
  failure = null;
  attempts = [];
}
