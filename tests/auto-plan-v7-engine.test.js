import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { constructAutoPlan } = await import('../js/auto-planner.js');

function miniMonth(dates) {
  return {
    schemaVersion: 1,
    year: Number(dates[0].slice(0, 4)),
    month: Number(dates[0].slice(5, 7)),
    revision: 0,
    updatedAt: null,
    days: Object.fromEntries(dates.map(dateIso => [dateIso, { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' }])),
    absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: []
  };
}

function stateWith(monthData) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

test('v7 global fail-first selection starts with the tighter role domain', async () => {
  const monthData = miniMonth(['2026-07-13', '2026-07-14']);
  const plannerState = stateWith(monthData);
  const progress = [];

  const result = await constructAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    runConfig: {
      searchIntensity: 'standard',
      allowRedFallback: false,
      zeroRedRescue: false,
      profileFilter: ['strict-balanced'],
      repairIterations: 0,
      perfectionEnabled: false
    },
    beamWidth: 8,
    branchLimit: 4,
    exactBudget: 800,
    onProgress: update => progress.push(update)
  });

  const firstSearch = progress.find(update => update.phase === 'search');
  assert.equal(firstSearch?.role, 'hg');
  assert.equal(result.algorithmRevision, 7);
  assert.ok(result.metrics.assignmentLedgerHits > 0);
  assert.ok(result.metrics.assignmentLedgerMisses > 0);
});
