import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { access } from 'node:fs/promises';
import {
  HELLMANN_RBN_ACTIVE_FROM, RBN2_TRIGGER_NAMES, getRbnOptions,
  isRbnValueAllowed, isSecondRbnAvailable, rbnDisplayName
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
  assert.match(app, /from '\.\/rbn\.js\?v=20260805\.1'/);
  assert.match(app, /function buildRbnSelect/);
  assert.match(app, /createElement\('select'\)/);
  assert.match(app, /isSecondRbnAvailable\(dateIso, firstSelect\.value\)/);
  assert.match(app, /secondControl\.select\.hidden = !available/);
  assert.match(app, /secondControl\.select\.disabled = !available/);
  assert.match(app, /clearWhenUnavailable: true/);
  assert.match(app, /setRbnValue\(dateIso, 'rbn2', ''\)/);
  assert.match(app, /legacyOption\.disabled = true/);
  // Kein „(Altwert)“ mehr im Feld – der Name allein genügt.
  assert.match(app, /new Option\(rbnDisplayName\(currentValue\), currentValue, true, true\)/);
  assert.doesNotMatch(app, /\(Altwert\)/);
  assert.doesNotMatch(app, /rbnSuggestions|saveRbnNames|createElement\('datalist'\)/);
  assert.doesNotMatch(rulesFacade, /rbn-ui|document|window/);
});

test('U/FZA wird direkt als fetter Name und normal gewichtete Ausführung erzeugt', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(app, /function appendSummaryEntry/);
  assert.match(app, /entry\.className = 'summary-entry'/);
  assert.match(app, /nameSpan\.className = 'absence-summary-name'/);
  assert.match(app, /detailSpan\.className = 'absence-summary-detail'/);
  assert.match(css, /\.absence-summary-name\s*\{\s*font-weight:\s*700;/);
  assert.match(css, /\.absence-summary-detail\s*\{\s*font-weight:\s*400;/);
  assert.match(css, /\.cell-summary-button\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.summary-entry\s*\{/);
});

test('Die Planungstabelle zeigt Dienstnamen ohne Anrede und Titel', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const buttonSource = app.slice(app.indexOf('function buildAssignmentButton'), app.indexOf('function setRbnValue'));

  assert.match(buttonSource, /const name = staffId \? assignmentLabel\(state\.staff, staffId, \{ short: true \}\) : '—'/);
  assert.match(buttonSource, /button\.title = staffId/);
  assert.match(buttonSource, /assignmentLabel\(state\.staff, staffId\),/);
});

test('RBN-Spalten zeigen Namen ohne Anrede und Titel, speichern aber den vollen Wert', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

  assert.equal(rbnDisplayName('Prof. Schob'), 'Schob');
  assert.equal(rbnDisplayName('Dr. Maybaum'), 'Maybaum');
  assert.equal(rbnDisplayName('Fr. Dalitz'), 'Dalitz');
  assert.equal(rbnDisplayName('Hr. El Houba'), 'El Houba');
  assert.equal(rbnDisplayName('Schob'), 'Schob');
  assert.equal(rbnDisplayName(''), '');
  assert.match(app, /new Option\(rbnDisplayName\(name\), name, false, name === currentValue\)/);
  assert.match(app, /select\.title = currentValue \|\| ''/);
});

test('Das Druckstylesheet hält den Monatsplan auf einer A4-Seite zusammen', () => {
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const printBlocks = css.split('@media print');
  const layout = printBlocks.at(-1);

  // Der maßgebliche Druckblock steht am Dateiende und überschreibt damit die
  // später notierten Glas-Regeln ohne !important.
  assert.match(layout, /@page \{ size: A4 portrait;/);
  assert.match(layout, /print-color-adjust: exact !important/);
  // Nur Tag, Wochentag, BD, HG, RBN und 2. RBN werden gedruckt.
  assert.match(layout, /\.plan-table th:nth-child\(7\)[\s\S]*?\.plan-table td:nth-child\(8\) \{ display: none; \}/);
  // Die Statistik bleibt auf Mitarbeitende, BD und HG reduziert.
  assert.match(layout, /\.distribution-table th:nth-child\(n\+4\), \.distribution-table td:nth-child\(n\+4\) \{ display: none; \}/);
  assert.match(layout, /\.below-plan \{ width: 168mm;[^}]*margin-top: 7mm;/);
  // Kein Beschnitt an den Panel-Ecken und Kopf mit Eyebrow und Monatsbadge.
  assert.match(layout, /\.glass-panel, \.sheet-panel \{[\s\S]*?overflow: visible; border-radius: 0;/);
  assert.match(layout, /\.sheet-heading \.eyebrow \{\s*display: block;/);
  assert.match(layout, /\.month-palette-label \{[\s\S]*?color: var\(--month-accent-strong\);\s*background: none;\s*border: \.18mm solid rgba\(0,0,0,\.3\);/);
  assert.match(layout, /\.rbn-input\[data-rbn-empty="true"\] \{ visibility: hidden; \}/);
  assert.doesNotMatch(layout, /--saturday-row-bg: #/);
});

test('Vor dem Drucken werden Monatsfarben und Dateiname gesetzt und danach zurückgenommen', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

  // Der Farbwechsel läuft als rAF-Interpolation; ohne dieses Setzen druckt ein
  // Wechsel mitten in der Bewegung die Farben des Vormonats.
  assert.match(app, /function prepareForPrint\(\) \{[\s\S]*?applyMonthTheme\(state\.currentMonth, \{ animate: false \}\);/);
  // Der PDF-Dateiname stammt aus dem Dokumenttitel.
  assert.match(app, /return `Dienstplan \$\{state\.currentYear\}-\$\{String\(state\.currentMonth\)\.padStart\(2, '0'\)\}`/);
  assert.match(app, /document\.title = printDocumentTitle\(\)/);
  assert.match(app, /window\.addEventListener\('beforeprint', prepareForPrint\)/);
  assert.match(app, /window\.addEventListener\('afterprint', restoreAfterPrint\)/);
});
