import {
  ensureMonthShape, invalid, json, monthStorageKey, put, readJsonRequest, getOrInit
} from '../../../_utils.js';

export async function onRequestGet(context) {
  try {
    const { year, month } = context.params;
    const key = monthStorageKey(year, month);
    const monthData = await getOrInit(context, key, () => ensureMonthShape(year, month));
    return json({ ok: true, month: ensureMonthShape(year, month, monthData) });
  } catch (error) {
    return invalid(error.message);
  }
}

export async function onRequestPut(context) {
  try {
    const { year, month } = context.params;
    const key = monthStorageKey(year, month);
    const payload = await readJsonRequest(context.request);
    const normalized = ensureMonthShape(year, month, payload);
    await put(context, key, normalized);
    return json({ ok: true, month: normalized });
  } catch (error) {
    return invalid(error.message);
  }
}
