from pathlib import Path
import re

ROOT = Path('.')

def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + '\n', encoding='utf-8')


def replace_once(path, old, new, label):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


write('js/state.js', r'''import {
  createEmptyMonth, DEFAULT_SETTINGS, DEFAULT_STAFF, MONTH_NAMES, normalizeBackupPayload,
  normalizeMonthData, normalizeRbnNames, normalizeSettings, normalizeStaffList
} from './defaults.js?v=20260731.2';
import { api } from './api.js?v=20260731.2';

const LOCAL_KEY_PREFIX = 'dienstplanrad:';
const DIRTY_MONTHS_KEY = `${LOCAL_KEY_PREFIX}dirty-months`;
const BOOTSTRAP_DIRTY_KEY = `${LOCAL_KEY_PREFIX}bootstrap-dirty`;
const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  staff: structuredClone(DEFAULT_STAFF),
  rbnNames: [],
  months: new Map(),
  monthSources: new Map(),
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  saveStatus: 'loading',
  dirty: false,
  dirtyVersion: 0,
  dirtyMonths: new Map(),
  bootstrapDirty: false,
  bootstrapVersion: 0,
  saveTimer: null,
  saveChains: new Map(),
  saveRequests: new Map(),
  bootstrapSaveChain: Promise.resolve(),
  bootstrapSaveRequest: null,
  syncStateRestored: false,
  serverReady: false,
  currentBatchMode: 'absence',
  currentPicker: null,
  cachedBootstrap: null
};

function storageGet(key) {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); }
  catch { return null; }
}

function storageSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

function storageRemove(key) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

function updateDirtyFlag() {
  state.dirty = state.bootstrapDirty || state.dirtyMonths.size > 0;
}

function persistDirtyMarkers() {
  if (state.dirtyMonths.size) storageSet(DIRTY_MONTHS_KEY, JSON.stringify([...state.dirtyMonths.keys()]));
  else storageRemove(DIRTY_MONTHS_KEY);
}

function persistBootstrapDirtyMarker() {
  if (state.bootstrapDirty) storageSet(BOOTSTRAP_DIRTY_KEY, '1');
  else storageRemove(BOOTSTRAP_DIRTY_KEY);
}

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseMonthKey(key) {
  const match = MONTH_KEY_PATTERN.exec(String(key || ''));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function restoreSyncState() {
  if (state.syncStateRestored) return;
  state.syncStateRestored = true;

  try {
    const storedKeys = JSON.parse(storageGet(DIRTY_MONTHS_KEY) || '[]');
    if (Array.isArray(storedKeys)) {
      for (const key of storedKeys) {
        if (!parseMonthKey(key) || !storageGet(`${LOCAL_KEY_PREFIX}month:${key}`)) continue;
        state.dirtyMonths.set(key, ++state.dirtyVersion);
        state.monthSources.set(key, 'local');
      }
    }
  } catch {
    storageRemove(DIRTY_MONTHS_KEY);
  }

  state.bootstrapDirty = storageGet(BOOTSTRAP_DIRTY_KEY) === '1' && Boolean(storageGet(`${LOCAL_KEY_PREFIX}bootstrap`));
  if (state.bootstrapDirty) state.bootstrapVersion += 1;
  updateDirtyFlag();
}

export function getMonthData(year, month) {
  const key = monthKey(year, month);
  if (!state.months.has(key)) state.months.set(key, createEmptyMonth(year, month));
  return state.months.get(key);
}

export function setMonthData(year, month, payload, source = null) {
  const normalized = normalizeMonthData(year, month, payload);
  const key = monthKey(year, month);
  state.months.set(key, normalized);
  if (source) state.monthSources.set(key, source);
  storageSet(`${LOCAL_KEY_PREFIX}month:${key}`, JSON.stringify(normalized));
  return normalized;
}

export function readLocalMonth(year, month) {
  const raw = storageGet(`${LOCAL_KEY_PREFIX}month:${monthKey(year, month)}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function readAllLocalMonths() {
  const months = new Map();
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.key !== 'function') return months;
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(`${LOCAL_KEY_PREFIX}month:`)) continue;
      const key = storageKey.slice(`${LOCAL_KEY_PREFIX}month:`.length);
      const parsed = parseMonthKey(key);
      if (!parsed) continue;
      const raw = storageGet(storageKey);
      if (!raw) continue;
      try { months.set(key, normalizeMonthData(parsed[0], parsed[1], JSON.parse(raw))); }
      catch { /* Defekte Einzelmonate werden nicht in eine Sicherung übernommen. */ }
    }
  } catch { /* Storage kann in restriktiven Browsermodi vollständig blockiert sein. */ }
  return months;
}

export function saveLocalBootstrap() {
  storageSet(`${LOCAL_KEY_PREFIX}bootstrap`, JSON.stringify({
    settings: state.settings,
    staff: state.staff,
    rbnNames: state.rbnNames
  }));
}

export function readLocalBootstrap() {
  const raw = storageGet(`${LOCAL_KEY_PREFIX}bootstrap`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function applyBootstrap(data) {
  state.settings = normalizeSettings(data?.settings);
  state.staff = normalizeStaffList(data?.staff);
  state.rbnNames = normalizeRbnNames(data?.rbnNames);
  state.cachedBootstrap = data;
  saveLocalBootstrap();
}

export function isMonthDirty(year, month) {
  restoreSyncState();
  return state.dirtyMonths.has(monthKey(year, month));
}

export function markMonthDirty(year, month) {
  restoreSyncState();
  const key = monthKey(year, month);
  const version = ++state.dirtyVersion;
  state.dirtyMonths.set(key, version);
  if (!state.monthSources.has(key) || state.monthSources.get(key) === 'fallback') state.monthSources.set(key, 'local');
  persistDirtyMarkers();
  updateDirtyFlag();
  return version;
}

export function markMonthSynced(year, month) {
  const key = monthKey(year, month);
  state.dirtyMonths.delete(key);
  state.monthSources.set(key, 'server');
  persistDirtyMarkers();
  updateDirtyFlag();
}

export function markBootstrapDirty() {
  restoreSyncState();
  state.bootstrapDirty = true;
  state.bootstrapVersion += 1;
  saveLocalBootstrap();
  persistBootstrapDirtyMarker();
  updateDirtyFlag();
  return state.bootstrapVersion;
}

export function markBootstrapSynced() {
  state.bootstrapDirty = false;
  persistBootstrapDirtyMarker();
  updateDirtyFlag();
}

export async function bootstrapState() {
  restoreSyncState();
  if (state.bootstrapDirty) {
    const local = readLocalBootstrap();
    if (local) {
      applyBootstrap(local);
      state.serverReady = false;
      return false;
    }
    markBootstrapSynced();
  }

  try {
    const data = await api.bootstrap();
    applyBootstrap(data);
    state.serverReady = true;
    return true;
  } catch {
    const local = readLocalBootstrap();
    if (local) applyBootstrap(local);
    state.serverReady = false;
    return false;
  }
}

export async function loadMonth(year, month, { forceServer = false } = {}) {
  restoreSyncState();
  const key = monthKey(year, month);

  // Ein nicht synchronisierter lokaler Stand darf niemals durch einen älteren
  // Serverstand ersetzt werden – auch nicht durch „Serverstand neu laden“.
  if (state.dirtyMonths.has(key)) {
    const local = state.months.get(key) || readLocalMonth(year, month);
    if (local) {
      setMonthData(year, month, local, 'local');
      state.serverReady = false;
      return getMonthData(year, month);
    }
    // Verwaister Marker ohne zugehörigen lokalen Monat.
    state.dirtyMonths.delete(key);
    persistDirtyMarkers();
    updateDirtyFlag();
  }

  try {
    const data = await api.getMonth(year, month);
    setMonthData(year, month, data.month || createEmptyMonth(year, month), 'server');
    state.serverReady = true;
    return getMonthData(year, month);
  } catch {
    const local = readLocalMonth(year, month);
    if (local) {
      setMonthData(year, month, local, 'local');
      state.serverReady = false;
      return getMonthData(year, month);
    }
    const empty = createEmptyMonth(year, month);
    setMonthData(year, month, empty, 'fallback');
    state.serverReady = false;
    return empty;
  }
}

export async function warmAdjacentMonths(year, month) {
  restoreSyncState();
  const previousReady = state.serverReady;
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const requestedMonths = new Map();
  const addRequest = (requestedYear, requestedMonth) => requestedMonths.set(monthKey(requestedYear, requestedMonth), [requestedYear, requestedMonth]);
  addRequest(prev.getFullYear(), prev.getMonth() + 1);
  addRequest(next.getFullYear(), next.getMonth() + 1);
  for (let historicalMonth = 1; historicalMonth < month; historicalMonth += 1) addRequest(year, historicalMonth);

  const tasks = [...requestedMonths.values()].map(async ([requestedYear, requestedMonth]) => {
    const key = monthKey(requestedYear, requestedMonth);
    if (state.dirtyMonths.has(key)) return;
    try {
      const data = await api.getMonth(requestedYear, requestedMonth);
      setMonthData(requestedYear, requestedMonth, data.month || createEmptyMonth(requestedYear, requestedMonth), 'server');
    } catch {
      const local = readLocalMonth(requestedYear, requestedMonth);
      if (local) setMonthData(requestedYear, requestedMonth, local, 'local');
      else setMonthData(requestedYear, requestedMonth, createEmptyMonth(requestedYear, requestedMonth), 'fallback');
    }
  });
  await Promise.allSettled(tasks);
  state.serverReady = previousReady;
}

export function scheduleSave(saveFn, year = state.currentYear, month = state.currentMonth) {
  markMonthDirty(year, month);
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    saveFn();
  }, 1100);
}

export async function persistCurrentMonth() {
  return persistMonth(state.currentYear, state.currentMonth);
}

export async function persistMonth(year, monthNumber) {
  restoreSyncState();
  const key = monthKey(year, monthNumber);
  const saveVersion = state.dirtyMonths.get(key);
  if (saveVersion === undefined) {
    return { ok: true, current: true, pending: state.dirty, skipped: true };
  }

  const duplicate = state.saveRequests.get(key);
  if (duplicate?.version === saveVersion) return duplicate.promise;

  const month = getMonthData(year, monthNumber);
  month.updatedAt = new Date().toISOString();
  month.revision = (month.revision || 0) + 1;
  setMonthData(year, monthNumber, month, 'local');
  const payload = structuredClone(getMonthData(year, monthNumber));
  state.saveStatus = 'saving';

  const previous = state.saveChains.get(key) || Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    try {
      await api.saveMonth(year, monthNumber, payload);
      if (state.dirtyMonths.get(key) === saveVersion) markMonthSynced(year, monthNumber);
      state.saveStatus = state.dirty ? 'pending' : 'saved';
      state.serverReady = true;
      return { ok: true, current: !state.dirtyMonths.has(key), pending: state.dirty };
    } catch (error) {
      if (!state.dirtyMonths.has(key)) state.dirtyMonths.set(key, saveVersion);
      state.monthSources.set(key, 'local');
      persistDirtyMarkers();
      updateDirtyFlag();
      state.saveStatus = 'offline';
      state.serverReady = false;
      return { ok: false, current: false, pending: true, error };
    }
  });

  let publicPromise;
  publicPromise = run.finally(() => {
    if (state.saveChains.get(key) === run) state.saveChains.delete(key);
    if (state.saveRequests.get(key)?.promise === publicPromise) state.saveRequests.delete(key);
  });
  state.saveChains.set(key, run);
  state.saveRequests.set(key, { version: saveVersion, promise: publicPromise });
  return publicPromise;
}

export async function persistBootstrap() {
  restoreSyncState();
  if (!state.bootstrapDirty) return { ok: true, skipped: true };
  const version = state.bootstrapVersion;
  if (state.bootstrapSaveRequest?.version === version) return state.bootstrapSaveRequest.promise;

  const payload = structuredClone({ settings: state.settings, staff: state.staff, rbnNames: state.rbnNames });
  const run = state.bootstrapSaveChain.catch(() => undefined).then(async () => {
    try {
      await api.importJson(payload);
      if (state.bootstrapDirty && state.bootstrapVersion === version) markBootstrapSynced();
      state.serverReady = true;
      return { ok: true, pending: state.dirty };
    } catch (error) {
      state.bootstrapDirty = true;
      persistBootstrapDirtyMarker();
      updateDirtyFlag();
      state.serverReady = false;
      return { ok: false, pending: true, error };
    }
  });

  let publicPromise;
  publicPromise = run.finally(() => {
    if (state.bootstrapSaveChain === run) state.bootstrapSaveChain = Promise.resolve();
    if (state.bootstrapSaveRequest?.promise === publicPromise) state.bootstrapSaveRequest = null;
  });
  state.bootstrapSaveChain = run;
  state.bootstrapSaveRequest = { version, promise: publicPromise };
  return publicPromise;
}

export async function persistDirtyMonths() {
  restoreSyncState();
  const targets = [...state.dirtyMonths.keys()].map(parseMonthKey).filter(Boolean);
  return Promise.all(targets.map(([year, month]) => persistMonth(year, month)));
}

export async function persistDirtyState() {
  const [bootstrap, months] = await Promise.all([persistBootstrap(), persistDirtyMonths()]);
  return { bootstrap, months, ok: bootstrap.ok !== false && months.every(result => result.ok !== false) };
}

export function buildBackupPayload(serverPayload = null) {
  restoreSyncState();
  let server = {};
  try { server = serverPayload ? normalizeBackupPayload(serverPayload, { strict: false }) : {}; }
  catch { server = {}; }

  const months = new Map(server.months || []);
  for (const [key, month] of readAllLocalMonths()) {
    if (!months.has(key) || state.dirtyMonths.has(key)) months.set(key, month);
  }
  for (const [key, month] of state.months) {
    const source = state.monthSources.get(key);
    if (!months.has(key) || state.dirtyMonths.has(key) || source === 'local' || source === 'fallback') {
      const parsed = parseMonthKey(key);
      if (parsed) months.set(key, normalizeMonthData(parsed[0], parsed[1], month));
    }
  }

  return {
    ok: true,
    settings: structuredClone(state.settings),
    staff: structuredClone(state.staff),
    rbnNames: structuredClone(state.rbnNames),
    months: [...months.entries()].sort(([left], [right]) => left.localeCompare(right))
  };
}

export function getMonthLabel(year = state.currentYear, month = state.currentMonth) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
''')

replace_once(
    'js/app.js',
    "import { state, bootstrapState, getMonthData, getMonthLabel, loadMonth, markMonthDirty, persistCurrentMonth, persistMonth, scheduleSave, setMonthData, warmAdjacentMonths } from './state.js?v=20260731.2';",
    "import { state, bootstrapState, buildBackupPayload, getMonthData, getMonthLabel, isMonthDirty, loadMonth, markBootstrapDirty, markBootstrapSynced, markMonthDirty, markMonthSynced, persistDirtyState, persistMonth, scheduleSave, setMonthData, warmAdjacentMonths } from './state.js?v=20260731.2';",
    'app state imports'
)
replace_once(
    'js/app.js',
    "window.addEventListener('beforeunload', () => { if (state.dirty) persistCurrentMonth(); });",
    "window.addEventListener('beforeunload', () => { if (state.dirty) persistDirtyState(); });",
    'beforeunload all dirty state'
)
replace_once(
    'js/app.js',
    "const monthNameBySheet = Object.fromEntries(SHEET_NAMES.map((name, idx) => [name, idx + 1]));",
    "const monthNameBySheet = Object.fromEntries(SHEET_NAMES.map((name, idx) => [name, idx + 1]));\nconst MIN_YEAR = 2000;\nconst MAX_YEAR = 2200;",
    'year limits'
)

pattern = re.compile(r"function buildStaticSelectors\(\) \{.*?\n\}\n\nfunction populateSelectors\(\) \{.*?\n\}", re.S)
replacement = r'''function ensureYearOption(year) {
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
}'''
text = Path('js/app.js').read_text(encoding='utf-8')
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'selector replacement: expected 1, found {count}')
Path('js/app.js').write_text(text, encoding='utf-8')

pattern = re.compile(r"async function openCurrentMonth\(year, month, forceServer = false\) \{.*?\n\}\n\nfunction render\(\)", re.S)
replacement = r'''async function openCurrentMonth(year, month, forceServer = false) {
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

function render()'''
text = Path('js/app.js').read_text(encoding='utf-8')
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'openCurrentMonth replacement: expected 1, found {count}')
Path('js/app.js').write_text(text, encoding='utf-8')

replace_once(
    'js/app.js',
    "function shiftMonth(delta) {\n  const selectedYear = Number($('#yearSelect').value) || state.currentYear;\n  const selectedMonth = Number($('#monthSelect').value) || state.currentMonth;\n  const next = new Date(selectedYear, selectedMonth - 1 + delta, 1);\n  $('#yearSelect').value = String(next.getFullYear());\n  $('#monthSelect').value = String(next.getMonth() + 1);\n  openCurrentMonth(next.getFullYear(), next.getMonth() + 1);\n}",
    "function shiftMonth(delta) {\n  const selectedYear = Number($('#yearSelect').value) || state.currentYear;\n  const selectedMonth = Number($('#monthSelect').value) || state.currentMonth;\n  const next = new Date(selectedYear, selectedMonth - 1 + delta, 1);\n  const nextYear = next.getFullYear();\n  if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) {\n    setStatus('error', `Unterstützter Zeitraum: ${MIN_YEAR}–${MAX_YEAR}`);\n    return;\n  }\n  ensureYearOption(nextYear);\n  $('#yearSelect').value = String(nextYear);\n  $('#monthSelect').value = String(next.getMonth() + 1);\n  openCurrentMonth(nextYear, next.getMonth() + 1);\n}",
    'safe month shifting'
)

pattern = re.compile(r"async function onExcelImport\(event\) \{.*?\n\}\n\nfunction detectSheetYear", re.S)
replacement = r'''async function onExcelImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reset = () => { event.target.value = ''; };
  if (!window.XLSX) { alert('Excel-Bibliothek noch nicht geladen.'); reset(); return; }
  let workbook;
  try { workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' }); }
  catch (error) { alert(`Excel-Datei konnte nicht gelesen werden: ${error.message}`); reset(); return; }

  const recognized = workbook.SheetNames.filter(sheetName => monthNameBySheet[sheetName]);
  if (!recognized.length) { alert(`Keine unterstützten Monatsblätter gefunden. Erwartet werden: ${SHEET_NAMES.join(', ')}.`); reset(); return; }
  const missingYearSheets = recognized.filter(sheetName => !detectSheetYear(workbook.Sheets[sheetName]));
  const fallbackYear = state.currentYear;
  if (missingYearSheets.length && !confirm(`In ${missingYearSheets.join(', ')} wurde keine eindeutige Jahreszahl gefunden.\n\nDiese Blätter dem aktuell ausgewählten Jahr ${fallbackYear} zuordnen?`)) { reset(); return; }

  const parsedImports = [];
  const summaries = [];
  for (const sheetName of recognized) {
    const imported = importMonthSheet(sheetName, workbook.Sheets[sheetName], fallbackYear);
    if (!imported) summaries.push(`${sheetName}: keine verwertbare Tageszeile gefunden`);
    else parsedImports.push({ sheetName, imported });
  }
  if (!parsedImports.length) { alert(`Excel-Import ohne Änderungen beendet.\n\n${summaries.join('\n')}`); reset(); return; }

  // Vor dem Merge jeden Zielmonat laden. Andernfalls würde ein noch nie
  // geöffneter Monat aus einem leeren Gerüst entstehen und bestehende manuelle
  // Serverwerte beim anschließenden PUT verlieren.
  await Promise.all(parsedImports.map(({ imported }) => loadMonth(imported.year, imported.month)));

  const touched = new Map();
  for (const { sheetName, imported } of parsedImports) {
    const targetMonth = getMonthData(imported.year, imported.month);
    const merge = mergeMonthData(targetMonth, imported.monthData);
    setMonthData(imported.year, imported.month, targetMonth, 'local');
    if (merge.added > 0) {
      markMonthDirty(imported.year, imported.month);
      touched.set(`${imported.year}-${String(imported.month).padStart(2, '0')}`, [imported.year, imported.month]);
    }
    summaries.push(`${sheetName} ${imported.year}: ${imported.assignments} Dienste, ${imported.absences} Abwesenheiten erkannt; ${merge.added} ergänzt, ${merge.preserved} bestehende manuelle Werte bewahrt${imported.unknownNames.length ? `; unbekannte Namen: ${imported.unknownNames.join(', ')}` : ''}`);
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

function detectSheetYear'''
text = Path('js/app.js').read_text(encoding='utf-8')
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Excel import replacement: expected 1, found {count}')
Path('js/app.js').write_text(text, encoding='utf-8')

pattern = re.compile(r"async function exportJsonBackup\(\) \{.*?\n\}\n\nasync function onJsonImport\(event\) \{.*?\n\}\n\nfunction triggerDownload", re.S)
replacement = r'''async function exportJsonBackup() {
  const serverPayload = await api.exportJson().catch(() => null);
  const payload = buildBackupPayload(serverPayload);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `dienstplanrad_backup_${new Date().toISOString().slice(0,10)}.json`);
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
  else saveLocalBootstrap();

  try {
    await api.importJson(payload);
    importedMonths.forEach(([year, month]) => markMonthSynced(year, month));
    if (importsBootstrap) markBootstrapSynced();
    setStatus('saved', 'Import gespeichert');
  } catch (error) {
    setStatus('offline', 'Lokal importiert – Serverfehler');
    alert(`Die Sicherung wurde lokal übernommen, der Serverimport wurde zurückgerollt: ${error.message}`);
  }
  render();
  event.target.value = '';
}

function triggerDownload'''
text = Path('js/app.js').read_text(encoding='utf-8')
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'JSON replacement: expected 1, found {count}')
Path('js/app.js').write_text(text, encoding='utf-8')

replace_once(
    'js/rules-core.js',
    "export function isAaOn(state, staffId, dateIso) {\n  const person = getStaffById(state.staff, staffId);\n  return Boolean(person) && !getRoleProperties(person, dateIso).canHg;\n}",
    "export function isAaOn(state, staffId, dateIso) {\n  const person = getStaffById(state.staff, staffId);\n  return Boolean(person?.includeInPlanning)\n    && person.category === 'aa'\n    && !getRoleProperties(person, dateIso).canHg;\n}",
    'AA classification'
)
replace_once(
    'js/rules-core.js',
    "    if (role === 'bd' && person.maxBd && countRoleInMonthExcept(monthData, person.id, 'bd', dateIso) >= person.maxBd) return false;",
    "    if (role === 'bd' && person.maxBd != null && countRoleInMonthExcept(monthData, person.id, 'bd', dateIso) >= person.maxBd) return false;",
    'zero max in peer eligibility'
)

replace_once(
    'js/rules-evaluation.js',
    "  if (role === 'bd' && monthData.days?.[dateIso]?.hg === staffId) push('red', 'Gleichzeitige Einteilung in HG und BD am selben Tag');",
    "  if (role !== 'bd' && role !== 'hg') return { level: 'gray', reasons: ['Unbekannte Dienstrolle'], canSelect: false, meta: { recommendationScore: 0 } };\n  if (role === 'bd' && monthData.days?.[dateIso]?.hg === staffId) push('red', 'Gleichzeitige Einteilung in HG und BD am selben Tag');",
    'unknown role guard'
)
replace_once(
    'js/rules-evaluation.js',
    "    if (person.maxBd && currentBd >= person.maxBd) push('red', `Monatsmaximum von ${person.maxBd} BD bereits erreicht`);",
    "    if (person.maxBd != null && currentBd >= person.maxBd) push('red', `Monatsmaximum von ${person.maxBd} BD bereits erreicht`);",
    'zero max evaluation'
)
replace_once(
    'js/rules-evaluation.js',
    "      if (diffForward === 1) push('red', 'BD bereits am Folgetag');\n      else if (diffForward > 1 && diffForward < 4) push('yellow', 'Kurzer Abstand zum nächsten BD');",
    "      const middleDate = addDays(date, 1);\n      const middleIso = toLocalIso(middleDate);\n      const middleMonth = monthForIso(state, middleIso) || monthData;\n      const isWeekdayPattern = [date, middleDate, nextBd].every(item => item.getDay() >= 1 && item.getDay() <= 5);\n      const isBdFzaBd = diffForward === 2 && isWeekdayPattern && getEffectiveAbsence(state, middleMonth, staffId, middleIso) === 'fza';\n      if (diffForward === 1) push('red', 'BD bereits am Folgetag');\n      else if (isBdFzaBd) push('yellow', 'BD–FZA–BD werktags');\n      else if (diffForward > 1 && diffForward < 4) push('yellow', 'Kurzer Abstand zum nächsten BD');",
    'forward BD-FZA-BD reason'
)

write('js/rules-reporting.js', r'''import { isRegularWorkdayIso } from './holidays.js?v=20260731.2';
import { isRbnValueAllowed, isSecondRbnAvailable } from './rbn.js?v=20260731.2';
import {
  ABSENCE_FOR_CT_LEADERSHIP, computeWeekendEquivalent, countRoleInMonth, dayIso,
  fmtGermanDate, getEffectiveAbsence, getRoleProperties, getStaffById, isStaffActiveDuringMonth, severityRank
} from './rules-core.js?v=20260731.2';
import { evaluateCandidate } from './rules-evaluation.js?v=20260731.2';

export function collectIssues(state, monthData) {
  const issues = [];
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    if (!day.hg) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: HG offen`, details: 'Kein HG eingetragen.' });
    if (!day.bd) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: BD offen`, details: 'Kein BD eingetragen.' });

    for (const role of ['bd', 'hg']) {
      const staffId = day[role];
      if (!staffId) continue;
      if (!getStaffById(state.staff, staffId)) {
        issues.push({
          level: 'red',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · unbekannte Personal-ID`,
          details: `Der gespeicherte Wert „${staffId}“ ist keiner gültigen Person zugeordnet.`
        });
        continue;
      }
      const evaluation = evaluateCandidate({ state, monthData, dateIso: iso, role, staffId });
      if (evaluation.level === 'gray') {
        issues.push({
          level: 'red',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · nicht mehr zulässige Besetzung`,
          details: evaluation.reasons.join(' · ')
        });
      } else if (['orange', 'red'].includes(evaluation.level)) {
        issues.push({
          level: evaluation.level,
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · ${getStaffById(state.staff, staffId)?.name || staffId}`,
          details: evaluation.reasons.join(' · ')
        });
      }
    }

    const secondAvailable = isSecondRbnAvailable(iso, day.rbn1);
    if (day.rbn1 && !isRbnValueAllowed('rbn1', iso, day.rbn1)) {
      issues.push({ level: 'orange', title: `${fmtGermanDate(iso)} · RBN-Altwert`, details: `„${day.rbn1}“ gehört an diesem Datum nicht zum gültigen RBN-Pool.` });
    }
    if (day.rbn2 && !isRbnValueAllowed('rbn2', iso, day.rbn2)) {
      issues.push({ level: 'orange', title: `${fmtGermanDate(iso)} · 2. RBN-Altwert`, details: `„${day.rbn2}“ gehört nicht zum gültigen Pool der zweiten RBN.` });
    }
    if (day.rbn2 && !secondAvailable) {
      issues.push({ level: 'orange', title: `${fmtGermanDate(iso)} · 2. RBN ohne gültigen Trigger`, details: 'Die erste RBN schaltet an diesem Datum keine zweite RBN frei.' });
    } else if (secondAvailable && !day.rbn2) {
      issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: 2. RBN offen`, details: 'Die Erstbesetzung erfordert eine zweite RBN.' });
    }
  }

  for (const iso of Object.keys(monthData.days || {})) {
    if (!isRegularWorkdayIso(iso)) continue;
    const becker = getEffectiveAbsence(state, monthData, 'becker', iso);
    const martin = getEffectiveAbsence(state, monthData, 'martin', iso);
    if (!ABSENCE_FOR_CT_LEADERSHIP.has(becker) || !ABSENCE_FOR_CT_LEADERSHIP.has(martin)) continue;
    issues.push({ level: 'red', title: `${fmtGermanDate(iso)} · Becker/Martin gleichzeitig abwesend`, details: 'CT-Leitungsbesetzung prüfen.' });
  }
  return issues.sort((a, b) => severityRank[b.level] - severityRank[a.level]);
}

export function buildStats(state, monthData) {
  return state.staff
    .filter(person => person.includeInPlanning && isStaffActiveDuringMonth(person, monthData.year, monthData.month))
    .map(person => ({
      id: person.id,
      name: person.name,
      roleLabel: getRoleProperties(person, dayIso(monthData.year, monthData.month, 15)).roleLabel,
      bd: countRoleInMonth(monthData, person.id, 'bd'),
      hg: countRoleInMonth(monthData, person.id, 'hg'),
      weekendEq: Number(computeWeekendEquivalent(monthData, person.id).toFixed(1)),
      bdTarget: person.bdTarget || 0,
      bdRemaining: person.bdTarget ? person.bdTarget - countRoleInMonth(monthData, person.id, 'bd') : null
    }));
}
''')

text = Path('js/rbn.js').read_text(encoding='utf-8').replace('Rufbereitschaften Nuklearmedizin', 'Rufbereitschaften Neuroradiologie')
Path('js/rbn.js').write_text(text, encoding='utf-8')

replace_once(
    'functions/_utils.js',
    "export function invalid(message) {\n  return json({ ok: false, error: message }, 400);\n}",
    "export function invalid(message) {\n  return json({ ok: false, error: message }, 400);\n}\n\nexport function serverError(error) {\n  return json({ ok: false, error: error?.message || 'Interner Serverfehler' }, 500);\n}",
    'server error helper'
)

write('functions/api/month/[year]/[month].js', r'''import {
  ensureMonthShape, invalid, json, monthStorageKey, put, readJsonRequest, getOrInit, serverError
} from '../../../_utils.js';

export async function onRequestGet(context) {
  const { year, month } = context.params;
  let key;
  let empty;
  try {
    key = monthStorageKey(year, month);
    empty = ensureMonthShape(year, month);
  } catch (error) {
    return invalid(error.message);
  }
  try {
    const monthData = await getOrInit(context, key, empty);
    return json({ ok: true, month: ensureMonthShape(year, month, monthData) });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  const { year, month } = context.params;
  let key;
  let normalized;
  try {
    key = monthStorageKey(year, month);
    normalized = ensureMonthShape(year, month, await readJsonRequest(context.request));
  } catch (error) {
    return invalid(error.message);
  }
  try {
    await put(context, key, normalized);
    return json({ ok: true, month: normalized });
  } catch (error) {
    return serverError(error);
  }
}
''')

write('functions/api/bootstrap.js', r'''import { defaults, getOrInit, json, normalizedBootstrap, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const base = defaults();
    const [settings, staff, rbnNames] = await Promise.all([
      getOrInit(context, 'app:settings', base.settings),
      getOrInit(context, 'app:staff', base.staff),
      getOrInit(context, 'app:rbn-names', base.rbnNames)
    ]);
    return json({ ok: true, ...normalizedBootstrap({ settings, staff, rbnNames }) });
  } catch (error) {
    return serverError(error);
  }
}
''')

write('functions/api/settings.js', r'''import { defaults, getOrInit, invalid, json, normalizeSettings, put, readJsonRequest, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeSettings(await getOrInit(context, 'app:settings', defaults().settings));
    return json({ ok: true, settings: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let payload;
  try { payload = normalizeSettings(await readJsonRequest(context.request), { strict: true }); }
  catch (error) { return invalid(error.message); }
  try {
    await put(context, 'app:settings', payload);
    return json({ ok: true, settings: payload });
  } catch (error) {
    return serverError(error);
  }
}
''')

write('functions/api/staff.js', r'''import { defaults, getOrInit, invalid, json, normalizeStaffList, put, readJsonRequest, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeStaffList(await getOrInit(context, 'app:staff', defaults().staff));
    return json({ ok: true, staff: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let payload;
  try { payload = normalizeStaffList(await readJsonRequest(context.request), { strict: true }); }
  catch (error) { return invalid(error.message); }
  try {
    await put(context, 'app:staff', payload);
    return json({ ok: true, staff: payload });
  } catch (error) {
    return serverError(error);
  }
}
''')

write('functions/api/rbn-names.js', r'''import { defaults, getOrInit, invalid, json, normalizeRbnNames, put, readJsonRequest, serverError } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeRbnNames(await getOrInit(context, 'app:rbn-names', defaults().rbnNames));
    return json({ ok: true, rbnNames: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let payload;
  try {
    const raw = await readJsonRequest(context.request);
    payload = normalizeRbnNames(Array.isArray(raw) ? raw : raw?.rbnNames, { strict: true });
  } catch (error) {
    return invalid(error.message);
  }
  try {
    await put(context, 'app:rbn-names', payload);
    return json({ ok: true, rbnNames: payload });
  } catch (error) {
    return serverError(error);
  }
}
''')

write('functions/api/export.js', r'''import { defaults, ensureMonthShape, getOrInit, json, kv, normalizedBootstrap, serverError } from '../_utils.js';

async function listAllMonthKeys(store) {
  const keys = [];
  let cursor;
  do {
    const options = { prefix: 'year:' };
    if (cursor) options.cursor = cursor;
    const page = await store.list(options);
    keys.push(...page.keys.map(item => item.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys.filter(key => /^year:\d{4}:month:(0[1-9]|1[0-2])$/.test(key)).sort();
}

export async function onRequestGet(context) {
  try {
    const base = defaults();
    const [settings, staff, rbnNames] = await Promise.all([
      getOrInit(context, 'app:settings', base.settings),
      getOrInit(context, 'app:staff', base.staff),
      getOrInit(context, 'app:rbn-names', base.rbnNames)
    ]);
    const store = kv(context);
    const keys = await listAllMonthKeys(store);
    const values = await Promise.all(keys.map(key => store.get(key, 'json')));
    const months = [];
    keys.forEach((key, index) => {
      const value = values[index];
      if (!value) return;
      const match = /^year:(\d{4}):month:(\d{2})$/.exec(key);
      const year = Number(match[1]);
      const month = Number(match[2]);
      months.push([`${match[1]}-${match[2]}`, ensureMonthShape(year, month, value)]);
    });
    return json({ ok: true, ...normalizedBootstrap({ settings, staff, rbnNames }), months });
  } catch (error) {
    return serverError(error);
  }
}
''')

write('functions/api/import.js', r'''import { invalid, json, kv, normalizeBackupPayload, serverError } from '../_utils.js';

async function rollback(store, snapshots, writtenKeys) {
  const failures = [];
  for (const key of [...writtenKeys].reverse()) {
    try {
      const previous = snapshots.get(key);
      if (previous === null) await store.delete(key);
      else await store.put(key, previous);
    } catch (error) {
      failures.push(`${key}: ${error.message}`);
    }
  }
  return failures;
}

export async function onRequestPost(context) {
  let payload;
  try {
    payload = normalizeBackupPayload(await context.request.json(), { strict: true });
  } catch (error) {
    return invalid(error.message || 'Ungültiges JSON.');
  }

  const writes = [];
  if ('settings' in payload) writes.push(['app:settings', payload.settings]);
  if ('staff' in payload) writes.push(['app:staff', payload.staff]);
  if ('rbnNames' in payload) writes.push(['app:rbn-names', payload.rbnNames]);
  for (const [key, value] of payload.months || []) writes.push([`year:${key.slice(0, 4)}:month:${key.slice(5, 7)}`, value]);

  let store;
  const snapshots = new Map();
  try {
    store = kv(context);
    for (const [key] of writes) snapshots.set(key, await store.get(key));
  } catch (error) {
    return serverError(error);
  }

  const writtenKeys = [];
  try {
    for (const [key, value] of writes) {
      await store.put(key, JSON.stringify(value));
      writtenKeys.push(key);
    }
  } catch (error) {
    const rollbackFailures = await rollback(store, snapshots, writtenKeys);
    return json({
      ok: false,
      error: rollbackFailures.length
        ? `Serverimport fehlgeschlagen; Rücksetzung unvollständig: ${rollbackFailures.join(' | ')}`
        : `Serverimport fehlgeschlagen und wurde vollständig zurückgerollt: ${error.message}`
    }, 500);
  }

  return json({ ok: true, importedMonths: payload.months?.length || 0 });
}
''')

write('tests/bughunt-regressions.test.js', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmptyMonth, DEFAULT_STAFF, normalizeStaffList } from '../js/defaults.js';
import { collectIssues } from '../js/rules-reporting.js';
import { evaluateCandidate } from '../js/rules-evaluation.js';
import { isAaOn, setAbsence, setAssignment } from '../js/rules-core.js';
import { onRequestGet as getMonth } from '../functions/api/month/[year]/[month].js';
import { onRequestGet as getBootstrap } from '../functions/api/bootstrap.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

async function freshState(label) {
  return import(`../js/state.js?bughunt=${label}-${Date.now()}-${Math.random()}`);
}

test('ein sauberer Zwischenmonat wird trotz globalem Dirty-Zustand niemals gespeichert', async () => {
  globalThis.localStorage = new MemoryStorage();
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return okResponse(); };
  const { getMonthData, markMonthDirty, persistMonth, state } = await freshState('clean-skip');
  state.months.clear();
  getMonthData(2026, 7).days['2026-07-01'].bd = 'lurz';
  markMonthDirty(2026, 7);
  getMonthData(2026, 8);
  const result = await persistMonth(2026, 8);
  assert.equal(result.skipped, true);
  assert.equal(fetches, 0);
});

test('Saves desselben Monats laufen strikt seriell und können den neueren Stand nicht rückwärts überschreiben', async () => {
  globalThis.localStorage = new MemoryStorage();
  const calls = [];
  const releases = [];
  globalThis.fetch = (_url, options) => new Promise(resolve => {
    calls.push(JSON.parse(options.body));
    releases.push(() => resolve(okResponse()));
  });
  const { getMonthData, markMonthDirty, persistMonth, state } = await freshState('serial');
  state.months.clear();
  const month = getMonthData(2026, 7);
  month.days['2026-07-01'].bd = 'lurz';
  markMonthDirty(2026, 7);
  const first = persistMonth(2026, 7);
  await Promise.resolve();
  month.days['2026-07-01'].bd = 'becker';
  markMonthDirty(2026, 7);
  const second = persistMonth(2026, 7);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].days['2026-07-01'].bd, 'lurz');
  releases[0]();
  await first;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].days['2026-07-01'].bd, 'becker');
  assert.ok(calls[1].revision > calls[0].revision);
  releases[1]();
  await second;
  assert.equal(state.dirty, false);
});

test('persistierter Offline-Marker schützt einen lokalen Monat nach einem Neustart vor altem Serverinhalt', async () => {
  globalThis.localStorage = new MemoryStorage();
  const local = createEmptyMonth(2026, 7);
  local.days['2026-07-01'].bd = 'becker';
  localStorage.setItem('dienstplanrad:month:2026-07', JSON.stringify(local));
  localStorage.setItem('dienstplanrad:dirty-months', JSON.stringify(['2026-07']));
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    const old = createEmptyMonth(2026, 7);
    old.days['2026-07-01'].bd = 'lurz';
    return new Response(JSON.stringify({ ok: true, month: old }), { headers: { 'Content-Type': 'application/json' } });
  };
  const { loadMonth, state } = await freshState('offline-restore');
  const loaded = await loadMonth(2026, 7, { forceServer: true });
  assert.equal(loaded.days['2026-07-01'].bd, 'becker');
  assert.equal(fetches, 0);
  assert.equal(state.dirty, true);
});

test('JSON-Sicherung überlagert einen erfolgreichen Serverexport mit dem neueren lokalen Dirty-Monat', async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.fetch = async () => okResponse();
  const { buildBackupPayload, getMonthData, markMonthDirty, state } = await freshState('backup-overlay');
  state.months.clear();
  const local = getMonthData(2026, 7);
  local.days['2026-07-01'].bd = 'becker';
  markMonthDirty(2026, 7);
  const server = createEmptyMonth(2026, 7);
  server.days['2026-07-01'].bd = 'lurz';
  const backup = buildBackupPayload({ settings: { schemaVersion: 2 }, staff: DEFAULT_STAFF, rbnNames: [], months: [['2026-07', server]] });
  assert.equal(new Map(backup.months).get('2026-07').days['2026-07-01'].bd, 'becker');
});

test('nur echte planbare Assistenzärzte lösen AA-Kopplungen aus', () => {
  const state = { staff: structuredClone(DEFAULT_STAFF), months: new Map() };
  assert.equal(isAaOn(state, 'schaefer', '2026-07-03'), false);
  assert.equal(isAaOn(state, 'licenji', '2026-07-03'), true);
  assert.equal(isAaOn(state, 'elhouba', '2026-09-22'), false);
});

test('ein hartes BD-Maximum von null sperrt bereits den ersten BD', () => {
  const staff = normalizeStaffList([{ id: 'nullkontingent', name: 'Dr. Null', category: 'fa', includeInPlanning: true, includeInAbsenceList: true, activeFrom: '2025-01-01', bdTarget: 0, maxBd: 0, canHg: true, canSaturdayBd: true }], { strict: true });
  const month = createEmptyMonth(2026, 7);
  const state = { staff, months: new Map([['2026-07', month]]), monthSources: new Map([['2026-07', 'server']]), currentYear: 2026, currentMonth: 7 };
  const evaluation = evaluateCandidate({ state, monthData: month, dateIso: '2026-07-06', role: 'bd', staffId: 'nullkontingent' });
  assert.equal(evaluation.level, 'red');
  assert.ok(evaluation.reasons.some(reason => reason.includes('Monatsmaximum von 0')));
});

test('BD–FZA–BD wird in beiden Eingabereihenfolgen mit derselben präzisen Begründung erkannt', () => {
  const make = () => {
    const month = createEmptyMonth(2026, 7);
    setAbsence(month, 'lurz', '2026-07-07', 'fza');
    return { month, state: { staff: structuredClone(DEFAULT_STAFF), months: new Map([['2026-07', month]]), monthSources: new Map([['2026-07', 'server']]), currentYear: 2026, currentMonth: 7 } };
  };
  const forward = make();
  setAssignment(forward.month, '2026-07-08', 'bd', 'lurz');
  const first = evaluateCandidate({ state: forward.state, monthData: forward.month, dateIso: '2026-07-06', role: 'bd', staffId: 'lurz' });
  const backward = make();
  setAssignment(backward.month, '2026-07-06', 'bd', 'lurz');
  const second = evaluateCandidate({ state: backward.state, monthData: backward.month, dateIso: '2026-07-08', role: 'bd', staffId: 'lurz' });
  assert.ok(first.reasons.includes('BD–FZA–BD werktags'));
  assert.ok(second.reasons.includes('BD–FZA–BD werktags'));
});

test('Offene Punkte melden inaktive Besetzungen und inkonsistente zweite RBN', () => {
  const month = createEmptyMonth(2026, 9);
  setAssignment(month, '2026-09-01', 'bd', 'hellmann');
  month.days['2026-09-02'].rbn1 = 'Dr. Martin';
  const state = { staff: structuredClone(DEFAULT_STAFF), months: new Map([['2026-09', month]]), monthSources: new Map([['2026-09', 'server']]), currentYear: 2026, currentMonth: 9 };
  const issues = collectIssues(state, month);
  assert.ok(issues.some(issue => issue.level === 'red' && issue.title.includes('nicht mehr zulässige Besetzung')));
  assert.ok(issues.some(issue => issue.level === 'yellow' && issue.title.includes('2. RBN offen')));
});

test('Backend unterscheidet ungültige Monatsparameter von Infrastrukturfehlern', async () => {
  const invalid = await getMonth({ params: { year: '2026', month: '13' }, env: {} });
  assert.equal(invalid.status, 400);
  const missingKv = await getMonth({ params: { year: '2026', month: '07' }, env: {} });
  assert.equal(missingKv.status, 500);
  const bootstrap = await getBootstrap({ env: {} });
  assert.equal(bootstrap.status, 500);
  assert.match((await bootstrap.json()).error, /KV Binding/);
});

test('Excel-Import lädt jeden Zielmonat vor dem Merge', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const loadPosition = source.indexOf('await Promise.all(parsedImports.map(({ imported }) => loadMonth');
  const mergePosition = source.indexOf('const merge = mergeMonthData(targetMonth, imported.monthData)');
  assert.ok(loadPosition >= 0 && mergePosition > loadPosition);
});
''')

write('tests/e2e/bughunt.spec.js', r'''import { test, expect } from '@playwright/test';

function emptyMonth(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return { schemaVersion: 1, year, month, revision: 0, updatedAt: null, days, absences: {}, absenceSources: {}, preferences: {}, overrideLog: [], importLog: [] };
}

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'becker', name: 'Dr. Becker', short: 'Becker', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true }
];

async function installApi(page, { holdFirstPut = false } = {}) {
  const puts = [];
  let releaseFirst = null;
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.XLSX = undefined;' }));
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ok: true, settings: { schemaVersion: 2 }, staff, rbnNames: [] } }));
  await page.route('**/api/month/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'PUT') {
      puts.push(url.pathname);
      if (holdFirstPut && puts.length === 1) await new Promise(resolve => { releaseFirst = resolve; });
      return route.fulfill({ json: { ok: true } });
    }
    const parts = url.pathname.split('/');
    return route.fulfill({ json: { ok: true, month: emptyMonth(Number(parts.at(-2)), Number(parts.at(-1))) } });
  });
  return { puts, release: () => releaseFirst?.() };
}

test('schnelle Doppelnavigation speichert nur den tatsächlich geänderten Ausgangsmonat', async ({ page }) => {
  const api = await installApi(page, { holdFirstPut: true });
  await page.goto('/');
  await page.selectOption('#yearSelect', '2026');
  await page.selectOption('#monthSelect', '7');
  await page.locator('#planTableBody .assignment-btn').first().click();
  await page.locator('#pickerList .picker-item').filter({ hasText: 'Dr. Lurz' }).click();
  await page.locator('#nextMonthBtn').click();
  await page.locator('#nextMonthBtn').click();
  await expect(page.locator('#monthTitle')).toContainText('September 2026');
  await expect.poll(() => api.puts).toEqual(['/api/month/2026/07']);
  api.release();
  await expect(page.locator('#saveStatus')).not.toHaveText('Lädt …');
  await page.waitForTimeout(100);
  expect(api.puts).toEqual(['/api/month/2026/07']);
});

test('Monatsnavigation ergänzt Jahre außerhalb der anfänglichen Auswahlliste ohne leeren Jahreswert', async ({ page }) => {
  await installApi(page);
  await page.goto('/');
  await page.selectOption('#yearSelect', '2031');
  await page.selectOption('#monthSelect', '12');
  await page.locator('#nextMonthBtn').click();
  await expect(page.locator('#yearSelect')).toHaveValue('2032');
  await expect(page.locator('#monthSelect')).toHaveValue('1');
  await expect(page.locator('#monthTitle')).toContainText('Januar 2032');
  await page.selectOption('#monthSelect', '2');
  await expect(page.locator('#monthTitle')).toContainText('Februar 2032');
});
''')

# README: current-state documentation only, no changelog.
replace_once(
    'README.md',
    "Änderungen setzen `dirty` und starten einen Debounce von 1.100 Millisekunden. Beim Speichern:",
    "Änderungen markieren immer den konkreten Monat als unsynchronisiert und starten einen Debounce von 1.100 Millisekunden. Der Marker wird zusätzlich lokal persistiert, sodass ein fehlgeschlagener Save auch nach einem Browserneustart nicht durch einen älteren Serverstand verdrängt wird. Beim Speichern:",
    'README dirty persistence'
)
replace_once(
    'README.md',
    "Ein Speichervorgang merkt sich den Änderungszähler bei seinem Start. Trifft seine Serverantwort erst ein, nachdem bereits eine neuere Änderung vorgenommen wurde, darf der ältere Vorgang den Dirty-Status nicht zurücksetzen. Dadurch bleibt eine nachfolgende, noch nicht persistierte Änderung sichtbar und wird beim nächsten Debounce, Monatswechsel oder Schließen weiterhin gesichert.",
    "Ein Speichervorgang merkt sich den Änderungszähler bei seinem Start. Saves desselben Monats werden strikt serialisiert und mit unveränderlichen Nutzlast-Snapshots übertragen. Ein älterer Request kann damit weder den neueren Serverstand rückwärts überschreiben noch dessen Dirty-Status löschen. Beim Monatswechsel werden ausschließlich tatsächlich markierte Monate gespeichert; ein bloß kurz sichtbarer Zwischenmonat kann nicht versehentlich als leerer Stand übertragen werden.",
    'README serialized saves'
)
replace_once(
    'README.md',
    "Der Import verwendet SheetJS 0.20.3. Monatsblätter werden anhand der deutschen Kurzbezeichnungen erkannt.",
    "Der Import verwendet SheetJS 0.20.3. Monatsblätter werden anhand der deutschen Kurzbezeichnungen erkannt. Vor dem Merge wird jeder erkannte Zielmonat vom Server beziehungsweise aus seinem geschützten lokalen Offlinebestand geladen; dadurch bleiben auch manuelle Werte in zuvor nie geöffneten Monaten erhalten.",
    'README Excel preload'
)
replace_once(
    'README.md',
    "JSON ist das verlustarme Sicherungsformat für Einstellungen, Personal, Monatsdaten, Abwesenheiten, Wünsche und Protokolle. Bei erreichbarem Server wird der serverseitige Gesamtstand verwendet; im Offlinefall kann der lokal verfügbare Zustand gesichert werden.",
    "JSON ist das verlustarme Sicherungsformat für Einstellungen, Personal, Monatsdaten, Abwesenheiten, Wünsche und Protokolle. Ein erreichbarer Serverexport bildet die Basis; sämtliche lokal neueren oder noch nicht synchronisierten Monate werden anschließend darübergelegt. Im Offlinefall werden alle auffindbaren lokalen Monatsstände einbezogen, nicht nur die gerade im Arbeitsspeicher geöffneten Monate.",
    'README backup overlay'
)

# Release token for every shipped browser import, shell asset and documentation reference.
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts or path.name == 'package-lock.json':
        continue
    if path.suffix.lower() not in {'.js', '.html', '.md', '.webmanifest', '.css'}:
        continue
    text = path.read_text(encoding='utf-8')
    if '20260731.2' in text:
        path.write_text(text.replace('20260731.2', '20260731.3'), encoding='utf-8')

# Final invariants of the patch itself.
required = {
    'js/state.js': ['persistDirtyState', 'saveChains', 'DIRTY_MONTHS_KEY', 'buildBackupPayload'],
    'js/app.js': ['await Promise.all(parsedImports.map', 'ensureYearOption', 'Lokale Änderungen noch nicht synchronisiert'],
    'js/rules-reporting.js': ['2. RBN ohne gültigen Trigger', 'nicht mehr zulässige Besetzung'],
    'tests/bughunt-regressions.test.js': ['strikt seriell', 'Offline-Marker'],
}
for filename, phrases in required.items():
    content = Path(filename).read_text(encoding='utf-8')
    for phrase in phrases:
        if phrase not in content:
            raise SystemExit(f'missing {phrase!r} in {filename}')
