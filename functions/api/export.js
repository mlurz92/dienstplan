import { defaults, ensureMonthShape, getOrInit, json, monthStorageKey } from '../_utils.js';

export async function onRequestGet(context) {
  const base = defaults();
  const [settings, staff, rbnNames] = await Promise.all([
    getOrInit(context, 'app:settings', base.settings),
    getOrInit(context, 'app:staff', base.staff),
    getOrInit(context, 'app:rbn-names', base.rbnNames)
  ]);
  const months = [];
  for (let year = 2025; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) {
      const key = monthStorageKey(year, month);
      const value = await context.env.DIENSTPLAN_KV.get(key, 'json');
      if (value) months.push([`${year}-${String(month).padStart(2,'0')}`, ensureMonthShape(year, month, value)]);
    }
  }
  return json({ ok: true, settings, staff, rbnNames, months });
}
