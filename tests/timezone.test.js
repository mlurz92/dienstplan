/**
 * Diese Tests laufen bewusst unter deutscher Zeitzone.
 *
 * Die Regelprüfung rechnet Nachbartage über Date-Objekte aus und braucht daraus
 * wieder ein ISO-Datum. Wird dafür `toISOString()` benutzt, rutscht das Ergebnis
 * in jeder Zeitzone mit positivem UTC-Versatz um einen Tag nach hinten: Lokale
 * Mitternacht des 04.07. ist in Berlin 02:00 UTC des ... 03.07. Genau darauf
 * fußen sämtliche Abstands-, Wochenend- und Feiertagsblockregeln.
 *
 * In UTC – der Standardzeitzone der Testumgebung – fällt das nicht auf. Deshalb
 * erzwingen diese Tests Europe/Berlin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { createEmptyMonth, DEFAULT_STAFF } = await import('../js/defaults.js');
const { collectIssues, evaluateCandidate, setAbsence, setAssignment } = await import('../js/rules.js');

function planungszustand(monate = [[2026, 7]]) {
  const months = new Map();
  for (const [year, month] of monate) months.set(`${year}-${String(month).padStart(2, '0')}`, createEmptyMonth(year, month));
  return {
    months,
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: monate[0][0],
    currentMonth: monate[0][1]
  };
}
const monat = (state, year, month) => state.months.get(`${year}-${String(month).padStart(2, '0')}`);

test('Zeitzone der Testumgebung ist Europe/Berlin', () => {
  assert.equal(new Date().getTimezoneOffset() <= 0, true, 'Berlin hat einen positiven UTC-Versatz');
});

test('BD am Vortag wird als solcher erkannt', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAssignment(juli, '2026-07-06', 'bd', 'lurz');           // Montag
  const bewertung = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-07', role: 'bd', staffId: 'lurz' });
  assert.ok(bewertung.reasons.includes('BD bereits am Vortag'), `Gründe: ${bewertung.reasons.join(' | ')}`);
});

test('HG an drei aufeinanderfolgenden Tagen wird erkannt', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAssignment(juli, '2026-07-06', 'hg', 'dalitz');
  setAssignment(juli, '2026-07-07', 'hg', 'dalitz');
  const bewertung = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-08', role: 'hg', staffId: 'dalitz' });
  assert.equal(bewertung.level, 'orange');
  assert.ok(bewertung.reasons.includes('Dritter HG an drei aufeinanderfolgenden Tagen'), `Gründe: ${bewertung.reasons.join(' | ')}`);
});

test('HG am Tag vor eigenem BD wird erkannt (und Fr-HG/Sa-BD bleibt zulässig)', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAssignment(juli, '2026-07-08', 'bd', 'martin');          // Mittwoch
  const mittwochsVorabend = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-07', role: 'hg', staffId: 'martin' });
  assert.ok(mittwochsVorabend.reasons.includes('HG am Tag vor eigenem BD'), `Gründe: ${mittwochsVorabend.reasons.join(' | ')}`);

  setAssignment(juli, '2026-07-11', 'bd', 'lurz');            // Samstag
  const freitagHg = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-10', role: 'hg', staffId: 'lurz' });
  assert.ok(!freitagHg.reasons.includes('HG am Tag vor eigenem BD'), 'Freitag-HG vor Samstags-BD ist gewolltes Muster');
});

test('BD unmittelbar vor Urlaubsbeginn wird erkannt', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAbsence(juli, 'martin', '2026-07-09', 'urlaub');
  const bewertung = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-08', role: 'bd', staffId: 'martin' });
  assert.ok(bewertung.reasons.includes('BD unmittelbar vor Urlaubsbeginn'), `Gründe: ${bewertung.reasons.join(' | ')}`);
});

test('BD an aufeinanderfolgenden Wochenenden wird als roter Konflikt erkannt', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAssignment(juli, '2026-07-04', 'bd', 'lurz');            // Samstag
  const folgendesWochenende = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-11', role: 'bd', staffId: 'lurz' });
  assert.equal(folgendesWochenende.level, 'red');
  assert.ok(folgendesWochenende.reasons.includes('BD-Wochenende direkt nach BD-Wochenende'), `Gründe: ${folgendesWochenende.reasons.join(' | ')}`);
});

test('Oster- und Pfingstblock alternieren', () => {
  const state = planungszustand([[2026, 4], [2026, 5]]);
  const april = monat(state, 2026, 4);
  setAssignment(april, '2026-04-03', 'bd', 'lurz');            // Karfreitag 2026
  const mai = monat(state, 2026, 5);
  const pfingsten = evaluateCandidate({ state, monthData: mai, dateIso: '2026-05-25', role: 'bd', staffId: 'lurz' });
  assert.ok(pfingsten.reasons.includes('Bereits Dienst im alternierenden Oster-/Pfingstblock'), `Gründe: ${pfingsten.reasons.join(' | ')}`);
});

test('BD-FZA-BD werktags wird als solches erkannt, nicht als kurzer Abstand', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAssignment(juli, '2026-07-06', 'bd', 'martin');          // Montag
  setAbsence(juli, 'martin', '2026-07-07', 'fza');            // Dienstag
  const mittwoch = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-08', role: 'bd', staffId: 'martin' });
  assert.ok(mittwoch.reasons.includes('BD–FZA–BD werktags'), `Gründe: ${mittwoch.reasons.join(' | ')}`);
});

test('Monatsübergreifend: BD am Vortag im Vormonat wird erkannt', () => {
  const state = planungszustand([[2026, 8], [2026, 7]]);
  setAssignment(monat(state, 2026, 7), '2026-07-31', 'bd', 'lurz');
  const august = monat(state, 2026, 8);
  const bewertung = evaluateCandidate({ state, monthData: august, dateIso: '2026-08-01', role: 'bd', staffId: 'lurz' });
  assert.ok(bewertung.reasons.includes('BD bereits am Vortag'), `Gründe: ${bewertung.reasons.join(' | ')}`);
});

/* ------------------------------------------------------------------------
   Regressionen aus dem Bughunt
   ------------------------------------------------------------------------ */

test('eine zum Termin nicht aktive Person wird ausgeschlossen, nicht als geeignet ausgewiesen', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  // Fr. Hellmann ist erst ab 01.10.2026 im Dienst.
  const bewertung = evaluateCandidate({ state, monthData: juli, dateIso: '2026-07-06', role: 'bd', staffId: 'hellmann' });
  assert.equal(bewertung.level, 'gray');
  assert.equal(bewertung.canSelect, false);
  assert.ok(bewertung.reasons.some(reason => reason.includes('nicht aktiv') || reason.includes('nicht mehr aktiv')));

  const imOktober = evaluateCandidate({ state, monthData: createEmptyMonth(2026, 10), dateIso: '2026-10-05', role: 'bd', staffId: 'hellmann' });
  assert.notEqual(imOktober.level, 'gray');
});

test('BD-Abstand wird symmetrisch bewertet, unabhängig von der Eingabereihenfolge', () => {
  const rueckwaerts = planungszustand();
  setAssignment(monat(rueckwaerts, 2026, 7), '2026-07-06', 'bd', 'lurz');
  const nachher = evaluateCandidate({ state: rueckwaerts, monthData: monat(rueckwaerts, 2026, 7), dateIso: '2026-07-07', role: 'bd', staffId: 'lurz' });

  const vorwaerts = planungszustand();
  setAssignment(monat(vorwaerts, 2026, 7), '2026-07-08', 'bd', 'lurz');
  const davor = evaluateCandidate({ state: vorwaerts, monthData: monat(vorwaerts, 2026, 7), dateIso: '2026-07-07', role: 'bd', staffId: 'lurz' });

  assert.equal(nachher.level, 'yellow');
  assert.equal(davor.level, 'yellow', 'BD am Tag vor einem eigenen BD muss ebenso auffallen');
  assert.ok(davor.reasons.includes('BD bereits am Folgetag'), `Gründe: ${davor.reasons.join(' | ')}`);
});

test('Becker-Sperre gilt dem ersten regulären Werktag, nicht Wochenende oder Feiertag', () => {
  const state = planungszustand([[2026, 5]]);
  const mai = monat(state, 2026, 5);
  setAssignment(mai, '2026-05-23', 'bd', 'becker');            // Samstag vor Pfingsten
  const gesperrt = dateIso => evaluateCandidate({ state, monthData: mai, dateIso, role: 'bd', staffId: 'becker' })
    .reasons.some(reason => reason.includes('gesperrt'));

  assert.equal(gesperrt('2026-05-24'), false, 'Pfingstsonntag ist kein Werktag');
  assert.equal(gesperrt('2026-05-25'), false, 'Pfingstmontag ist ein Feiertag');
  assert.equal(gesperrt('2026-05-26'), true, 'Dienstag ist der erste reguläre Werktag');
  assert.equal(gesperrt('2026-05-27'), false, 'der Tag danach ist wieder frei');
});

test('gleichzeitige Abwesenheit von Becker und Martin wird genau einmal gemeldet', () => {
  const state = planungszustand();
  const juli = monat(state, 2026, 7);
  setAbsence(juli, 'becker', '2026-07-06', 'urlaub');
  setAbsence(juli, 'martin', '2026-07-06', 'urlaub');
  const treffer = collectIssues(state, juli).filter(issue => issue.title.includes('Becker/Martin'));
  assert.equal(treffer.length, 1);

  // Am Feiertag ist die Regelbesetzung ohnehin nicht gefragt.
  setAbsence(juli, 'becker', '2026-05-01', 'urlaub');
  setAbsence(juli, 'martin', '2026-05-01', 'urlaub');
  assert.equal(collectIssues(state, juli).filter(issue => issue.title.includes('Becker/Martin')).length, 1);
});
