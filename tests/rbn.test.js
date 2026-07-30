import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HELLMANN_RBN_ACTIVE_FROM, getRbnOptions, isRbnValueAllowed } from '../js/rbn.js';

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

test('unbekannte Felder und ungültige Datumswerte liefern keine Auswahl', () => {
  assert.deepEqual(getRbnOptions('rbn3', '2026-10-01'), []);
  assert.deepEqual(getRbnOptions('rbn1', '01.10.2026'), []);
  assert.deepEqual(getRbnOptions('rbn1', ''), []);
  assert.deepEqual(getRbnOptions('rbn1', '2026-02-30'), []);
  assert.deepEqual(getRbnOptions('rbn1', '2026-13-01'), []);
});

test('Zulässigkeitsprüfung akzeptiert leer und nur feld-/datumsrichtige Namen', () => {
  assert.equal(isRbnValueAllowed('rbn1', '2026-09-30', ''), true);
  assert.equal(isRbnValueAllowed('rbn1', '2026-09-30', ' Fr. Hellmann '), false);
  assert.equal(isRbnValueAllowed('rbn1', '2026-10-01', ' Fr. Hellmann '), true);
  assert.equal(isRbnValueAllowed('rbn2', '2026-10-01', 'Dr. Schüngel'), false);
  assert.equal(isRbnValueAllowed('rbn2', '2026-10-01', 'Dr. Bailis'), true);
});

test('Oberfläche ersetzt beide Freitextfelder durch getrennte Select-Felder', () => {
  const ui = fs.readFileSync(new URL('../js/rbn-ui.js', import.meta.url), 'utf8');
  const rulesFacade = fs.readFileSync(new URL('../js/rules.js', import.meta.url), 'utf8');

  assert.match(rulesFacade, /import '\.\/rbn-ui\.js\?v=20260730\.3'/);
  assert.match(ui, /row\.cells\[4\].*'rbn1'/);
  assert.match(ui, /row\.cells\[5\].*'rbn2'/);
  assert.match(ui, /createElement\('select'\)/);
  assert.match(ui, /legacyOption\.disabled = true/);
  assert.match(ui, /input\.hidden = true/);
  assert.match(ui, /input\.dispatchEvent\(new Event\('change'/);
  assert.match(ui, /saveLocalBootstrap\(\)/);
  assert.doesNotMatch(ui, /contenteditable|prompt\(|createElement\('input'\)/);
});
