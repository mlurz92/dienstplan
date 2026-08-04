import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.TZ = 'Europe/Berlin';

const planner = await import('../js/auto-planner.js');
const modelApi = await import('../js/auto-plan-model-v9-5.js');
const solverApi = await import('../js/auto-plan-solver-v9-5.js');
const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { evaluateCandidate, setAssignment, setPreference } = await import('../js/rules.js');

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

function emptyDay() {
  return { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
}

function miniMonth(dates) {
  return {
    schemaVersion: 1,
    year: Number(dates[0].slice(0, 4)),
    month: Number(dates[0].slice(5, 7)),
    revision: 0,
    updatedAt: null,
    days: Object.fromEntries(dates.map(dateIso => [dateIso, emptyDay()])),
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function stateWith(monthData, staff = structuredClone(DEFAULT_STAFF)) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData]]),
    staff,
    settings: { autoPlan: {} },
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

function canonicalModel(model) {
  const variableName = index => model.variables[index]?.name || `missing:${index}`;
  return {
    assignments: model.assignmentVariables.map(variable => ({
      name: variable.name,
      slot: variable.slot.key,
      staffId: variable.staffId,
      lb: variable.lb,
      ub: variable.ub
    })).sort((left, right) => left.name.localeCompare(right.name)),
    constraints: model.constraints.map(constraint => ({
      id: constraint.id,
      group: constraint.group,
      lb: constraint.lb,
      ub: constraint.ub,
      terms: constraint.terms
        .map(([index, coefficient]) => [variableName(index), coefficient])
        .sort(([left], [right]) => left.localeCompare(right))
    })).sort((left, right) => left.id.localeCompare(right.id)),
    phases: [...model.phaseOrder]
  };
}

function fakeApi(statuses) {
  let solveIndex = 0;
  let variableIndex = 0;
  return {
    createModel() { return {}; },
    newIntVar(_model, lb, ub, name) { return { index: variableIndex++, lb, ub, name }; },
    addLinear() { return {}; },
    minimize() {},
    addHint() {},
    async solve() {
      const statusName = statuses[Math.min(solveIndex, statuses.length - 1)];
      solveIndex += 1;
      return {
        statusName,
        objectiveValue: () => 1,
        bestBound: () => statusName === 'OPTIMAL' ? 1 : 0,
        value: () => 1
      };
    }
  };
}

function tinySolverModel() {
  const assignment = {
    index: 0,
    name: 'x_2026-07-03_bd_lurz',
    lb: 0,
    ub: 1,
    kind: 'assignment',
    staffId: 'lurz',
    slot: { dateIso: '2026-07-03', role: 'bd', key: '2026-07-03|bd' }
  };
  return {
    variables: [assignment],
    assignmentVariables: [assignment],
    auxiliaryVariables: [],
    assignmentByKey: new Map([['2026-07-03|bd|lurz', 0]]),
    constraints: [{
      id: 'coverage:2026-07-03|bd',
      group: 'coverage',
      terms: [[0, 1]],
      lb: 1,
      ub: 1,
      detail: 'genau einmal'
    }],
    structuralConflicts: [],
    components: {
      first: { id: 'first', label: 'Erste Phase', terms: [[0, 1]], constant: 0 },
      second: { id: 'second', label: 'Zweite Phase', terms: [[0, 1]], constant: 0 }
    },
    phaseOrder: ['first', 'second'],
    hintMap: {},
    openSlots: [assignment.slot]
  };
}

test('öffentlicher Einstieg meldet Auto-Plan v9.5 und den vollständigen Phasenvertrag', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 9.5);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v9.5-correct-boolean-matheuristic');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id), [
    'analysis', 'warmstart', 'model', 'exact', 'lns', 'audit', 'alternatives', 'certify'
  ]);
  assert.ok(planner.AUTO_PLAN_STAGES.every(stage => stage.title && stage.detail));
});

test('Boolean-Modell erzeugt ausschließlich binäre Slot-Person-Zuordnungen', () => {
  const monthData = miniMonth(['2026-07-01', '2026-07-02', '2026-07-03']);
  const state = stateWith(monthData);
  const config = planner.normalizeV95Config(state, monthData, { allowRedFallback: true });
  const model = modelApi.buildBooleanAutoPlanModel({ state, monthData, baseline: monthData, config });

  assert.equal(model.revision, 95);
  assert.ok(model.assignmentVariables.length > model.openSlots.length);
  assert.ok(model.assignmentVariables.every(variable => variable.kind === 'assignment' && variable.lb === 0 && variable.ub === 1));
  assert.ok(model.assignmentVariables.every(variable => variable.staffId && variable.slot?.key));
  assert.ok(model.variables.every((variable, index) => variable.index === index));

  for (const slot of model.openSlots) {
    const coverage = model.constraints.find(constraint => constraint.id === `coverage:${slot.key}`);
    assert.ok(coverage, `Coverage fehlt für ${slot.key}`);
    assert.equal(coverage.lb, 1);
    assert.equal(coverage.ub, 1);
    assert.deepEqual(
      new Set(coverage.terms.map(([index]) => index)),
      new Set(model.assignmentsBySlot.get(slot.key)),
      `Coverage-Domäne weicht für ${slot.key} ab`
    );
  }
});

test('personengebundene BD-Grenzen summieren nur Variablen der betreffenden Person', () => {
  const monthData = miniMonth(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']);
  const state = stateWith(monthData);
  const person = state.staff.find(candidate => candidate.id === 'lurz') || state.staff[0];
  const config = planner.normalizeV95Config(state, monthData, {
    staffLimits: { [person.id]: { maxBd: 1, maxHg: null, maxTotal: null } }
  });
  const model = modelApi.buildBooleanAutoPlanModel({ state, monthData, baseline: monthData, config });
  const limit = model.constraints.find(constraint => constraint.id === `monthly-bd-limit:${person.id}`);
  assert.ok(limit, 'personenbezogene BD-Grenze fehlt');
  assert.ok(limit.terms.length > 0);
  for (const [variableIndex, coefficient] of limit.terms) {
    const variable = model.variables[variableIndex];
    assert.equal(coefficient, 1);
    assert.equal(variable.kind, 'assignment');
    assert.equal(variable.staffId, person.id);
    assert.equal(variable.slot.role, 'bd');
  }
  assert.ok(!limit.terms.some(([index]) => model.variables[index].staffId !== person.id));
});

test('Personalreihenfolge verändert die semantische Boolean-Modellierung nicht', () => {
  const monthData = miniMonth(['2026-07-01', '2026-07-02', '2026-07-03']);
  const staff = structuredClone(DEFAULT_STAFF);
  const normalState = stateWith(structuredClone(monthData), staff);
  const reversedState = stateWith(structuredClone(monthData), [...structuredClone(staff)].reverse());
  const normalConfig = planner.normalizeV95Config(normalState, normalState.months.values().next().value, {});
  const reversedConfig = planner.normalizeV95Config(reversedState, reversedState.months.values().next().value, {});
  const normal = modelApi.buildBooleanAutoPlanModel({
    state: normalState,
    monthData: normalState.months.values().next().value,
    baseline: normalState.months.values().next().value,
    config: normalConfig
  });
  const reversed = modelApi.buildBooleanAutoPlanModel({
    state: reversedState,
    monthData: reversedState.months.values().next().value,
    baseline: reversedState.months.values().next().value,
    config: reversedConfig
  });
  assert.deepEqual(canonicalModel(normal), canonicalModel(reversed));
});

test('Dienstwünsche verwenden echte Erfüllungsvariablen statt Personenindex-Abstände', () => {
  const monthData = miniMonth(['2026-07-01', '2026-07-02']);
  const state = stateWith(monthData);
  const person = state.staff.find(candidate => candidate.id === 'lurz') || state.staff[0];
  setPreference(monthData, person.id, '2026-07-01', 'bd-bevorzugt');
  const config = planner.normalizeV95Config(state, monthData, {});
  const model = modelApi.buildBooleanAutoPlanModel({ state, monthData, baseline: monthData, config });
  const wish = model.constraints.find(constraint => constraint.id === `wish-satisfaction:2026-07-01:${person.id}`);
  assert.ok(wish, 'Wunscherfüllungsconstraint fehlt');
  assert.equal(wish.lb, 1);
  assert.equal(wish.ub, 1);
  assert.ok(wish.terms.some(([index]) => model.variables[index].name.startsWith('missed_wish_')));
  assert.ok(model.components.wishes.terms.every(([index]) => model.variables[index].kind === 'auxiliary'));
  assert.ok(!model.components.wishes.terms.some(([index]) => model.variables[index].kind === 'assignment'));
});

test('Freitag-BD und Sonntag-BD derselben Person wird in Modell und Regelengine vermieden', () => {
  const dates = ['2026-07-03', '2026-07-04', '2026-07-05'];
  const monthData = miniMonth(dates);
  const state = stateWith(monthData);
  const person = state.staff.find(candidate => candidate.id === 'lurz') || state.staff[0];
  setAssignment(monthData, '2026-07-03', 'bd', person.id);
  const evaluation = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-05',
    role: 'bd',
    staffId: person.id
  });
  assert.equal(evaluation.meta?.splitWeekendBd, true);
  assert.ok(evaluation.reasons.some(reason => /Freitag-BD, Samstag frei, Sonntag-BD/.test(reason)));
  assert.ok(['yellow', 'orange', 'red'].includes(evaluation.level));

  const openMonth = miniMonth(dates);
  const openState = stateWith(openMonth);
  const config = planner.normalizeV95Config(openState, openMonth, { v95SplitWeekendWeight: 11 });
  const model = modelApi.buildBooleanAutoPlanModel({ state: openState, monthData: openMonth, baseline: openMonth, config });
  assert.ok(model.auxiliaryVariables.some(variable => variable.name.startsWith('split_weekend_')));
  assert.ok(model.components.splitWeekend.terms.length > 0);
  assert.ok(model.components.splitWeekend.terms.every(([, coefficient]) => coefficient === 11));
});

test('FEASIBLE wird in strikter Lexikografie niemals als zertifiziert ausgegeben', async () => {
  const result = await solverApi.solveLexicographicV95(tinySolverModel(), fakeApi(['FEASIBLE']), {
    phaseOrder: ['first', 'second'],
    strictCertification: true,
    timeBudgetMs: 1000
  });
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.certified, false);
  assert.equal(result.allOptimal, false);
  assert.equal(result.trace.length, 1, 'strikter Nachweis muss nach nicht optimaler Phase enden');
  assert.equal(result.trace[0].proven, false);
});

test('Zertifizierung erfordert OPTIMAL in jeder ausgeführten Phase', async () => {
  const result = await solverApi.solveLexicographicV95(tinySolverModel(), fakeApi(['OPTIMAL', 'OPTIMAL']), {
    phaseOrder: ['first', 'second'],
    strictCertification: true,
    timeBudgetMs: 1000
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.certified, true);
  assert.equal(result.allOptimal, true);
  assert.equal(result.trace.length, 2);
  assert.ok(result.trace.every(entry => entry.proven));
  assert.deepEqual(result.fixedObjectives.map(item => item.componentId), ['first', 'second']);
});

test('CP-SAT-v9.5-Parameter begrenzen Zeit, Threads und Seed defensiv', () => {
  const parameters = solverApi.cpSatParametersV95({ timeLimitMs: 2500, maxWorkers: 99, randomSeed: 7 });
  assert.equal(parameters.max_time_in_seconds, 2.5);
  assert.equal(parameters.num_search_workers, 8);
  assert.equal(parameters.random_seed, 7);
  const minimum = solverApi.cpSatParametersV95({ timeLimitMs: 1, maxWorkers: 0 });
  assert.equal(minimum.max_time_in_seconds, 0.05);
  assert.equal(minimum.num_search_workers, undefined);
});

test('Solver-Loader nutzt verifizierte Paketversionen und lokalen Vorrang', () => {
  assert.equal(solverApi.V95_SOLVER_LOAD_ORDER[0].source, 'local');
  assert.equal(solverApi.V95_SOLVER_LOAD_ORDER[0].id, 'or-tools-wasm');
  assert.ok(solverApi.V95_SOLVER_LOAD_ORDER.some(candidate => candidate.url.includes('or-tools-wasm@0.9.1')));
  assert.ok(solverApi.V95_SOLVER_LOAD_ORDER.some(candidate => candidate.url.includes('cpsat-js@1.0.0')));
  assert.ok(!solverApi.V95_SOLVER_LOAD_ORDER.some(candidate => candidate.url.includes('cpsat-js@1.3.0')));
});

test('Studio v9.5 registriert LNS, Alternativen, Split-Wochenende und exhaustive Tooltips', async () => {
  const text = await source('../js/auto-plan-studio-v9-5.js');
  for (const id of [
    'autoPlanV95LnsRounds', 'autoPlanV95Neighborhood', 'autoPlanV95Alternatives',
    'autoPlanV95SplitWeekendWeight', 'autoPlanV95LogSearch'
  ]) {
    assert.match(text, new RegExp(id));
  }
  assert.match(text, /installExhaustiveTooltips/);
  assert.match(text, /setRichTooltip/);
  assert.match(text, /Konfliktkern-Annäherung/);
  assert.match(text, /Modelloptimal/);
  assert.doesNotMatch(text, /LLM-gestützt/);
});

test('v9.5-CSS erzwingt Modal-Fit, internes Logscrollen und kontrastreiche Dark-Mode-Flächen', async () => {
  const css = await source('../auto-plan-studio-v9-5.css');
  assert.match(css, /height:\s*min\(94dvh,\s*980px\)/);
  assert.match(css, /overflow:\s*hidden\s*!important/);
  assert.match(css, /#autoPlanConfig,[\s\S]*#autoPlanStage,[\s\S]*#autoPlanResult/);
  assert.match(css, /\.auto-plan-log\s*\{[\s\S]*height:\s*clamp/);
  assert.match(css, /\.auto-plan-log-stream\s*\{[\s\S]*overflow-y:\s*auto\s*!important/);
  assert.match(css, /html\[data-color-scheme="dark"\]/);
  assert.match(css, /\.auto-plan-row-status\.red/);
  assert.match(css, /@media \(max-width:\s*420px\)/);
  assert.match(css, /@media \(forced-colors:\s*active\)/);
});

test('Auto-Plan-UI lädt die v9.5-Schicht nach den kompatiblen Basisschichten', async () => {
  const text = await source('../js/auto-plan-ui.js');
  const v85 = text.indexOf('auto-plan-studio-v8-5.js');
  const v9 = text.indexOf('auto-plan-studio-v9.js');
  const v95 = text.indexOf('auto-plan-studio-v9-5.js');
  assert.ok(v85 >= 0 && v9 > v85 && v95 > v9);
});
