import {
  ensureMonthShape, invalid, json, kv, monthStorageKey, put, readJsonRequest, serverError
} from '../../../_utils.js';

function monthService(context) {
  return context.env?.MONTH_STATE || null;
}

async function responseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`MonthState lieferte ungültiges JSON (HTTP ${response.status}).`); }
}

async function fingerprint(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function serviceUrl(year, month, suffix = '') {
  return `https://month-state.internal/v1/months/${year}/${String(month).padStart(2, '0')}${suffix}`;
}

async function kvSeed(context, key, year, month, empty) {
  const stored = await kv(context).get(key, 'json');
  return stored === null ? empty : ensureMonthShape(year, month, stored);
}

async function initializeService(context, key, year, month, empty) {
  const service = monthService(context);
  const seed = await kvSeed(context, key, year, month, empty);
  const response = await service.fetch(serviceUrl(year, month, '/init'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ month: seed, fingerprint: await fingerprint(seed) })
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(body?.error?.message || `MonthState-Initialisierung HTTP ${response.status}`);
  return ensureMonthShape(year, month, body.month);
}

async function readStrongMonth(context, key, year, month, empty) {
  const service = monthService(context);
  const response = await service.fetch(serviceUrl(year, month), {
    method: 'GET', headers: { Accept: 'application/json' }
  });
  if (response.status === 404) return initializeService(context, key, year, month, empty);
  const body = await responseJson(response);
  if (!response.ok) throw new Error(body?.error?.message || `MonthState-Lesen HTTP ${response.status}`);
  return ensureMonthShape(year, month, body.month);
}

export async function onRequestGet(context) {
  const { year, month } = context.params;
  let key;
  let empty;
  try {
    key = monthStorageKey(year, month);
    empty = ensureMonthShape(year, month);
  } catch (error) {
    return invalid(error.message);
  }
  try {
    if (monthService(context)) {
      return json({ ok: true, month: await readStrongMonth(context, key, year, month, empty), consistency: 'strong' });
    }
    const stored = await kv(context).get(key, 'json');
    return json({
      ok: true,
      month: stored === null ? empty : ensureMonthShape(year, month, stored),
      consistency: 'eventual-fallback'
    });
  } catch (error) {
    return serverError(error, { route: '/api/month/:year/:month', method: 'GET' });
  }
}

export async function onRequestPut(context) {
  const { year, month } = context.params;
  let key;
  let normalized;
  try {
    key = monthStorageKey(year, month);
    normalized = ensureMonthShape(year, month, await readJsonRequest(context.request));
  } catch (error) {
    return invalid(error.message);
  }
  try {
    const service = monthService(context);
    if (!service) {
      await put(context, key, normalized);
      return json({ ok: true, month: normalized, consistency: 'eventual-fallback' });
    }

    const empty = ensureMonthShape(year, month);
    const currentResponse = await service.fetch(serviceUrl(year, month), {
      method: 'GET', headers: { Accept: 'application/json' }
    });
    if (currentResponse.status === 404) await initializeService(context, key, year, month, empty);
    else if (!currentResponse.ok) {
      const currentBody = await responseJson(currentResponse);
      throw new Error(currentBody?.error?.message || `MonthState-Lesen HTTP ${currentResponse.status}`);
    }

    const expectedRevision = Math.max(0, Math.round(Number(normalized.revision) || 0) - 1);
    const contentFingerprint = await fingerprint(normalized);
    const mutationId = context.request.headers.get('Idempotency-Key')
      || `month-${year}-${month}-r${expectedRevision}-${contentFingerprint}`;
    const response = await service.fetch(serviceUrl(year, month), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        month: normalized,
        expectedRevision,
        mutationId: mutationId.slice(0, 180),
        fingerprint: contentFingerprint
      })
    });
    const body = await responseJson(response);
    if (response.status === 409) return json(body, 409);
    if (!response.ok) throw new Error(body?.error?.message || `MonthState-Schreiben HTTP ${response.status}`);
    const saved = ensureMonthShape(year, month, body.month);
    // KV is a migration/export mirror only. Failure here must not invalidate an
    // already committed strongly consistent Durable-Object transaction.
    await put(context, key, saved).catch(error => console.error(JSON.stringify({
      event: 'month-kv-mirror-failed', year: Number(year), month: Number(month), message: error?.message || String(error)
    })));
    return json({ ok: true, month: saved, consistency: 'strong', status: body.status });
  } catch (error) {
    return serverError(error, { route: '/api/month/:year/:month', method: 'PUT' });
  }
}
