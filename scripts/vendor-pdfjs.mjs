/**
 * Holt pdf.js in der im Quelltext festgelegten Fassung nach `vendor/pdfjs/`.
 *
 * Warum ein Skript und kein `npm install`: Die Bibliothek wird nicht gebündelt,
 * sondern als fertiges ES-Modul ausgeliefert — genau die beiden Dateien, die der
 * Browser lädt. Ein Paket in `node_modules` wäre ein Umweg über einen
 * Build-Schritt, den dieses Projekt bewusst nicht hat.
 *
 * Die Fassung steht in `js/pdf-import.js`; hier wird sie ausgelesen, damit es
 * keine zweite Wahrheit gibt.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/pdf-import.js', import.meta.url), 'utf8');
const version = source.match(/PDFJS_VERSION = '([\d.]+)'/)?.[1];
if (!version) throw new Error('PDFJS_VERSION in js/pdf-import.js nicht gefunden');

const base = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}`;
const target = new URL('../vendor/pdfjs/', import.meta.url);
await mkdir(target, { recursive: true });

for (const [url, name] of [
  [`${base}/pdf.min.mjs`, 'pdf.min.mjs'],
  [`${base}/pdf.worker.min.mjs`, 'pdf.worker.min.mjs'],
  [`https://raw.githubusercontent.com/mozilla/pdf.js/v${version}/LICENSE`, 'LICENSE']
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(new URL(name, target), bytes);
  console.log(`${name}: ${(bytes.length / 1024).toFixed(0)} KiB`);
}
console.log(`pdf.js ${version} liegt unter vendor/pdfjs/.`);
