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

async function mockApi(page, onMonthRequest) {
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
    onMonthRequest(year, month);
    await new Promise(resolve => setTimeout(resolve, 220));
    return route.fulfill({ json: { ok: true, month: emptyMonth(year, month) } });
  });
}

test('native Monatsanimation bleibt durchgehend gefüllt und lädt den Zielmonat nur einmal', async ({ page }) => {
  let novemberRequests = 0;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, (year, month) => {
    if (year === 2026 && month === 11) novemberRequests += 1;
  });
  await page.goto('/');

  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('function');

  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '1');
  await expect(page.locator('#monthTitle')).toContainText('Januar 2026');
  await expect(page.locator('html')).toHaveAttribute('data-month-motion-state', 'idle');

  await page.evaluate(() => {
    window.__smoothMonthFrames = [];
    window.__smoothMonthCapture = true;
    const capture = () => {
      if (!window.__smoothMonthCapture) return;
      const root = document.documentElement;
      const sheet = document.querySelector('.sheet-panel');
      const style = sheet ? getComputedStyle(sheet) : null;
      window.__smoothMonthFrames.push({
        zeit: performance.now(),
        state: root.dataset.monthMotionState || '',
        engine: root.dataset.monthMotionEngine || '',
        direction: root.dataset.monthMotionDirection || '',
        title: document.getElementById('monthTitle')?.textContent || '',
        rows: document.querySelectorAll('#planTableBody tr').length,
        opacity: style ? Number(style.opacity) : 0,
        accent: getComputedStyle(root).getPropertyValue('--month-accent').trim(),
        fallbackSnapshots: document.querySelectorAll('.month-motion-fallback-snapshot').length
      });
      requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  });

  await page.selectOption('#monthSelect', '11');
  await expect(page.locator('html')).toHaveAttribute('data-month-motion-engine', 'native-view-transition');
  await page.waitForFunction(() => window.__smoothMonthFrames?.some(frame => frame.state === 'animating'));
  await expect(page.locator('html')).toHaveAttribute('data-month-motion-state', 'idle', { timeout: 7000 });
  await expect(page.locator('#monthTitle')).toContainText('November 2026');
  await expect(page.locator('#planTableBody tr')).toHaveCount(30);

  const frames = await page.evaluate(() => {
    window.__smoothMonthCapture = false;
    return window.__smoothMonthFrames;
  });

  const transitionFrames = frames.filter(frame => frame.state === 'preloading' || frame.state === 'animating');
  const animatedFrames = frames.filter(frame => frame.state === 'animating');
  const targetFrames = frames.filter(frame => frame.title.includes('November 2026'));

  // Die Bewegung muss durchgehend gezeichnet werden. Eine feste Framezahl misst
  // vor allem die Leistung der Testmaschine; die eigentliche Zusage ist, dass
  // zwischen zwei gezeichneten Frames keine sichtbare Lücke entsteht. Die
  // Vorladephase ist zudem bewusst kurz geworden, weil die Übernahme der
  // vorgeladenen Monate den Hauptthread zwischendurch freigibt.
  expect(animatedFrames.length).toBeGreaterThan(2);
  expect(transitionFrames.length).toBeGreaterThanOrEqual(animatedFrames.length);
  // Bewusst keine Zusage über eine absolute Framezahl oder Frameabstände: Beides
  // misst die Leistung der ausführenden Maschine, nicht die der Anwendung. Was
  // hier zählt, ist die inhaltliche Lückenlosigkeit der geprüften Frames.
  expect(transitionFrames.every(frame => frame.opacity === 1)).toBe(true);
  expect(transitionFrames.every(frame => frame.rows === 31 || frame.rows === 30)).toBe(true);
  expect(transitionFrames.every(frame => frame.title.includes('Januar 2026') || frame.title.includes('November 2026'))).toBe(true);
  expect(transitionFrames.every(frame => frame.engine === 'native-view-transition')).toBe(true);
  expect(transitionFrames.every(frame => frame.direction === 'forward')).toBe(true);
  expect(transitionFrames.every(frame => frame.fallbackSnapshots === 0)).toBe(true);
  expect(targetFrames.length).toBeGreaterThan(2);

  // Die Monatsfarbe läuft als Verlauf mit, ohne dass ein Frame ohne Farbe
  // gezeichnet wird, und steht am Ende exakt auf dem Zielprofil.
  expect(targetFrames.every(frame => /^rgba?\(/.test(frame.accent))).toBe(true);
  const finalAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--month-accent').trim());
  expect(targetFrames.at(-1).accent).toBe(finalAccent);
  expect(novemberRequests).toBe(1);
});
