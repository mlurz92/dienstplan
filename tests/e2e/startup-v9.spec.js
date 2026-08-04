import { test, expect } from '@playwright/test';

const staff = [
  {
    id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA',
    activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true,
    includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true
  },
  {
    id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ',
    activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true,
    includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false
  }
];

function emptyMonth(year, month) {
  const days = {};
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null, days,
    absences: {}, absenceSources: {}, preferences: {}, options: {},
    overrideLog: [], importLog: []
  };
}

async function mockBootstrap(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: {
      ok: true,
      settings: {
        schemaVersion: 4,
        appearance: { density: 'comfortable', richTooltips: true },
        workflow: { algorithmCommentary: true, studioVisualizer: true },
        autoPlan: {
          performanceProfile: 'adaptive', searchIntensity: 'standard',
          optimizationFocus: 'balanced', timeBudgetSeconds: 15,
          allowRedFallback: false, perfectionEnabled: true,
          certificationRounds: 2, portfolioDiversity: true
        }
      },
      staff,
      rbnNames: []
    }
  }));
  await page.route('**/api/month/**', route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    return route.fulfill({ json: { ok: true, month: emptyMonth(year, month) } });
  });
}

test('Anwendungsstart endet ohne JavaScript-Fehler und ohne endlosen Ladezustand', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await mockBootstrap(page);
  await page.goto('/');

  await expect(page.locator('#planTableBody tr')).toHaveCount(new Date(2026, 8, 0).getDate(), { timeout: 20_000 });
  await expect(page.locator('#saveStatus')).not.toHaveText('Lädt …');
  await expect(page.locator('#startupFailureV9')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-startup-state', 'ready');
  expect(errors.map(error => error.message)).toEqual([]);
});

test('Theme-Schalter startet auch vor Toolbar-Reorganisation ohne NotFoundError', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await mockBootstrap(page);

  // Reproduziert den früheren Absturzpfad: Ohne ui-controls bleibt settingsBtn
  // in einer verschachtelten .toolbar-group. ui-v8-5 muss den Theme-Schalter
  // dann in den tatsächlichen Elternknoten einsetzen, nicht in die Toolbar.
  await page.route('**/js/ui-controls.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'export {};'
  }));
  await page.goto('/');

  await expect(page.locator('#planTableBody tr')).toHaveCount(new Date(2026, 8, 0).getDate(), { timeout: 20_000 });
  await expect(page.locator('#themeModeBtn')).toBeVisible();
  await expect(page.locator('#settingsBtn')).toBeVisible();
  const siblings = await page.locator('#themeModeBtn').evaluate(element => ({
    sameParent: element.parentElement === document.getElementById('settingsBtn')?.parentElement,
    nextIsSettings: element.nextElementSibling?.id === 'settingsBtn'
  }));
  expect(siblings).toEqual({ sameParent: true, nextIsSettings: true });
  await expect(page.locator('#startupFailureV9')).toHaveCount(0);
  expect(errors.map(error => error.message)).toEqual([]);
});
