import { createEmptyMonth, DEFAULT_SETTINGS, DEFAULT_STAFF, MONTH_NAMES } from './defaults.js?v=20260730.4';
import { api } from './api.js?v=20260730.4';

const LOCAL_KEY_PREFIX = 'dienstplanrad:';

export const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  staff: structuredClone(DEFAULT_STAFF),
  rbnNames: [],
  months: new Map(),
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  saveStatus: 'loading',
  dirty: false,
  saveTimer: null,
  serverReady: false,
  currentBatchMode: 'absence',
  currentPicker: null,
  cachedBootstrap: null
};
export function monthKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }
export function getMonthData(year, month) { const key=monthKey(year,month); if(!state.months.has(key)) state.months.set(key,createEmptyMonth(year,month)); return state.months.get(key); }
export function setMonthData(year, month, payload) { state.months.set(monthKey(year,month),payload||createEmptyMonth(year,month)); localStorage.setItem(`${LOCAL_KEY_PREFIX}month:${monthKey(year,month)}`,JSON.stringify(state.months.get(monthKey(year,month)))); }
export function readLocalMonth(year,month) { const raw=localStorage.getItem(`${LOCAL_KEY_PREFIX}month:${monthKey(year,month)}`); if(!raw)return null; try{return JSON.parse(raw)}catch{return null} }
export function saveLocalBootstrap(){localStorage.setItem(`${LOCAL_KEY_PREFIX}bootstrap`,JSON.stringify({settings:state.settings,staff:state.staff,rbnNames:state.rbnNames}));}
export function readLocalBootstrap(){const raw=localStorage.getItem(`${LOCAL_KEY_PREFIX}bootstrap`);if(!raw)return null;try{return JSON.parse(raw)}catch{return null}}
export async function bootstrapState(){try{const data=await api.bootstrap();state.settings=data.settings||structuredClone(DEFAULT_SETTINGS);state.staff=data.staff||structuredClone(DEFAULT_STAFF);state.rbnNames=Array.isArray(data.rbnNames)?data.rbnNames:[];state.cachedBootstrap=data;state.serverReady=true;saveLocalBootstrap();return true}catch{state.serverReady=false;return false}}
export async function loadMonth(year,month){try{const data=await api.getMonth(year,month);setMonthData(year,month,data.month||createEmptyMonth(year,month));state.serverReady=true;return getMonthData(year,month)}catch{const local=readLocalMonth(year,month);if(local){setMonthData(year,month,local);state.serverReady=false;return local}const empty=createEmptyMonth(year,month);setMonthData(year,month,empty);state.serverReady=false;return empty}}
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
    try { const data = await api.getMonth(requestedYear, requestedMonth); setMonthData(requestedYear, requestedMonth, data.month || createEmptyMonth(requestedYear, requestedMonth)); }
    catch { const local = readLocalMonth(requestedYear, requestedMonth); if (local) setMonthData(requestedYear, requestedMonth, local); }
  });
  await Promise.allSettled(tasks);
  state.serverReady = previousReady;
}
export function scheduleSave(saveFn){state.dirty=true;clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveFn,1100)}
export async function persistCurrentMonth(){return persistMonth(state.currentYear,state.currentMonth)}
export async function persistMonth(year,monthNumber){const month=getMonthData(year,monthNumber);month.updatedAt=new Date().toISOString();month.revision=(month.revision||0)+1;setMonthData(year,monthNumber,month);state.saveStatus='saving';try{await api.saveMonth(year,monthNumber,month);state.saveStatus='saved';state.serverReady=true;state.dirty=false}catch{state.saveStatus='offline';state.serverReady=false}}
export function getMonthLabel(year=state.currentYear,month=state.currentMonth){return `${MONTH_NAMES[month-1]} ${year}`}
