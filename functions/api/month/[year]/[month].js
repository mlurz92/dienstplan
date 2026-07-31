import {
  ensureMonthShape, invalid, json, monthStorageKey, put, readJsonRequest, getOrInit, serverError
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
    const monthData = await getOrInit(context, key, empty);
    return json({ ok: true, month: ensureMonthShape(year, month, monthData) });
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
