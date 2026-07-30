import { defaults, ensureMonthShape, getOrInit, json, normalizedBootstrap } from '../_utils.js';

async function listAllMonthKeys(store) {
  const keys = [];
  let cursor;
  do {
    const options = { prefix: 'year:' };
    if (cursor) options.cursor = cursor;
    const page = await store.list(options);
    keys.push(...page.keys.map(item => item.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys.filter(key => /^year:\d{4}:month:(0[1-9]|1[0-2])$/.test(key)).sort();
}

export async function onRequestGet(context) {
  const base = defaults();
  const [settings, staff, rbnNames] = await Promise.all([
    getOrInit(context, 'app:settings', base.settings),
    getOrInit(context, 'app:staff', base.staff),
    getOrInit(context, 'app:rbn-names', base.rbnNames)
  ]);
  const store = context.env.DIENSTPLAN_KV;
  const keys = await listAllMonthKeys(store);
  const values = await Promise.all(keys.map(key => store.get(key, 'json')));
  const months = [];
  keys.forEach((key, index) => {
    const value = values[index];
    if (!value) return;
    const match = /^year:(\d{4}):month:(\d{2})$/.exec(key);
    const year = Number(match[1]);
    const month = Number(match[2]);
    months.push([`${match[1]}-${match[2]}`, ensureMonthShape(year, month, value)]);
  });
  return json({ ok: true, ...normalizedBootstrap({ settings, staff, rbnNames }), months });
}
