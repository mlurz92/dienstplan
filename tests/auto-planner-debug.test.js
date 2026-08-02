import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { buildAutoPlan } = await import('../js/auto-planner.js');

function month() {
  const dates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09'];
  return {
    schemaVersion: 1,
    year: 2026,
    month: 7,
    revision: 0,
    updatedAt: null,
    days: Object.fromEntries(dates.map(dateIso => [dateIso, { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' }])),
    absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: []
  };
}

test('debug auto planner objective', async () => {
  const monthData = month();
  const state = {
    months: new Map([['2026-07', monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: 2026,
    currentMonth: 7,
    monthSources: new Map([['2026-07', 'server']])
  };
  const result = await buildAutoPlan({ state, monthData, beamWidth: 14, branchLimit: 5 });
  console.log('AUTO_PLAN_DEBUG', JSON.stringify({ success: result.success, metrics: result.metrics, changes: result.changes, audit: result.audit }, null, 2));
  assert.equal(result.success, true);
});
