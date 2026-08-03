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

async function mockApi(page, { theme = 'system', bootstrapDelay = 0, seedMonth = null, saveFails = false } = {}) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', async route => {
    if (bootstrapDelay) await new Promise(resolve => setTimeout(resolve, bootstrapDelay));
    return route.fulfill({
      json: {
        ok: true,
        settings: { schemaVersion: 4, appearance: { theme } },
        staff: [],
        rbnNames: []
      }
    });
  });
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') {
      if (saveFails) return route.fulfill({ status: 503, json: { ok: false, error: 'Test offline' } });
      return route.fulfill({ json: { ok: true } });
    }
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    const payload = seedMonth?.year === year && seedMonth?.month === month
      ? structuredClone(seedMonth)
      : emptyMonth(year, month);
    return route.fulfill({
      json: { ok: true, month: payload }
    });
  });
}

test('workspace exposes the Excel 365 window hierarchy', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await expect(page.locator('.office-titlebar')).toBeVisible();
  await expect(page.locator('.office-ribbon-tabs [role="tab"]')).toHaveCount(6);
  await expect(page.locator('.office-ribbon')).toBeVisible();
  await expect(page.locator('.office-formula-bar')).toBeVisible();
  await expect(page.locator('.office-workbook')).toBeVisible();
  await expect(page.locator('.office-sheet-tabs')).toBeVisible();
  await expect(page.locator('.office-statusbar')).toBeVisible();

  await expect(page.locator('.office-ribbon-tabs [role="tab"]')).toHaveText([
    'Datei', 'Start', 'Planung', 'Auto-Plan', 'Daten', 'Ansicht'
  ]);
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute('data-ribbon-tab', 'home');
  await expect(page.locator('.office-formula-name')).toContainText('MONAT');
  await expect(page.locator('#workbookSaveStatus')).toContainText('Gespeichert');
  await expect(page.locator('#workbookSaveStatus')).toHaveAttribute('data-save-mode', 'saved');
});

test('ribbon tabs expose their assigned commands', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.locator('[data-ribbon-tab="auto-plan"]').click();
  await expect(page.locator('#autoPlanBtn')).toBeVisible();
  await expect(page.locator('#todayBtn')).toBeHidden();

  await page.locator('[data-ribbon-tab="data"]').click();
  await expect(page.locator('#reloadBtn')).toBeVisible();

  await page.locator('[data-ribbon-tab="file"]').click();
  await expect(page.locator('#excelImportInput').locator('xpath=..')).toBeVisible();
  await expect(page.locator('#exportExcelBtn')).toBeVisible();
  await expect(page.locator('#exportPdfBtn')).toBeVisible();

  await page.locator('[data-ribbon-tab="view"]').click();
  await expect(page.locator('#settingsBtn')).toBeVisible();
});

test('Ctrl+F1 toggles the ribbon command surface', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const ribbon = page.locator('.office-ribbon');
  await expect(ribbon).toBeVisible();
  await page.keyboard.press('Control+F1');
  await expect(page.locator('.office-workspace')).toHaveAttribute('data-ribbon-collapsed', 'true');
  await expect(ribbon).toBeHidden();
  await page.keyboard.press('Control+F1');
  await expect(page.locator('.office-workspace')).toHaveAttribute('data-ribbon-collapsed', 'false');
  await expect(ribbon).toBeVisible();
});

test('Alt+Q finds a command, opens its ribbon tab and never executes it', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.keyboard.press('Alt+Q');
  const search = page.locator('#officeCommandSearch');
  await expect(search).toBeFocused();
  await search.fill('Einstellungen');
  await search.press('Enter');

  await expect(page.locator('[data-ribbon-tab="view"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#settingsBtn')).toBeFocused();
  await expect(page.locator('#settingsDialog')).toBeHidden();
  await expect(search).toHaveValue('');
});

test('Alt+Q expands a collapsed ribbon before focusing the matching command', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.keyboard.press('Control+F1');
  await expect(page.locator('.office-ribbon')).toBeHidden();
  await page.keyboard.press('Alt+Q');
  const search = page.locator('#officeCommandSearch');
  await search.fill('Einstellungen');
  await search.press('Enter');

  await expect(page.locator('.office-workspace')).toHaveAttribute('data-ribbon-collapsed', 'false');
  await expect(page.locator('.office-ribbon')).toBeVisible();
  await expect(page.locator('#settingsBtn')).toBeFocused();
});

test('responsive workbook footer mirrors an offline save failure', async ({ page }) => {
  const now = new Date();
  const seedMonth = emptyMonth(now.getFullYear(), now.getMonth() + 1);
  seedMonth.days[Object.keys(seedMonth.days)[0]].bd = 'extern:Testdienst';
  await mockApi(page, { seedMonth, saveFails: true });
  await page.setViewportSize({ width: 1024, height: 800 });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/');

  await page.locator('[data-ribbon-tab="planning"]').click();
  await page.locator('#clearMonthBtn').click();

  const status = page.locator('#workbookSaveStatus');
  await expect(status).toBeVisible();
  await expect(status).toContainText('nur lokal geleert – Serverfehler');
  await expect(status).toHaveAttribute('data-save-mode', 'offline');
});

test('formula bar follows the focused worksheet cell', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const firstBd = page.locator('#planTable tbody tr').first().locator('td').nth(2).locator('button');
  await firstBd.focus();

  await expect(page.locator('.office-formula-name')).toHaveText('C2');
  await expect(page.locator('.office-formula-value')).toContainText('BD');
});

test('sheet tabs navigate workbook sections and open Auto-Plan in context', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const sheets = page.locator('.office-sheet-tab');
  await sheets.filter({ hasText: 'Statistik' }).click();
  await expect(sheets.filter({ hasText: 'Statistik' })).toHaveAttribute('aria-current', 'true');

  await sheets.filter({ hasText: 'Offene Punkte' }).click();
  await expect(sheets.filter({ hasText: 'Offene Punkte' })).toHaveAttribute('aria-current', 'true');

  await sheets.filter({ hasText: 'Auto-Plan' }).click();
  await expect(page.locator('[data-ribbon-tab="auto-plan"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#autoPlanDialog')).toBeVisible();
});

test('light theme limits Aero Glass to application chrome', async ({ page }) => {
  await mockApi(page, { theme: 'light' });
  await page.goto('/');

  const styles = await page.evaluate(() => {
    const read = selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return {
        backdrop: style.backdropFilter,
        background: style.backgroundColor,
        color: style.color
      };
    };
    return {
      titlebar: read('.office-titlebar'),
      ribbon: read('.office-ribbon'),
      cell: read('.plan-table tbody td')
    };
  });

  expect(styles.titlebar.backdrop).not.toBe('none');
  expect(styles.ribbon.backdrop).not.toBe('none');
  expect(styles.cell.backdrop).toBe('none');
  expect(styles.cell.background).toMatch(/^rgb\(/);
});

test('dark theme keeps the worksheet opaque', async ({ page }) => {
  await mockApi(page, { theme: 'dark' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'dark');
  const surfaces = await page.evaluate(() => {
    const sheet = getComputedStyle(document.querySelector('.office-workbook'));
    const cell = getComputedStyle(document.querySelector('.plan-table tbody td'));
    return {
      sheetBackground: sheet.backgroundColor,
      cellBackground: cell.backgroundColor,
      cellBackdrop: cell.backdropFilter
    };
  });
  expect(surfaces.sheetBackground).toMatch(/^rgb\(/);
  expect(surfaces.cellBackground).toMatch(/^rgb\(/);
  expect(surfaces.cellBackdrop).toBe('none');
});

test('mobile workspace contains chrome without page overflow', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const report = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    tabsOverflow: getComputedStyle(document.querySelector('.office-ribbon-tabs')).overflowX,
    sheetOverflow: getComputedStyle(document.querySelector('.plan-table-wrap')).overflowX
  }));
  expect(report.page).toBeLessThanOrEqual(report.viewport);
  expect(report.tabsOverflow).toBe('auto');
  expect(report.sheetOverflow).toBe('auto');

  await page.locator('[data-ribbon-tab="view"]').click();
  await expect(page.locator('#settingsBtn')).toBeVisible();
});

test('print media hides the Office chrome', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });

  for (const selector of [
    '.office-titlebar',
    '.office-ribbon-tabs',
    '.office-ribbon',
    '.office-formula-bar',
    '.office-sheet-tabs',
    '.office-statusbar'
  ]) {
    await expect(page.locator(selector), selector).toBeHidden();
  }
});
