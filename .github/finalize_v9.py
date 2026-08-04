from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    content = read(path)
    actual = content.count(old)
    if actual < count:
        raise RuntimeError(f"{path}: expected at least {count} occurrences, found {actual}: {old[:80]!r}")
    write(path, content.replace(old, new, count))


# 1. Mypy: narrow concrete values before assigning Optional result fields.
replace(
    "solver/app/solver_core.py",
    '''    if has_solution(status):
        value: float | None = float(solver.objective_value)
        bound: float | None = float(solver.best_objective_bound)
        gap: float | None = relative_gap(value, bound)
    else:
        value = bound = gap = None
''',
    '''    if has_solution(status):
        objective_value = float(solver.objective_value)
        best_bound = float(solver.best_objective_bound)
        value: float | None = objective_value
        bound: float | None = best_bound
        gap: float | None = relative_gap(objective_value, best_bound)
    else:
        value = bound = gap = None
''',
)

# 2. Security contract: internal infrastructure details stay in server logs.
replace(
    "tests/bughunt-regressions.test.js",
    '''  const bootstrap = await getBootstrap({ env: {} });
  assert.equal(bootstrap.status, 500);
  assert.match((await bootstrap.json()).error, /KV Binding/);
''',
    '''  const bootstrap = await getBootstrap({ env: {} });
  assert.equal(bootstrap.status, 500);
  const body = await bootstrap.json();
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.match(body.error.message, /nicht verarbeitet/);
  assert.equal(typeof body.error.traceId, 'string');
  assert.doesNotMatch(JSON.stringify(body), /KV Binding|stack|functions\//i);
''',
)

# 3. Browser orchestration: no listener leaks, no orphaned local worker.
replace(
    "js/auto-plan-runner.js",
    '''const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(abortError(signal));
  const timer = setTimeout(resolve, Math.max(0, milliseconds));
  const onAbort = () => {
    clearTimeout(timer);
    reject(abortError(signal));
  };
  signal?.addEventListener?.('abort', onAbort, { once: true });
});
''',
    '''const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  let timer;
  const onAbort = () => {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
    reject(abortError(signal));
  };
  if (signal?.aborted) return onAbort();
  timer = setTimeout(() => {
    signal?.removeEventListener?.('abort', onAbort);
    resolve();
  }, Math.max(0, milliseconds));
  signal?.addEventListener?.('abort', onAbort, { once: true });
});
''',
)
replace(
    "js/auto-plan-runner.js",
    '''  const endpoint = String(config.v9?.endpoint || settings.endpoint || DEFAULT_ENDPOINT);
  const forceLocal = config.v9?.remoteSolver === false;
  const localController = new AbortController();
''',
    '''  const endpoint = String(config.v9?.endpoint || settings.endpoint || DEFAULT_ENDPOINT);
  const forceLocal = config.v9?.remoteSolver === false;
  // Snapshot compilation can fail on inconsistent input. Compile before any
  // worker is started so a rejected snapshot cannot leave orphaned work.
  const snapshot = compileAutoPlanV9Snapshot({ state, monthData, runConfig: config });
  const localController = new AbortController();
''',
)
replace(
    "js/auto-plan-runner.js",
    '''  const handledLocal = localPromise.then(result => ({ result }), error => ({ error }));
  const snapshot = compileAutoPlanV9Snapshot({ state, monthData, runConfig: config });

  onProgress?.({
''',
    '''  const handledLocal = localPromise.then(result => ({ result }), error => ({ error }));

  onProgress?.({
''',
)
replace(
    "js/auto-plan-runner.js",
    '''  } finally {
    signal?.removeEventListener?.('abort', relayAbort);
  }
}
''',
    '''  } finally {
    signal?.removeEventListener?.('abort', relayAbort);
    if (!localController.signal.aborted) {
      localController.abort(new DOMException('Auto-Plan-v9-Lauf beendet', 'AbortError'));
    }
  }
}
''',
)
replace(
    "js/auto-plan-runner.js",
    '''    worker.postMessage({
      type: 'run',
''',
    '''    try {
      worker.postMessage({
      type: 'run',
''',
)
replace(
    "js/auto-plan-runner.js",
    '''      localBudgetMs: Math.max(10_000, Math.min(45_000, Number(runConfig.timeBudgetMs || 60_000)))
    });
  });
}

async function parseJsonResponse''',
    '''      localBudgetMs: Math.max(10_000, Math.min(45_000, Number(runConfig.timeBudgetMs || 60_000)))
      });
    } catch (error) {
      finish(reject)(error);
    }
  });
}

async function parseJsonResponse''',
)

# 4. The v9 UI identifies the productive engine truthfully while retaining
# explicit legacy data attributes for compatibility diagnostics.
replace(
    "js/auto-plan-studio-v9.js",
    '''  dialog.dataset.algorithmRevision = '8';
  dialog.dataset.engineRevision = '8.5';
  dialog.dataset.solverRevision = '9';
''',
    '''  dialog.dataset.algorithmRevision = '9';
  dialog.dataset.engineRevision = '9';
  dialog.dataset.solverRevision = '9';
  dialog.dataset.legacyAlgorithmRevision = '8';
  dialog.dataset.legacyEngineRevision = '8.5';
''',
)

# 5. API client: structured errors and idempotent month writes.
write(
    "js/api.js",
    '''async function parseJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return { ok: false, error: { message: text || 'Ungültige Serverantwort' } }; }
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const error = new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
    error.name = 'ApiError';
    error.status = res.status;
    error.code = data?.error?.code || null;
    error.traceId = data?.error?.traceId || null;
    error.details = data;
    throw error;
  }
  return data;
}

function monthMutationKey(year, month, payload) {
  const revision = Math.max(0, Math.round(Number(payload?.revision) || 0));
  const stamp = String(payload?.updatedAt || 'unstamped').replace(/[^0-9A-Za-z_.:-]/g, '-');
  return `month-${year}-${String(month).padStart(2, '0')}-r${revision}-${stamp}`.slice(0, 180);
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  getMonth: (year, month) => request(`/api/month/${year}/${String(month).padStart(2, '0')}`),
  saveMonth: (year, month, payload) => request(`/api/month/${year}/${String(month).padStart(2, '0')}`, {
    method: 'PUT',
    headers: { 'Idempotency-Key': monthMutationKey(year, month, payload) },
    body: JSON.stringify(payload)
  }),
  getSettings: () => request('/api/settings'),
  saveSettings: payload => request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getStaff: () => request('/api/staff'),
  saveStaff: payload => request('/api/staff', { method: 'PUT', body: JSON.stringify(payload) }),
  getRbnNames: () => request('/api/rbn-names'),
  saveRbnNames: payload => request('/api/rbn-names', { method: 'PUT', body: JSON.stringify(payload) }),
  exportJson: () => request('/api/export'),
  importJson: payload => request('/api/import', { method: 'POST', body: JSON.stringify(payload) })
};
''',
)

# 6. Pages month endpoint: strong consistency through the MonthState service
# binding, with KV migration/degraded fallback and idempotent writes.
write(
    "functions/api/month/[year]/[month].js",
    '''import {
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
''',
)

# 7. Month conflicts remain local and visible rather than being mislabeled offline.
replace(
    "js/state.js",
    '''    } catch (error) {
      if (!state.dirtyMonths.has(key)) state.dirtyMonths.set(key, saveVersion);
      state.monthSources.set(key, 'local');
      persistDirtyMarkers();
      updateDirtyFlag();
      state.saveStatus = 'offline';
      state.serverReady = false;
      return { ok: false, current: false, pending: true, error };
    }
''',
    '''    } catch (error) {
      if (!state.dirtyMonths.has(key)) state.dirtyMonths.set(key, saveVersion);
      state.monthSources.set(key, 'local');
      persistDirtyMarkers();
      updateDirtyFlag();
      if (error?.status === 409 && error?.code === 'MONTH_REVISION_CONFLICT') {
        state.saveStatus = 'conflict';
        state.serverReady = true;
        return {
          ok: false,
          current: false,
          pending: true,
          conflict: true,
          serverMonth: error.details?.month || null,
          error
        };
      }
      state.saveStatus = 'offline';
      state.serverReady = false;
      return { ok: false, current: false, pending: true, error };
    }
''',
)

# 8. Durable job runner: recover an interrupted controller instance and send
# cancellation to the container immediately.
replace(
    "workers/autoplan-v9/src/index.ts",
    '''function safeRunId(value: string): string {
  return `v9-${value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 140)}`;
}
''',
    '''function safeRunId(value: string): string {
  return `v9-${value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 140)}`;
}

function solverContainerKey(requestFingerprint: string): string {
  return `solver-${requestFingerprint.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''export class AutoPlanJob extends DurableObject<Env> {
  private readonly initialized: Promise<void>;
''',
    '''export class AutoPlanJob extends DurableObject<Env> {
  private readonly initialized: Promise<void>;
  private execution: Promise<void> | null = null;
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''  private async start(snapshot: SolverSnapshot): Promise<Response> {
''',
    '''  private ensureExecution(snapshot: SolverSnapshot): void {
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
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''    if (existing) {
      const result = await this.ctx.storage.get<unknown>('result');
      return json({
''',
    '''    if (existing) {
      const result = await this.ctx.storage.get<unknown>('result');
      if (result === undefined && (existing.status === 'created' || existing.status === 'running')) {
        const storedSnapshot = await this.ctx.storage.get<SolverSnapshot>('snapshot');
        if (storedSnapshot && isSnapshot(storedSnapshot)) this.ensureExecution(storedSnapshot);
      }
      return json({
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''    this.ctx.waitUntil(this.execute(snapshot));
    return json({ ok: true, runId, status: 'running', sequence: 1 }, 202);
''',
    '''    this.ensureExecution(snapshot);
    return json({ ok: true, runId, status: 'running', sequence: 1 }, 202);
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''    const containerKey = `solver-${snapshot.requestFingerprint.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
''',
    '''    const containerKey = solverContainerKey(snapshot.requestFingerprint);
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''  private async status(request: Request): Promise<Response> {
    const state = await this.runState();
    if (!state) return json({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'Lauf nicht gefunden.' } }, 404);
''',
    '''  private async status(request: Request): Promise<Response> {
    const state = await this.runState();
    if (!state) return json({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'Lauf nicht gefunden.' } }, 404);
    if (state.status === 'created' || state.status === 'running') {
      const snapshot = await this.ctx.storage.get<SolverSnapshot>('snapshot');
      if (snapshot && isSnapshot(snapshot)) this.ensureExecution(snapshot);
    }
''',
)
replace(
    "workers/autoplan-v9/src/index.ts",
    '''    state.status = 'cancelled';
    await this.putState(state);
    await this.appendEvent({
''',
    '''    state.status = 'cancelled';
    await this.putState(state);
    const container = getContainer(this.env.AUTO_PLAN_CONTAINER, solverContainerKey(state.requestFingerprint));
    await container.fetch(new Request('http://container/cancel', {
      method: 'POST', headers: { 'X-Run-Id': state.runId }
    })).catch(() => undefined);
    await this.appendEvent({
''',
)

# 9. CI verifies both Cloudflare workers.
replace(
    ".github/workflows/ci.yml",
    '''      - run: npx wrangler deploy --dry-run --outdir dist
''',
    '''      - run: npx wrangler deploy --dry-run --outdir dist

  month-state-worker:
    name: Revisionssichere Monatspersistenz
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: workers/month-state
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: npm run check
      - run: npx wrangler deploy --dry-run --outdir dist
''',
)

# 10. Static integration contracts cover the strong-consistency path and
# cleanup invariants discovered in the final bug hunt.
with (ROOT / "tests/auto-plan-v9.test.js").open("a", encoding="utf-8") as handle:
    handle.write('''\n\ntest('v9-Monatspersistenz ist revisionsgebunden und degradiert kontrolliert auf KV', async () => {
  const endpoint = await source('../functions/api/month/[year]/[month].js');
  const api = await source('../js/api.js');
  const runner = await source('../js/auto-plan-runner.js');
  const job = await source('../workers/autoplan-v9/src/index.ts');
  assert.match(endpoint, /MONTH_STATE/);
  assert.match(endpoint, /expectedRevision/);
  assert.match(endpoint, /MONTH_REVISION_CONFLICT/);
  assert.match(endpoint, /eventual-fallback/);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /error\.status = res\.status/);
  assert.match(runner, /Snapshot compilation can fail/);
  assert.match(runner, /removeEventListener\?\.\('abort'/);
  assert.match(job, /ensureExecution/);
  assert.match(job, /solverContainerKey/);
  assert.doesNotMatch(job, /ctx\.waitUntil\(this\.execute/);
});
''')

# 11. Production README.
write(
    "README.md",
    '''# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.9.0`  
> **Regelwerk:** Eignungsregeln `v5.0.0`  
> **Auto-Plan:** `v9` — *CP-SAT Guided Adaptive Exact-LNS*  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Frontend:** Cloudflare Pages + Pages Functions  
> **Solver:** Durable Object + Cloudflare Container + Python/OR-Tools CP-SAT  
> **Persistenz:** MonthState Durable Object; Workers KV als Migrations-, Export- und Degraded-Mode-Spiegel; lokale Browser-Sicherung

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer mathematisch modellierten Komplettierung offener **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben Fixpunkte. RBN und zweite RBN werden weiterhin manuell geplant.

---

## 1. Funktionsumfang

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Kandidatenlisten mit Grün/Gelb/Orange/Rot/Grau und vollständiger Begründung;
- Abwesenheiten, Dienstwünsche, Optionen, Notizen und revisionsfähige Ausnahmebestätigungen;
- Monatsstatistik, Sollvergleich, Wochenendäquivalente und offene Punkte;
- Excel-/JSON-Import, Excel-/PDF-/JSON-Export und lokale Offline-Sicherung;
- Auto-Plan Studio mit Laufprofilen, Ziel-Gap, Varianten, Stabilitätsgrenze, Exact-LNS und Relaxierungsrichtlinien;
- persistiertes Solver-Observatorium mit Status, Schranke, Gap, Branches, Konflikten, Zielstufen und Konfliktkern;
- unabhängiger Browseraudit vor jeder Übernahme;
- kontrollierter lokaler v8.5-Fallback, wenn der native Solver nicht erreichbar ist.

## 2. Fachliche Invarianten

1. Die produktive JavaScript-Regelengine bleibt die fachliche Wahrheits- und Auditschicht.
2. Auto-Plan verändert ausschließlich zuvor leere BD-/HG-Felder des sichtbaren Monats.
3. Fixpunkte, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
4. Fehlende Qualifikation, inaktive Personen, gleichzeitiger BD/HG und unmittelbar aufeinanderfolgende BD sind nicht relaxierbar.
5. Abwesenheit, Polednia-Sperre und harte Maxima sind nur entsprechend der expliziten Relaxierungsrichtlinie zulässig.
6. Personengebundene BD-, HG- und Gesamtobergrenzen gelten in jedem Suchpfad.
7. Rote Abweichungen werden erst nach nachgewiesen erfolgloser strikter Machbarkeitssuche betrachtet.
8. Bis zur bewussten Übernahme erfolgt keine Mutation des Monatsplans.
9. Vor der Übernahme werden Fingerprints, Fixpunkte und der vollständige Endzustand erneut auditiert.

## 3. Auto-Plan v9

### 3.1 Pipeline

```text
Versionierter Snapshot / Constraint Registry
  → Domänen- und Datenvalidierung
  → paralleler lokaler v8.5-Warmstart
  → strikte CP-SAT-Machbarkeit ohne Rot
  → optional kontrollierte Minimalrelaxierung
  → sequenzielle lexikografische Optimierung
  → adaptive Exact-LNS mit CP-SAT-Teilmodellen
  → qualitätsgebundene, hinreichend verschiedene Varianten
  → Konfliktkern und Relaxierungsvorschläge
  → unabhängiger Browseraudit
  → atomare Benutzerübernahme
```

### 3.2 Modell

Für jedes offene Dienstfeld und jeden zulässigen Kandidaten existiert eine binäre Entscheidungsvariable. Fixpunkte werden als Konstanten in dasselbe Modell aufgenommen. Das Modell enthält unter anderem:

- vollständige Belegung jedes offenen BD-/HG-Feldes;
- Qualifikation und zeitabhängige Rollen;
- kein gleichzeitiger BD und HG derselben Person;
- keine direkt aufeinanderfolgenden BD;
- werktäglicher HG unmittelbar vor eigenem BD;
- individuelle BD-, HG- und Gesamtobergrenzen;
- rote/orange/gelbe Regelkosten;
- Wunscherfüllung;
- maximale und gesamte BD-Sollabweichung;
- gewichtete Gesamtlast- und Wochenendspannweite;
- Planstabilität gegenüber Warmstart/Baseline;
- Mindestdistanz zwischen Varianten.

### 3.3 Lexikografische Ziele

Die Ziele werden nicht zu einer einzigen schwer interpretierbaren Großgewichtung zusammengezogen. Jede Stufe wird separat gelöst; ihr erreichter Wert wird vor der nächsten Stufe gebunden:

1. bestätigungspflichtige rote Ausnahmen;
2. bei Minimaländerung: Planstabilität;
3. orange Regelhinweise;
4. gelbe Regelhinweise;
5. Wünsche und Optionen;
6. maximale individuelle BD-Abweichung;
7. gesamte BD-Abweichung;
8. gewichtete Gesamtlast;
9. Wochenendlast;
10. nachrangige Stabilität.

`OPTIMAL` wird nur ausgewiesen, wenn jede Zielstufe im Nachweismodus mit Gap `0` abgeschlossen wurde. Ein durch Zeit- oder Gap-Grenzen beendeter Lauf wird korrekt als `FEASIBLE` bezeichnet.

### 3.4 Adaptive Exact-LNS

Die v8.5-Heuristik liefert einen frühen Incumbent. v9 wählt anschließend adaptive Teilmengen aus und löst die freigegebenen Dienstfelder als exaktes CP-SAT-Teilmodell neu. Operatoren umfassen schwache Zuordnungen, Wochenenden, Personenlast, Zeitfenster und Zufallsnachbarschaften. Nutzung, Laufzeit und Qualitätsgewinn werden gemessen; die Auswahl balanciert Exploration und Qualitätsgewinn pro Rechenzeit.

### 3.5 Erklärbarkeit

- Assumption Literals gruppieren fachlich zusammengehörige harte Bedingungen.
- Bei `INFEASIBLE` wird ein reduzierter hinreichender Konfliktkern bestimmt.
- Daraus entstehen konkrete Relaxierungsvorschläge.
- Hints sind ausschließlich Suchhinweise, niemals fachliche Constraints.
- Solverstatus, Zielfunktionswert, beste Schranke und relativer Gap werden getrennt angezeigt.

## 4. Laufprofile und Studioeinstellungen

| Profil | Zeitbudget | Varianten | Ziel-Gap | Exact-LNS |
| --- | ---: | ---: | ---: | --- |
| Schnell | 15 s | 1 | 10 % | 6–14 Felder |
| Ausgewogen | 60 s | 3 | 2 % | 8–24 Felder |
| Intensiv | 180 s | 5 | 1 % | 12–36 Felder |
| Nachweis | 600 s | 3 | 0 % | 14–48 Felder |

Zusätzlich einstellbar:

- Neuplanung, Reparatur oder Minimaländerung;
- maximale Zahl geänderter Felder;
- Mindest-Hamming-Distanz der Varianten;
- reproduzierbarer Ein-Worker-Modus und Seed;
- Remote-CP-SAT oder lokaler Fallback;
- Relaxierung von Abwesenheit, organisatorischen Regeln und harten Maxima;
- bestehende personenspezifische BD-/HG-/Gesamtgrenzen;
- Rot-Fallback und maximale Zahl roter Ausnahmen.

## 5. Architektur

```text
Browser / Auto-Plan Studio
  ├─ lokale v8.5-Worker: früher Warmstart + Offlinefallback
  └─ /api/autoplan/v9/runs
       └─ Pages-Service-Binding AUTO_PLAN_V9
            └─ AutoPlanJob Durable Object
                 ├─ SQLite: Zustand, Ereignisse, Ergebnis
                 └─ AutoPlanContainer
                      └─ FastAPI + OR-Tools CP-SAT

/api/month/:year/:month
  ├─ Pages-Service-Binding MONTH_STATE
  │    └─ MonthState Durable Object + SQLite/CAS/Mutation-ID
  ├─ DIENSTPLAN_KV: Migration, Spiegel, Export und Degraded Mode
  └─ Browser: Dirty-Marker und lokale Notfallsicherung
```

### Verantwortlichkeiten

- **Pages:** statische Anwendung und Release-Assets.
- **Pages Functions:** Eingangsvalidierung, API-Vertrag, Service-Routing und sichere Fehlerantworten.
- **AutoPlanJob:** idempotente Laufkennung, persistierte Events, Status, Wiederaufnahme und Abbruch.
- **Container:** nativer Python-Prozess und CP-SAT-Rechenlast.
- **MonthState:** serialisierte Monatsänderungen mit Expected Revision und Mutation-ID.
- **Workers KV:** nicht mehr Autorität für konkurrierende Monatswrites; weiterhin Migrations-/Exportspiegel und kontrollierter Fallback.
- **Browseraudit:** fachliche Endkontrolle unabhängig vom nativen Modell.

## 6. Startup-Stabilität

Der frühere Startabsturz entstand durch `insertBefore()` mit einem Referenzknoten, der kein direktes Kind des gewählten Toolbar-Containers war. v9 verwendet den tatsächlichen Elternknoten und kapselt UI-Initialisierungsschritte separat.

Zusätzliche Schutzschichten:

- globale Behandlung von `error` und `unhandledrejection`;
- Watchdog gegen dauerhaften Zustand „Lädt …“;
- sichtbare Diagnose-ID;
- nicht-destruktive Bereinigung ausschließlich eigener Legacy-Service-Worker und Caches;
- keine pauschale Löschung von Local Storage oder lokalen Dienstplandaten;
- Playwright-Regression mit absichtlich noch nicht reorganisierter Toolbar.

## 7. Sicherheit und Robustheit

- Pydantic-Modelle mit `extra="forbid"`, Größen- und Wertebereichen;
- Requestgrößenbegrenzung in Pages Functions und Solvercontainer;
- generische externe 5xx-Fehler mit Trace-ID, interne Details ausschließlich im Log;
- `Cache-Control: no-store` und `X-Content-Type-Options: nosniff` auf APIs;
- keine Internetverbindung des Solvercontainers;
- idempotente Lauf- und Monatsmutationen;
- persistierte Abbruchsignale und unmittelbare Container-Cancellation;
- Baseline-, Konfigurations- und Request-Fingerprints;
- HTML-Escaping für Solverkommentare und Diagnoseinhalte;
- kein Vertrauen in ein Remoteergebnis ohne lokalen Endaudit.

## 8. Datenmodell und Migration

### Solver-Snapshot `schemaVersion: 9`

- Planungszeitraum und Regelwerkversion;
- Personal, zeitabhängige Rolleneigenschaften und Limits;
- offene/fixe Slots und vollständig evaluierte Kandidatendomänen;
- Relationen und Fixpunkte;
- Baseline und Warmstarts;
- Solverkonfiguration;
- drei Fingerprints.

### Monatsdaten

- `year`, `month`, `revision`, `updatedAt`;
- Tagesfelder einschließlich BD/HG/RBN;
- Abwesenheiten, Wünsche, Optionen und Notizen;
- Override-/Bestätigungsnachweise.

Beim ersten Zugriff übernimmt `MonthState` einen vorhandenen KV-Datensatz oder einen normalisierten leeren Monat. Danach erfolgen Writes per Compare-and-Swap. Ein Revisionskonflikt liefert HTTP `409`; der lokale Dirty-Stand bleibt erhalten und wird nicht als Offlinefehler umgedeutet.

## 9. Lokale Entwicklung

### Frontend und Pages Functions

Voraussetzungen: Node.js 24, npm.

```bash
npm ci
npm run check
npm run check:v9
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

### Nativer Solver

Voraussetzungen: Python 3.13.7 und Docker.

```bash
python -m pip install --upgrade pip==25.2
python -m pip install -e './solver[dev]'
ruff check solver
mypy solver/app
python -m compileall -q solver/app solver/tests
pytest solver
docker build -t dienstplanrad-autoplan-v9 ./solver
```

### Cloudflare Worker

```bash
cd workers/autoplan-v9
npm install
npm run check
npx wrangler deploy --dry-run

cd ../month-state
npm install
npm run check
npx wrangler deploy --dry-run
```

## 10. Cloudflare-Konfiguration und Deployment

1. `workers/autoplan-v9` deployen.
2. `workers/month-state` deployen.
3. Pages-Service-Binding `AUTO_PLAN_V9` auf `dienstplanrad-autoplan-v9` setzen.
4. Pages-Service-Binding `MONTH_STATE` auf `dienstplanrad-month-state` setzen.
5. KV-Binding `DIENSTPLAN_KV` unverändert bereitstellen.
6. Preview-Bindings auf die jeweiligen `-preview`-Worker richten.
7. Pages neu deployen; Bindings werden erst nach Redeploy wirksam.
8. Health-, Solver-, Cancel-, Monats-GET/PUT- und Revisionskonflikt-Smoke-Tests ausführen.
9. Logs über Dashboard oder `wrangler pages deployment tail` kontrollieren.

Der native Remote-Solver ist optional fail-safe: Fehlt `AUTO_PLAN_V9` oder ist der Container nicht erreichbar, übernimmt der lokale auditierte Fallback. Fehlt `MONTH_STATE`, bleibt die frühere KV-Persistenz als ausdrücklich ausgewiesener `eventual-fallback` verfügbar.

## 11. Import, Export und Backup

- Excel-Import lädt alle Zielmonate vor dem Merge.
- JSON-Import validiert und normalisiert vor dem ersten Schreibzugriff.
- JSON-Backup kombiniert Serverstand mit neueren lokalen Dirty-Monaten.
- Excel-/PDF-Export verwenden lokale Kalendertage und den sichtbaren Monatsstand.
- KV bleibt Export-/Migrationsspiegel, während MonthState die konkurrierende Schreibautorität bildet.
- Vor Infrastrukturmigration ist ein vollständiger JSON-Export empfohlen.

## 12. Tests und Qualitätsgate

### JavaScript

- Regelengine, Berichte und Invarianten;
- Fixpunktschutz, harte Maxima, Null-Rot-Eskalation und Fallback;
- v9-Snapshot, Fingerprints, UI-Verträge, Tooltips und Proof-Kommentare;
- Remote-/Fallback-Orchestrierung, Abbruch und Worker-Lebenszyklus;
- Imports, Exports, Dirty-Marker und Konfliktpersistenz;
- Startup-Root-Cause und äußere Fehlergrenze.

### Python

- Schema- und Modellvalidierung;
- strikte Machbarkeit und Unlösbarkeit;
- lexikografische Zielstufen;
- Rot-Fallback, Limits und Warmstart;
- Exact-LNS-Metadaten und Varianten;
- FastAPI-Health-, Solve- und Cancel-Vertrag.

### Browser

- echter Chromium-Start ohne `pageerror`;
- kein dauerhafter Ladezustand;
- Monatsrendering und Toolbar-Regression;
- Legacy-Cache-/Service-Worker-Recovery;
- vorhandene Planungs-, Dialog-, Druck- und Accessibility-Pfade.

### CI-Gate

```text
Node-Syntax + 383+ Modultests + Playwright
Ruff + Mypy + Compileall + Pytest + Docker-Build
Wrangler TypeScript + Dry-Run AutoPlan Worker
Wrangler TypeScript + Dry-Run MonthState Worker
```

Ein Merge ist nur nach vollständig grünem Gate zulässig.

## 13. Projektstruktur v9

```text
js/constraint-registry-v9.js          Constraint IR und Snapshotcompiler
js/auto-planner-v9.js                 produktive v9-Fassade und Phasenvertrag
js/auto-plan-runner.js                Remote-/Warmstart-/Fallback-Orchestrierung
js/auto-plan-contracts-v9.js          Remoteergebnis und Browseraudit
js/auto-plan-studio-v9.js             Studioeinstellungen und Nachweisansicht
js/auto-plan-visualizer-v9.js         Solver-/Proof-Visualisierung
js/startup-health-v9.js               Startüberwachung und Recovery
functions/api/autoplan/v9/             Pages-Proxy für Solverläufe
functions/api/month/                   revisionsgebundene Monatsschnittstelle
workers/autoplan-v9/                   Job-DO und Containersteuerung
workers/month-state/                   stark konsistente Monatspersistenz
solver/app/                            FastAPI, Pydantic und OR-Tools CP-SAT
solver/tests/                          native Solvertests
tests/auto-plan-v9.test.js             v9-Integrationsverträge
tests/e2e/startup-v9.spec.js           Startup-Regression
```

## 14. Bewusste Grenzen

- Ein Status `FEASIBLE` ist kein Optimalitätsbeweis.
- Ein CP-SAT-Assumption-Core ist hinreichend, aber nicht zwingend global minimal; v9 reduziert ihn zeitgebunden weiter.
- Hints können die Suche beschleunigen, werden vom Solver jedoch nicht garantiert befolgt.
- Der Browserfallback ist fachlich auditiert, liefert aber keinen globalen CP-SAT-Nachweis.
- Eine Cloudflare-Binding-Änderung erfordert ein erneutes Pages-Deployment.
- RBN bleibt bewusst außerhalb der Auto-Plan-v9-Entscheidungsvariablen.
- Änderungen an Regelwerk oder Snapshotstruktur erfordern eine neue `rulesetVersion` beziehungsweise `schemaVersion`.

## 15. Lizenz und Betrieb

Das Repository enthält keine Secrets. Cloudflare-IDs, Tokens und produktive Bindings werden außerhalb des Quellcodes verwaltet. Vor jedem Produktivdeployment sind Preview-Smoke-Test, vollständiges CI-Gate, Backup und Diffkontrolle verpflichtend.
''',
)

# Remove the one-time automation from the finalized tree.
for transient in (ROOT / ".github/finalize_v9.py", ROOT / ".github/workflows/finalize-v9.yml"):
    transient.unlink(missing_ok=True)
