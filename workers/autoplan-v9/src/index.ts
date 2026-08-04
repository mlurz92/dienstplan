import { Container, getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';

interface SolverSnapshot {
  schemaVersion: number;
  requestFingerprint: string;
  baselineFingerprint: string;
  configFingerprint: string;
  rulesetVersion: string;
  config?: { timeBudgetMs?: number };
  slots: unknown[];
  [key: string]: unknown;
}

interface ProgressEvent {
  sequence?: number;
  timestamp?: string;
  stage?: string;
  phase?: string;
  status?: string;
  solverStatus?: string;
  message?: string;
  [key: string]: unknown;
}

interface RunState {
  runId: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
  sequence: number;
  requestFingerprint: string;
  baselineFingerprint: string;
  configFingerprint: string;
  rulesetVersion: string;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function safeRunId(value: string): string {
  return `v9-${value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 140)}`;
}

function pathParts(request: Request): string[] {
  return new URL(request.url).pathname.split('/').filter(Boolean);
}

function isSnapshot(value: unknown): value is SolverSnapshot {
  const snapshot = value as Partial<SolverSnapshot> | null;
  return Boolean(snapshot)
    && snapshot?.schemaVersion === 9
    && typeof snapshot.requestFingerprint === 'string'
    && typeof snapshot.baselineFingerprint === 'string'
    && typeof snapshot.configFingerprint === 'string'
    && typeof snapshot.rulesetVersion === 'string'
    && Array.isArray(snapshot.slots);
}

export class AutoPlanContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
  enableInternet = false;
  pingEndpoint = 'http://localhost:8080/health';

  override onStart(): void {
    console.log(JSON.stringify({ event: 'container-start', service: 'autoplan-v9' }));
  }

  override onStop(): void {
    console.log(JSON.stringify({ event: 'container-stop', service: 'autoplan-v9' }));
  }

  override onError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: 'container-error', service: 'autoplan-v9', message }));
  }
}

export class AutoPlanJob extends DurableObject<Env> {
  private initialized: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initialized = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS run_events (
          sequence INTEGER PRIMARY KEY,
          created_at TEXT NOT NULL,
          payload TEXT NOT NULL
        );
      `);
    });
  }

  private async state(): Promise<RunState | null> {
    await this.initialized;
    return (await this.ctx.storage.get<RunState>('state')) ?? null;
  }

  private async putState(state: RunState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await this.ctx.storage.put('state', state);
  }

  private async appendEvent(event: ProgressEvent): Promise<ProgressEvent> {
    const current = await this.state();
    if (!current) throw new Error('Run state missing.');
    const next = current.sequence + 1;
    const payload: ProgressEvent = {
      ...event,
      sequence: next,
      timestamp: event.timestamp || new Date().toISOString()
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO run_events(sequence, created_at, payload) VALUES (?, ?, ?)',
      next,
      String(payload.timestamp),
      JSON.stringify(payload)
    );
    current.sequence = next;
    await this.putState(current);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify(payload)); } catch { /* disconnected */ }
    }
    return payload;
  }

  private eventsAfter(sequence: number): ProgressEvent[] {
    const rows = this.ctx.storage.sql.exec<{ payload: string }>(
      'SELECT payload FROM run_events WHERE sequence > ? ORDER BY sequence ASC LIMIT 200',
      sequence
    ).toArray();
    return rows.flatMap(row => {
      try { return [JSON.parse(row.payload) as ProgressEvent]; } catch { return []; }
    });
  }

  private async start(snapshot: SolverSnapshot): Promise<Response> {
    await this.initialized;
    const existing = await this.state();
    if (existing) {
      const result = await this.ctx.storage.get<unknown>('result');
      return json({ ok: true, runId: existing.runId, status: existing.status, sequence: existing.sequence, ...(result ? { result } : {}) }, result ? 200 : 202);
    }
    const runId = safeRunId(snapshot.requestFingerprint);
    const now = new Date().toISOString();
    const state: RunState = {
      runId,
      status: 'created',
      sequence: 0,
      requestFingerprint: snapshot.requestFingerprint,
      baselineFingerprint: snapshot.baselineFingerprint,
      configFingerprint: snapshot.configFingerprint,
      rulesetVersion: snapshot.rulesetVersion,
      createdAt: now,
      updatedAt: now
    };
    await this.ctx.storage.put('snapshot', snapshot);
    await this.putState(state);
    await this.appendEvent({ stage: 'snapshot', phase: 'analysis', status: 'created', message: 'Versionierter Solver-Snapshot gespeichert.' });
    this.ctx.waitUntil(this.execute(snapshot));
    return json({ ok: true, runId, status: 'running', sequence: 1 }, 202);
  }

  private async execute(snapshot: SolverSnapshot): Promise<void> {
    const state = await this.state();
    if (!state || state.status === 'cancelled' || state.status === 'completed') return;
    state.status = 'running';
    await this.putState(state);
    await this.appendEvent({ stage: 'compile', phase: 'analysis', status: 'running', message: 'Container und CP-SAT-Modell werden vorbereitet.' });

    const containerKey = `solver-${snapshot.requestFingerprint.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    try {
      const container = getContainer(this.env.AUTO_PLAN_CONTAINER, containerKey);
      const response = await container.fetch(new Request('http://container/solve-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
          'X-Run-Id': state.runId,
          'X-Timeout-Seconds': this.env.SOLVER_TIMEOUT_SECONDS || '900'
        },
        body: JSON.stringify(snapshot)
      }));
      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || `Container HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const currentState = await this.state();
        if (currentState?.status === 'cancelled') {
          await container.fetch(new Request('http://container/cancel', {
            method: 'POST',
            headers: { 'X-Run-Id': currentState.runId }
          })).catch(() => undefined);
          return;
        }
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as { type?: string; event?: ProgressEvent; result?: unknown; error?: string };
          if (message.type === 'event' && message.event) await this.appendEvent(message.event);
          if (message.type === 'result' && message.result) {
            await this.ctx.storage.put('result', message.result);
            const completed = await this.state();
            if (completed) {
              completed.status = 'completed';
              await this.putState(completed);
              await this.appendEvent({ stage: 'audit', phase: 'complete', status: 'completed', message: 'Solverergebnis vollständig gespeichert.' });
            }
          }
          if (message.type === 'error') throw new Error(message.error || 'Container meldete einen Fehler.');
        }
        if (done) break;
      }
      const finalState = await this.state();
      const result = await this.ctx.storage.get('result');
      if (finalState && finalState.status === 'running' && !result) throw new Error('Containerstream endete ohne Ergebnis.');
    } catch (error) {
      const failed = await this.state();
      if (!failed || failed.status === 'cancelled') return;
      failed.status = 'failed';
      failed.error = {
        code: 'SOLVER_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : String(error)
      };
      await this.putState(failed);
      await this.appendEvent({ stage: 'explain', phase: 'blocked', status: 'failed', message: 'Nativer Solverlauf fehlgeschlagen.' });
      console.error(JSON.stringify({ event: 'solver-run-failed', runId: failed.runId, message: failed.error.message }));
    }
  }

  private async status(request: Request): Promise<Response> {
    const state = await this.state();
    if (!state) return json({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'Lauf nicht gefunden.' } }, 404);
    const after = Math.max(0, Math.round(Number(new URL(request.url).searchParams.get('after')) || 0));
    const result = state.status === 'completed' ? await this.ctx.storage.get<unknown>('result') : undefined;
    return json({ ok: true, ...state, events: this.eventsAfter(after), ...(result ? { result } : {}) });
  }

  private async cancel(): Promise<Response> {
    const state = await this.state();
    if (!state) return json({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'Lauf nicht gefunden.' } }, 404);
    if (state.status === 'completed' || state.status === 'failed') return json({ ok: true, runId: state.runId, status: state.status });
    state.status = 'cancelled';
    await this.putState(state);
    await this.appendEvent({ stage: 'explain', phase: 'blocked', status: 'cancelled', message: 'Lauf kontrolliert abgebrochen.' });
    return json({ ok: true, runId: state.runId, status: 'cancelled' });
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized;
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectedAt: new Date().toISOString() });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith('/start') && request.method === 'POST') {
      const snapshot = await request.json<unknown>();
      if (!isSnapshot(snapshot)) return json({ ok: false, error: { code: 'INVALID_SCHEMA', message: 'Ungültiger v9-Snapshot.' } }, 400);
      return this.start(snapshot);
    }
    if (url.pathname.endsWith('/status') && request.method === 'GET') return this.status(request);
    if (url.pathname.endsWith('/cancel') && request.method === 'POST') return this.cancel();
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter Jobendpunkt.' } }, 404);
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message === 'ping') socket.send('pong');
  }

  webSocketClose(): void { /* Hibernation lifecycle handled by the platform. */ }
  webSocketError(): void { /* The next poll or reconnect restores state. */ }
}

async function routeToJob(env: Env, runId: string, path: 'start' | 'status' | 'cancel', request: Request, body?: string): Promise<Response> {
  const id = env.AUTO_PLAN_JOBS.idFromName(runId);
  const stub = env.AUTO_PLAN_JOBS.get(id);
  const source = new URL(request.url);
  const suffix = path === 'status' ? `?after=${Math.max(0, Math.round(Number(source.searchParams.get('after')) || 0))}` : '';
  return stub.fetch(new Request(`https://job.internal/${path}${suffix}`, {
    method: path === 'status' ? 'GET' : 'POST',
    headers: request.headers,
    body: path === 'start' ? body : undefined
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = pathParts(request);
    if (parts[0] !== 'v9' || parts[1] !== 'runs') return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter Solverendpunkt.' } }, 404);

    if (parts.length === 2 && request.method === 'POST') {
      const body = await request.text();
      let snapshot: unknown;
      try { snapshot = JSON.parse(body); } catch { return json({ ok: false, error: { code: 'INVALID_JSON', message: 'Ungültiges JSON.' } }, 400); }
      if (!isSnapshot(snapshot)) return json({ ok: false, error: { code: 'INVALID_SCHEMA', message: 'Ungültiger Auto-Plan-v9-Snapshot.' } }, 400);
      const runId = safeRunId(snapshot.requestFingerprint);
      return routeToJob(env, runId, 'start', request, body);
    }

    const runId = parts[2] || '';
    if (!/^v9-[a-zA-Z0-9_-]{4,150}$/.test(runId)) return json({ ok: false, error: { code: 'INVALID_RUN_ID', message: 'Ungültige Laufkennung.' } }, 400);
    if (parts.length === 3 && request.method === 'GET') return routeToJob(env, runId, 'status', request);
    if (parts.length === 4 && parts[3] === 'cancel' && request.method === 'POST') return routeToJob(env, runId, 'cancel', request);
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter Solverendpunkt.' } }, 404);
  }
} satisfies ExportedHandler<Env>;
