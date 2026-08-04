/**
 * Auto-Plan v9.5 – CP-SAT-Adapter, strikte lexikografische Suche und LNS.
 *
 * Die Solverbibliothek sieht ausschließlich das solverunabhängige Modell aus
 * `auto-plan-model-v9-5.js`. Alle Statuswerte werden konservativ behandelt:
 * FEASIBLE ist eine verwendbare Lösung, aber niemals ein Optimalitätsnachweis.
 */

import {
  assignmentHintsFromMonth,
  materializeBooleanSolution,
  objectiveValueForComponent
} from './auto-plan-model-v9-5.js?v=20260805.1';

export const AUTO_PLAN_SOLVER_REVISION = 95;
export const AUTO_PLAN_SOLVER_ID = 'v9.5-cp-sat-lexicographic-lns';

export const V95_SOLVER_LOAD_ORDER = Object.freeze([
  Object.freeze({ id: 'or-tools-wasm', source: 'local', url: '/vendor/or-tools-wasm/cp-sat/index.js', version: '0.9.1' }),
  Object.freeze({ id: 'or-tools-wasm', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/or-tools-wasm@0.9.1/cp-sat/+esm', version: '0.9.1' }),
  Object.freeze({ id: 'cpsat-js', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/cpsat-js@1.0.0/+esm', version: '1.0.0' })
]);

const MAX_BOUND = 1_000_000;
let solverPromise = null;
let solverState = 'idle';
let solverFailure = null;

function normalizeSolverApi(module, id) {
  try {
    if (module?.CpModel && module?.CpSolver) {
      return {
        id,
        createModel() { return new module.CpModel(); },
        newIntVar(model, lb, ub, name) { return model.newIntVar(lb, ub, name); },
        addLinear(model, terms, lb, ub) {
          const expression = terms.reduce((accumulator, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return accumulator === null ? term : accumulator.plus(term);
          }, null);
          if (!expression) return null;
          return model.addLinearConstraint(expression, lb, ub);
        },
        minimize(model, terms) {
          const expression = terms.reduce((accumulator, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return accumulator === null ? term : accumulator.plus(term);
          }, null);
          if (expression && typeof model.minimize === 'function') model.minimize(expression);
        },
        addHint(model, variable, value) {
          if (typeof model.addHint === 'function') model.addHint(variable, value);
        },
        async solve(model, parameters) {
          const solver = new module.CpSolver();
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
        }
      };
    }
    if (module?.CpModel && module?.CpSolver?.create) {
      return {
        id,
        createModel() { return new module.CpModel(); },
        newIntVar(model, lb, ub, name) { return model.newIntVar(lb, ub, name); },
        addLinear(model, terms, lb, ub) {
          const expression = terms.reduce((accumulator, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return accumulator === null ? term : accumulator.plus(term);
          }, null);
          if (!expression) return null;
          return model.addLinearConstraint(expression, lb, ub);
        },
        minimize(model, terms) {
          const expression = terms.reduce((accumulator, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return accumulator === null ? term : accumulator.plus(term);
          }, null);
          if (expression && typeof model.minimize === 'function') model.minimize(expression);
        },
        addHint(model, variable, value) {
          if (typeof model.addHint === 'function') model.addHint(variable, value);
        },
        async solve(model, parameters) {
          const solver = await module.CpSolver.create();
          const result = await solver.solve(model, parameters);
          return {
            status: result.status,
            statusName: String(result.status || 'UNKNOWN'),
            objectiveValue: () => Number(result.objectiveValue ?? 0),
            bestBound: () => Number.isFinite(Number(result.bestObjectiveBound)) ? Number(result.bestObjectiveBound) : null,
            value: variable => Number(result.value(variable) ?? 0)
          };
        }
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeStatus(value) {
  const upper = String(value || 'UNKNOWN').toUpperCase();
  if (upper.includes('OPTIMAL')) return 'OPTIMAL';
  if (upper.includes('FEASIBLE')) return 'FEASIBLE';
  if (upper.includes('INFEASIBLE')) return 'INFEASIBLE';
  if (upper.includes('MODEL_INVALID')) return 'MODEL_INVALID';
  return 'UNKNOWN';
}

async function selfTestSolver(api) {
  const model = api.createModel();
  const variable = api.newIntVar(model, 0, 1, 'v95_self_test');
  api.addLinear(model, [[variable, 1]], 1, 1);
  api.minimize(model, [[variable, 1]]);
  const result = await api.solve(model, {
    max_time_in_seconds: 2,
    random_seed: 95,
    num_search_workers: 1,
    log_search_progress: false
  });
  const status = normalizeStatus(result.statusName);
  if (!['OPTIMAL', 'FEASIBLE'].includes(status) || result.value(variable) !== 1) {
    throw new Error(`CP-SAT-Selbsttest fehlgeschlagen (${status}).`);
  }
  return true;
}

export async function loadV95Solver({ signal = null } = {}) {
  if (solverPromise) return solverPromise;
  solverState = 'loading';
  solverPromise = (async () => {
    if (typeof globalThis === 'undefined' || typeof globalThis.document === 'undefined') {
      solverState = 'unavailable';
      return null;
    }
    for (const candidate of V95_SOLVER_LOAD_ORDER) {
      if (signal?.aborted) return null;
      try {
        const module = await import(/* webpackIgnore: true */ candidate.url);
        const api = normalizeSolverApi(module, candidate.id);
        if (!api) continue;
        await selfTestSolver(api);
        api.loadedFrom = candidate;
        solverState = 'ready';
        solverFailure = null;
        return api;
      } catch (error) {
        solverFailure = error?.message || String(error);
      }
    }
    solverState = 'unavailable';
    return null;
  })();
  return solverPromise;
}

export function v95SolverLoadState() {
  return { state: solverState, failure: solverFailure };
}

export function resetV95SolverForTests() {
  solverPromise = null;
  solverState = 'idle';
  solverFailure = null;
}

export function cpSatParametersV95({
  timeLimitMs = 10_000,
  maxWorkers = null,
  randomSeed = 95,
  logSearch = false
} = {}) {
  const parameters = {
    max_time_in_seconds: Math.max(0.05, Number(timeLimitMs || 10_000) / 1000),
    random_seed: Number.isInteger(Number(randomSeed)) ? Number(randomSeed) : 95,
    log_search_progress: Boolean(logSearch)
  };
  if (Number.isInteger(Number(maxWorkers)) && Number(maxWorkers) >= 1) {
    parameters.num_search_workers = Math.max(1, Math.min(8, Number(maxWorkers)));
  }
  return parameters;
}

function fixedAssignmentConstraints(model, fixedAssignments) {
  const constraints = [];
  for (const [slotKey, staffId] of Object.entries(fixedAssignments || {})) {
    const variableIndex = model.assignmentByKey.get(`${slotKey}|${staffId}`);
    if (variableIndex === undefined) {
      constraints.push({
        id: `lns-fixed-missing:${slotKey}`,
        group: 'lns-fix',
        terms: [],
        lb: 1,
        ub: 1,
        detail: `Fixierte LNS-Zuordnung ${slotKey} → ${staffId} ist nicht im Modell enthalten.`
      });
      continue;
    }
    constraints.push({
      id: `lns-fixed:${slotKey}`,
      group: 'lns-fix',
      terms: [[variableIndex, 1]],
      lb: 1,
      ub: 1,
      detail: `LNS hält ${slotKey} → ${staffId} fest.`
    });
  }
  return constraints;
}

function objectiveFixConstraints(model, fixedObjectives) {
  return (fixedObjectives || []).map(item => {
    const component = model.components[item.componentId];
    return {
      id: `lexicographic-fix:${item.componentId}`,
      group: 'lexicographic-fix',
      terms: component?.terms || [],
      lb: Number(item.value) - Number(component?.constant || 0),
      ub: Number(item.value) - Number(component?.constant || 0),
      detail: `Lexikografischer Optimalwert ${item.componentId} = ${item.value}.`
    };
  });
}

/**
 * Bindet das reine Modell an eine konkrete WASM-API und löst genau eine Phase.
 */
export async function solveBooleanPhase(model, api, {
  componentId = null,
  fixedObjectives = [],
  fixedAssignments = {},
  activeGroups = null,
  timeLimitMs = 10_000,
  maxWorkers = null,
  randomSeed = 95,
  solutionHint = null,
  logSearch = false
} = {}) {
  if (!model || !api) {
    return { status: 'UNKNOWN', statusName: 'UNKNOWN', reason: 'solver-unavailable', solution: {}, values: [] };
  }
  if (model.structuralConflicts?.length) {
    return {
      status: 'INFEASIBLE',
      statusName: 'INFEASIBLE',
      reason: 'structural-conflict',
      structuralConflicts: model.structuralConflicts,
      solution: {},
      values: []
    };
  }

  const startedAt = Date.now();
  try {
    const boundModel = api.createModel();
    const boundVariables = model.variables.map(variable =>
      api.newIntVar(boundModel, variable.lb, variable.ub, variable.name));
    const groupFilter = activeGroups === null ? null : new Set(activeGroups);
    const extra = [
      ...objectiveFixConstraints(model, fixedObjectives),
      ...fixedAssignmentConstraints(model, fixedAssignments)
    ];
    let appliedConstraints = 0;

    const applyConstraint = constraint => {
      if (groupFilter && !groupFilter.has(constraint.group)
        && !['lexicographic-fix', 'lns-fix'].includes(constraint.group)) return;
      const terms = constraint.terms.map(([index, coefficient]) => [boundVariables[index], coefficient]);
      if (!terms.length) {
        if (!(constraint.lb <= 0 && constraint.ub >= 0)) throw new Error(`Konstante Nebenbedingung ${constraint.id} ist unzulässig.`);
        return;
      }
      api.addLinear(boundModel, terms, constraint.lb, constraint.ub);
      appliedConstraints += 1;
    };

    for (const constraint of model.constraints) applyConstraint(constraint);
    for (const constraint of extra) applyConstraint(constraint);

    const component = componentId ? model.components?.[componentId] : null;
    if (component?.terms?.length) {
      api.minimize(boundModel, component.terms.map(([index, coefficient]) => [boundVariables[index], coefficient]));
    }

    const mergedHints = { ...model.hintMap };
    if (solutionHint) {
      for (const variable of model.assignmentVariables) {
        const selected = solutionHint[variable.slot.key] === variable.staffId;
        mergedHints[variable.index] = selected ? 1 : 0;
      }
    }
    for (const [rawIndex, rawValue] of Object.entries(mergedHints)) {
      const index = Number(rawIndex);
      if (boundVariables[index]) api.addHint(boundModel, boundVariables[index], Number(rawValue));
    }

    const result = await api.solve(boundModel, cpSatParametersV95({
      timeLimitMs,
      maxWorkers,
      randomSeed,
      logSearch
    }));
    const status = normalizeStatus(result.statusName || result.status);
    const hasSolution = status === 'OPTIMAL' || status === 'FEASIBLE';
    const values = hasSolution
      ? model.variables.map((variable, index) => Number(result.value(boundVariables[index]) || 0))
      : [];
    const solution = {};
    if (hasSolution) {
      for (const variable of model.assignmentVariables) {
        if (values[variable.index] === 1) solution[variable.slot.key] = variable.staffId;
      }
    }
    const objectiveValue = componentId && hasSolution
      ? objectiveValueForComponent(model, componentId, values)
      : 0;
    const rawBound = result.bestBound?.();
    const bestBound = Number.isFinite(Number(rawBound))
      ? Number(rawBound) + Number(component?.constant || 0)
      : null;
    const gap = hasSolution && Number.isFinite(bestBound)
      ? Math.max(0, Math.abs(objectiveValue - bestBound))
      : null;

    return {
      status,
      statusName: status,
      componentId,
      objectiveValue,
      bestBound,
      gap,
      values,
      solution,
      appliedConstraints,
      wallTimeMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'UNKNOWN',
      statusName: 'UNKNOWN',
      reason: 'solve-failed',
      error: error?.message || String(error),
      solution: {},
      values: [],
      wallTimeMs: Date.now() - startedAt
    };
  }
}

export function phaseOrderForConfig(model, config = {}, variant = 'balanced') {
  const safety = ['confirmations', 'orange', 'yellow'];
  const fairness = ['fairnessMax', 'targetDeviation', 'combinedSpread', 'weekendSpread'];
  const patterns = ['splitWeekend'];
  const wishes = ['wishes', 'recommendations'];
  let ordered;
  if (variant === 'wishes' || config.optimizationFocus === 'wishes') ordered = [...safety, ...wishes, ...fairness, ...patterns];
  else if (variant === 'weekends' || config.optimizationFocus === 'weekends') ordered = [...safety, ...patterns, 'weekendSpread', 'fairnessMax', 'targetDeviation', 'combinedSpread', ...wishes];
  else if (variant === 'workload' || config.optimizationFocus === 'workload') ordered = [...safety, ...fairness, ...patterns, ...wishes];
  else ordered = [...safety, 'fairnessMax', 'targetDeviation', ...patterns, 'combinedSpread', 'weekendSpread', ...wishes];
  return ordered.filter((id, index) => model.components?.[id] && ordered.indexOf(id) === index);
}

/**
 * Löst die Zielkomponenten nacheinander. Ein Wert wird nur dann als bewiesen
 * optimal markiert, wenn die betreffende Phase OPTIMAL zurückgegeben hat.
 */
export async function solveLexicographicV95(model, api, {
  config = {},
  phaseOrder = null,
  fixedAssignments = {},
  timeBudgetMs = 10_000,
  maxWorkers = null,
  randomSeed = 95,
  strictCertification = true,
  onProgress = null,
  signal = null,
  progressStart = 0,
  progressSpan = 1,
  variant = 'balanced'
} = {}) {
  const order = phaseOrder || phaseOrderForConfig(model, config, variant);
  const trace = [];
  const fixedObjectives = [];
  let bestSolution = null;
  let allOptimal = true;
  let stoppedByLimit = false;
  const startedAt = Date.now();

  const activePhases = order.filter(componentId => {
    const component = model.components[componentId];
    return component && (component.terms.length || component.constant !== 0);
  });
  if (!activePhases.length) activePhases.push(null);

  for (let phaseIndex = 0; phaseIndex < activePhases.length; phaseIndex += 1) {
    if (signal?.aborted) {
      return { status: 'ABORTED', solution: bestSolution || {}, trace, certified: false, allOptimal: false };
    }
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(100, timeBudgetMs - elapsed);
    const remainingPhases = Math.max(1, activePhases.length - phaseIndex);
    const phaseBudget = Math.max(100, Math.floor(remaining / remainingPhases));
    const componentId = activePhases[phaseIndex];
    await onProgress?.({
      phase: 'exact',
      stage: 'cp-sat-v9.5',
      progress: progressStart + (phaseIndex / Math.max(1, activePhases.length)) * progressSpan,
      message: componentId
        ? `CP-SAT v9.5 · ${model.components[componentId].label}`
        : 'CP-SAT v9.5 · Zulässigkeit wird geprüft',
      cpSatPhase: componentId,
      cpSatPhaseIndex: phaseIndex,
      cpSatPhaseCount: activePhases.length
    });

    const result = await solveBooleanPhase(model, api, {
      componentId,
      fixedObjectives,
      fixedAssignments,
      timeLimitMs: phaseBudget,
      maxWorkers,
      randomSeed: Number(randomSeed) + phaseIndex,
      solutionHint: bestSolution,
      logSearch: Boolean(config.v95LogSearch)
    });
    trace.push({
      componentId,
      label: componentId ? model.components[componentId].label : 'Zulässigkeit',
      status: result.status,
      objectiveValue: result.objectiveValue,
      bestBound: result.bestBound,
      gap: result.gap,
      wallTimeMs: result.wallTimeMs,
      proven: result.status === 'OPTIMAL'
    });

    if (!['OPTIMAL', 'FEASIBLE'].includes(result.status)) {
      return {
        status: result.status,
        solution: bestSolution || {},
        trace,
        certified: false,
        allOptimal: false,
        infeasible: result.status === 'INFEASIBLE',
        reason: result.reason,
        error: result.error,
        wallTimeMs: Date.now() - startedAt
      };
    }

    bestSolution = result.solution;
    if (result.status !== 'OPTIMAL') {
      allOptimal = false;
      stoppedByLimit = true;
      if (strictCertification) break;
    }
    if (componentId) fixedObjectives.push({ componentId, value: result.objectiveValue, proven: result.status === 'OPTIMAL' });
  }

  return {
    status: allOptimal ? 'OPTIMAL' : 'FEASIBLE',
    solution: bestSolution || {},
    trace,
    fixedObjectives,
    certified: allOptimal && trace.length > 0 && trace.every(item => item.proven),
    allOptimal,
    stoppedByLimit,
    wallTimeMs: Date.now() - startedAt
  };
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function solutionFromMonth(model, monthData) {
  const solution = {};
  for (const slot of model.openSlots) {
    const staffId = monthData?.days?.[slot.dateIso]?.[slot.role];
    if (staffId) solution[slot.key] = staffId;
  }
  return solution;
}

function splitWeekendSlots(model, solution) {
  const selected = new Set();
  const dates = [...new Set(model.openSlots.map(slot => slot.dateIso))].sort();
  for (const fridayIso of dates.filter(dateIso => new Date(`${dateIso}T12:00:00`).getDay() === 5)) {
    const date = new Date(`${fridayIso}T12:00:00`);
    date.setDate(date.getDate() + 2);
    const sundayIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const fridayStaff = solution[`${fridayIso}|bd`];
    const sundayStaff = solution[`${sundayIso}|bd`];
    if (fridayStaff && fridayStaff === sundayStaff) {
      for (const slot of model.openSlots) {
        if ([fridayIso, sundayIso].includes(slot.dateIso)) selected.add(slot.key);
      }
    }
  }
  return selected;
}

function loadFocusedSlots(model, solution) {
  const counts = new Map();
  for (const staffId of Object.values(solution || {})) counts.set(staffId, (counts.get(staffId) || 0) + 1);
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])));
  const focus = new Set(ordered.slice(0, 2).map(([staffId]) => staffId));
  return new Set(model.openSlots.filter(slot => focus.has(solution[slot.key])).map(slot => slot.key));
}

function weekendBlockSlots(model, round) {
  const weekends = [...new Set(model.openSlots
    .filter(slot => [5, 6, 0].includes(new Date(`${slot.dateIso}T12:00:00`).getDay()))
    .map(slot => {
      const date = new Date(`${slot.dateIso}T12:00:00`);
      const day = date.getDay();
      date.setDate(date.getDate() - ((day + 2) % 7));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }))].sort();
  if (!weekends.length) return new Set();
  const friday = weekends[round % weekends.length];
  const start = new Date(`${friday}T12:00:00`);
  const dates = new Set(Array.from({ length: 3 }, (_, offset) => {
    const value = new Date(start);
    value.setDate(start.getDate() + offset);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }));
  return new Set(model.openSlots.filter(slot => dates.has(slot.dateIso)).map(slot => slot.key));
}

function randomSlots(model, round, config, random) {
  const percentage = Math.max(10, Math.min(60, Number(config.v95NeighborhoodPercent || 28)));
  const count = Math.max(4, Math.round(model.openSlots.length * percentage / 100));
  const ranked = model.openSlots.map(slot => ({ slot, value: random() + round * 1e-9 }))
    .sort((left, right) => left.value - right.value)
    .slice(0, count);
  return new Set(ranked.map(entry => entry.slot.key));
}

function relaxedSlotsForRound(model, solution, round, config, random) {
  const mode = round % 4;
  let selected = mode === 0
    ? splitWeekendSlots(model, solution)
    : mode === 1
      ? loadFocusedSlots(model, solution)
      : mode === 2
        ? weekendBlockSlots(model, round)
        : randomSlots(model, round, config, random);
  if (selected.size < Math.min(4, model.openSlots.length)) {
    selected = new Set([...selected, ...randomSlots(model, round, config, random)]);
  }
  return selected;
}

/**
 * Constraint-gesteuerte Large-Neighborhood Search. Nur der freigegebene
 * Ausschnitt wird neu gelöst; alle übrigen Slotzuordnungen werden hart fixiert.
 */
export async function runConstraintLnsV95({
  model,
  api,
  baseline,
  initialMonth,
  config = {},
  evaluateMonth,
  compareObjectives,
  randomSeed = 95,
  maxWorkers = null,
  onProgress = null,
  signal = null
} = {}) {
  if (!model || !api || !initialMonth || typeof evaluateMonth !== 'function') {
    return { monthData: initialMonth, rounds: [], improvements: 0 };
  }
  const roundsTarget = Math.max(0, Math.min(20, Number(config.v95LnsRounds ?? 6)));
  if (!roundsTarget) return { monthData: initialMonth, rounds: [], improvements: 0 };

  const random = seededRandom(randomSeed);
  let incumbentMonth = initialMonth;
  let incumbentObjective = evaluateMonth(incumbentMonth);
  let incumbentSolution = solutionFromMonth(model, incumbentMonth);
  let improvements = 0;
  const rounds = [];
  const totalBudget = Math.max(500, Number(config.v95LnsBudgetMs || Math.round(Number(config.cpSatTimeBudgetSeconds || 10) * 350)));
  const perRoundBudget = Math.max(150, Math.floor(totalBudget / Math.max(1, roundsTarget)));

  for (let round = 0; round < roundsTarget; round += 1) {
    if (signal?.aborted) break;
    const relaxed = relaxedSlotsForRound(model, incumbentSolution, round, config, random);
    const fixedAssignments = Object.fromEntries(Object.entries(incumbentSolution)
      .filter(([slotKey]) => !relaxed.has(slotKey)));
    await onProgress?.({
      phase: 'perfect',
      stage: 'cp-sat-lns-v9.5',
      progress: .72 + (round / Math.max(1, roundsTarget)) * .18,
      message: `LNS ${round + 1}/${roundsTarget} · ${relaxed.size} Dienstfelder werden exakt neu verbunden`,
      lnsRound: round + 1,
      lnsRounds: roundsTarget,
      relaxedSlots: relaxed.size
    });
    const solved = await solveLexicographicV95(model, api, {
      config,
      fixedAssignments,
      timeBudgetMs: perRoundBudget,
      maxWorkers,
      randomSeed: Number(randomSeed) + 100 + round,
      strictCertification: false,
      signal,
      variant: round % 2 ? 'workload' : 'balanced'
    });
    if (!Object.keys(solved.solution || {}).length) {
      rounds.push({ round: round + 1, relaxedSlots: relaxed.size, status: solved.status, improved: false });
      continue;
    }
    const candidateMonth = materializeBooleanSolution(model, baseline, solved.solution);
    const candidateObjective = evaluateMonth(candidateMonth);
    const improved = typeof compareObjectives === 'function'
      ? compareObjectives(candidateObjective.key, incumbentObjective.key) < 0
      : JSON.stringify(candidateObjective.key) < JSON.stringify(incumbentObjective.key);
    if (improved) {
      incumbentMonth = candidateMonth;
      incumbentObjective = candidateObjective;
      incumbentSolution = solved.solution;
      improvements += 1;
    }
    rounds.push({
      round: round + 1,
      relaxedSlots: relaxed.size,
      status: solved.status,
      improved,
      objectiveKey: candidateObjective.key
    });
  }

  return { monthData: incumbentMonth, objective: incumbentObjective, rounds, improvements };
}

/**
 * Konservative Konfliktgruppendiagnose. Sie wird bewusst als Konfliktkern-
 * Annäherung bezeichnet und behauptet keine minimale unzulässige Teilmenge.
 */
export async function diagnoseConflictGroupsV95(model, api, {
  timeLimitMs = 2500,
  maxWorkers = 1,
  randomSeed = 95
} = {}) {
  if (model?.structuralConflicts?.length) {
    return {
      infeasible: true,
      exact: true,
      groups: [...new Set(model.structuralConflicts.map(item => item.group))],
      constraints: model.structuralConflicts,
      detail: 'Das Modell enthält bereits ohne Suche widersprüchliche konstante Nebenbedingungen.'
    };
  }
  if (!model || !api) return { infeasible: true, exact: false, groups: [], detail: 'Solver nicht verfügbar.' };
  const allGroups = [...new Set(model.constraints.map(constraint => constraint.group))];
  const base = await solveBooleanPhase(model, api, {
    activeGroups: allGroups,
    timeLimitMs,
    maxWorkers,
    randomSeed
  });
  if (base.status !== 'INFEASIBLE') {
    return { infeasible: false, exact: base.status === 'OPTIMAL', groups: [], detail: 'Keine nachgewiesene Unzulässigkeit.' };
  }
  const necessary = [];
  for (let index = 0; index < allGroups.length; index += 1) {
    const group = allGroups[index];
    const activeGroups = allGroups.filter(item => item !== group);
    const trial = await solveBooleanPhase(model, api, {
      activeGroups,
      timeLimitMs: Math.max(250, Math.floor(timeLimitMs / Math.max(1, allGroups.length))),
      maxWorkers,
      randomSeed: Number(randomSeed) + index + 1
    });
    if (trial.status === 'OPTIMAL' || trial.status === 'FEASIBLE') necessary.push(group);
  }
  return {
    infeasible: true,
    exact: false,
    groups: necessary,
    constraints: model.constraints.filter(constraint => necessary.includes(constraint.group)).map(constraint => ({
      id: constraint.id,
      group: constraint.group,
      detail: constraint.detail
    })),
    detail: necessary.length
      ? `Konfliktkern-Annäherung: ${necessary.join(', ')}.`
      : 'Die Unzulässigkeit entsteht aus einer Kombination mehrerer Regelgruppen; keine einzelne Gruppe löst sie allein auf.'
  };
}

export function hintsForV95Model(monthData, baseline) {
  return assignmentHintsFromMonth(monthData, baseline);
}
