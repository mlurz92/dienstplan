import { DurableObject } from 'cloudflare:workers';

interface MonthPayload {
  year: number;
  month: number;
  revision?: number;
  updatedAt?: string | null;
  days: Record<string, unknown>;
  [key: string]: unknown;
}

interface StoredMonthRow {
  revision: number;
  content_json: string;
  fingerprint: string;
  updated_at: string;
}

interface WriteRequest {
  month: MonthPayload;
  expectedRevision: number;
  mutationId: string;
  fingerprint: string;
}

interface WriteOutcome {
  status: 'written' | 'duplicate' | 'conflict';
  month: MonthPayload;
  revision: number;
  fingerprint: string;
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

function validMonth(value: unknown): value is MonthPayload {
  const month = value as Partial<MonthPayload> | null;
  return Boolean(month)
    && Number.isInteger(month?.year)
    && Number(month?.year) >= 2000
    && Number(month?.year) <= 2200
    && Number.isInteger(month?.month)
    && Number(month?.month) >= 1
    && Number(month?.month) <= 12
    && Boolean(month?.days)
    && typeof month?.days === 'object';
}

function validWrite(value: unknown): value is WriteRequest {
  const request = value as Partial<WriteRequest> | null;
  return Boolean(request)
    && validMonth(request?.month)
    && Number.isInteger(request?.expectedRevision)
    && Number(request?.expectedRevision) >= 0
    && typeof request?.mutationId === 'string'
    && request.mutationId.length >= 8
    && request.mutationId.length <= 180
    && typeof request?.fingerprint === 'string'
    && request.fingerprint.length >= 3
    && request.fingerprint.length <= 180;
}

function parseRow(row: StoredMonthRow): MonthPayload {
  return JSON.parse(row.content_json) as MonthPayload;
}

function pathParts(request: Request): string[] {
  return new URL(request.url).pathname.split('/').filter(Boolean);
}

export class MonthState extends DurableObject<Env> {
  private readonly initialized: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initialized = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS month_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          revision INTEGER NOT NULL,
          content_json TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mutations (
          mutation_id TEXT PRIMARY KEY,
          from_revision INTEGER NOT NULL,
          to_revision INTEGER NOT NULL,
          fingerprint TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS mutations_created_at_idx ON mutations(created_at);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (1, datetime('now'));
      `);
    });
  }

  private row(): StoredMonthRow | null {
    return this.ctx.storage.sql.exec<StoredMonthRow>(
      'SELECT revision, content_json, fingerprint, updated_at FROM month_state WHERE id = 1'
    ).toArray()[0] ?? null;
  }

  private async current(): Promise<Response> {
    await this.initialized;
    const row = this.row();
    if (!row) {
      return json({ ok: false, error: { code: 'MONTH_NOT_INITIALIZED', message: 'Monat noch nicht initialisiert.' } }, 404);
    }
    return json({
      ok: true,
      month: parseRow(row),
      revision: row.revision,
      fingerprint: row.fingerprint,
      updatedAt: row.updated_at
    });
  }

  private async initialize(request: Request): Promise<Response> {
    await this.initialized;
    const body = await request.json<unknown>();
    const candidate = (body as { month?: unknown } | null)?.month;
    if (!validMonth(candidate)) {
      return json({ ok: false, error: { code: 'INVALID_MONTH', message: 'Ungültiger Monatsdatensatz.' } }, 400);
    }
    const now = new Date().toISOString();
    const revision = Math.max(0, Math.round(Number(candidate.revision) || 0));
    const fingerprint = String((body as { fingerprint?: unknown }).fingerprint || `seed:${revision}`);
    const normalized: MonthPayload = {
      ...candidate,
      revision,
      updatedAt: candidate.updatedAt || now
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO month_state(id, revision, content_json, fingerprint, updated_at)
         VALUES (1, ?, ?, ?, ?)`,
        revision,
        JSON.stringify(normalized),
        fingerprint,
        String(normalized.updatedAt)
      );
    });
    return this.current();
  }

  private async write(request: Request): Promise<Response> {
    await this.initialized;
    const body = await request.json<unknown>();
    if (!validWrite(body)) {
      return json({ ok: false, error: { code: 'INVALID_WRITE', message: 'Ungültige revisionsgebundene Monatsänderung.' } }, 400);
    }

    const outcome = this.ctx.storage.transactionSync<WriteOutcome>(() => {
      const duplicate = this.ctx.storage.sql.exec<{ mutation_id: string }>(
        'SELECT mutation_id FROM mutations WHERE mutation_id = ?',
        body.mutationId
      ).toArray()[0];
      const row = this.row();
      if (!row) {
        throw new Error('MONTH_NOT_INITIALIZED');
      }
      const currentMonth = parseRow(row);
      if (duplicate) {
        return {
          status: 'duplicate',
          month: currentMonth,
          revision: row.revision,
          fingerprint: row.fingerprint
        };
      }
      if (row.revision !== body.expectedRevision) {
        return {
          status: 'conflict',
          month: currentMonth,
          revision: row.revision,
          fingerprint: row.fingerprint
        };
      }
      const nextRevision = row.revision + 1;
      const now = new Date().toISOString();
      const nextMonth: MonthPayload = {
        ...body.month,
        revision: nextRevision,
        updatedAt: now
      };
      this.ctx.storage.sql.exec(
        `UPDATE month_state
         SET revision = ?, content_json = ?, fingerprint = ?, updated_at = ?
         WHERE id = 1`,
        nextRevision,
        JSON.stringify(nextMonth),
        body.fingerprint,
        now
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO mutations(mutation_id, from_revision, to_revision, fingerprint, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        body.mutationId,
        row.revision,
        nextRevision,
        body.fingerprint,
        now
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM mutations
         WHERE mutation_id IN (
           SELECT mutation_id FROM mutations
           ORDER BY created_at DESC
           LIMIT -1 OFFSET 256
         )`
      );
      return {
        status: 'written',
        month: nextMonth,
        revision: nextRevision,
        fingerprint: body.fingerprint
      };
    });

    if (outcome.status === 'conflict') {
      return json({
        ok: false,
        error: {
          code: 'MONTH_REVISION_CONFLICT',
          message: 'Der Monat wurde zwischenzeitlich auf einem anderen Client geändert.'
        },
        month: outcome.month,
        revision: outcome.revision,
        fingerprint: outcome.fingerprint
      }, 409);
    }
    return json({
      ok: true,
      status: outcome.status,
      month: outcome.month,
      revision: outcome.revision,
      fingerprint: outcome.fingerprint
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/state') && request.method === 'GET') return this.current();
    if (path.endsWith('/init') && request.method === 'POST') return this.initialize(request);
    if (path.endsWith('/state') && request.method === 'PUT') {
      try {
        return await this.write(request);
      } catch (error) {
        if (error instanceof Error && error.message === 'MONTH_NOT_INITIALIZED') {
          return json({ ok: false, error: { code: 'MONTH_NOT_INITIALIZED', message: 'Monat noch nicht initialisiert.' } }, 404);
        }
        throw error;
      }
    }
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter MonthState-Endpunkt.' } }, 404);
  }
}

async function routeToMonth(env: Env, year: number, month: number, action: 'state' | 'init', request: Request): Promise<Response> {
  const stub = env.MONTHS.getByName(`${year}-${String(month).padStart(2, '0')}`);
  return stub.fetch(new Request(`https://month.internal/${action}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' ? undefined : request.body
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = pathParts(request);
    if (parts[0] !== 'v1' || parts[1] !== 'months') {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter MonthState-Endpunkt.' } }, 404);
    }
    const year = Number(parts[2]);
    const month = Number(parts[3]);
    if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
      return json({ ok: false, error: { code: 'INVALID_MONTH_KEY', message: 'Ungültiger Monatsschlüssel.' } }, 400);
    }
    if (parts.length === 4 && request.method === 'GET') return routeToMonth(env, year, month, 'state', request);
    if (parts.length === 4 && request.method === 'PUT') return routeToMonth(env, year, month, 'state', request);
    if (parts.length === 5 && parts[4] === 'init' && request.method === 'POST') {
      return routeToMonth(env, year, month, 'init', request);
    }
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unbekannter MonthState-Endpunkt.' } }, 404);
  }
} satisfies ExportedHandler<Env>;
