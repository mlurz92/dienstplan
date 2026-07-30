/**
 * Jeder relative Import in `functions/` muss auf eine existierende Datei zeigen.
 *
 * Anlass ist ein Vorfall mit weitreichender Wirkung: In
 * `functions/api/month/[year]/[month].js` stand `'../../../../_utils.js'` – vier
 * Ebenen aufwärts statt drei, also außerhalb von `functions/`. Cloudflare Pages
 * bündelt die Functions vor der Auslieferung; der Build brach daran ab:
 *
 *     ✘ [ERROR] Could not resolve "../../../../_utils.js"
 *         api/month/[year]/[month].js:1:89
 *     Failed: generating Pages Functions failed.
 *
 * Die Folge war nicht ein kaputter Endpunkt, sondern **kein Deployment**: Bei
 * einem gescheiterten Build bleibt die Produktion am letzten erfolgreichen
 * Stand. Wochenlang wurde damit eine alte Fassung ausgeliefert, während im
 * Repository längst korrigierter Code lag – und die Fehlersuche lief dadurch
 * mehrfach ins Leere, weil sie im Anwendungscode nach etwas suchte, das dort
 * nicht war.
 *
 * Der Fehler ist mit einer Dateisystemprüfung trivial zu erkennen. Genau die
 * fehlte, denn `node --check` prüft nur Syntax und löst keine Importe auf.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projektWurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sammleDateien(verzeichnis) {
  const einträge = await readdir(verzeichnis, { withFileTypes: true });
  const dateien = [];
  for (const eintrag of einträge) {
    const pfad = resolve(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) dateien.push(...await sammleDateien(pfad));
    else if (eintrag.name.endsWith('.js')) dateien.push(pfad);
  }
  return dateien;
}

const vorhanden = async pfad => {
  try {
    await access(pfad);
    return true;
  } catch {
    return false;
  }
};

test('every relative import inside functions/ resolves to a real file', async () => {
  const dateien = await sammleDateien(resolve(projektWurzel, 'functions'));
  assert.ok(dateien.length >= 8, 'die Functions müssen gefunden werden');

  const fehler = [];
  for (const datei of dateien) {
    const quelle = await readFile(datei, 'utf8');
    const spezifizierer = [...quelle.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(treffer => treffer[1]);
    for (const spezifizierer_ of spezifizierer) {
      if (!spezifizierer_.startsWith('.')) continue;
      const ziel = resolve(dirname(datei), spezifizierer_);
      if (!await vorhanden(ziel)) {
        fehler.push(`${datei.replace(projektWurzel + '/', '')} → ${spezifizierer_}`);
      }
    }
  }

  assert.deepEqual(fehler, [], `nicht auflösbare Importe brechen den Pages-Build:\n  ${fehler.join('\n  ')}`);
});

test('functions never import browser modules with a cache-busting token', async () => {
  // Die Versionsmarke `?v=…` gilt nur dem Browser. In einem Import, den esbuild
  // beim Bündeln der Functions auflösen muss, wäre sie Teil des Dateinamens und
  // damit ebenfalls nicht auflösbar.
  const dateien = await sammleDateien(resolve(projektWurzel, 'functions'));
  for (const datei of dateien) {
    const quelle = await readFile(datei, 'utf8');
    assert.doesNotMatch(quelle, /from\s+['"][^'"]*\?v=/, `${datei.replace(projektWurzel + '/', '')} darf keine Versionsmarke im Import tragen`);
  }
});
