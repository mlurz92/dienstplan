import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { createEmptyMonth, DEFAULT_STAFF } = await import('../js/defaults.js');
const { evaluateCandidate, setAssignment, setPreference } = await import('../js/rules.js');

const key = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

function stateWith(year = 2026, monthNumber = 8) {
  const map = new Map([[key(year, monthNumber), createEmptyMonth(year, monthNumber)]]);
  return {
    months: map,
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: year,
    currentMonth: monthNumber,
    monthSources: new Map([[key(year, monthNumber), 'server']])
  };
}

const month = (state, year, number) => state.months.get(key(year, number));
const evalAt = (state, iso, role, staffId) => evaluateCandidate({
  state,
  monthData: month(state, Number(iso.slice(0, 4)), Number(iso.slice(5, 7))),
  dateIso: iso,
  role,
  staffId
});

// August 2026: 1.8. ist Samstag. Die erste Fr-Sa-So-Kette des Monats ist
// Fr 7.8. – Sa 8.8. – So 9.8.
const FRIDAY = '2026-08-07';
const SATURDAY = '2026-08-08';
const SUNDAY = '2026-08-09';

test('Fr-BD · Sa frei · So-BD ist rot mit spezieller Bestätigung (Freitag-Seite)', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), SUNDAY, 'bd', 'lurz');
  const result = evalAt(state, FRIDAY, 'bd', 'lurz');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, true);
  assert.equal(result.meta.confirmationType, 'special');
  assert.equal(result.meta.selectionPolicy, 'special');
  assert.equal(result.meta.weekendGap, true);
  assert.ok(result.reasons.some(reason => reason.includes('Fr-BD · Sa frei · So-BD')));
});

test('Fr-BD · Sa frei · So-BD ist rot mit spezieller Bestätigung (Sonntag-Seite, symmetrisch)', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), FRIDAY, 'bd', 'lurz');
  const result = evalAt(state, SUNDAY, 'bd', 'lurz');
  assert.equal(result.level, 'red');
  assert.equal(result.meta.confirmationType, 'special');
  assert.ok(result.reasons.some(reason => reason.includes('Fr-BD · Sa frei · So-BD')));
});

test('besetzter Samstag unterbricht die Kette (HG reicht)', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), FRIDAY, 'bd', 'lurz');
  setAssignment(month(state, 2026, 8), SATURDAY, 'hg', 'lurz');
  setAssignment(month(state, 2026, 8), SUNDAY, 'bd', 'lurz');
  const friday = evalAt(state, FRIDAY, 'bd', 'lurz');
  const sunday = evalAt(state, SUNDAY, 'bd', 'lurz');
  assert.notEqual(friday.meta.confirmationType, 'special');
  assert.notEqual(sunday.meta.confirmationType, 'special');
});

test('RBN am Samstag bedeutet nicht frei', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), FRIDAY, 'bd', 'lurz');
  // Die RBN-Felder tragen Anzeigenamen, keine IDs – hier der Name von 'lurz'.
  setAssignment(month(state, 2026, 8), SATURDAY, 'rbn1', 'Dr. Lurz');
  setAssignment(month(state, 2026, 8), SUNDAY, 'bd', 'lurz');
  const result = evalAt(state, FRIDAY, 'bd', 'lurz');
  assert.notEqual(result.meta.confirmationType, 'special');
});

test('ohne Sonntags-BD ist der Freitags-BD nicht rot', () => {
  const state = stateWith();
  const result = evalAt(state, FRIDAY, 'bd', 'lurz');
  assert.equal(result.meta.weekendGap, undefined);
});

test('ohne Freitags-BD ist der Sonntags-BD nicht rot', () => {
  const state = stateWith();
  const result = evalAt(state, SUNDAY, 'bd', 'lurz');
  assert.equal(result.meta.weekendGap, undefined);
});

test('die Kette gilt nur für BD-Zellen, nicht für HG', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), FRIDAY, 'bd', 'lurz');
  setAssignment(month(state, 2026, 8), SUNDAY, 'bd', 'lurz');
  const result = evalAt(state, FRIDAY, 'hg', 'lurz');
  assert.equal(result.meta.weekendGap, undefined);
});

test('graue Bewertungen werden durch die Kette nie freigeschaltet', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), SUNDAY, 'bd', 'hellmann');
  const result = evalAt(state, FRIDAY, 'bd', 'hellmann');
  // Die Kette darf eine nicht wählbare Person niemals in eine bestätigbare
  // Auswahl verwandeln – unabhängig davon, wie die Basisengine den Farbton
  // (grau oder gelb) in diesem Randfall ausweist.
  assert.equal(result.canSelect, false);
  assert.equal(result.meta.selectionPolicy, 'blocked');
  assert.equal(result.meta.weekendGap, undefined);
});

test('die Kette greift nicht über die Wochenmitte (Freitag + übernächster Sonntag)', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), '2026-08-16', 'bd', 'lurz');
  const result = evalAt(state, FRIDAY, 'bd', 'lurz');
  assert.equal(result.meta.weekendGap, undefined);
});

test('die Kette gilt für jede Fr-Sa-So-Folge des Monats', () => {
  const state = stateWith();
  const friday = '2026-08-14';
  const sunday = '2026-08-16';
  setAssignment(month(state, 2026, 8), sunday, 'bd', 'lurz');
  const result = evalAt(state, friday, 'bd', 'lurz');
  assert.equal(result.meta.confirmationType, 'special');
});

test('Wünsche können die besondere Bestätigungspflicht nicht überdecken', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 8), SUNDAY, 'bd', 'lurz');
  setPreference(month(state, 2026, 8), 'lurz', FRIDAY, 'bd-bevorzugt');
  const result = evalAt(state, FRIDAY, 'bd', 'lurz');
  assert.equal(result.level, 'red');
  assert.equal(result.meta.confirmationType, 'special');
});
