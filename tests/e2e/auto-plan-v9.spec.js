import { test, expect } from '@playwright/test';

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: [] };
}

async function mockApi(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: {
      ok: true,
      settings: {
        schemaVersion: 4,
        appearance: { density: 'comfortable', richTooltips: true, colorScheme: 'light' },
        workflow: { algorithmCommentary: true, studioVisualizer: true },
        autoPlan: {
          performanceProfile: 'adaptive', searchIntensity: 'standard', optimizationFocus: 'balanced',
          timeBudgetSeconds: 10, allowRedFallback: true, perfectionEnabled: true,
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

async function openJuly(page) {
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
}

async function openStudio(page) {
  await openJuly(page);
  await page.locator('#autoPlanBtn').click();
  const dialog = page.locator('#autoPlanDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-v9-engine-revision', '9');
  await expect(page.locator('#autoPlanTitle')).toContainText('v9');
  await expect(page.locator('#autoPlanV9SolverMode')).toHaveValue('hybrid');
  await expect(page.locator('#autoPlanV9ProofTarget')).toHaveValue('best-within-budget');
  return dialog;
}

test('v9-Studio bleibt vollständig im Viewport und schneidet Phasentheater nicht ab', async ({ page }) => {
  await page.setViewportSize({ width: 1375, height: 760 });
  const dialog = await openStudio(page);
  await expect(page.locator('#autoPlanV85Theatre li[data-stage]')).toHaveCount(7);

  const geometry = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    const body = element.querySelector('#autoPlanBody');
    const consoleElement = element.querySelector('.auto-plan-console');
    const theatre = element.querySelector('#autoPlanV85Theatre');
    const lastStage = theatre?.querySelector('li[data-stage]:last-child');
    const stageBox = lastStage?.getBoundingClientRect();
    const theatreBox = theatre?.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      right: box.right,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      bodyOverflow: body ? getComputedStyle(body).overflowY : '',
      bodyClientHeight: body?.clientHeight || 0,
      bodyScrollHeight: body?.scrollHeight || 0,
      consoleRows: consoleElement ? getComputedStyle(consoleElement).gridTemplateRows : '',
      lastStageBottom: stageBox?.bottom || 0,
      theatreBottom: theatreBox?.bottom || 0
    };
  });

  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bodyOverflow).toBe('auto');
  expect(geometry.consoleRows.split(' ').length).toBeGreaterThanOrEqual(5);
  expect(geometry.lastStageBottom).toBeLessThanOrEqual(geometry.theatreBottom + 2);
  expect(geometry.bodyScrollHeight).toBeGreaterThanOrEqual(geometry.bodyClientHeight);
});

test('v9 erklärt alle sichtbaren Studiofelder per tastaturfähigem Rich Tooltip', async ({ page }) => {
  await openStudio(page);
  const mode = page.locator('#autoPlanV9SolverMode');
  await mode.focus();
  await expect(page.locator('#appRichTooltip')).toBeVisible();
  await expect(mode).toHaveAttribute('aria-describedby', /appRichTooltip/);
  await expect(page.locator('#appRichTooltip')).toContainText('v9-Orchestrierung');
  await page.keyboard.press('Escape');
  await expect(page.locator('#appRichTooltip')).toBeHidden();

  const uncovered = await page.locator('#autoPlanConfig :is(input, select, button, output)').evaluateAll(elements =>
    elements.filter(element => {
      const style = getComputedStyle(element);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      return visible && !element.dataset.tooltip && !element.closest('[data-tooltip]');
    }).map(element => element.id || element.textContent?.trim() || element.tagName));
  expect(uncovered).toEqual([]);
});

test('Diensttabelle erreicht im Dunkelmodus lesbaren Textkontrast', async ({ page }) => {
  await openJuly(page);
  await page.evaluate(() => {
    document.documentElement.dataset.colorScheme = 'dark';
    window.dispatchEvent(new CustomEvent('appsettingschange', { detail: { appearance: { colorScheme: 'dark' } } }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');

  const contrast = await page.locator('#planTable tbody td').first().evaluate(element => {
    const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = rgb => {
      const linear = rgb.map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const style = getComputedStyle(element);
    const foreground = luminance(parse(style.color));
    const background = luminance(parse(style.backgroundColor));
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);

  await expect(page.locator('#planTable thead th').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('v9 zeigt ausschließlich den wahrheitsgetreuen globalen Solverstatus', async ({ page }) => {
  await openStudio(page);
  await page.evaluate(() => {
    const cards = document.getElementById('autoPlanScorecards');
    cards.innerHTML = '<div class="auto-plan-scorecard verified"><span>Optimalität</span><strong>zertifiziert</strong><small>lokal</small></div>';
    document.getElementById('autoPlanResultText').textContent = 'global optimiert und zertifiziert';
    window.dispatchEvent(new CustomEvent('autoplanresult', {
      detail: {
        complete: true,
        changes: [{ dateIso: '2026-07-01', role: 'bd', staffId: 'lurz' }],
        metrics: {
          red: 0,
          proof: {
            status: 'FEASIBLE',
            exactAttempted: true,
            globalSearchComplete: false,
            relaxed: false,
            scope: 'feasible-incumbent',
            truthfulLabel: 'Zulässige Lösung, Optimum nicht bewiesen'
          },
          exactSearch: { nodes: 12_345, solutions: 3, stoppedBy: 'time' }
        }
      }
    }));
  });

  await expect(page.locator('#autoPlanScorecards .auto-plan-scorecard span')).toHaveText('Globaler Nachweis');
  await expect(page.locator('#autoPlanScorecards .auto-plan-scorecard strong')).toHaveText('FEASIBLE');
  await expect(page.locator('#autoPlanResultText')).toContainText('nicht bewiesen');
  await expect(page.locator('#autoPlanResultText')).not.toContainText('zertifiziert');
  await expect(page.locator('#autoPlanV9ProofDetail')).toHaveText('Zulässige Lösung, Optimum nicht bewiesen');
});

test('v9-Algorithmusanimation bleibt ohne Reduktionsmodus vollständig aktiv', async ({ page }) => {
  // Playwright emuliert hier bewusst eine OS-Präferenz für reduzierte Bewegung.
  // Die Anwendung besitzt gemäß Produktvorgabe keinen Reduktionsmodus und lädt
  // deshalb ihre zuletzt priorisierte vollständige Algorithmusanimation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStudio(page);
  await expect(page.locator('link[data-auto-plan-v9-motion]')).toHaveCount(1);
  const animation = await page.locator('#autoPlanV9Hud > i').first().evaluate(element => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration, playState: style.animationPlayState };
  });
  expect(animation.name).toBe('v9-hud-spin');
  expect(animation.duration).not.toBe('0s');
  expect(animation.playState).toBe('running');
});
