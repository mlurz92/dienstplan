import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { evaluateCandidate, setAbsence, setAssignment } = await import('../js/rules.js');
const {
  applyAutoPlanProposal,
  buildAutoPlan,
  createDefaultAutoPlanConfig,
  validateAutoPlanConfig
} = await import('../js/auto-planner.js');

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
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

function configFor(state, monthData, overrides = {}) {
  const config = createDefaultAutoPlanConfig(state, monthData);
  return {
    ...config,
    searchIntensity: 'standard',
    repairIterations: 3,
    localRebuildBudget: 600,
    ...overrides,
    staffLimits: overrides.staffLimits || config.staffLimits
  };
}

async function plan(monthData, overrides = {}) {
  const plannerState = overrides.state || stateWith(monthData);
  return buildAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    runConfig: overrides.runConfig || configFor(plannerState, monthData),
    beamWidth: 18,
    branchLimit: 12,
    exactBudget: 2400,
    signal: overrides.signal,
    state: plannerState
  });
}

test('HG am Montag bis Donnerstag vor eigenem BD ist symmetrisch rot', () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07']);
  const state = stateWith(monthData);

  setAssignment(monthData, '2026-07-07', 'bd', 'lurz');
  assert.equal(evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-06',
    role: 'hg',
    staffId: 'lurz'
  }).level, 'red');

  monthData.days['2026-07-07'].bd = '';
  setAssignment(monthData, '2026-07-06', 'hg', 'lurz');
  const reverse = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-07',
    role: 'bd',
    staffId: 'lurz'
  });
  assert.equal(reverse.level, 'red');
  assert.match(reverse.reasons.join(' '), /HG am Werktag vor eigenem BD/);
});

test('Freitag-HG vor Samstags-BD bleibt von der neuen Werktagsregel ausgenommen', () => {
  const monthData = miniMonth(['2026-07-03', '2026-07-04']);
  const state = stateWith(monthData);
  setAssignment(monthData, '2026-07-04', 'bd', 'lurz');
  const evaluation = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-03',
    role: 'hg',
    staffId: 'lurz'
  });
  assert.equal(evaluation.meta?.weekdayHgBeforeBd, undefined);
  assert.notEqual(evaluation.reasons.some(reason => /HG am Werktag vor eigenem BD/.test(reason)), true);
});

test('eine Laufobergrenze unter vorhandenen Fixpunkten blockiert bereits die Konfiguration', () => {
  const monthData = miniMonth(['2026-07-06']);
  setAssignment(monthData, '2026-07-06', 'bd', 'lurz');
  const state = stateWith(monthData);
  const config = createDefaultAutoPlanConfig(state, monthData);
  config.staffLimits.lurz.maxBd = 0;
  const validation = validateAutoPlanConfig(state, monthData, config);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /unter 1 bestehenden BD/);
});

test('individuelle BD-Obergrenze wird als harte Laufgrenze eingehalten', async () => {
  const monthData = miniMonth(['2026-07-08']);
  const state = stateWith(monthData);
  const config = configFor(state, monthData);
  config.staffLimits.lurz.maxBd = 0;
  const result = await plan(monthData, { state, runConfig: config });
  assert.equal(result.success, true);
  assert.notEqual(result.plannedMonth.days['2026-07-08'].bd, 'lurz');
  assert.equal(result.metrics.unfilled, 0);
});

test('maximal null rote Vorschläge blockiert einen nur rot vollständig belegbaren Monat', async () => {
  const monthData = miniMonth(['2026-07-08']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, '2026-07-08', 'urlaub');
  }
  const state = stateWith(monthData);
  const config = configFor(state, monthData, { maxRedViolations: 0, allowRedFallback: true });
  const result = await plan(monthData, { state, runConfig: config });
  assert.equal(result.success, false);
  assert.equal(result.complete, false);
});

test('iterative Tauschoptimierung liefert Telemetrie und verschlechtert den Null-Rot-Audit nicht', async () => {
  const monthData = miniMonth(['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16']);
  const state = stateWith(monthData);
  const config = configFor(state, monthData, { repairIterations: 5, localRebuildBudget: 900 });
  const result = await plan(monthData, { state, runConfig: config });

  assert.equal(result.success, true);
  assert.equal(result.metrics.red, 0);
  assert.equal(result.metrics.gray, 0);
  assert.ok(result.metrics.iterative.rounds >= 1);
  assert.ok(result.metrics.iterative.neighbors > 0);
  assert.ok(result.metrics.iterative.improvements >= 0);
  assert.match(result.searchProfile, /iterative Tauschreparatur/);
  assert.equal(result.iterativeConfig.repairIterations, 5);
  assert.ok(result.proposalFingerprint);
});

test('veränderte iterative Laufparameter oder Vorschläge werden vor der Übernahme verworfen', async () => {
  const monthData = miniMonth(['2026-07-20']);
  const state = stateWith(monthData);
  const result = await plan(monthData, { state });

  const changedConfig = structuredClone(result);
  changedConfig.iterativeConfig.repairIterations += 1;
  assert.throws(() => applyAutoPlanProposal({
    state,
    currentMonth: monthData,
    proposal: changedConfig
  }), /iterative Auto-Plan-Konfiguration/);

  const changedProposal = structuredClone(result);
  changedProposal.changes[0].staffId = 'lurz';
  assert.throws(() => applyAutoPlanProposal({
    state,
    currentMonth: monthData,
    proposal: changedProposal
  }), /nach der Optimierung verändert/);
});
