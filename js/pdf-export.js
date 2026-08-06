/**
 * Der Monatsplan als fertige PDF-Datei — ohne den Umweg über den Druckdialog.
 *
 * Bisher war „PDF exportieren" ein `window.print()`. Was dabei herauskam, hing
 * am Browser und an den Einstellungen des Dialogs: Papierformat, Ränder, Kopf-
 * und Fußzeilen, Hintergrundgrafiken — und der Dateiname am Dokumenttitel, den
 * nicht jeder Browser übernimmt. Hier entsteht das Blatt stattdessen selbst:
 * A4 hochkant, ein Blatt, immer derselbe Satzspiegel, immer der Name
 * „Dienstplan JJJJ-MM.pdf".
 *
 * Das Satzbild folgt bewusst dem bisherigen Druckstylesheet (`@media print` in
 * `styles.css`): Kopf mit Monatskontrast, Plantabelle mit Tag, Wochentag, BD,
 * HG, RBN und 2. RBN, darunter die auf Mitarbeitende, BD und HG reduzierte
 * Statistik. Das Modul kennt kein DOM und ist deshalb in Node prüfbar.
 */

import { createPdfDocument, fitText, textWidth } from './pdf-document.js?v=20260806.1';
import { colorProfileForDate, spectrumVariables } from './color-atlas-engine.js?v=20260806.1';
import { assignmentLabel, weekdayLabel } from './rules-core.js?v=20260806.1';
import { buildStats } from './rules-reporting.js?v=20260806.1';
import { rbnDisplayName } from './rbn.js?v=20260806.1';
import { holidayName as saxonyHolidayName } from './holidays.js?v=20260806.1';
import { MONTH_NAMES } from './defaults.js?v=20260806.1';

const PAGE = Object.freeze({ width: 210, height: 297, marginTop: 9, contentWidth: 168 });
const LEFT = (PAGE.width - PAGE.contentWidth) / 2;

/** Spaltenanteile des Druckstylesheets: 7 / 21 / 18 / 18 / 18 / 18 Prozent. */
const COLUMN_SHARES = Object.freeze([0.07, 0.21, 0.18, 0.18, 0.18, 0.18]);
const COLUMN_TITLES = Object.freeze(['Tag', 'Wochentag', 'BD', 'HG', 'RBN', '2. RBN']);

const PLAN_BUDGET = 172;
const PLAN_MAX_ROW = 5.9;
const STATS_BUDGET = 44;
const STATS_MAX_ROW = 5.4;
const HEAD_ROW = 5.2;
const STATS_WIDTH = 88;
const STATS_COLUMNS = Object.freeze([44, 22, 22]);

const GRID = Object.freeze([115, 115, 115]);
const WHITE = Object.freeze([255, 255, 255]);
const BLACK = Object.freeze([0, 0, 0]);

const rgb = value => (Array.isArray(value) ? value.slice(0, 3).map(part => Math.round(part)) : [0, 0, 0]);
/** Farbmischung wie `color-mix(in srgb, …)` im Stylesheet. */
const mixSrgb = (color, amount, other = WHITE) =>
  rgb(color).map((part, index) => Math.round(part * amount + other[index] * (1 - amount)));

const WEEKDAY_LONG = Object.freeze({
  Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag',
  Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag'
});

/** Der verbindliche Dateiname des Exports. */
export function planPdfFileName(year, month) {
  return `Dienstplan ${year}-${String(month).padStart(2, '0')}.pdf`;
}

/**
 * Alles, was auf das Blatt kommt — aus Monatsdaten und Personal abgeleitet.
 *
 * Bewusst getrennt vom Zeichnen: Der Inhalt lässt sich so prüfen, ohne ein PDF
 * zu erzeugen, und das Zeichnen kennt keine Fachlogik mehr.
 */
export function buildPlanPdfModel(state, monthData) {
  const year = monthData.year;
  const month = monthData.month;
  const staff = state?.staff || [];
  const palette = colorProfileForDate(year, month);

  const rows = Object.entries(monthData.days || {}).map(([iso, day]) => {
    const short = weekdayLabel(iso);
    const holiday = saxonyHolidayName(iso) || '';
    return {
      iso,
      day: Number(iso.slice(-2)),
      weekday: WEEKDAY_LONG[short] || short,
      holiday,
      bd: day.bd ? assignmentLabel(staff, day.bd, { short: true }) : '',
      hg: day.hg ? assignmentLabel(staff, day.hg, { short: true }) : '',
      rbn1: day.rbn1 ? rbnDisplayName(day.rbn1) : '',
      rbn2: day.rbn2 ? rbnDisplayName(day.rbn2) : '',
      kind: holiday ? 'holiday' : short === 'So' ? 'sunday' : short === 'Sa' ? 'saturday' : 'weekday'
    };
  });

  const stats = buildStats(state, monthData).map(entry => ({ name: entry.name, bd: entry.bd, hg: entry.hg }));
  const days = Object.values(monthData.days || {});
  stats.push({
    name: 'Offen',
    bd: days.filter(day => !day.bd).length,
    hg: days.filter(day => !day.hg).length,
    open: true
  });

  return {
    year,
    month,
    title: `${MONTH_NAMES[month - 1]} ${year}`,
    eyebrow: 'Bereitschaftsdienstplan',
    paletteLabel: `Monatskontrast · ${palette.name}`,
    colors: spectrumVariables(palette),
    rows,
    stats
  };
}

/** Zeichnet den Kopf und gibt die Unterkante zurück. */
function drawHeading(pdf, model, ink, accent, accentStrong) {
  const right = LEFT + PAGE.contentWidth;
  pdf.text(model.eyebrow.toUpperCase(), LEFT, 12.6, { size: 7, bold: true, color: accentStrong, tracking: 0.16 });
  pdf.text(model.title, LEFT, 18.4, { size: 13, bold: true, color: ink });

  // Die Plakette: neutrale Kontur, Beschriftung im Monatskontrast — genau wie
  // im Druckstylesheet, wo sie keine Farbfläche trägt.
  const label = model.paletteLabel;
  const pillWidth = textWidth(label, 6, { bold: true }) + 5;
  pdf.pill(right - pillWidth, 14.6, pillWidth, 3.8, { stroke: [77, 77, 77], lineWidth: 0.18 });
  pdf.text(label, right - pillWidth / 2, 17.4, { size: 6, bold: true, color: accentStrong, align: 'center' });

  pdf.rect(LEFT, 20.2, PAGE.contentWidth, 0.5, { fill: accent });
  return 24.1;
}

function drawPlanTable(pdf, model, top) {
  const colors = model.colors;
  const ink = rgb(colors['--month-ink']);
  const accent = rgb(colors['--month-accent']);
  const headBg = mixSrgb(accent, 0.26);
  const weekdayBg = rgb(colors['--weekday-field-bg']);
  const rowBg = Object.freeze({
    weekday: WHITE,
    saturday: rgb(colors['--saturday-row-bg']),
    sunday: rgb(colors['--sunday-row-bg']),
    holiday: rgb(colors['--holiday-row-bg'])
  });

  const widths = COLUMN_SHARES.map(share => share * PAGE.contentWidth);
  const edges = widths.reduce((list, width) => [...list, list.at(-1) + width], [LEFT]);
  const rowHeight = Math.min(PLAN_MAX_ROW, PLAN_BUDGET / Math.max(1, model.rows.length));
  const bodyHeight = rowHeight * model.rows.length;

  // Kopfzeile
  pdf.rect(LEFT, top, PAGE.contentWidth, HEAD_ROW, { fill: headBg });
  COLUMN_TITLES.forEach((title, index) => {
    pdf.text(title, edges[index] + 1.4, top + HEAD_ROW - 1.7, { size: 8, bold: true, color: ink });
  });
  pdf.line(LEFT, top + HEAD_ROW, LEFT + PAGE.contentWidth, top + HEAD_ROW, { color: ink, lineWidth: 0.35 });

  // Der senkrechte Anker der Ansicht: farbige Marke am linken Rand der
  // Tagesspalte für Wochenende und Feiertag, dazu die durchgehende Nuance der
  // Wochentagsspalte.
  const accentStrong = rgb(colors['--month-accent-strong']);
  const marker = Object.freeze({ weekday: null, saturday: accent, sunday: accentStrong, holiday: ink });

  // Flächen der Zeilen zuerst, damit die Linien darüber liegen.
  model.rows.forEach((row, index) => {
    const y = top + HEAD_ROW + index * rowHeight;
    const background = rowBg[row.kind];
    if (background !== WHITE) pdf.rect(LEFT, y, PAGE.contentWidth, rowHeight, { fill: background });
    pdf.rect(edges[1], y, widths[1], rowHeight, { fill: weekdayBg });
    if (marker[row.kind]) pdf.rect(LEFT, y, 1.1, rowHeight, { fill: marker[row.kind] });
    pdf.rect(edges[1], y, 0.8, rowHeight, { fill: row.kind === 'holiday' ? ink : accentStrong });
  });

  // Waagerechte Trennlinien und senkrechte Spaltenlinien
  for (let index = 1; index < model.rows.length; index += 1) {
    const y = top + HEAD_ROW + index * rowHeight;
    pdf.line(LEFT, y, LEFT + PAGE.contentWidth, y, { color: GRID, lineWidth: 0.12 });
  }
  for (let index = 1; index < edges.length - 1; index += 1) {
    pdf.line(edges[index], top, edges[index], top + HEAD_ROW + bodyHeight, { color: GRID, lineWidth: 0.12 });
  }

  const textSize = Math.min(8, rowHeight * 2.6);
  model.rows.forEach((row, index) => {
    const y = top + HEAD_ROW + index * rowHeight;
    const baseline = y + rowHeight / 2 + textSize * 0.352778 * 0.36;
    pdf.text(String(row.day), edges[1] - 1.6, baseline, { size: textSize, bold: true, color: ink, align: 'end' });

    if (row.holiday) {
      // Zwei Zeilen in einer Zeilenhöhe: Wochentag oben, Feiertag klein darunter.
      const holidaySize = Math.min(5.8, textSize - 1.4);
      pdf.text(row.weekday, edges[1] + 1.4, y + rowHeight * 0.46, { size: textSize - 0.6, bold: true, color: ink });
      pdf.text(fitText(row.holiday, holidaySize, widths[1] - 2.8), edges[1] + 1.4, y + rowHeight - 0.9,
        { size: holidaySize, bold: true, color: ink });
    } else {
      pdf.text(row.weekday, edges[1] + 1.4, baseline, { size: textSize, bold: true, color: ink });
    }

    [row.bd, row.hg, row.rbn1, row.rbn2].forEach((value, column) => {
      if (!value) return;
      const index2 = column + 2;
      pdf.text(fitText(value, textSize, widths[index2] - 2.8), edges[index2] + 1.4, baseline,
        { size: textSize, color: BLACK });
    });
  });

  pdf.rect(LEFT, top, PAGE.contentWidth, HEAD_ROW + bodyHeight, { stroke: ink, lineWidth: 0.35 });
  return top + HEAD_ROW + bodyHeight;
}

function drawStats(pdf, model, top) {
  const ink = rgb(model.colors['--month-ink']);
  const accent = rgb(model.colors['--month-accent']);
  const headBg = mixSrgb(accent, 0.26);
  const openBg = mixSrgb(accent, 0.12);

  pdf.text('Statistik', LEFT, top + 3.4, { size: 9.5, bold: true, color: ink });
  const tableTop = top + 5.4;
  const edges = STATS_COLUMNS.reduce((list, width) => [...list, list.at(-1) + width], [LEFT]);
  const rowHeight = Math.min(STATS_MAX_ROW, STATS_BUDGET / Math.max(1, model.stats.length));

  pdf.rect(LEFT, tableTop, STATS_WIDTH, HEAD_ROW, { fill: headBg });
  ['Mitarbeitende', 'BD', 'HG'].forEach((title, index) => {
    const centred = index > 0;
    pdf.text(title, centred ? edges[index] + STATS_COLUMNS[index] / 2 : edges[index] + 1.6,
      tableTop + HEAD_ROW - 1.7, { size: 8, bold: true, color: ink, align: centred ? 'center' : 'start' });
  });
  pdf.line(LEFT, tableTop + HEAD_ROW, LEFT + STATS_WIDTH, tableTop + HEAD_ROW, { color: ink, lineWidth: 0.35 });

  const textSize = Math.min(8, rowHeight * 2.6);
  model.stats.forEach((entry, index) => {
    const y = tableTop + HEAD_ROW + index * rowHeight;
    if (entry.open) pdf.rect(LEFT, y, STATS_WIDTH, rowHeight, { fill: openBg });
    if (index > 0) pdf.line(LEFT, y, LEFT + STATS_WIDTH, y, { color: GRID, lineWidth: 0.12 });
    const baseline = y + rowHeight / 2 + textSize * 0.352778 * 0.36;
    pdf.text(fitText(entry.name, textSize, STATS_COLUMNS[0] - 3.2), edges[0] + 1.6, baseline,
      { size: textSize, bold: Boolean(entry.open), color: BLACK });
    [entry.bd, entry.hg].forEach((value, column) => {
      pdf.text(String(value), edges[column + 1] + STATS_COLUMNS[column + 1] / 2, baseline,
        { size: textSize, bold: Boolean(entry.open), color: BLACK, align: 'center' });
    });
  });

  for (let index = 1; index < edges.length - 1; index += 1) {
    pdf.line(edges[index], tableTop, edges[index], tableTop + HEAD_ROW + rowHeight * model.stats.length,
      { color: GRID, lineWidth: 0.12 });
  }
  pdf.rect(LEFT, tableTop, STATS_WIDTH, HEAD_ROW + rowHeight * model.stats.length, { stroke: ink, lineWidth: 0.35 });
}

/** Das fertige Blatt als Bytefolge. */
export function renderPlanPdf(model) {
  const pdf = createPdfDocument({ ...PAGE, title: `Dienstplan ${model.year}-${String(model.month).padStart(2, '0')}` });
  const ink = rgb(model.colors['--month-ink']);
  const accent = rgb(model.colors['--month-accent']);
  const accentStrong = rgb(model.colors['--month-accent-strong']);

  const afterHeading = drawHeading(pdf, model, ink, accent, accentStrong);
  const afterPlan = drawPlanTable(pdf, model, afterHeading);
  drawStats(pdf, model, afterPlan + 7);
  return pdf.toBytes();
}

/** Monatsplan erzeugen und im Browser als Datei anbieten. */
export function downloadPlanPdf(state, monthData) {
  const model = buildPlanPdfModel(state, monthData);
  const bytes = renderPlanPdf(model);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = planPdfFileName(model.year, model.month);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Erst freigeben, wenn der Download angestoßen ist — sofortiges Widerrufen
  // bricht ihn in Safari ab.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return model;
}
