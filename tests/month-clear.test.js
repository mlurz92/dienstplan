import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmptyMonth } from '../js/defaults.js';
import { clearedMonthData, monthContentSummary, setAbsence, setAssignment, setOptions, setPreference } from '../js/rules.js';

process.env.TZ = 'Europe/Berlin';

function filledMonth() {
  const month = createEmptyMonth(2026, 3);
  setAssignment(month, '2026-03-01', 'bd', 'lurz');
  setAssignment(month, '2026-03-02', 'hg', 'becker');
  month.days['2026-03-01'].rbn1 = 'Dr. Bailis';
  setAbsence(month, 'martin', '2026-03-05', 'urlaub', 'manual');
  setPreference(month, 'dalitz', '2026-03-07', 'kein-dienst');
  setOptions(month, 'dalitz', '2026-03-08', ['bd-moeglich']);
  month.revision = 7;
  month.updatedAt = '2026-03-09T10:00:00.000Z';
  month.overrideLog = [{ dateIso: '2026-03-01', role: 'bd', staffId: 'lurz' }];
  month.importLog = [{ quelle: 'Excel' }];
  return month;
}

test('Der Umfang eines Monats wird vor dem Leeren korrekt beziffert', () => {
  assert.deepEqual(monthContentSummary(filledMonth()), { filledDays: 2, markedStaff: 2, empty: false });
  assert.deepEqual(monthContentSummary(createEmptyMonth(2026, 3)), { filledDays: 0, markedStaff: 0, empty: true });
  assert.equal(monthContentSummary(undefined).empty, true);
});

test('Leeren entfernt alle Eintragungen und behält die Nachweise', () => {
  const month = filledMonth();
  const cleared = clearedMonthData(month, 2026, 3);

  assert.equal(monthContentSummary(cleared).empty, true);
  assert.equal(Object.keys(cleared.days).length, 31);
  assert.deepEqual(cleared.days['2026-03-01'], { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' });
  assert.deepEqual(cleared.absences, {});
  assert.deepEqual(cleared.absenceSources, {});
  assert.deepEqual(cleared.preferences, {});
  assert.deepEqual(cleared.options, {});
  // Revision, Zeitstempel und Protokolle überleben – sonst bräche die
  // Serversynchronität und der Nachweis der Freigaben ginge verloren.
  assert.equal(cleared.revision, 7);
  assert.equal(cleared.updatedAt, '2026-03-09T10:00:00.000Z');
  assert.deepEqual(cleared.overrideLog, month.overrideLog);
  assert.deepEqual(cleared.importLog, month.importLog);
  // Die Quelle bleibt unangetastet: Es wird eine neue Struktur erzeugt.
  assert.equal(month.days['2026-03-01'].bd, 'lurz');
});

test('Der Leeren-Knopf ist verdrahtet, bestätigt und speichert', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<button id="clearMonthBtn"/);
  assert.match(app, /\$\('#clearMonthBtn'\)\.addEventListener\('click', onClearMonth\)/);
  const handler = app.slice(app.indexOf('async function onClearMonth()'), app.indexOf('function render()'));
  assert.match(handler, /if \(!confirm\(/);
  assert.match(handler, /markMonthDirty\(state\.currentYear, state\.currentMonth\)/);
  assert.match(handler, /await persistMonth\(state\.currentYear, state\.currentMonth\)/);
});
