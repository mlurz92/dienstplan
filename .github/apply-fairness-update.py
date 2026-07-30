from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace(path, old, new, count=None):
    source = read(path)
    occurrences = source.count(old)
    expected = 1 if count is None else count
    if occurrences != expected:
        raise RuntimeError(f'{path}: expected {expected} occurrence(s), found {occurrences}: {old[:100]!r}')
    write(path, source.replace(old, new, expected))


# Funktionales Release: ein Token im gesamten Browser-Modulgraphen.
for path in [ROOT / 'index.html', *sorted((ROOT / 'js').glob('*.js')), ROOT / 'tests/historical-loading.test.js']:
    source = path.read_text(encoding='utf-8')
    path.write_text(source.replace('20260730.4', '20260730.5'), encoding='utf-8')

rules_path = 'js/rules-evaluation.js'

replace(
    rules_path,
    "function applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, push, recommend }) {",
    "function applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, push, recommend, note }) {"
)

replace(
    rules_path,
    "  const person = getStaffById(state.staff, staffId);\n  const peers = basicallyEligiblePeers(state, monthData, dateIso, 'bd');\n  const deficits = peers.map(peer => ({",
    "  const person = getStaffById(state.staff, staffId);\n  const peers = basicallyEligiblePeers(state, monthData, dateIso, 'bd');\n  const targetStaff = getPlanningStaff(state.staff, dateIso).filter(peer => (peer.bdTarget || 0) > 0);\n  const monthlyBalanceEnabled = targetStaff.some(peer =>\n    countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) >= (peer.bdTarget || 0)\n  );\n  const deficits = peers.map(peer => ({"
)

replace(
    rules_path,
    "  if (maxDeficit > 0) {",
    "  if (monthlyBalanceEnabled && maxDeficit > 0) {"
)

replace(
    rules_path,
    "function applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend }) {",
    "function applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend, note }) {"
)

old_history = """      if (own === minimum) recommend('Jahresverlauf als Tie-Breaker: geringere bisherige Dienstlast', 2);
      else push('yellow', `Jahresverlauf als Tie-Breaker: höhere bisherige Dienstlast (${own} statt ${minimum})`);"""
new_history = """      if (own === minimum) note(`Jahresverlauf (nur Hinweis, ohne Einfluss auf Bewertung): niedrigste bisherige Dienstlast (${own})`);
      else note(`Jahresverlauf (nur Hinweis, ohne Einfluss auf Bewertung): höhere bisherige Dienstlast (${own} statt ${minimum})`);"""
replace(rules_path, old_history, new_history, count=2)

replace(
    rules_path,
    """  const recommend = (reason, score = 1) => {
    recommendationScore += score;
    addReason(reason);
  };

  if (!person.includeInPlanning)""",
    """  const recommend = (reason, score = 1) => {
    recommendationScore += score;
    addReason(reason);
  };
  const note = addReason;

  if (!person.includeInPlanning)"""
)

replace(
    rules_path,
    "    applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, push, recommend });",
    "    applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, push, recommend, note });"
)

replace(
    rules_path,
    "    applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend });",
    "    applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend, note });"
)

recommendation_path = 'tests/recommendation-rules.test.js'
old_monthly_test = """test('BD-Monatsausgleich bevorzugt den größeren Sollrückstand', () => {
  const state = stateWith();
  const data = month(state, 2026, 7);
  setAssignment(data, '2026-07-01', 'bd', 'polednia');
  setAssignment(data, '2026-07-02', 'bd', 'polednia');
  const lurz = evalAt(state, '2026-07-08', 'bd', 'lurz');
  const polednia = evalAt(state, '2026-07-08', 'bd', 'polednia');
  assert.equal(lurz.level, 'green');
  assert.ok(has(lurz, 'Monatsausgleich'));
  assert.equal(polednia.level, 'yellow');
  assert.ok(has(polednia, 'größeren BD-Rückstand'));
});"""
new_monthly_tests = """test('BD-Monatsausgleich bleibt inaktiv, solange niemand sein Soll erreicht hat', () => {
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
});"""
replace(recommendation_path, old_monthly_test, new_monthly_tests)

old_history_test = """test('Jahreslast wirkt nur bei vollständig geladenen Vormonaten als Tie-Breaker', () => {
  const incomplete = stateWith([[2026, 1], [2026, 7]]);
  setAssignment(month(incomplete, 2026, 1), '2026-01-05', 'bd', 'lurz');
  assert.equal(has(evalAt(incomplete, '2026-07-08', 'bd', 'lurz'), 'Jahresverlauf'), false);

  const allMonths = Array.from({ length: 7 }, (_, index) => [2026, index + 1]);
  const complete = stateWith(allMonths);
  setAssignment(month(complete, 2026, 1), '2026-01-05', 'bd', 'lurz');
  setAssignment(month(complete, 2026, 2), '2026-02-05', 'hg', 'lurz');
  const result = evalAt(complete, '2026-07-08', 'bd', 'lurz');
  assert.ok(has(result, 'Jahresverlauf als Tie-Breaker'));
});"""
new_history_test = """test('Jahresverlauf erscheint nur vollständig geladen und bleibt reine Information', () => {
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
  assert.ok(has(higherHistory, 'nur Hinweis, ohne Einfluss auf Bewertung'));
  assert.ok(has(higherHistory, 'höhere bisherige Dienstlast'));
  assert.ok(has(lowerHistory, 'nur Hinweis, ohne Einfluss auf Bewertung'));
  assert.ok(has(lowerHistory, 'niedrigste bisherige Dienstlast'));
});"""
replace(recommendation_path, old_history_test, new_history_test)

matrix_path = 'tests/rule-matrix.test.js'
replace(
    matrix_path,
    """  {
    name: 'Freier Werktag ohne Vorbelastung ist geeignet und erhält eine Empfehlung',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'martin'),
    stufe: 'green',
    grund: 'Monatsausgleich: noch 4 BD bis zum Soll'
  }""",
    """  {
    name: 'Freier Werktag vor erster Soll-Erfüllung bleibt neutral geeignet',
    aufbau: () => zustand(),
    prüfe: state => bewerte(state, '2026-07-08', 'bd', 'martin'),
    stufe: 'green',
    grund: 'Keine relevanten Konflikte'
  }"""
)

# Zusätzliche statische Sperre: Der Jahresverlauf darf nicht wieder über push/recommend laufen.
source = read(recommendation_path)
source += """

test('Jahresverlauf ist im Regelquelltext nicht bewertungswirksam verdrahtet', () => {
  const rules = readFileSync(new URL('../js/rules-evaluation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rules, /recommend\([^\n]*Jahresverlauf/);
  assert.doesNotMatch(rules, /push\([^\n]*Jahresverlauf/);
  assert.match(rules, /note\(`Jahresverlauf \(nur Hinweis, ohne Einfluss auf Bewertung\)/);
});
"""
source = source.replace("import fs from 'node:fs';", "import fs, { readFileSync } from 'node:fs';")
if "readFileSync" not in source.splitlines()[2]:
    # Die Datei importiert derzeit fs als Default. Den Import gezielt erweitern.
    source = source.replace("import fs from 'node:fs';", "import fs, { readFileSync } from 'node:fs';")
write(recommendation_path, source)

print('Fairnessregel, Tests und Release-Token erfolgreich aktualisiert.')
