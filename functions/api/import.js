import { ensureMonthShape, json, put } from '../_utils.js';

const isPlainRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const invalid = message => json({ ok: false, error: message }, 400);

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return invalid('Ungültiges JSON.');
  }

  if (!isPlainRecord(payload)) return invalid('Die Wurzel muss ein JSON-Objekt sein.');
  if ('settings' in payload && !isPlainRecord(payload.settings)) return invalid('„settings“ muss ein JSON-Objekt sein.');
  if ('staff' in payload && !Array.isArray(payload.staff)) return invalid('„staff“ muss ein Array sein.');
  if ('rbnNames' in payload && !Array.isArray(payload.rbnNames)) return invalid('„rbnNames“ muss ein Array sein.');
  if ('months' in payload && !Array.isArray(payload.months)) return invalid('„months“ muss ein Array sein.');

  const normalizedMonths = [];
  for (const entry of payload.months || []) {
    if (!Array.isArray(entry) || entry.length !== 2 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(entry[0]) || !isPlainRecord(entry[1])) {
      return invalid('Jeder Monat muss als [„YYYY-MM“, Monatsobjekt] vorliegen.');
    }
    const [year, month] = entry[0].split('-').map(Number);
    normalizedMonths.push([entry[0], ensureMonthShape(year, month, entry[1])]);
  }

  // Erst nach vollständig erfolgreicher Prüfung beginnen Schreibzugriffe.
  if ('settings' in payload) await put(context, 'app:settings', payload.settings);
  if ('staff' in payload) await put(context, 'app:staff', payload.staff);
  if ('rbnNames' in payload) await put(context, 'app:rbn-names', payload.rbnNames);
  for (const [key, value] of normalizedMonths) {
    await put(context, `year:${key.slice(0,4)}:month:${key.slice(5,7)}`, value);
  }

  return json({ ok: true, importedMonths: normalizedMonths.length });
}
