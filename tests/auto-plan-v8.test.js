/**
 * Zusicherungen der Auto-Plan-Engine v8.
 *
 * Der Schwerpunkt liegt auf den Stellen, an denen v8 Nebenrechnungen
 * *inkrementell* macht. Genau dort wäre ein Fehler am gefährlichsten: Ein
 * fortgeschriebener Zustand, der von der Wirklichkeit abweicht, führt zu
 * Vergleichsgruppen aus einem anderen Belegungszustand und damit zu einer
 * fachlich falschen Bewertung, ohne dass irgendetwas sichtbar bricht.
 *
 * Die Prüfungen sind deshalb bewusst als Invarianten formuliert und nicht als
 * Erwartungswerte einzelner Läufe: Sie müssen für jede Zugfolge gelten.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const {
  baselineOpenSlots,
  buildLedger,
  internStaffId,
  ledgerApply,
  ledgerCount,
  lubyValue,
  monthDatesOf,
  planToken,
  primeStaffIds,
  spread
} = await import('../js/auto-plan-index.js');
const { PlanOptimizer, createOperatorLearning, rollOverSegment, REACTION_FACTOR } =
  await import('../js/auto-planner-optimizer.js');
const { evaluatePlanObjective, normalizeAutoPlanConfig } = await import('../js/auto-planner-engine.js');
const { AUTO_PLAN_REVISION, AUTO_PLAN_STAGES, buildAutoPlan } = await import('../js/auto-planner-v8.js');

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

test('die Luby-Folge entspricht der Definition', () => {
  const observed = Array.from({ length: 15 }, (_, index) => lubyValue(index + 1));
  assert.deepEqual(observed, [1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8]);
});

test('die Spannweite misst den Abstand zwischen der höchsten und der niedrigsten Last', () => {
  assert.equal(spread([]), 0);
  assert.equal(spread([3, 3, 3]), 0);
  assert.equal(spread([1, 4, 2]), 3);
  // Zwei Verteilungen mit derselben Varianz, aber verschiedener Spannweite –
  // genau der Fall, den die Zielordnung vorher nicht unterscheiden konnte.
  assert.ok(spread([0, 2, 2, 4]) > spread([1, 2, 2, 3]));
});

test('die Tagesliste eines Monats wird geteilt und nicht je Aufruf neu sortiert', () => {
  const monthData = monthWithDays(2026, 9, 5);
  const first = monthDatesOf(monthData);
  assert.deepEqual(first, [
    '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'
  ]);
  assert.equal(monthDatesOf(monthData), first, 'dasselbe Monatsobjekt liefert dieselbe Liste');
});

test('die offenen Felder des Ausgangsmonats sind unveränderlich und stabil', () => {
  const monthData = monthWithDays(2026, 9, 3);
  monthData.days['2026-09-02'].bd = 'lurz';
  const slots = baselineOpenSlots(monthData);
  assert.equal(slots.length, 5, 'sechs Felder abzüglich eines gesetzten');
  assert.ok(Object.isFrozen(slots), 'eine geteilte Liste darf niemand verändern');
  assert.equal(baselineOpenSlots(monthData), slots);
  assert.deepEqual(slots.map(slot => slot.role), ['bd', 'bd', 'hg', 'hg', 'hg']);
});

test('das Zählwerk bildet jede Umbuchung korrekt ab', () => {
  const monthData = monthWithDays(2026, 9, 3);
  monthData.days['2026-09-01'].bd = 'lurz';
  monthData.days['2026-09-02'].bd = 'lurz';
  monthData.days['2026-09-03'].hg = 'becker';
  const ledger = buildLedger(monthData);
  assert.equal(ledgerCount(ledger, 'lurz', 'bd'), 2);
  assert.equal(ledgerCount(ledger, 'becker', 'hg'), 1);

  ledgerApply(ledger, 'bd', 'lurz', 'martin');
  assert.equal(ledgerCount(ledger, 'lurz', 'bd'), 1);
  assert.equal(ledgerCount(ledger, 'martin', 'bd'), 1);

  ledgerApply(ledger, 'bd', 'lurz', '');
  assert.equal(ledgerCount(ledger, 'lurz', 'bd'), 0);
  assert.ok(!('lurz' in ledger.bd), 'eine leere Zählung bleibt nicht als Nulleintrag zurück');
});

test('die Marke des Belegungszustands ist verlustfrei', () => {
  primeStaffIds(DEFAULT_STAFF);
  const monthData = monthWithDays(2026, 9, 4);
  const before = planToken(monthData, 1);
  assert.equal(planToken(monthData, 1), before, 'unveränderter Zustand, unveränderte Marke');
  assert.notEqual(planToken(monthData, 2), before, 'eine neue Epoche verwirft den Speicher');

  monthData.days['2026-09-02'].bd = 'lurz';
  const withBd = planToken(monthData, 1);
  assert.notEqual(withBd, before);

  // Dieselbe Person in der anderen Rolle muss eine andere Marke ergeben –
  // andernfalls lieferte der Speicher Vergleichsgruppen des falschen Dienstes.
  monthData.days['2026-09-02'].bd = '';
  monthData.days['2026-09-02'].hg = 'lurz';
  assert.notEqual(planToken(monthData, 1), withBd);
});

test('internierte Kennungen sind über die Vorbelegung reproduzierbar', () => {
  primeStaffIds(DEFAULT_STAFF);
  const sorted = DEFAULT_STAFF.map(person => person.id).sort();
  const numbers = sorted.map(id => internStaffId(id));
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b),
    'die Vorbelegung vergibt die Nummern in alphabetischer Reihenfolge');
  assert.equal(internStaffId(''), 0, 'der leere Dienst trägt fest die Null');
});

/**
 * Die zentrale Zusicherung von v8.
 *
 * Der Perfektionsoptimierer schreibt die Marke seines Arbeitsmonats fort,
 * statt sie aus den Daten abzuleiten. Das ist nur zulässig, solange jede
 * Änderung durch seinen Schreibtrichter geht. Geprüft wird deshalb über eine
 * lange, gemischte Zugfolge: gleiche Marke bedeutet gleiche Belegung, und jede
 * Änderung erzeugt eine neue Marke.
 */
test('die fortgeschriebene Marke des Optimierers bleibt exakt', () => {
  const monthData = monthWithDays(2026, 9, 10);
  const plannerState = stateWith(monthData);
  const config = normalizeAutoPlanConfig(plannerState, monthData, { allowRedFallback: true });
  const optimizer = new PlanOptimizer({
    state: plannerState,
    baseline: structuredClone(monthData),
    config,
    allowRed: true,
    seed: 'v8-marken-invariante'
  });

  const seen = new Map();
  const record = () => {
    const version = optimizer.planVersion;
    const signature = optimizer.slotSignature();
    if (seen.has(version)) {
      assert.equal(seen.get(version), signature,
        'dieselbe Marke darf nie zwei verschiedene Belegungen bezeichnen');
    } else {
      for (const [otherVersion, otherSignature] of seen) {
        if (otherSignature === signature) continue;
        assert.notEqual(otherVersion, version);
      }
      seen.set(version, signature);
    }
    return { version, signature };
  };

  record();
  const people = DEFAULT_STAFF.filter(person => person.includeInPlanning).map(person => person.id);
  for (let step = 0; step < 300; step += 1) {
    const slot = optimizer.slots[step % optimizer.slots.length];
    const staffId = step % 7 === 0 ? '' : people[step % people.length];
    const previous = record();
    optimizer.write(slot.dateIso, slot.role, staffId);
    const next = record();
    if (previous.signature === next.signature) {
      assert.equal(previous.version, next.version, 'ein wirkungsloser Schreibvorgang erzeugt keine neue Marke');
    } else {
      assert.notEqual(previous.version, next.version, 'jede tatsächliche Änderung erzeugt eine neue Marke');
    }
  }

  // Das Zählwerk muss dieselbe Wirklichkeit beschreiben wie der Arbeitsmonat.
  const recomputed = buildLedger(optimizer.working);
  assert.deepEqual({ ...optimizer.ledger.bd }, { ...recomputed.bd }, 'BD-Zählwerk stimmt mit dem Monat überein');
  assert.deepEqual({ ...optimizer.ledger.hg }, { ...recomputed.hg }, 'HG-Zählwerk stimmt mit dem Monat überein');
});

test('die Probe stellt Belegung, Zählwerk und Marke vollständig wieder her', () => {
  const monthData = monthWithDays(2026, 9, 6);
  const plannerState = stateWith(monthData);
  const config = normalizeAutoPlanConfig(plannerState, monthData, {});
  const optimizer = new PlanOptimizer({
    state: plannerState,
    baseline: structuredClone(monthData),
    config,
    allowRed: true,
    seed: 'v8-probe'
  });

  optimizer.write('2026-09-01', 'bd', 'lurz');
  const before = optimizer.slotSignature();
  const ledgerBefore = { bd: { ...optimizer.ledger.bd }, hg: { ...optimizer.ledger.hg } };

  optimizer.probe([{ dateIso: '2026-09-01', role: 'bd', staffId: 'martin' }], () => {
    assert.equal(optimizer.working.days['2026-09-01'].bd, 'martin');
    assert.equal(ledgerCount(optimizer.ledger, 'martin', 'bd'), 1);
    assert.equal(ledgerCount(optimizer.ledger, 'lurz', 'bd'), 0);
  });

  assert.equal(optimizer.slotSignature(), before);
  assert.deepEqual({ ...optimizer.ledger.bd }, ledgerBefore.bd);
  assert.deepEqual({ ...optimizer.ledger.hg }, ledgerBefore.hg);
});

test('die segmentweise Gewichtsanpassung folgt der Formel von Ropke und Pisinger', () => {
  const operators = ['a', 'b'];
  const learning = createOperatorLearning(operators);
  const a = learning.get('a');
  a.segmentUses = 4;
  a.segmentReward = 12;
  const b = learning.get('b');
  b.segmentUses = 0;
  b.segmentReward = 0;

  rollOverSegment(operators, learning);

  // w_neu = w_alt · (1 − λ) + λ · (Belohnung / Nutzungen) = 1 · .65 + .35 · 3
  assert.ok(Math.abs(learning.get('a').weight - (1 * (1 - REACTION_FACTOR) + REACTION_FACTOR * 3)) < 1e-9);
  assert.equal(learning.get('a').segmentUses, 0, 'das Segment beginnt danach neu');
  assert.equal(learning.get('a').segmentReward, 0);
  assert.equal(learning.get('b').weight, 1, 'ohne Einsatz im Segment bleibt das Gewicht unverändert');
});

test('die Zielordnung entscheidet nachrangig über Spannweiten', () => {
  const monthData = monthWithDays(2026, 9, 6);
  const plannerState = stateWith(monthData);
  const config = normalizeAutoPlanConfig(plannerState, monthData, {});
  const objective = evaluatePlanObjective(plannerState, monthData, monthData, config);

  assert.ok(Number.isFinite(objective.fairness.bdSpread));
  assert.ok(Number.isFinite(objective.fairness.combinedSpread));
  assert.ok(Number.isFinite(objective.fairness.weekendSpread));
  // Die drei Spannweiten bilden das Ende des Schlüssels und ändern damit keine
  // bereits getroffene Entscheidung.
  assert.deepEqual(objective.key.slice(-3), [
    objective.fairness.bdSpread,
    objective.fairness.combinedSpread,
    objective.fairness.weekendSpread
  ]);
});

test('v8 kennzeichnet Ergebnis und Stufenbeschreibung', async () => {
  assert.equal(AUTO_PLAN_REVISION, 8);
  assert.equal(AUTO_PLAN_STAGES.length, 6);
  assert.deepEqual(AUTO_PLAN_STAGES.map(stage => stage.id),
    ['analysis', 'construct', 'rescue', 'repair', 'perfect', 'certify']);
  for (const stage of AUTO_PLAN_STAGES) {
    assert.ok(stage.title && stage.detail, `Stufe ${stage.id} ist vollständig beschrieben`);
  }

  const monthData = monthWithDays(2026, 9, 3);
  const plannerState = stateWith(monthData);
  const result = await buildAutoPlan({
    state: plannerState,
    monthData,
    year: monthData.year,
    month: monthData.month,
    runConfig: {
      searchIntensity: 'standard',
      repairIterations: 0,
      perfectionEnabled: false,
      zeroRedRescue: false,
      profileFilter: ['strict-balanced']
    }
  });

  assert.equal(result.algorithmRevision, 8);
  assert.equal(result.metrics.engine, 'v8-incremental-constraint-observatory');
});

test('die Telemetrie weist beide Operatordimensionen getrennt aus', async () => {
  const { emptyOptimizerStats } = await import('../js/auto-planner-optimizer.js');
  const stats = emptyOptimizerStats();
  assert.deepEqual(stats.byOperator, {});
  assert.deepEqual(stats.byRepair, {});
  assert.deepEqual(stats.operatorLearning, {});
  assert.deepEqual(stats.repairLearning, {});
  assert.equal(stats.segments, 0);
});
