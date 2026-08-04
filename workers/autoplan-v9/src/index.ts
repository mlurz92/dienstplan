import { Container, getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';

interface SolverSnapshot {
  schemaVersion: 9;
  requestFingerprint: string;
  baselineFingerprint: string;
  configFingerprint: string;
  rulesetVersion: string;
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

type RunStatus = 'created' | 'running' | 'completed' | 'failed' | 'cancelled';

interface RunState {
  runId: string;
  status: RunStatus;
  sequence: number;
  requestFingerprint: string;
  baselineFingerprint: string;
  configFingerprint: string;
  rulesetVersion: string;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

interface StreamMessage {
  type?: 'event' | 'result' | 'error';
  event?: ProgressEvent;
  result?: unknown;
  error?: string;
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

function solverContainerKey(requestFingerprint: string): string {
  return `solver-${requestFingerprint.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
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

export class AutoPlanContainer extends Container<Env> {
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
  private readonly initialized: Promise<void>;
  private execution: Promise<void> | null = null;

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

  private async runState(): Promise<RunState | null> {
    await this.initialized;
    return (await this.ctx.storage.get<RunState>('state')) ?? null;
  }

  private async putState(state: RunState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await this.ctx.storage.put('state', state);
  }

  private async appendEvent(event: ProgressEvent): Promise<ProgressEvent> {
    const current = await this.runState();
    if (!current) throw new Error('Run state missing.');
    const sequence = current.sequence + 1;
    const payload: ProgressEvent = {
      ...event,
      sequence,
      timestamp: event.timestamp || new Date().toISOString()
    };
    this.ctx.storage.sql.exec(
      'INSERT INTO run_events(sequence, created_at, payload) VALUES (?, ?, ?)',
      sequence,
      String(payload.timestamp),
      JSON.stringify(payload)
    );
    current.sequence = sequence;
    await this.putState(current);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify(payload)); } catch { /* disconnected */ }
    }
    return payload;
  }

  private eventsAfter(sequence: number): ProgressEvent[] {
    return this.ctx.storage.sql.exec<{ payload: string }>(
      'SELECT payload FROM run_events WHERE sequence > ? ORDER BY sequence ASC LIMIT 200',
      sequence
    ).toArray().flatMap(row => {
      try { return [JSON.parse(row.payload) as ProgressEvent]; }
      catch { return []; }
    });
  }

  private ensureExecution(snapshot: SolverSnapshot): void {
    if (this.execution) return;
    this.execution = this.execute(snapshot)
      .catch(error => console.error(JSON.stringify({
        event: 'solver-controller-unhandled',
        requestFingerprint: snapshot.requestFingerprint,
        message: error instanceof Error ? error.message : String(error)
      })))
      .finally(() => { this.execution = null; });
  }

  private async start(snapshot: SolverSnapshot): Promise<Response> {
    await this.initialized;
    const existing = await this.runState();
    if (existing) {
      const result = await this.ctx.storage.get<unknown>('result');
      if (result === undefined && (existing.status === 'created' || existing.status === 'running')) {
        const storedSnapshot = await this.ctx.storage.get<SolverSnapshot>('snapshot');
        if (storedSnapshot && isSnapshot(storedSnapshot)) this.ensureExecution(storedSnapshot);
      }
      return json({
        ok: true,
        runId: existing.runId,
        status: existing.status,
        sequence: existing.sequence,
        ...(result === undefined ? {} : { result })
      }, result === undefined ? 202 : 200);
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
    await this.appendEvent({
      stage: 'snapshot',
      phase: 'analysis',
      status: 'created',
      message: 'Versionierter Solver-Snapshot gespeichert.'
    });
    this.ensureExecution(snapshot);
    return json({ ok: true, runId, status: 'running', sequence: 1 }, 202);
  }

  private async execute(snapshot: SolverSnapshot): Promise<void> {
    const state = await this.runState();
    if (!state || state.status === 'cancelled' || state.status === 'completed') return;
    state.status = 'running';
    await this.putState(state);
    await this.appendEvent({
      stage: 'compile',
      phase: 'analysis',
      status: 'running',
      message: 'Container und CP-SAT-Modell werden vorbereitet.'
    });

    const containerKey = solverContainerKey(snapshot.requestFingerprint);
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
        throw new Error((await response.text()) || `Container HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const current = await this.runState();
        if (current?.status === 'cancelled') {
          await container.fetch(new Request('http://container/cancel', {
            method: 'POST',
            headers: { 'X-Run-Id': current.runId }
          })).catch(() => undefined);
          return;
        }
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as StreamMessage;
          if (message.type === 'event' && message.event) await this.appendEvent(message.event);
          if (message.type === 'result' && message.result !== undefined) {
            await this.ctx.storage.put('result', message.result);
            const completed = await this.runState();
            if (completed) {
              completed.status = 'completed';
              await this.putState(completed);
              await this.appendEvent({
                stage: 'audit',
                phase: 'complete',
                status: 'completed',
                message: 'Solverergebnis vollständig gespeichert.'
              });
            }
          }
          if (message.type === 'error') throw new Error(message.error || 'Container meldete einen Fehler.');
        }
        if (done) break;
      }

      const finalState = await this.runState();
      const result = await this.ctx.storage.get<unknown>('result');
      if (finalState?.status === 'running' && result === undefined) {
        throw new Error('Containerstream endete ohne Ergebnis.');
      }
    } catch (error) {
      const failed = await this.runState();
      if (!failed || failed.status === 'cancelled') return;
      failed.status = 'failed';
      failed.error = {
        code: 'SOLVER_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : String(error)
      };
      await this.putState(failed);
      await this.appendEvent({
        stage: 'explain',
        phase: 'blocked',
        status: 'failed',
        message: 'Nativer Solverlauf fehlgeschlagen.'
      });
      console.error(JSON.stringify({
        event: 'solver-run-failed',
        runId: failed.runId,
        message: failed.error.message
      }));
    }
  }

  private async status(request: Request): Promise<Response> {
    const state = await this.runState();
    if (!state) return json({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'Lauf nicht gefunden.' } }, 404);
    if (state.status === 'created' || state.status === 'running') {
      const snapshot = await this.ctx.storage.get<SolverSnapshot>('snapshot');
      if (snapshot && isSnapshot(snapshot)) this.ensureExecution(snapshot);
    }
    const after = Math.max(0, Math.round(Number(new URL(request.url).searchParams.get('after')) || 0));
    const result = state.status === 'completed'
      ? await this.ctx.storage.get<unknown>('result')
      : undefined;
    return json({
      ok: true,
      ...state,
      events: this.eventsAfter(after),
      ...(result === undefined ? {} : { result })
    });
  }

  private async cancel(): Promise<Response> {
    const state = await this.runState();
    if (!state) return json({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'Lauf nicht gefunden.' } }, 404);
    if (state.status === 'completed' || state.status === 'failed') {
      return json({ ok: true, runId: state.runId, status: state.status });
    }
    state.status = 'cancelled';
    await this.putState(state);
    const container = getContainer(this.env.AUTO_PLAN_CONTAINER, solverContainerKey(state.requestFingerprint));
    await container.fetch(new Request('http://container/cancel', {
      method: 'POST', headers: { 'X-Run-Id': state.runId }
    })).catch(() => undefined);
    await this.appendEvent({
      stage: 'explain',
      phase: 'blocked',
      status: 'cancelled',
      message: 'Lauf kontrolliert abgebrochen.'
    });
    return json({ ok: true, runId: state.runId, status: 'cancelled' });
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized;
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectedAt: new Date().toISOString() });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith('/start') && request.method === 'POST') {
      const snapshot = await request.json<unknown>();
      if (!isSnapshot(snapshot)) {
        return json({ ok: false, error: { code: 'INVALID_SCHEMA', message: 'Ungültiger v9-Snapshot.' } }, 400);
      }
      return this.start(snapshot);
    }
    if (url.pathname.endsWith('/status') && request.method === 'GET') return this.status(request);
    if (url.pathname.endsWith('/cancel') && request.method === 'POST') return this.cancel();
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter Jobendpunkt.' } }, 404);
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message === 'ping') socket.send('pong');
  }

  webSocketClose(): void { /* Hibernation state persists in SQLite. */ }
  webSocketError(): void { /* Polling or reconnect restores persisted state. */ }
}

async function routeToJob(
  env: Env,
  runId: string,
  path: 'start' | 'status' | 'cancel',
  request: Request,
  body?: string
): Promise<Response> {
  const stub = env.AUTO_PLAN_JOBS.get(env.AUTO_PLAN_JOBS.idFromName(runId));
  const source = new URL(request.url);
  const suffix = path === 'status'
    ? `?after=${Math.max(0, Math.round(Number(source.searchParams.get('after')) || 0))}`
    : '';
  const init: RequestInit = {
    method: path === 'status' ? 'GET' : 'POST',
    headers: request.headers
  };
  if (path === 'start' && body !== undefined) init.body = body;
  return stub.fetch(new Request(`https://job.internal/${path}${suffix}`, init));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = pathParts(request);
    if (parts[0] !== 'v9' || parts[1] !== 'runs') {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter Solverendpunkt.' } }, 404);
    }

    if (parts.length === 2 && request.method === 'POST') {
      const body = await request.text();
      let snapshot: unknown;
      try { snapshot = JSON.parse(body); }
      catch { return json({ ok: false, error: { code: 'INVALID_JSON', message: 'Ungültiges JSON.' } }, 400); }
      if (!isSnapshot(snapshot)) {
        return json({ ok: false, error: { code: 'INVALID_SCHEMA', message: 'Ungültiger Auto-Plan-v9-Snapshot.' } }, 400);
      }
      const runId = safeRunId(snapshot.requestFingerprint);
      return routeToJob(env, runId, 'start', request, body);
    }

    const runId = parts[2] || '';
    if (!/^v9-[a-zA-Z0-9_-]{4,150}$/.test(runId)) {
      return json({ ok: false, error: { code: 'INVALID_RUN_ID', message: 'Ungültige Laufkennung.' } }, 400);
    }
    if (parts.length === 3 && request.method === 'GET') {
      return routeToJob(env, runId, 'status', request);
    }
    if (parts.length === 4 && parts[3] === 'cancel' && request.method === 'POST') {
      return routeToJob(env, runId, 'cancel', request);
    }
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter Solverendpunkt.' } }, 404);
  }
} satisfies ExportedHandler<Env>;
