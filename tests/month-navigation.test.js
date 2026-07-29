import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function functionBody(name) {
  const start = source.indexOf(`async function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0, `${name} fehlt`);
  return source.slice(start, next < 0 ? source.length : next);
}

/**
 * Grundfarbe und Monat wechseln gemeinsam – vor dem Serverabruf.
 *
 * Zuvor galt die umgekehrte Reihenfolge: Farbe sofort, Rendern erst nach dem
 * Laden. Gegen eine antwortende API gemessen lagen dazwischen rund 800 ms, in
 * denen die Farbe bereits vollständig durchgelaufen war, während in der
 * Überschrift noch der alte Monat stand. Ohne Backend – wie in allen früheren
 * Testläufen – scheiterte der Abruf sofort und der Versatz fiel nicht auf.
 *
 * Das Kalendergerüst steht ohne Serverdaten fest, deshalb darf und muss sofort
 * gerendert werden. Der Serverstand zieht in einem zweiten Durchlauf nach.
 */
test('colour, heading and table switch together before the server round-trip', () => {
  const body = functionBody('openCurrentMonth');
  const theme = body.indexOf('applyMonthTheme(month)');
  const ersterRender = body.indexOf('render();');
  const inhalt = body.indexOf('animateMonthContent(direction)');
  const laden = body.indexOf('await loadMonth(');
  const zweiterRender = body.indexOf('render();', laden);

  assert.ok(theme >= 0, 'die Monatsfarbe muss gesetzt werden');
  assert.ok(ersterRender > theme, 'der Monat wird unmittelbar nach der Farbe gerendert');
  assert.ok(inhalt > ersterRender, 'die Einblendung folgt dem gerenderten Monat');
  assert.ok(laden > inhalt, 'der Serverabruf darf den sichtbaren Wechsel nicht aufhalten');
  assert.ok(zweiterRender > laden, 'der Serverstand zieht in einem zweiten Durchlauf nach');
});

test('arrow buttons and both dropdowns use the same month transition pipeline', () => {
  assert.match(source, /prevMonthBtn'\)\.addEventListener\('click', \(\) => shiftMonth\(-1\)\)/);
  assert.match(source, /nextMonthBtn'\)\.addEventListener\('click', \(\) => shiftMonth\(1\)\)/);
  assert.match(source, /monthSelect'\)\.addEventListener\('change', \(\) => openCurrentMonth\(/);
  assert.match(source, /yearSelect'\)\.addEventListener\('change', \(\) => openCurrentMonth\(/);
});

test('rapid reversals compare against the last requested month instead of stale loaded state', () => {
  const body = functionBody('openCurrentMonth');

  assert.match(source, /let requestedYear = null;\s*let requestedMonth = null;/);
  assert.match(body, /requestedYear \?\? state\.currentYear/);
  assert.match(body, /requestedMonth \?\? state\.currentMonth/);
  assert.match(body, /requestedYear = year;\s*requestedMonth = month;/);
  assert.doesNotMatch(body, /if \(month !== previousMonth \|\| year !== previousYear\)/);
});
