import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAbsence, setAssignment } = await import('../js/rules.js');
const {
  applyAutoPlanProposal,
  autoPlanConfigFingerprint,
  buildAutoPlan,
  createDefaultAutoPlanConfig,
  normalizeAutoPlanConfig,
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

async function run(monthData, state, runConfig) {
  return buildAutoPlan({
    state,
    monthData,
    year: monthData.year,
    month: monthData.month,
    runConfig,
    beamWidth: 18,
    branchLimit: 12,
    exactBudget: 3500
  });
}

test('Standardkonfiguration übernimmt Personalstamm-Maxima und ist valide', () => {
  const monthData = miniMonth(['2026-10-05']);
  const plannerState = stateWith(monthData);
  const config = createDefaultAutoPlanConfig(plannerState, monthData);
  const validation = validateAutoPlanConfig(plannerState, monthData, config);

  assert.equal(validation.valid, true);
  assert.equal(config.searchIntensity, 'deep');
  assert.equal(config.optimizationFocus, 'balanced');
  assert.equal(config.allowRedFallback, true);
  assert.equal(config.staffLimits.hellmann.maxBd, 2);
  assert.equal(config.staffLimits.lurz.maxBd, null);
});

test('harte BD-Obergrenzen werden in jeder Suchstufe eingehalten', async () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08']);
  const plannerState = stateWith(monthData);
  const config = createDefaultAutoPlanConfig(plannerState, monthData);
  for (const [staffId, limits] of Object.entries(config.staffLimits)) {
    limits.maxBd = staffId === 'lurz' ? 0 : 1;
  }

  const result = await run(monthData, plannerState, config);
  assert.equal(result.success, true);
  assert.equal(result.plannedMonth.days['2026-07-06'].bd === 'lurz', false);
  assert.equal(result.plannedMonth.days['2026-07-07'].bd === 'lurz', false);
  assert.equal(result.plannedMonth.days['2026-07-08'].bd === 'lurz', false);
  const bdCounts = Object.values(result.plannedMonth.days).reduce((counts, day) => {
    counts[day.bd] = (counts[day.bd] || 0) + 1;
    return counts;
  }, {});
  assert.ok(Object.entries(bdCounts).every(([staffId, count]) => staffId !== 'lurz' && count <= 1));
  assert.ok(result.metrics.limitRejects > 0);
});

test('Obergrenze unterhalb bestehender Fixpunkte wird vor der Suche abgewiesen', async () => {
  const monthData = miniMonth(['2026-07-06']);
  setAssignment(monthData, '2026-07-06', 'bd', 'lurz');
  const plannerState = stateWith(monthData);
  const config = createDefaultAutoPlanConfig(plannerState, monthData);
  config.staffLimits.lurz.maxBd = 0;

  const validation = validateAutoPlanConfig(plannerState, monthData, config);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /unter 1 bestehenden BD/);
  await assert.rejects(() => run(monthData, plannerState, config), /Konfiguration ungültig/);
});

test('deaktivierter Minimal-Rot-Fallback liefert bei ausschließlich roten Möglichkeiten keinen Vorschlag', async () => {
  const monthData = miniMonth(['2026-07-08']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, '2026-07-08', 'urlaub');
  }
  const plannerState = stateWith(monthData);
  const config = createDefaultAutoPlanConfig(plannerState, monthData);
  config.allowRedFallback = false;

  const result = await run(monthData, plannerState, config);
  assert.equal(result.success, false);
  assert.equal(result.requiresConfirmation, false);
  assert.ok(result.metrics.unfilled > 0);
  assert.equal(result.metrics.attempts.some(attempt => attempt.mode === 'confirmable'), false);
});

test('maximale Zahl roter Vorschläge ist eine harte Fallback-Grenze', async () => {
  const monthData = miniMonth(['2026-07-08']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, '2026-07-08', 'urlaub');
  }
  const plannerState = stateWith(monthData);
  const config = createDefaultAutoPlanConfig(plannerState, monthData);
  config.maxRedViolations = 1;

  const result = await run(monthData, plannerState, config);
  assert.equal(result.success, false);
  assert.equal(result.complete, false);
  assert.ok(result.metrics.unfilled > 0 || result.metrics.red > 1);
});

test('Laufparameter sind Bestandteil des Vorschlags und werden bei der Übernahme erneut geprüft', async () => {
  const monthData = miniMonth(['2026-07-20']);
  const plannerState = stateWith(monthData);
  const config = normalizeAutoPlanConfig(plannerState, monthData, {
    searchIntensity: 'standard',
    optimizationFocus: 'workload',
    allowRedFallback: true,
    maxRedViolations: 2,
    staffLimits: {
      lurz: { maxBd: 1, maxHg: 1, maxTotal: 2 }
    }
  });
  const result = await run(monthData, plannerState, config);
  assert.equal(result.success, true);
  assert.equal(result.runConfig.searchIntensity, 'standard');
  assert.equal(result.runConfig.optimizationFocus, 'workload');
  assert.equal(result.runConfigFingerprint, autoPlanConfigFingerprint(result.runConfig));

  const tampered = structuredClone(result);
  tampered.runConfig.staffLimits.lurz.maxBd = 0;
  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: tampered
  }), /Laufparameter|Obergrenze|ungültig/);
});
