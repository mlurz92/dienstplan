import {
  assertYearMonth, ensureMonthShape, invalid, json, kv, monthStorageKey, put, readJsonRequest, serverError
} from '../../../_utils.js';
import { isPlainRecord } from '../../../../js/defaults.js';

export async function onRequestGet(context) {
  const { year, month } = context.params;
  let key;
  let empty;
  let valid;
  try {
    // Der Schlüssel muss aus den validierten Zahlen abgeleitet werden, nicht aus
    // den rohen URL-Parametern – sonst entstünden aliasierte Schlüssel
    // („02026", „2026.0"), die der Export nie sieht.
    valid = assertYearMonth(year, month);
    key = monthStorageKey(valid.year, valid.month);
    empty = ensureMonthShape(valid.year, valid.month);
  } catch (error) {
    return invalid(error.message);
  }
  try {
    // Lesen legt bewusst nichts an. Das Vorladen öffnet beim Monatswechsel bis
    // zu dreizehn Monate; jeder unbekannte davon hätte sonst einen leeren
    // Datensatz in den KV-Speicher geschrieben – Schreiblast und Einträge ohne
    // jeden Inhalt. Gespeichert wird erst, wenn tatsächlich etwas eingetragen
    // wurde, also beim PUT.
    const stored = await kv(context).get(key, 'json');
    return json({ ok: true, month: stored === null ? empty : ensureMonthShape(valid.year, valid.month, stored) });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  const { year, month } = context.params;
  let key;
  let normalized;
  let valid;
  try {
    valid = assertYearMonth(year, month);
    key = monthStorageKey(valid.year, valid.month);
    const body = await readJsonRequest(context.request);
    // Ein nicht-objektartiger Rumpf (null, Zahl, Text, Liste) darf niemals den
    // bestehenden Monat überschreiben und als Erfolg gemeldet werden.
    if (!isPlainRecord(body)) throw new Error('Monatsdaten müssen ein JSON-Objekt sein.');
    normalized = ensureMonthShape(valid.year, valid.month, body);
  } catch (error) {
    return invalid(error.message);
  }
  try {
    await put(context, key, normalized);
    return json({ ok: true, month: normalized });
  } catch (error) {
    return serverError(error);
  }
}
