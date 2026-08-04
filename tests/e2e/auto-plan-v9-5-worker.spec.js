import { test, expect } from '@playwright/test';

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

function month(year, monthNumber, openDate) {
  const days = {};
  const count = new Date(year, monthNumber, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = iso === openDate
      ? { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' }
      : { bd: 'extern:Bestand BD', hg: 'extern:Bestand HG', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1,
    year,
    month: monthNumber,
    revision: 0,
    updatedAt: null,
    days,
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

const fakeCpSatModule = String.raw`
class Expr {
  constructor(terms = []) { this.terms = terms; }
  times(coefficient) { return new Expr(this.terms.map(([variable, value]) => [variable, value * coefficient])); }
  plus(other) { return new Expr([...this.terms, ...other.terms]); }
}
export class CpModel {
  constructor() { this.hints = new Map(); }
  newIntVar(lb, ub, name) {
    const variable = { lb, ub, name };
    variable.times = coefficient => new Expr([[variable, coefficient]]);
    return variable;
  }
  addLinearConstraint(expression, lb, ub) { return { expression, lb, ub }; }
  minimize(expression) { this.objective = expression; }
  addHint(variable, value) { this.hints.set(variable, Number(value)); }
}
export class CpSolver {
  async solve(model) { this.model = model; return 'FEASIBLE'; }
  statusName(status) { return status; }
  objectiveValue() { return 0; }
  bestObjectiveBound() { return 0; }
  value(variable) {
    if (String(variable?.name || '').includes('self_test')) return 1;
    return this.model?.hints?.get(variable) ?? 0;
  }
  delete() {}
}
`;

async function mockApplication(context, page) {
  const july = month(2026, 7, '2026-07-15');
  await context.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.XLSX = undefined;'
  }));
  await context.route('**/vendor/or-tools-wasm/cp-sat/index.js', route => route.fulfill({
    status: 404,
    contentType: 'application/javascript',
    body: 'export {};'
  }));
  await context.route('https://cdn.jsdelivr.net/npm/or-tools-wasm@0.9.1/cp-sat/+esm', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'no-store'
    },
    body: fakeCpSatModule
  }));
  await context.route('**/api/bootstrap', route => route.fulfill({
    json: {
      ok: true,
      settings: {
        schemaVersion: 4,
        appearance: { density: 'comfortable', richTooltips: true },
        workflow: { algorithmCommentary: true, studioVisualizer: true },
        autoPlan: {
          performanceProfile: 'responsive',
          searchIntensity: 'standard',
          optimizationFocus: 'balanced',
          timeBudgetSeconds: 3,
          cpSatTimeBudgetSeconds: 3,
          allowRedFallback: true,
          perfectionEnabled: true,
          portfolioDiversity: false,
          v95LnsRounds: 1,
          v95AlternativeCount: 1
        }
      },
      staff,
      rbnNames: []
    }
  }));
  await context.route('**/api/month/**', route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const monthNumber = Number(parts.at(-1));
    return route.fulfill({
      json: {
        ok: true,
        month: year === 2026 && monthNumber === 7
          ? july
          : month(year, monthNumber, '')
      }
    });
  });
  await page.addInitScript(() => {
    window.__v95Result = null;
    window.addEventListener('autoplanresult', event => { window.__v95Result = event.detail; });
  });
}

test('der exakte v9.5-Pfad lädt CP-SAT tatsächlich im Modul-Worker', async ({ context, page }) => {
  test.setTimeout(90_000);
  const workerUrls = [];
  const solverRequests = [];
  page.on('worker', worker => workerUrls.push(worker.url()));
  context.on('request', request => {
    if (request.url().includes('or-tools-wasm@0.9.1/cp-sat')) solverRequests.push(request.url());
  });
  await mockApplication(context, page);

  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeVisible();
  await page.locator('#autoPlanV9SolverBackend').selectOption('cp-sat-exact');
  await page.locator('#autoPlanV9Exactness').selectOption('any');
  await page.locator('#autoPlanV9TimeBudget').fill('3');
  await page.locator('#autoPlanV95LnsRounds').fill('1');
  await page.locator('#autoPlanV95Alternatives').selectOption('1');
  await page.locator('#autoPlanStartBtn').click();

  await expect.poll(async () => page.evaluate(() => Boolean(window.__v95Result)), { timeout: 60_000 }).toBe(true);
  const result = await page.evaluate(() => ({
    engine: window.__v95Result?.metrics?.engine,
    cpSatUsed: window.__v95Result?.metrics?.cpSatUsed,
    cpSatAvailable: window.__v95Result?.metrics?.cpSat?.available,
    loadedFrom: window.__v95Result?.metrics?.cpSat?.loadedFrom,
    status: window.__v95Result?.metrics?.cpSat?.status,
    certification: window.__v95Result?.metrics?.certification,
    complete: window.__v95Result?.complete
  }));

  expect(workerUrls.some(url => url.includes('/js/auto-plan-worker.js'))).toBe(true);
  expect(solverRequests.length).toBeGreaterThan(0);
  expect(result.engine).toBe('v9.5-correct-boolean-matheuristic');
  expect(result.cpSatAvailable).toBe(true);
  expect(result.cpSatUsed).toBe(true);
  expect(result.loadedFrom).toMatchObject({
    id: 'or-tools-wasm',
    source: 'cdn',
    version: '0.9.1'
  });
  expect(result.status).toBe('FEASIBLE');
  expect(result.certification.proven).toBe(false);
  expect(result.complete).toBe(true);
  await expect(page.locator('#autoPlanV95Result')).toBeVisible();
  await expect(page.locator('.auto-plan-v95-status')).toContainText(/Bester gefundener Stand|Heuristik gewinnt Audit/);
});
