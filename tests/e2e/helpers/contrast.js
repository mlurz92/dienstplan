/**
 * Gemeinsame Kontrastmessung für die Browsertests.
 *
 * Gemessen wird gegen den *tatsächlich wirksamen* Hintergrund: Halbtransparente
 * Flächen werden über ihre Elternflächen gerechnet, bis eine deckende Fläche
 * erreicht ist. Ein Kontrastwert gegen `transparent` wäre bedeutungslos.
 *
 * Schwellen nach WCAG 2.1 Stufe AA: 4,5:1, bei großer Schrift 3:1.
 */

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
  /**
   * Der hellste Farbstopp eines Verlaufs.
   *
   * Eine Schaltfläche trägt ihre Fläche oft als \`background-image\`, nicht als
   * \`background-color\`. Wer nur die Farbe liest, misst gegen die Fläche des
   * Elternelements und meldet Fehler, wo keine sind — oder schlimmer: übersieht
   * eine weiße Bank unter weißer Schrift. Gewertet wird der hellste Stopp: Er
   * ist der ungünstigste Fall für helle Schrift.
   */
  function gradientLayer(style) {
    const image = style.backgroundImage;
    if (!image || image === 'none') return null;
    const stops = [...String(image).matchAll(/rgba?\([^)]+\)/g)]
      .map(match => parseColor(match[0]))
      .filter(color => color && color.a > 0.35);
    if (!stops.length) return null;
    return stops.reduce((brightest, color) => (luminance(color) > luminance(brightest) ? color : brightest));
  }
  function effectiveBackground(element) {
    let current = element;
    let stack = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    while (current && current.nodeType === 1) {
      const style = getComputedStyle(current);
      const gradient = gradientLayer(style);
      if (gradient) layers.push(gradient);
      const color = parseColor(style.backgroundColor);
      if (color && color.a > 0) layers.push(color);
      if (gradient && gradient.a >= 0.999) break;
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


export { CONTRAST_HELPERS, collectContrast };
