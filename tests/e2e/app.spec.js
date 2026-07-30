import { test, expect } from '@playwright/test';

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, overrideLog: [], importLog: []
  };
}

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'becker', name: 'Dr. Becker', short: 'Becker', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true }
];

async function mockApi(page, month) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] }
  }));
  await page.route('**/api/month/**', async route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const year = Number(parts.at(-2));
    const monthNumber = Number(parts.at(-1));
    return route.fulfill({ json: { ok: true, month: year === month.year && monthNumber === month.month ? month : emptyMonth(year, monthNumber) } });
  });
}

test('Anwendung lädt im Browser und öffnet den BD-Picker', async ({ page }) => {
  const month = emptyMonth(2026, 7);
  await mockApi(page, month);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
  await page.locator('.assignment-btn').first().click();
  await expect(page.locator('#pickerDialog')).toBeVisible();
  await expect(page.locator('#pickerList .picker-item')).toHaveCount(2);
});

test('Becker-FZA nach Samstags-BD blockiert auch HG', async ({ page }) => {
  const month = emptyMonth(2026, 8);
  month.days['2026-08-01'].bd = 'becker';
  await mockApi(page, month);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '8');
  const monday = page.locator('tr').filter({ has: page.locator('td.date-cell', { hasText: /^3$/ }) });
  await monday.locator('.assignment-btn').nth(1).click();
  const becker = page.locator('#pickerList .picker-item').filter({ hasText: 'Dr. Becker' });
  await expect(becker).toHaveClass(/red/);
  await expect(becker).toContainText('FZA/Frei eingetragen');
});
