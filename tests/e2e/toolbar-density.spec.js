import { test, expect } from '@playwright/test';

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    days[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, overrideLog: [], importLog: [] };
}

async function mockApi(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: { ok: true, settings: { schemaVersion: 4 }, staff: [], rbnNames: [] }
  }));
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const parts = new URL(route.request().url()).pathname.split('/');
    return route.fulfill({ json: { ok: true, month: emptyMonth(Number(parts.at(-2)), Number(parts.at(-1))) } });
  });
}

async function inspectOfficeChrome(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('.office-workspace').getBoundingClientRect();
    const visibleActions = [...document.querySelectorAll('.office-ribbon .tool-action')]
      .filter(element => element.getClientRects().length > 0)
      .map(element => element.getBoundingClientRect());
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedActions: visibleActions.filter(rect => rect.left < workspace.left - 1 || rect.right > workspace.right + 1).length,
      visibleActions: visibleActions.length
    };
  });
}

test('active ribbon commands stay inside every supported viewport', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  for (const width of [1700, 1366, 1024, 768, 390, 340]) {
    await page.setViewportSize({ width, height: 900 });
    const report = await inspectOfficeChrome(page);
    expect(report.pageOverflow, `Breite ${width}`).toBeLessThanOrEqual(0);
    expect(report.clippedActions, `Breite ${width}`).toBe(0);
    expect(report.visibleActions, `Breite ${width}`).toBeGreaterThan(0);
  }
});

test('each ribbon tab exposes at least one labeled command', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const tabs = page.locator('.office-ribbon-tabs [role="tab"]');
  for (let index = 0; index < await tabs.count(); index += 1) {
    const tab = tabs.nth(index);
    await tab.click();
    const panelId = await tab.getAttribute('aria-controls');
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.tool-action')).not.toHaveCount(0);
    const labels = await panel.locator('.tool-action').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
    expect(labels.every(Boolean)).toBe(true);
  }
});

test('arrow keys move through ribbon tabs with automatic activation', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const start = page.locator('[data-ribbon-tab="home"]');
  await start.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-ribbon-tab="planning"]')).toBeFocused();
  await expect(page.locator('[data-ribbon-tab="planning"]')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(page.locator('[data-ribbon-tab="file"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-ribbon-tab="view"]')).toBeFocused();
});
