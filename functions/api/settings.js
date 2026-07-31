import { defaults, getOrInit, invalid, json, normalizeSettings, put, readJsonRequest, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeSettings(await getOrInit(context, 'app:settings', defaults().settings));
    return json({ ok: true, settings: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let payload;
  try { payload = normalizeSettings(await readJsonRequest(context.request), { strict: true }); }
  catch (error) { return invalid(error.message); }
  try {
    await put(context, 'app:settings', payload);
    return json({ ok: true, settings: payload });
  } catch (error) {
    return serverError(error);
  }
}
