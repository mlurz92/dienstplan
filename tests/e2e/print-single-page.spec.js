import { test, expect } from '@playwright/test';
import { DEFAULT_STAFF } from '../../js/defaults.js';
import { readFile } from 'node:fs/promises';

/**
 * Der Ausdruck passt auf **eine** DIN-A4-Seite hochkant.
 *
 * Geprüft wird nicht die gerechnete Höhe, sondern das erzeugte PDF selbst:
 * Seitenzahl im Seitenbaum. Alles andere wäre eine Behauptung über das
 * Ergebnis, nicht das Ergebnis.
 *
 * Zwei Satzspiegel werden verlangt:
 *   1. Der eigene aus `@page` (9 mm oben/unten) — der Normalfall.
 *   2. 20 mm oben und unten — so viel lässt Chrome übrig, sobald im
 *      Druckdialog Kopf- und Fußzeilen eingeschaltet sind, und das ist die
 *      Voreinstellung. Ein Ausdruck, der nur ohne sie passt, passt praktisch
 *      nicht.
 *
 * Der Ungünstigstfall ist Absicht: zwölf statt acht Mitarbeitende, lange
 * externe Namen, volle Belegung. Mit acht Personen fiel der frühere Ausdruck
 * knapp innerhalb der Seite; mit zwölf brauchte er 289 mm und riss auf eine
 * zweite Seite — die festen Zeilenhöhen waren für genau einen Fall gerechnet.
 */

const HEAVY_STAFF = [
  ...DEFAULT_STAFF,
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `zusatz${index}`,
    name: `Dr. Zusatzkraft-Langname ${index}`,
    short: `Zusatzkraft${index}`,
    category: 'fa',
    roleLabel: 'FÄ/OÄ',
    activeFrom: '2020-01-01',
    activeUntil: null,
    includeInPlanning: true,
    includeInAbsenceList: true,
    bdTarget: 3,
    maxBd: null,
    canHg: true,
    canSaturdayBd: true
  }))
];

function fullMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = {
      bd: 'extern:Bestand Bereitschaftsdienst',
      hg: 'extern:Bestand Hintergrunddienst',
      rbn1: 'Schwester Meier-Doppelname',
      rbn2: 'Pfleger Schulze-Doppelname',
      notes: ''
    };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: []
  };
}

async function mockApi(page) {
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;'
  }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: {
      ok: true,
      settings: { schemaVersion: 4 },
      staff: HEAVY_STAFF,
      rbnNames: ['Schwester Meier-Doppelname', 'Pfleger Schulze-Doppelname']
    }
  }));
  await page.route('**/api/month/**', route => {
    if (route.request().method() === 'PUT') return route.fulfill({ json: { ok: true } });
    const parts = new URL(route.request().url()).pathname.split('/');
    return route.fulfill({ json: { ok: true, month: fullMonth(Number(parts.at(-2)), Number(parts.at(-1))) } });
  });
}

/** Seitenzahl aus dem Seitenbaum des PDF. */
function pdfPageCount(buffer) {
  const text = buffer.toString('latin1');
  const pages = (text.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map(match => Number(match[1]));
  return Math.max(pages, ...counts, 0);
}

test('jeder Monat passt auf genau eine A4-Seite hochkant – auch mit Kopf- und Fußzeilen', async ({ page }) => {
  test.setTimeout(300000);
  await mockApi(page);
  await page.goto('/');

  // Drei kennzeichnende Monate statt aller zwölf: Der Ausdruck hängt allein an
  // der Zeilenzahl und an Feiertagszeilen. Oktober hat 31 Tage und zwei
  // Feiertage (der teuerste Fall), September 30, Februar 28.
  for (const month of [10, 9, 2]) {
    await page.selectOption('#yearSelect', '2026');
    await page.selectOption('#monthSelect', String(month));
    await page.waitForTimeout(500);
    await page.emulateMedia({ media: 'print' });

    const own = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(pdfPageCount(own), `Monat ${month} mit eigenem Satzspiegel`).toBe(1);

    const withHeaders = await page.pdf({
      format: 'A4', printBackground: true, preferCSSPageSize: false,
      margin: { top: '20mm', bottom: '20mm', left: '10mm', right: '10mm' }
    });
    expect(pdfPageCount(withHeaders), `Monat ${month} mit Kopf-/Fußzeilen`).toBe(1);

    await page.emulateMedia({ media: 'screen' });
  }
});

test('der Ausdruck trägt Kopf, alle Planspalten und die reduzierte Statistik', async ({ page }) => {
  test.setTimeout(120000);
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '9');
  await page.waitForTimeout(700);
  await page.emulateMedia({ media: 'print' });

  const layout = await page.evaluate(() => {
    const visible = element => element && getComputedStyle(element).display !== 'none';
    const eyebrow = document.querySelector('.sheet-heading .eyebrow');
    const title = document.getElementById('monthTitle');
    const palette = document.getElementById('monthPaletteLabel');
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), right: Math.round(rect.right) };
    };
    return {
      eyebrow: eyebrow?.textContent?.trim(),
      title: title?.textContent?.trim(),
      palette: palette?.textContent?.trim(),
      // Der Kontrastname steht rechts und auf der Höhe des Kopfes.
      paletteRight: box(palette).right >= box(title).right,
      paletteAligned: box(palette).bottom <= box(title).bottom + 4,
      planColumns: [...document.querySelectorAll('#planTable thead th')]
        .filter(visible).map(th => th.textContent.trim()),
      statColumns: [...document.querySelectorAll('.distribution-table thead th')]
        .filter(visible).map(th => th.textContent.trim())
    };
  });

  expect(layout.eyebrow).toBe('Bereitschaftsdienstplan');
  expect(layout.title).toMatch(/^\p{L}+ 2026$/u);
  expect(layout.palette).toMatch(/^Monatskontrast · .+/);
  expect(layout.paletteRight, 'der Monatskontrast steht rechts').toBe(true);
  expect(layout.paletteAligned, 'auf der Höhe des Kopfes').toBe(true);
  expect(layout.planColumns).toEqual(['Tag', 'Wochentag', 'BD', 'HG', 'RBN', '2. RBN']);
  expect(layout.statColumns).toEqual(['Mitarbeitende', 'BD', 'HG']);

  await page.emulateMedia({ media: 'screen' });
});

test('der PDF-Export lädt „Dienstplan JJJJ-MM.pdf" direkt herunter', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '9');
  await page.waitForTimeout(400);

  // Kein Druckdialog mehr: Der Klick liefert die fertige Datei. Wäre der Weg
  // noch `window.print()`, käme hier nie ein Download an.
  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportPdfBtn')
  ]);
  expect(exported.suggestedFilename()).toBe('Dienstplan 2026-09.pdf');

  const raw = (await readFile(await exported.path())).toString('latin1');
  expect(raw.startsWith('%PDF')).toBe(true);
  expect(pdfPageCount(Buffer.from(raw, 'latin1'))).toBe(1);
  expect(raw).toContain('(September 2026) Tj');
  expect(raw).toContain('(BEREITSCHAFTSDIENSTPLAN) Tj');
  // Zwölf Mitarbeitende, volle Belegung — der Ungünstigstfall bleibt einseitig.
  expect(raw).toContain('(Offen) Tj');
});
