import { defaults, getOrInit, invalid, json, normalizeStaffList, put, readJsonRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const value = normalizeStaffList(await getOrInit(context, 'app:staff', defaults().staff));
  return json({ ok: true, staff: value });
}

export async function onRequestPut(context) {
  try {
    const payload = normalizeStaffList(await readJsonRequest(context.request), { strict: true });
    await put(context, 'app:staff', payload);
    return json({ ok: true, staff: payload });
  } catch (error) {
    return invalid(error.message);
  }
}
