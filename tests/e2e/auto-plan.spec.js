import { test, expect } from '@playwright/test';

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

function monthWithTwoOpenSlots(year, month, { forceRed = false, lurzFixpoint = false } = {}) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: 'extern:Bestand BD', hg: 'extern:Bestand HG', rbn1: '', rbn2: '', notes: '' };
  }
  const target = `${year}-${String(month).padStart(2, '0')}-15`;
  days[target].bd = '';
  days[target].hg = '';
  if (lurzFixpoint) days[`${year}-${String(month).padStart(2, '0')}-14`].bd = 'lurz';
  const absences = {};
  const absenceSources = {};
  if (forceRed) {
    for (const person of staff) {
      absences[person.id] = { [target]: 'urlaub' };
      absenceSources[person.id] = { [target]: 'manual' };
    }
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences, absenceSources, preferences: {}, options: {}, overrideLog: [], importLog: [] };
}

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: [] };
}

async function mockApi(page, initialMonth = monthWithTwoOpenSlots(2026, 7)) {
  let currentMonth = initialMonth;
  let putCount = 0;
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] } }));
  await page.route('**/api/month/**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    if (route.request().method() === 'PUT') {
      currentMonth = route.request().postDataJSON();
      putCount += 1;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true, month: year === 2026 && month === 7 ? currentMonth : emptyMonth(year, month) } });
  });
  return { getMonth: () => currentMonth, getPutCount: () => putCount };
}

async function openJuly(page) {
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
}

async function openStudio(page) {
  await page.locator('#autoPlanBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeVisible();
  await expect(page.locator('#autoPlanConfig')).toBeVisible();
  await expect(page.locator('#autoPlanStage')).toBeHidden();
  await expect(page.locator('#autoPlanStartBtn')).toBeEnabled();
}

async function startStudio(page) {
  await openStudio(page);
  await page.locator('#autoPlanStartBtn').click();
  await expect(page.locator('#autoPlanStage')).toBeVisible();
}

test('Auto-Plan startet erst nach Parameterfreigabe und schreibt erst nach Ergebnisbestätigung', async ({ page }) => {
  test.setTimeout(150_000);
  const api = await mockApi(page);
  await openJuly(page);
  await openStudio(page);

  await expect(page.locator('#autoPlanConfigTitle')).toHaveText('Laufparameter');
  await expect(page.locator('#autoPlanLimitBody tr')).toHaveCount(staff.length);
  await expect(page.locator('#autoPlanValidation')).toContainText('Parameter konsistent');
  expect(api.getPutCount()).toBe(0);

  await page.locator('#autoPlanRepairIterations').fill('4');
  await page.locator('#autoPlanSearchIntensity').selectOption('standard');
  await page.locator('#autoPlanStartBtn').click();
  await expect(page.locator('#autoPlanCanvas')).toBeVisible();
  await expect(page.locator('#autoPlanPhaseList .auto-plan-phase')).toHaveCount(6);
  // Die Laufansicht erklärt in Klartext, was der Algorithmus gerade tut.
  await expect(page.locator('#autoPlanLog .auto-plan-log-entry').first()).toBeVisible();
  await expect(page.locator('#autoPlanLog')).toContainText('Lauf gestartet');

  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#autoPlanResultTitle')).toHaveText('Regelkonformer Vorschlag bereit');
  await expect(page.locator('#autoPlanChangeCount')).toContainText('2 neue Einträge');
  await expect(page.locator('#autoPlanScorecards')).toContainText('0 rot');
  await expect(page.locator('#autoPlanRunConfig')).toContainText('Reparaturrunden: 4');
  await expect(page.locator('#autoPlanSearchMetrics')).toContainText('Nachbarschaften');
  await expect(page.locator('#autoPlanApplyBtn')).toBeEnabled();
  expect(api.getPutCount()).toBe(0);

  await page.locator('#autoPlanApplyBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => api.getPutCount()).toBe(1);
  await expect.poll(() => Boolean(api.getMonth().days['2026-07-15'].bd && api.getMonth().days['2026-07-15'].hg)).toBe(true);
});

test('Minimal-Rot-Fallback bleibt bis zur Einzelprüfung und Begründung gesperrt', async ({ page }) => {
  test.setTimeout(180_000);
  const api = await mockApi(page, monthWithTwoOpenSlots(2026, 7, { forceRed: true }));
  await openJuly(page);
  await startStudio(page);

  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('#autoPlanResultTitle')).toHaveText('Vollständige Belegung mit roten Ausnahmen');
  await expect(page.locator('#autoPlanRedReview')).toBeVisible();
  await expect(page.locator('[data-red-check]')).toHaveCount(2);
  await expect(page.locator('#autoPlanApplyBtn')).toBeDisabled();

  await page.locator('#autoPlanConfirmRed').check();
  await expect(page.locator('#autoPlanApplyBtn')).toBeDisabled();
  await page.locator('#autoPlanOverrideComment').fill('Betrieblich notwendige Komplettbelegung');
  await expect(page.locator('#autoPlanApplyBtn')).toBeEnabled();

  await page.locator('#autoPlanApplyBtn').click();
  await expect(page.locator('#autoPlanDialog')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => api.getPutCount()).toBe(1);
  await expect.poll(() => api.getMonth().overrideLog.length).toBe(2);
});

test('Tageszeilen, Statistik und Bestätigung bleiben bei geringer Fensterhöhe scrollbar', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 920, height: 520 });
  await mockApi(page);
  await openJuly(page);
  await startStudio(page);

  // Gescrollt wird im gemeinsamen Arbeitsbereich zwischen Kopf und Fußleiste,
  // nicht in den einzelnen Abschnitten.
  const body = page.locator('#autoPlanBody');
  await expect(page.locator('#autoPlanResult')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#autoPlanProposalBody tr')).toHaveCount(31);
  await expect(page.locator('#autoPlanLoadTable .auto-plan-distribution-table')).toBeVisible();
  const state = await body.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
  expect(state.overflowY).toBe('auto');
  expect(state.scrollHeight).toBeGreaterThan(state.clientHeight);
  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#autoPlanApplyBtn')).toBeVisible();
});

/**
 * Regression: Die Obergrenzen ließen sich für die unteren Personen nicht mehr
 * setzen. Ursache war ein Parameterbereich ohne eigenen Scrollbereich in einer
 * Grid-Zeile fester Höhe – die letzten Zeilen lagen außerhalb des sichtbaren
 * Bereichs und waren weder erreichbar noch bedienbar.
 */
test('jede Person ist im Parameterbereich erreichbar und ihre Obergrenzen sind setzbar', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await mockApi(page);
  await openJuly(page);
  await openStudio(page);

  const rows = page.locator('#autoPlanLimitBody tr[data-staff-id]');
  await expect(rows).toHaveCount(staff.length);

  for (let index = 0; index < staff.length; index += 1) {
    const input = rows.nth(index).locator('input[data-limit="maxHg"]');
    await input.scrollIntoViewIfNeeded();
    await input.fill(String(index + 1));
    await expect(input).toHaveValue(String(index + 1));
  }

  // Auch die Freigabemeldung unterhalb der Tabelle bleibt erreichbar.
  const validation = page.locator('#autoPlanValidation');
  await validation.scrollIntoViewIfNeeded();
  await expect(validation).toBeInViewport();
  await expect(page.locator('#autoPlanStartBtn')).toBeVisible();
});

test('ungültige Obergrenze unterhalb eines personengebundenen Fixpunkts blockiert den Start', async ({ page }) => {
  await mockApi(page, monthWithTwoOpenSlots(2026, 7, { lurzFixpoint: true }));
  await openJuly(page);
  await openStudio(page);

  const row = page.locator('#autoPlanLimitBody tr[data-staff-id="lurz"]');
  await expect(row.locator('td').first()).toHaveText('1');
  await row.locator('input[data-limit="maxBd"]').fill('0');
  await expect(page.locator('#autoPlanValidation')).toHaveClass(/invalid/);
  await expect(page.locator('#autoPlanValidation')).toContainText('unter 1 bestehenden BD');
  await expect(page.locator('#autoPlanStartBtn')).toBeDisabled();
});
