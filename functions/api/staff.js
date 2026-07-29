import { defaults, getOrInit, json, put, readJsonRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const value = await getOrInit(context, 'app:staff', defaults().staff);
  return json({ ok: true, staff: value });
}

export async function onRequestPut(context) {
  const payload = await readJsonRequest(context.request);
  await put(context, 'app:staff', payload);
  return json({ ok: true });
}
