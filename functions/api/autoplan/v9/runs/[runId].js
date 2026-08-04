function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function validRunId(value) {
  return /^[a-zA-Z0-9:_-]{8,160}$/.test(String(value || ''));
}

export async function onRequestGet(context) {
  const service = context.env?.AUTO_PLAN_V9;
  if (!service?.fetch) return response({ ok: false, error: { code: 'SOLVER_NOT_CONFIGURED', message: 'Der native Auto-Plan-v9-Solver ist nicht konfiguriert.' } }, 503);
  const runId = String(context.params?.runId || '');
  if (!validRunId(runId)) return response({ ok: false, error: { code: 'INVALID_RUN_ID', message: 'Ungültige Laufkennung.' } }, 400);
  const source = new URL(context.request.url);
  const after = Math.max(0, Math.round(Number(source.searchParams.get('after')) || 0));
  try {
    const upstream = await service.fetch(new Request(`https://autoplan.internal/v9/runs/${encodeURIComponent(runId)}?after=${after}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Trace-Id': context.request.headers.get('cf-ray') || crypto.randomUUID() }
    }));
    const headers = new Headers(upstream.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error(JSON.stringify({ route: '/api/autoplan/v9/runs/:runId', runId, name: error?.name, message: error?.message }));
    return response({ ok: false, error: { code: 'SOLVER_UNAVAILABLE', message: 'Der Solverstatus konnte nicht geladen werden.' } }, 503);
  }
}
