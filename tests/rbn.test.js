import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { access } from 'node:fs/promises';
import {
  HELLMANN_RBN_ACTIVE_FROM, RBN2_TRIGGER_NAMES, getRbnOptions,
  isRbnValueAllowed, isSecondRbnAvailable
} from '../js/rbn.js';

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

const exists = async path => {
  try {
    await access(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
};

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

test('app.js rendert die RBN-Selects direkt und koppelt 2. RBN ohne DOM-Nachbearbeitung', async () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const rulesFacade = fs.readFileSync(new URL('../js/rules.js', import.meta.url), 'utf8');

  assert.equal(await exists('js/rbn-ui.js'), false, 'kein nachgelagerter DOM-Postprozessor');
  assert.match(app, /from '\.\/rbn\.js\?v=20260731\.1'/);
  assert.match(app, /function buildRbnSelect/);
  assert.match(app, /createElement\('select'\)/);
  assert.match(app, /isSecondRbnAvailable\(dateIso, firstSelect\.value\)/);
  assert.match(app, /secondControl\.select\.hidden = !available/);
  assert.match(app, /secondControl\.select\.disabled = !available/);
  assert.match(app, /clearWhenUnavailable: true/);
  assert.match(app, /setRbnValue\(dateIso, 'rbn2', ''\)/);
  assert.match(app, /legacyOption\.disabled = true/);
  assert.doesNotMatch(app, /rbnSuggestions|saveRbnNames|createElement\('datalist'\)/);
  assert.doesNotMatch(rulesFacade, /rbn-ui|document|window/);
});

test('U/FZA wird direkt als fetter Name und normal gewichtete Ausführung erzeugt', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(app, /function appendAbsenceSummaryEntry/);
  assert.match(app, /nameSpan\.className = 'absence-summary-name'/);
  assert.match(app, /detailSpan\.className = 'absence-summary-detail'/);
  assert.match(app, /detailSpan\.textContent = `: \$\{detail\}`/);
  assert.match(css, /\.absence-summary-name\s*\{\s*font-weight:\s*700;/);
  assert.match(css, /\.absence-summary-detail\s*\{\s*font-weight:\s*400;/);
});
