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

function rgbChannels(value) {
  const srgb = value.match(/^color\(srgb\s+([^)]+)\)$/i);
  const channels = srgb
    ? srgb[1].split(/[\s/]+/).filter(Boolean).slice(0, 3).map(channel => Number(channel) * 255)
    : value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Ungültige CSS-Farbe: ${value}`);
  return channels;
}

function relativeLuminance(value) {
  return rgbChannels(value)
    .map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

async function mockApi(page, { bootstrapDelay = 0 } = {}) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', async route => {
    if (bootstrapDelay) await new Promise(resolve => setTimeout(resolve, bootstrapDelay));
    return route.fulfill({ json: { ok: true, settings: { schemaVersion: 3 }, staff, rbnNames: [] } });
  });
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const parts = new URL(route.request().url()).pathname.split('/');
    return route.fulfill({ json: { ok: true, month: emptyMonth(Number(parts.at(-2)), Number(parts.at(-1))) } });
  });
}

test('theme setting supports system, light and dark and persists in the session', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.locator('#settingsBtn').click();
  const theme = page.locator('#settingsTheme');
  await expect(theme).toHaveValue('system');
  await expect(theme.locator('option')).toHaveText(['Systemeinstellung', 'Hell', 'Dunkel']);

  await theme.selectOption('dark');
  await page.locator('#settingsSaveBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('dark');

  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsTheme')).toHaveValue('dark');
});

test('stored explicit theme is applied before the asynchronous bootstrap finishes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dienstplanrad:bootstrap', JSON.stringify({
    settings: { schemaVersion: 4, appearance: { theme: 'dark' } },
    staff: [],
    rbnNames: []
  })));
  await mockApi(page, { bootstrapDelay: 1800 });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'dark', { timeout: 500 });
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#111820', { timeout: 500 });
});

test('primary application controls meet the clinical workspace target size', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const report = await page.evaluate(() => [...document.querySelectorAll(
    '.topbar button, .topbar select, .toolbar .tool-action'
  )].filter(element => element.getClientRects().length).map(element => {
    const rect = element.getBoundingClientRect();
    return { id: element.id, width: rect.width, height: rect.height };
  }));

  expect(report.length).toBeGreaterThan(8);
  for (const target of report) {
    expect(target.width, `${target.id} width`).toBeGreaterThanOrEqual(36);
    expect(target.height, `${target.id} height`).toBeGreaterThanOrEqual(36);
  }
});

test('decorative chrome stays still while meaningful reduced motion remains supported', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const animationNames = await page.evaluate(() => [
    ...[...document.querySelectorAll('.ambient-orb')].map(element => getComputedStyle(element).animationName),
    getComputedStyle(document.querySelector('.glass-panel'), '::before').animationName
  ]);
  expect(animationNames.every(name => name === 'none')).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('.sheet-panel').evaluate(element => getComputedStyle(element).animationDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
});

test('dark workspace keeps schedule and Auto-Plan surfaces legible', async ({ page }) => {
  expect(rgbChannels('color(srgb 0.5 0.25 1)')).toEqual([127.5, 63.75, 255]);
  await mockApi(page);
  await page.goto('/');

  await page.locator('#settingsBtn').click();
  await page.locator('#settingsTheme').selectOption('dark');
  await page.locator('#settingsSaveBtn').click();

  const weekend = await page.locator('.plan-table tr.saturday-row td.weekday-cell').first().evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(relativeLuminance(weekend.background), 'weekend surface luminance').toBeLessThan(0.28);
  expect(contrastRatio(weekend.color, weekend.background), 'weekend text contrast').toBeGreaterThanOrEqual(4.5);

  const weekday = await page.locator('.plan-table tr:not(.saturday-row):not(.sunday-row):not(.holiday-row) td.weekday-cell').first().evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(relativeLuminance(weekday.background), 'weekday surface luminance').toBeLessThan(0.28);
  expect(contrastRatio(weekday.color, weekday.background), 'weekday text contrast').toBeGreaterThanOrEqual(4.5);

  await page.locator('#absenceManagerBtn').click();
  const calendarWeekends = await page.locator('.batch-day.saturday, .batch-day.sunday').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { className: element.className, color: style.color, background: style.backgroundColor };
  }));
  expect(calendarWeekends.length).toBeGreaterThan(6);
  for (const day of calendarWeekends) {
    expect(relativeLuminance(day.background), `${day.className} surface luminance`).toBeLessThan(0.28);
    expect(contrastRatio(day.color, day.background), `${day.className} text contrast`).toBeGreaterThanOrEqual(4.5);
  }
  await page.keyboard.press('Escape');

  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanDialog')).toHaveClass(/is-configuring/);

  const surfaces = await page.locator('.auto-plan-switch, .auto-plan-context-list div, .auto-plan-guardrail-flow li, .auto-plan-guardrail-flow li > b, .auto-plan-guardrail-note').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { className: element.className, color: style.color, background: style.backgroundColor };
  }));

  expect(surfaces.length).toBeGreaterThan(8);
  for (const surface of surfaces) {
    expect(relativeLuminance(surface.background), `${surface.className} surface luminance`).toBeLessThan(0.32);
    expect(contrastRatio(surface.color, surface.background), `${surface.className} text contrast`).toBeGreaterThanOrEqual(4.5);
  }

  const textPairs = await page.evaluate(() => [
    ['.auto-plan-v7-5-ribbon b', '.auto-plan-v7-5-ribbon'],
    ['.auto-plan-card header > span', '.auto-plan-card'],
    ['.auto-plan-context-list strong', '.auto-plan-context-list div'],
    ['.auto-plan-guardrail-flow strong', '.auto-plan-guardrail-flow li'],
    ['#autoPlanStartBtn', '#autoPlanStartBtn']
  ].map(([foregroundSelector, backgroundSelector]) => {
    const foreground = document.querySelector(foregroundSelector);
    const background = document.querySelector(backgroundSelector);
    return {
      foregroundSelector,
      color: getComputedStyle(foreground).color,
      background: getComputedStyle(background).backgroundColor
    };
  }));
  for (const pair of textPairs) {
    expect(contrastRatio(pair.color, pair.background), `${pair.foregroundSelector} contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test('system theme and Windows high contrast preferences are respected', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'system');
  const systemSurface = await page.locator('.sheet-panel').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(relativeLuminance(systemSurface)).toBeLessThan(0.12);

  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
  await expect(page.locator('.ambient-layer')).toHaveCSS('display', 'none');
  await page.locator('#settingsBtn').focus();
  await expect(page.locator('#settingsBtn')).toHaveCSS('outline-style', 'solid');
});

test('mobile schedule preserves orientation and statistics reflow without overlap', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.plan-table-wrap')).toHaveCSS('overflow-x', 'auto');
  await expect(page.locator('.plan-table tbody tr').first().locator('td').nth(0)).toHaveCSS('position', 'sticky');
  await expect(page.locator('.plan-table tbody tr').first().locator('td').nth(1)).toHaveCSS('position', 'sticky');

  const firstStatRow = page.locator('.distribution-table tbody tr').first();
  await expect(firstStatRow).toHaveCSS('display', 'grid');
  await expect(firstStatRow.locator('td').nth(1)).toHaveAttribute('data-label', 'BD');

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    stats: document.querySelector('.excel-stats').getBoundingClientRect().width,
    sheet: document.querySelector('.sheet-panel').getBoundingClientRect().width
  }));
  expect(layout.page).toBeLessThanOrEqual(layout.viewport);
  expect(layout.stats).toBeLessThanOrEqual(layout.sheet);

  await page.locator('#toolbarOverflowBtn').click();
  await page.locator('#settingsBtn').click();
  await page.waitForTimeout(350);
  const settingsLayout = await page.locator('.settings-card').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight
    };
  });
  expect(settingsLayout.left).toBeGreaterThanOrEqual(0);
  expect(settingsLayout.right).toBeLessThanOrEqual(settingsLayout.viewportWidth);
  expect(settingsLayout.top).toBeGreaterThanOrEqual(0);
  expect(settingsLayout.bottom).toBeLessThanOrEqual(settingsLayout.viewportHeight);
  await expect(page.locator('.settings-body')).toHaveCSS('overflow-y', 'auto');
});
