import { defaults, getOrDefault, json, normalizedBootstrap, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const base = defaults();
    const [settings, staff, rbnNames] = await Promise.all([
      getOrDefault(context, 'app:settings', base.settings),
      getOrDefault(context, 'app:staff', base.staff),
      getOrDefault(context, 'app:rbn-names', base.rbnNames)
    ]);
    return json({ ok: true, ...normalizedBootstrap({ settings, staff, rbnNames }) });
  } catch (error) {
    return serverError(error);
  }
}
