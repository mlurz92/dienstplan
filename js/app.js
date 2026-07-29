import { ABSENCE_TYPES, MONTH_NAMES, PREFERENCE_TYPES, SHEET_NAMES, toIsoDate } from './defaults.js';
import { state, bootstrapState, getMonthData, getMonthLabel, loadMonth, persistCurrentMonth, saveLocalBootstrap, scheduleSave, setMonthData, warmAdjacentMonths } from './state.js';
import { api } from './api.js';
import { buildStats, evaluateCandidate, fmtGermanDate, getAbsence, getAssignment, getPlanningStaff, getPreference, getStaffById, labelForAbsence, labelForPreference, setAbsence, setAssignment, setPreference, weekdayLabel } from './rules.js';

const $ = selector => document.querySelector(selector);
const els = {};
let pendingConflict = null;
const monthNameBySheet = Object.fromEntries(SHEET_NAMES.map((name, idx) => [name, idx + 1]));

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', async () => { if (state.dirty) await persistCurrentMonth(); });

async function init() {
  cacheElements();
  bindEvents();
  buildStaticSelectors();
  registerServiceWorker();
  setStatus('loading', 'Lädt …');
  await bootstrapState();
  populateSelectors();
  await openCurrentMonth(state.currentYear, state.currentMonth, true);
}

function cacheElements() {
  ['monthSelect','yearSelect','prevMonthBtn','nextMonthBtn','saveStatus','statusDot','planTableBody','statsGrid','monthTitle','pickerDialog','pickerList','pickerTitle','pickerEyebrow','pickerSubtitle','clearAssignmentBtn','dayMetaDialog','dayMetaTitle','dayMetaList','batchDialog','batchTitle','batchEyebrow','batchSubtitle','batchStaffSelect','batchTypeSelect','batchDayGrid','batchApplyBtn','batchClearSelectionBtn','conflictDialog','conflictDialogText','conflictReasons','conflictComment','confirmConflictBtn'].forEach(id => els[id] = document.getElementById(id));
}

function bindEvents() {
  $('#prevMonthBtn').addEventListener('click', () => shiftMonth(-1));
  $('#nextMonthBtn').addEventListener('click', () => shiftMonth(1));
  $('#monthSelect').addEventListener('change', () => openCurrentMonth(Number($('#yearSelect').value), Number($('#monthSelect').value)));
  $('#yearSelect').addEventListener('change', () => openCurrentMonth(Number($('#yearSelect').value), Number($('#monthSelect').value)));
  $('#todayBtn').addEventListener('click', () => {
    const now = new Date();
    $('#yearSelect').value = String(now.getFullYear());
    $('#monthSelect').value = String(now.getMonth() + 1);
    openCurrentMonth(now.getFullYear(), now.getMonth() + 1);
  });
  $('#reloadBtn').addEventListener('click', () => openCurrentMonth(state.currentYear, state.currentMonth, true));
  $('#absenceManagerBtn').addEventListener('click', () => openBatchDialog('absence'));
  $('#preferenceManagerBtn').addEventListener('click', () => openBatchDialog('preference'));
  $('#clearAssignmentBtn').addEventListener('click', onClearAssignment);
  $('#batchApplyBtn').addEventListener('click', onApplyBatch);
  $('#batchClearSelectionBtn').addEventListener('click', () => {
    document.querySelectorAll('.batch-day.selected').forEach(el => el.classList.remove('selected'));
  });
  $('#confirmConflictBtn').addEventListener('click', onConfirmConflict);
  $('#excelImportInput').addEventListener('change', onExcelImport);
  $('#exportExcelBtn').addEventListener('click', exportCurrentMonthToExcel);
  $('#exportPdfBtn').addEventListener('click', () => window.print());
  $('#exportJsonBtn').addEventListener('click', exportJsonBackup);
  $('#jsonImportInput').addEventListener('change', onJsonImport);
}

function buildStaticSelectors() {
  for (let i = 1; i <= 12; i++) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = MONTH_NAMES[i - 1];
    $('#monthSelect').append(option);
  }
  for (let year = 2025; year <= 2030; year++) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    $('#yearSelect').append(option);
  }
}

function populateSelectors() {
  $('#monthSelect').value = String(state.currentMonth);
  $('#yearSelect').value = String(state.currentYear);
}

async function openCurrentMonth(year, month, forceServer = false) {
  setStatus('loading', forceServer ? 'Lädt Serverstand …' : 'Lädt …');
  await loadMonth(year, month, forceServer);
  await warmAdjacentMonths(year, month);
  setStatus(state.serverReady ? 'saved' : 'offline', state.serverReady ? 'Gespeichert' : 'Offline – lokaler Stand');
  populateSelectors();
  render();
}

function render() {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  $('#monthTitle').textContent = getMonthLabel();
  renderPlanTable(monthData);
  renderStats(monthData);
}

function renderPlanTable(monthData) {
  const tbody = $('#planTableBody');
  tbody.innerHTML = '';
  for (const [iso, day] of Object.entries(monthData.days)) {
    const tr = document.createElement('tr');
    const weekday = weekdayLabel(iso);
    const isWeekend = ['Sa', 'So'].includes(weekday);
    if (isWeekend) tr.classList.add('weekend-row');
    tr.innerHTML = `
      <td class="date-cell">${Number(iso.slice(-2))}</td>
      <td class="weekday-cell">${weekdayLabelLong(weekday)}</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td class="absence-summary-cell"></td>
      <td class="preference-summary-cell"></td>`;
    tr.children[2].appendChild(buildAssignmentButton(iso, 'bd', day.bd, monthData));
    tr.children[3].appendChild(buildAssignmentButton(iso, 'hg', day.hg, monthData));
    tr.children[4].appendChild(buildRbnInput(iso, 'rbn1', day.rbn1 || ''));
    tr.children[5].appendChild(buildRbnInput(iso, 'rbn2', day.rbn2 || ''));
    tr.children[6].appendChild(buildAbsenceSummary(iso, monthData));
    tr.children[7].appendChild(buildPreferenceSummary(iso, monthData));
    tbody.appendChild(tr);
  }
}

function weekdayLabelLong(shortLabel) {
  return ({ Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' })[shortLabel] || shortLabel;
}

function buildAssignmentButton(dateIso, role, staffId, monthData) {
  const button = document.createElement('button');
  button.className = 'assignment-btn';
  const person = getStaffById(state.staff, staffId);
  const name = person?.name || '—';
  const evaluation = staffId ? evaluateCandidate({ state, monthData, dateIso, role, staffId }) : { level: 'green', reasons: [] };
  button.innerHTML = `
    <span class="assignment-name">${name}</span>
    <span class="assignment-badges">${staffId ? `<span class="small-chip ${evaluation.level}">${labelByLevel(evaluation.level)}</span>` : '<span class="small-chip">offen</span>'}</span>`;
  button.title = staffId ? evaluation.reasons.join('\n') : `${role.toUpperCase()} eintragen`;
  button.addEventListener('click', () => openPicker(dateIso, role));
  return button;
}

function buildRbnInput(dateIso, field, value) {
  const wrapper = document.createElement('div');
  const input = document.createElement('input');
  const listId = `rbnSuggestions`;
  input.className = 'rbn-input';
  input.value = value;
  input.setAttribute('list', listId);
  input.placeholder = 'manuell';
  input.addEventListener('change', async () => {
    const monthData = getMonthData(state.currentYear, state.currentMonth);
    monthData.days[dateIso][field] = input.value.trim();
    if (input.value.trim() && !state.rbnNames.includes(input.value.trim())) {
      state.rbnNames.push(input.value.trim());
      state.rbnNames = [...new Set(state.rbnNames)].sort((a,b)=>a.localeCompare(b,'de'));
      saveLocalBootstrap();
      try { await api.saveRbnNames(state.rbnNames); } catch {}
    }
    markDirty();
  });
  wrapper.appendChild(input);
  let datalist = document.getElementById(listId);
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = listId;
    document.body.appendChild(datalist);
  }
  datalist.innerHTML = '';
  state.rbnNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    datalist.appendChild(opt);
  });
  return wrapper;
}

function isImmediatePostBdFza(personId, dateIso, absence) {
  if (absence !== 'fza') return false;
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() - 1);
  const previousIso = date.toISOString().slice(0, 10);
  return getAssignment(state, previousIso, 'bd') === personId;
}

function buildAbsenceSummary(dateIso, monthData) {
  const wrapper = document.createElement('button');
  wrapper.type = 'button';
  wrapper.className = 'cell-summary-button';
  const entries = [];
  for (const person of state.staff.filter(item => item.includeInAbsenceList)) {
    const absence = getAbsence(monthData, person.id, dateIso);
    if (!absence || isImmediatePostBdFza(person.id, dateIso, absence)) continue;
    entries.push(`${person.short}: ${shortAbsenceLabel(absence)}`);
  }
  wrapper.textContent = entries.length ? entries.join(', ') : '';
  wrapper.title = entries.length ? entries.join('\n') : 'Abwesenheiten bearbeiten';
  wrapper.addEventListener('click', () => openDayMetaDialog(dateIso));
  return wrapper;
}

function buildPreferenceSummary(dateIso, monthData) {
  const wrapper = document.createElement('button');
  wrapper.type = 'button';
  wrapper.className = 'cell-summary-button';
  const entries = [];
  for (const person of state.staff.filter(item => item.includeInAbsenceList)) {
    const pref = getPreference(monthData, person.id, dateIso);
    if (!pref) continue;
    entries.push(`${person.short}: ${shortPreferenceLabel(pref)}`);
  }
  wrapper.textContent = entries.length ? entries.join(', ') : '';
  wrapper.title = entries.length ? entries.join('\n') : 'Dienstwünsche bearbeiten';
  wrapper.addEventListener('click', () => openDayMetaDialog(dateIso));
  return wrapper;
}

function shortAbsenceLabel(type) {
  return ({ urlaub: 'U', fza: 'FZA', weiterbildung: 'WB', sonstige: 'abwesend' })[type] || labelForAbsence(type);
}

function shortPreferenceLabel(type) {
  return ({
    'kein-bd': 'kein BD',
    'kein-hg': 'kein HG',
    'kein-dienst': 'kein Dienst',
    'bd-bevorzugt': '+BD',
    'hg-bevorzugt': '+HG',
    'dienst-bevorzugt': '+Dienst'
  })[type] || labelForPreference(type);
}

function renderStats(monthData) {
  const stats = buildStats(state, monthData);
  const openBd = Object.values(monthData.days || {}).filter(day => !day.bd).length;
  const openHg = Object.values(monthData.days || {}).filter(day => !day.hg).length;
  const table = document.createElement('table');
  table.className = 'distribution-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Mitarbeitende</th>
        <th>BD</th>
        <th>HG</th>
        <th>Wochenende</th>
        <th>BD-Soll</th>
        <th>Rest</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  stats.forEach(stat => {
    const row = document.createElement('tr');
    const remaining = stat.bdRemaining ?? '';
    row.innerHTML = `
      <td>${stat.name}</td>
      <td>${stat.bd}</td>
      <td>${stat.hg}</td>
      <td>${stat.weekendEq}</td>
      <td>${stat.bdTarget || ''}</td>
      <td class="${Number(remaining) < 0 ? 'over-target' : ''}">${remaining}</td>`;
    tbody.appendChild(row);
  });
  const openRow = document.createElement('tr');
  openRow.className = 'open-row';
  openRow.innerHTML = `<td>Offen</td><td>${openBd}</td><td>${openHg}</td><td></td><td></td><td></td>`;
  tbody.appendChild(openRow);
  $('#statsGrid').replaceChildren(table);
}

function openPicker(dateIso, role) {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  state.currentPicker = { dateIso, role };
  $('#pickerEyebrow').textContent = role === 'bd' ? 'Bereitschaftsdienst' : 'Hintergrunddienst';
  $('#pickerTitle').textContent = `${fmtGermanDate(dateIso)} · ${role.toUpperCase()}`;
  $('#pickerSubtitle').textContent = 'Farbkodierte Eignungsbewertung mit Tooltip-Begründung. Rote Konflikte erfordern eine explizite Bestätigung.';
  $('#pickerList').innerHTML = '';
  const staffList = getPlanningStaff(state.staff, dateIso);
  staffList.forEach(person => {
    const evaluation = evaluateCandidate({ state, monthData, dateIso, role, staffId: person.id });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `picker-item ${evaluation.level}`;
    button.title = evaluation.reasons.join('\n');
    button.innerHTML = `<div class="topline"><span class="name">${person.name}</span><span class="small-chip ${evaluation.level}">${labelByLevel(evaluation.level)}</span></div><div class="reasons">${evaluation.reasons.map(r => `<span>${r}</span>`).join('')}</div>`;
    button.addEventListener('click', () => onPickStaff(person.id, evaluation));
    $('#pickerList').appendChild(button);
  });
  $('#pickerDialog').showModal();
}

async function onPickStaff(staffId, evaluation) {
  const { dateIso, role } = state.currentPicker;
  if (evaluation.level === 'red') {
    pendingConflict = { staffId, evaluation, dateIso, role };
    $('#conflictDialogText').textContent = `${getStaffById(state.staff, staffId)?.name} wird für ${role.toUpperCase()} am ${fmtGermanDate(dateIso)} mit rotem Konflikt eingetragen.`;
    $('#conflictReasons').innerHTML = evaluation.reasons.map(reason => `<div class="small-chip red">${reason}</div>`).join('');
    $('#conflictComment').value = '';
    $('#conflictDialog').showModal();
    return;
  }
  applyAssignment(staffId, dateIso, role, evaluation, '');
  $('#pickerDialog').close();
}

function onConfirmConflict() {
  if (!pendingConflict) return;
  applyAssignment(pendingConflict.staffId, pendingConflict.dateIso, pendingConflict.role, pendingConflict.evaluation, $('#conflictComment').value.trim());
  pendingConflict = null;
  $('#conflictDialog').close();
  $('#pickerDialog').close();
}

function applyAssignment(staffId, dateIso, role, evaluation, comment) {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  setAssignment(monthData, dateIso, role, staffId);
  if (evaluation.level === 'red') {
    monthData.overrideLog ||= [];
    monthData.overrideLog.push({
      timestamp: new Date().toISOString(),
      dateIso,
      role,
      staffId,
      reasons: evaluation.reasons,
      comment: comment || ''
    });
  }
  markDirty();
  render();
}

function onClearAssignment() {
  if (!state.currentPicker) return;
  const { dateIso, role } = state.currentPicker;
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  setAssignment(monthData, dateIso, role, '');
  markDirty();
  render();
}

function openDayMetaDialog(dateIso) {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  $('#dayMetaTitle').textContent = `Markierungen für ${fmtGermanDate(dateIso)}`;
  $('#dayMetaList').innerHTML = '';
  state.staff.filter(item => item.includeInAbsenceList).forEach(person => {
    const row = document.createElement('div');
    row.className = 'day-meta-row';
    const absence = getAbsence(monthData, person.id, dateIso);
    const pref = getPreference(monthData, person.id, dateIso);
    row.innerHTML = `<div class="row-title"><strong>${person.name}</strong><span class="small-chip">${person.roleLabel || ''}</span></div>`;
    const absGroup = document.createElement('div');
    absGroup.className = 'meta-group';
    ABSENCE_TYPES.forEach(type => absGroup.appendChild(buildMetaChip({ kind:'absence', dateIso, staffId: person.id, typeId: type.id, active: absence === type.id, label: type.label })));
    absGroup.appendChild(buildMetaChip({ kind:'absence', dateIso, staffId: person.id, typeId: '', active: !absence, label: 'keine' }));
    const prefGroup = document.createElement('div');
    prefGroup.className = 'meta-group';
    PREFERENCE_TYPES.forEach(type => prefGroup.appendChild(buildMetaChip({ kind:'preference', dateIso, staffId: person.id, typeId: type.id, active: pref === type.id, label: type.label })));
    prefGroup.appendChild(buildMetaChip({ kind:'preference', dateIso, staffId: person.id, typeId: '', active: !pref, label: 'kein Wunsch' }));
    row.appendChild(labelWrap('Abwesenheit', absGroup));
    row.appendChild(labelWrap('Dienstwunsch', prefGroup));
    $('#dayMetaList').appendChild(row);
  });
  $('#dayMetaDialog').showModal();
}

function labelWrap(text, node) {
  const wrap = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'eyebrow';
  label.textContent = text;
  wrap.appendChild(label);
  wrap.appendChild(node);
  return wrap;
}

function buildMetaChip({ kind, dateIso, staffId, typeId, active, label }) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `meta-chip ${active ? 'active' : ''}`;
  chip.textContent = label;
  chip.addEventListener('click', () => {
    const monthData = getMonthData(state.currentYear, state.currentMonth);
    if (kind === 'absence') setAbsence(monthData, staffId, dateIso, typeId);
    else setPreference(monthData, staffId, dateIso, typeId);
    markDirty();
    openDayMetaDialog(dateIso);
    render();
  });
  return chip;
}

function openBatchDialog(mode) {
  state.currentBatchMode = mode;
  $('#batchEyebrow').textContent = mode === 'absence' ? 'Komforteingabe Abwesenheiten' : 'Komforteingabe Dienstwünsche';
  $('#batchTitle').textContent = mode === 'absence' ? 'Abwesenheiten komfortabel setzen' : 'Dienstwünsche komfortabel setzen';
  $('#batchSubtitle').textContent = 'Beliebige einzelne Tage auswählen, Typ festlegen, gesammelt übernehmen.';
  $('#batchStaffSelect').innerHTML = '';
  state.staff.filter(item => item.includeInAbsenceList).forEach(person => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name;
    $('#batchStaffSelect').appendChild(option);
  });
  $('#batchTypeSelect').innerHTML = '';
  const source = mode === 'absence' ? ABSENCE_TYPES : PREFERENCE_TYPES;
  source.forEach(type => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.label;
    $('#batchTypeSelect').appendChild(option);
  });
  buildBatchGrid();
  $('#batchDialog').showModal();
}

function buildBatchGrid() {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const currentType = $('#batchTypeSelect').value;
  const staffId = $('#batchStaffSelect').value || state.staff.find(item => item.includeInAbsenceList)?.id;
  $('#batchDayGrid').innerHTML = '';
  Object.keys(monthData.days).forEach(iso => {
    const date = new Date(`${iso}T00:00:00`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `batch-day ${[0,6].includes(date.getDay()) ? 'weekend' : ''}`;
    const current = state.currentBatchMode === 'absence' ? getAbsence(monthData, staffId, iso) : getPreference(monthData, staffId, iso);
    if (current === currentType) button.classList.add('selected');
    button.dataset.dateIso = iso;
    button.innerHTML = `<strong>${String(date.getDate()).padStart(2,'0')}</strong><small>${weekdayLabel(iso)}</small><small>${current ? (state.currentBatchMode === 'absence' ? labelForAbsence(current) : labelForPreference(current)) : '—'}</small>`;
    button.addEventListener('click', () => button.classList.toggle('selected'));
    $('#batchDayGrid').appendChild(button);
  });
  $('#batchStaffSelect').onchange = buildBatchGrid;
  $('#batchTypeSelect').onchange = buildBatchGrid;
}

function onApplyBatch() {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const staffId = $('#batchStaffSelect').value;
  const typeId = $('#batchTypeSelect').value;
  document.querySelectorAll('.batch-day.selected').forEach(el => {
    const iso = el.dataset.dateIso;
    if (state.currentBatchMode === 'absence') setAbsence(monthData, staffId, iso, typeId);
    else setPreference(monthData, staffId, iso, typeId);
  });
  markDirty();
  render();
  $('#batchDialog').close();
}

function shiftMonth(delta) {
  const next = new Date(state.currentYear, state.currentMonth - 1 + delta, 1);
  $('#yearSelect').value = String(next.getFullYear());
  $('#monthSelect').value = String(next.getMonth() + 1);
  openCurrentMonth(next.getFullYear(), next.getMonth() + 1);
}

function markDirty() {
  scheduleSave(async () => {
    setStatus('saving', 'Speichert …');
    await persistCurrentMonth();
    setStatus(state.serverReady ? 'saved' : 'offline', state.serverReady ? 'Gespeichert' : 'Offline gespeichert');
  });
}

function setStatus(mode, text) {
  const colorMap = { loading: 'var(--yellow)', saving: 'var(--yellow)', saved: 'var(--green)', offline: 'var(--orange)', error: 'var(--red)' };
  $('#saveStatus').textContent = text;
  $('#statusDot').style.background = colorMap[mode] || 'var(--yellow)';
}

function labelByLevel(level) {
  return ({ green: 'geeignet', yellow: 'Hinweis', orange: 'Konflikt', red: 'rot', gray: 'inaktiv' })[level] || level;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

async function onExcelImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!window.XLSX) { alert('Excel-Bibliothek noch nicht geladen.'); return; }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const summary = [];
  const touchedMonths = [];
  for (const sheetName of workbook.SheetNames) {
    const month = monthNameBySheet[sheetName];
    if (!month) continue;
    const sheet = workbook.Sheets[sheetName];
    const imported = importMonthSheet(sheetName, sheet);
    if (imported) {
      const targetMonth = getMonthData(imported.year, imported.month);
      mergeMonthData(targetMonth, imported.monthData);
      summary.push(`${sheetName}: ${imported.log.join(', ') || 'importiert'}`);
      setMonthData(imported.year, imported.month, targetMonth);
      touchedMonths.push([imported.year, imported.month]);
      if (imported.year === state.currentYear && imported.month === state.currentMonth) render();
    }
  }
  for (const [year, month] of touchedMonths) {
    try { await api.saveMonth(year, month, getMonthData(year, month)); } catch {}
  }
  render();
  alert(`Import abgeschlossen.\n\n${summary.join('\n')}`);
  event.target.value = '';
}

function importMonthSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const dayRowIndex = rows.findIndex(row => row.slice(2).filter(cell => Number.isFinite(Number(cell)) && Number(cell) >= 1 && Number(cell) <= 31).length >= 20);
  if (dayRowIndex < 0) return null;
  const yearCell = String(rows[0]?.[0] || rows[1]?.[0] || '').match(/20\d{2}/);
  const year = yearCell ? Number(yearCell[0]) : state.currentYear;
  const month = monthNameBySheet[sheetName];
  const monthData = getMonthData(year, month);
  const log = [];

  const dayCols = [];
  rows[dayRowIndex].forEach((cell, index) => {
    const n = Number(cell);
    if (index >= 2 && Number.isFinite(n) && n >= 1 && n <= 31) dayCols.push({ col: index, day: n, iso: toIsoDate(year, month, n) });
  });

  const normalizeName = name => String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const staffMap = new Map(state.staff.map(person => [normalizeName(person.name), person.id]));
  staffMap.set('dr. lurz', 'lurz'); staffMap.set('dr. martin', 'martin'); staffMap.set('fr. dalitz', 'dalitz'); staffMap.set('dr. becker', 'becker'); staffMap.set('dr. polednia', 'polednia'); staffMap.set('hr. el houba', 'elhouba'); staffMap.set('fr. licenji', 'licenji'); staffMap.set('hr. sebastian', 'sebastian'); staffMap.set('fr. hellmann', 'hellmann'); staffMap.set('prof. schäfer', 'schaefer');

  for (let r = 0; r < rows.length; r++) {
    const name = normalizeName(rows[r]?.[0]);
    const type = normalizeName(rows[r]?.[1]);
    if (!name || type !== 'arbeitsplatz') continue;
    const staffId = staffMap.get(name);
    if (!staffId) continue;
    const dutyRow = rows[r + 1] || [];
    dayCols.forEach(({ col, iso }) => {
      const workplaceValue = String(rows[r][col] || '').trim();
      const dutyValue = String(dutyRow[col] || '').trim().toUpperCase();
      const absenceMap = { 'U': 'urlaub', 'F': 'fza', 'FZA': 'fza', 'WB': 'weiterbildung', 'K': 'sonstige', 'KK': 'sonstige', 'ZU': 'sonstige', '§15C': 'sonstige', 'DR': 'sonstige' };
      if (workplaceValue) {
        const key = workplaceValue.toUpperCase();
        if (absenceMap[key]) setAbsence(monthData, staffId, iso, absenceMap[key]);
      }
      if (dutyValue === 'D') setAssignment(monthData, iso, 'bd', staffId);
      else if (dutyValue === 'HG') setAssignment(monthData, iso, 'hg', staffId);
    });
  }
  log.push('Monat ergänzt');
  return { year, month, monthData, log };
}

function mergeMonthData(target, source) {
  for (const [iso, day] of Object.entries(source.days || {})) {
    target.days[iso] ||= { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
    if (!target.days[iso].bd && day.bd) target.days[iso].bd = day.bd;
    if (!target.days[iso].hg && day.hg) target.days[iso].hg = day.hg;
  }
  for (const [staffId, absMap] of Object.entries(source.absences || {})) {
    for (const [iso, type] of Object.entries(absMap)) setAbsence(target, staffId, iso, type);
  }
  for (const [staffId, prefMap] of Object.entries(source.preferences || {})) {
    for (const [iso, type] of Object.entries(prefMap)) setPreference(target, staffId, iso, type);
  }
}

function exportCurrentMonthToExcel() {
  if (!window.XLSX) { alert('Excel-Bibliothek noch nicht geladen.'); return; }
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const rows = [];
  rows.push(['Bereitschaftsdienstplan', '', getMonthLabel()]);
  rows.push(['Tag', 'Wochentag', 'BD', 'HG', '1. RBN', '2. RBN']);
  Object.entries(monthData.days).forEach(([iso, day]) => {
    rows.push([fmtGermanDate(iso).slice(0,5), weekdayLabel(iso), getStaffById(state.staff, day.bd)?.name || '', getStaffById(state.staff, day.hg)?.name || '', day.rbn1 || '', day.rbn2 || '']);
  });
  rows.push([]);
  rows.push(['Statistik']);
  buildStats(state, monthData).forEach(stat => rows.push([stat.name, `BD ${stat.bd}`, `HG ${stat.hg}`, `WE ${stat.weekendEq}`, `Ziel ${stat.bdTarget ?? ''}`]));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:10},{wch:12},{wch:28},{wch:28},{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, `${state.currentYear}-${String(state.currentMonth).padStart(2,'0')}`);
  XLSX.writeFile(wb, `dienstplan_${state.currentYear}_${String(state.currentMonth).padStart(2,'0')}.xlsx`);
}

async function exportJsonBackup() {
  const payload = await api.exportJson().catch(() => ({ settings: state.settings, staff: state.staff, rbnNames: state.rbnNames, months: Array.from(state.months.entries()) }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `dienstplanrad_backup_${new Date().toISOString().slice(0,10)}.json`);
}

async function onJsonImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  if (payload.settings) state.settings = payload.settings;
  if (payload.staff) state.staff = payload.staff;
  if (payload.rbnNames) state.rbnNames = payload.rbnNames;
  if (Array.isArray(payload.months)) payload.months.forEach(([key, value]) => state.months.set(key, value));
  saveLocalBootstrap();
  try { await api.importJson(payload); } catch {}
  render();
  event.target.value = '';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
