import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HELLMANN_RBN_ACTIVE_FROM, RBN2_TRIGGER_NAMES, getRbnOptions,
  isRbnValueAllowed, isSecondRbnAvailable
} from '../js/rbn.js';
import { parseAbsenceSummaryText } from '../js/rbn-ui.js';

const RBN1_BEFORE_OCTOBER = [
  'Prof. Schob',
  'Dr. Bailis',
  'Dr. Maybaum',
  'Dr. Schüngel',
  'Fr. Dalitz',
  'Dr. Martin',
  'Hr. El Houba'
];
const RBN2 = ['Prof. Schob', 'Dr. Bailis', 'Dr. Maybaum'];
const RBN2_TRIGGERS = ['Dr. Schüngel', 'Fr. Hellmann', 'Dr. Martin', 'Hr. El Houba'];

 test('RBN bietet bis einschließlich September exakt den vorgesehenen Pool', () => {
  assert.deepEqual(getRbnOptions('rbn1', '2026-09-30'), RBN1_BEFORE_OCTOBER);
});

test('Fr. Hellmann ist in RBN ab 1. Oktober 2026 auswählbar', () => {
  assert.equal(HELLMANN_RBN_ACTIVE_FROM, '2026-10-01');
  assert.deepEqual(getRbnOptions('rbn1', '2026-10-01'), [...RBN1_BEFORE_OCTOBER, 'Fr. Hellmann']);
  assert.ok(getRbnOptions('rbn1', '2027-01-01').includes('Fr. Hellmann'));
});

test('2. RBN enthält unabhängig vom Monat nur die drei festgelegten Personen', () => {
  assert.deepEqual(getRbnOptions('rbn2', '2026-09-30'), RBN2);
  assert.deepEqual(getRbnOptions('rbn2', '2026-10-01'), RBN2);
  assert.equal(getRbnOptions('rbn2', '2027-01-01').includes('Fr. Hellmann'), false);
});

test('2. RBN wird exakt durch die vier festgelegten Erstbesetzungen freigeschaltet', () => {
  assert.deepEqual(RBN2_TRIGGER_NAMES, RBN2_TRIGGERS);
  for (const name of ['Dr. Schüngel', 'Dr. Martin', 'Hr. El Houba']) {
    assert.equal(isSecondRbnAvailable('2026-09-30', name), true, name);
  }
  for (const name of ['Prof. Schob', 'Dr. Bailis', 'Dr. Maybaum', 'Fr. Dalitz', '', 'Unbekannt']) {
    assert.equal(isSecondRbnAvailable('2026-10-01', name), false, name);
  }
});

test('Fr. Hellmann schaltet 2. RBN erst ab Oktober 2026 frei', () => {
  assert.equal(isSecondRbnAvailable('2026-09-30', 'Fr. Hellmann'), false);
  assert.equal(isSecondRbnAvailable('2026-10-01', 'Fr. Hellmann'), true);
  assert.equal(isSecondRbnAvailable('2027-01-01', ' Fr. Hellmann '), true);
});

test('unbekannte Felder und ungültige Datumswerte liefern keine Auswahl', () => {
  assert.deepEqual(getRbnOptions('rbn3', '2026-10-01'), []);
  assert.deepEqual(getRbnOptions('rbn1', '01.10.2026'), []);
  assert.deepEqual(getRbnOptions('rbn1', ''), []);
  assert.deepEqual(getRbnOptions('rbn1', '2026-02-30'), []);
  assert.deepEqual(getRbnOptions('rbn1', '2026-13-01'), []);
  assert.equal(isSecondRbnAvailable('2026-02-30', 'Dr. Martin'), false);
});

test('Zulässigkeitsprüfung akzeptiert leer und nur feld-/datumsrichtige Namen', () => {
  assert.equal(isRbnValueAllowed('rbn1', '2026-09-30', ''), true);
  assert.equal(isRbnValueAllowed('rbn1', '2026-09-30', ' Fr. Hellmann '), false);
  assert.equal(isRbnValueAllowed('rbn1', '2026-10-01', ' Fr. Hellmann '), true);
  assert.equal(isRbnValueAllowed('rbn2', '2026-10-01', 'Dr. Schüngel'), false);
  assert.equal(isRbnValueAllowed('rbn2', '2026-10-01', 'Dr. Bailis'), true);
});

test('U/FZA-Text wird in Namen und normal gewichtete Ausführung zerlegt', () => {
  assert.deepEqual(parseAbsenceSummaryText('Becker: FZA, Martin: U'), [
    { name: 'Becker', detail: 'FZA' },
    { name: 'Martin', detail: 'U' }
  ]);
  assert.deepEqual(parseAbsenceSummaryText(''), []);
  assert.deepEqual(parseAbsenceSummaryText('Freitext ohne Doppelpunkt'), [
    { name: '', detail: 'Freitext ohne Doppelpunkt' }
  ]);
});

test('Oberfläche koppelt 2. RBN an RBN und formatiert U/FZA semantisch', () => {
  const ui = fs.readFileSync(new URL('../js/rbn-ui.js', import.meta.url), 'utf8');
  const rulesFacade = fs.readFileSync(new URL('../js/rules.js', import.meta.url), 'utf8');

  assert.match(rulesFacade, /import '\.\/rbn-ui\.js\?v=20260730\.3'/);
  assert.match(ui, /row\.cells\[4\].*input\.rbn-input/);
  assert.match(ui, /row\.cells\[5\].*input\.rbn-input/);
  assert.match(ui, /isSecondRbnAvailable\(dateIso, firstSelect\.value\)/);
  assert.match(ui, /secondSelect\.hidden = !available/);
  assert.match(ui, /secondSelect\.disabled = !available/);
  assert.match(ui, /clearWhenUnavailable: true/);
  assert.match(ui, /writeThrough\(secondInput, ''\)/);
  assert.match(ui, /rbn2-inactive-note/);
  assert.match(ui, /createElement\('select'\)/);
  assert.match(ui, /legacyOption\.disabled = true/);
  assert.match(ui, /input\.hidden = true/);
  assert.match(ui, /input\.dispatchEvent\(new Event\('change'/);
  assert.match(ui, /createElement\('strong'\)/);
  assert.match(ui, /absence-summary-name/);
  assert.match(ui, /absence-summary-detail/);
  assert.match(ui, /detail\.textContent = `: \$\{entry\.detail\}`/);
  assert.match(ui, /saveLocalBootstrap\(\)/);
  assert.doesNotMatch(ui, /contenteditable|prompt\(|createElement\('input'\)/);
});
