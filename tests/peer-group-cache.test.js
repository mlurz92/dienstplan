/**
 * Gleichwertigkeit des Vergleichsgruppen-Speichers.
 *
 * Der Speicher darf die Regelbewertung ausschließlich beschleunigen, niemals
 * verändern. Geprüft wird das nicht an ausgesuchten Beispielen, sondern über
 * viele zufällig erzeugte Belegungszustände: Für jeden wird der Monat einmal
 * mit und einmal ohne Speicher vollständig durchbewertet, und beide Ergebnisse
 * müssen in Stufe, Wählbarkeit, Empfehlungsvektor und Begründungstexten exakt
 * übereinstimmen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const {
  evaluateCandidate,
  setAbsence,
  setPeerGroupCacheToken,
  setPreference
} = await import('../js/rules.js');

function emptyDay() {
  return { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
}

function buildMonth() {
  const days = {};
  for (let day = 1; day <= 30; day += 1) {
    days[`2026-09-${String(day).padStart(2, '0')}`] = emptyDay();
  }
  const monthData = {
    schemaVersion: 1, year: 2026, month: 9, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {},
    overrideLog: [], importLog: []
  };
  setAbsence(monthData, 'becker', '2026-09-10', 'urlaub');
  setAbsence(monthData, 'martin', '2026-09-11', 'fza');
  setPreference(monthData, 'martin', '2026-09-12', 'bd-bevorzugt');
  setPreference(monthData, 'lurz', '2026-09-14', 'kein-dienst');
  return monthData;
}

/** Einfacher, festgelegter Generator – der Test darf nicht zufällig ausfallen. */
function createSequence(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function fingerprintOfEvaluation(evaluation) {
  return [
    evaluation.level,
    evaluation.canSelect,
    evaluation.meta.recommendationScore,
    evaluation.meta.recommendationVector.join('.'),
    evaluation.meta.confirmationType,
    evaluation.reasons.join('~')
  ].join('|');
}

test('der Vergleichsgruppen-Speicher verändert keine einzige Bewertung', () => {
  const monthData = buildMonth();
  const state = {
    months: new Map([['2026-09', monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: 2026,
    currentMonth: 9,
    monthSources: new Map([['2026-09', 'server']])
  };
  const staff = state.staff.filter(person => person.includeInPlanning);
  const dates = Object.keys(monthData.days);
  const random = createSequence(20260803);

  const signature = () => dates.map(iso => `${monthData.days[iso].bd}/${monthData.days[iso].hg}`).join(',');
  const sweep = () => {
    const result = [];
    for (const dateIso of dates) {
      for (const role of ['bd', 'hg']) {
        for (const person of staff) {
          result.push(fingerprintOfEvaluation(
            evaluateCandidate({ state, monthData, dateIso, role, staffId: person.id })
          ));
        }
      }
    }
    return result;
  };

  let compared = 0;
  try {
    for (let round = 0; round < 8; round += 1) {
      for (const dateIso of dates) {
        monthData.days[dateIso].bd = random() < .8 ? staff[Math.floor(random() * staff.length)].id : '';
        monthData.days[dateIso].hg = random() < .8 ? staff[Math.floor(random() * staff.length)].id : '';
      }

      setPeerGroupCacheToken(null);
      const withoutCache = sweep();
      setPeerGroupCacheToken(`test|${signature()}`);
      const withCache = sweep();

      assert.deepEqual(withCache, withoutCache, `Runde ${round + 1} weicht ab`);
      compared += withoutCache.length;
    }
  } finally {
    setPeerGroupCacheToken(null);
  }
  assert.ok(compared > 4000, `ausreichend viele Bewertungen verglichen, tatsächlich ${compared}`);
});

test('ein veränderter Belegungszustand verwirft den Speicher', () => {
  const monthData = buildMonth();
  const state = {
    months: new Map([['2026-09', monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: 2026,
    currentMonth: 9,
    monthSources: new Map([['2026-09', 'server']])
  };
  const evaluate = () => fingerprintOfEvaluation(
    evaluateCandidate({ state, monthData, dateIso: '2026-09-16', role: 'hg', staffId: 'dalitz' })
  );

  try {
    setPeerGroupCacheToken('run|leer');
    const before = evaluate();

    // Ein eigener HG am Vortag löst die Regel „Erneuter HG innerhalb von drei
    // Kalendertagen" aus und muss die Bewertung sichtbar verändern.
    monthData.days['2026-09-15'].hg = 'dalitz';
    setPeerGroupCacheToken('run|nach-belegung');
    const after = evaluate();

    setPeerGroupCacheToken(null);
    assert.equal(after, evaluate(), 'mit neuer Marke stimmt das Ergebnis mit dem ungespeicherten überein');
    assert.notEqual(before, after, 'die veränderte Belegung wirkt sich tatsächlich aus');
  } finally {
    setPeerGroupCacheToken(null);
  }
});

test('ohne Marke bleibt der Speicher vollständig abgeschaltet', () => {
  const monthData = buildMonth();
  const state = {
    months: new Map([['2026-09', monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: 2026,
    currentMonth: 9,
    monthSources: new Map([['2026-09', 'server']])
  };
  const evaluate = () => fingerprintOfEvaluation(
    evaluateCandidate({ state, monthData, dateIso: '2026-09-18', role: 'bd', staffId: 'sebastian' })
  );

  setPeerGroupCacheToken(null);
  const before = evaluate();
  monthData.days['2026-09-17'].bd = 'sebastian';
  const after = evaluate();
  assert.notEqual(before, after, 'ohne Marke wirkt jede Änderung sofort');
});
