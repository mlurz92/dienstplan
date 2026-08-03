/**
 * Zusicherungen der Perfektionsphase.
 *
 * Geprüft wird, was der Lauf unabhängig von Zufall, Zeitrahmen und Datenlage
 * garantieren muss: unveränderte Fixpunkte, vollständige Belegung, Einhaltung
 * aller harten Grenzen, Reproduzierbarkeit und ein belastbarer
 * Optimalitätsnachweis.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAbsence, setAssignment, setPreference } = await import('../js/rules.js');
const {
  applyAutoPlanProposal,
  buildAutoPlan,
  optimizerDefaults,
  optimizerFingerprint
} = await import('../js/auto-planner.js');
const {
  assertFixedAssignmentsUntouched,
  emptyOptimizerStats
} = await import('../js/auto-planner-optimizer.js');

function emptyDay() {
  return { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
}

function monthWithDays(year, month, dayCount) {
  const days = {};
  for (let day = 1; day <= dayCount; day += 1) {
    days[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = emptyDay();
  }
  return {
    schemaVersion: 1,
    year,
    month,
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

async function plan(monthData, runConfig = {}) {
  const plannerState = stateWith(monthData);
  return buildAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    beamWidth: 12,
    branchLimit: 8,
    runConfig: { searchIntensity: 'standard', ...runConfig }
  });
}

const signatureOf = result => result.changes
  .map(change => `${change.dateIso}|${change.role}|${change.staffId}`)
  .join(',');

test('gesetzte Dienste bleiben unangetastet und erscheinen nie als Vorschlag', async () => {
  const monthData = monthWithDays(2026, 9, 12);
  const fixed = [
    ['2026-09-01', 'bd', 'lurz'],
    ['2026-09-04', 'hg', 'becker'],
    ['2026-09-09', 'bd', 'sebastian']
  ];
  for (const [dateIso, role, staffId] of fixed) setAssignment(monthData, dateIso, role, staffId);

  const result = await plan(monthData);
  assert.equal(result.complete, true);

  for (const [dateIso, role, staffId] of fixed) {
    assert.equal(result.plannedMonth.days[dateIso][role], staffId);
    assert.equal(result.changes.some(change => change.dateIso === dateIso && change.role === role), false);
  }
  assert.equal(assertFixedAssignmentsUntouched(result.baseline, result.plannedMonth), true);
});

test('die Wächterprüfung schlägt an, wenn ein Fixpunkt verändert wurde', () => {
  const baseline = monthWithDays(2026, 9, 3);
  setAssignment(baseline, '2026-09-02', 'bd', 'lurz');
  const tampered = structuredClone(baseline);
  tampered.days['2026-09-02'].bd = 'becker';
  assert.throws(
    () => assertFixedAssignmentsUntouched(baseline, tampered),
    /gesetzten Dienst BD am 2026-09-02 verändert/
  );
});

test('gleiche Eingaben liefern denselben Plan', async () => {
  const first = await plan(monthWithDays(2026, 9, 10), { timeBudgetMs: 4000 });
  const second = await plan(monthWithDays(2026, 9, 10), { timeBudgetMs: 4000 });
  assert.equal(signatureOf(first), signatureOf(second));
  assert.equal(first.metrics.optimizer.certified, second.metrics.optimizer.certified);
});

test('die Perfektionsphase verschlechtert das Ergebnis des Aufbaus nie', async () => {
  const monthData = monthWithDays(2026, 9, 14);
  setPreference(monthData, 'martin', '2026-09-03', 'bd-bevorzugt');
  setPreference(monthData, 'dalitz', '2026-09-07', 'hg-bevorzugt');
  const result = await plan(monthData);

  const before = result.metrics.qualityBefore;
  assert.ok(before, 'die Kennzahlen vor der Perfektion werden ausgewiesen');
  assert.ok(result.metrics.red <= before.red);
  assert.ok(result.metrics.orange <= before.orange || result.metrics.red < before.red);
  assert.ok(result.metrics.wishesFulfilled >= before.wishesFulfilled
    || result.metrics.yellow < before.yellow);
});

test('ohne ausdrücklichen Zeitrahmen läuft die Perfektion im Konvergenzmodus', () => {
  assert.equal(optimizerDefaults({ searchIntensity: 'deep' }).mode, 'converge');
  assert.equal(optimizerDefaults({ searchIntensity: 'deep', timeBudgetMs: 30000 }).mode, 'budget');
  assert.equal(optimizerDefaults({ timeBudgetMs: 30000 }).timeBudgetMs, 30000);
  // Der Zeitrahmen wird auf einen vertretbaren Bereich begrenzt.
  assert.equal(optimizerDefaults({ timeBudgetMs: 10 }).timeBudgetMs, 2000);
  assert.equal(optimizerDefaults({ timeBudgetMs: 99999999 }).timeBudgetMs, 1800000);
});

test('die Perfektionsphase lässt sich abschalten und wird dann ausgewiesen', async () => {
  const result = await plan(monthWithDays(2026, 9, 8), { perfectionEnabled: false });
  assert.equal(result.optimizerConfig.perfectionEnabled, false);
  assert.equal(result.metrics.optimizer.skipped, true);
  assert.equal(result.metrics.optimizer.rounds, 0);
  assert.equal(result.certified, undefined);
  assert.doesNotMatch(result.searchProfile, /Ruin-and-Recreate/);
});

test('ein vollständiger Lauf weist den Optimalitätsnachweis aus', async () => {
  const result = await plan(monthWithDays(2026, 9, 10));
  assert.equal(result.complete, true);
  assert.equal(result.metrics.optimizer.certified, true);
  assert.equal(result.certified, true);
  assert.ok(result.metrics.optimizer.certificationMoves > 0);
  assert.match(result.searchProfile, /Ruin-and-Recreate-Perfektion \(zertifiziert\)/);
});

test('harte Obergrenzen werden auch nach der Perfektion eingehalten', async () => {
  const monthData = monthWithDays(2026, 9, 12);
  const result = await plan(monthData, {
    staffLimits: { lurz: { maxBd: 1, maxHg: 1, maxTotal: 2 } }
  });
  assert.equal(result.complete, true);
  const bd = Object.values(result.plannedMonth.days).filter(day => day.bd === 'lurz').length;
  const hg = Object.values(result.plannedMonth.days).filter(day => day.hg === 'lurz').length;
  assert.ok(bd <= 1, `BD-Obergrenze eingehalten, tatsächlich ${bd}`);
  assert.ok(hg <= 1, `HG-Obergrenze eingehalten, tatsächlich ${hg}`);
  assert.ok(bd + hg <= 2);
});

test('Abwesenheiten sperren Personen auch in der Perfektionsphase', async () => {
  const monthData = monthWithDays(2026, 9, 12);
  for (let day = 1; day <= 12; day += 1) {
    setAbsence(monthData, 'becker', `2026-09-${String(day).padStart(2, '0')}`, 'urlaub');
  }
  const result = await plan(monthData);
  assert.equal(result.complete, true);
  const assigned = Object.values(result.plannedMonth.days)
    .some(day => day.bd === 'becker' || day.hg === 'becker');
  assert.equal(assigned, false);
});

test('der Perfektionsparametersatz ist Teil der Übernahmeprüfung', async () => {
  const monthData = monthWithDays(2026, 9, 8);
  const plannerState = stateWith(monthData);
  const result = await buildAutoPlan({
    state: plannerState,
    monthData,
    year: 2026,
    month: 9,
    runConfig: { searchIntensity: 'standard' }
  });
  assert.equal(result.complete, true);
  assert.equal(optimizerFingerprint(result.optimizerConfig), result.optimizerConfigFingerprint);

  const tampered = structuredClone(result);
  tampered.optimizerConfig.timeBudgetMs += 1000;
  assert.throws(
    () => applyAutoPlanProposal({ state: plannerState, currentMonth: monthData, proposal: tampered }),
    /Perfektionsparameter/
  );

  const merged = applyAutoPlanProposal({ state: plannerState, currentMonth: monthData, proposal: result });
  const open = Object.values(merged.days).reduce((sum, day) => sum + Number(!day.bd) + Number(!day.hg), 0);
  assert.equal(open, 0);
});

test('eine Übernahme mit verändertem Fixpunkt wird abgewiesen', async () => {
  const monthData = monthWithDays(2026, 9, 8);
  setAssignment(monthData, '2026-09-02', 'bd', 'lurz');
  const plannerState = stateWith(monthData);
  const result = await buildAutoPlan({
    state: plannerState,
    monthData,
    year: 2026,
    month: 9,
    runConfig: { searchIntensity: 'standard' }
  });
  const tampered = structuredClone(result);
  tampered.plannedMonth.days['2026-09-02'].bd = 'becker';
  assert.throws(
    () => applyAutoPlanProposal({ state: plannerState, currentMonth: monthData, proposal: tampered }),
    /gesetzten Dienst BD am 2026-09-02 verändert/
  );
});

test('die Telemetrie der Perfektionsphase ist vollständig angelegt', () => {
  const stats = emptyOptimizerStats();
  for (const key of ['rounds', 'moves', 'improvements', 'accepted', 'rejected', 'repairFailures',
    'restarts', 'evaluations', 'candidateChecks', 'certificationMoves', 'certificationRounds', 'elapsedMs']) {
    assert.equal(stats[key], 0, `${key} startet bei null`);
  }
  assert.equal(stats.certified, false);
  assert.deepEqual(stats.byNeighbourhood, {});
  assert.deepEqual(stats.byOperator, {});
});

test('der Fortschritt endet genau einmal mit einer Abschlussmeldung', async () => {
  const monthData = monthWithDays(2026, 9, 8);
  const plannerState = stateWith(monthData);
  const phases = [];
  await buildAutoPlan({
    state: plannerState,
    monthData,
    year: 2026,
    month: 9,
    runConfig: { searchIntensity: 'standard', timeBudgetMs: 3000 },
    onProgress: async update => { phases.push(update.phase); }
  });
  const finals = phases.filter(phase => phase === 'complete' || phase === 'blocked');
  assert.equal(finals.length, 1, `genau eine Abschlussmeldung, tatsächlich ${finals.length}`);
  assert.equal(phases[phases.length - 1], 'complete');
});
