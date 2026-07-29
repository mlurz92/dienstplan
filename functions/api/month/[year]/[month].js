import { ensureMonthShape, json, monthStorageKey, put, readJsonRequest, getOrInit } from '../../../../_utils.js';

export async function onRequestGet(context) {
  const { year, month } = context.params;
  const key = monthStorageKey(year, month);
  const monthData = await getOrInit(context, key, () => ensureMonthShape(year, month));
  return json({ ok: true, month: ensureMonthShape(year, month, monthData) });
}

export async function onRequestPut(context) {
  const { year, month } = context.params;
  const key = monthStorageKey(year, month);
  const payload = await readJsonRequest(context.request);
  const normalized = ensureMonthShape(year, month, payload);
  await put(context, key, normalized);
  return json({ ok: true, month: normalized });
}
