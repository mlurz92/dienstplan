import { defaults, getOrDefault, invalid, json, normalizeStaffList, put, readJsonRequest, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeStaffList(await getOrDefault(context, 'app:staff', defaults().staff));
    return json({ ok: true, staff: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let payload;
  try { payload = normalizeStaffList(await readJsonRequest(context.request), { strict: true }); }
  catch (error) { return invalid(error.message); }
  try {
    await put(context, 'app:staff', payload);
    return json({ ok: true, staff: payload });
  } catch (error) {
    return serverError(error);
  }
}
