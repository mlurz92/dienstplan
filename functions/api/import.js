import { invalid, json, kv, normalizeBackupPayload, serverError } from '../_utils.js';

async function rollback(store, snapshots, writtenKeys) {
  const failures = [];
  for (const key of [...writtenKeys].reverse()) {
    try {
      const previous = snapshots.get(key);
      if (previous === null) await store.delete(key);
      else await store.put(key, previous);
    } catch (error) {
      failures.push(`${key}: ${error.message}`);
    }
  }
  return failures;
}

export async function onRequestPost(context) {
  let payload;
  try {
    payload = normalizeBackupPayload(await context.request.json(), { strict: true });
  } catch (error) {
    return invalid(error.message || 'Ungültiges JSON.');
  }

  const writes = [];
  if ('settings' in payload) writes.push(['app:settings', payload.settings]);
  if ('staff' in payload) writes.push(['app:staff', payload.staff]);
  if ('rbnNames' in payload) writes.push(['app:rbn-names', payload.rbnNames]);
  for (const [key, value] of payload.months || []) writes.push([`year:${key.slice(0, 4)}:month:${key.slice(5, 7)}`, value]);

  let store;
  const snapshots = new Map();
  try {
    store = kv(context);
    for (const [key] of writes) snapshots.set(key, await store.get(key));
  } catch (error) {
    return serverError(error);
  }

  const writtenKeys = [];
  try {
    for (const [key, value] of writes) {
      await store.put(key, JSON.stringify(value));
      writtenKeys.push(key);
    }
  } catch (error) {
    const rollbackFailures = await rollback(store, snapshots, writtenKeys);
    return json({
      ok: false,
      error: rollbackFailures.length
        ? `Serverimport fehlgeschlagen; Rücksetzung unvollständig: ${rollbackFailures.join(' | ')}`
        : `Serverimport fehlgeschlagen und wurde vollständig zurückgerollt: ${error.message}`
    }, 500);
  }

  return json({ ok: true, importedMonths: payload.months?.length || 0 });
}
