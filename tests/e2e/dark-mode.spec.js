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
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: { ok: true, month: emptyMonth(year, month) } });
  });
}

async function openJulyInDarkMode(page) {
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
  await expect(page.locator('link[data-v9-shell-style]')).toHaveCount(1);
  await page.evaluate(() => {
    document.documentElement.dataset.colorScheme = 'dark';
    window.dispatchEvent(new CustomEvent('appsettingschange', { detail: { appearance: { colorScheme: 'dark' } } }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
}

async function visualMetrics(locator) {
  return locator.evaluate(element => {
    const parse = value => {
      const numbers = String(value).match(/[\d.]+/g)?.map(Number) || [];
      return [numbers[0] || 0, numbers[1] || 0, numbers[2] || 0, numbers[3] ?? 1];
    };
    const composite = (foreground, background) => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha <= 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
        alpha
      ];
    };
    const effectiveBackground = node => {
      let result = [0, 0, 0, 0];
      for (let current = node; current instanceof Element; current = current.parentElement) {
        result = composite(result, parse(getComputedStyle(current).backgroundColor));
        if (result[3] >= .999) break;
      }
      if (result[3] < .999) result = composite(result, [15, 21, 28, 1]);
      return result;
    };
    const linear = channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    };
    const luminance = color => .2126 * linear(color[0]) + .7152 * linear(color[1]) + .0722 * linear(color[2]);
    const background = effectiveBackground(element);
    const foreground = composite(parse(getComputedStyle(element).color), background);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    const contrast = (Math.max(foregroundLuminance, backgroundLuminance) + .05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
    return {
      contrast,
      backgroundLuminance,
      color: getComputedStyle(element).color,
      backgroundColor: getComputedStyle(element).backgroundColor,
      borderColor: getComputedStyle(element).borderColor
    };
  });
}

async function expectReadableDarkSurface(locator, label, { maxLuminance = .24, minContrast = 4.5 } = {}) {
  await expect(locator, `${label} fehlt`).toBeVisible();
  const metrics = await visualMetrics(locator);
  expect(metrics.backgroundLuminance, `${label} ist keine dunkle Oberfläche: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(maxLuminance);
  expect(metrics.contrast, `${label} unterschreitet den Textkontrast: ${JSON.stringify(metrics)}`).toBeGreaterThanOrEqual(minContrast);
}

test('Dunkelmodus hält Diensttabelle, Offen-Badges, Statistik und Prüfbereich vollständig lesbar', async ({ page }) => {
  await openJulyInDarkMode(page);

  await expectReadableDarkSurface(page.locator('#planTable thead th').first(), 'Tabellenkopf');
  await expectReadableDarkSurface(page.locator('#planTable tbody td.date-cell').first(), 'Datumsspalte');
  await expectReadableDarkSurface(page.locator('#planTable tbody td.weekday-cell').first(), 'Wochentagsspalte');
  await expectReadableDarkSurface(page.locator('#planTable .assignment-badges .small-chip').first(), 'Offen-Badge');
  await expectReadableDarkSurface(page.locator('.distribution-table thead th').first(), 'Statistikkopf');
  await expectReadableDarkSurface(page.locator('.distribution-table tbody tr:not(.open-row) td').first(), 'Statistikwert');
  await expectReadableDarkSurface(page.locator('.distribution-table .open-row td').first(), 'Statistikzeile Offen');
  await expectReadableDarkSurface(page.locator('.issue-item').first(), 'Offener Prüfpunkt');
  await expectReadableDarkSurface(page.locator('.issue-item .small-chip').first(), 'Prüfpunkt-Badge');
  await expectReadableDarkSurface(page.locator('#monthPaletteLabel'), 'Monatskontrast-Badge');

  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'darkSemanticProbe';
    probe.style.cssText = 'display:flex;gap:8px;padding:8px;background:#141c25;position:relative;z-index:10';
    for (const level of ['green', 'yellow', 'orange', 'red', 'gray']) {
      const chip = document.createElement('span');
      chip.className = `small-chip ${level}`;
      chip.dataset.level = level;
      chip.textContent = level;
      probe.append(chip);
    }
    document.querySelector('.sheet-panel')?.append(probe);
  });

  for (const level of ['green', 'yellow', 'orange', 'red', 'gray']) {
    await expectReadableDarkSurface(page.locator(`#darkSemanticProbe .small-chip.${level}`), `Semantisches ${level}-Badge`);
  }
});

test('Dunkelmodus bleibt auch in Picker und Auto-Plan Studio kontrastfest', async ({ page }) => {
  await openJulyInDarkMode(page);

  await page.locator('#planTable .assignment-btn').first().click();
  await expect(page.locator('#pickerDialog')).toBeVisible();
  await expectReadableDarkSurface(page.locator('#pickerDialog .dialog-card'), 'Picker-Dialog');
  await expectReadableDarkSurface(page.locator('#pickerSearch'), 'Picker-Suchfeld');
  await expectReadableDarkSurface(page.locator('#pickerList .picker-item').first(), 'Picker-Kandidat');
  await page.locator('#pickerDialog .close-btn').click();
  await expect(page.locator('#pickerDialog')).toBeHidden();

  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeVisible();
  await expect(page.locator('#autoPlanDialog')).toHaveAttribute('data-v9-engine-revision', '9');
  await expectReadableDarkSurface(page.locator('#autoPlanDialog .auto-plan-shell'), 'Auto-Plan Studio');
  await expectReadableDarkSurface(page.locator('#autoPlanV9SolverMode'), 'Solvermodus');
  await expectReadableDarkSurface(page.locator('#autoPlanV9ProofTarget'), 'Nachweisziel');
});
