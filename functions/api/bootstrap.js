import { defaults, getOrInit, json, normalizedBootstrap } from '../_utils.js';

export async function onRequestGet(context) {
  const base = defaults();
  const [settings, staff, rbnNames] = await Promise.all([
    getOrInit(context, 'app:settings', base.settings),
    getOrInit(context, 'app:staff', base.staff),
    getOrInit(context, 'app:rbn-names', base.rbnNames)
  ]);
  return json({ ok: true, ...normalizedBootstrap({ settings, staff, rbnNames }) });
}
