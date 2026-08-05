import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAbsence } = await import('../js/rules.js');
const {
  constructAutoPlan,
  mergeAutoPlanRunConfig,
  normalizeAutoPlanConfig,
  shouldRunZeroRedRescue,
  zeroRedRescueProfiles
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

test('partielle Laufkonfiguration bewahrt abgeleitete HG-Sperren', () => {
  const monthData = miniMonth(['2026-10-05', '2026-10-06']);
  const plannerState = stateWith(monthData);

  const merged = mergeAutoPlanRunConfig(plannerState, monthData, {
    optimizationFocus: 'workload'
  });
  const normalized = normalizeAutoPlanConfig(plannerState, monthData, {
    optimizationFocus: 'workload'
  });

  assert.equal(merged.staffLimits.licenji.maxHg, 0);
  assert.equal(merged.staffLimits.sebastian.maxHg, 0);
  assert.equal(normalized.staffLimits.licenji.maxHg, 0);
  assert.equal(normalized.staffLimits.sebastian.maxHg, 0);
  assert.equal(normalized.staffLimits.elhouba.maxHg, null, 'nach Beförderung HG-berechtigt');
  assert.equal(normalized.staffLimits.becker.maxBd, 3);
});

test('explizites null hebt eine abgeleitete Laufgrenze bewusst auf', () => {
  const monthData = miniMonth(['2026-10-05']);
  const plannerState = stateWith(monthData);

  const normalized = normalizeAutoPlanConfig(plannerState, monthData, {
    staffLimits: {
      licenji: { maxHg: null }
    }
  });

  assert.equal(normalized.staffLimits.licenji.maxHg, null);
  assert.equal(normalized.staffLimits.sebastian.maxHg, 0, 'nicht bearbeitete Zeilen behalten den Standard');
});

test('Null-Rot-Rescue verwendet ausschließlich strikte Profile', () => {
  assert.deepEqual(zeroRedRescueProfiles(), ['strict-balanced', 'strict-coverage']);
  assert.equal(shouldRunZeroRedRescue({ complete: true, metrics: { unfilled: 0, gray: 0, red: 0 } }), false);
  assert.equal(shouldRunZeroRedRescue({ complete: true, metrics: { unfilled: 0, gray: 0, red: 1 } }), true);
  assert.equal(shouldRunZeroRedRescue({ complete: false, metrics: { unfilled: 1, gray: 0, red: 0 } }), true);
  assert.equal(shouldRunZeroRedRescue(
    { complete: false, metrics: { unfilled: 1 } },
    { zeroRedRescue: false }
  ), false);
});

test('Minimal-Rot-Fallback wird erst nach protokollierter Null-Rot-Rescue erreicht', async () => {
  const dateIso = '2026-07-08';
  const monthData = miniMonth([dateIso]);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, dateIso, 'urlaub');
  }
  const plannerState = stateWith(monthData);

  const result = await constructAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    runConfig: {
      searchIntensity: 'standard',
      allowRedFallback: true,
      maxRedViolations: 2,
      repairIterations: 0,
      perfectionEnabled: false
    },
    beamWidth: 8,
    branchLimit: 4,
    exactBudget: 800
  });

  assert.equal(result.complete, true);
  assert.ok(result.metrics.red > 0);
  assert.equal(result.metrics.zeroRedRescue.attempted, true);
  assert.equal(result.metrics.zeroRedRescue.succeeded, false);
  assert.match(result.searchProfile, /Null-Rot-Rescue/);
});
