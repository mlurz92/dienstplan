/**
 * Tabellenbibliothek — nachgeladen aus dem Repository, nicht aus dem Netz.
 *
 * Dieselbe Regel wie bei pdf.js und dem CP-SAT-WebAssembly: Was ausgeliefert
 * wird, liegt im Repository; ein CDN ist Rückfallebene, nie der einzige Weg.
 *
 * ZUSÄTZLICH: ERST BEI BEDARF
 *
 * Bis hierher hing die Bibliothek als `<script defer>` im Kopf der Seite — 950
 * Kilobyte, die jeder Seitenaufruf lud, obwohl Import und Export die Ausnahme
 * sind. Jetzt wird sie beim ersten Excel-Vorgang geholt. Nebenbei verschwindet
 * damit ein ganzer Fehlerfall: Die frühere Meldung „Excel-Bibliothek noch nicht
 * geladen" konnte auftreten, während die Seite noch lud — sie war für Nutzende
 * nicht handhabbar, weil sie nichts tun konnten außer zu warten.
 *
 * `xlsx.full.min.js` ist ein klassisches Skript und legt `XLSX` global ab; es
 * lässt sich deshalb nicht als ES-Modul importieren, sondern wird als
 * `<script>`-Element eingehängt.
 */

const VERSION_MARKER = '20260806.1';
export const SHEETJS_VERSION = '0.20.3';

export const XLSX_ENGINE_SOURCES = Object.freeze([
  Object.freeze({ origin: 'local', url: `/vendor/sheetjs/xlsx.full.min.js?v=${VERSION_MARKER}` }),
  Object.freeze({ origin: 'cdn', url: `https://cdn.sheetjs.com/xlsx-${SHEETJS_VERSION}/package/dist/xlsx.full.min.js` })
]);

let enginePromise = null;
let loadDiagnostics = [];

/** Woher die Bibliothek kam — für Fehlermeldungen und Tests. */
export function xlsxEngineDiagnostics() {
  return [...loadDiagnostics];
}

function injectScript(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = url;
    element.async = true;
    element.addEventListener('load', () => {
      // Geladen heißt nicht geliefert: Ein Fehler-HTML mit Status 200 führt
      // ebenfalls zu `load`, lässt `XLSX` aber undefiniert.
      if (globalThis.XLSX) resolve(globalThis.XLSX);
      else reject(new Error('Skript geladen, aber XLSX fehlt'));
    });
    element.addEventListener('error', () => reject(new Error(`${url} nicht erreichbar`)));
    document.head.append(element);
  });
}

/**
 * Lädt die Tabellenbibliothek einmalig und gibt sie zurück.
 * @returns {Promise<object>} das globale `XLSX`
 */
export async function loadXlsxEngine({ sources = XLSX_ENGINE_SOURCES } = {}) {
  if (globalThis.XLSX) return globalThis.XLSX;
  if (enginePromise) return enginePromise;

  const attempt = (async () => {
    loadDiagnostics = [];
    let lastError = null;
    for (const source of sources) {
      try {
        const engine = await injectScript(source.url);
        loadDiagnostics.push({ ...source, ok: true });
        return engine;
      } catch (error) {
        lastError = error;
        loadDiagnostics.push({ ...source, ok: false, reason: error?.message || String(error) });
      }
    }
    throw new Error(`Die Tabellenbibliothek konnte nicht geladen werden: ${lastError?.message || 'keine Quelle erreichbar'}`);
  })();

  enginePromise = attempt;
  try {
    return await attempt;
  } catch (error) {
    // Ein misslungener Ladeversuch darf sich nicht einbrennen.
    enginePromise = null;
    throw error;
  }
}

/**
 * Blätter einer Mappe in der Form, die der Import erwartet.
 * `cellDates`, weil Kopfzeilen den Monat teils als echtes Datum tragen.
 */
export async function readWorkbookSheets(buffer) {
  const XLSX = await loadXlsxEngine();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  return workbook.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true })
  }));
}
