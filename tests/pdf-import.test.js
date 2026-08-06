/**
 * PDF-Import: von Textpositionen zur Tabelle und weiter in den Monat.
 *
 * Die Fixtures sind die echten Textelemente zweier realer Ausdrucke, ausgelesen
 * mit pdf.js: der eigene Monatsausdruck und der Hintergrunddienstplan der
 * Neuroradiologie. Damit prüft dieser Test genau das, was im Browser passiert —
 * ohne pdf.js in Node laden zu müssen.
 *
 * Warum das nötig ist: Ein PDF kennt keine Tabellen, nur Zeichenfolgen mit
 * Koordinaten. Ob aus ihnen wieder Zeilen und Spalten werden, entscheidet sich
 * an Zahlenwerten, die man nicht ansehen kann — Zeilentoleranz und
 * Spaltenabstand. Genau die stehen hier auf dem Prüfstand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.TZ = 'Europe/Berlin';

const { documentToSheets, groupTextRows, detectColumns, buildTable, collapseLetterSpacing } =
  await import('../js/pdf-import.js?v=20260806.1');
const { analyzeWorkbook, parseNeuroSheet } = await import('../js/excel-import.js?v=20260806.1');
const { DEFAULT_STAFF } = await import('../js/defaults.js');

const fixture = async name =>
  JSON.parse(await readFile(new URL(`./fixtures/pdf-${name}.json`, import.meta.url), 'utf8'));

test('gesperrte Versalschrift wird wieder zusammengezogen', () => {
  assert.equal(collapseLetterSpacing('B E R E I T S C H A F T'), 'BEREITSCHAFT');
  // Echte Wortfolgen bleiben unangetastet — sonst würde aus „El Houba" „ElHouba".
  assert.equal(collapseLetterSpacing('El Houba'), 'El Houba');
  assert.equal(collapseLetterSpacing('Monatskontrast · Erntegelb'), 'Monatskontrast · Erntegelb');
});

test('Zeilen entstehen aus gleicher Grundlinie, Spalten aus Mittelpunkten', async () => {
  const pages = await fixture('eigener-ausdruck');
  const rows = groupTextRows(pages[0].items);
  const columns = detectColumns(rows);
  const table = buildTable(rows, columns);

  // Sechs Spalten wie im Ausdruck – nicht mehr und nicht weniger.
  assert.equal(columns.length, 6);
  const header = table.find(row => row.includes('Wochentag'));
  assert.deepEqual(header, ['Tag', 'Wochentag', 'BD', 'HG', 'RBN', '2. RBN']);

  // Jede Tageszeile trägt ihre Werte in derselben Spalte wie die Überschrift.
  const first = table.find(row => row[0] === '1');
  assert.equal(first[1], 'Samstag');
  assert.ok(first[2] && first[3], 'BD und HG sind besetzt');
});

test('der eigene Ausdruck lässt sich vollständig zurücklesen', async () => {
  const pages = await fixture('eigener-ausdruck');
  const sheets = documentToSheets(pages, { name: 'Dienstplan_202608' });
  const { imports, ignoredSheets } = analyzeWorkbook(sheets, {
    staff: DEFAULT_STAFF, fallbackYear: 2000, fallbackMonth: 1
  });

  assert.equal(ignoredSheets.length, 0);
  assert.equal(imports.length, 1);
  const [result] = imports;
  // Monat und Jahr stehen im Kopf des Ausdrucks, nicht im Dateinamen.
  assert.equal(result.year, 2026);
  assert.equal(result.month, 8);
  assert.equal(result.usedFallbackYear, false);
  assert.equal(result.usedFallbackMonth, false);
  // 31 Tage × BD und HG.
  assert.equal(result.assignments, 62);
  assert.ok(result.rbnValues > 30);
  assert.deepEqual(result.unknownNames, [], 'alle Namen sind bekanntem Personal zugeordnet');
  assert.equal(result.monthData.days['2026-08-01'].bd, 'polednia');
  assert.equal(result.monthData.days['2026-08-01'].hg, 'lurz');
});

test('der Neuroradiologieplan liefert genau die beiden Rufbereitschaften', async () => {
  const pages = await fixture('neuro-hintergrunddienst');
  const sheets = documentToSheets(pages, { name: '07_2026' });
  const { imports } = analyzeWorkbook(sheets, {
    staff: DEFAULT_STAFF, fallbackYear: 2000, fallbackMonth: 1
  });

  assert.equal(imports.length, 1);
  const [result] = imports;
  // Das Jahr steht im Kopf nur zweistellig („Juli 26"); verlässlich ist die
  // Datumsspalte, und genau daraus muss es kommen.
  assert.equal(result.year, 2026);
  assert.equal(result.month, 7);
  assert.equal(result.assignments, 0, 'BD und HG stehen nicht in diesem Plan');
  assert.ok(result.rbnValues >= 40);
  // „Martin" ist bekanntes Personal und wird auf den am Tag gültigen
  // Rufbereitschaftspool abgebildet — deshalb der volle Name.
  assert.equal(result.monthData.days['2026-07-01'].rbn1, 'Dr. Martin');
  assert.equal(result.monthData.days['2026-07-01'].rbn2, 'Dr. Bailis');
  // Ein Tag ohne zweiten Dienst bleibt dort leer.
  assert.equal(result.monthData.days['2026-07-04'].rbn2, '');
  assert.equal(result.monthData.days['2026-07-04'].rbn1, 'Dr. Maybaum');
  // Auch der Tippfehler „;artin" der Quelle bleibt erhalten, statt still auf
  // eine falsche Person abgebildet zu werden — er fällt in der Oberfläche auf.
  assert.equal(result.monthData.days['2026-07-27'].rbn1, ';artin');
});

test('ein Neuroradiologieplan ohne lesbares Datum wird nicht stillschweigend einsortiert', () => {
  const rows = [
    ['', '', 'Monat', '', 'Juli 26'],
    ['Datum', 'Wochentag', '1. Dienst', '2. Dienst', 'Sonstiges'],
    ['ohne Datum', 'Mi', 'Martin', 'Bailis', '']
  ];
  // Ohne Datumsspalte und ohne Rückfallwerte gibt es kein Ergebnis.
  assert.equal(parseNeuroSheet('x', rows, {}), null);
  // Mit Rückfallwerten wird die Annahme ausgewiesen, statt sie zu verschweigen.
  const parsed = parseNeuroSheet('x', rows, { fallbackYear: 2026, fallbackMonth: 7 });
  assert.equal(parsed, null, 'ohne verwertbare Tageszeile bleibt es beim Verzicht');
});

test('Zeilen ohne Inhalt erzeugen keine Geisterspalten', () => {
  assert.deepEqual(groupTextRows([]), []);
  assert.deepEqual(detectColumns([]), []);
  assert.deepEqual(buildTable([], []), []);
});
