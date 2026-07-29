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

test('month navigation starts color feedback immediately but animates the new content only after rendering', () => {
  const body = functionBody('openCurrentMonth');
  const theme = body.indexOf('applyMonthTheme(month)');
  const load = body.indexOf('await loadMonth(');
  const render = body.indexOf('render()');
  const content = body.indexOf('animateMonthContent(direction)', render);

  assert.ok(theme >= 0 && load > theme, 'die Monatsfarbe muss vor dem Laden reagieren');
  assert.ok(render > load, 'erst geladene Monatsdaten dürfen gerendert werden');
  assert.ok(content > render, 'die Einblendung muss den neu gerenderten Monat animieren');
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
