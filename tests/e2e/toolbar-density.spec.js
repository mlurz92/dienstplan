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
    json: { ok: true, settings: { schemaVersion: 2 }, staff: [], rbnNames: [] }
  }));
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const parts = new URL(route.request().url()).pathname.split('/');
    return route.fulfill({ json: { ok: true, month: emptyMonth(Number(parts.at(-2)), Number(parts.at(-1))) } });
  });
}

/**
 * Misst die Leiste im Browser: Überlagerungen, Beschnitt und waagerechten
 * Seitenbildlauf. Aktionen im geschlossenen Überlaufmenü zählen nicht mit.
 */
const inspectToolbar = page => page.evaluate(() => {
  const toolbar = document.querySelector('.toolbar.toolbar-organized');
  const bar = toolbar.getBoundingClientRect();
  const actions = [...toolbar.querySelectorAll('.tool-action')]
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0);

  let overlaps = 0;
  for (let index = 1; index < actions.length; index += 1) {
    const previous = actions[index - 1];
    const current = actions[index];
    if (Math.abs(previous.top - current.top) < 5 && current.left < previous.right - .5) overlaps += 1;
  }

  const sections = [...toolbar.querySelectorAll('.toolbar-section')].map(element => element.getBoundingClientRect());
  let sectionOverlaps = 0;
  for (let index = 1; index < sections.length; index += 1) {
    const previous = sections[index - 1];
    const current = sections[index];
    if (Math.abs(previous.top - current.top) < 5 && current.left < previous.right - .5) sectionOverlaps += 1;
  }

  return {
    density: toolbar.dataset.toolbarDensity,
    overlaps,
    sectionOverlaps,
    clipped: actions.filter(rect => rect.left < bar.left - .5 || rect.right > bar.right + .5).length,
    pageScroll: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    visibleActions: actions.length
  };
});

test('die Werkzeugleiste überlagert sich bei keiner Fensterbreite', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.toolbar.toolbar-organized')).toBeVisible();

  const densities = new Set();
  for (let width = 1700; width >= 340; width -= 40) {
    await page.setViewportSize({ width, height: 900 });
    const report = await expect.poll(async () => {
      const state = await inspectToolbar(page);
      return state.overlaps + state.sectionOverlaps + state.clipped + Math.max(0, state.pageScroll);
    }, { message: `Breite ${width}` }).toBe(0).then(() => inspectToolbar(page));
    densities.add(report.density);
    expect(report.visibleActions, `Breite ${width}: keine Aktion sichtbar`).toBeGreaterThan(0);
  }

  // Die Leiste nutzt den Platz tatsächlich aus, statt sofort auf eine Stufe
  // zusammenzufallen.
  expect(densities.size).toBeGreaterThanOrEqual(3);
  expect(densities.has('full')).toBe(true);
});

test('die Dichte folgt dem Platz und nicht festen Schwellen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const densityAt = async width => {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await inspectToolbar(page)).density !== undefined).toBe(true);
    await page.waitForTimeout(120);
    return (await inspectToolbar(page)).density;
  };

  const order = ['full', 'groups', 'secondary', 'icons', 'overflow'];
  const wide = await densityAt(1700);
  const medium = await densityAt(1200);
  const narrow = await densityAt(900);
  const tiny = await densityAt(360);

  expect(order.indexOf(wide)).toBeLessThanOrEqual(order.indexOf(medium));
  expect(order.indexOf(medium)).toBeLessThanOrEqual(order.indexOf(narrow));
  expect(order.indexOf(narrow)).toBeLessThan(order.indexOf(tiny));
  expect(tiny).toBe('overflow');

  // Zurück in die Breite: Die Leiste muss ihre volle Stufe wiederfinden.
  expect(await densityAt(1700)).toBe('full');
  await expect(page.locator('.toolbar-section')).toHaveCount(3);
});

test('das Überlaufmenü zeigt die ausgelagerten Aktionen vollständig beschriftet', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(async () => (await inspectToolbar(page)).density).toBe('overflow');

  const trigger = page.locator('#toolbarOverflowBtn');
  const panel = page.locator('#toolbarOverflowPanel');
  await expect(trigger).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  // Fünf statt sechs: Excel- und JSON-Import teilen sich einen Eingang.
  await expect(panel.locator('.tool-action')).toHaveCount(5);
  await expect(panel).toContainText('Neu laden');
  await expect(panel).toContainText('PDF');
  // Die Einstellungen wandern nicht mehr ins Menü: Das Zahnrad bleibt auch in
  // der engsten Stufe unmittelbar in der Leiste erreichbar.
  await expect(panel.locator('#settingsBtn')).toHaveCount(0);
  await expect(page.locator('.toolbar #settingsBtn')).toBeVisible();

  // Das Menü liegt über der Monatskarte und wird von der Leiste nicht beschnitten.
  const covering = await page.evaluate(() => {
    const rect = document.getElementById('toolbarOverflowPanel').getBoundingClientRect();
    const element = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12);
    return Boolean(element?.closest('#toolbarOverflowPanel'));
  });
  expect(covering).toBe(true);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  // Wird es wieder breit, kehren die Gruppen in die Leiste zurück.
  await page.setViewportSize({ width: 1700, height: 900 });
  await expect.poll(async () => (await inspectToolbar(page)).density).toBe('full');
  await expect(page.locator('.toolbar .toolbar-section')).toHaveCount(3);
  await expect(page.locator('#exportPdfBtn')).toBeVisible();
});
