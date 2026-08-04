const MAX_REQUEST_BYTES = 2_000_000;

function response(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function traceId(request) {
  return request.headers.get('cf-ray') || crypto.randomUUID();
}

export async function onRequestPost(context) {
  const trace = traceId(context.request);
  const service = context.env?.AUTO_PLAN_V9;
  if (!service?.fetch) {
    return response({ ok: false, error: { code: 'SOLVER_NOT_CONFIGURED', message: 'Der native Auto-Plan-v9-Solver ist in dieser Umgebung nicht konfiguriert.', traceId: trace } }, 503);
  }
  const type = context.request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    return response({ ok: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type application/json erforderlich.', traceId: trace } }, 415);
  }
  const length = Number(context.request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    return response({ ok: false, error: { code: 'REQUEST_TOO_LARGE', message: 'Der Solver-Snapshot überschreitet die zulässige Größe.', traceId: trace } }, 413);
  }
  let body;
  try {
    const text = await context.request.text();
    if (text.length > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
    body = JSON.parse(text);
  } catch (error) {
    const code = error?.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON';
    return response({ ok: false, error: { code, message: code === 'REQUEST_TOO_LARGE' ? 'Der Solver-Snapshot überschreitet die zulässige Größe.' : 'Ungültiges JSON.', traceId: trace } }, code === 'REQUEST_TOO_LARGE' ? 413 : 400);
  }
  if (Number(body?.schemaVersion) !== 9 || !body?.requestFingerprint || !Array.isArray(body?.slots)) {
    return response({ ok: false, error: { code: 'INVALID_SCHEMA', message: 'Ungültiger Auto-Plan-v9-Snapshot.', traceId: trace } }, 400);
  }

  try {
    const upstream = await service.fetch(new Request('https://autoplan.internal/v9/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': context.request.headers.get('idempotency-key') || body.requestFingerprint,
        'X-Trace-Id': trace
      },
      body: JSON.stringify(body)
    }));
    const headers = new Headers(upstream.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Trace-Id', trace);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error(JSON.stringify({ traceId: trace, route: '/api/autoplan/v9/runs', name: error?.name, message: error?.message, stack: error?.stack }));
    return response({ ok: false, error: { code: 'SOLVER_UNAVAILABLE', message: 'Der native Solver konnte nicht erreicht werden.', traceId: trace } }, 503);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
      'Cache-Control': 'no-store'
    }
  });
}
