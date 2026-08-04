import { test, expect } from '@playwright/test';

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    days[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = {
      bd: '', hg: '', rbn1: '', rbn2: '', notes: ''
    };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {},
    overrideLog: [], importLog: []
  };
}

async function mockApi(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: {
      ok: true,
      settings: {
        schemaVersion: 4,
        appearance: { density: 'comfortable', motion: 'reduced', richTooltips: true },
        workflow: {},
        autoPlan: {}
      },
      staff: [],
      rbnNames: []
    }
  }));
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const parts = new URL(route.request().url()).pathname.split('/');
    return route.fulfill({
      json: { ok: true, month: emptyMonth(Number(parts.at(-2)), Number(parts.at(-1))) }
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.toolbar[data-command-bar-revision="8.5"]')).toBeVisible();
});

test('Hell-/Dunkelmodus wechselt atomar und bleibt nach Reload erhalten', async ({ page }) => {
  const toggle = page.locator('#themeModeBtn');
  await expect(toggle).toBeVisible();
  const before = await page.locator('html').getAttribute('data-color-scheme');
  await toggle.click();
  const after = before === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', after);
  await expect(toggle).toHaveAttribute('aria-pressed', String(after === 'dark'));

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', after);
});

test('Legacy-Modus reduzierte Bewegung ist vollständig aus der Bedienung entfernt', async ({ page }) => {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsDialog')).toBeVisible();
  await expect(page.locator('#settingsMotion').locator('..')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/reduce-motion/);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'system');
});

test('Rich Tooltip ist per Tastatur erreichbar und mit ARIA beschrieben', async ({ page }) => {
  const toggle = page.locator('#themeModeBtn');
  await toggle.focus();
  const tooltip = page.locator('#appRichTooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute('role', 'tooltip');
  await expect(toggle).toHaveAttribute('aria-describedby', 'appRichTooltip');
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
});

test('Exhaustiv-Profil überträgt die sichtbaren Tiefenparameter', async ({ page }) => {
  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeVisible();
  await page.locator('#autoPlanV85CleanProfile').selectOption('exhaustive');
  await expect(page.locator('#autoPlanRepairIterations')).toHaveValue('8');
  await expect(page.locator('#autoPlanLocalBudget')).toHaveValue('10000');
  await expect(page.locator('#autoPlanLateAcceptance')).toHaveValue('900');
  await expect(page.locator('#autoPlanV85Derived')).toContainText('4 strikte Wellen');
  await expect(page.locator('#autoPlanV85Derived')).toContainText('225% Rescue-Breite');
  await expect(page.locator('#autoPlanPerfection')).toBeChecked();
});
