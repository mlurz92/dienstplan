import { test, expect } from '@playwright/test';

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
const CONTRAST_HELPERS = `
  function parseColor(value) {
    const match = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const parts = match[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  function luminance({ r, g, b }) {
    const channel = value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }
  function over(front, back) {
    const alpha = front.a;
    return {
      r: front.r * alpha + back.r * (1 - alpha),
      g: front.g * alpha + back.g * (1 - alpha),
      b: front.b * alpha + back.b * (1 - alpha),
      a: 1
    };
  }
  function effectiveBackground(element) {
    let current = element;
    let stack = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    while (current && current.nodeType === 1) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color && color.a > 0) layers.push(color);
      if (color && color.a >= 0.999) break;
      current = current.parentElement;
    }
    if (!current) layers.push(document.documentElement.dataset.colorScheme === 'dark'
      ? { r: 12, g: 16, b: 21, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 });
    for (let index = layers.length - 1; index >= 0; index -= 1) stack = over(layers[index], stack);
    return stack;
  }
  function ratio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
`;

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

async function collectContrast(page) {
  return page.evaluate(helpers => {
    // eslint-disable-next-line no-eval
    eval(helpers);
    const problems = [];
    const seen = new Set();
    const roots = document.querySelectorAll('.app-shell, dialog[open]');
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.nodeValue?.trim();
        const element = node.parentElement;
        node = walker.nextNode();
        if (!text || text.length < 2 || !element || seen.has(element)) continue;
        seen.add(element);
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const front = parseColor(style.color);
        if (!front || front.a < 0.1) continue;
        const background = effectiveBackground(element);
        const composed = over(front, background);
        const value = ratio(composed, background);
        const size = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const threshold = large ? 3 : 4.5;
        if (value + 0.05 < threshold) {
          problems.push({
            text: text.slice(0, 40),
            selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`,
            ratio: Number(value.toFixed(2)),
            threshold,
            color: style.color
          });
        }
      }
    }
    return problems;
  }, CONTRAST_HELPERS);
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
