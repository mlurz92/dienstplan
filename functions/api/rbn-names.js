import { defaults, getOrInit, invalid, json, normalizeRbnNames, put, readJsonRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const value = normalizeRbnNames(await getOrInit(context, 'app:rbn-names', defaults().rbnNames));
  return json({ ok: true, rbnNames: value });
}

export async function onRequestPut(context) {
  try {
    const raw = await readJsonRequest(context.request);
    const payload = normalizeRbnNames(Array.isArray(raw) ? raw : raw?.rbnNames, { strict: true });
    await put(context, 'app:rbn-names', payload);
    return json({ ok: true, rbnNames: payload });
  } catch (error) {
    return invalid(error.message);
  }
}
