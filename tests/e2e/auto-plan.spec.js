import { test, expect } from '@playwright/test';

function monthWithTwoOpenSlots(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = {
      bd: 'extern:Bestand BD',
      hg: 'extern:Bestand HG',
      rbn1: '',
      rbn2: '',
      notes: ''
    };
  }
  days[`${year}-${String(month).padStart(2, '0')}-15`].bd = '';
  days[`${year}-${String(month).padStart(2, '0')}-15`].hg = '';
  return {
    schemaVersion: 1,
    year,
    month,
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

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: []
  };
}

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

async function mockApi(page) {
  let currentMonth = monthWithTwoOpenSlots(2026, 7);
  let putCount = 0;

  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] }
  }));
  await page.route('**/api/month/**', async route => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    if (route.request().method() === 'PUT') {
      currentMonth = route.request().postDataJSON();
      putCount += 1;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        ok: true,
        month: year === 2026 && month === 7 ? currentMonth : emptyMonth(year, month)
      }
    });
  });

  return {
    getMonth: () => currentMonth,
    getPutCount: () => putCount
  };
}

test('Auto-Plan animiert den Optimierungslauf und schreibt erst nach Bestätigung', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');

  const targetRow = page.locator('#planTableBody tr').filter({ has: page.locator('td.date-cell', { hasText: /^15$/ }) });
  await expect(targetRow.locator('.assignment-badges .small-chip')).toHaveCount(2);
  await expect(page.locator('#autoPlanBtn')).toBeVisible();

  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeVisible();
  await expect(page.locator('#autoPlanCanvas')).toBeVisible();
  await expect(page.locator('#autoPlanPhaseList .auto-plan-phase')).toHaveCount(5);
  await expect(page.locator('#autoPlanGrid > span')).toHaveCount(62);
  await expect(page.locator('#autoPlanPercent')).not.toHaveText('');

  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#autoPlanResultTitle')).toHaveText('Regelkonformer Vorschlag bereit');
  await expect(page.locator('#autoPlanChangeCount')).toHaveText('2 Einträge');
  await expect(page.locator('#autoPlanScorecards')).toContainText('0 rot');
  await expect(page.locator('#autoPlanApplyBtn')).toBeVisible();

  // Die Berechnung selbst verändert den Monatsplan und den Serverstand nicht.
  expect(api.getPutCount()).toBe(0);
  await expect(targetRow.locator('.assignment-badges .small-chip')).toHaveCount(2);

  await page.locator('#autoPlanApplyBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => api.getPutCount()).toBe(1);
  await expect.poll(() => Boolean(api.getMonth().days['2026-07-15'].bd && api.getMonth().days['2026-07-15'].hg)).toBe(true);
  await expect.poll(async () => targetRow.locator('.assignment-badges .small-chip').count()).toBe(0);
});
