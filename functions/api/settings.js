import { defaults, getOrInit, invalid, json, normalizeSettings, put, readJsonRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const value = normalizeSettings(await getOrInit(context, 'app:settings', defaults().settings));
  return json({ ok: true, settings: value });
}

export async function onRequestPut(context) {
  try {
    const payload = normalizeSettings(await readJsonRequest(context.request), { strict: true });
    await put(context, 'app:settings', payload);
    return json({ ok: true, settings: payload });
  } catch (error) {
    return invalid(error.message);
  }
}
