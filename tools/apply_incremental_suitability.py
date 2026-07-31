from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_section(path, start_marker, end_marker, replacement):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    file.write_text(text[:start] + replacement + text[end:], encoding='utf-8')


def append_once(path, marker, block):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if marker not in text:
        file.write_text(text.rstrip() + '\n\n' + block.strip() + '\n', encoding='utf-8')


app_old = '''  button.innerHTML = `
    <span class="assignment-name">${esc(name)}</span>
    <span class="assignment-badges">${staffId ? `<span class="small-chip ${evaluation.level}">${labelByLevel(evaluation.level)}</span>` : '<span class="small-chip">offen</span>'}</span>`;'''
app_new = '''  const badgeMarkup = staffId
    ? ''
    : '<span class="assignment-badges"><span class="small-chip">offen</span></span>';
  button.innerHTML = `
    <span class="assignment-name">${esc(name)}</span>
    ${badgeMarkup}`;'''
replace_once('js/app.js', app_old, app_new)

replace_once(
    'js/app.js',
    "  $('#pickerSubtitle').textContent = 'Farbkodierte Eignungsbewertung mit Tooltip-Begründung. Rote Konflikte erfordern eine explizite Bestätigung.';",
    "  $('#pickerSubtitle').textContent = 'Harte und strukturelle Regeln greifen sofort; relative Ausgleichshinweise erst nach der ersten Verteilungsrunde. Rote Konflikte erfordern eine explizite Bestätigung.';"
)

replace_once(
    'js/rules-evaluation.js',
    "\n\nfunction applyBundlingRules({ state, dateIso, role, staffId, push, recommend }) {",
    "\n\nfunction hasCompletedDistributionRound(loads, unit = 1) {\n  return loads.length > 0 && loads.reduce((sum, load) => sum + load, 0) >= loads.length * unit;\n}\n\nfunction applyBundlingRules({ state, dateIso, role, staffId, push, recommend }) {"
)

hg_new = '''function applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend, note }) {
  const peers = basicallyEligiblePeers(state, monthData, dateIso, 'hg');
  if (!peers.length) return;
  const totals = peers.map(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) + countRoleInMonthExcept(monthData, peer.id, 'hg', dateIso));
  const minimumTotal = Math.min(...totals);
  const ownTotal = currentBd + currentHg;
  const monthlyRoundComplete = hasCompletedDistributionRound(totals);
  if (ownTotal === minimumTotal) recommend('BD/HG-Ausgleich: aktuell geringste kombinierte Monatslast', 24);
  else if (monthlyRoundComplete) push('yellow', `BD/HG-Ausgleich: andere Fachärzte haben geringere kombinierte Monatslast (${minimumTotal} statt ${ownTotal})`);
  else note(`BD/HG-Ausgleich: erste Verteilungsrunde noch offen; andere Fachärzte haben geringere kombinierte Monatslast (${minimumTotal} statt ${ownTotal})`);

  const currentDayBd = getAssignment(state, dateIso, 'bd');
  if (isAaOn(state, currentDayBd, dateIso)) {
    const aaHgCounts = peers.map(peer => countHgForAaBdExcept(state, monthData, peer.id, dateIso));
    const minimumAaHg = Math.min(...aaHgCounts);
    const ownAaHg = countHgForAaBdExcept(state, monthData, staffId, dateIso);
    const aaRoundComplete = hasCompletedDistributionRound(aaHgCounts);
    if (ownAaHg === minimumAaHg) recommend('AA-HG-Ausgleich: aktuell geringste Zahl belastender HG für AA', 18);
    else if (aaRoundComplete) push('yellow', `AA-HG-Ausgleich: andere Fachärzte haben weniger HG für AA (${minimumAaHg} statt ${ownAaHg})`);
    else note(`AA-HG-Ausgleich: erste Verteilungsrunde noch offen; andere Fachärzte haben weniger HG für AA (${minimumAaHg} statt ${ownAaHg})`);
  }

  const currentMonth = Number(dateIso.slice(5, 7));
  const year = Number(dateIso.slice(0, 4));
  if (hasCompleteLoadedHistory(state, year, currentMonth)) {
    const comparable = peers.filter(peer => {
      const bd = countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso);
      const hg = countRoleInMonthExcept(monthData, peer.id, 'hg', dateIso);
      return bd + hg === ownTotal;
    });
    if (comparable.length > 1) {
      const histories = comparable.map(peer => countServicesInLoadedYearExcept(state, peer.id, year, dateIso, currentMonth));
      const minimum = Math.min(...histories);
      const own = countServicesInLoadedYearExcept(state, staffId, year, dateIso, currentMonth);
      if (own === minimum) note(`Jahresverlauf: niedrigste bisherige Dienstlast (${own})`);
      else note(`Jahresverlauf: höhere bisherige Dienstlast (${own} statt ${minimum})`);
    }
  }
}

'''
replace_section(
    'js/rules-evaluation.js',
    'function applyHgFairness(',
    'function applyWeekendFairness(',
    hg_new
)

weekend_new = '''function applyWeekendFairness({ state, monthData, dateIso, role, staffId, push, recommend, note }) {
  const date = parseIso(dateIso);
  if (![5, 6, 0].includes(date.getDay())) return;
  const projected = projectedWeekendEquivalent(monthData, staffId, dateIso, role);
  const peers = basicallyEligiblePeers(state, monthData, dateIso, role);
  const peerLoads = peers.map(peer => weekendEquivalentFromMap(weekendMap(monthData, peer.id, dateIso)));
  const minimum = peerLoads.length ? Math.min(...peerLoads) : 0;
  const ownBase = weekendEquivalentFromMap(weekendMap(monthData, staffId, dateIso));
  const weekendRoundComplete = hasCompletedDistributionRound(peerLoads, 0.5);

  if (ownBase === minimum) recommend(`Wochenend-Ausgleich: aktuell geringste Belastung (${ownBase.toFixed(1)})`, 20);
  else if (weekendRoundComplete) push('yellow', `Wochenend-Ausgleich: andere geeignete Personen liegen niedriger (${minimum.toFixed(1)} statt ${ownBase.toFixed(1)})`);
  else note(`Wochenend-Ausgleich: erste Verteilungsrunde noch offen; andere geeignete Personen liegen niedriger (${minimum.toFixed(1)} statt ${ownBase.toFixed(1)})`);
  if (projected > 1) push('yellow', `Wochenendziel 1,0 würde auf ${projected.toFixed(1)} steigen`);

  if (role === 'bd' && date.getDay() === 6 && countSaturdayBdExcept(monthData, staffId, dateIso) >= 1) {
    push('orange', 'Weiterer Samstags-BD im selben Monat; strenge Rotation bevorzugt andere Fachärzte');
  }
}

'''
replace_section(
    'js/rules-evaluation.js',
    'function applyWeekendFairness(',
    'export function evaluateCandidate(',
    weekend_new
)

rules_file = Path('js/rules-evaluation.js')
rules_text = rules_file.read_text(encoding='utf-8')
call_old = 'applyWeekendFairness({ state, monthData, dateIso, role, staffId, push, recommend });'
if rules_text.count(call_old) != 2:
    raise SystemExit(f'js/rules-evaluation.js: expected two weekend calls, found {rules_text.count(call_old)}')
rules_file.write_text(
    rules_text.replace(call_old, 'applyWeekendFairness({ state, monthData, dateIso, role, staffId, push, recommend, note });'),
    encoding='utf-8'
)

hg_tests = '''test('HG-Ausgleich bleibt während der ersten Verteilungsrunde neutral informativ', () => {
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
  setAssignment(data, '2026-07-09', 'bd', 'lurz');
  const lurz = evalAt(state, '2026-07-08', 'hg', 'lurz');
  assert.equal(lurz.level, 'yellow');
  assert.ok(has(lurz, 'geringere kombinierte Monatslast'));
  assert.equal(has(lurz, 'erste Verteilungsrunde noch offen'), false);
});

'''
replace_section(
    'tests/recommendation-rules.test.js',
    "test('HG-Ausgleich bevorzugt die geringere kombinierte Monatslast'",
    "test('HG für AA wird nach bisheriger AA-HG-Belastung ausgeglichen'",
    hg_tests
)

append_once(
    'tests/e2e/app.spec.js',
    "test('Belegte Dienstfelder zeigen keinen Badge",
    '''test('Belegte Dienstfelder zeigen keinen Badge, der Picker aber weiterhin die Bewertung', async ({ page }) => {
  const month = emptyMonth(2026, 7);
  month.days['2026-07-01'].bd = 'lurz';
  await mockApi(page, month);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');

  const firstRow = page.locator('#planTableBody tr').first();
  const occupiedBd = firstRow.locator('.assignment-btn').first();
  const openHg = firstRow.locator('.assignment-btn').nth(1);

  await expect(occupiedBd.locator('.assignment-name')).toHaveText('Dr. Lurz');
  await expect(occupiedBd.locator('.assignment-badges')).toHaveCount(0);
  await expect(openHg.locator('.assignment-badges .small-chip')).toHaveText('offen');

  await occupiedBd.click();
  await expect(page.locator('#pickerDialog')).toBeVisible();
  const lurz = page.locator('#pickerList .picker-item').filter({ hasText: 'Dr. Lurz' });
  await expect(lurz.locator('.small-chip')).toHaveCount(1);
  await expect(lurz.locator('.reasons')).not.toBeEmpty();
});'''
)

replace_once(
    'README.md',
    'Jede Änderung löst eine neue Darstellung aus. Dadurch werden nicht nur neue Kandidaten, sondern auch bereits eingetragene Dienste sofort gegen den aktuellen Gesamtstand bewertet.',
    'Jede Änderung löst eine neue Darstellung aus. Offene Felder und der Picker werden sofort gegen den aktuellen Gesamtstand bewertet. Bereits eingetragene BD-/HG-Zellen zeigen bewusst nur den Namen; ihre aktuelle Bewertung bleibt über den nativen Tooltip und einen erneuten Klick vollständig zugänglich.'
)

replace_once(
    'README.md',
    '''## 9.10 HG-Ausgleich

Für HG werden unter den grundsätzlich geeigneten Fachärztinnen und Fachärzten BD und HG des Monats kombiniert:

- geringste kombinierte Monatslast: positive Empfehlung;
- höhere kombinierte Monatslast als das Minimum: gelb.

Diese HG-Verteilungsregel ist nicht identisch mit der bedingten BD-Monatsausgleichsregel und besitzt keine Soll-Erreichungsschwelle.''',
    '''## 9.10 HG-Ausgleich

Für HG werden unter den grundsätzlich geeigneten Fachärztinnen und Fachärzten BD und HG des Monats kombiniert:

- geringste kombinierte Monatslast: positive Empfehlung ab der ersten Einteilung;
- höhere kombinierte Monatslast vor Abschluss der ersten Verteilungsrunde: neutraler Klartexthinweis;
- höhere kombinierte Monatslast nach Abschluss der ersten Verteilungsrunde: gelb.

Die erste Verteilungsrunde gilt als abgeschlossen, sobald die Summe der bisher eingetragenen BD und HG innerhalb der aktuell geeigneten Facharztgruppe mindestens einem Dienst je Person entspricht. Dadurch bleibt die Bewertung sowohl bei tageweiser als auch bei personenweiser Erfassung ruhig, ohne einen späteren Monatsausgleich zu verlieren. Die Regel besitzt weiterhin keine BD-Soll-Erreichungsschwelle.'''
)

replace_once(
    'README.md',
    '''## 9.11 HG bei Assistenzarzt-BD

Steht am Tag ein BD durch eine nicht fachärztliche Person, wird zusätzlich gezählt, wie häufig jede HG-berechtigte Person im Monat bereits einen solchen belastenden HG übernommen hat:

- geringste Zahl: positive Empfehlung;
- höhere Zahl als das Minimum: gelb.''',
    '''## 9.11 HG bei Assistenzarzt-BD

Steht am Tag ein BD durch eine nicht fachärztliche Person, wird zusätzlich gezählt, wie häufig jede HG-berechtigte Person im Monat bereits einen solchen belastenden HG übernommen hat:

- geringste Zahl: positive Empfehlung ab der ersten Einteilung;
- höhere Zahl vor einer vollständigen ersten AA-HG-Verteilungsrunde: neutraler Klartexthinweis;
- höhere Zahl danach: gelb.'''
)

replace_once(
    'README.md',
    'Personen mit der geringsten bisherigen Last erhalten eine positive Erklärung. Höhere Last wird gelb erläutert. Würde der geplante Dienst das Ziel 1,0 überschreiten, erscheint ein zusätzlicher gelber Hinweis.',
    'Personen mit der geringsten bisherigen Last erhalten eine positive Erklärung. Eine höhere relative Last bleibt bis zu einer aufsummierten halben Wochenend-Einheit je aktuell geeigneter Person neutral informativ und wird erst danach gelb erläutert. Würde der geplante Dienst das Ziel 1,0 überschreiten, erscheint unabhängig davon sofort ein zusätzlicher gelber Hinweis.'
)

replace_once('Eignungsregeln.txt', 'DienstplanRAD (v4.3)', 'DienstplanRAD (v4.4)')
replace_once(
    'Eignungsregeln.txt',
    '- Zielwert ist 1,0 Wochenend-Äquivalent je Person. Kandidaten mit geringerer bisheriger Wochenendbelastung werden bevorzugt; eine Überschreitung von 1,0 wird gelb kenntlich gemacht.',
    '- Zielwert ist 1,0 Wochenend-Äquivalent je Person. Kandidaten mit geringerer bisheriger Wochenendbelastung werden ab der ersten Einteilung bevorzugt. Eine höhere relative Last wird erst nach einer ersten Verteilungsrunde von aufsummiert 0,5 Wochenend-Äquivalenten je aktuell geeigneter Person gelb; zuvor bleibt sie ein neutraler Klartexthinweis. Eine Überschreitung von 1,0 wird unabhängig davon sofort gelb kenntlich gemacht.'
)
replace_once(
    'Eignungsregeln.txt',
    '- Bei HG wird die kombinierte Monatslast aus BD und HG innerhalb der am konkreten Tag verfügbaren Facharztgruppe verglichen. Diese HG-Regel besitzt keine BD-Soll-Startschwelle.',
    '- Bei HG wird die kombinierte Monatslast aus BD und HG innerhalb der am konkreten Tag verfügbaren Facharztgruppe verglichen. Die geringste Last wird von Beginn an positiv erklärt. Eine höhere relative Last wird erst gelb, sobald die Summe der bereits eingetragenen BD und HG mindestens einem Dienst je aktuell geeigneter Person entspricht; vorher bleibt sie ein neutraler Klartexthinweis. Diese HG-Regel besitzt weiterhin keine BD-Soll-Startschwelle.'
)
replace_once(
    'Eignungsregeln.txt',
    '- Bei einem HG zu einem Assistenzarzt-BD wird zusätzlich die bisherige Anzahl belastender HG für Assistenzarzt-BD innerhalb der Facharztgruppe ausgeglichen.',
    '- Bei einem HG zu einem Assistenzarzt-BD wird zusätzlich die bisherige Anzahl belastender HG für Assistenzarzt-BD innerhalb der Facharztgruppe ausgeglichen. Auch hier bleibt eine höhere relative Last bis zu einer vollständigen ersten AA-HG-Verteilungsrunde neutral informativ und wird erst danach gelb.'
)

old_release = '20260730.7'
new_release = '20260731.1'
allowed_suffixes = {'.js', '.html', '.md', '.txt', '.json'}
for file in Path('.').rglob('*'):
    if not file.is_file() or '.git' in file.parts or file.suffix.lower() not in allowed_suffixes:
        continue
    text = file.read_text(encoding='utf-8')
    if old_release in text:
        file.write_text(text.replace(old_release, new_release), encoding='utf-8')
