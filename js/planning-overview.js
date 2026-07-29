import { state, getMonthData } from './state.js';
import {
  buildStats,
  getAbsence,
  getAssignment,
  getPreference,
  labelForAbsence,
  labelForPreference
} from './rules.js';

const SPACING_REASON = 'Weniger als 3 dienstfreie Tage seit letztem BD';
const LOW_SEVERITY_REASONS = [SPACING_REASON, 'BD-Richtwert', 'Wunsch:'];
let refreshQueued = false;
let rendering = false;

function parseIso(iso) { return new Date(`${iso}T00:00:00`); }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function toIso(date) { return date.toISOString().slice(0, 10); }
function isWeekday(date) { return date.getDay() >= 1 && date.getDay() <= 5; }
function monthKeyForIso(iso) { const d = parseIso(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthForIso(iso) { return state.months.get(monthKeyForIso(iso)); }
function absenceAt(staffId, iso) { const month = monthForIso(iso); return month ? getAbsence(month, staffId, iso) : ''; }

function isWeekdayBdFzaBd(staffId, dateIso) {
  const current = parseIso(dateIso);
  const fzaDate = addDays(current, -1);
  const previousBdDate = addDays(current, -2);
  if (![current, fzaDate, previousBdDate].every(isWeekday)) return false;
  if (absenceAt(staffId, toIso(fzaDate)) !== 'fza') return false;
  return getAssignment(state, toIso(previousBdDate), 'bd') === staffId;
}

function isImmediatePostBdFza(staffId, dateIso, absence) {
  if (absence !== 'fza') return false;
  return getAssignment(state, toIso(addDays(parseIso(dateIso), -1)), 'bd') === staffId;
}

function reasonsAllowDowngrade(reasons) {
  return reasons.length > 0 && reasons.every(reason => LOW_SEVERITY_REASONS.some(prefix => reason.startsWith(prefix)));
}

function downgradeElement(container, chip) {
  container.classList.remove('orange');
  container.classList.add('yellow');
  if (chip) {
    chip.classList.remove('orange');
    chip.classList.add('yellow');
    chip.textContent = 'Hinweis';
  }
}

function applyBdFzaBdDowngrade() {
  const picker = state.currentPicker;
  if (picker?.role === 'bd') {
    document.querySelectorAll('#pickerList .picker-item.orange').forEach(item => {
      const name = item.querySelector('.name')?.textContent?.trim();
      const person = state.staff.find(entry => entry.name === name);
      const reasons = [...item.querySelectorAll('.reasons span')].map(node => node.textContent.trim()).filter(Boolean);
      if (!person || !isWeekdayBdFzaBd(person.id, picker.dateIso) || !reasons.includes(SPACING_REASON) || !reasonsAllowDowngrade(reasons)) return;
      downgradeElement(item, item.querySelector('.small-chip'));
      item.title = item.title.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
      const reasonNode = [...item.querySelectorAll('.reasons span')].find(node => node.textContent.trim() === SPACING_REASON);
      if (reasonNode) reasonNode.textContent = 'BD–FZA–BD werktags: gelber Hinweis';
    });
  }

  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const dates = Object.keys(monthData.days || {});
  document.querySelectorAll('#planTableBody tr').forEach((row, index) => {
    const dateIso = dates[index];
    const button = row.children[2]?.querySelector('.assignment-btn');
    if (!dateIso || !button?.title?.includes(SPACING_REASON)) return;
    const person = state.staff.find(entry => entry.name === button.querySelector('.assignment-name')?.textContent?.trim());
    const reasons = button.title.split('\n').map(value => value.trim()).filter(Boolean);
    if (!person || !isWeekdayBdFzaBd(person.id, dateIso) || !reasonsAllowDowngrade(reasons)) return;
    downgradeElement(button, button.querySelector('.small-chip'));
    button.title = button.title.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
  });

  document.querySelectorAll('#issuesList .issue-card').forEach(card => {
    const details = card.querySelector('p')?.textContent || '';
    if (!details.includes(SPACING_REASON)) return;
    const title = card.querySelector('strong')?.textContent || '';
    const match = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const person = state.staff.find(entry => title.includes(entry.name));
    if (!match || !person) return;
    const dateIso = `${match[3]}-${match[2]}-${match[1]}`;
    const reasons = details.split(' · ').map(value => value.trim()).filter(Boolean);
    if (!isWeekdayBdFzaBd(person.id, dateIso) || !reasonsAllowDowngrade(reasons)) return;
    downgradeElement(card, card.querySelector('.small-chip'));
    card.querySelector('p').textContent = details.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
  });
}

function formatDate(iso) {
  const date = parseIso(iso);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.`;
}

function groupEntries(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    if (!groups.has(entry.type)) groups.set(entry.type, []);
    groups.get(entry.type).push(entry.dateIso);
  });
  return [...groups.entries()].map(([type, dates]) => ({ type, dates: dates.sort() }));
}

function compactDateRange(dates) {
  if (!dates.length) return '';
  const sorted = [...dates].sort();
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    const expected = toIso(addDays(parseIso(previous), 1));
    if (current === expected) { previous = current; continue; }
    ranges.push(start === previous ? formatDate(start) : `${formatDate(start)}–${formatDate(previous)}`);
    start = current;
    previous = current;
  }
  return ranges.join(', ');
}

function createEntryChip(group, kind) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `excel-entry-chip ${kind} ${group.type}`;
  const label = kind === 'absence' ? labelForAbsence(group.type) : labelForPreference(group.type);
  chip.textContent = `${compactDateRange(group.dates)} ${label}`;
  chip.title = 'Ersten Eintrag bearbeiten';
  chip.addEventListener('click', () => openDayEditor(group.dates[0]));
  return chip;
}

function openDayEditor(dateIso) {
  const dates = Object.keys(getMonthData(state.currentYear, state.currentMonth).days || {});
  const row = document.querySelectorAll('#planTableBody tr')[dates.indexOf(dateIso)];
  row?.querySelector('.summary-cell .link-btn')?.click();
}

function renderCompactStats() {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;
  const stats = buildStats(state, getMonthData(state.currentYear, state.currentMonth));
  grid.className = 'excel-stats-wrap';
  grid.innerHTML = '<table class="excel-stats-table"><thead><tr><th>Mitarbeitende</th><th>BD</th><th>BD-Ziel</th><th>Δ BD</th><th>HG</th><th>WE-Äq.</th></tr></thead><tbody></tbody></table>';
  const tbody = grid.querySelector('tbody');
  stats.forEach(stat => {
    const delta = stat.bdTarget ? stat.bd - stat.bdTarget : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${stat.name}</strong><span>${stat.roleLabel}</span></td><td>${stat.bd}</td><td>${stat.bdTarget ?? '—'}</td><td class="${delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : ''}">${delta > 0 ? '+' : ''}${delta}</td><td>${stat.hg}</td><td>${stat.weekendEq}</td>`;
    tbody.appendChild(tr);
  });
}

function renderPlanningTable() {
  const target = document.getElementById('planningGrid');
  if (!target) return;
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const rows = [];

  state.staff.filter(person => person.includeInAbsenceList).forEach(person => {
    const absences = [];
    const negative = [];
    const positive = [];
    Object.keys(monthData.days || {}).forEach(dateIso => {
      const absence = getAbsence(monthData, person.id, dateIso);
      const preference = getPreference(monthData, person.id, dateIso);
      if (absence && !isImmediatePostBdFza(person.id, dateIso, absence)) absences.push({ type: absence, dateIso });
      if (preference) {
        const entry = { type: preference, dateIso };
        if (preference.startsWith('kein-')) negative.push(entry); else positive.push(entry);
      }
    });
    if (absences.length || negative.length || positive.length) rows.push({ person, absences, negative, positive });
  });

  target.innerHTML = '<table class="excel-planning-table"><thead><tr><th>Mitarbeitende</th><th>Urlaub / Frei / Abwesenheit</th><th>Kein Dienst / Einschränkungen</th><th>Bevorzugte Dienste</th></tr></thead><tbody></tbody></table>';
  const tbody = target.querySelector('tbody');

  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="excel-empty">Keine Urlaubstage, Freizeitausgleiche oder Dienstwünsche im aktuellen Monat.</td>';
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(({ person, absences, negative, positive }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${person.name}</strong><span>${person.roleLabel || ''}</span></td><td></td><td></td><td></td>`;
    groupEntries(absences).forEach(group => tr.children[1].appendChild(createEntryChip(group, 'absence')));
    groupEntries(negative).forEach(group => tr.children[2].appendChild(createEntryChip(group, 'negative')));
    groupEntries(positive).forEach(group => tr.children[3].appendChild(createEntryChip(group, 'positive')));
    [1, 2, 3].forEach(index => { if (!tr.children[index].children.length) tr.children[index].textContent = '—'; });
    tbody.appendChild(tr);
  });
}

function updateIssueSummary() {
  const badge = document.getElementById('issueCount');
  if (badge) badge.textContent = String(document.querySelectorAll('#issuesList .issue-card').length);
}

function injectStyles() {
  if (document.getElementById('excel-layout-styles')) return;
  const style = document.createElement('style');
  style.id = 'excel-layout-styles';
  style.textContent = `
    .excel-shell { max-width: 1540px; margin: 0 auto; }
    .excel-content { display: block; min-width: 0; }
    .excel-sheet { padding: 1rem; overflow: hidden; }
    .excel-title-row { margin-bottom: .65rem; align-items: end; }
    .compact-legend { font-size: .78rem; gap: .7rem; }
    .plan-table-wrap { border-radius: 8px; border-color: rgba(255,255,255,.14); }
    .plan-table { min-width: 980px; font-size: .88rem; }
    .plan-table th, .plan-table td { padding: .38rem .46rem; border-right: 1px solid rgba(255,255,255,.075); }
    .plan-table th { font-size: .76rem; letter-spacing: .02em; }
    .assignment-btn { min-height: 34px; padding: .38rem .5rem; border-radius: 7px; background: rgba(255,255,255,.035); }
    .assignment-btn .assignment-name { font-size: .84rem; }
    .rbn-input { min-height: 34px; padding: .38rem .48rem; border-radius: 6px; font-size: .84rem; }
    .summary-chip { padding: .2rem .4rem; border-radius: 5px; font-size: .69rem; }
    .summary-cell .link-btn { font-size: .72rem; }
    .sheet-block { margin-top: .9rem; border-top: 1px solid rgba(255,255,255,.15); padding-top: .75rem; }
    .sheet-block-heading { display: flex; justify-content: space-between; align-items: end; margin-bottom: .5rem; }
    .sheet-block-heading h3 { font-size: 1rem; }
    .excel-stats-wrap, #planningGrid { overflow-x: auto; }
    .excel-stats-table, .excel-planning-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .excel-stats-table th, .excel-stats-table td, .excel-planning-table th, .excel-planning-table td { border: 1px solid rgba(255,255,255,.11); padding: .42rem .5rem; text-align: left; vertical-align: top; }
    .excel-stats-table th, .excel-planning-table th { background: rgba(255,255,255,.075); color: rgba(255,255,255,.78); font-size: .72rem; }
    .excel-stats-table td:not(:first-child) { text-align: center; width: 9%; }
    .excel-stats-table td:first-child span, .excel-planning-table td:first-child span { display: block; color: var(--muted); font-size: .7rem; margin-top: .08rem; }
    .excel-planning-table th:first-child { width: 17%; }
    .excel-planning-table th:not(:first-child) { width: 27.66%; }
    .excel-entry-chip { display: inline-flex; margin: .08rem .18rem .08rem 0; padding: .23rem .4rem; border-radius: 5px; font-size: .69rem; line-height: 1.2; }
    .excel-entry-chip.absence { background: rgba(255,255,255,.09); }
    .excel-entry-chip.negative { border-color: rgba(241,108,108,.35); color: #ffc2c2; background: rgba(241,108,108,.08); }
    .excel-entry-chip.positive { border-color: rgba(82,212,138,.32); color: #a9efc7; background: rgba(82,212,138,.08); }
    .delta-positive { color: var(--yellow); font-weight: 700; }
    .delta-negative { color: rgba(255,255,255,.58); }
    .excel-empty { text-align: center !important; color: var(--muted); padding: .85rem !important; }
    .compact-issue-panel { padding-top: .6rem; }
    .compact-issue-panel details { border: 1px solid rgba(255,255,255,.1); border-radius: 8px; overflow: hidden; }
    .compact-issue-panel summary { cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: .58rem .7rem; font-weight: 650; background: rgba(255,255,255,.045); }
    .issue-count { min-width: 1.6rem; height: 1.35rem; display: grid; place-items: center; border-radius: 999px; background: rgba(255,255,255,.09); font-size: .72rem; }
    .compact-issue-panel .issues-list { max-height: 360px; padding: .55rem; }
    .compact-issue-panel .issue-card { padding: .55rem .65rem; border-radius: 6px; }
    @media (max-width: 900px) { .excel-shell { max-width: none; } .excel-sheet { padding: .75rem; } }
    @media print { .planning-panel, .compact-issue-panel { display: none !important; } .sheet-block { margin-top: 4mm; padding-top: 2mm; } .excel-stats-table { font-size: 7px; } .excel-stats-table th, .excel-stats-table td { padding: 1.2mm; } }
  `;
  document.head.appendChild(style);
}

function refresh() {
  if (rendering) return;
  rendering = true;
  observer.disconnect();
  try {
    injectStyles();
    renderCompactStats();
    renderPlanningTable();
    applyBdFzaBdDowngrade();
    updateIssueSummary();
  } finally {
    observer.observe(document.body, { childList: true, subtree: true });
    rendering = false;
  }
}

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; refresh(); });
}

const observer = new MutationObserver(() => scheduleRefresh());
window.addEventListener('DOMContentLoaded', () => {
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRefresh();
});
