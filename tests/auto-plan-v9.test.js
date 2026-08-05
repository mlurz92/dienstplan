import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.TZ = 'Europe/Berlin';

const planner = await import('../js/auto-planner.js');
const bridge = await import('../js/auto-plan-cp-sat.js');
const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAssignment, setPreference } = await import('../js/rules.js');
const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

function emptyDay() {
  return { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
}

function miniMonth(dates) {
  const days = Object.fromEntries(dates.map(dateIso => [dateIso, emptyDay()]));
  return {
    schemaVersion: 1,
    year: Number(dates[0].slice(0, 4)),
    month: Number(dates[0].slice(5, 7)),
    revision: 0,
    updatedAt: null,
    days,
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function stateWith(monthData, staff = structuredClone(DEFAULT_STAFF), extraMonths = []) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData], ...extraMonths]),
    staff,
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

async function plan(monthData, options = {}) {
  const plannerState = options.state || stateWith(monthData);
  return planner.buildAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    beamWidth: 14,
    branchLimit: 12,
    ...options
  });
}

test('v9 exportiert Revision 9, die hybride Engine und alle Pflichtphasen', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 9);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v9-hybrid-exact-observatory');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id), [
    'analysis', 'model', 'exact', 'rescue', 'repair', 'perfect', 'audit', 'certify'
  ]);
  assert.ok(planner.AUTO_PLAN_STAGES.every(stage => stage.title && stage.detail));
});

test('v9 erhält die vollständige öffentliche Engine-API', () => {
  for (const name of [
    'validateAutoPlanConfig', 'normalizeAutoPlanConfig', 'autoPlanConfigFingerprint',
    'applyAutoPlanProposal', 'evaluatePlanObjective', 'compareObjectiveKeys',
    'listOpenSlots', 'listProposedAssignments', 'planningFingerprint', 'deriveV85Tuning'
  ]) {
    assert.equal(typeof planner[name], 'function', `${name} muss re-exportiert bleiben`);
  }
});

test('v9-Konfiguration trägt die neuen exakten Felder mit sinnvollen Defaults', () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07']);
  const config = planner.normalizeAutoPlanConfig(stateWith(monthData), monthData, {});
  assert.equal(config.solverBackend, 'auto');
  assert.equal(config.cpSatTimeBudgetSeconds, 10);
  assert.equal(config.cpSatWarmStart, 'heuristic');
  assert.equal(config.fairnessProfile, 'leximin');
  assert.equal(config.deterministic, true);
  assert.equal(config.infeasibilityMode, 'mus');
  assert.equal(config.repairOnEdit, true);
  assert.equal(config.explanationDepth, 'detailed');
});

test('v9-Konfiguration validiert die neuen Felder und kappt Wertebereiche', () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07']);
  const state = stateWith(monthData);
  const config = planner.normalizeAutoPlanConfig(state, monthData, {
    solverBackend: 'cp-sat-exact',
    cpSatTimeBudgetSeconds: 999,
    cpSatWorkers: 12,
    fairnessProfile: 'owa',
    deterministic: false,
    infeasibilityMode: 'relax'
  });
  assert.equal(config.solverBackend, 'cp-sat-exact');
  assert.equal(config.cpSatTimeBudgetSeconds, 60);
  assert.equal(config.cpSatWorkers, 8);
  assert.equal(config.fairnessProfile, 'owa');
  assert.equal(config.deterministic, false);
  assert.equal(config.infeasibilityMode, 'relax');
  const unknown = planner.normalizeAutoPlanConfig(state, monthData, { solverBackend: 'quanten' });
  assert.equal(unknown.solverBackend, 'auto');
});

test('CP-SAT-Modellbau deckt alle offenen Felder mit Domänen und Coverage ab', () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08']);
  const state = stateWith(monthData);
  const model = bridge.buildCpSatModel({ state, monthData, baseline: monthData, config: {} });
  assert.equal(model.counts.openSlots, 6);
  assert.equal(model.variables.length, 6);
  assert.equal(model.variables[0].lb, 0);
  assert.equal(model.variables[0].ub, model.counts.staff);
  const coverage = model.hardConstraints.filter(constraint => constraint.group === 'coverage');
  assert.equal(coverage.length, 6);
  assert.ok(coverage.every(constraint => constraint.lb === 1));
  assert.ok(model.hardConstraints.some(constraint => constraint.group === 'sequence'));
  assert.ok(model.hardConstraints.some(constraint => constraint.group === 'qualification'));
  assert.ok(model.components.fairness.terms.length >= 1);
  assert.ok(model.components.wishes);
  assert.ok(model.components.bdTarget);
  assert.ok(model.counts.staff >= 8);
});

test('CP-SAT-Modellbau erkennt Fixpunkte und Doppelbelegungen', () => {
  const dates = ['2026-07-06', '2026-07-07', '2026-07-08'];
  const monthData = miniMonth(dates);
  const state = stateWith(monthData);
  setAssignment(monthData, dates[2], 'hg', DEFAULT_STAFF[0].id);
  const model = bridge.buildCpSatModel({ state, monthData, baseline: monthData, config: {} });
  assert.equal(model.counts.openSlots, 5);
  const exclusive = model.hardConstraints.filter(constraint => constraint.id.startsWith('exclusive_'));
  assert.ok(exclusive.length > 0);
  const rest = model.hardConstraints.filter(constraint => constraint.id.startsWith('rest_'));
  assert.ok(rest.length > 0, 'keine Ruhezeit-Klauseln zwischen aufeinanderfolgenden BD-Feldern');
});

test('CP-SAT-Modellbau erzeugt Wunsch-Slack und Fairness-Slack', () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08']);
  const state = stateWith(monthData);
  const person = state.staff.find(candidate => ['lurz', 'polednia', 'dalitz'].includes(candidate.id));
  setPreference(monthData, person.id, '2026-07-06', 'bd-bevorzugt');
  const model = bridge.buildCpSatModel({ state, monthData, baseline: monthData, config: {} });
  const wishConstraints = model.hardConstraints.filter(constraint => constraint.id.startsWith('wish_'));
  assert.ok(wishConstraints.length >= 2, 'Wunsch braucht Ober- und Untergrenzen-Slack');
  const fairnessSlack = model.components.fairness.slack[0];
  assert.ok(Number.isInteger(fairnessSlack) && fairnessSlack >= model.variables.length);
  assert.ok(model.auxiliary.some(aux => aux.name === 'slack_fairness'));
});

test('CP-SAT-Modellbau respektiert Laufobergrenzen als Limits-Gruppe', () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09']);
  const state = stateWith(monthData);
  const person = state.staff.find(candidate => ['lurz', 'polednia', 'dalitz'].includes(candidate.id));
  const config = { staffLimits: { [person.id]: { maxBd: 1, maxHg: null, maxTotal: null } } };
  const model = bridge.buildCpSatModel({ state, monthData, baseline: monthData, config });
  const limits = model.hardConstraints.filter(constraint => constraint.group === 'limits' && constraint.id.startsWith('limit_bd_'));
  assert.ok(limits.length >= 1);
  assert.ok(model.relaxGroups.includes('limits'));
});

test('Relaxations-Diagnose ohne Solver meldet fehlende Bindung', async () => {
  const monthData = miniMonth(['2026-07-06']);
  const state = stateWith(monthData);
  const model = bridge.buildCpSatModel({ state, monthData, baseline: monthData, config: {} });
  const diagnosis = await bridge.diagnoseInfeasibility(model, null, {});
  assert.equal(diagnosis.infeasible, true);
  assert.equal(diagnosis.groups.length, 0);
  assert.match(diagnosis.detail, /Solver/);
});

test('solveCpSatModel ohne Bindung kehrt kontrolliert zurück', async () => {
  const monthData = miniMonth(['2026-07-06']);
  const state = stateWith(monthData);
  const model = bridge.buildCpSatModel({ state, monthData, baseline: monthData, config: {} });
  const result = await bridge.solveCpSatModel(model, null, {});
  assert.equal(result.statusName, 'UNKNOWN');
  assert.equal(result.reason, 'solver-unavailable');
  assert.deepEqual(result.solution, {});
});

test('Relax-Gruppenreihenfolge ist fachlich priorisiert', () => {
  const order = bridge.relaxGroupOrder({});
  assert.equal(order[0], 'qualification');
  assert.equal(order.at(-1), 'coverage');
  const configured = bridge.relaxGroupOrder({ infeasibilityMode: 'relax', relaxOrder: ['limits', 'coverage'] });
  assert.equal(configured[0], 'limits');
  assert.equal(configured[1], 'coverage');
});

test('CP-SAT-Parameter respektieren Zeitbudget, Worker und Seed', () => {
  const params = bridge.cpSatParameters({ timeLimitMs: 2500, maxWorkers: 4, randomSeed: 7 });
  assert.equal(params.max_time_in_seconds, 2.5);
  assert.equal(params.num_search_workers, 4);
  assert.equal(params.random_seed, 7);
  const capped = bridge.cpSatParameters({ timeLimitMs: 100, maxWorkers: 99, randomSeed: 1 });
  assert.equal(capped.max_time_in_seconds, 0.1);
  assert.equal(capped.num_search_workers, 8);
});

test('v9 baut in der Fallback-Pipeline vollständige Null-Rot-Pläne', async () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09']);
  const before = structuredClone(monthData);
  const result = await plan(monthData);
  assert.equal(result.success, true);
  assert.equal(result.status, 'clean');
  assert.equal(result.changes.length, 8);
  assert.equal(result.metrics.unfilled, 0);
  assert.equal(result.metrics.red, 0);
  assert.equal(result.metrics.gray, 0);
  assert.equal(result.algorithmRevision, 9);
  assert.equal(result.metrics.engine, 'v9-hybrid-exact-observatory');
  assert.deepEqual(monthData, before);
  for (const day of Object.values(result.plannedMonth.days)) {
    assert.ok(day.bd);
    assert.ok(day.hg);
    assert.notEqual(day.bd, day.hg);
  }
});

test('v9-Ergebnis trägt die CP-SAT-Buchhaltung auch im Fallback', async () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07']);
  const result = await plan(monthData);
  assert.ok(result.metrics.cpSat !== undefined || result.metrics.cpSat === null || result.metrics.cpSatUsed === false);
  if (result.metrics.cpSat) {
    assert.ok(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'FEASIBLE_RELAXED', 'SKIPPED', 'UNAVAILABLE'].includes(result.metrics.cpSat.status));
  }
});

test('v9-Studio registriert Regler, Tooltips und Exaktheitsnachweis', async () => {
  const text = await source('../js/auto-plan-studio-v9.js');
  for (const id of [
    'autoPlanV9SolverBackend', 'autoPlanV9Exactness', 'autoPlanV9TimeBudget',
    'autoPlanV9Workers', 'autoPlanV9WarmStart', 'autoPlanV9Fairness',
    'autoPlanV9Determinism', 'autoPlanV9Infeasibility', 'autoPlanV9RepairOnEdit',
    'autoPlanV9Explanation'
  ]) {
    assert.match(text, new RegExp(id));
  }
  assert.match(text, /setRichTooltip/);
  assert.match(text, /autoPlanV9Result/);
  assert.match(text, /bestBound/);
  assert.match(text, /diagnoseInfeasibility|infeasible/);
  assert.match(text, /dataset\.v9Layout\s*=\s*'1'/);
});

test('v9-Layout erzwingt interne Scrollbereiche statt Modal-Scroll', async () => {
  const css = await source('../auto-plan-studio-v9.css');
  assert.match(css, /\[data-v9-layout="1"\] \.auto-plan-body\s*\{\s*overflow:\s*hidden/);
  assert.match(css, /\[data-v9-layout="1"\] #autoPlanConfig,/);
  assert.match(css, /\[data-v9-layout="1"\] #autoPlanResult\s*\{/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /\.auto-plan-log\s*\{\s*flex:\s*0 0 auto;\s*height:\s*210px/);
  assert.match(css, /html\[data-color-scheme="dark"\]/);
});

test('v9 startet im Hellmodus und der Umschalter ist rein bildlich', async () => {
  const theme = await source('../js/app-theme-v8-5.js');
  assert.match(theme, /return 'light';/);
  assert.match(theme, /visually-hidden/);
  assert.doesNotMatch(theme, /tool-label">\$\{mode/);
  const css = await source('../auto-plan-studio-v9.css');
  assert.match(css, /tool-label[\s\S]*display:\s*none !important/);
});

test('_headers setzen Cross-Origin-Isolation für multithreaded WASM', async () => {
  const headers = await source('../_headers');
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin/);
  assert.match(headers, /Cross-Origin-Embedder-Policy:\s*require-corp/);
  assert.match(headers, /\/vendor\/\*/);
});

test('v9.5 CP-SAT-Modell kodiert Becker-FZA, CT-Leitung und Wochenendkette', () => {
  const dates = Array.from({ length: 31 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  const monthData = miniMonth(dates);
  // Martin fehlt am Montag (05.01.), dem FZA-Tag nach Becker-BD am Freitag (02.01.).
  monthData.absences.martin = { '2026-01-05': 'urlaub' };
  const state = stateWith(monthData);
  const model = bridge.buildCpSatModel({
    state,
    monthData,
    baseline: monthData,
    config: {},
    hints: [{ dateIso: '2026-01-01', role: 'bd', staffId: 'becker' }]
  });

  assert.ok(model.counts.variables > 0, 'Slot-Variablen erzeugt');
  // Becker-FZA: reifizierte Gleichheit für jeden Becker-BD-Tag.
  assert.ok(model.hardConstraints.some(c => c.id.startsWith('becker_fza_2026-01-02')), 'Becker-FZA-Constraint für 02.01. vorhanden');
  // Wochenendkette Fr(02.01.)·Sa frei·So(04.01.) als weiches Vermeidungsziel.
  assert.ok(model.hardConstraints.some(c => c.id.includes('chain_fri_2026-01-02')), 'Wochenendketten-Constraint für 02.01. vorhanden');
  assert.ok(model.components.weekendChain.terms.length > 0, 'Wochenendketten-Ziel besetzt');
  // CT-Leitung: Martin am FZA-Tag (05.01.) abwesend -> Becker-BD am 02.01. bestraft.
  assert.ok(model.components.ctLeadership.terms.length > 0, 'CT-Leitungs-Ziel besetzt (Martin am FZA-Tag fehlend)');
  // Minimal-Perturbation: Hinweis für 01.01. BD = becker erzeugt Penalty-Literal.
  assert.ok(model.components.perturbation.terms.length > 0, 'Perturbations-Ziel besetzt (Heuristik-Hinweis)');
});

test('v9.5 diagnoseInfeasibility liefert MUS-fähiges Ergebnis ohne Solver', async () => {
  const state = stateWith(miniMonth(['2026-01-01', '2026-01-02']));
  const model = bridge.buildCpSatModel({ state, monthData: miniMonth(['2026-01-01', '2026-01-02']), baseline: miniMonth(['2026-01-01', '2026-01-02']), config: {} });
  const diagnosis = await bridge.diagnoseInfeasibility(model, null, {});
  assert.equal(diagnosis.infeasible, true);
  assert.ok(Array.isArray(diagnosis.groups), 'Gruppenliste vorhanden');
  assert.ok('mus' in diagnosis, 'MUS-Konfliktmenge vorhanden');
});
