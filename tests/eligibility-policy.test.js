import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { createEmptyMonth, DEFAULT_STAFF } = await import('../js/defaults.js');
const {
  collectIssues,
  evaluateCandidate,
  setAbsence,
  setAssignment,
  setPreference
} = await import('../js/rules.js');

const key = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

function stateWith(months = [[2026, 7]]) {
  const map = new Map(months.map(([year, month]) => [key(year, month), createEmptyMonth(year, month)]));
  return {
    months: map,
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: months.at(-1)[0],
    currentMonth: months.at(-1)[1]
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

const has = (result, fragment) => result.reasons.some(reason => reason.includes(fragment));

test('fehlende Qualifikation ist rot und nicht überschreibbar', () => {
  const state = stateWith();
  const result = evalAt(state, '2026-07-08', 'hg', 'sebastian');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, false);
  assert.equal(result.meta.selectionPolicy, 'blocked');
  assert.equal(result.reasons[0], 'HG nur für Fachärzte zulässig');
});

test('gleichzeitiger BD und HG ist nicht überschreibbar', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 7), '2026-07-08', 'hg', 'martin');
  const result = evalAt(state, '2026-07-08', 'bd', 'martin');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, false);
  assert.ok(has(result, 'Gleichzeitige Einteilung'));
});

test('direkt aufeinanderfolgende BD sind nicht überschreibbar', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 7), '2026-07-06', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-07', 'bd', 'lurz');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, false);
  assert.ok(result.reasons.includes('BD bereits am Vortag'));
});

test('Abwesenheit verlangt eine besondere, aber mögliche Bestätigung', () => {
  const state = stateWith();
  setAbsence(month(state, 2026, 7), 'martin', '2026-07-08', 'urlaub');
  const result = evalAt(state, '2026-07-08', 'bd', 'martin');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, true);
  assert.equal(result.meta.confirmationType, 'special');
  assert.equal(result.reasons[0], 'Urlaub eingetragen');
  assert.ok(result.reasons.includes('Besondere Bestätigung erforderlich'));
});

test('Polednia-Sperre verlangt eine besondere Bestätigung', () => {
  const state = stateWith();
  const result = evalAt(state, '2026-07-07', 'bd', 'polednia');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, true);
  assert.equal(result.meta.confirmationType, 'special');
});

test('Hellmann bleibt bei zwei BD im Soll und benötigt für den dritten eine besondere Bestätigung', () => {
  const state = stateWith([[2026, 10]]);
  const data = month(state, 2026, 10);
  setAssignment(data, '2026-10-01', 'bd', 'hellmann');
  setAssignment(data, '2026-10-10', 'bd', 'hellmann');
  const result = evalAt(state, '2026-10-20', 'bd', 'hellmann');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, true);
  assert.equal(result.meta.confirmationType, 'special');
  assert.ok(has(result, 'Monatsmaximum von 2 BD'));
});

test('widersprüchliche Kopplung bleibt normale rote Planabweichung', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-03', 'bd', 'sebastian');
  setAssignment(data, '2026-07-04', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-03', 'hg', 'martin');
  assert.equal(result.level, 'red');
  assert.equal(result.canSelect, true);
  assert.equal(result.meta.confirmationType, 'standard');
  assert.equal(result.reasons.includes('Besondere Bestätigung erforderlich'), false);
});

test('Konflikte stehen vor positiven Empfehlungen', () => {
  const state = stateWith();
  setPreference(month(state, 2026, 7), 'sebastian', '2026-07-08', 'dienst-bevorzugt');
  const result = evalAt(state, '2026-07-08', 'hg', 'sebastian');
  assert.equal(result.reasons[0], 'HG nur für Fachärzte zulässig');
  assert.ok(result.reasons.indexOf('Wunsch: Dienst bevorzugt') > 0);
});

test('relative BD-Fairness berücksichtigt keine Kandidaten mit rotem Konflikt', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);

  for (const iso of ['2026-07-01', '2026-07-02', '2026-07-03']) {
    setAssignment(data, iso, 'bd', 'polednia');
  }
  setAbsence(data, 'polednia', '2026-07-08', 'urlaub');
  setAssignment(data, '2026-07-07', 'bd', 'lurz');
  for (const id of ['dalitz', 'martin', 'elhouba', 'licenji', 'sebastian']) {
    setAbsence(data, id, '2026-07-08', 'urlaub');
  }

  const result = evalAt(state, '2026-07-08', 'bd', 'becker');
  assert.equal(result.level, 'green');
  assert.ok(has(result, 'Monatsausgleich: noch 3 BD bis zum Soll'));
  assert.equal(has(result, 'größeren BD-Rückstand'), false);
});

test('Donnerstags-BD wird nur vor einem Urlaubsblock empfohlen, der spätestens Montag beginnt', () => {
  const state = stateWith([[2026, 7], [2026, 8]]);
  const august = month(state, 2026, 8);
  setAbsence(august, 'martin', '2026-08-03', 'urlaub');
  setAbsence(august, 'martin', '2026-08-04', 'urlaub');
  assert.ok(has(evalAt(state, '2026-07-30', 'bd', 'martin'), 'Urlaubsverlängerer'));

  const late = stateWith([[2026, 7], [2026, 8]]);
  setAbsence(month(late, 2026, 8), 'martin', '2026-08-07', 'urlaub');
  assert.equal(has(evalAt(late, '2026-07-30', 'bd', 'martin'), 'Urlaubsverlängerer'), false);
});

test('Freitags-BD vor Urlaubsblock ab spätestens Montag bleibt orange', () => {
  const state = stateWith([[2026, 7], [2026, 8]]);
  const august = month(state, 2026, 8);
  setAbsence(august, 'martin', '2026-08-03', 'urlaub');
  setAbsence(august, 'martin', '2026-08-04', 'urlaub');
  const result = evalAt(state, '2026-07-31', 'bd', 'martin');
  assert.equal(result.level, 'orange');
  assert.ok(has(result, 'Freitags-BD vor zusammenhängendem Urlaubsblock'));
});

test('noch offene Kopplung erscheint als neutraler struktureller Hinweis', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 7), '2026-07-03', 'bd', 'sebastian');
  const result = evalAt(state, '2026-07-03', 'hg', 'lurz');
  assert.ok(has(result, 'Kopplung offen'));
  const detail = result.reasonDetails.find(reason => reason.text.includes('Kopplung offen'));
  assert.equal(detail.kind, 'note');
  assert.equal(detail.level, 'green');
});

test('bestätigte rote Ausnahme bleibt separat im Monatsbericht sichtbar', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-07', 'bd', 'polednia');
  const evaluation = evalAt(state, '2026-07-07', 'bd', 'polednia');
  data.overrideLog.push({
    timestamp: '2026-08-02T14:00:00.000Z',
    dateIso: '2026-07-07',
    role: 'bd',
    staffId: 'polednia',
    reasons: evaluation.reasons,
    comment: 'Organisatorisch abgestimmt'
  });

  const issue = collectIssues(state, data).find(entry => entry.title.includes('bestätigte rote Ausnahme'));
  assert.ok(issue);
  assert.equal(issue.level, 'red');
  assert.equal(issue.confirmed, true);
  assert.match(issue.details, /Besondere Bestätigung dokumentiert/);
});

test('gekoppeltes Standardwochenende bleibt bei 1,0 ohne Mehrfachlast-Warnung', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-03', 'bd', 'sebastian');
  setAssignment(data, '2026-07-03', 'hg', 'lurz');
  setAssignment(data, '2026-07-04', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-05', 'hg', 'lurz');
  assert.equal(has(result, 'nicht gekoppelte Mehrfachbelastung'), false);
  assert.equal(has(result, 'Wochenendziel 1,0 würde'), false);
});

test('zusätzliche nicht gekoppelte Mehrfachbelastung am selben Wochenende wird markiert', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 7), '2026-07-03', 'hg', 'lurz');
  const result = evalAt(state, '2026-07-05', 'hg', 'lurz');
  assert.ok(has(result, 'Zusätzliche nicht gekoppelte Mehrfachbelastung'));
});
