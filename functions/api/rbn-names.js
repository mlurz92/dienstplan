import { defaults, getOrInit, json, put, readJsonRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const value = await getOrInit(context, 'app:rbn-names', defaults().rbnNames);
  return json({ ok: true, rbnNames: value });
}

export async function onRequestPut(context) {
  const payload = await readJsonRequest(context.request);
  await put(context, 'app:rbn-names', Array.isArray(payload) ? payload : payload?.rbnNames || []);
  return json({ ok: true });
}
