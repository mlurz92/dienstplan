#!/usr/bin/env node
/**
 * Stellt den Auslieferungsstand für IONOS zusammen — als Verzeichnis, das eins
 * zu eins in den Dokumentwurzel des Webspace gehört.
 *
 * Kein Build im Sinne eines Bundlers: Es wird nichts übersetzt, nichts
 * zusammengefasst, nichts umgeschrieben. Kopiert wird nur, und zwar nach einer
 * Positivliste. Der Grund ist die Erfahrung, dass Ausschlusslisten beim
 * Hochladen immer die Datei übersehen, die man am wenigsten auf einem
 * öffentlichen Webspace haben will — Tests, Notizen, Zugangsdaten.
 *
 * Aufruf: npm run bundle:ionos  (Ergebnis in dist-ionos/)
 */

import { cp, mkdir, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('../dist-ionos/', import.meta.url);

/** Verzeichnisse, die vollständig mitgehen. */
const DIRECTORIES = ['js', 'vendor', 'icons'];

/** Einzeldateien im Wurzelverzeichnis. */
const FILES = ['index.html', 'manifest.webmanifest'];

/** Alles im Wurzelverzeichnis mit diesen Endungen. */
const ROOT_EXTENSIONS = ['.css'];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const directory of DIRECTORIES) {
    await cp(new URL(`${directory}/`, ROOT), new URL(`${directory}/`, OUT), { recursive: true });
  }

  const rootEntries = await readdir(ROOT, { withFileTypes: true });
  const copied = [];
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    const take = FILES.includes(entry.name) || ROOT_EXTENSIONS.some(extension => entry.name.endsWith(extension));
    if (!take) continue;
    await cp(new URL(entry.name, ROOT), new URL(entry.name, OUT));
    copied.push(entry.name);
  }

  // Serverteil: Frontcontroller und Ablage. `config.php` wird bewusst NICHT
  // mitgeliefert — sie enthält die Zugangsdaten, liegt nur auf dem Webspace und
  // darf von einem Abgleich nie überschrieben werden.
  await mkdir(new URL('api/', OUT), { recursive: true });
  for (const file of ['index.php', 'store.php', 'config.example.php']) {
    await cp(new URL(`server/ionos/api/${file}`, ROOT), new URL(`api/${file}`, OUT));
  }
  await cp(new URL('server/ionos/sw.js.php', ROOT), new URL('sw.js.php', OUT));

  // Im Repository heißt sie `htaccess-webroot.txt`, auf dem Webspace `.htaccess`.
  await writeFile(new URL('.htaccess', OUT), await readFile(new URL('server/ionos/htaccess-webroot.txt', ROOT)));

  console.log(`dist-ionos/ erstellt: ${DIRECTORIES.join(', ')}, ${[...FILES, ...copied.filter(name => !FILES.includes(name))].join(', ')}, api/, sw.js.php, .htaccess`);
  console.log('Inhalt dieses Verzeichnisses in den Dokumentwurzel des Webspace hochladen.');
}

main().catch(error => {
  console.error(`Abbruch: ${error.message}`);
  process.exitCode = 1;
});
