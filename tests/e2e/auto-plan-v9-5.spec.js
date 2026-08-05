import { test, expect } from '@playwright/test';

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

function preparedMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: 'extern:Bestand BD', hg: 'extern:Bestand HG', rbn1: '', rbn2: '', notes: '' };
  }
  days[`${year}-${String(month).padStart(2, '0')}-15`] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {},
    overrideLog: [], importLog: []
  };
}

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {},
    overrideLog: [], importLog: []
  };
}

async function mockApi(page) {
  let current = preparedMonth(2026, 7);
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
          performanceProfile: 'responsive',
          searchIntensity: 'standard',
          optimizationFocus: 'balanced',
          timeBudgetSeconds: 4,
          cpSatTimeBudgetSeconds: 4,
          allowRedFallback: true,
          perfectionEnabled: true,
          portfolioDiversity: false
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
    if (route.request().method() === 'PUT') {
      current = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: { ok: true, month: year === 2026 && month === 7 ? current : emptyMonth(year, month) }
    });
  });
}

async function openStudio(page, viewport = { width: 1280, height: 800 }, { theme = 'light' } = {}) {
  await page.setViewportSize(viewport);
  await mockApi(page);
  await page.goto('/');
  if (theme === 'dark') {
    await page.locator('#themeModeBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  }
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
  await page.locator('#autoPlanBtn').click();
  const dialog = page.locator('#autoPlanDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-algorithm-revision', '9.5');
  await expect(dialog).toHaveAttribute('data-v95-layout', '1');
  return dialog;
}

function overlap(left, right) {
  return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 1
    && Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 1;
}

function contrastRatio(rgbA, rgbB) {
  const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const luminance = rgb => {
    const normalized = parse(rgb).map(value => value / 255).map(value =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
  };
  const first = luminance(rgbA);
  const second = luminance(rgbB);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('Studio v9.5 passt bei 340 px vollständig ins Modal und alle Felder bleiben überlagerungsfrei', async ({ page }) => {
  const dialog = await openStudio(page, { width: 340, height: 700 });

  for (const id of [
    'autoPlanV9SolverBackend', 'autoPlanV9TimeBudget', 'autoPlanV95LnsRounds',
    'autoPlanV95Neighborhood', 'autoPlanV95Alternatives', 'autoPlanV95SplitWeekendWeight',
    'autoPlanV95LogSearch'
  ]) {
    const control = page.locator(`#${id}`);
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute('data-tooltip', /.+/);
  }

  const geometry = await dialog.evaluate(element => {
    const body = element.querySelector('.auto-plan-body');
    const config = element.querySelector('#autoPlanConfig');
    const footer = element.querySelector('.auto-plan-footer');
    const style = getComputedStyle(element);
    const bodyStyle = getComputedStyle(body);
    const configStyle = getComputedStyle(config);
    return {
      dialog: element.getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
      dialogOverflow: style.overflow,
      bodyOverflow: bodyStyle.overflow,
      configOverflowY: configStyle.overflowY,
      configScrollable: config.scrollHeight > config.clientHeight,
      footer: footer.getBoundingClientRect().toJSON()
    };
  });

  expect(geometry.dialog.x).toBeGreaterThanOrEqual(-1);
  expect(geometry.dialog.y).toBeGreaterThanOrEqual(-1);
  expect(geometry.dialog.x + geometry.dialog.width).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.dialog.y + geometry.dialog.height).toBeLessThanOrEqual(geometry.viewport.height + 1);
  expect(geometry.dialogOverflow).toBe('hidden');
  expect(geometry.bodyOverflow).toBe('hidden');
  expect(geometry.configOverflowY).toBe('auto');
  expect(geometry.configScrollable).toBe(true);
  expect(geometry.footer.y + geometry.footer.height).toBeLessThanOrEqual(geometry.viewport.height + 1);

  const boxes = await page.locator('#autoPlanConfig .auto-plan-field:visible').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().toJSON()));
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      expect(overlap(boxes[left], boxes[right]), `Felder ${left} und ${right} überlagern sich`).toBe(false);
    }
  }

  await page.locator('#autoPlanV95SplitWeekendWeight').focus();
  await expect(page.locator('#appRichTooltip')).toBeVisible();
  await expect(page.locator('#autoPlanV95SplitWeekendWeight')).toHaveAttribute('aria-describedby', 'appRichTooltip');
  await page.keyboard.press('Escape');
  await expect(page.locator('#appRichTooltip')).toBeHidden();
});

test('Light-Mode ist Standard und der Umschalter zeigt ausschließlich Sonne oder Mond', async ({ page }) => {
  await openStudio(page, { width: 1024, height: 768 });
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
  const toggle = page.locator('#themeModeBtn');
  await expect(toggle).toBeVisible();
  await expect(toggle.locator('svg.tool-icon')).toHaveCount(1);
  await expect(toggle.locator('.tool-label:visible')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-label', /wechseln/);

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(toggle.locator('svg.tool-icon')).toHaveCount(1);
  await expect(toggle.locator('.tool-label:visible')).toHaveCount(0);
});

test('Kommentarfenster bleibt fest, scrollt intern und das Resultat benötigt keinen Modal-Scroll', async ({ page }) => {
  test.setTimeout(90_000);
  const dialog = await openStudio(page, { width: 920, height: 620 });
  await page.locator('#autoPlanV9SolverBackend').selectOption('heuristic-alns');
  await page.locator('#autoPlanV85CleanProfile').selectOption('balanced');

  const before = await page.locator('.auto-plan-log').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    overflow: getComputedStyle(element).overflow
  }));
  await page.locator('#autoPlanStartBtn').click();
  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#autoPlanResultTitle')).toContainText(/regelgeprüfter|Regelkonformer/);

  const after = await page.locator('.auto-plan-log').evaluate(element => {
    const stream = element.querySelector('.auto-plan-log-stream');
    return {
      height: element.getBoundingClientRect().height,
      overflow: getComputedStyle(element).overflow,
      streamOverflowY: getComputedStyle(stream).overflowY,
      streamClientHeight: stream.clientHeight,
      streamScrollHeight: stream.scrollHeight
    };
  });
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  expect(after.overflow).toBe('hidden');
  expect(after.streamOverflowY).toBe('auto');

  const modalState = await dialog.evaluate(element => ({
    overflow: getComputedStyle(element).overflow,
    bodyOverflow: getComputedStyle(element.querySelector('.auto-plan-body')).overflow,
    resultOverflowY: getComputedStyle(element.querySelector('#autoPlanResult')).overflowY,
    rect: element.getBoundingClientRect().toJSON(),
    viewportHeight: innerHeight
  }));
  expect(modalState.overflow).toBe('hidden');
  expect(modalState.bodyOverflow).toBe('hidden');
  expect(modalState.resultOverflowY).toBe('auto');
  expect(modalState.rect.y + modalState.rect.height).toBeLessThanOrEqual(modalState.viewportHeight + 1);
  await expect(page.locator('#autoPlanApplyBtn')).toBeVisible();
});

test('Dark-Mode erhält lesbaren Kontrast für Felder, Badges und Tabellen', async ({ page }) => {
  test.setTimeout(90_000);
  await openStudio(page, { width: 1100, height: 760 }, { theme: 'dark' });
  await page.locator('#autoPlanV9SolverBackend').selectOption('heuristic-alns');
  await page.locator('#autoPlanStartBtn').click();
  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 60_000 });

  const samples = await page.evaluate(() => {
    const selectors = [
      '#autoPlanV9SolverBackend',
      '#autoPlanProposalTable thead th',
      '.auto-plan-assignment-cell.fixed',
      '.auto-plan-row-status.fixed'
    ];
    return selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const style = getComputedStyle(element);
      let background = style.backgroundColor;
      let parent = element.parentElement;
      while ((background === 'rgba(0, 0, 0, 0)' || background === 'transparent') && parent) {
        background = getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      }
      return { selector, color: style.color, background };
    });
  });

  for (const sample of samples) {
    expect(sample.missing, `${sample.selector} fehlt`).not.toBe(true);
    expect(sample.color).not.toBe(sample.background);
    expect(contrastRatio(sample.color, sample.background), `${sample.selector} besitzt zu wenig Textkontrast`).toBeGreaterThanOrEqual(4.5);
  }
});
