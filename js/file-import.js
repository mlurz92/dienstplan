/**
 * Ein Import für alle Dateien.
 *
 * Bis v10.5 hatte jedes Format seine eigene Schaltfläche — Excel hier, JSON
 * dort, PDF gar nicht. Für die Bedienung ist das eine Zumutung: Wer eine Datei
 * hat, will sie importieren und nicht zuvor entscheiden, welcher Knopf für sie
 * zuständig ist. Die Dateiendung weiß das ohnehin.
 *
 * Dieses Modul entscheidet die Zuständigkeit und liefert für Planungsdateien
 * immer dieselbe Form wie der bisherige Excel-Import — `{ imports,
 * ignoredSheets }`. Die nachgelagerte Prüf- und Übernahmestrecke in `app.js`
 * bleibt dadurch unverändert; sie sieht nicht, woher die Zeilen stammen.
 *
 * Erkannt werden:
 *
 *   | Endung        | Inhalt                                              |
 *   |---------------|-----------------------------------------------------|
 *   | `.xlsx`/`.xls`| Jahresmappe, Monatsplan oder Neuroradiologieplan     |
 *   | `.pdf`        | dieselben Vorlagen als Ausdruck                      |
 *   | `.json`       | vollständige Sicherung (eigener Weg, kein Monatsplan)|
 */

import { analyzeWorkbook } from './excel-import.js?v=20260806.1';
import { documentToSheets, extractPdfPages } from './pdf-import.js?v=20260806.1';

export const IMPORT_ACCEPT = '.xlsx,.xls,.pdf,.json,application/json,application/pdf';

/** Fachlicher Fehler mit einer Meldung, die man Nutzenden zeigen kann. */
export class ImportError extends Error {
  constructor(message, { cause = null } = {}) {
    super(message);
    this.name = 'ImportError';
    this.cause = cause;
  }
}

/**
 * Art einer Datei aus Endung und, wo nötig, aus ihren ersten Bytes.
 *
 * Die Endung allein genügt nicht: Ein PDF, das jemand `.xls` genannt hat, wäre
 * sonst ein Lesefehler statt eines Imports. Die Signatur entscheidet deshalb
 * mit, sobald sie eindeutig ist.
 */
export function detectFileKind(name, header = null) {
  const extension = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  const bytes = header ? new Uint8Array(header).subarray(0, 4) : null;
  const signature = bytes ? String.fromCharCode(...bytes) : '';
  if (signature.startsWith('%PDF')) return 'pdf';
  // XLSX ist ein ZIP-Archiv; XLS und alles andere entscheidet die Endung.
  if (signature.startsWith('PK') && extension !== 'json') return 'excel';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'json') return 'json';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  return 'unknown';
}

/**
 * Liest eine Planungsdatei ein.
 *
 * `readWorkbook` und `readPdf` werden hereingereicht, damit dieses Modul ohne
 * Browser prüfbar bleibt: Die eine Abhängigkeit ist die Tabellenbibliothek, die
 * andere pdf.js — beide gehören nicht in einen Node-Test.
 */
export async function readPlanFile(file, {
  staff = [],
  fallbackYear,
  fallbackMonth,
  readWorkbook = null,
  readPdf = null
} = {}) {
  const buffer = await file.arrayBuffer();
  const kind = detectFileKind(file.name, buffer.slice(0, 8));

  if (kind === 'json') return { kind: 'json', buffer };
  if (kind === 'unknown') {
    throw new ImportError(`„${file.name}" hat kein bekanntes Format. Unterstützt werden Excel-Mappen (.xlsx), PDF-Ausdrucke (.pdf) und JSON-Sicherungen (.json).`);
  }

  let sheets;
  if (kind === 'excel') {
    if (typeof readWorkbook !== 'function') throw new ImportError('Die Tabellenbibliothek ist noch nicht geladen.');
    try {
      sheets = await readWorkbook(buffer);
    } catch (error) {
      throw new ImportError(`Die Excel-Datei konnte nicht gelesen werden: ${error.message}`, { cause: error });
    }
  } else {
    try {
      const pages = await (readPdf ? readPdf(buffer) : extractPdfPages(buffer));
      sheets = documentToSheets(pages, { name: file.name.replace(/\.pdf$/i, '') });
    } catch (error) {
      throw new ImportError(`Die PDF-Datei konnte nicht gelesen werden: ${error.message}`, { cause: error });
    }
  }

  const { imports, ignoredSheets } = analyzeWorkbook(sheets, { staff, fallbackYear, fallbackMonth });
  return { kind, imports, ignoredSheets, sheets };
}
