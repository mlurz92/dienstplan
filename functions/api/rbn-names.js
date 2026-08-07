import { defaults, getOrDefault, invalid, json, normalizeRbnNames, put, readJsonRequest, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeRbnNames(await getOrDefault(context, 'app:rbn-names', defaults().rbnNames));
    return json({ ok: true, rbnNames: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let payload;
  try {
    const raw = await readJsonRequest(context.request);
    payload = normalizeRbnNames(Array.isArray(raw) ? raw : raw?.rbnNames, { strict: true });
  } catch (error) {
    return invalid(error.message);
  }
  try {
    await put(context, 'app:rbn-names', payload);
    return json({ ok: true, rbnNames: payload });
  } catch (error) {
    return serverError(error);
  }
}
