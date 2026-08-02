import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAbsence, setAssignment, setPreference } = await import('../js/rules.js');
const {
  buildAutoPlan,
  applyAutoPlanProposal,
  fingerprintMonth,
  planningFingerprint
} = await import('../js/auto-planner.js');

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
  return buildAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    beamWidth: 14,
    branchLimit: 12,
    ...options,
    state: plannerState
  });
}

test('Auto-Plan besetzt alle offenen BD/HG ohne rote Vorschläge und ohne Basismutation', async () => {
  const monthData = miniMonth(['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09']);
  const before = structuredClone(monthData);
  const result = await plan(monthData);

  assert.equal(result.success, true);
  assert.equal(result.status, 'clean');
  assert.equal(result.requiresConfirmation, false);
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
  assert.deepEqual(first.redViolations, second.redViolations);
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

test('saubere Übernahme ist atomar und verweigert einen zwischenzeitlich veränderten Monat', async () => {
  const monthData = miniMonth(['2026-07-20']);
  const plannerState = stateWith(monthData);
  const result = await plan(monthData, { state: plannerState });
  const merged = applyAutoPlanProposal({ state: plannerState, currentMonth: monthData, proposal: result });
  assert.ok(merged.days['2026-07-20'].bd);
  assert.ok(merged.days['2026-07-20'].hg);
  assert.equal(monthData.days['2026-07-20'].bd, '');

  const changed = structuredClone(monthData);
  changed.revision += 1;
  plannerState.months.set('2026-07', changed);
  assert.notEqual(fingerprintMonth(changed), fingerprintMonth(monthData));
  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: changed,
    proposal: result
  }), /seit der Berechnung verändert/);
});

test('vollständige Belegung nutzt bestätigbare rote Ausnahmen erst als Minimal-Rot-Fallback', async () => {
  const monthData = miniMonth(['2026-07-08']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, '2026-07-08', 'urlaub');
  }
  const plannerState = stateWith(monthData);
  const result = await plan(monthData, { state: plannerState });

  assert.equal(result.success, true);
  assert.equal(result.complete, true);
  assert.equal(result.status, 'confirmation_required');
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.metrics.unfilled, 0);
  assert.ok(result.metrics.red >= 2);
  assert.equal(result.redViolations.length, result.metrics.red);
  assert.ok(result.plannedMonth.days['2026-07-08'].bd);
  assert.ok(result.plannedMonth.days['2026-07-08'].hg);
  assert.notEqual(result.plannedMonth.days['2026-07-08'].bd, result.plannedMonth.days['2026-07-08'].hg);

  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: result
  }), /ausdrücklich bestätigt/);

  const merged = applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: result,
    confirmation: { accepted: true, comment: 'Besetzung betrieblich erforderlich' }
  });
  assert.equal(merged.overrideLog.length, result.metrics.red);
  assert.ok(merged.overrideLog.every(entry => entry.source === 'auto-plan'));
  assert.ok(merged.overrideLog.every(entry => entry.comment === 'Besetzung betrieblich erforderlich'));
});

test('graue oder technisch nicht wählbare Sperren bleiben auch im Fallback absolut', async () => {
  const monthData = miniMonth(['2026-07-08']);
  const onlyLurz = structuredClone(DEFAULT_STAFF).filter(person => person.id === 'lurz');
  const plannerState = stateWith(monthData, onlyLurz);
  const result = await plan(monthData, { state: plannerState });

  assert.equal(result.success, false);
  assert.equal(result.complete, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.metrics.unfilled > 0);
  assert.equal(result.requiresConfirmation, false);
  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: result,
    confirmation: { accepted: true }
  }), /vollständiger Auto-Plan/);
});

test('Übernahme führt den vollständigen Endaudit erneut aus und erkennt manipulierte Vorschläge', async () => {
  const monthData = miniMonth(['2026-07-20']);
  const plannerState = stateWith(monthData);
  const result = await plan(monthData, { state: plannerState });
  const tampered = structuredClone(result);
  tampered.changes[0].staffId = 'unbekannte-person';

  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: tampered
  }), /nicht überschreibbare|erneute Regelprüfung/);
});

test('Planungsfingerprint umfasst Markierungen, Personal und geladene Nachbarmonate', async () => {
  const monthData = miniMonth(['2026-07-20']);
  const adjacent = miniMonth(['2026-08-01']);
  const plannerState = stateWith(monthData, structuredClone(DEFAULT_STAFF), [['2026-08', adjacent]]);
  const original = planningFingerprint(plannerState, monthData);

  const marked = structuredClone(monthData);
  setAbsence(marked, 'lurz', '2026-07-20', 'urlaub');
  assert.notEqual(planningFingerprint(plannerState, marked), original);

  const staffChanged = stateWith(monthData, structuredClone(DEFAULT_STAFF), [['2026-08', adjacent]]);
  staffChanged.staff.find(person => person.id === 'lurz').bdTarget = 5;
  assert.notEqual(planningFingerprint(staffChanged, monthData), original);

  const adjacentChanged = structuredClone(adjacent);
  setAssignment(adjacentChanged, '2026-08-01', 'bd', 'martin');
  const stateWithChangedAdjacent = stateWith(monthData, structuredClone(DEFAULT_STAFF), [['2026-08', adjacentChanged]]);
  assert.notEqual(planningFingerprint(stateWithChangedAdjacent, monthData), original);
});

test('zeitabhängige Beförderung erlaubt El Houba HG exakt ab 22.09.2026', async () => {
  const monthData = miniMonth(['2026-09-21', '2026-09-22']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.canHg)) {
    setAbsence(monthData, person.id, '2026-09-22', 'urlaub');
  }
  setAssignment(monthData, '2026-09-21', 'bd', 'licenji');
  setAssignment(monthData, '2026-09-21', 'hg', 'lurz');
  const result = await plan(monthData, { beamWidth: 24 });

  assert.equal(result.success, true);
  assert.equal(result.plannedMonth.days['2026-09-22'].hg, 'elhouba');
});

test('unlösbarer Monat mit ausschließlich nicht überschreibbaren Möglichkeiten wird nicht freigegeben', async () => {
  const monthData = miniMonth(['2026-07-08']);
  const plannerState = stateWith(monthData, []);
  const result = await plan(monthData, { state: plannerState });
  assert.equal(result.success, false);
  assert.ok(result.metrics.unfilled > 0);
  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: result
  }), /vollständiger Auto-Plan/);
});
