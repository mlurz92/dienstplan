import { test, expect } from '@playwright/test';

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1,
    year,
    month,
    revision: 0,
    updatedAt: null,
    days,
    absences: {},
    absenceSources: {},
    preferences: {},
    overrideLog: [],
    importLog: []
  };
}

async function mockApi(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: { ok: true, settings: { schemaVersion: 2 }, staff: [], rbnNames: [] }
  }));
  await page.route('**/api/month/**', async route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    await new Promise(resolve => setTimeout(resolve, 420));
    return route.fulfill({ json: { ok: true, month: emptyMonth(year, month) } });
  });
}

test('Monatswechsel bleibt sichtbar und läuft als flüssiger Farbverlauf', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '1');
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-key', '2026-01');
  await expect(page.locator('#monthTitle')).toContainText('Januar 2026');

  await page.evaluate(() => {
    window.__monthTransitionFrames = [];
    window.__monthTransitionCapture = true;
    const capture = () => {
      if (!window.__monthTransitionCapture) return;
      const root = document.documentElement;
      const printArea = document.getElementById('printArea');
      const style = printArea ? getComputedStyle(printArea) : null;
      window.__monthTransitionFrames.push({
        key: root.dataset.spectrumKey || '',
        accent: getComputedStyle(root).getPropertyValue('--month-accent').trim(),
        opacity: style ? Number(style.opacity) : 0,
        display: style?.display || '',
        rows: document.querySelectorAll('#planTableBody tr').length,
        title: document.getElementById('monthTitle')?.textContent || '',
        badge: document.getElementById('monthPaletteLabel')?.textContent || ''
      });
      requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  });

  // Der erste Quellframe muss tatsächlich aufgezeichnet sein, bevor die
  // Auswahl den Zielmonat setzt. Unter Last kann selectOption sonst noch vor
  // dem ersten requestAnimationFrame laufen und die Ausgangsfarbe fehlt.
  await page.waitForFunction(
    () => window.__monthTransitionFrames?.some(frame => frame.key === '2026-01'),
    null,
    { polling: 'raf' }
  );

  await page.selectOption('#monthSelect', '2');
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-key', '2026-02');
  await expect(page.locator('#monthTitle')).toContainText('Februar 2026');
  await page.waitForFunction(() => {
    const root = document.documentElement;
    return root.dataset.spectrumMotion === 'settled'
      && root.dataset.monthMotionState === 'idle';
  }, null, { polling: 'raf' });
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const frames = await page.evaluate(() => {
    window.__monthTransitionCapture = false;
    return window.__monthTransitionFrames;
  });

  const targetFrames = frames.filter(frame => frame.key === '2026-02' && frame.title.includes('Februar 2026'));
  expect(targetFrames.length).toBeGreaterThan(8);

  // Der Inhalt bleibt während des gesamten Wechsels vollständig sichtbar.
  expect(targetFrames.every(frame => frame.opacity === 1)).toBe(true);
  expect(targetFrames.every(frame => frame.display !== 'none')).toBe(true);
  expect(targetFrames.every(frame => frame.rows === 28)).toBe(true);

  // Das Badge nennt von der ersten Sekunde an den Zielmonat und wechselt nicht
  // mehrfach hin und her.
  expect(new Set(targetFrames.map(frame => frame.badge)).size).toBe(1);
  expect(targetFrames[0].badge).toMatch(/^Monatskontrast · /);

  // Die Farbe läuft als kontinuierlicher Verlauf mit echten Zwischenschritten
  // und endet exakt auf dem Zielprofil.
  const accents = targetFrames.map(frame => frame.accent);
  const startAccent = frames.find(frame => frame.key === '2026-01')?.accent;
  const finalAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--month-accent').trim());
  expect(startAccent).toBeTruthy();
  expect(accents.at(-1)).toBe(finalAccent);
  expect(new Set(accents).size).toBeGreaterThan(3);

  const intermediates = accents.filter(accent => accent !== startAccent && accent !== finalAccent);
  expect(intermediates.length).toBeGreaterThan(2);

  await expect(page.locator('html')).toHaveAttribute('data-month-transition', 'fluid-spectrum-v1');
  await expect(page.locator('html')).toHaveAttribute('data-spectrum-motion', 'settled');
});
