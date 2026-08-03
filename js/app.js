import { ABSENCE_TYPES, MONTH_NAMES, OPTION_TYPES, PREFERENCE_TYPES, SHEET_NAMES, createEmptyMonth, normalizeBackupPayload, toIsoDate } from './defaults.js?v=20260803.3';
import { state, bootstrapState, buildBackupPayload, flushLocalMonthWrites, getMonthData, getMonthLabel, isMonthDirty, isMonthMergeSafe, loadMonth, markBootstrapDirty, markBootstrapSynced, markMonthDirty, markMonthSynced, persistDirtyState, persistMonth, scheduleSave, setMonthData, warmAdjacentMonths } from './state.js?v=20260803.3';
import { api } from './api.js?v=20260803.3';
import { applyMonthTheme, prefersReducedMotion, resolveThemeYear } from './theme.js?v=20260803.3';
import { applySpectrumProfile } from './color-director.js?v=20260803.3';
import { holidayName as getSaxonyHolidayName, isFirstRegularWorkdayAfter, parseIsoDate as parseIsoLocal, toIsoDay as toIsoLocal } from './holidays.js?v=20260803.3';
import { assignmentLabel, buildStats, clearedMonthData, collectIssues, evaluateCandidate, fmtGermanDate, getAbsence, getAbsenceSource, getAssignment, getEffectiveAbsence, getPlanningStaff, getOptions, getRoleProperties, getPreference, getStaffById, isExternalAssignment, labelForAbsence, labelForOption, labelForPreference, monthContentSummary, setAbsence, setAssignment, setOptions, setPreference, toggleOption, weekdayLabel } from './rules.js?v=20260803.3';
import { getRbnOptions, isRbnValueAllowed, isSecondRbnAvailable, rbnDisplayName } from './rbn.js?v=20260803.3';
import { additionalReasons, buildPickerModel, filterPickerModel, flattenPickerModel, loadSummary, nextSelectableIndex, primaryReason } from './picker-view.js?v=20260803.3';
import { analyzeWorkbook } from './excel-import.js?v=20260803.3';
import { applyApplicationSettings } from './app-settings.js?v=20260803.3';

const $ = selector => document.querySelector(selector);

/**
 * Text für die Einbettung in innerHTML entschärfen. Personalnamen und
 * Funktionsbezeichnungen stammen aus dem KV-Store und sind damit von außen
 * pflegbar; ein Name mit spitzer Klammer hätte das Markup zerlegt.
 */
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const isPlainRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const els = {};
let pendingConflict = null;
let monthRequestId = 0;
let requestedYear = null;
let requestedMonth = null;
const MIN_YEAR = 2000;
const MAX_YEAR = 2200;



let contentTransitionTimer = null;

/**
 * Richtungsabhängige Ein-/Ausblende-Animation der Planinhalte beim Monatswechsel.
 */
function animateMonthContent(direction) {
  const wrap = document.getElementById('printArea');
  const stats = document.getElementById('statsGrid');
  const title = document.getElementById('monthTitle');
  const targets = [wrap, stats, title].filter(Boolean);
  if (!targets.length || prefersReducedMotion()) return;
  const className = direction < 0 ? 'month-enter-prev' : 'month-enter-next';
  clearTimeout(contentTransitionTimer);
  targets.forEach(el => {
    el.classList.remove('month-enter-prev', 'month-enter-next');
    void el.offsetWidth;
    el.classList.add(className);
  });
  // Sättigungspuls über die farbtragenden Flächen: verbindet Farb- und
  // Inhaltswechsel zu einer einzigen wahrgenommenen Bewegung.
  document.body?.classList.add('month-content-transition');
  contentTransitionTimer = setTimeout(() => {
    targets.forEach(el => el.classList.remove('month-enter-prev', 'month-enter-next'));
    document.body?.classList.remove('month-content-transition');
  }, 700);
}

function nextAnimationFrame() {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function monthOrdinal(year, month) {
  return year * 12 + (month - 1);
}

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', () => {
  // Die gebündelte lokale Sicherung muss vor dem Verlassen der Seite auf die
  // Platte, sonst ginge die jüngste Änderung ohne Serververbindung verloren.
  flushLocalMonthWrites();
  if (state.dirty) persistDirtyState();
});

/**
 * Auslieferungsstempel aus dem Kopf der Seite in den DOM und die Konsole
 * heben. `document.documentElement.dataset.build` beantwortet damit in den
 * Entwicklerwerkzeugen sofort die Frage, welcher Stand gerade läuft.
 */
function markBuild() {
  const build = document.querySelector('meta[name="dienstplanrad-build"]')?.content;
  if (!build) return;
  document.documentElement.dataset.build = build;
  const status = document.getElementById('saveStatus')?.closest('.status-wrap');
  if (status) status.title = `DienstplanRAD · Stand ${build}`;
}

async function init() {
  markBuild();
  cacheElements();
  bindEvents();
  buildStaticSelectors();
  setStatus('loading', 'Lädt …');

  // Die Inline-Bereinigung im <head> kann zu dem Ergebnis kommen, dass dieses
  // Dokument noch von einem historischen Worker ausgeliefert wurde und ein
  // einmaliger Neustart fällig ist. Dann hier abbrechen, bevor die erste
  // Anfrage rausgeht: Ein Neustart mitten in laufenden Abrufen war genau das,
  // was die Seite in einem früheren Versuch dauerhaft bei "Lädt …" hängen ließ.
  if (await legacyNeustartAngekuendigt()) return;
  releaseLegacyServiceWorker();
  await bootstrapState();
  applyApplicationSettings(state.settings);
  applyMonthTheme(state.currentMonth, { animate: false });
  populateSelectors();
  await openCurrentMonth(state.currentYear, state.currentMonth, true);
}

function cacheElements() {
  ['monthSelect','yearSelect','prevMonthBtn','nextMonthBtn','saveStatus','statusDot','planTableBody','statsGrid','monthTitle','pickerDialog','pickerList','pickerTitle','pickerEyebrow','pickerSubtitle','pickerSearch','pickerCurrent','pickerDetail','clearAssignmentBtn','dayMetaDialog','dayMetaTitle','dayMetaList','batchDialog','batchTitle','batchEyebrow','batchSubtitle','batchStaffSelect','batchTypeSelect','batchDayGrid','batchApplyBtn','batchClearSelectionBtn','conflictDialog','conflictDialogText','conflictReasons','conflictComment','confirmConflictBtn'].forEach(id => els[id] = document.getElementById(id));
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
  $('#clearMonthBtn').addEventListener('click', onClearMonth);
  $('#absenceManagerBtn').addEventListener('click', () => openBatchDialog('absence'));
  $('#preferenceManagerBtn').addEventListener('click', () => openBatchDialog('preference'));
  $('#clearAssignmentBtn').addEventListener('click', onClearAssignment);
  $('#batchApplyBtn').addEventListener('click', onApplyBatch);
  $('#batchClearSelectionBtn').addEventListener('click', () => {
    document.querySelectorAll('.batch-day.selected').forEach(el => el.classList.remove('selected'));
  });
  $('#confirmConflictBtn').addEventListener('click', onConfirmConflict);
  // Ein abgebrochener Konflikt darf nicht als offene Absicht zurückbleiben.
  $('#conflictDialog').addEventListener('close', () => { pendingConflict = null; });
  $('#pickerSearch').addEventListener('input', renderPickerList);
  $('#pickerSearch').addEventListener('keydown', onPickerSearchKeydown);
  $('#excelImportInput').addEventListener('change', onExcelImport);
  $('#exportExcelBtn').addEventListener('click', exportCurrentMonthToExcel);
  // Safari kennt kein `beforeprint`; deshalb wird beim Export zusätzlich
  // ausdrücklich vorbereitet und nach der Rückkehr aus dem Dialog aufgeräumt.
  $('#exportPdfBtn').addEventListener('click', () => {
    prepareForPrint();
    window.print();
    restoreAfterPrint();
  });
  window.addEventListener('beforeprint', prepareForPrint);
  window.addEventListener('afterprint', restoreAfterPrint);
  $('#exportJsonBtn').addEventListener('click', exportJsonBackup);
  $('#jsonImportInput').addEventListener('change', onJsonImport);
}

/**
 * Der Dateiname des PDF-Exports stammt in allen gängigen Browsern aus dem
 * Dokumenttitel. Er wird deshalb für die Dauer des Drucks auf
 * „Dienstplan JJJJ-MM“ gesetzt und danach zurückgenommen.
 */
let titleBeforePrint = null;

function printDocumentTitle() {
  return `Dienstplan ${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}`;
}

function prepareForPrint() {
  // Der Monatsfarbwechsel läuft als rAF-Interpolation. Wird währenddessen
  // gedruckt, friert die Ausgabe einen Zwischenstand ein und die Flächen passen
  // nicht mehr zum Monatskontrast-Abzeichen.
  //
  // Abgeschlossen wird deshalb der Verlauf des Seasonal Spectrum Directors –
  // er besitzt die sichtbare Farbe. Das Basistheme wird nur noch als
  // Rückfallebene angestoßen und schreibt die Farbvariablen nicht mehr, solange
  // der Director geladen ist.
  applyMonthTheme(state.currentMonth, { animate: false });
  applySpectrumProfile(resolveThemeYear(state.currentYear), state.currentMonth, { animate: false });
  if (titleBeforePrint === null) titleBeforePrint = document.title;
  document.title = printDocumentTitle();
}

function restoreAfterPrint() {
  if (titleBeforePrint === null) return;
  document.title = titleBeforePrint;
  titleBeforePrint = null;
}

function ensureYearOption(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return false;
  const select = $('#yearSelect');
  if ([...select.options].some(option => Number(option.value) === year)) return true;
  const option = new Option(String(year), String(year));
  const before = [...select.options].find(existing => Number(existing.value) > year);
  if (before) select.insertBefore(option, before);
  else select.append(option);
  return true;
}

function buildStaticSelectors() {
  for (let i = 1; i <= 12; i++) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = MONTH_NAMES[i - 1];
    $('#monthSelect').append(option);
  }
  const currentYear = new Date().getFullYear();
  const firstYear = Math.max(MIN_YEAR, Math.min(2025, currentYear - 5));
  const lastYear = Math.min(MAX_YEAR, Math.max(2030, currentYear + 5));
  for (let year = firstYear; year <= lastYear; year++) ensureYearOption(year);
}

function populateSelectors() {
  ensureYearOption(state.currentYear);
  $('#monthSelect').value = String(state.currentMonth);
  $('#yearSelect').value = String(state.currentYear);
}

async function openCurrentMonth(year, month, forceServer = false) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR || !Number.isInteger(month) || month < 1 || month > 12) {
    setStatus('error', 'Ungültiger Monat');
    return;
  }
  ensureYearOption(year);

  const requestId = ++monthRequestId;
  const previousYear = requestedYear ?? state.currentYear;
  const previousMonth = requestedMonth ?? state.currentMonth;
  const targetChanged = month !== previousMonth || year !== previousYear;
  requestedYear = year;
  requestedMonth = month;
  const direction = Math.sign(monthOrdinal(year, month) - monthOrdinal(previousYear, previousMonth)) || 1;

  // Sämtliche tatsächlich ungespeicherten Monate sichern. Ein globales Dirty-
  // Flag darf niemals dazu führen, dass der bloß sichtbare Zwischenmonat als
  // leerer Stand gespeichert wird.
  let pendingSave = null;
  if (state.dirty) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    pendingSave = persistDirtyState();
  }

  state.currentYear = year;
  state.currentMonth = month;
  populateSelectors();
  if (targetChanged) applyMonthTheme(month);
  render();
  if (targetChanged) animateMonthContent(direction);

  if (pendingSave) await pendingSave;
  if (requestId !== monthRequestId) return;

  setStatus('loading', forceServer ? 'Lädt Serverstand …' : 'Lädt …');
  await loadMonth(year, month, { forceServer });
  if (requestId !== monthRequestId) return;
  await warmAdjacentMonths(year, month);
  if (requestId !== monthRequestId) return;

  if (state.dirty || isMonthDirty(year, month)) setStatus('offline', 'Lokale Änderungen noch nicht synchronisiert');
  else setStatus(state.serverReady ? 'saved' : 'offline', state.serverReady ? 'Gespeichert' : 'Offline – lokaler Stand');
  render();
}

/**
 * Den angezeigten Monat vollständig leeren: Dienste, RBN, Abwesenheiten,
 * Dienstwünsche und Optionen. Override- und Importprotokoll bleiben als
 * Nachweis erhalten, ebenso Revision und Zeitstempel für die Serversynchronität.
 */
async function onClearMonth() {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const label = getMonthLabel();
  const { filledDays, markedStaff, empty } = monthContentSummary(monthData);
  if (empty) {
    alert(`${label} enthält bereits keine Einträge.`);
    return;
  }
  if (!confirm(`${label} vollständig leeren?\n\nEntfernt werden ${filledDays} belegte Tage sowie sämtliche Abwesenheiten, Dienstwünsche und Optionen von ${markedStaff} Personen. Andere Monate bleiben unberührt. Das Override- und Importprotokoll bleibt erhalten.\n\nDieser Schritt lässt sich nur über eine JSON-Sicherung rückgängig machen.`)) return;

  const cleared = clearedMonthData(monthData, state.currentYear, state.currentMonth);
  setMonthData(state.currentYear, state.currentMonth, cleared, 'local');
  markMonthDirty(state.currentYear, state.currentMonth);
  render();

  const result = await persistMonth(state.currentYear, state.currentMonth);
  if (result.ok) setStatus(state.dirty ? 'saving' : 'saved', state.dirty ? 'Weitere Änderungen ausstehend …' : `${label} geleert und gespeichert`);
  else setStatus('offline', `${label} nur lokal geleert – Serverfehler`);
  render();
}

/**
 * Bewertungen eines Renderlaufs.
 *
 * Tabelle und Sammelprüfung bewerten dieselben belegten Zellen. Gemessen kostete
 * das doppelte Durchlaufen des Regelwerks rund 13 ms je Monat – genug, um beim
 * Monatswechsel einen sichtbaren Ruckler zu erzeugen.
 */
let evaluationCache = new Map();

function evaluateCached(parameters) {
  const key = `${parameters.dateIso}|${parameters.role}|${parameters.staffId}`;
  if (!evaluationCache.has(key)) evaluationCache.set(key, evaluateCandidate(parameters));
  return evaluationCache.get(key);
}

let issueRenderHandle = null;
let renderGeneration = 0;

/**
 * Zeichnet den Monat.
 *
 * Tabelle, Titel und Statistik entstehen sofort – sie tragen die Bewegung des
 * Monatswechsels. Die Sammelprüfung ist die teuerste Einzelarbeit (rund 18 ms)
 * und für den ersten sichtbaren Frame ohne Belang; sie läuft deshalb erst,
 * wenn der Hauptthread wieder frei ist.
 */
function render() {
  // Sicherheitsnetz: Palette bleibt garantiert mit dem gerenderten Monat synchron.
  applyMonthTheme(state.currentMonth);
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  evaluationCache = new Map();
  const generation = ++renderGeneration;
  $('#monthTitle').textContent = getMonthLabel();
  renderPlanTable(monthData);
  renderStats(monthData);
  scheduleIssueRender(monthData, generation);
}

function scheduleIssueRender(monthData, generation) {
  if (issueRenderHandle !== null) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(issueRenderHandle);
    else clearTimeout(issueRenderHandle);
  }
  const run = () => {
    issueRenderHandle = null;
    if (generation !== renderGeneration) return;
    renderIssues(monthData);
  };
  issueRenderHandle = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 400 })
    : setTimeout(run, 0);
}

/**
 * Baut die Tabelle in einem Fragment und hängt sie in einem Zug ein.
 *
 * Einzeln eingehängte Zeilen lassen den Browser den Tabellenfluss 31-mal neu
 * bestimmen – mitten in der Wechselanimation. Ein Fragment kostet genau eine
 * Einfügung.
 */
function renderPlanTable(monthData) {
  const tbody = $('#planTableBody');
  const fragment = document.createDocumentFragment();
  let rowIndex = 0;
  for (const [iso, day] of Object.entries(monthData.days)) {
    const tr = document.createElement('tr');
    tr.style.setProperty('--row-index', String(rowIndex));
    const weekday = weekdayLabel(iso);
    const holidayName = getSaxonyHolidayName(iso);
    if (weekday === 'Sa') tr.classList.add('saturday-row');
    if (weekday === 'So') tr.classList.add('sunday-row');
    if (holidayName) {
      tr.classList.add('holiday-row');
      tr.dataset.holiday = holidayName;
      tr.title = holidayName;
    }
    const weekdayMarkup = holidayName
      ? `<span class="weekday-name">${weekdayLabelLong(weekday)}</span><span class="holiday-name">${esc(holidayName)}</span>`
      : `<span class="weekday-name">${weekdayLabelLong(weekday)}</span>`;
    tr.innerHTML = `
      <td class="date-cell">${Number(iso.slice(-2))}</td>
      <td class="weekday-cell">${weekdayMarkup}</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td class="absence-summary-cell"></td>
      <td class="preference-summary-cell"></td>`;
    tr.children[2].appendChild(buildAssignmentButton(iso, 'bd', day.bd, monthData));
    tr.children[3].appendChild(buildAssignmentButton(iso, 'hg', day.hg, monthData));
    const firstRbn = buildRbnSelect(iso, 'rbn1', day.rbn1 || '');
    const secondRbn = buildRbnSelect(iso, 'rbn2', day.rbn2 || '');
    tr.children[4].appendChild(firstRbn.wrapper);
    tr.children[5].appendChild(secondRbn.wrapper);
    firstRbn.select.addEventListener('change', () => {
      syncSecondRbnControl(iso, firstRbn.select, secondRbn, { clearWhenUnavailable: true });
    });
    syncSecondRbnControl(iso, firstRbn.select, secondRbn);
    tr.children[6].appendChild(buildAbsenceSummary(iso, monthData));
    tr.children[7].appendChild(buildPreferenceSummary(iso, monthData));
    fragment.appendChild(tr);
    rowIndex += 1;
  }
  tbody.replaceChildren(fragment);
}

function weekdayLabelLong(shortLabel) {
  return ({ Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' })[shortLabel] || shortLabel;
}

function buildAssignmentButton(dateIso, role, staffId, monthData) {
  const button = document.createElement('button');
  button.className = 'assignment-btn';
  const person = getStaffById(state.staff, staffId);
  const external = isExternalAssignment(staffId);
  // In der Planungstabelle nur der Kurzname ohne Anrede/Titel: Die Spalten sind
  // schmal, der volle Name steht weiterhin im Tooltip und in der Statistik.
  // Namen aus Altimporten ohne bekannte Person bleiben als Text erhalten.
  const name = staffId ? assignmentLabel(state.staff, staffId, { short: true }) : '—';
  const evaluation = (staffId && person) ? evaluateCached({ state, monthData, dateIso, role, staffId }) : { level: 'green', reasons: [] };
  const badgeMarkup = staffId
    ? ''
    : '<span class="assignment-badges"><span class="small-chip">offen</span></span>';
  button.innerHTML = `
    <span class="assignment-name">${esc(name)}</span>
    ${badgeMarkup}`;
  button.title = staffId
    ? [
        assignmentLabel(state.staff, staffId),
        external ? 'Übernommener Name aus einem Import – nicht erneut auswählbar' : '',
        ...evaluation.reasons
      ].filter(Boolean).join('\n')
    : `${role.toUpperCase()} eintragen`;
  button.addEventListener('click', () => openPicker(dateIso, role));
  return button;
}

function setRbnValue(dateIso, field, value) {
  const normalized = String(value ?? '').trim();
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const day = monthData.days[dateIso];
  if (!day || day[field] === normalized) return false;
  day[field] = normalized;
  markDirty();
  return true;
}

function buildRbnSelect(dateIso, field, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rbn-field';
  const select = document.createElement('select');
  select.className = 'rbn-input';
  select.dataset.rbnField = field;
  select.setAttribute('aria-label', `${field === 'rbn1' ? 'RBN' : '2. RBN'} am ${dateIso}`);
  select.appendChild(new Option('— auswählen —', ''));

  const currentValue = String(value ?? '').trim();
  if (currentValue && !isRbnValueAllowed(field, dateIso, currentValue)) {
    // Nur der Name, ohne Zusatz: Der Ausdruck soll wie ein regulärer Eintrag
    // lesbar sein. Dass der Wert nicht mehr zum Pool gehört, zeigt die Sperre
    // der Auswahl und der Hinweis in den offenen Punkten.
    const legacyOption = new Option(rbnDisplayName(currentValue), currentValue, true, true);
    legacyOption.disabled = true;
    select.appendChild(legacyOption);
  }
  for (const name of getRbnOptions(field, dateIso)) {
    select.appendChild(new Option(rbnDisplayName(name), name, false, name === currentValue));
  }
  select.value = currentValue;
  select.title = currentValue || '';
  select.dataset.rbnEmpty = String(!select.value);
  select.addEventListener('change', () => {
    select.title = select.value || '';
    select.dataset.rbnEmpty = String(!select.value);
    setRbnValue(dateIso, field, select.value);
  });

  const inactiveNote = document.createElement('span');
  inactiveNote.className = 'rbn2-inactive-note';
  inactiveNote.hidden = true;
  wrapper.append(select, inactiveNote);
  return { wrapper, select, inactiveNote };
}

function syncSecondRbnControl(dateIso, firstSelect, secondControl, { clearWhenUnavailable = false } = {}) {
  const available = isSecondRbnAvailable(dateIso, firstSelect.value);
  if (!available && clearWhenUnavailable && secondControl.select.value) {
    secondControl.select.value = '';
    setRbnValue(dateIso, 'rbn2', '');
  }

  secondControl.select.hidden = !available;
  secondControl.select.disabled = !available;
  secondControl.wrapper.toggleAttribute('data-rbn2-available', available);

  const storedValue = String(getMonthData(state.currentYear, state.currentMonth).days[dateIso]?.rbn2 ?? '').trim();
  secondControl.inactiveNote.textContent = !available && storedValue ? rbnDisplayName(storedValue) : '';
  secondControl.inactiveNote.title = !available && storedValue ? storedValue : '';
  secondControl.inactiveNote.hidden = available || !storedValue;
}

/**
 * Erster regulärer Werktag nach einem eigenen BD bzw. nach einem Samstags-BD
 * von Dr. Becker. Beide Prüfungen teilen sich mit der Regelbewertung dieselbe
 * Implementierung aus js/holidays.js – vorher lagen hier eigene Fassungen, die
 * sich mit rules.js widersprachen.
 */
function isFirstRegularWorkdayAfterOwnBd(personId, dateIso) {
  return isFirstRegularWorkdayAfter(dateIso, iso => getAssignment(state, iso, 'bd') === personId);
}

function isBeckerFzaAfterSaturdayBd(dateIso) {
  return isFirstRegularWorkdayAfter(dateIso, iso => parseIsoLocal(iso).getDay() === 6 && getAssignment(state, iso, 'bd') === 'becker');
}

/**
 * Ein Eintrag der Tageszusammenfassung als kompakter Chip. Der frühere
 * einzeilige Fließtext lief ab etwa drei Einträgen aus der Zelle heraus und war
 * nur noch im Tooltip lesbar; die Chips brechen stattdessen um.
 */
function appendSummaryEntry(wrapper, name, detail) {
  const entry = document.createElement('span');
  entry.className = 'summary-entry';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'absence-summary-name';
  nameSpan.textContent = name;
  const detailSpan = document.createElement('span');
  detailSpan.className = 'absence-summary-detail';
  detailSpan.textContent = detail;
  entry.append(nameSpan, detailSpan);
  wrapper.appendChild(entry);
}

function buildAbsenceSummary(dateIso, monthData) {
  const wrapper = document.createElement('button');
  wrapper.type = 'button';
  wrapper.className = 'cell-summary-button';
  const entries = [];
  const details = [];

  const beckerAbsence = getAbsence(monthData, 'becker', dateIso);
  const effectiveBeckerAbsence = getEffectiveAbsence(state, monthData, 'becker', dateIso);
  const derivedBeckerFza = effectiveBeckerAbsence === 'fza' && !beckerAbsence;
  if (derivedBeckerFza) {
    entries.push({ name: 'Becker', detail: 'FZA' });
    details.push('Becker: FZA – echter dienstfreier Tag, automatisch aus Samstags-BD für den nächsten regulären Werktag abgeleitet');
  }

  for (const person of state.staff.filter(item => item.includeInAbsenceList)) {
    const absence = getAbsence(monthData, person.id, dateIso);
    if (!absence) continue;

    // Ein nicht manuell gesetzter FZA am ersten regulären Werktag nach eigenem
    // BD ist die Doppelung eines ohnehin abgeleiteten Tages.
    const absenceSource = getAbsenceSource(monthData, person.id, dateIso);
    if (absence === 'fza' && absenceSource !== 'manual' && isFirstRegularWorkdayAfterOwnBd(person.id, dateIso)) continue;

    const detail = shortAbsenceLabel(absence);
    entries.push({ name: person.short, detail });
    details.push(`${person.short}: ${detail}`);
  }

  entries.forEach(entry => appendSummaryEntry(wrapper, entry.name, entry.detail));
  wrapper.title = details.length ? details.join('\n') : 'Abwesenheiten bearbeiten';
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
    const options = getOptions(monthData, person.id, dateIso);
    const parts = [];
    if (pref) parts.push(shortPreferenceLabel(pref));
    options.forEach(option => parts.push(shortOptionLabel(option)));
    if (!parts.length) continue;
    entries.push({ name: person.short, detail: parts.join('/') });
  }
  entries.forEach(entry => appendSummaryEntry(wrapper, entry.name, entry.detail));
  wrapper.title = entries.length ? entries.map(entry => `${entry.name}: ${entry.detail}`).join('\n') : 'Dienstwünsche und Optionen bearbeiten';
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

function shortOptionLabel(type) {
  return ({ 'bd-moeglich': 'BD mögl.', 'hg-moeglich': 'HG mögl.' })[type] || labelForOption(type);
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
      <td>${esc(stat.name)}</td>
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

/**
 * Sammelprüfung des Monats als sichtbare Liste.
 *
 * `collectIssues` gab es samt Tests bereits, die Oberfläche hat das Ergebnis
 * aber nie gezeigt – die Beschreibung in der Dokumentation lief also ins Leere.
 * Die Liste beantwortet die letzte Frage des Planungsvorgangs: Was fehlt noch,
 * und wo ist etwas fachlich auffällig?
 */
function renderIssues(monthData) {
  const container = $('#issueList');
  const summary = $('#issueSummary');
  if (!container) return;

  const issues = collectIssues(state, monthData, { evaluate: evaluateCached });
  const offen = issues.filter(issue => issue.kind === 'open').length;
  const auffaellig = issues.length - offen;

  if (summary) {
    summary.textContent = issues.length === 0
      ? 'Der Monat ist vollständig besetzt und ohne Auffälligkeiten.'
      : `${offen} offene Einteilung${offen === 1 ? '' : 'en'} · ${auffaellig} Auffälligkeit${auffaellig === 1 ? '' : 'en'}`;
  }

  if (issues.length === 0) {
    container.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'issue-empty',
      textContent: 'Nichts zu tun – alle Tage sind besetzt, keine Regel meldet sich.'
    }));
    return;
  }

  // Rote und orange Punkte zuerst, danach die offenen Stellen. Lange Listen
  // offener Tage würden die fachlich wichtigen Meldungen sonst verdecken.
  const relevant = issues.filter(issue => issue.level !== 'yellow');
  const list = document.createElement('ul');
  list.className = 'issue-items';
  for (const issue of [...relevant, ...issues.filter(issue => issue.level === 'yellow')].slice(0, 40)) {
    const item = document.createElement('li');
    item.className = `issue-item ${issue.level}`;
    item.innerHTML = `<span class="small-chip ${issue.level}">${labelByLevel(issue.level)}</span>
      <span class="issue-text"><strong>${esc(issue.title)}</strong><span>${esc(issue.details)}</span></span>`;
    list.appendChild(item);
  }
  const rest = issues.length - Math.min(issues.length, 40);
  container.replaceChildren(list);
  if (rest > 0) {
    container.appendChild(Object.assign(document.createElement('p'), {
      className: 'issue-empty',
      textContent: `… und ${rest} weitere.`
    }));
  }
}

const ROLE_LABELS = { bd: 'Bereitschaftsdienst', hg: 'Hintergrunddienst' };

/**
 * Zustand der geöffneten Auswahl.
 *
 * `entries` ist die aktuell sichtbare, bereits gefilterte Reihenfolge. Die
 * Tastatursteuerung arbeitet ausschließlich auf diesem Array, damit sichtbare
 * Reihenfolge und Tastaturweg nie auseinanderlaufen.
 */
const picker = { candidates: [], model: [], entries: [], activeId: null };

function optionId(staffId) {
  return `picker-option-${staffId}`;
}

/**
 * Funktionsbezeichnung einer Person an einem bestimmten Tag.
 *
 * Der Stammwert bliebe nach einer Beförderung dauerhaft auf dem alten Stand
 * stehen – Hr. El Houba stünde ab dem 22.09.2026 weiterhin als AA in Picker
 * und Markierungsliste, obwohl er dort längst als Facharzt geführt wird.
 */
function roleLabelOn(person, dateIso) {
  return (dateIso ? getRoleProperties(person, dateIso).roleLabel : person.roleLabel) || '';
}

function pickerCandidates(dateIso, role) {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  return getPlanningStaff(state.staff, dateIso).map(person => ({
    person,
    role,
    dateIso,
    evaluation: evaluateCandidate({ state, monthData, dateIso, role, staffId: person.id })
  }));
}

function renderPickerDetail(candidate) {
  const detail = $('#pickerDetail');
  if (!candidate) {
    detail.textContent = '';
    detail.hidden = true;
    return;
  }
  const reasons = candidate.evaluation.reasons || [];
  detail.hidden = reasons.length === 0;
  detail.innerHTML = reasons.length
    ? `<span class="picker-detail-name">${esc(candidate.person.name)}</span>${reasons
        .map(reason => `<span class="picker-detail-reason">${esc(reason)}</span>`).join('')}`
    : '';
}

function setActiveCandidate(staffId, { scroll = true } = {}) {
  const candidate = picker.entries.find(entry => entry.person.id === staffId) || null;
  picker.activeId = candidate ? staffId : null;
  const list = $('#pickerList');
  list.querySelectorAll('.picker-item').forEach(item => {
    const active = item.dataset.staffId === picker.activeId;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
    if (active && scroll) item.scrollIntoView({ block: 'nearest' });
  });
  $('#pickerSearch').setAttribute('aria-activedescendant', picker.activeId ? optionId(picker.activeId) : '');
  renderPickerDetail(candidate);
}

function moveActiveCandidate(delta) {
  const currentIndex = picker.entries.findIndex(entry => entry.person.id === picker.activeId);
  const nextIndex = nextSelectableIndex(picker.entries, currentIndex, delta);
  if (nextIndex >= 0) setActiveCandidate(picker.entries[nextIndex].person.id);
}

function pickerItemMarkup(candidate) {
  const { person, evaluation } = candidate;
  const load = loadSummary(candidate);
  const lead = primaryReason(candidate);
  const rest = additionalReasons(candidate);
  const restChip = rest.length ? `<span class="reason-more">+${rest.length}</span>` : '';
  const assigned = candidate.isAssigned ? '<span class="picker-assigned" title="Aktuell eingeteilt">aktuell</span>' : '';
  return `<span class="picker-identity">
      <span class="picker-name">${esc(person.name)}</span>
      ${roleLabelOn(person, candidate.dateIso) ? `<span class="picker-function">${esc(roleLabelOn(person, candidate.dateIso))}</span>` : ''}
      ${assigned}
    </span>
    <span class="picker-load${load.exceeded ? ' is-exceeded' : ''}" title="${esc(load.title)}">
      <span class="picker-load-role">${load.role.toUpperCase()}</span>${esc(load.text)}
    </span>
    <span class="reasons"><span class="reason-lead">${esc(lead)}</span>${restChip}</span>
    <span class="small-chip ${evaluation.level}">${labelByLevel(evaluation.level)}</span>`;
}

function renderPickerList() {
  const list = $('#pickerList');
  const query = $('#pickerSearch').value;
  const filtered = filterPickerModel(picker.model, query);
  picker.entries = flattenPickerModel(filtered);
  list.replaceChildren();

  if (!picker.entries.length) {
    list.append(Object.assign(document.createElement('p'), {
      className: 'picker-empty',
      textContent: 'Keine Person passt zu dieser Eingabe.'
    }));
    setActiveCandidate(null);
    return;
  }

  for (const group of filtered) {
    const section = document.createElement('div');
    section.className = `picker-group picker-group--${group.id}`;
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', group.label);
    const heading = document.createElement('p');
    heading.className = 'picker-group-label';
    heading.innerHTML = `<span>${esc(group.label)}</span><span class="picker-group-count">${group.entries.length}</span>`;
    heading.title = group.hint;
    section.append(heading);

    for (const candidate of group.entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = optionId(candidate.person.id);
      button.dataset.staffId = candidate.person.id;
      button.className = `picker-item ${candidate.evaluation.level}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.title = candidate.evaluation.reasons.join('\n');
      button.innerHTML = pickerItemMarkup(candidate);
      if (candidate.evaluation.canSelect === false) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.addEventListener('click', () => onPickStaff(candidate.person.id, candidate.evaluation));
      }
      button.addEventListener('pointerenter', () => setActiveCandidate(candidate.person.id, { scroll: false }));
      button.addEventListener('focus', () => setActiveCandidate(candidate.person.id, { scroll: false }));
      section.append(button);
    }
    list.append(section);
  }

  const stillVisible = picker.entries.some(entry => entry.person.id === picker.activeId
    && entry.evaluation.canSelect !== false);
  if (stillVisible) setActiveCandidate(picker.activeId, { scroll: false });
  else moveActiveCandidate(1);
}

function onPickerSearchKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveActiveCandidate(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const candidate = picker.entries.find(entry => entry.person.id === picker.activeId);
    if (candidate && candidate.evaluation.canSelect !== false) onPickStaff(candidate.person.id, candidate.evaluation);
  }
}

function openPicker(dateIso, role) {
  state.currentPicker = { dateIso, role };
  const assignedId = getAssignment(state, dateIso, role);
  // assignmentLabel deckt auch übernommene Namen aus Altimporten und nicht mehr
  // bekannte IDs ab; `getStaffById(...)?.name` lieferte dort undefined und der
  // Kopf meldete „Noch nicht besetzt“, obwohl der Tag belegt war.
  const assignedName = assignedId ? assignmentLabel(state.staff, assignedId) : '';

  picker.candidates = pickerCandidates(dateIso, role)
    .map(candidate => ({ ...candidate, isAssigned: candidate.person.id === assignedId }));
  picker.model = buildPickerModel(picker.candidates);
  picker.activeId = null;

  $('#pickerEyebrow').textContent = ROLE_LABELS[role] || role.toUpperCase();
  $('#pickerTitle').textContent = `${weekdayLabel(dateIso)}, ${fmtGermanDate(dateIso)}`;
  $('#pickerCurrent').innerHTML = assignedName
    ? `Aktuell eingeteilt: <strong>${esc(assignedName)}</strong>`
    : 'Noch nicht besetzt';
  $('#pickerCurrent').classList.toggle('is-open', !assignedName);
  const note = $('#pickerSubtitle');
  note.textContent = 'Rote Konflikte erfordern eine ausdrückliche Bestätigung.';
  note.title = 'Harte und strukturelle Regeln greifen sofort; relative Ausgleichshinweise erst nach der ersten Verteilungsrunde.';
  $('#clearAssignmentBtn').hidden = !assignedId;
  const search = $('#pickerSearch');
  search.value = '';

  // renderPickerList wählt bereits die erste wählbare Person vor: Enter genügt
  // damit für die häufigste Entscheidung, ohne dass etwas ungewollt entsteht.
  renderPickerList();
  $('#pickerDialog').showModal();
  search.focus();
}

async function onPickStaff(staffId, evaluation) {
  const { dateIso, role } = state.currentPicker;
  if (evaluation.level === 'red') {
    pendingConflict = { staffId, evaluation, dateIso, role };
    $('#conflictDialogText').textContent = `${assignmentLabel(state.staff, staffId) || staffId} wird für ${role.toUpperCase()} am ${fmtGermanDate(dateIso)} mit rotem Konflikt eingetragen.`;
    $('#conflictReasons').innerHTML = evaluation.reasons.map(reason => `<div class="small-chip red">${esc(reason)}</div>`).join('');
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
    row.innerHTML = `<div class="row-title"><strong>${esc(person.name)}</strong><span class="small-chip">${esc(roleLabelOn(person, dateIso))}</span></div>`;
    const absGroup = document.createElement('div');
    absGroup.className = 'meta-group';
    ABSENCE_TYPES.forEach(type => absGroup.appendChild(buildMetaChip({ kind:'absence', dateIso, staffId: person.id, typeId: type.id, active: absence === type.id, label: type.label })));
    absGroup.appendChild(buildMetaChip({ kind:'absence', dateIso, staffId: person.id, typeId: '', active: !absence, label: 'keine' }));
    const prefGroup = document.createElement('div');
    prefGroup.className = 'meta-group';
    PREFERENCE_TYPES.forEach(type => prefGroup.appendChild(buildMetaChip({ kind:'preference', dateIso, staffId: person.id, typeId: type.id, active: pref === type.id, label: type.label })));
    prefGroup.appendChild(buildMetaChip({ kind:'preference', dateIso, staffId: person.id, typeId: '', active: !pref, label: 'kein Wunsch' }));
    const optionGroup = document.createElement('div');
    optionGroup.className = 'meta-group';
    const options = getOptions(monthData, person.id, dateIso);
    OPTION_TYPES.forEach(type => optionGroup.appendChild(buildMetaChip({ kind:'option', dateIso, staffId: person.id, typeId: type.id, active: options.includes(type.id), label: type.label })));
    row.appendChild(labelWrap('Abwesenheit', absGroup));
    row.appendChild(labelWrap('Dienstwunsch', prefGroup));
    row.appendChild(labelWrap('Optionen', optionGroup));
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
    else if (kind === 'option') toggleOption(monthData, staffId, dateIso, typeId);
    else setPreference(monthData, staffId, dateIso, typeId);
    markDirty();
    openDayMetaDialog(dateIso);
    render();
  });
  return chip;
}

function openBatchDialog(mode) {
  state.currentBatchMode = mode;
  $('#batchEyebrow').textContent = mode === 'absence' ? 'Komforteingabe Abwesenheiten' : 'Komforteingabe Dienstwünsche & Optionen';
  $('#batchTitle').textContent = mode === 'absence' ? 'Abwesenheiten komfortabel setzen' : 'Dienstwünsche und Optionen komfortabel setzen';
  $('#batchSubtitle').textContent = 'Beliebige einzelne Tage auswählen, Typ festlegen, gesammelt übernehmen.';
  $('#batchStaffSelect').innerHTML = '';
  state.staff.filter(item => item.includeInAbsenceList).forEach(person => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name;
    $('#batchStaffSelect').appendChild(option);
  });
  $('#batchTypeSelect').innerHTML = '';
  const source = mode === 'absence' ? ABSENCE_TYPES : [...PREFERENCE_TYPES, ...OPTION_TYPES];
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
    const holidayName = getSaxonyHolidayName(iso);
    button.className = 'batch-day';
    if (date.getDay() === 6) button.classList.add('saturday');
    if (date.getDay() === 0) button.classList.add('sunday');
    if (holidayName) button.classList.add('holiday');
    const isOptionType = OPTION_TYPES.some(type => type.id === currentType);
    const current = state.currentBatchMode === 'absence'
      ? getAbsence(monthData, staffId, iso)
      : (isOptionType ? '' : getPreference(monthData, staffId, iso));
    const optionsForDay = state.currentBatchMode === 'absence' ? [] : getOptions(monthData, staffId, iso);
    if (isOptionType ? optionsForDay.includes(currentType) : current === currentType) button.classList.add('selected');
    button.dataset.dateIso = iso;
    button.title = holidayName || '';
    button.innerHTML = `<strong>${String(date.getDate()).padStart(2,'0')}</strong><small>${weekdayLabel(iso)}</small>${holidayName ? `<small class="batch-holiday-name">${esc(holidayName)}</small>` : ''}<small>${batchDayLabel(current, optionsForDay)}</small>`;
    button.addEventListener('click', () => button.classList.toggle('selected'));
    $('#batchDayGrid').appendChild(button);
  });
  $('#batchStaffSelect').onchange = buildBatchGrid;
  $('#batchTypeSelect').onchange = buildBatchGrid;
}

function batchDayLabel(current, optionsForDay) {
  const parts = [];
  if (current) parts.push(state.currentBatchMode === 'absence' ? labelForAbsence(current) : labelForPreference(current));
  (optionsForDay || []).forEach(option => parts.push(labelForOption(option)));
  return parts.length ? esc(parts.join(' / ')) : '—';
}

/**
 * Die Auswahl im Raster ist die vollständige Aussage für den gewählten Typ.
 *
 * Das Raster markiert beim Öffnen bereits alle Tage, die den Typ schon tragen.
 * Wurde nur ergänzt, blieb ein abgewählter Tag unverändert – ein bereits
 * gesetzter Urlaub ließ sich in der Sammeleingabe also nie wieder entfernen.
 * Jetzt gilt: markiert = gesetzt, nicht markiert = für diesen Typ entfernt.
 * Andere Typen desselben Tages bleiben dabei unberührt.
 */
function onApplyBatch() {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const staffId = $('#batchStaffSelect').value;
  const typeId = $('#batchTypeSelect').value;
  if (!staffId || !typeId) { $('#batchDialog').close(); return; }
  const isOptionType = OPTION_TYPES.some(type => type.id === typeId);
  const selected = new Set([...document.querySelectorAll('.batch-day.selected')].map(el => el.dataset.dateIso));

  for (const iso of Object.keys(monthData.days)) {
    const isSelected = selected.has(iso);
    if (state.currentBatchMode === 'absence') {
      if (isSelected) setAbsence(monthData, staffId, iso, typeId);
      else if (getAbsence(monthData, staffId, iso) === typeId) setAbsence(monthData, staffId, iso, '');
    } else if (isOptionType) {
      const options = getOptions(monthData, staffId, iso);
      if (isSelected) setOptions(monthData, staffId, iso, [...new Set([...options, typeId])]);
      else if (options.includes(typeId)) setOptions(monthData, staffId, iso, options.filter(option => option !== typeId));
    } else {
      if (isSelected) setPreference(monthData, staffId, iso, typeId);
      else if (getPreference(monthData, staffId, iso) === typeId) setPreference(monthData, staffId, iso, '');
    }
  }

  markDirty();
  render();
  $('#batchDialog').close();
}

function shiftMonth(delta) {
  const selectedYear = Number($('#yearSelect').value) || state.currentYear;
  const selectedMonth = Number($('#monthSelect').value) || state.currentMonth;
  const next = new Date(selectedYear, selectedMonth - 1 + delta, 1);
  const nextYear = next.getFullYear();
  if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) {
    setStatus('error', `Unterstützter Zeitraum: ${MIN_YEAR}–${MAX_YEAR}`);
    return;
  }
  ensureYearOption(nextYear);
  $('#yearSelect').value = String(nextYear);
  $('#monthSelect').value = String(next.getMonth() + 1);
  openCurrentMonth(nextYear, next.getMonth() + 1);
}

function markDirty() {
  const year = state.currentYear;
  const month = state.currentMonth;
  setMonthData(year, month, getMonthData(year, month));
  scheduleSave(async () => {
    setStatus('saving', 'Speichert …');
    const result = await persistMonth(year, month);
    if (!result.ok) setStatus('offline', 'Offline – lokal gesichert');
    else if (state.dirty) setStatus('saving', 'Weitere Änderungen ausstehend …');
    else setStatus('saved', 'Gespeichert');
  }, year, month);
}

function setStatus(mode, text) {
  const colorMap = { loading: 'var(--yellow)', saving: 'var(--yellow)', saved: 'var(--green)', offline: 'var(--orange)', error: 'var(--red)' };
  $('#saveStatus').textContent = text;
  $('#statusDot').style.background = colorMap[mode] || 'var(--yellow)';
}

function labelByLevel(level) {
  // "rot" war als Beschriftung die Farbe selbst und passte nicht zur Legende.
  return ({ green: 'geeignet', yellow: 'Hinweis', orange: 'Konflikt', red: 'Bestätigung', gray: 'inaktiv' })[level] || level;
}

/**
 * Meldet einen früher installierten Service Worker ab und räumt seine Caches weg.
 *
 * Die Anwendung hatte einen Service Worker, der eigenen Code Cache-First
 * auslieferte. Clients, die ihn einmal installiert hatten, bekamen dadurch
 * dauerhaft alte Fassungen von styles.css und den JS-Modulen – ausgerollte
 * Korrekturen erreichten sie nicht mehr. Der Worker ist entfernt; das bloße
 * Löschen der Datei genügt aber nicht: Eine bestehende Registrierung bleibt im
 * Browser aktiv und bedient weiter aus ihrem Cache. Deshalb wird hier aktiv
 * abgemeldet und geleert. Der Aufruf ist dauerhaft nötig, nicht nur einmalig –
 * es ist nicht absehbar, wann der letzte Client das nächste Mal vorbeikommt.
 */
/**
 * Wartet die Inline-Bereinigung ab und meldet, ob sie einen Neustart auslöst.
 *
 * Die Wartezeit ist gedeckelt. Bliebe das Versprechen aus irgendeinem Grund
 * offen, dürfte die Anwendung darüber nicht selbst stehen bleiben – dann wird
 * eben ohne Bereinigung gestartet, was der Zustand aller Fassungen vor dieser
 * Änderung war.
 */
async function legacyNeustartAngekuendigt() {
  const angekuendigt = window.__dienstplanLegacyCleanup;
  if (!angekuendigt) return false;
  const abgelaufen = new Promise(resolve => setTimeout(() => resolve(null), 3000));
  const ergebnis = await Promise.race([angekuendigt.catch(() => null), abgelaufen]);
  return Boolean(ergebnis && ergebnis.neustart);
}

/** Nur der eigene historische `/sw.js` – fremde Registrierungen bleiben unberührt. */
function istEigenerLegacyWorker(registration) {
  const worker = registration.active || registration.waiting || registration.installing;
  if (!worker) return false;
  try {
    return new URL(worker.scriptURL, location.href).pathname === '/sw.js';
  } catch {
    return false;
  }
}

async function releaseLegacyServiceWorker() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(istEigenerLegacyWorker).map(registration => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('dienstplanrad')).map(key => caches.delete(key)));
    }
  } catch {
    // Ohne Belang: Fehlt die Unterstützung oder verweigert der Browser den
    // Zugriff, war auch nie ein Worker registriert, der stören könnte.
  }
}
// Zur Neustartfrage, weil sie zweimal falsch beantwortet wurde:
//
// Ein bedingungsloses location.reload() aus dem Anwendungsstart heraus bricht
// die Seite – getestet: Nach dem Neuladen blieben alle Anfragen hängen und die
// Anwendung stand dauerhaft bei "Lädt …", sowohl aus der laufenden
// Initialisierung als auch nach dem load-Ereignis. Deshalb steht hier keiner.
//
// Ganz ohne Neustart bleibt aber eine Lücke, und die ist real: `unregister()`
// löst den Controller eines bereits geöffneten Tabs nicht ab. Wer die Seite mit
// aktivem Alt-Worker öffnet, wird für die gesamte Lebensdauer dieses Tabs weiter
// aus dessen Cache bedient – die Abmeldung wirkt erst beim nächsten Aufruf.
//
// Beides zusammen ergibt die jetzige Lösung: Der Neustart steht im Inline-Skript
// des <head>, geschieht ausschließlich bei tatsächlich vorhandenem Controller,
// höchstens einmal pro Tab (Marke in sessionStorage, vor dem Neuladen gesetzt)
// und vor jeder eigenen Anfrage – init() bricht dafür oben ab.

async function onExcelImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reset = () => { event.target.value = ''; };
  if (!window.XLSX) { alert('Excel-Bibliothek noch nicht geladen.'); reset(); return; }
  let workbook;
  // cellDates: Kopfzeilen tragen den Monat teils als echtes Datum statt als Text.
  try { workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); }
  catch (error) { alert(`Excel-Datei konnte nicht gelesen werden: ${error.message}`); reset(); return; }

  const sheets = workbook.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true })
  }));
  const { imports, ignoredSheets } = analyzeWorkbook(sheets, {
    staff: state.staff,
    fallbackYear: state.currentYear,
    fallbackMonth: state.currentMonth
  });
  if (!imports.length) {
    alert(`Kein auswertbares Blatt gefunden.\n\nUnterstützt werden Jahresmappen mit Monatsblättern (${SHEET_NAMES.join(', ')}) und einzelne Monatspläne mit den Spalten Tag, Wochentag, BD, HG, RBN und 2. RBN.\n\nÜbersprungen: ${ignoredSheets.join(', ') || '–'}`);
    reset();
    return;
  }

  // Derselbe Monat darf nicht zweimal aus einer Mappe geschrieben werden; der
  // zweite Durchlauf sähe die Werte des ersten sonst als „bestehend“ an.
  const duplicates = new Set();
  const seenMonths = new Set();
  for (const item of imports) {
    const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
    if (seenMonths.has(key)) duplicates.add(key);
    seenMonths.add(key);
  }
  if (duplicates.size && !confirm(`Die Mappe enthält mehrere Blätter für ${[...duplicates].join(', ')}.\n\nAlle nacheinander übernehmen? Das zuletzt gelesene Blatt setzt sich dabei durch.`)) { reset(); return; }

  const undated = imports.filter(item => item.usedFallbackYear);
  if (undated.length && !confirm(`Für ${undated.map(item => item.sheetName).join(', ')} wurde keine Jahreszahl gefunden.\n\nDiese Blätter dem Jahr ${state.currentYear} zuordnen?`)) { reset(); return; }

  // Ein Einzelblatt ohne Monatsangabe im Kopf landet sonst stillschweigend im
  // gerade angezeigten Monat.
  const monthless = imports.filter(item => item.usedFallbackMonth);
  if (monthless.length && !confirm(`Für ${monthless.map(item => item.sheetName).join(', ')} wurde kein Monat gefunden.\n\nDiese Blätter dem angezeigten Monat ${MONTH_NAMES[state.currentMonth - 1]} zuordnen?`)) { reset(); return; }

  // Vor dem Merge jeden Zielmonat laden. Andernfalls würde ein noch nie
  // geöffneter Monat aus einem leeren Gerüst entstehen und bestehende manuelle
  // Serverwerte beim anschließenden PUT verlieren.
  await Promise.all(imports.map(item => loadMonth(item.year, item.month)));

  const unsafeTargets = imports.filter(item => !isMonthMergeSafe(item.year, item.month));
  if (unsafeTargets.length) {
    const labels = unsafeTargets.map(item => `${item.sheetName} ${item.year}`).join(', ');
    setStatus('offline', 'Excel-Import abgebrochen – Zielmonat nicht verlässlich geladen');
    alert(`Excel-Import abgebrochen. Für ${labels} konnte weder ein aktueller Serverstand noch ein ausdrücklich unsynchronisierter lokaler Arbeitsstand bestätigt werden. Bestehende Serverwerte werden deshalb nicht mit einem möglicherweise veralteten oder leeren Ersatzstand überschrieben.`);
    reset();
    return;
  }

  // Vorabzählung an einer Kopie: Ein Import darf bestehende Werte ersetzen,
  // aber der Umfang wird vorher benannt und bestätigt.
  const replacing = imports.reduce((sum, item) => sum + mergeMonthData(structuredClone(getMonthData(item.year, item.month)), item.monthData).replaced, 0);
  if (replacing > 0 && !confirm(`Der Import ersetzt ${replacing} bereits eingetragene Werte durch abweichende Werte aus der Datei.\n\nFortfahren?`)) { reset(); return; }

  const summaries = ignoredSheets.length ? [`Übersprungene Blätter: ${ignoredSheets.join(', ')}`] : [];
  const touched = new Map();
  for (const item of imports) {
    const targetMonth = getMonthData(item.year, item.month);
    const merge = mergeMonthData(targetMonth, item.monthData);
    setMonthData(item.year, item.month, targetMonth, 'local');
    if (merge.changed > 0) {
      markMonthDirty(item.year, item.month);
      touched.set(`${item.year}-${String(item.month).padStart(2, '0')}`, [item.year, item.month]);
    }
    const notes = [
      `${item.sheetName} → ${MONTH_NAMES[item.month - 1]} ${item.year}`,
      `${item.assignments} Dienste, ${item.absences} Abwesenheiten, ${item.rbnValues} RBN-Werte gelesen`,
      `${merge.added} ergänzt, ${merge.replaced} ersetzt, ${merge.unchanged} unverändert`
    ];
    if (item.unknownNames.length) notes.push(`als Text übernommen (nicht wieder auswählbar): ${item.unknownNames.join(', ')}`);
    if (item.skippedAbsenceNames.length) notes.push(`Abwesenheiten ohne bekannte Person übersprungen: ${item.skippedAbsenceNames.join(', ')}`);
    summaries.push(notes.join('; '));
  }
  if (!touched.size) { alert(`Excel-Import ohne Änderungen beendet.\n\n${summaries.join('\n')}`); reset(); return; }

  const saveResults = await Promise.all([...touched.values()].map(async ([year, month]) => ({ year, month, result: await persistMonth(year, month) })));
  const failed = saveResults.filter(item => !item.result.ok);
  if (failed.length) setStatus('offline', `Excel lokal importiert – ${failed.length} Serverfehler`);
  else if (state.dirty) setStatus('saving', 'Weitere Änderungen ausstehend …');
  else setStatus('saved', 'Excel-Import gespeichert');
  render();
  alert(`Excel-Import abgeschlossen.\n\n${summaries.join('\n')}\n\n${failed.length ? `Nur lokal gesichert für: ${failed.map(item => `${item.year}-${String(item.month).padStart(2, '0')}`).join(', ')}.` : 'Alle betroffenen Monate wurden lokal und auf dem Server gespeichert.'}`);
  reset();
}

/**
 * Der Import setzt sich gegen bestehende Werte durch: Wo die Datei einen
 * anderen Wert trägt, wird der bisherige ersetzt. Was die Datei nicht kennt,
 * bleibt jedoch unangetastet – ein leeres Feld löscht nie etwas.
 */
function mergeMonthData(target, source) {
  let added = 0;
  let replaced = 0;
  let unchanged = 0;
  for (const [iso, day] of Object.entries(source.days || {})) {
    if (!target.days[iso]) continue;
    for (const field of ['bd','hg','rbn1','rbn2']) {
      if (!day[field]) continue;
      const existing = target.days[iso][field];
      if (!existing) { target.days[iso][field] = day[field]; added += 1; }
      else if (existing !== day[field]) { target.days[iso][field] = day[field]; replaced += 1; }
      else unchanged += 1;
    }
  }
  for (const [staffId, absMap] of Object.entries(source.absences || {})) for (const [iso, type] of Object.entries(absMap)) {
    const existing = getAbsence(target, staffId, iso);
    if (!existing) { setAbsence(target, staffId, iso, type, 'import'); added += 1; }
    else if (existing !== type) { setAbsence(target, staffId, iso, type, 'import'); replaced += 1; }
    else unchanged += 1;
  }
  return { added, replaced, unchanged, changed: added + replaced };
}

function exportCurrentMonthToExcel() {
  if (!window.XLSX) { alert('Excel-Bibliothek noch nicht geladen.'); return; }
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const rows = [];
  rows.push(['Bereitschaftsdienstplan', '', getMonthLabel()]);
  rows.push(['Tag', 'Wochentag', 'BD', 'HG', '1. RBN', '2. RBN']);
  Object.entries(monthData.days).forEach(([iso, day]) => {
    rows.push([fmtGermanDate(iso).slice(0,5), weekdayLabel(iso), assignmentLabel(state.staff, day.bd), assignmentLabel(state.staff, day.hg), day.rbn1 || '', day.rbn2 || '']);
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
  const serverPayload = await api.exportJson().catch(() => null);
  const payload = buildBackupPayload(serverPayload);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  // Lokaler Kalendertag: `toISOString()` benennt eine abendliche Sicherung in
  // Deutschland mit dem Vortag.
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  triggerDownload(blob, `dienstplanrad_backup_${stamp}.json`);
}

async function onJsonImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  let payload;
  try { payload = normalizeBackupPayload(JSON.parse(await file.text()), { strict: true }); }
  catch (error) { alert(`JSON-Sicherung konnte nicht gelesen werden: ${error.message}`); event.target.value = ''; return; }

  // Bereits gestartete ältere Monats-PUTs müssen beendet sein, bevor der
  // Gesamtimport schreibt; andernfalls könnte ein später eintreffender alter PUT
  // einen soeben importierten Monat wieder überschreiben.
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (state.dirty) await persistDirtyState();

  const importedMonths = [];
  const importsBootstrap = ['settings', 'staff', 'rbnNames'].some(field => field in payload);
  if ('settings' in payload) state.settings = payload.settings;
  if ('staff' in payload) state.staff = payload.staff;
  if ('rbnNames' in payload) state.rbnNames = payload.rbnNames;
  for (const [key, monthPayload] of payload.months || []) {
    const [year, month] = key.split('-').map(Number);
    setMonthData(year, month, monthPayload, 'local');
    markMonthDirty(year, month);
    importedMonths.push([year, month]);
  }
  if (importsBootstrap) markBootstrapDirty();

  try {
    await api.importJson(payload);
    importedMonths.forEach(([year, month]) => markMonthSynced(year, month));
    if (importsBootstrap) markBootstrapSynced();
    if (state.dirty) setStatus('offline', 'Import gespeichert – weitere lokale Änderungen nicht synchronisiert');
    else setStatus('saved', 'Import gespeichert');
  } catch (error) {
    setStatus('offline', 'Lokal importiert – Serverfehler');
    alert(`Die Sicherung wurde lokal übernommen, der Serverimport wurde zurückgerollt: ${error.message}`);
  }
  render();
  event.target.value = '';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
