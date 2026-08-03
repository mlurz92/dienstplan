import { test, expect } from '@playwright/test';

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

function preparedMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: 'extern:Bestand BD', hg: 'extern:Bestand HG', rbn1: '', rbn2: '', notes: '' };
  }
  const target = `${year}-${String(month).padStart(2, '0')}-15`;
  days[target].bd = '';
  days[target].hg = '';
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: [] };
}

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: [] };
}

async function mockApi(page) {
  let currentMonth = preparedMonth(2026, 7);
  let putCount = 0;
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] } }));
  await page.route('**/api/month/**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    if (route.request().method() === 'PUT') {
      currentMonth = route.request().postDataJSON();
      putCount += 1;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true, month: year === 2026 && month === 7 ? currentMonth : emptyMonth(year, month) } });
  });
  return { getPutCount: () => putCount, getMonth: () => currentMonth };
}

async function openJuly(page) {
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
}

test('Auto-Plan präsentiert BD und HG jedes Tages gemeinsam wie die Diensttabelle', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 920, height: 520 });
  const api = await mockApi(page);
  await openJuly(page);

  await page.locator('[data-ribbon-tab="auto-plan"]').click();
  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanConfig')).toBeVisible();
  await expect(page.locator('#autoPlanLimitBody tr')).toHaveCount(staff.length);
  await page.locator('#autoPlanSearchIntensity').selectOption('standard');
  await page.locator('#autoPlanRepairIterations').fill('3');
  await page.locator('#autoPlanStartBtn').click();
  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#autoPlanResultTitle')).toHaveText('Regelkonformer Vorschlag bereit');

  const table = page.locator('#autoPlanProposalTable');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveText(['Tag', 'Wochentag', 'BD', 'HG', 'Prüfung']);
  await expect(page.locator('#autoPlanProposalBody tr')).toHaveCount(31);

  const proposedRow = page.locator('#auto-plan-row-2026-07-15');
  await expect(proposedRow.locator('.auto-plan-assignment-cell.proposed')).toHaveCount(2);
  await expect(proposedRow.locator('.auto-plan-source-pill')).toHaveText(['Auto-Plan', 'Auto-Plan']);
  await expect(proposedRow).toContainText('Vorschläge');

  const fixedRow = page.locator('#auto-plan-row-2026-07-14');
  await expect(fixedRow.locator('.auto-plan-assignment-cell.fixed')).toHaveCount(2);
  await expect(fixedRow).toContainText('Fixpunkte');

  await expect(page.locator('#autoPlanSearchMetrics')).toContainText('Varianten geprüft');
  await expect(page.locator('#autoPlanSearchMetrics')).toContainText('Sackgassen');
  await expect(page.locator('#autoPlanSearchMetrics')).toContainText('Nachbarschaften');
  await expect(page.locator('#autoPlanRunConfig')).toContainText('Reparaturrunden: 3');
  await expect(page.locator('#autoPlanLoadTable .auto-plan-distribution-table')).toBeVisible();

  // Der Dialog hat genau einen Scrollbereich zwischen Kopf- und Fußleiste;
  // die Abschnitte darin wachsen frei und scrollen nicht für sich.
  const body = page.locator('#autoPlanBody');
  const scrollState = await body.evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY
  }));
  expect(scrollState.overflowY).toBe('auto');
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#autoPlanConfirmNote')).toBeInViewport();

  const sticky = await table.locator('thead th').first().evaluate(element => getComputedStyle(element).position);
  expect(sticky).toBe('sticky');
  await expect(page.locator('#autoPlanApplyBtn')).toBeVisible();
  expect(api.getPutCount()).toBe(0);

  await page.locator('#autoPlanApplyBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => api.getPutCount()).toBe(1);
  await expect.poll(() => Boolean(api.getMonth().days['2026-07-15'].bd && api.getMonth().days['2026-07-15'].hg)).toBe(true);
});
