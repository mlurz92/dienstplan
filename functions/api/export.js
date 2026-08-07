import { defaults, ensureMonthShape, getOrDefault, json, kv, normalizedBootstrap, serverError } from '../_utils.js';

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
  try {
    const base = defaults();
    const [settings, staff, rbnNames] = await Promise.all([
      getOrDefault(context, 'app:settings', base.settings),
      getOrDefault(context, 'app:staff', base.staff),
      getOrDefault(context, 'app:rbn-names', base.rbnNames)
    ]);
    const store = kv(context);
    const keys = await listAllMonthKeys(store);
    const values = await Promise.all(keys.map(key => store.get(key, 'json')));
    const months = [];
    keys.forEach((key, index) => {
      const value = values[index];
      if (!value) return;
      const match = /^year:(\d{4}):month:(\d{2})$/.exec(key);
      if (!match) return;
      const year = Number(match[1]);
      const month = Number(match[2]);
      // Ein beschädigter oder außerhalb des Bereichs liegender Monatsschlüssel
      // darf die Sicherung aller übrigen Monate nicht verhindern.
      try {
        months.push([`${match[1]}-${match[2]}`, ensureMonthShape(year, month, value)]);
      } catch {
        /* Monat überspringen, Rest der Sicherung bleibt erhalten */
      }
    });
    return json({ ok: true, ...normalizedBootstrap({ settings, staff, rbnNames }), months });
  } catch (error) {
    return serverError(error);
  }
}
