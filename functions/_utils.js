import { DEFAULT_SETTINGS, DEFAULT_STAFF, createEmptyMonth } from '../js/defaults.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export function readJsonRequest(request) {
  return request.json();
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
  return { settings: structuredClone(DEFAULT_SETTINGS), staff: structuredClone(DEFAULT_STAFF), rbnNames: [] };
}

export function monthStorageKey(year, month) {
  return `year:${year}:month:${String(month).padStart(2, '0')}`;
}

export function ensureMonthShape(year, month, payload) {
  const base = createEmptyMonth(Number(year), Number(month));
  return { ...base, ...(payload || {}), days: { ...base.days, ...(payload?.days || {}) } };
}
