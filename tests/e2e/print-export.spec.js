import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

const readSurface = page => page.evaluate(() => ({
  accent: getComputedStyle(document.documentElement).getPropertyValue('--month-accent').trim(),
  field: getComputedStyle(document.documentElement).getPropertyValue('--weekday-field-bg').trim(),
  priority: document.documentElement.style.getPropertyPriority('--month-accent'),
  badge: document.getElementById('monthPaletteLabel')?.textContent || ''
}));

test('Der PDF-Export lässt den Monatskontrast auf dem Bildschirm unverändert', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.evaluate(() => { window.print = () => {}; });
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-key', '2026-07');

  // Auf das Ende des Verlaufs warten, nicht auf das Attribut allein: `settled`
  // steht auch noch vom vorherigen Monat, bevor der neue Verlauf überhaupt
  // beginnt. Verlässlich ist erst die Zielfarbe selbst.
  const target = await page.evaluate(async () => {
    const module = await import('/js/color-director.js?v=20260806.1');
    const [r, g, b] = module.colorProfileForDate(2026, 7).accent.slice(0, 3).map(value => Math.round(value));
    return `rgb(${r}, ${g}, ${b})`;
  });
  await expect.poll(async () => (await readSurface(page)).accent).toBe(target);
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-motion', 'settled');

  const before = await readSurface(page);
  expect(before.priority).toBe('important');

  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportPdfBtn')
  ]);
  expect(exported.suggestedFilename()).toBe('Dienstplan 2026-07.pdf');
  const duringExport = await readSurface(page);
  expect(duringExport).toEqual(before);

  // `beforeprint` läuft in Browsern zusätzlich zum Klick und darf die Farbe
  // ebenso wenig verändern.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect(await readSurface(page)).toEqual(before);

  await page.emulateMedia({ media: 'print' });
  const printed = await readSurface(page);
  expect(printed.accent).toBe(before.accent);
  expect(printed.field).toBe(before.field);

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  expect(await readSurface(page)).toEqual(before);
});

test('Ein Export mitten im Farbverlauf trägt die Zielfarbe, nicht einen Zwischenton', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-motion', 'settled');

  const target = await page.evaluate(async () => {
    const module = await import('/js/color-director.js?v=20260806.1');
    const palette = module.colorProfileForDate(2026, 1);
    const [r, g, b] = palette.accent.slice(0, 3).map(value => Math.round(value));
    return { accent: `rgb(${r}, ${g}, ${b})`, name: palette.name };
  });

  // Der Export erzeugt das Blatt selbst und liest die Farbe aus dem
  // Monatsprofil, nicht vom Bildschirm. Er ist damit unabhängig davon, wo der
  // Verlauf gerade steht — und genau das prüft dieser Klick mitten hinein.
  await page.selectOption('#monthSelect', '1');
  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportPdfBtn')
  ]);
  expect(exported.suggestedFilename()).toBe('Dienstplan 2026-01.pdf');

  const bytes = await readFile(await exported.path());
  const raw = bytes.toString('latin1');
  expect(raw.startsWith('%PDF')).toBe(true);
  expect(raw).toContain(`(Monatskontrast \\267 ${target.name}) Tj`.replace('\\267', '\xb7'));

  // Auf dem Bildschirm läuft der Verlauf ungestört zu Ende.
  await expect.poll(async () => (await readSurface(page)).accent).toBe(target.accent);
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-motion', 'settled');
});
