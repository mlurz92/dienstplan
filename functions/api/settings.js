import { defaults, getOrInit, json, put, readJsonRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const value = await getOrInit(context, 'app:settings', defaults().settings);
  return json({ ok: true, settings: value });
}

export async function onRequestPut(context) {
  const payload = await readJsonRequest(context.request);
  await put(context, 'app:settings', payload);
  return json({ ok: true });
}
