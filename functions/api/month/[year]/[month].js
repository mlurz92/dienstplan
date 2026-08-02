import {
  ensureMonthShape, invalid, json, kv, monthStorageKey, put, readJsonRequest, serverError
} from '../../../_utils.js';

export async function onRequestGet(context) {
  const { year, month } = context.params;
  let key;
  let empty;
  try {
    key = monthStorageKey(year, month);
    empty = ensureMonthShape(year, month);
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
    return json({ ok: true, month: stored === null ? empty : ensureMonthShape(year, month, stored) });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  const { year, month } = context.params;
  let key;
  let normalized;
  try {
    key = monthStorageKey(year, month);
    normalized = ensureMonthShape(year, month, await readJsonRequest(context.request));
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
