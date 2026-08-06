/**
 * Ein Eingang für alle Dateien.
 *
 * Geprüft wird die Zuständigkeitsentscheidung: Welche Datei geht welchen Weg,
 * und was passiert mit einer, die keinen hat. Die Formaterkennung darf sich
 * nicht allein auf die Endung verlassen — eine falsch benannte Datei ist der
 * Normalfall, nicht die Ausnahme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { detectFileKind, readPlanFile, ImportError, IMPORT_ACCEPT } =
  await import('../js/file-import.js?v=20260806.1');

/** Minimale Datei-Attrappe: `name` und `arrayBuffer()` genügen dem Leser. */
function fakeFile(name, bytes = []) {
  const buffer = new Uint8Array(bytes).buffer;
  return { name, arrayBuffer: async () => buffer };
}

const PDF_HEADER = [...'%PDF-1.7'].map(character => character.charCodeAt(0));
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04];

test('die Endung entscheidet, die Signatur entscheidet stärker', () => {
  assert.equal(detectFileKind('plan.xlsx'), 'excel');
  assert.equal(detectFileKind('plan.xls'), 'excel');
  assert.equal(detectFileKind('plan.pdf'), 'pdf');
  assert.equal(detectFileKind('sicherung.json'), 'json');
  assert.equal(detectFileKind('notiz.txt'), 'unknown');

  // Ein PDF, das jemand „.xls" genannt hat, bleibt ein PDF.
  assert.equal(detectFileKind('plan.xls', new Uint8Array(PDF_HEADER).buffer), 'pdf');
  // Eine XLSX-Mappe ist ein ZIP-Archiv.
  assert.equal(detectFileKind('mappe.bin', new Uint8Array(ZIP_HEADER).buffer), 'excel');
  // JSON bleibt JSON, auch wenn die ersten Bytes zufällig „PK" lauten.
  assert.equal(detectFileKind('sicherung.json', new Uint8Array(ZIP_HEADER).buffer), 'json');
});

test('der Dateidialog nimmt alle vier Endungen an', () => {
  for (const extension of ['.xlsx', '.xls', '.pdf', '.json']) {
    assert.ok(IMPORT_ACCEPT.includes(extension), `${extension} fehlt`);
  }
});

test('eine JSON-Sicherung geht ihren eigenen Weg', async () => {
  const payload = new TextEncoder().encode('{"months":[]}');
  const read = await readPlanFile(fakeFile('sicherung.json', [...payload]));
  assert.equal(read.kind, 'json');
  assert.ok(read.buffer, 'die Rohdaten werden durchgereicht');
  assert.equal(read.imports, undefined, 'eine Sicherung ist kein Monatsplan');
});

test('ein unbekanntes Format wird benannt, nicht verschluckt', async () => {
  await assert.rejects(
    () => readPlanFile(fakeFile('notiz.txt', [1, 2, 3])),
    error => error instanceof ImportError && /kein bekanntes Format/.test(error.message)
  );
});

test('ohne Tabellenbibliothek scheitert der Excel-Weg mit klarer Ansage', async () => {
  await assert.rejects(
    () => readPlanFile(fakeFile('mappe.xlsx', ZIP_HEADER), { readWorkbook: null }),
    error => error instanceof ImportError && /Tabellenbibliothek/.test(error.message)
  );
});

test('Excel und PDF münden in dieselbe Ergebnisform', async () => {
  const rows = [
    ['Bereitschaftsdienstplan', '', '', '', 'August 2026'],
    ['', '', 'BD', 'HG', 'RBN', '2. RBN'],
    ['1', 'Samstag', 'Lurz', 'Polednia', '', '']
  ];
  const asExcel = await readPlanFile(fakeFile('plan.xlsx', ZIP_HEADER), {
    readWorkbook: async () => [{ name: 'Dienstplan', rows }]
  });
  const asPdf = await readPlanFile(fakeFile('plan.pdf', PDF_HEADER), {
    readPdf: async () => [{
      items: rows.flatMap((row, rowIndex) => row.map((cell, cellIndex) => ({
        s: String(cell), x: cellIndex * 80, y: 700 - rowIndex * 14, w: 30
      })).filter(item => item.s))
    }]
  });

  for (const [label, read] of [['Excel', asExcel], ['PDF', asPdf]]) {
    assert.equal(read.imports.length, 1, `${label}: ein Monat`);
    assert.equal(read.imports[0].year, 2026, `${label}: Jahr`);
    assert.equal(read.imports[0].month, 8, `${label}: Monat`);
    assert.ok(read.imports[0].assignments >= 2, `${label}: Dienste gelesen`);
    assert.ok(Array.isArray(read.ignoredSheets), `${label}: Übersprungenes wird benannt`);
  }
});

test('ein Lesefehler der PDF-Bibliothek kommt als verständliche Meldung an', async () => {
  await assert.rejects(
    () => readPlanFile(fakeFile('kaputt.pdf', PDF_HEADER), {
      readPdf: async () => { throw new Error('Invalid PDF structure'); }
    }),
    error => error instanceof ImportError
      && /PDF-Datei konnte nicht gelesen werden/.test(error.message)
      && /Invalid PDF structure/.test(error.message)
  );
});
