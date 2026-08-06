/**
 * Holt die ausgelieferten Fremdbibliotheken in der im Quelltext festgelegten
 * Fassung nach `vendor/`: pdf.js für den PDF-Import, SheetJS für Excel.
 *
 * Warum ein Skript und kein `npm install`: Die Bibliothek wird nicht gebündelt,
 * sondern als fertiges ES-Modul ausgeliefert — genau die beiden Dateien, die der
 * Browser lädt. Ein Paket in `node_modules` wäre ein Umweg über einen
 * Build-Schritt, den dieses Projekt bewusst nicht hat.
 *
 * Die Fassungen stehen in `js/pdf-import.js` und `js/xlsx-engine.js`; hier
 * werden sie ausgelesen, damit es keine zweite Wahrheit gibt.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function versionFrom(module, pattern, label) {
  const source = await readFile(new URL(`../js/${module}`, import.meta.url), 'utf8');
  const version = source.match(pattern)?.[1];
  if (!version) throw new Error(`${label} in js/${module} nicht gefunden`);
  return version;
}

async function fetchInto(directory, files) {
  const target = new URL(`../vendor/${directory}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  for (const [url, name] of files) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(new URL(name, target), bytes);
    console.log(`  ${directory}/${name}: ${(bytes.length / 1024).toFixed(0)} KiB`);
  }
}

const pdfVersion = await versionFrom('pdf-import.js', /PDFJS_VERSION = '([\d.]+)'/, 'PDFJS_VERSION');
const pdfBase = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfVersion}`;
console.log(`pdf.js ${pdfVersion}`);
await fetchInto('pdfjs', [
  [`${pdfBase}/pdf.min.mjs`, 'pdf.min.mjs'],
  [`${pdfBase}/pdf.worker.min.mjs`, 'pdf.worker.min.mjs'],
  [`https://raw.githubusercontent.com/mozilla/pdf.js/v${pdfVersion}/LICENSE`, 'LICENSE']
]);

const sheetVersion = await versionFrom('xlsx-engine.js', /SHEETJS_VERSION = '([\d.]+)'/, 'SHEETJS_VERSION');
const sheetBase = `https://cdn.sheetjs.com/xlsx-${sheetVersion}/package`;
console.log(`SheetJS ${sheetVersion}`);
await fetchInto('sheetjs', [
  [`${sheetBase}/dist/xlsx.full.min.js`, 'xlsx.full.min.js'],
  [`${sheetBase}/LICENSE`, 'LICENSE']
]);
