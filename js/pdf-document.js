/**
 * Minimaler PDF-Schreiber für den Direktexport des Monatsplans.
 *
 * Warum kein Fremdpaket: Der Ausdruck braucht Rechtecke, Linien und Text in
 * zwei Schnitten — mehr nicht. Eine ausgewachsene Bibliothek dafür auszuliefern
 * hieße, mehrere hundert Kilobyte in den Ladepfad zu legen für Fähigkeiten, die
 * dieser Plan nie benutzt. Die Standardschriften (Helvetica) sind in jedem
 * Betrachter vorhanden und müssen deshalb nicht eingebettet werden.
 *
 * Koordinaten kommen von außen in Millimetern und mit dem Ursprung **oben
 * links** — so, wie das Satzbild gedacht ist. Die Umrechnung auf das
 * PDF-Koordinatensystem (Punkte, Ursprung unten links) passiert hier.
 */

const MM_TO_PT = 72 / 25.4;

/** Zeichenbreiten der Standardschnitte, Tausendstel der Schriftgröße. */
const ASCII_WIDTHS = Object.freeze({
  regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
});

/**
 * Zeichen jenseits von ASCII, die in diesem Plan vorkommen können: die
 * WinAnsi-Bytefolge und — wo die Breite nicht der des Grundbuchstabens
 * entspricht — die eigene Breite. In Helvetica ist ein Umlaut genauso breit wie
 * sein Grundbuchstabe; die Tabelle bleibt dadurch kurz.
 */
const SPECIAL = Object.freeze({
  '€': [0x80, 556, 556], '‚': [0x82, 222, 278], '„': [0x84, 333, 500], '…': [0x85, 1000, 1000],
  '‰': [0x89, 1000, 1000], '‹': [0x8b, 333, 333], '‘': [0x91, 222, 278], '’': [0x92, 222, 278],
  '“': [0x93, 333, 500], '”': [0x94, 333, 500], '•': [0x95, 350, 350], '–': [0x96, 556, 556],
  '—': [0x97, 1000, 1000], '›': [0x9b, 333, 333], ' ': [0x20, 278, 278],
  '§': [0xa7, 556, 556], '°': [0xb0, 400, 400], '·': [0xb7, 278, 278], '×': [0xd7, 584, 584],
  'ß': [0xdf, 556, 611], 'µ': [0xb5, 556, 611], '±': [0xb1, 584, 584]
});

/** Grundbuchstabe eines akzentuierten Zeichens — Bytewert und Breite folgen ihm. */
const BASE_LETTER = Object.freeze({
  'À':'A','Á':'A','Â':'A','Ã':'A','Ä':'A','Å':'A','Æ':'A','Ç':'C','È':'E','É':'E','Ê':'E','Ë':'E',
  'Ì':'I','Í':'I','Î':'I','Ï':'I','Ñ':'N','Ò':'O','Ó':'O','Ô':'O','Õ':'O','Ö':'O','Ø':'O',
  'Ù':'U','Ú':'U','Û':'U','Ü':'U','Ý':'Y',
  'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a','æ':'a','ç':'c','è':'e','é':'e','ê':'e','ë':'e',
  'ì':'i','í':'i','î':'i','ï':'i','ñ':'n','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ø':'o',
  'ù':'u','ú':'u','û':'u','ü':'u','ý':'y','ÿ':'y'
});

const charWidth = (char, bold) => {
  const code = char.codePointAt(0);
  const table = ASCII_WIDTHS[bold ? 'bold' : 'regular'];
  if (code >= 32 && code <= 126) return table[code - 32];
  const special = SPECIAL[char];
  if (special) return special[bold ? 2 : 1];
  const base = BASE_LETTER[char];
  if (base) return table[base.codePointAt(0) - 32];
  if (code >= 0xa0 && code <= 0xff) return table[('?').codePointAt(0) - 32];
  return table[('?').codePointAt(0) - 32];
};

/** Textbreite in Millimetern. */
export function textWidth(text, sizePt, { bold = false, tracking = 0 } = {}) {
  const chars = [...String(text ?? '')];
  const units = chars.reduce((sum, char) => sum + charWidth(char, bold), 0);
  const width = (units / 1000) * sizePt + Math.max(0, chars.length - 1) * tracking * sizePt;
  return width / MM_TO_PT;
}

/** Kürzt einen Text so weit, dass er in die vorgegebene Breite passt. */
export function fitText(text, sizePt, maxWidthMm, options = {}) {
  const value = String(text ?? '');
  if (!value || textWidth(value, sizePt, options) <= maxWidthMm) return value;
  const chars = [...value];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join('')}…`;
    if (textWidth(candidate, sizePt, options) <= maxWidthMm) return candidate;
  }
  return '';
}

/** Unicode nach WinAnsi — die Kodierung, mit der die Schriften angemeldet sind. */
function toWinAnsi(text) {
  const bytes = [];
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0);
    if (code >= 32 && code <= 126) bytes.push(code);
    else if (SPECIAL[char]) bytes.push(SPECIAL[char][0]);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else if (BASE_LETTER[char]) bytes.push(BASE_LETTER[char].codePointAt(0));
    else bytes.push(0x3f);
  }
  return bytes;
}

/** Zeichenkette als PDF-Literal: Klammern und Rückstrich müssen maskiert sein. */
function pdfString(text) {
  return toWinAnsi(text)
    .map(byte => (byte === 0x28 || byte === 0x29 || byte === 0x5c ? `\\${String.fromCharCode(byte)}` : String.fromCharCode(byte)))
    .join('');
}

const num = value => {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const colorOps = (color, stroke) => {
  // Kanäle am PDF-Rand festhalten: Farbmischungen können vorzeichenbehaftete
  // oder überlaufende Werte erzeugen, und ein rg/RG-Operator außerhalb [0, 1]
  // ist in der Praxis ungültig. Korrekte Farben bleiben unverändert.
  const clampChannel = value => Math.min(255, Math.max(0, Number(value) || 0));
  const r = clampChannel(color[0]);
  const g = clampChannel(color[1]);
  const b = clampChannel(color[2]);
  return `${num(r / 255)} ${num(g / 255)} ${num(b / 255)} ${stroke ? 'RG' : 'rg'}`;
};

/**
 * Ein einseitiges PDF im Hochformat.
 *
 * @param {{width?: number, height?: number, title?: string}} options Maße in Millimetern.
 */
export function createPdfDocument({ width = 210, height = 297, title = '' } = {}) {
  const ops = [];
  const y = valueMm => (height - valueMm) * MM_TO_PT;
  const x = valueMm => valueMm * MM_TO_PT;

  const api = {
    width,
    height,

    /** Gefüllte und/oder umrandete Fläche. */
    rect(left, top, boxWidth, boxHeight, { fill = null, stroke = null, lineWidth = 0.2 } = {}) {
      if (!fill && !stroke) return api;
      if (fill) ops.push(colorOps(fill, false));
      if (stroke) ops.push(colorOps(stroke, true), `${num(lineWidth * MM_TO_PT)} w`);
      ops.push(`${num(x(left))} ${num(y(top + boxHeight))} ${num(x(boxWidth))} ${num(boxHeight * MM_TO_PT)} re`);
      ops.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
      return api;
    },

    /** Fläche mit halbrunden Schmalseiten — die Form der Monatsplakette. */
    pill(left, top, boxWidth, boxHeight, { fill = null, stroke = null, lineWidth = 0.2 } = {}) {
      const radius = boxHeight / 2;
      const k = radius * 0.5523;
      const bottom = top + boxHeight;
      const innerLeft = left + radius;
      const innerRight = left + boxWidth - radius;
      if (fill) ops.push(colorOps(fill, false));
      if (stroke) ops.push(colorOps(stroke, true), `${num(lineWidth * MM_TO_PT)} w`);
      ops.push(`${num(x(innerLeft))} ${num(y(top))} m`);
      ops.push(`${num(x(innerRight))} ${num(y(top))} l`);
      ops.push(`${num(x(innerRight + k))} ${num(y(top))} ${num(x(left + boxWidth))} ${num(y(top + radius - k))} `
        + `${num(x(left + boxWidth))} ${num(y(top + radius))} c`);
      ops.push(`${num(x(left + boxWidth))} ${num(y(bottom - radius + k))} ${num(x(innerRight + k))} ${num(y(bottom))} `
        + `${num(x(innerRight))} ${num(y(bottom))} c`);
      ops.push(`${num(x(innerLeft))} ${num(y(bottom))} l`);
      ops.push(`${num(x(innerLeft - k))} ${num(y(bottom))} ${num(x(left))} ${num(y(bottom - radius + k))} `
        + `${num(x(left))} ${num(y(top + radius))} c`);
      ops.push(`${num(x(left))} ${num(y(top + radius - k))} ${num(x(innerLeft - k))} ${num(y(top))} `
        + `${num(x(innerLeft))} ${num(y(top))} c`);
      ops.push(fill && stroke ? 'b' : fill ? 'f' : 's');
      return api;
    },

    line(fromX, fromY, toX, toY, { color = [0, 0, 0], lineWidth = 0.2 } = {}) {
      ops.push(colorOps(color, true), `${num(lineWidth * MM_TO_PT)} w`);
      ops.push(`${num(x(fromX))} ${num(y(fromY))} m ${num(x(toX))} ${num(y(toY))} l S`);
      return api;
    },

    /**
     * Text auf einer Grundlinie. `align` bezieht sich auf `left`:
     * `start` setzt dort an, `center` zentriert darum, `end` endet dort.
     */
    text(value, left, baseline, { size = 8, bold = false, color = [0, 0, 0], align = 'start', tracking = 0 } = {}) {
      const content = String(value ?? '');
      if (!content) return api;
      const measured = textWidth(content, size, { bold, tracking });
      const start = align === 'center' ? left - measured / 2 : align === 'end' ? left - measured : left;
      ops.push('BT', colorOps(color, false), `/${bold ? 'FB' : 'FR'} ${num(size)} Tf`);
      if (tracking) ops.push(`${num(tracking * size)} Tc`);
      ops.push(`${num(x(start))} ${num(y(baseline))} Td (${pdfString(content)}) Tj`);
      if (tracking) ops.push('0 Tc');
      ops.push('ET');
      return api;
    },

    /** Fertiges Dokument als Bytefolge. */
    toBytes() {
      const stream = ops.join('\n');
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width * MM_TO_PT)} ${num(height * MM_TO_PT)}] `
          + '/Resources << /Font << /FR 5 0 R /FB 6 0 R >> >> /Contents 4 0 R >>',
        // Jedes Zeichen des Inhaltsstroms liegt unter 256 — Zeichen- und
        // Bytelänge sind deshalb identisch.
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        `<< /Title (${pdfString(title)}) /Producer (DienstplanRAD) >>`
      ];

      let body = '%PDF-1.4\n';
      const offsets = [];
      objects.forEach((object, index) => {
        offsets.push(body.length);
        body += `${index + 1} 0 obj\n${object}\nendobj\n`;
      });
      const startxref = body.length;
      body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
      body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`
        + `startxref\n${startxref}\n%%EOF\n`;

      const bytes = new Uint8Array(body.length);
      for (let index = 0; index < body.length; index += 1) bytes[index] = body.charCodeAt(index) & 0xff;
      return bytes;
    }
  };

  return api;
}
