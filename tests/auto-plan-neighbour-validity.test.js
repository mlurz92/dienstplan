import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { buildAutoPlan } = await import('../js/auto-planner-engine.js');
const { evaluateCandidate } = await import('../js/rules.js');

/**
 * Gerichtete Regeln dürfen nicht erst im Schlussaudit auffallen.
 *
 * Mehrere harte Regeln bewerten nur eine Seite eines Paares: „BD am Vortag:
 * Folgetag ist dienstfrei" wertet den Hintergrunddienst ab, nicht den
 * Bereitschaftsdienst, der ihn ungültig macht. Die Konstruktion setzte deshalb
 * erst den HG (damals zulässig) und später den BD des Vortags — die
 * Kandidatenprüfung des BD sah nichts, und die Bewertung des HG stammte aus
 * einer Zeit, in der es den BD noch nicht gab.
 *
 * Ergebnis war kein leicht fehlerhafter Plan, sondern gar keiner: Das
 * Schlussaudit verwarf den vollständigen Monat wegen der nicht wählbaren
 * Zuweisungen, und der Lauf meldete null Vorschläge bei 56 offenen Feldern.
 *
 * Der Test fährt den Fall, an dem das reproduzierbar auftrat: ein voller
 * Februar mit dem Standardpersonal, ohne Fixpunkte.
 */

const emptyDay = () => ({ bd: '', hg: '', rbn1: '', rbn2: '', notes: '' });

function fullMonth(year, month) {
  const count = new Date(year, month, 0).getDate();
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days: Object.fromEntries(Array.from({ length: count }, (_, index) => [
      `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, emptyDay()
    ])),
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

test('ein voller Monat wird vollständig und ohne Nachaudit-Verstöße belegt', async () => {
  const monthData = fullMonth(2026, 2);
  const state = stateWith(monthData);
  const result = await buildAutoPlan({
    state, monthData, year: 2026, month: 2,
    runConfig: { searchIntensity: 'standard' }
  });

  assert.equal(result.metrics.unfilled, 0, `offene Felder: ${result.metrics.unfilled}`);
  assert.equal(result.changes.length, result.openSlots, 'jedes offene Feld ist vorgeschlagen');
  assert.equal(result.complete, true);

  // Der eigentliche Kern: Was die Konstruktion für zulässig hielt, muss die
  // Regelengine im fertigen Monat noch einmal bestätigen.
  const planned = result.plannedMonth;
  const auditState = { ...state, months: new Map([['2026-02', planned]]) };
  const violations = [];
  for (const [dateIso, day] of Object.entries(planned.days)) {
    for (const role of ['bd', 'hg']) {
      if (!day[role]) continue;
      const evaluation = evaluateCandidate({ state: auditState, monthData: planned, dateIso, role, staffId: day[role] });
      if (evaluation.level === 'gray' || evaluation.canSelect === false || evaluation.level === 'red') {
        violations.push(`${dateIso} ${role} ${day[role]}: ${evaluation.reasons.join(' / ')}`);
      }
    }
  }
  assert.deepEqual(violations, [], `nicht wählbare Zuweisungen im fertigen Plan:\n${violations.join('\n')}`);
});
