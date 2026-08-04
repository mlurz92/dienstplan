import { test, expect } from '@playwright/test';
import { openApp } from './open-app.js';

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, overrideLog: [], importLog: [] };
}

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'becker', name: 'Dr. Becker', short: 'Becker', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true }
];

async function installApi(page, { holdFirstPut = false } = {}) {
  const puts = [];
  let releaseFirst = null;
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] } }));
  await page.route('**/api/month/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'PUT') {
      puts.push(url.pathname);
      if (holdFirstPut && puts.length === 1) await new Promise(resolve => { releaseFirst = resolve; });
      return route.fulfill({ json: { ok: true } });
    }
    const parts = url.pathname.split('/');
    return route.fulfill({ json: { ok: true, month: emptyMonth(Number(parts.at(-2)), Number(parts.at(-1))) } });
  });
  return { puts, release: () => releaseFirst?.() };
}

test('schnelle Doppelnavigation speichert nur den tatsächlich geänderten Ausgangsmonat', async ({ page }) => {
  const api = await installApi(page, { holdFirstPut: true });
  await openApp(page);
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await page.locator('#planTableBody .assignment-btn').first().click();
  await page.locator('#pickerList .picker-item').filter({ hasText: 'Dr. Lurz' }).click();
  await page.locator('#nextMonthBtn').click();
  await page.locator('#nextMonthBtn').click();
  await expect(page.locator('#monthTitle')).toContainText('September 2026');
  await expect.poll(() => api.puts).toEqual(['/api/month/2026/07']);
  api.release();
  await expect(page.locator('#saveStatus')).not.toHaveText('Lädt …');
  await page.waitForTimeout(100);
  expect(api.puts).toEqual(['/api/month/2026/07']);
});

test('Monatsnavigation ergänzt Jahre außerhalb der anfänglichen Auswahlliste ohne leeren Jahreswert', async ({ page }) => {
  await installApi(page);
  await openApp(page);
  await page.selectOption('#yearSelect', '2031');
  await page.selectOption('#monthSelect', '12');
  await page.locator('#nextMonthBtn').click();
  await expect(page.locator('#yearSelect')).toHaveValue('2032');
  await expect(page.locator('#monthSelect')).toHaveValue('1');
  await expect(page.locator('#monthTitle')).toContainText('Januar 2032');
  await page.selectOption('#monthSelect', '2');
  await expect(page.locator('#monthTitle')).toContainText('Februar 2032');
});
