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
  await page.route('**/api/import', route => route.fulfill({ json: { ok: true } }));
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

test('Belegte Dienstfelder zeigen keinen Badge, der Picker aber weiterhin die Bewertung', async ({ page }) => {
  const month = emptyMonth(2026, 7);
  month.days['2026-07-01'].bd = 'lurz';
  await mockApi(page, month);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');

  const firstRow = page.locator('#planTableBody tr').first();
  const occupiedBd = firstRow.locator('.assignment-btn').first();
  const openHg = firstRow.locator('.assignment-btn').nth(1);

  await expect(occupiedBd.locator('.assignment-name')).toHaveText('Lurz');
  await expect(occupiedBd.locator('.assignment-badges')).toHaveCount(0);
  await expect(openHg.locator('.assignment-badges .small-chip')).toHaveText('offen');

  await occupiedBd.click();
  await expect(page.locator('#pickerDialog')).toBeVisible();
  const lurz = page.locator('#pickerList .picker-item').filter({ hasText: 'Dr. Lurz' });
  await expect(lurz.locator('.small-chip')).toHaveCount(1);
  await expect(lurz.locator('.reasons')).not.toBeEmpty();
});

test('Werkzeugleiste ist semantisch gruppiert und das Farbbadge bleibt frei vom Editionsnamen', async ({ page }) => {
  const month = emptyMonth(2026, 1);
  await mockApi(page, month);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '1');

  const toolbar = page.locator('.toolbar.toolbar-organized');
  await expect(toolbar).toBeVisible();
  // Die Einstellungen bilden keine Gruppe mehr: Sie sitzen als fixiertes
  // Zahnrad unmittelbar in der Leiste, damit sie in jeder Dichtestufe an
  // derselben Stelle erreichbar bleiben.
  await expect(toolbar.locator('.toolbar-section')).toHaveCount(3);
  await expect(toolbar.locator('.toolbar-section-label')).toHaveText(['Planung', 'Daten', 'Ausgabe']);
  await expect(toolbar.locator('.toolbar-section .tool-action')).toHaveCount(11);
  await expect(toolbar.locator('#autoPlanBtn')).toBeVisible();
  await expect(toolbar.locator('#autoPlanBtn .tool-icon')).toHaveCount(1);
  // Die Überlauf-Schaltfläche gehört zur Leiste, aber zu keiner Gruppe.
  await expect(toolbar.locator('#toolbarOverflowBtn')).toHaveCount(1);
  await expect(page.locator('#todayBtn .tool-icon')).toHaveCount(1);
  await expect(page.locator('#clearMonthBtn')).toHaveClass(/tool-action--danger/);
  await expect(page.locator('#excelImportInput').locator('xpath=..')).toHaveAttribute('aria-label', 'Excel-Datei importieren');
  const gear = toolbar.locator('#settingsBtn');
  await expect(gear).toBeVisible();
  await expect(gear).toHaveClass(/tool-action--pinned/);
  await expect(gear).toHaveClass(/tool-action--icon-only/);
  await expect(gear.locator('.tool-icon')).toHaveCount(1);
  await expect(gear).toHaveAttribute('aria-label', 'Einstellungen der Anwendung öffnen');
  // Das Zahnrad gehört zu keiner Gruppe und liegt hinter der Überlauf-Schaltfläche.
  await expect(toolbar.locator('.toolbar-section #settingsBtn')).toHaveCount(0);

  await expect(page.locator('html')).toHaveAttribute('data-spectrum-key', '2026-01');
  const badge = page.locator('#monthPaletteLabel');
  await expect(badge).toHaveText(/^Monatskontrast · \S.+$/);
  await expect(badge).not.toContainText('Cloud Veil');
  await expect(badge).toHaveAttribute('title', /^Winter · Eis · Polarlicht · \S.+ · \S.+ · \S.+ · 2026$/);
  await expect.poll(() => page.evaluate(() => {
    const name = document.documentElement.dataset.spectrumPalette || '';
    return document.getElementById('monthPaletteLabel')?.textContent === `Monatskontrast · ${name}`;
  })).toBe(true);
});

test('Einstellungen öffnen fokussiert, validiert, speichert und stellt Fokus wieder her', async ({ page }) => {
  const month = emptyMonth(2026, 7);
  await mockApi(page, month);
  await page.goto('/');

  const trigger = page.locator('#settingsBtn');
  await trigger.click();
  const dialog = page.locator('#settingsDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#settingsTitle')).toBeFocused();
  await expect(page.locator('#settingsPerformanceProfile')).toHaveValue('adaptive');
  await expect(page.locator('#settingsSearchIntensity')).toHaveValue('deep');
  await expect(page.locator('#settingsTimeBudget')).toHaveValue('120');

  await page.locator('#settingsDensity').selectOption('compact');
  await page.locator('#settingsMotion').selectOption('reduced');
  // Die Auto-Plan-Werte liegen in einem eigenen Reiter.
  await page.locator('#settingsTabAutoPlan').click();
  await expect(page.locator('#settingsPanelAutoPlan')).toBeVisible();
  await page.locator('#settingsPerformanceProfile').selectOption('responsive');
  await page.locator('#settingsSearchIntensity').selectOption('standard');
  await page.locator('#settingsTimeBudget').fill('45');
  await page.locator('#settingsAllowRed').uncheck();
  await page.locator('#settingsSaveBtn').click();

  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-app-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');

  await trigger.click();
  await expect(page.locator('#settingsPanelAppearance')).toBeVisible();
  await expect(page.locator('#settingsPerformanceProfile')).toHaveValue('responsive');
  await expect(page.locator('#settingsSearchIntensity')).toHaveValue('standard');
  await expect(page.locator('#settingsTimeBudget')).toHaveValue('45');
  await expect(page.locator('#settingsAllowRed')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
