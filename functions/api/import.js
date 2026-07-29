import { json, put } from '../_utils.js';

export async function onRequestPost(context) {
  const payload = await context.request.json();
  if (payload.settings) await put(context, 'app:settings', payload.settings);
  if (payload.staff) await put(context, 'app:staff', payload.staff);
  if (payload.rbnNames) await put(context, 'app:rbn-names', payload.rbnNames);
  if (Array.isArray(payload.months)) {
    for (const [key, value] of payload.months) await put(context, `year:${key.slice(0,4)}:month:${key.slice(5,7)}`, value);
  }
  return json({ ok: true });
}
