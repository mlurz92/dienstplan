#!/usr/bin/env node
/**
 * Umzug des Datenbestands von Workers KV in die IONOS-Datenbank.
 *
 * Der Weg führt über die beiden Endpunkte, die es auf beiden Seiten gibt:
 * `GET /api/export` liest den vollständigen Bestand, `POST /api/import`
 * schreibt ihn in einer Transaktion. Ein eigenes Datenformat braucht es dafür
 * nicht — es ist dasselbe, das auch die JSON-Sicherung der Oberfläche erzeugt.
 *
 * Geprüft wird an drei Stellen, denn ein halb übertragener Dienstplan ist
 * schlimmer als ein nicht übertragener:
 *   1. vor dem Schreiben gegen `js/defaults.js` (dieselbe Normalisierung, die
 *      auch die Anwendung anwendet),
 *   2. beim Schreiben durch die Transaktion auf der Zielseite,
 *   3. danach durch erneutes Auslesen des Ziels und einen Vergleich Feld für
 *      Feld gegen die Quelle.
 *
 * Aufruf:
 *   node scripts/migrate-kv-to-ionos.mjs \
 *     --from https://alte-adresse.pages.dev \
 *     --to   https://dienstplan.markuslurz.de \
 *     [--auth benutzer:kennwort]   Basisauthentifizierung des Ziels
 *     [--file sicherung.json]      Quelle aus Datei statt aus --from
 *     [--dry-run]                  nur lesen und prüfen, nichts schreiben
 */

import { readFile } from 'node:fs/promises';
import { normalizeBackupPayload } from '../js/defaults.js';

function parseArguments(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') { options.dryRun = true; continue; }
    const match = /^--(from|to|auth|file)$/.exec(token);
    if (!match) throw new Error(`Unbekanntes Argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Für ${token} fehlt der Wert.`);
    options[match[1]] = value;
    index += 1;
  }
  if (!options.file && !options.from) throw new Error('Es fehlt --from (Quelladresse) oder --file (Sicherungsdatei).');
  if (!options.dryRun && !options.to) throw new Error('Es fehlt --to (Zieladresse).');
  return options;
}

function authorizationHeader(auth) {
  return auth ? { Authorization: `Basic ${Buffer.from(auth, 'utf8').toString('base64')}` } : {};
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new Error(`${url}: keine JSON-Antwort (HTTP ${response.status}): ${text.slice(0, 200)}`); }
  if (!response.ok || data?.ok === false) throw new Error(`${url}: ${data?.error || `HTTP ${response.status}`}`);
  return data;
}

/** Zählt, was übertragen wird — die Zahlen sind die Abnahme des Umzugs. */
function summary(payload) {
  return {
    monate: payload.months?.length || 0,
    personen: payload.staff?.length || 0,
    rbnNamen: payload.rbnNames?.length || 0,
    einteilungen: (payload.months || []).reduce((total, [, month]) => total
      + Object.values(month.days || {}).filter(day => day.bd || day.hg || day.rbn1 || day.rbn2).length, 0)
  };
}

/**
 * Vergleicht Quelle und Ziel nach dem Schreiben.
 *
 * Verglichen wird der normalisierte Bestand, nicht der rohe Text: Die
 * Reihenfolge von Objektschlüsseln ist ohne Bedeutung, der Inhalt nicht.
 */
function findDifferences(source, target) {
  const problems = [];
  const canonical = value => JSON.stringify(value);
  for (const field of ['settings', 'staff', 'rbnNames']) {
    if (canonical(source[field]) !== canonical(target[field])) problems.push(`Abweichung in „${field}“`);
  }
  const sourceMonths = new Map(source.months || []);
  const targetMonths = new Map(target.months || []);
  for (const [key, value] of sourceMonths) {
    if (!targetMonths.has(key)) { problems.push(`Monat ${key} fehlt im Ziel`); continue; }
    if (canonical(value) !== canonical(targetMonths.get(key))) problems.push(`Monat ${key} weicht ab`);
  }
  return problems;
}

/**
 * Streng normalisierter Bestand.
 *
 * Nur vorhandene Felder werden übergeben: `normalizeBackupPayload` unterscheidet
 * „fehlt“ von „ist leer“. Ein Schlüssel, den die Quelle nie hatte, darf im Ziel
 * nicht als leerer Schlüssel entstehen — und die strenge Prüfung dürfte an einem
 * `null` nicht scheitern, das nur „nie gesetzt“ bedeutet.
 */
function strictBackup(raw) {
  const source = { months: raw.months || [] };
  for (const field of ['settings', 'staff', 'rbnNames']) {
    if (raw[field] !== undefined && raw[field] !== null) source[field] = raw[field];
  }
  return normalizeBackupPayload(source, { strict: true });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const targetHeaders = { 'Content-Type': 'application/json', ...authorizationHeader(options.auth) };

  const raw = options.file
    ? JSON.parse(await readFile(options.file, 'utf8'))
    : await requestJson(new URL('/api/export', options.from).href);

  // Strenge Normalisierung: Ein Bestand, der hier durchfällt, wäre auch in der
  // Anwendung nicht tragfähig. Besser jetzt abbrechen als nach dem Schreiben.
  const payload = strictBackup(raw);

  console.log('Quelle gelesen und geprüft:', summary(payload));

  if (options.dryRun) {
    console.log('Probelauf — es wurde nichts geschrieben.');
    return;
  }

  const importResult = await requestJson(new URL('/api/import', options.to).href, {
    method: 'POST',
    headers: targetHeaders,
    body: JSON.stringify(payload)
  });
  console.log(`Ziel geschrieben: ${importResult.importedMonths} Monate.`);

  const verification = strictBackup(
    await requestJson(new URL('/api/export', options.to).href, { headers: authorizationHeader(options.auth) })
  );
  const problems = findDifferences(payload, verification);
  if (problems.length) {
    console.error('Nachprüfung fehlgeschlagen:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log('Nachprüfung bestanden — Quelle und Ziel sind inhaltsgleich:', summary(verification));
}

main().catch(error => {
  console.error(`Abbruch: ${error.message}`);
  process.exitCode = 1;
});
