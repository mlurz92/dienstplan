import {
  createEmptyMonth, DEFAULT_SETTINGS, DEFAULT_STAFF, MONTH_NAMES, normalizeMonthData,
  normalizeRbnNames, normalizeSettings, normalizeStaffList
} from './defaults.js?v=20260730.7';
import { api } from './api.js?v=20260730.7';

const LOCAL_KEY_PREFIX = 'dienstplanrad:';

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
  saveTimer: null,
  serverReady: false,
  currentBatchMode: 'absence',
  currentPicker: null,
  cachedBootstrap: null
};

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
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
  localStorage.setItem(`${LOCAL_KEY_PREFIX}month:${key}`, JSON.stringify(normalized));
  return normalized;
}

export function readLocalMonth(year, month) {
  const raw = localStorage.getItem(`${LOCAL_KEY_PREFIX}month:${monthKey(year, month)}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveLocalBootstrap() {
  localStorage.setItem(`${LOCAL_KEY_PREFIX}bootstrap`, JSON.stringify({
    settings: state.settings,
    staff: state.staff,
    rbnNames: state.rbnNames
  }));
}

export function readLocalBootstrap() {
  const raw = localStorage.getItem(`${LOCAL_KEY_PREFIX}bootstrap`);
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

export async function bootstrapState() {
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

export async function loadMonth(year, month) {
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
  const previousReady = state.serverReady;
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const requestedMonths = new Map();
  const addRequest = (requestedYear, requestedMonth) => requestedMonths.set(monthKey(requestedYear, requestedMonth), [requestedYear, requestedMonth]);
  addRequest(prev.getFullYear(), prev.getMonth() + 1);
  addRequest(next.getFullYear(), next.getMonth() + 1);
  for (let historicalMonth = 1; historicalMonth < month; historicalMonth += 1) addRequest(year, historicalMonth);
  const tasks = [...requestedMonths.values()].map(async ([requestedYear, requestedMonth]) => {
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

export function markMonthDirty(year, month) {
  const key = monthKey(year, month);
  const version = ++state.dirtyVersion;
  state.dirtyMonths.set(key, version);
  state.dirty = true;
  return version;
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
  const key = monthKey(year, monthNumber);
  const saveVersion = state.dirtyMonths.get(key) ?? state.dirtyVersion;
  const month = getMonthData(year, monthNumber);
  month.updatedAt = new Date().toISOString();
  month.revision = (month.revision || 0) + 1;
  setMonthData(year, monthNumber, month);
  state.saveStatus = 'saving';
  try {
    await api.saveMonth(year, monthNumber, getMonthData(year, monthNumber));
    if (state.dirtyMonths.get(key) === saveVersion) state.dirtyMonths.delete(key);
    state.dirty = state.dirtyMonths.size > 0;
    state.saveStatus = state.dirty ? 'pending' : 'saved';
    state.serverReady = true;
    return { ok: true, current: !state.dirtyMonths.has(key), pending: state.dirty };
  } catch (error) {
    if (!state.dirtyMonths.has(key)) state.dirtyMonths.set(key, saveVersion);
    state.dirty = true;
    state.saveStatus = 'offline';
    state.serverReady = false;
    return { ok: false, current: false, pending: true, error };
  }
}

export function getMonthLabel(year = state.currentYear, month = state.currentMonth) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
