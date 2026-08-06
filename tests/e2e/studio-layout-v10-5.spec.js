import { test, expect } from '@playwright/test';
import { DEFAULT_STAFF } from '../../js/defaults.js';
import { collectContrast } from './helpers/contrast.js';

/**
 * Auto-Plan Studio v10.5 — Layoutvertrag der drei Zustände.
 *
 * Der Dialog hat genau drei Zustände: Parameter, Lauf, Ergebnis. Für jeden gilt
 * dasselbe Versprechen, und dieser Test macht es messbar:
 *
 *   1. **Nichts verschwindet.** Kein Kasten, der seinen Inhalt beschneidet,
 *      darf mehr Inhalt haben, als er zeigt. Zonen mit eigener Bildlaufleiste
 *      sind ausgenommen — dort ist der Inhalt erreichbar.
 *   2. **Nichts überlagert sich.** Keine zwei im Fluss stehenden Geschwister
 *      dürfen sich schneiden.
 *
 * Warum ausgerechnet dieser Test: Die frühere Layoutprüfung sah den Dialog nur
 * im Parameterzustand. Deshalb blieb unbemerkt, dass in der Ergebnisansicht
 * jede Karte auf 22 Pixel zusammenfiel — Vorschlagstabelle, Verteilungsbild und
 * Suchnachweis waren unsichtbar, der fertige Monatsvorschlag unerreichbar.
 */

const staff = DEFAULT_STAFF;

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
  let currentMonth = emptyMonth(2026, 7);
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({
    json: {
      ok: true,
      settings: {
        schemaVersion: 4,
        appearance: { density: 'comfortable', richTooltips: true },
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
  await page.route('**/api/month/**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = Number(parts.at(-2));
    const month = Number(parts.at(-1));
    if (route.request().method() === 'PUT') {
      currentMonth = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true, month: year === 2026 && month === 7 ? currentMonth : emptyMonth(year, month) } });
  });
}

/**
 * Findet jedes Element, dessen Inhalt hinter einer harten Kante verschwindet.
 *
 * Ein Kasten schneidet ab, wenn er seinen Inhalt beschneidet (`hidden` oder
 * `clip`) und der Inhalt größer ist als der sichtbare Bereich. `auto` und
 * `scroll` gelten nicht als Abschneiden — dort ist der Inhalt erreichbar.
 */
const CLIPPED = () => {
  const problems = [];
  const roots = document.querySelectorAll('dialog[open], .app-shell');
  const seen = new Set();
  for (const root of roots) {
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (seen.has(element)) continue;
      seen.add(element);
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      // Ein zugeklapptes Aufklappelement verbirgt seinen Inhalt absichtlich.
      if (element.closest('details:not([open])')) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const clipsY = /^(hidden|clip)$/.test(style.overflowY);
      const clipsX = /^(hidden|clip)$/.test(style.overflowX);
      // Nur der Inhalt im Fluss zählt. Absolut positioniertes Dekor — Verläufe,
      // Orbits, Glanzlichter — ragt absichtlich über die Kante und darf keinen
      // Fehlalarm auslösen.
      let contentBottom = rect.top;
      let contentRight = rect.left;
      for (const child of element.children) {
        const cs = getComputedStyle(child);
        if (cs.position === 'absolute' || cs.position === 'fixed') continue;
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const cr = child.getBoundingClientRect();
        contentBottom = Math.max(contentBottom, cr.bottom);
        contentRight = Math.max(contentRight, cr.right);
      }
      const padBottom = parseFloat(style.paddingBottom) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      const cutY = clipsY && contentBottom + padBottom > rect.bottom + 2
        ? Math.round(contentBottom + padBottom - rect.bottom) : 0;
      const cutX = clipsX && contentRight + padRight > rect.right + 2
        ? Math.round(contentRight + padRight - rect.right) : 0;
      if (!cutY && !cutX) continue;
      problems.push({
        sel: `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className ? '.' + String(element.className).trim().split(/\s+/).slice(0, 2).join('.') : ''}`,
        cutY,
        cutX,
        h: Math.round(rect.height),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50)
      });
    }
  }
  return problems;
};

/** Findet Geschwister, deren sichtbare Rechtecke sich schneiden. */
const OVERLAPS = () => {
  const problems = [];
  const roots = document.querySelectorAll('dialog[open]');
  for (const root of roots) {
    for (const parent of [root, ...root.querySelectorAll('*')]) {
      const kids = [...parent.children].filter(child => {
        const s = getComputedStyle(child);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        if (s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky') return false;
        const r = child.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      for (let a = 0; a < kids.length; a += 1) {
        for (let b = a + 1; b < kids.length; b += 1) {
          const ra = kids[a].getBoundingClientRect();
          const rb = kids[b].getBoundingClientRect();
          const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (overlapX > 1 && overlapY > 1) {
            problems.push({
              parent: `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}`,
              a: `${kids[a].tagName.toLowerCase()}${kids[a].id ? '#' + kids[a].id : '.' + String(kids[a].className).split(/\s+/)[0]}`,
              b: `${kids[b].tagName.toLowerCase()}${kids[b].id ? '#' + kids[b].id : '.' + String(kids[b].className).split(/\s+/)[0]}`,
              overlap: `${Math.round(overlapX)}×${Math.round(overlapY)}`
            });
          }
        }
      }
    }
  }
  return problems;
};

for (const scheme of ['light', 'dark']) {
  test(`Studio-Layout: nichts abgeschnitten, nichts überlagert · ${scheme}`, async ({ page }) => {
    test.setTimeout(300000);
    await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 940 });
    await page.goto('/');
    await page.evaluate(mode => {
      document.documentElement.dataset.colorScheme = mode;
      document.documentElement.style.colorScheme = mode;
      try { localStorage.setItem('dienstplanrad:color-scheme:v1', mode); } catch { /* egal */ }
    }, scheme);
    await page.selectOption('#yearSelect', '2026');
    await page.selectOption('#monthSelect', '7');
    await page.locator('#autoPlanBtn').click();
    await page.waitForSelector('#autoPlanDialog[open]');
    await page.waitForTimeout(1000);

    const findings = [];
    const collect = async where => {
      for (const entry of await page.evaluate(CLIPPED)) findings.push({ where, kind: 'abgeschnitten', ...entry });
      for (const entry of await page.evaluate(OVERLAPS)) findings.push({ where, kind: 'überlagert', ...entry });
      // Lesbarkeit gehört zum Layoutvertrag: Was sichtbar ist, muss auch
      // lesbar sein — in beiden Erscheinungsbildern.
      for (const entry of await collectContrast(page)) findings.push({ where, kind: 'kontrast', ...entry });
    };

    // Die Wahl der Laufansicht muss ohne Aufklappen sichtbar sein: Eine
    // Einstellung hinter einer geschlossenen Gruppe ist für die Bedienung nicht
    // vorhanden — genau so war die Orbit-Ansicht abhandengekommen.
    const visual = await page.evaluate(() => {
      const select = document.getElementById('autoPlanV10VisualMode');
      const group = select?.closest('details');
      const rect = select?.getBoundingClientRect();
      return {
        options: select ? [...select.options].map(option => option.value) : [],
        groupOpen: group ? group.open : null,
        height: Math.round(rect?.height || 0)
      };
    });
    expect(visual.options, 'Kristallisation und Orbit stehen zur Wahl').toEqual(['crystal', 'orbit']);
    expect(visual.groupOpen, 'die Gruppe ist aufgeklappt').toBe(true);
    expect(visual.height, 'die Auswahl ist sichtbar').toBeGreaterThan(10);

    await collect('parameter');

    // Kurzes Zeitbudget: Geprüft wird das Layout, nicht die Planqualität.
    await page.evaluate(() => {
      const budget = document.getElementById('autoPlanTimeBudget');
      if (!budget) return;
      budget.value = budget.min;
      budget.dispatchEvent(new Event('input', { bubbles: true }));
      budget.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#autoPlanStartBtn').click();
    await page.waitForSelector('#autoPlanStage:not([hidden])');
    await page.waitForTimeout(4000);
    await collect('lauf');

    await page.waitForSelector('#autoPlanResult:not([hidden])', { timeout: 240000 });
    await page.waitForTimeout(1500);
    await collect('ergebnis');

    // Der Monatsvorschlag ist der Ertrag des Laufs — er muss sichtbar sein.
    const proposal = await page.evaluate(() => {
      const list = document.getElementById('autoPlanChangeList');
      const rows = document.querySelectorAll('#autoPlanProposalBody tr');
      const rect = list?.getBoundingClientRect();
      return { rows: rows.length, height: Math.round(rect?.height || 0) };
    });
    expect(proposal.rows, 'die Vorschlagstabelle hat Tageszeilen').toBeGreaterThan(20);
    expect(proposal.height, 'die Vorschlagstabelle ist sichtbar hoch').toBeGreaterThan(200);

    expect(findings, `Layoutfehler: ${JSON.stringify(findings.slice(0, 10), null, 2)}`).toEqual([]);
  });
}
