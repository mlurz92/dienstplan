import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAbsence, setAssignment, setPreference } = await import('../js/rules.js');
const { buildAutoPlan, applyAutoPlanProposal, fingerprintMonth } = await import('../js/auto-planner.js');

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

async function plan(monthData, options = {}) {
  return buildAutoPlan({
    state: stateWith(monthData),
    monthData,
    year: monthData.year,
    month: monthData.month,
    beamWidth: 14,
    branchLimit: 5,
    ...options
  });
}

test('Auto-Plan besetzt alle offenen BD/HG ohne rote Vorschläge und ohne Basismutation', async () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09']);
  const before = structuredClone(monthData);
  const result = await plan(monthData);

  assert.equal(result.success, true);
  assert.equal(result.changes.length, 8);
  assert.equal(result.metrics.unfilled, 0);
  assert.equal(result.metrics.red, 0);
  assert.equal(result.metrics.gray, 0);
  assert.deepEqual(monthData, before);
  for (const day of Object.values(result.plannedMonth.days)) {
    assert.ok(day.bd);
    assert.ok(day.hg);
    assert.notEqual(day.bd, day.hg);
  }
});

test('bestehende Einteilungen bleiben unangetastete Fixpunkte', async () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07']);
  setAssignment(monthData, '2026-07-06', 'bd', 'lurz');
  setAssignment(monthData, '2026-07-06', 'hg', 'martin');

  const result = await plan(monthData);
  assert.equal(result.success, true);
  assert.equal(result.fixedAssignments, 2);
  assert.equal(result.plannedMonth.days['2026-07-06'].bd, 'lurz');
  assert.equal(result.plannedMonth.days['2026-07-06'].hg, 'martin');
  assert.equal(result.changes.some(change => change.dateIso === '2026-07-06'), false);
});

test('identischer Eingang erzeugt deterministisch denselben Vorschlag', async () => {
  const monthData = miniMonth(['2026-07-13', '2026-07-14', '2026-07-15']);
  const first = await plan(structuredClone(monthData));
  const second = await plan(structuredClone(monthData));
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.deepEqual(first.changes, second.changes);
});

test('positiver BD-Wunsch wird vor schwächeren Ausgleichssignalen erfüllt', async () => {
  const monthData = miniMonth(['2026-07-08']);
  setPreference(monthData, 'licenji', '2026-07-08', 'bd-bevorzugt');
  const result = await plan(monthData);
  assert.equal(result.success, true);
  assert.equal(result.plannedMonth.days['2026-07-08'].bd, 'licenji');
  assert.equal(result.metrics.wishesFulfilled, 1);
});

test('AA-Freitags-BD erzeugt personengleiche Freitag-HG-, Samstags-BD- und Sonntag-HG-Kette', async () => {
  const monthData = miniMonth(['2026-07-03', '2026-07-04', '2026-07-05']);
  setAssignment(monthData, '2026-07-03', 'bd', 'sebastian');
  const result = await plan(monthData, { beamWidth: 20 });

  assert.equal(result.success, true);
  const fridayHg = result.plannedMonth.days['2026-07-03'].hg;
  const saturdayBd = result.plannedMonth.days['2026-07-04'].bd;
  const sundayHg = result.plannedMonth.days['2026-07-05'].hg;
  assert.ok(fridayHg);
  assert.equal(fridayHg, saturdayBd);
  assert.equal(saturdayBd, sundayHg);
});

test('Übernahme ist atomar und verweigert einen zwischenzeitlich veränderten Monat', async () => {
  const monthData = miniMonth(['2026-07-20']);
  const result = await plan(monthData);
  const merged = applyAutoPlanProposal(monthData, result);
  assert.ok(merged.days['2026-07-20'].bd);
  assert.ok(merged.days['2026-07-20'].hg);
  assert.equal(monthData.days['2026-07-20'].bd, '');

  const changed = structuredClone(monthData);
  changed.revision += 1;
  assert.notEqual(fingerprintMonth(changed), result.baselineFingerprint);
  assert.throws(() => applyAutoPlanProposal(changed, result), /seit der Berechnung verändert/);
});

test('unlösbarer Monat wird nicht zur Übernahme freigegeben', async () => {
  const monthData = miniMonth(['2026-07-08']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, '2026-07-08', 'urlaub');
  }
  const result = await plan(monthData);
  assert.equal(result.success, false);
  assert.ok(result.metrics.unfilled > 0);
  assert.throws(() => applyAutoPlanProposal(monthData, result), /vollständig regelkonformer Auto-Plan/);
});
