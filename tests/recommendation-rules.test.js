import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { createEmptyMonth, DEFAULT_STAFF } from '../js/defaults.js';
import { collectIssues, evaluateCandidate, getAbsence, setAbsence, setAssignment, setPreference } from '../js/rules.js';

process.env.TZ = 'Europe/Berlin';
const key = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
function stateWith(months = [[2026, 7]]) {
  const map = new Map(months.map(([year, month]) => [key(year, month), createEmptyMonth(year, month)]));
  return { months: map, staff: structuredClone(DEFAULT_STAFF), currentYear: months.at(-1)[0], currentMonth: months.at(-1)[1] };
}
const month = (state, year, number) => state.months.get(key(year, number));
const evalAt = (state, iso, role, staffId) => evaluateCandidate({ state, monthData: month(state, +iso.slice(0, 4), +iso.slice(5, 7)), dateIso: iso, role, staffId });
const has = (result, fragment) => result.reasons.some(reason => reason.includes(fragment));

function fillBdTargets(state, year = 2026, monthNo = 7) {
  const data = month(state, year, monthNo);
  const active = state.staff.filter(person => person.includeInPlanning && person.id !== 'hellmann');
  const dates = Object.keys(data.days);
  let index = 0;
  for (const person of active) {
    for (let count = 0; count < person.bdTarget; count += 1) setAssignment(data, dates[index++], 'bd', person.id);
  }
}

test('BD-Monatsausgleich bleibt inaktiv, solange niemand sein Soll erreicht hat', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-01', 'bd', 'polednia');
  setAssignment(data, '2026-07-02', 'bd', 'polednia');
  const lurz = evalAt(state, '2026-07-08', 'bd', 'lurz');
  const polednia = evalAt(state, '2026-07-08', 'bd', 'polednia');
  assert.equal(lurz.level, 'green');
  assert.equal(polednia.level, 'green');
  assert.equal(has(lurz, 'Monatsausgleich'), false);
  assert.equal(has(polednia, 'Monatsausgleich'), false);
  assert.equal(has(polednia, 'größeren BD-Rückstand'), false);
});

test('BD-Monatsausgleich startet nach der ersten vollständigen Soll-Erfüllung', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  for (const iso of ['2026-07-01', '2026-07-02', '2026-07-03']) setAssignment(data, iso, 'bd', 'polednia');
  setAbsence(data, 'polednia', '2026-07-08', 'urlaub');
  const lurz = evalAt(state, '2026-07-08', 'bd', 'lurz');
  const becker = evalAt(state, '2026-07-08', 'bd', 'becker');
  assert.equal(lurz.level, 'green');
  assert.ok(has(lurz, 'Monatsausgleich: noch 4 BD bis zum Soll'));
  assert.equal(becker.level, 'yellow');
  assert.ok(has(becker, 'größeren BD-Rückstand (4 statt 3)'));
});

test('positiver BD-Wunsch erhält die stärkste Empfehlungsgewichtung', () => {
  const state = stateWith();
  setPreference(month(state, 2026, 7), 'martin', '2026-07-08', 'bd-bevorzugt');
  const result = evalAt(state, '2026-07-08', 'bd', 'martin');
  assert.ok(result.meta.recommendationScore >= 100);
  assert.ok(result.reasons.includes('Wunsch: BD bevorzugt'));
});

test('erster BD-Überhang wird ausschließlich Dr. Lurz bevorzugt', () => {
  const state = stateWith();
  fillBdTargets(state);
  const lurz = evalAt(state, '2026-07-31', 'bd', 'lurz');
  const martin = evalAt(state, '2026-07-31', 'bd', 'martin');
  assert.ok(has(lurz, 'Erster BD-Überhang'));
  assert.ok(has(martin, 'nachrangig gegenüber Dr. Lurz'));
});

test('BD-Wunsch einer anderen Person setzt die Lurz-Überhangpräferenz außer Kraft', () => {
  const state = stateWith();
  fillBdTargets(state);
  setPreference(month(state, 2026, 7), 'martin', '2026-07-31', 'bd-bevorzugt');
  const lurz = evalAt(state, '2026-07-31', 'bd', 'lurz');
  const martin = evalAt(state, '2026-07-31', 'bd', 'martin');
  assert.equal(has(lurz, 'Erster BD-Überhang'), false);
  assert.equal(has(martin, 'nachrangig gegenüber Dr. Lurz'), false);
  assert.ok(martin.reasons.includes('Wunsch: BD bevorzugt'));
});

test('HG-Ausgleich bleibt während der ersten Verteilungsrunde neutral informativ', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-01', 'bd', 'lurz');
  setAssignment(data, '2026-07-02', 'bd', 'lurz');
  const martin = evalAt(state, '2026-07-08', 'hg', 'martin');
  const lurz = evalAt(state, '2026-07-08', 'hg', 'lurz');
  assert.equal(martin.level, 'green');
  assert.ok(has(martin, 'geringste kombinierte Monatslast'));
  assert.equal(lurz.level, 'green');
  assert.ok(has(lurz, 'erste Verteilungsrunde noch offen'));
  assert.ok(has(lurz, 'geringere kombinierte Monatslast'));
});

test('HG-Ausgleich wird nach einer vollständigen Verteilungsrunde gelb wirksam', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  const firstRound = [
    ['lurz', '2026-07-01'],
    ['polednia', '2026-07-02'],
    ['dalitz', '2026-07-03'],
    ['becker', '2026-07-06'],
    ['martin', '2026-07-07']
  ];
  for (const [staffId, iso] of firstRound) setAssignment(data, iso, 'bd', staffId);
  setAssignment(data, '2026-07-15', 'bd', 'lurz');
  const lurz = evalAt(state, '2026-07-08', 'hg', 'lurz');
  assert.equal(lurz.level, 'yellow');
  assert.ok(has(lurz, 'geringere kombinierte Monatslast'));
  assert.equal(has(lurz, 'erste Verteilungsrunde noch offen'), false);
});

test('HG für AA wird nach bisheriger AA-HG-Belastung ausgeglichen', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-01', 'bd', 'sebastian');
  setAssignment(data, '2026-07-01', 'hg', 'lurz');
  setAssignment(data, '2026-07-08', 'bd', 'licenji');
  const lurz = evalAt(state, '2026-07-08', 'hg', 'lurz');
  const martin = evalAt(state, '2026-07-08', 'hg', 'martin');
  assert.ok(has(lurz, 'andere Fachärzte haben weniger HG für AA'));
  assert.ok(has(martin, 'geringste Zahl belastender HG für AA'));
});

test('Wochenendziel und relative Wochenendlast werden erklärt', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-03', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-24', 'hg', 'lurz');
  assert.equal(result.level, 'yellow');
  assert.ok(has(result, 'Wochenendziel 1,0'));
  assert.ok(has(result, 'andere geeignete Personen liegen niedriger'));
});

test('zweiter Samstags-BD im Monat bleibt orange nachrangig', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 7), '2026-07-04', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-18', 'bd', 'lurz');
  assert.equal(result.level, 'orange');
  assert.ok(has(result, 'Weiterer Samstags-BD'));
});

test('AA-Freitags-Kopplung prüft den Freitag-HG gegen den Samstags-BD', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-03', 'bd', 'sebastian');
  setAssignment(data, '2026-07-04', 'bd', 'lurz');
  const passend = evalAt(state, '2026-07-03', 'hg', 'lurz');
  const falsch = evalAt(state, '2026-07-03', 'hg', 'martin');
  assert.ok(has(passend, 'Freitag-HG passend'));
  assert.equal(falsch.level, 'red');
  assert.ok(has(falsch, 'muss der Samstags-BD'));
});

test('AA-Freitags-Kopplung ist bei umgekehrter Eingabereihenfolge identisch', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-03', 'bd', 'sebastian');
  setAssignment(data, '2026-07-03', 'hg', 'lurz');
  assert.ok(has(evalAt(state, '2026-07-04', 'bd', 'lurz'), 'Samstags-BD passend'));
  assert.equal(evalAt(state, '2026-07-04', 'bd', 'martin').level, 'red');
});

test('Samstags-BD koppelt denselben Sonntag-HG in beiden Richtungen', () => {
  const first = stateWith();
  setAssignment(month(first, 2026, 7), '2026-07-04', 'bd', 'lurz');
  assert.ok(has(evalAt(first, '2026-07-05', 'hg', 'lurz'), 'Sonntag-HG passend'));
  assert.equal(evalAt(first, '2026-07-05', 'hg', 'martin').level, 'red');

  const reverse = stateWith();
  setAssignment(month(reverse, 2026, 7), '2026-07-05', 'hg', 'lurz');
  assert.ok(has(evalAt(reverse, '2026-07-04', 'bd', 'lurz'), 'Samstags-BD passend'));
  assert.equal(evalAt(reverse, '2026-07-04', 'bd', 'martin').level, 'red');
});

test('Feiertagsvortags-Kopplung prüft beide Eingabereihenfolgen', () => {
  const first = stateWith([[2026, 5]]);
  const data = month(first, 2026, 5);
  setAssignment(data, '2026-05-13', 'bd', 'sebastian');
  setAssignment(data, '2026-05-14', 'bd', 'lurz');
  assert.ok(has(evalAt(first, '2026-05-13', 'hg', 'lurz'), 'Vortags-HG passend'));
  assert.equal(evalAt(first, '2026-05-13', 'hg', 'martin').level, 'red');

  const reverse = stateWith([[2026, 5]]);
  const reverseData = month(reverse, 2026, 5);
  setAssignment(reverseData, '2026-05-13', 'bd', 'sebastian');
  setAssignment(reverseData, '2026-05-13', 'hg', 'lurz');
  assert.ok(has(evalAt(reverse, '2026-05-14', 'bd', 'lurz'), 'Feiertags-BD passend'));
  assert.equal(evalAt(reverse, '2026-05-14', 'bd', 'martin').level, 'red');
});

test('Kopplungsbewertung trägt keinen Gegenposten automatisch ein', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-04', 'bd', 'lurz');
  const before = structuredClone(data);
  evalAt(state, '2026-07-05', 'hg', 'lurz');
  assert.deepEqual(data, before);
  assert.equal(data.days['2026-07-05'].hg, '');
});

test('Donnerstags-BD wird bei Urlaub in der Folgewoche positiv empfohlen', () => {
  const state = stateWith([[2026, 7], [2026, 8]]);
  setAbsence(month(state, 2026, 8), 'martin', '2026-08-03', 'urlaub');
  const result = evalAt(state, '2026-07-30', 'bd', 'martin');
  assert.ok(has(result, 'Urlaubsverlängerer'));
  assert.ok(result.meta.recommendationScore >= 45);
});

test('BD unmittelbar vor Urlaub wird auch monatsübergreifend erkannt', () => {
  const state = stateWith([[2026, 7], [2026, 8]]);
  setAbsence(month(state, 2026, 8), 'martin', '2026-08-01', 'urlaub');
  const result = evalAt(state, '2026-07-31', 'bd', 'martin');
  assert.equal(result.level, 'orange');
  assert.ok(result.reasons.includes('BD unmittelbar vor Urlaubsbeginn'));
});

test('laufender Urlaub zeigt keine zusätzliche Warnung vor Urlaubsbeginn', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAbsence(data, 'martin', '2026-07-08', 'urlaub');
  setAbsence(data, 'martin', '2026-07-09', 'urlaub');
  const result = evalAt(state, '2026-07-08', 'bd', 'martin');
  assert.equal(result.level, 'red');
  assert.ok(result.reasons.includes('Urlaub eingetragen'));
  assert.equal(result.reasons.includes('BD unmittelbar vor Urlaubsbeginn'), false);
});

test('Jahresverlauf erscheint nur vollständig geladen und bleibt reine Information', () => {
  const incomplete = stateWith([[2026, 1], [2026, 7]]);
  setAssignment(month(incomplete, 2026, 1), '2026-01-05', 'bd', 'lurz');
  assert.equal(has(evalAt(incomplete, '2026-07-08', 'bd', 'lurz'), 'Jahresverlauf'), false);

  const allMonths = Array.from({ length: 7 }, (_, index) => [2026, index + 1]);
  const complete = stateWith(allMonths);
  setAssignment(month(complete, 2026, 1), '2026-01-05', 'bd', 'lurz');
  setAssignment(month(complete, 2026, 2), '2026-02-05', 'hg', 'lurz');
  const higherHistory = evalAt(complete, '2026-07-08', 'bd', 'lurz');
  const lowerHistory = evalAt(complete, '2026-07-08', 'bd', 'martin');

  assert.equal(higherHistory.level, lowerHistory.level);
  assert.equal(higherHistory.level, 'green');
  assert.equal(higherHistory.meta.recommendationScore, lowerHistory.meta.recommendationScore);
  assert.equal(higherHistory.meta.recommendationScore, 0);
  assert.ok(has(higherHistory, 'Jahresverlauf: höhere bisherige Dienstlast'));
  assert.ok(has(lowerHistory, 'Jahresverlauf: niedrigste bisherige Dienstlast'));
  assert.equal(higherHistory.reasons.some(reason => reason.includes('nur Hinweis, ohne Einfluss auf Bewertung')), false);
  assert.equal(lowerHistory.reasons.some(reason => reason.includes('nur Hinweis, ohne Einfluss auf Bewertung')), false);
});

test('Becker/Martin-Regel gilt nur für Urlaub oder FZA', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAbsence(data, 'becker', '2026-07-08', 'weiterbildung');
  setAbsence(data, 'martin', '2026-07-08', 'urlaub');
  assert.equal(collectIssues(state, data).some(issue => issue.title.includes('Becker/Martin')), false);
  setAbsence(data, 'becker', '2026-07-08', 'fza');
  assert.equal(collectIssues(state, data).filter(issue => issue.title.includes('Becker/Martin')).length, 1);
});

test('Dalitz/Sebastian-Sondereinschränkung bleibt orange', () => {
  const state = stateWith();
  setAssignment(month(state, 2026, 7), '2026-07-06', 'bd', 'sebastian');
  const result = evalAt(state, '2026-07-06', 'hg', 'dalitz');
  assert.equal(result.level, 'orange');
});

test('gewöhnlicher BD erzeugt keinerlei FZA-Seiteneffekt', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-06', 'bd', 'lurz');
  const before = structuredClone(data);
  evalAt(state, '2026-07-06', 'bd', 'lurz');
  assert.deepEqual(data, before);
  assert.equal(getAbsence(data, 'lurz', '2026-07-07'), '');
});

test('HG vor eigenem BD bleibt bei FA-BD am HG-Tag zulässig', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-08', 'bd', 'dalitz');
  setAssignment(data, '2026-07-09', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-08', 'hg', 'lurz');
  assert.equal(has(result, 'HG am Tag vor eigenem BD'), false);
});

test('HG vor eigenem BD bleibt bei AA-BD am HG-Tag orange', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-08', 'bd', 'sebastian');
  setAssignment(data, '2026-07-09', 'bd', 'lurz');
  const result = evalAt(state, '2026-07-08', 'hg', 'lurz');
  assert.equal(result.level, 'orange');
  assert.ok(result.reasons.includes('HG am Tag vor eigenem BD'));
});

test('Wochenendbewertung ist vor und nach Eintragung selbstkonsistent', () => {
  const free = stateWith();
  const proposed = evalAt(free, '2026-07-04', 'bd', 'lurz');
  const occupied = stateWith();
  setAssignment(month(occupied, 2026, 7), '2026-07-04', 'bd', 'lurz');
  const existing = evalAt(occupied, '2026-07-04', 'bd', 'lurz');
  assert.equal(existing.level, proposed.level);
  assert.deepEqual(existing.reasons, proposed.reasons);
});

test('kanonische Regeln beschreiben ausschließlich manuelle Empfehlungen', () => {
  const text = fs.readFileSync(new URL('../Eignungsregeln.txt', import.meta.url), 'utf8');
  assert.match(text, /keinen automatischen Dienstplaner/i);
  assert.match(text, /keine automatische Eintragung/i);
  assert.doesNotMatch(text, /Neural Scheduler|Optimierungszyklen|Cross-Role-Tauschvorgänge/i);
});


test('Jahresverlauf ist im Regelquelltext nicht bewertungswirksam verdrahtet', () => {
  const rules = readFileSync(new URL('../js/rules-evaluation.js', import.meta.url), 'utf8');
  assert.equal(rules.includes("recommend('Jahresverlauf"), false);
  assert.equal(rules.includes("push('yellow', `Jahresverlauf"), false);
  assert.match(rules, /note\(`Jahresverlauf:/);
  assert.equal(rules.includes('nur Hinweis, ohne Einfluss auf Bewertung'), false);
});
