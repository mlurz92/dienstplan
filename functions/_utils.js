import {
  DEFAULT_SETTINGS, DEFAULT_STAFF, normalizeBackupPayload, normalizeMonthData,
  normalizeRbnNames, normalizeSettings, normalizeStaffList
} from '../js/defaults.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export function invalid(message) {
  return json({ ok: false, error: message }, 400);
}

export function serverError(error) {
  return json({ ok: false, error: error?.message || 'Interner Serverfehler' }, 500);
}

export async function readJsonRequest(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Ungültiges JSON.');
  }
}

export function kv(context) {
  const store = context.env?.DIENSTPLAN_KV;
  if (!store) throw new Error('KV Binding DIENSTPLAN_KV nicht vorhanden');
  return store;
}

export async function getOrInit(context, key, fallbackFactory) {
  const store = kv(context);
  const value = await store.get(key, 'json');
  if (value !== null) return value;
  const fallback = typeof fallbackFactory === 'function' ? fallbackFactory() : fallbackFactory;
  await store.put(key, JSON.stringify(fallback));
  return fallback;
}

export async function put(context, key, value) {
  return kv(context).put(key, JSON.stringify(value));
}

export function defaults() {
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    staff: structuredClone(DEFAULT_STAFF),
    rbnNames: []
  };
}

export function normalizedBootstrap({ settings, staff, rbnNames }) {
  return {
    settings: normalizeSettings(settings),
    staff: normalizeStaffList(staff),
    rbnNames: normalizeRbnNames(rbnNames)
  };
}

export function monthStorageKey(year, month) {
  return `year:${year}:month:${String(month).padStart(2, '0')}`;
}

export function assertYearMonth(year, month) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) throw new Error('Jahr außerhalb des unterstützten Bereichs 2000–2200.');
  if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) throw new Error('Monat muss zwischen 1 und 12 liegen.');
  return { year: numericYear, month: numericMonth };
}

export function ensureMonthShape(year, month, payload) {
  const valid = assertYearMonth(year, month);
  return normalizeMonthData(valid.year, valid.month, payload);
}

export { normalizeBackupPayload, normalizeRbnNames, normalizeSettings, normalizeStaffList };
