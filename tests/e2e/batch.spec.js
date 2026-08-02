import { test, expect } from '@playwright/test';

const STAFF = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true }
];

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    days[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, overrideLog: [], importLog: [] };
}

async function mockApi(page) {
  const store = new Map();
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: { ok: true, settings: { schemaVersion: 2 }, staff: STAFF, rbnNames: [] }
  }));
  await page.route('**/api/month/**', route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (route.request().method() === 'PUT') {
      store.set(key, JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true, month: store.get(key) || emptyMonth(year, month) } });
  });
}

test('die Sammeleingabe setzt und entfernt Abwesenheiten', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');

  const marks = page.locator('#planTableBody .absence-summary-cell .summary-entry');

  // Setzen
  await page.click('#absenceManagerBtn');
  await page.selectOption('#batchStaffSelect', 'lurz');
  await page.selectOption('#batchTypeSelect', 'urlaub');
  await page.locator('.batch-day').nth(2).click();
  await page.locator('.batch-day').nth(3).click();
  await page.click('#batchApplyBtn');
  await expect(marks).toHaveCount(2);

  // Der Dialog markiert die bestehenden Tage vor …
  await page.click('#absenceManagerBtn');
  await page.selectOption('#batchStaffSelect', 'lurz');
  await page.selectOption('#batchTypeSelect', 'urlaub');
  await expect(page.locator('.batch-day.selected')).toHaveCount(2);

  // … und eine Abwahl entfernt sie auch wieder.
  await page.click('#batchClearSelectionBtn');
  await page.locator('.batch-day').nth(2).click();
  await page.click('#batchApplyBtn');
  await expect(marks).toHaveCount(1);

  await page.click('#absenceManagerBtn');
  await page.selectOption('#batchStaffSelect', 'lurz');
  await page.selectOption('#batchTypeSelect', 'urlaub');
  await page.click('#batchClearSelectionBtn');
  await page.click('#batchApplyBtn');
  await expect(marks).toHaveCount(0);
});

test('die Sammeleingabe lässt andere Typen desselben Tages unberührt', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');

  await page.click('#absenceManagerBtn');
  await page.selectOption('#batchStaffSelect', 'lurz');
  await page.selectOption('#batchTypeSelect', 'urlaub');
  await page.locator('.batch-day').nth(0).click();
  await page.click('#batchApplyBtn');

  await page.click('#absenceManagerBtn');
  await page.selectOption('#batchStaffSelect', 'lurz');
  await page.selectOption('#batchTypeSelect', 'weiterbildung');
  await page.locator('.batch-day').nth(1).click();
  await page.click('#batchApplyBtn');

  const first = page.locator('#planTableBody tr').nth(0).locator('.absence-summary-cell');
  const second = page.locator('#planTableBody tr').nth(1).locator('.absence-summary-cell');
  await expect(first).toContainText('U');
  await expect(second).toContainText('WB');
});
