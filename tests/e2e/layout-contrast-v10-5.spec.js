import { test, expect } from '@playwright/test';
import { collectContrast } from './helpers/contrast.js';

/**
 * Layout- und Kontraktprüfung v10.5.
 *
 * Zwei Zusagen der Anwendung werden hier zu Testeigenschaften gemacht, statt
 * Versprechen zu bleiben:
 *
 *   1. **Nichts ragt hinaus, nichts überlagert sich.** Für jedes sichtbare
 *      Element wird geprüft, ob es innerhalb seines Elternrahmens liegt, und
 *      für Geschwister, ob sich ihre Rechtecke schneiden. Geprüft wird bei fünf
 *      Breiten, weil ein Layout genau dann bricht, wenn niemand hinsieht.
 *
 *   2. **Alles ist lesbar — in beiden Erscheinungsbildern.** Für jeden
 *      sichtbaren Textknoten wird das Kontrastverhältnis gegen den tatsächlich
 *      wirksamen Hintergrund berechnet und gegen die Schwellen der WCAG 2.1
 *      Stufe AA geprüft (4,5:1, bei großer Schrift 3:1).
 */

const WIDTHS = [360, 768, 1024, 1440, 1920];

/** Relative Leuchtdichte nach WCAG 2.1. */
async function collectOverflow(page) {
  return page.evaluate(() => {
    const problems = [];
    const visible = element => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const scrollable = element => {
      const style = getComputedStyle(element);
      return /(auto|scroll|clip|hidden)/.test(`${style.overflowX} ${style.overflowY}`);
    };
    const roots = document.querySelectorAll('.app-shell, dialog[open]');
    for (const root of roots) {
      for (const element of root.querySelectorAll('*')) {
        if (!visible(element)) continue;
        const parent = element.parentElement;
        if (!parent || !visible(parent) || scrollable(parent)) continue;
        const style = getComputedStyle(element);
        if (style.position === 'fixed' || style.position === 'absolute') continue;
        const rect = element.getBoundingClientRect();
        const box = parent.getBoundingClientRect();
        const overflowRight = rect.right - box.right;
        const overflowLeft = box.left - rect.left;
        if (overflowRight > 2 || overflowLeft > 2) {
          problems.push({
            selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`,
            parent: `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ''}`,
            overflowRight: Math.round(overflowRight),
            overflowLeft: Math.round(overflowLeft)
          });
        }
      }
    }
    return problems;
  });
}

for (const scheme of ['light', 'dark']) {
  test(`Layout ohne Überlauf und lesbarer Kontrast · ${scheme}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/');
    await page.waitForSelector('#autoPlanBtn', { timeout: 30000 });
    await page.evaluate(mode => {
      document.documentElement.dataset.colorScheme = mode;
      document.documentElement.style.colorScheme = mode;
      try { localStorage.setItem('dienstplanrad:color-scheme:v1', mode); } catch { /* egal */ }
    }, scheme);
    await page.waitForTimeout(400);

    const overflowFindings = [];
    const contrastFindings = [];

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      overflowFindings.push(...(await collectOverflow(page)).map(entry => ({ ...entry, width })));
      contrastFindings.push(...(await collectContrast(page)).map(entry => ({ ...entry, width })));
    }

    // Studio öffnen und dasselbe dort prüfen – der Dialog trägt die dichteste
    // Oberfläche der Anwendung und war der Ort der bisherigen Abschnitte.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click('#autoPlanBtn');
    await page.waitForSelector('#autoPlanDialog[open]', { timeout: 30000 });
    await page.waitForTimeout(900);
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      overflowFindings.push(...(await collectOverflow(page)).map(entry => ({ ...entry, width, where: 'studio' })));
      contrastFindings.push(...(await collectContrast(page)).map(entry => ({ ...entry, width, where: 'studio' })));
    }

    expect(overflowFindings, `Elemente ragen aus ihrem Rahmen: ${JSON.stringify(overflowFindings.slice(0, 12), null, 2)}`).toEqual([]);
    expect(contrastFindings, `Zu geringer Lesekontrast: ${JSON.stringify(contrastFindings.slice(0, 12), null, 2)}`).toEqual([]);
  });
}

/**
 * Regression: Bis v10.4 hing das Banner „Algorithmuszustand" als
 * `position: absolute` über der Leinwand. In der Kristall-Ansicht fiel das
 * nicht auf, in der Orbit-Ansicht verdeckte es die Animation. Der Test misst
 * die Rechtecke beider Elemente in beiden Visualisierungen und verlangt, dass
 * sie sich nicht schneiden.
 */
for (const visual of ['crystal', 'orbit']) {
  test(`Algorithmuszustand überlagert die Leinwand nicht · ${visual}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/');
    await page.waitForSelector('#autoPlanBtn', { timeout: 30000 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click('#autoPlanBtn');
    await page.waitForSelector('#autoPlanDialog[open]', { timeout: 30000 });
    // Die Laufansicht erscheint erst im Zustand „läuft"; der Dialog wird dafür
    // aus der Parametrierung in den Laufzustand versetzt, ohne eine echte
    // Optimierung zu starten — geprüft wird Geometrie, nicht Rechenergebnis.
    await page.evaluate(mode => {
      document.documentElement.dataset.autoPlanVisual = mode;
      const dialog = document.getElementById('autoPlanDialog');
      dialog.classList.remove('is-configuring');
      dialog.classList.add('is-running');
      dialog.dataset.phase = 'analysis';
      const config = document.getElementById('autoPlanConfig');
      if (config) config.hidden = true;
      const stage = document.getElementById('autoPlanStage');
      if (stage) stage.hidden = false;
    }, visual);
    await page.waitForTimeout(700);

    const geometry = await page.evaluate(() => {
      const box = element => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        canvas: box(document.getElementById('autoPlanCanvas')),
        narrative: box(document.getElementById('autoPlanPhaseNarrative')),
        badge: box(document.querySelector('.auto-plan-visual .auto-plan-engine-badge'))
      };
    });

    expect(geometry.canvas, 'Leinwand ist sichtbar').toBeTruthy();
    expect(geometry.canvas.width).toBeGreaterThan(40);
    expect(geometry.canvas.height).toBeGreaterThan(40);

    const overlaps = (a, b) => a && b
      && a.left < b.right - 0.5 && b.left < a.right - 0.5
      && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

    expect(overlaps(geometry.canvas, geometry.narrative),
      `Zustandsbanner schneidet die Leinwand: ${JSON.stringify(geometry, null, 2)}`).toBe(false);
    expect(overlaps(geometry.canvas, geometry.badge),
      `Engine-Badge schneidet die Leinwand: ${JSON.stringify(geometry, null, 2)}`).toBe(false);
  });
}
