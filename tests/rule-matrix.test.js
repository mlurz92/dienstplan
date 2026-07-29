/**
 * Vollständige Abnahme der Eignungsbewertung BD/HG.
 *
 * Zwei Teile:
 *
 * 1. Eine Matrix, die jede dokumentierte Regel einzeln ansteuert und die
 *    erwartete Stufe samt Begründung prüft.
 *
 * 2. Zwei Invarianten, die keine Einzelregel prüft, sondern die Bewertung als
 *    Ganzes. Sie hätten vier Fehler auf einen Schlag verhindert:
 *
 *    - **Reihenfolgeunabhängigkeit:** Zwei Dienste, die zueinander in Beziehung
 *      stehen, müssen gleich bewertet werden, egal welcher zuerst eingetragen
 *      wurde. Verletzt hatten das der BD-Tagesabstand, die Wochenendregel, die
 *      HG-Häufung und die HG/BD-Nachbarschaft.
 *    - **Selbstkonsistenz:** Eine bereits eingetragene Einteilung muss dieselbe
 *      Stufe bekommen wie dieselbe Person im Auswahldialog für denselben Tag.
 *      Verletzt hatte das die Kontingentprüfung: Sie zählte den bewerteten Tag
 *      mit und meldete den regulären letzten Dienst als Überschreitung.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { createEmptyMonth, DEFAULT_STAFF } = await import('../js/defaults.js');
const { evaluateCandidate, setAbsence, setAssignment, setPreference } = await import('../js/rules.js');

const key = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

function zustand(monate = [[2026, 7]]) {
  const months = new Map();
  for (const [year, month] of monate) months.set(key(year, month), createEmptyMonth(year, month));
  return { months, staff: structuredClone(DEFAULT_STAFF), currentYear: monate[0][0], currentMonth: monate[0][1] };
}
const monat = (state, year, month) => state.months.get(key(year, month));
const bewerte = (state, dateIso, role, staffId) => evaluateCandidate({
  state, monthData: monat(state, Number(dateIso.slice(0, 4)), Number(dateIso.slice(5, 7))), dateIso, role, staffId
});

/* ----------------------------------------------------------------------------
   Teil 1 – Regelmatrix
   -------------------------------------------------------------------------- */

const matrix = [
  {
    name: 'Qualifikation: HG nur für Fachärzte',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-08', 'hg', 'sebastian'),
    stufe: 'red',
    grund: 'HG nur für Fachärzte zulässig'
  },
  {
    name: 'Qualifikation: Samstags-BD nur für Fachärzte',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-04', 'bd', 'licenji'),
    stufe: 'red',
    grund: 'Samstags-BD nur für Fachärzte zulässig'
  },
  {
    name: 'Zeitgesteuerte Beförderung hebt die HG-Sperre auf',
    aufbau: () => zustand([[2026, 9], [2026, 10]]),
    prüfe: state => bewerte(state, '2026-10-07', 'hg', 'elhouba'),
    stufe: 'green'
  },
  {
    name: 'Vor der Beförderung bleibt die HG-Sperre bestehen',
    aufbau: () => zustand([[2026, 9]]),
    prüfe: state => bewerte(state, '2026-09-21', 'hg', 'elhouba'),
    stufe: 'red',
    grund: 'HG nur für Fachärzte zulässig'
  },
  {
    name: 'Abwesenheit sperrt den Tag',
    aufbau: () => { const state = zustand(); setAbsence(monat(state, 2026, 7), 'lurz', '2026-07-08', 'urlaub'); return state; },
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'lurz'),
    stufe: 'red',
    grund: 'Urlaub eingetragen'
  },
  {
    name: 'Wunsch „kein Dienst" sperrt beide Rollen',
    aufbau: () => { const state = zustand(); setPreference(monat(state, 2026, 7), 'martin', '2026-07-08', 'kein-dienst'); return state; },
    prüfe: state => bewerte(state, '2026-07-08', 'hg', 'martin'),
    stufe: 'red',
    grund: 'Wunsch: kein Dienst'
  },
  {
    name: 'Positiver Wunsch verschlechtert die Bewertung nicht',
    aufbau: () => { const state = zustand(); setPreference(monat(state, 2026, 7), 'martin', '2026-07-08', 'bd-bevorzugt'); return state; },
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'martin'),
    stufe: 'green',
    grund: 'Wunsch: BD bevorzugt'
  },
  {
    name: 'Dieselbe Person am selben Tag in beiden Rollen',
    aufbau: () => { const state = zustand(); setAssignment(monat(state, 2026, 7), '2026-07-08', 'hg', 'martin'); return state; },
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'martin'),
    stufe: 'red',
    grund: 'Gleichzeitige Einteilung in HG und BD am selben Tag'
  },
  {
    name: 'Dr. Polednia: dienstags kein Dienst',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-07', 'bd', 'polednia'),
    stufe: 'red',
    grund: 'Dr. Polednia dienstags und sonntags weder BD noch HG'
  },
  {
    name: 'Dr. Polednia: sonntags kein Dienst',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-05', 'hg', 'polednia'),
    stufe: 'red',
    grund: 'Dr. Polednia dienstags und sonntags weder BD noch HG'
  },
  {
    name: 'Dr. Becker: Samstags-BD nur nachrangig',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-04', 'bd', 'becker'),
    stufe: 'orange',
    grund: 'Samstags-BD für Dr. Becker nur nachrangig'
  },
  {
    name: 'Fr. Dalitz: HG an So/Mo bei Sebastian-BD nachrangig',
    aufbau: () => { const state = zustand(); setAssignment(monat(state, 2026, 7), '2026-07-06', 'bd', 'sebastian'); return state; },
    prüfe: state => bewerte(state, '2026-07-06', 'hg', 'dalitz'),
    stufe: 'orange',
    grund: 'Dalitz-HG an So/Mo bei Sebastian-BD nur nachrangig'
  },
  {
    name: 'BD-Richtwert erst bei der Überschreitung',
    aufbau: () => {
      const state = zustand();
      for (const tag of ['2026-07-06', '2026-07-09', '2026-07-13']) setAssignment(monat(state, 2026, 7), tag, 'bd', 'polednia');
      return state;
    },
    prüfe: state => bewerte(state, '2026-07-16', 'bd', 'polednia'),
    stufe: 'yellow',
    grund: 'BD-Richtwert 3 bereits erreicht'
  },
  {
    name: 'Hartes Monatsmaximum sperrt den zusätzlichen Dienst',
    aufbau: () => {
      const state = zustand([[2026, 10]]);
      for (const tag of ['2026-10-06', '2026-10-13']) setAssignment(monat(state, 2026, 10), tag, 'bd', 'hellmann');
      return state;
    },
    prüfe: state => bewerte(state, '2026-10-20', 'bd', 'hellmann'),
    stufe: 'red',
    grund: 'Monatsmaximum von 2 BD bereits erreicht'
  },
  {
    name: 'BD unmittelbar vor Urlaubsbeginn',
    aufbau: () => { const state = zustand(); setAbsence(monat(state, 2026, 7), 'martin', '2026-07-09', 'urlaub'); return state; },
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'martin'),
    stufe: 'orange',
    grund: 'BD unmittelbar vor Urlaubsbeginn'
  },
  {
    name: 'Oster-/Pfingst-Alternanz',
    aufbau: () => {
      const state = zustand([[2026, 4], [2026, 5]]);
      setAssignment(monat(state, 2026, 4), '2026-04-03', 'bd', 'lurz');
      return state;
    },
    prüfe: state => bewerte(state, '2026-05-24', 'hg', 'lurz'),
    stufe: 'orange',
    grund: 'Bereits Dienst im alternierenden Oster-/Pfingstblock'
  },
  {
    name: 'Freier Werktag ohne Vorbelastung ist geeignet',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'martin'),
    stufe: 'green',
    grund: 'Keine relevanten Konflikte'
  }
];

for (const fall of matrix) {
  test(`Regel: ${fall.name}`, () => {
    const bewertung = fall.prüfe(fall.aufbau());
    assert.equal(bewertung.level, fall.stufe, `Stufe abweichend. Gründe: ${bewertung.reasons.join(' | ')}`);
    if (fall.grund) {
      assert.ok(bewertung.reasons.includes(fall.grund), `„${fall.grund}" fehlt. Gründe: ${bewertung.reasons.join(' | ')}`);
    }
  });
}

/* ----------------------------------------------------------------------------
   Teil 2 – Invarianten
   -------------------------------------------------------------------------- */

/** Paare zueinander in Beziehung stehender Dienste; die Reihenfolge darf nichts ändern. */
const paare = [
  { name: 'BD an zwei aufeinanderfolgenden Tagen', a: ['2026-07-07', 'bd'], b: ['2026-07-08', 'bd'], wer: 'lurz' },
  { name: 'BD mit zwei Tagen Abstand', a: ['2026-07-06', 'bd'], b: ['2026-07-08', 'bd'], wer: 'lurz' },
  { name: 'BD an benachbarten Wochenenden', a: ['2026-07-04', 'bd'], b: ['2026-07-11', 'bd'], wer: 'lurz' },
  { name: 'HG an benachbarten Wochenenden', a: ['2026-07-05', 'hg'], b: ['2026-07-12', 'hg'], wer: 'dalitz' },
  { name: 'HG an zwei aufeinanderfolgenden Tagen', a: ['2026-07-08', 'hg'], b: ['2026-07-09', 'hg'], wer: 'dalitz' },
  { name: 'HG und eigener BD am Folgetag', a: ['2026-07-08', 'hg'], b: ['2026-07-09', 'bd'], wer: 'martin' }
];

for (const paar of paare) {
  test(`Invariante Reihenfolge: ${paar.name}`, () => {
    const [datumA, rolleA] = paar.a;
    const [datumB, rolleB] = paar.b;

    // Variante 1: A steht, B wird bewertet.
    const ersteReihenfolge = zustand();
    setAssignment(monat(ersteReihenfolge, 2026, 7), datumA, rolleA, paar.wer);
    const bewertungB = bewerte(ersteReihenfolge, datumB, rolleB, paar.wer);

    // Variante 2: B steht, A wird bewertet.
    const zweiteReihenfolge = zustand();
    setAssignment(monat(zweiteReihenfolge, 2026, 7), datumB, rolleB, paar.wer);
    const bewertungA = bewerte(zweiteReihenfolge, datumA, rolleA, paar.wer);

    assert.equal(
      bewertungA.level,
      bewertungB.level,
      `Reihenfolge ändert die Bewertung: „${datumA} ${rolleA}" ergibt ${bewertungA.level} (${bewertungA.reasons.join(' | ')}), `
      + `„${datumB} ${rolleB}" ergibt ${bewertungB.level} (${bewertungB.reasons.join(' | ')})`
    );
  });
}

test('Invariante Selbstkonsistenz: eine bestehende Einteilung wird wie ein Vorschlag bewertet', () => {
  // Für jede Person werden bis an ihr Kontingent heran Dienste vergeben. Die
  // bereits eingetragene Einteilung darf keine andere Stufe bekommen als
  // dieselbe Person im Auswahldialog für denselben Tag.
  const tage = ['2026-07-06', '2026-07-09', '2026-07-13', '2026-07-16'];
  for (const person of DEFAULT_STAFF.filter(item => item.includeInPlanning)) {
    for (const anzahl of [1, 2, 3, 4]) {
      const belegt = zustand();
      const frei = zustand();
      for (const tag of tage.slice(0, anzahl)) {
        setAssignment(monat(belegt, 2026, 7), tag, 'bd', person.id);
        // Im Vergleichszustand fehlt genau der zuletzt gesetzte Tag.
        if (tag !== tage[anzahl - 1]) setAssignment(monat(frei, 2026, 7), tag, 'bd', person.id);
      }
      const letzterTag = tage[anzahl - 1];
      const bestehend = bewerte(belegt, letzterTag, 'bd', person.id);
      const vorschlag = bewerte(frei, letzterTag, 'bd', person.id);
      assert.equal(
        bestehend.level,
        vorschlag.level,
        `${person.name}, ${anzahl}. BD am ${letzterTag}: bestehend ${bestehend.level} `
        + `(${bestehend.reasons.join(' | ')}) vs. Vorschlag ${vorschlag.level} (${vorschlag.reasons.join(' | ')})`
      );
    }
  }
});
