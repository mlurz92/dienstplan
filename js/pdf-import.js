/**
 * PDF-Import — von Textpositionen zu Tabellenzeilen.
 *
 * WARUM DIESE TRENNUNG
 *
 * Ein PDF kennt keine Tabellen. Es kennt Zeichenfolgen mit Koordinaten; die
 * Tabelle entsteht erst im Auge der Betrachterin. Genau diese Rekonstruktion
 * leistet dieses Modul — und zwar als **reine Funktion** über bereits
 * ausgelesene Textelemente. Das Auslesen selbst kann nur der Browser (pdf.js
 * braucht WebAssembly und einen Worker); die Rekonstruktion dagegen ist reine
 * Rechnerei und dadurch in Node prüfbar. Ohne diese Trennung wäre der
 * Importpfad nur von Hand zu testen.
 *
 * DAS VERFAHREN
 *
 *   1. **Zeilen** entstehen aus gleicher Grundlinie: Elemente, deren y-Wert
 *      sich um weniger als die halbe Zeilenhöhe unterscheidet, gehören
 *      zusammen. Die Toleranz wird aus den Daten geschätzt, nicht geraten.
 *   2. **Spalten** entstehen aus wiederkehrenden *Mittelpunkten*: Über alle
 *      Zeilen hinweg häufen sich die Mitten an wenigen Stellen — das sind die
 *      Spalten. Ein Element gehört zu der, deren Anker ihm am nächsten liegt.
 *      Die linke Kante taugt dafür nicht: Bei zentriertem Zelltext wandert sie
 *      mit der Wortlänge.
 *
 * Beides ist bewusst unabhängig von einer bestimmten Vorlage: Der eigene
 * Ausdruck und der Neuroradiologie-Hintergrunddienstplan haben verschiedene
 * Spalten, aber dieselbe Bauweise.
 */

export const PDFJS_VERSION = '4.10.38';
const VERSION_MARKER = '20260806.1';

/**
 * Ladeordnung der Bibliothek — dieselbe Regel wie beim CP-SAT-WebAssembly:
 * Was ausgeliefert wird, liegt im Repository. Das Netz ist nur die Rückfallebene.
 *
 * Ein Import darf nicht daran scheitern, dass ein fremder Dienst gerade nicht
 * erreichbar ist. Die 1,7 MB liegen deshalb unter `vendor/pdfjs/` und werden mit
 * `immutable`-Cache genau einmal geholt.
 */
export const PDF_ENGINE_SOURCES = Object.freeze([
  Object.freeze({ origin: 'local', base: '/vendor/pdfjs', marker: `?v=${VERSION_MARKER}` }),
  Object.freeze({ origin: 'cdn', base: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`, marker: '' })
]);

/**
 * Gesperrte Versalschrift kommt als „B E R E I T S C H A F T“ an. Für die
 * Kopferkennung ist das unbrauchbar; einzelne Buchstaben mit Leerzeichen
 * dazwischen werden deshalb wieder zusammengezogen.
 */
export function collapseLetterSpacing(value) {
  const text = String(value ?? '');
  if (!/^(?:\S ){3,}\S$/.test(text.trim())) return text;
  return text.trim().split(' ').join('');
}

/** Median einer Zahlenreihe — robust gegen einzelne Ausreißer. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Textelemente zu Zeilen bündeln, von oben nach unten.
 * In PDF-Koordinaten wächst y nach oben; die Ausgabe ist trotzdem Lesereihenfolge.
 */
export function groupTextRows(items, { tolerance = null } = {}) {
  const usable = (items || []).filter(item => String(item?.s ?? '').trim());
  if (!usable.length) return [];

  // Zeilenabstand aus den Daten schätzen: die häufigsten Sprünge zwischen
  // benachbarten Grundlinien. Eine feste Toleranz ginge bei kleinerer Schrift
  // zwangsläufig daneben.
  const ys = [...new Set(usable.map(item => item.y))].sort((a, b) => b - a);
  const gaps = ys.slice(1).map((y, index) => ys[index] - y).filter(gap => gap > 0.5);
  const spacing = median(gaps) || 10;
  const limit = tolerance ?? Math.max(1.2, spacing * 0.45);

  const rows = [];
  for (const item of [...usable].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(candidate => Math.abs(candidate.y - item.y) <= limit);
    if (row) {
      row.items.push(item);
      // Gleitender Mittelwert: Eine Zeile mit gemischten Schriftgrößen driftet
      // sonst an ihrem ersten Element fest.
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows.sort((a, b) => b.y - a.y);
}

/** Waagerechte Mitte eines Textelements. */
const centerOf = item => item.x + (Number(item.w) || 0) / 2;

/**
 * Spaltenanker aus den **Mittelpunkten** aller Textelemente.
 *
 * Die linke Kante taugt nicht: In beiden Vorlagen steht der Zelltext zentriert,
 * die Anfangskante wandert also mit der Wortlänge und ein kurzer Wochentag
 * landete in der Nachbarspalte. Der Mittelpunkt bleibt dagegen stabil, egal wie
 * lang der Name ist.
 *
 * Geclustert wird über die Lücke: Spalten sind sichtbar getrennt, ihre
 * Mittelpunkte häufen sich deshalb in Gruppen mit deutlichem Abstand
 * dazwischen. Der Schwellenwert kommt aus den Daten — die typische Elementbreite
 * ist das natürliche Maß dafür, wann zwei Häufungen noch dieselbe Spalte sind.
 */
export function detectColumns(rows, { minRows = null, gap = null } = {}) {
  // Wie oft eine Kante wiederkehren muss, um als Spalte zu gelten, hängt an der
  // Länge des Dokuments: Bei einem Monatsplan mit dreißig Zeilen sind drei
  // Vorkommen wenig, bei einem dreizeiligen Auszug wäre dieselbe Schwelle das
  // Ende jeder Spaltenerkennung.
  const threshold = minRows ?? Math.max(1, Math.min(3, Math.round(rows.length * 0.15)));
  const centers = [];
  for (const row of rows) for (const item of row.items) centers.push(centerOf(item));
  if (!centers.length) return [];
  // Der Faktor ist gemessen, nicht geraten: Bei 0,45 der typischen Elementbreite
  // trennen beide Vorlagen sauber — der eigene Ausdruck (Medianbreite 23) ebenso
  // wie der Neuroradiologieplan (31). Größer, und die schmale Tagesspalte
  // verschmilzt mit dem Wochentag; kleiner, und breite Namen zerfallen in zwei
  // Spalten. Die Schranken halten den Wert auch bei ungewöhnlichen Schriftgraden
  // im brauchbaren Bereich.
  const widths = rows.flatMap(row => row.items.map(item => Number(item.w) || 0)).filter(Boolean);
  const limit = gap ?? Math.min(16, Math.max(10, median(widths) * 0.45));

  centers.sort((a, b) => a - b);
  const clusters = [[centers[0]]];
  for (const center of centers.slice(1)) {
    const current = clusters[clusters.length - 1];
    if (center - current[current.length - 1] <= limit) current.push(center);
    else clusters.push([center]);
  }
  return clusters
    .filter(cluster => cluster.length >= threshold)
    .map(cluster => cluster.reduce((sum, value) => sum + value, 0) / cluster.length);
}

/**
 * Zeilen und Spalten zu einer Tabelle verweben: Jedes Element kommt in die
 * Spalte, deren Anker seinem Mittelpunkt am nächsten liegt.
 *
 * Kopfzeilen ohne eigene Spalte — Logo-Text, Überschriften — landen dadurch in
 * der nächstgelegenen. Das ist gewollt: `detectPeriod` liest den Monat aus
 * genau diesen Zeilen und braucht sie im Ergebnis.
 */
export function buildTable(rows, columns) {
  const anchors = columns.length ? columns : [0];
  return rows.map(row => {
    const cells = new Array(anchors.length).fill('');
    for (const item of row.items) {
      const value = collapseLetterSpacing(item.s).trim();
      if (!value) continue;
      const center = centerOf(item);
      let index = 0;
      let best = Infinity;
      for (let position = 0; position < anchors.length; position += 1) {
        const distance = Math.abs(anchors[position] - center);
        if (distance < best) { best = distance; index = position; }
      }
      cells[index] = cells[index] ? `${cells[index]} ${value}` : value;
    }
    return cells;
  });
}

/** Eine Seite aus Textelementen in Tabellenzeilen. */
export function pageToRows(page, options = {}) {
  const rows = groupTextRows(page?.items || [], options);
  return buildTable(rows, detectColumns(rows, options));
}

/**
 * Ein vollständiges Dokument in dieselbe Form, die der Excel-Import erwartet:
 * eine Liste aus `{ name, rows }`. Jede Seite wird ein „Blatt“.
 */
export function documentToSheets(pages, { name = 'PDF' } = {}) {
  return (pages || []).map((page, index) => ({
    name: (pages.length > 1 ? `${name} · Seite ${index + 1}` : name),
    rows: pageToRows(page)
  }));
}

/* ------------------------------------------------------------------ *
 * Browserteil: pdf.js nachladen und Textelemente auslesen
 * ------------------------------------------------------------------ */

let enginePromise = null;
let loadDiagnostics = [];

/** Woher die Bibliothek kam — für Fehlermeldungen und Tests. */
export function pdfEngineDiagnostics() {
  return [...loadDiagnostics];
}

/**
 * Lädt pdf.js einmalig nach, zuerst aus dem Repository, dann aus dem Netz.
 *
 * Nachgeladen wird erst, wenn es gebraucht wird: Ein Import ist die Ausnahme,
 * nicht der Regelfall, und 1,7 MB gehören nicht in den Startpfad.
 */
export async function loadPdfEngine({ sources = PDF_ENGINE_SOURCES } = {}) {
  if (enginePromise) return enginePromise;
  const attempt = (async () => {
    loadDiagnostics = [];
    let lastError = null;
    for (const source of sources) {
      try {
        const module = await import(/* webpackIgnore: true */ `${source.base}/pdf.min.mjs${source.marker || ''}`);
        // Der Worker muss aus derselben Quelle stammen wie das Modul: Ein
        // lokales Modul mit fremdem Worker scheitert an der Same-Origin-Regel.
        module.GlobalWorkerOptions.workerSrc = `${source.base}/pdf.worker.min.mjs${source.marker || ''}`;
        loadDiagnostics.push({ ...source, ok: true });
        return module;
      } catch (error) {
        lastError = error;
        loadDiagnostics.push({ ...source, ok: false, reason: error?.message || String(error) });
      }
    }
    throw new Error(`pdf.js konnte nicht geladen werden: ${lastError?.message || 'keine Quelle erreichbar'}`);
  })();
  enginePromise = attempt;
  // Ein misslungener Ladeversuch darf sich nicht einbrennen: Das Netz kann
  // beim nächsten Versuch wieder da sein.
  try {
    return await attempt;
  } catch (error) {
    enginePromise = null;
    throw error;
  }
}

/** Textelemente aller Seiten eines PDF. */
export async function extractPdfPages(arrayBuffer, { engine = null } = {}) {
  const pdfjs = engine || await loadPdfEngine();
  const document = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push({
      items: content.items
        .filter(item => item.str && item.str.trim())
        .map(item => ({ s: item.str, x: item.transform[4], y: item.transform[5], w: item.width }))
    });
  }
  return pages;
}
