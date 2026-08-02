import { test, expect } from '@playwright/test';

const STAFF = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'becker', name: 'Dr. Becker', short: 'Becker', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true }
];

function julyMonth() {
  const days = {};
  for (let day = 1; day <= 31; day += 1) {
    days[`2026-07-${String(day).padStart(2, '0')}`] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  days['2026-07-01'].bd = 'lurz';
  return {
    schemaVersion: 1, year: 2026, month: 7, revision: 0, updatedAt: null, days,
    absences: { becker: { '2026-07-09': 'urlaub' } },
    absenceSources: {},
    preferences: { martin: { '2026-07-09': 'bd-bevorzugt' } },
    overrideLog: [], importLog: []
  };
}

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    days[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, overrideLog: [], importLog: [] };
}

const LARGE_STAFF = [...STAFF, ...['Dr. Neumann', 'Fr. Ortlieb', 'Hr. Pahl', 'Fr. Quandt', 'Dr. Reuter', 'Dr. Simon', 'Fr. Thiel', 'Hr. Ulrich', 'Fr. Vogt', 'Dr. Werner']
  .map((name, index) => ({
    id: `zusatz${index}`, name, short: name.split(' ')[1], category: 'fa', roleLabel: 'FA',
    activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true,
    bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true
  }))];

async function mockApi(page, staff = STAFF) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] }
  }));
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    const payload = year === 2026 && month === 7 ? julyMonth() : emptyMonth(year, month);
    return route.fulfill({ json: { ok: true, month: payload } });
  });
}

async function openJuly(page, staff) {
  await mockApi(page, staff);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await expect(page.locator('#monthTitle')).toContainText('Juli 2026');
}

const openDay = (page, day) => page.locator('#planTableBody tr').nth(day - 1).locator('.assignment-btn').first();

test('der Picker ist kompakt, nach Entscheidungsnähe gruppiert und wählt die Empfehlung vor', async ({ page }) => {
  await openJuly(page);
  await openDay(page, 9).click();
  await expect(page.locator('#pickerDialog')).toBeVisible();

  const card = page.locator('#pickerDialog .picker-card');
  const box = await card.boundingBox();
  expect(box.width).toBeLessThanOrEqual(600);

  await expect(page.locator('#pickerTitle')).toHaveText('Do, 09.07.2026');
  await expect(page.locator('#pickerEyebrow')).toHaveText('Bereitschaftsdienst');
  await expect(page.locator('#pickerCurrent')).toHaveText('Noch nicht besetzt');
  await expect(page.locator('#clearAssignmentBtn')).toBeHidden();

  // Wunsch „BD bevorzugt“ steht ganz oben, der Urlaub braucht eine Bestätigung.
  await expect(page.locator('.picker-group-label span').first()).toHaveText('Empfohlen');
  const groups = page.locator('#pickerList .picker-group');
  await expect(groups.first().locator('.picker-item')).toHaveText(/Dr\. Martin/);
  await expect(page.locator('.picker-group--confirm .picker-item')).toHaveText(/Dr\. Becker/);

  // Die aktive Zeile ist vorausgewählt und ihre vollständige Begründung steht
  // im Detailbereich unter der Liste.
  const active = page.locator('.picker-item.is-active');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-staff-id', 'martin');
  await expect(page.locator('#pickerDetail')).toContainText('Dr. Martin');
  await expect(page.locator('#pickerDetail')).toContainText('Wunsch: BD bevorzugt');
  await expect(page.locator('#pickerSearch')).toBeFocused();

  // Jede Zeile trägt ihre Monatslast.
  await expect(active.locator('.picker-load')).toContainText('0/4');

  // Die gesamte Belegschaft steht ohne Rollen gleichzeitig im Blick.
  const list = await page.locator('#pickerList').evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    items: element.querySelectorAll('.picker-item').length
  }));
  expect(list.items).toBe(4);
  expect(list.scrollHeight).toBeLessThanOrEqual(list.clientHeight + 1);
});

test('Tippen filtert, Pfeiltasten wählen und Enter übernimmt', async ({ page }) => {
  await openJuly(page);
  await openDay(page, 9).click();

  await page.fill('#pickerSearch', 'dal');
  await expect(page.locator('#pickerList .picker-item')).toHaveCount(1);
  await expect(page.locator('.picker-item.is-active')).toHaveAttribute('data-staff-id', 'dalitz');

  await page.fill('#pickerSearch', 'niemand');
  await expect(page.locator('#pickerList .picker-item')).toHaveCount(0);
  await expect(page.locator('.picker-empty')).toBeVisible();

  await page.fill('#pickerSearch', '');
  await page.keyboard.press('ArrowDown');
  const active = await page.locator('.picker-item.is-active').getAttribute('data-staff-id');
  expect(active).not.toBe('martin');

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.picker-item.is-active')).toHaveAttribute('data-staff-id', 'martin');

  await page.keyboard.press('Enter');
  await expect(page.locator('#pickerDialog')).toBeHidden();
  await expect(openDay(page, 9).locator('.assignment-name')).toHaveText('Martin');
});

test('bei besetztem Tag zeigt der Picker die aktuelle Einteilung und das Löschen an', async ({ page }) => {
  await openJuly(page);
  await openDay(page, 1).click();

  await expect(page.locator('#pickerCurrent')).toContainText('Aktuell eingeteilt: Dr. Lurz');
  await expect(page.locator('#clearAssignmentBtn')).toBeVisible();
  await expect(page.locator('.picker-item[data-staff-id="lurz"] .picker-assigned')).toHaveText('aktuell');

  await page.locator('#clearAssignmentBtn').click();
  await expect(page.locator('#pickerDialog')).toBeHidden();
  await expect(openDay(page, 1).locator('.assignment-badges .small-chip')).toHaveText('offen');
});

test('auch eine vollständige Belegschaft steht ohne Rollen gleichzeitig im Blick', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openJuly(page, LARGE_STAFF);
  await openDay(page, 9).click();
  await expect(page.locator('#pickerDialog')).toBeVisible();

  const list = await page.locator('#pickerList').evaluate(element => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    items: element.querySelectorAll('.picker-item').length
  }));
  expect(list.items).toBe(LARGE_STAFF.length);
  expect(list.scrollHeight).toBeLessThanOrEqual(list.clientHeight + 1);

  // Jede Person belegt genau eine Zeile.
  const rowHeights = await page.locator('#pickerList .picker-item').evaluateAll(
    items => items.map(item => Math.round(item.getBoundingClientRect().height)));
  expect(Math.max(...rowHeights)).toBeLessThanOrEqual(34);

  // Die Karte bleibt dabei innerhalb des Fensters.
  const box = await page.locator('#pickerDialog .picker-card').boundingBox();
  expect(box.height).toBeLessThanOrEqual(900);
});
