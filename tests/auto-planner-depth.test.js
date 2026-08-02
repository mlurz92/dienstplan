import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAbsence, setAssignment } = await import('../js/rules.js');
const { buildAutoPlan, applyAutoPlanProposal } = await import('../js/auto-planner.js');

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

async function plan(monthData, overrides = {}) {
  const plannerState = overrides.state || stateWith(monthData);
  return buildAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    beamWidth: 18,
    branchLimit: 12,
    exactBudget: 3000,
    ...overrides,
    state: plannerState
  });
}

test('dynamische Engpasswahl schützt die einzige Samstagsbesetzung vor einer früheren Freitagswahl', async () => {
  const monthData = miniMonth(['2026-07-03', '2026-07-04']);
  setAssignment(monthData, '2026-07-03', 'hg', 'extern:Fixpunkt HG Freitag');
  setAssignment(monthData, '2026-07-04', 'hg', 'extern:Fixpunkt HG Samstag');

  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning && entry.id !== 'lurz')) {
    setAbsence(monthData, person.id, '2026-07-04', 'urlaub');
  }

  const result = await plan(monthData);
  assert.equal(result.success, true);
  assert.equal(result.status, 'clean');
  assert.equal(result.metrics.unfilled, 0);
  assert.equal(result.metrics.red, 0);
  assert.equal(result.plannedMonth.days['2026-07-04'].bd, 'lurz');
  assert.notEqual(result.plannedMonth.days['2026-07-03'].bd, 'lurz');
});

test('Auto-Plan liefert nachvollziehbare Suchtelemetrie und ein ausgewiesenes Suchprofil', async () => {
  const monthData = miniMonth(['2026-07-13', '2026-07-14', '2026-07-15']);
  const result = await plan(monthData);

  assert.equal(result.success, true);
  assert.match(result.searchProfile, /strict-/);
  assert.ok(result.metrics.exploredNodes > 0);
  assert.ok(result.metrics.generatedNodes > 0);
  assert.ok(result.metrics.candidateEvaluations > 0);
  assert.ok(result.metrics.maxBeam > 0);
  assert.ok(Array.isArray(result.metrics.attempts));
  assert.ok(result.metrics.attempts.length >= 1);
  assert.equal(result.metrics.gray, 0);
  assert.equal(result.metrics.unfilled, 0);
});

test('ein vollständig belegter Monat nutzt den mutationsfreien Null-Arbeit-Schnellpfad', async () => {
  const monthData = miniMonth(['2026-07-20']);
  setAssignment(monthData, '2026-07-20', 'bd', 'lurz');
  setAssignment(monthData, '2026-07-20', 'hg', 'martin');
  const before = structuredClone(monthData);

  const result = await plan(monthData);
  assert.equal(result.success, true);
  assert.equal(result.complete, true);
  assert.equal(result.changes.length, 0);
  assert.equal(result.openSlots, 0);
  assert.equal(result.metrics.exploredNodes, 0);
  assert.deepEqual(result.metrics.attempts, []);
  assert.deepEqual(monthData, before);
});

test('besondere rote Auto-Plan-Ausnahmen benötigen zusätzlich zur Bestätigung einen Kommentar', async () => {
  const monthData = miniMonth(['2026-07-08']);
  for (const person of DEFAULT_STAFF.filter(entry => entry.includeInPlanning)) {
    setAbsence(monthData, person.id, '2026-07-08', 'urlaub');
  }
  const plannerState = stateWith(monthData);
  const result = await plan(monthData, { state: plannerState });

  assert.equal(result.success, true);
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.metrics.specialRed > 0);
  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: result,
    confirmation: { accepted: true, comment: '' }
  }), /begründender Kommentar/);

  const merged = applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: result,
    confirmation: { accepted: true, comment: 'Betrieblich zwingende Komplettbelegung' }
  });
  assert.equal(merged.overrideLog.length, result.metrics.red);
  assert.ok(merged.overrideLog.every(entry => entry.comment === 'Betrieblich zwingende Komplettbelegung'));
});

test('ein manipulierter Vorschlag ohne Personal-ID wird vor jeder Mutation verworfen', async () => {
  const monthData = miniMonth(['2026-07-21']);
  const plannerState = stateWith(monthData);
  const result = await plan(monthData, { state: plannerState });
  const tampered = structuredClone(result);
  tampered.changes[0].staffId = '';

  assert.throws(() => applyAutoPlanProposal({
    state: plannerState,
    currentMonth: monthData,
    proposal: tampered
  }), /ohne gültige Personal-ID/);
  assert.equal(monthData.days['2026-07-21'].bd, '');
  assert.equal(monthData.days['2026-07-21'].hg, '');
});
