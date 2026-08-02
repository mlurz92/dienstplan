import {
  createEmptyMonth, DEFAULT_SETTINGS, DEFAULT_STAFF, MONTH_NAMES, normalizeBackupPayload,
  normalizeMonthData, normalizeRbnNames, normalizeSettings, normalizeStaffList
} from './defaults.js?v=20260801.11';
import { api } from './api.js?v=20260801.11';

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
        const parsed = parseMonthKey(key);
        const raw = parsed ? storageGet(`${LOCAL_KEY_PREFIX}month:${key}`) : null;
        if (!parsed || !raw) continue;
        try {
          state.months.set(key, normalizeMonthData(parsed[0], parsed[1], JSON.parse(raw)));
          state.dirtyMonths.set(key, ++state.dirtyVersion);
          state.monthSources.set(key, 'local');
        } catch {
          // Defekte lokale Inhalte dürfen niemals als leeres Gerüst
          // automatisch zum Server synchronisiert werden.
        }
      }
    }
    persistDirtyMarkers();
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

/**
 * Lokale Sicherung eines Monats.
 *
 * Eigene Änderungen gehen sofort auf die Platte – sie sind das Ausfallnetz
 * gegen einen Serverfehler und dürfen keine Sekunde ungesichert bleiben.
 *
 * Serverstände dagegen werden gebündelt geschrieben. Ein Monatswechsel lädt bis
 * zu dreizehn Monate vor; jeder davon kostete zuvor ein vollständiges
 * `JSON.stringify` samt Speicherzugriff mitten in der laufenden Übergangs-
 * animation. Vor jedem Auslesen, jedem Serverschreibvorgang und beim Verlassen
 * der Seite wird die Sammlung ausdrücklich geleert.
 */
const pendingLocalWrites = new Map();
let localWriteHandle = null;

export function flushLocalMonthWrites() {
  if (localWriteHandle !== null) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(localWriteHandle);
    else clearTimeout(localWriteHandle);
    localWriteHandle = null;
  }
  for (const [key, value] of pendingLocalWrites) storageSet(`${LOCAL_KEY_PREFIX}month:${key}`, JSON.stringify(value));
  pendingLocalWrites.clear();
}

function scheduleLocalMonthWrite(key, value) {
  pendingLocalWrites.set(key, value);
  if (localWriteHandle !== null) return;
  const run = () => { localWriteHandle = null; flushLocalMonthWrites(); };
  localWriteHandle = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 500 })
    : setTimeout(run, 120);
}

export function setMonthData(year, month, payload, source = null) {
  const normalized = normalizeMonthData(year, month, payload);
  const key = monthKey(year, month);
  state.months.set(key, normalized);
  if (source) state.monthSources.set(key, source);
  if (source === 'local' || state.dirtyMonths.has(key)) {
    pendingLocalWrites.delete(key);
    storageSet(`${LOCAL_KEY_PREFIX}month:${key}`, JSON.stringify(normalized));
  } else {
    scheduleLocalMonthWrite(key, normalized);
  }
  return normalized;
}

export function readLocalMonth(year, month) {
  flushLocalMonthWrites();
  const raw = storageGet(`${LOCAL_KEY_PREFIX}month:${monthKey(year, month)}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function readAllLocalMonths() {
  flushLocalMonthWrites();
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

export function isMonthMergeSafe(year, month) {
  restoreSyncState();
  const key = monthKey(year, month);
  return state.monthSources.get(key) === 'server' || state.dirtyMonths.has(key);
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

/**
 * Gibt den Hauptthread frei, bevor der nächste Monat übernommen wird.
 *
 * `scheduler.yield()` reiht den Rest hinter anstehende Eingaben und Frames ein;
 * ohne diese Schnittstelle genügt ein Leerlauf- bzw. Makrotask-Sprung.
 */
function yieldToBrowser() {
  if (typeof scheduler === 'object' && typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof requestIdleCallback === 'function') return new Promise(resolve => requestIdleCallback(() => resolve(), { timeout: 120 }));
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Lädt die Nachbarmonate und den bisherigen Jahresverlauf vor.
 *
 * Abgerufen wird parallel, **übernommen aber einzeln**: Jede Übernahme
 * normalisiert einen vollständigen Monat. Dreizehn Monate in einem Zug
 * blockierten den Hauptthread gemessen mehrere hundert Millisekunden – genau
 * während der laufenden Wechselanimation. Zwischen zwei Übernahmen wird deshalb
 * abgegeben, sodass Bewegung und Eingaben durchlaufen können.
 */
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

  const pending = [...requestedMonths.values()]
    .filter(([requestedYear, requestedMonth]) => !state.dirtyMonths.has(monthKey(requestedYear, requestedMonth)))
    .map(([requestedYear, requestedMonth]) => ({
      requestedYear,
      requestedMonth,
      request: api.getMonth(requestedYear, requestedMonth).then(data => data?.month || null, () => null)
    }));

  for (const { requestedYear, requestedMonth, request } of pending) {
    const payload = await request;
    await yieldToBrowser();
    if (payload) {
      setMonthData(requestedYear, requestedMonth, payload, 'server');
      continue;
    }
    const local = readLocalMonth(requestedYear, requestedMonth);
    if (local) setMonthData(requestedYear, requestedMonth, local, 'local');
    else setMonthData(requestedYear, requestedMonth, createEmptyMonth(requestedYear, requestedMonth), 'fallback');
  }
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

  flushLocalMonthWrites();
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
  let hasServerSnapshot = false;
  try {
    if (serverPayload) {
      server = normalizeBackupPayload(serverPayload, { strict: false });
      hasServerSnapshot = true;
    }
  } catch {
    server = {};
  }

  const months = new Map(server.months || []);
  for (const [key, month] of readAllLocalMonths()) {
    if (!hasServerSnapshot || !months.has(key) || state.dirtyMonths.has(key)) months.set(key, month);
  }
  for (const [key, month] of state.months) {
    if (!hasServerSnapshot || !months.has(key) || state.dirtyMonths.has(key)) {
      const parsed = parseMonthKey(key);
      if (parsed) months.set(key, normalizeMonthData(parsed[0], parsed[1], month));
    }
  }

  const preferServerBootstrap = hasServerSnapshot && !state.bootstrapDirty;
  return {
    ok: true,
    settings: structuredClone(preferServerBootstrap && server.settings ? server.settings : state.settings),
    staff: structuredClone(preferServerBootstrap && server.staff ? server.staff : state.staff),
    rbnNames: structuredClone(preferServerBootstrap && server.rbnNames ? server.rbnNames : state.rbnNames),
    months: [...months.entries()].sort(([left], [right]) => left.localeCompare(right))
  };
}

export function getMonthLabel(year = state.currentYear, month = state.currentMonth) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
