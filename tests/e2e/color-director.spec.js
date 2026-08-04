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

async function mockApi(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ok: true, settings: { schemaVersion: 2 }, staff: [], rbnNames: [] } }));
  await page.route('**/api/month/**', route => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: { ok: true, month: emptyMonth(year, month) } });
  });
}

test('Seasonal Spectrum Director controls the visible application palette', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await page.selectOption('#yearSelect', '2026');

  const accents = [];
  const names = [];
  for (let month = 1; month <= 12; month += 1) {
    await page.selectOption('#monthSelect', String(month));
    await expect(page.locator('html')).toHaveAttribute('data-spectrum-key', `2026-${String(month).padStart(2, '0')}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyPriority('--month-accent'))).toBe('important');
    const state = await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--month-accent').trim(),
      priority: document.documentElement.style.getPropertyPriority('--month-accent'),
      name: document.documentElement.dataset.spectrumPalette || '',
      badge: document.getElementById('monthPaletteLabel')?.textContent || ''
    }));
    accents.push(state.accent);
    names.push(state.name);
    expect(state.priority).toBe('important');
    expect(state.badge).toBe(`Monatskontrast · ${state.name}`);
    expect(state.badge).not.toContain('Cloud Veil');
  }

  expect(new Set(accents).size).toBe(12);
  expect(new Set(names).size).toBeGreaterThanOrEqual(10);
});

test('the same month changes strongly with the year while the 24-year cycle stays deterministic', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await page.selectOption('#monthSelect', '1');

  const samples = [];
  for (const year of ['2026', '2027', '2028', '2029', '2030']) {
    await page.selectOption('#yearSelect', year);
    await expect(page.locator('html')).toHaveAttribute('data-spectrum-key', `${year}-01`);
    samples.push(await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--month-accent').trim(),
      name: document.documentElement.dataset.spectrumPalette,
      mood: document.documentElement.dataset.spectrumMood
    })));
  }

  expect(new Set(samples.map(sample => sample.accent)).size).toBe(5);
  expect(new Set(samples.map(sample => sample.mood)).size).toBe(5);
});
