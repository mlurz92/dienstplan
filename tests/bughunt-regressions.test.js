import test from 'node:test';
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
  getMonthData(2026, 7).days['2026-07-01'].bd = 'becker';
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

test('reiner Monats-JSON-Import verwendet keine nicht importierte Bootstrap-Funktion', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /else saveLocalBootstrap\(\)/);
  assert.match(source, /if \(importsBootstrap\) markBootstrapDirty\(\)/);
});

test('Dirty-Monate werden nach Neustart vor dem automatischen Sync aus dem lokalen Snapshot rekonstruiert', async () => {
  globalThis.localStorage = new MemoryStorage();
  const local = createEmptyMonth(2026, 6);
  local.days['2026-06-15'].bd = 'becker';
  localStorage.setItem('dienstplanrad:month:2026-06', JSON.stringify(local));
  localStorage.setItem('dienstplanrad:dirty-months', JSON.stringify(['2026-06']));
  const bodies = [];
  globalThis.fetch = async (_url, options) => { bodies.push(JSON.parse(options.body)); return okResponse(); };
  const { persistDirtyState } = await freshState('restart-before-sync');
  await persistDirtyState();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].days['2026-06-15'].bd, 'becker');
});

test('defekter Dirty-Snapshot wird verworfen statt als leerer Monat synchronisiert', async () => {
  globalThis.localStorage = new MemoryStorage();
  localStorage.setItem('dienstplanrad:month:2026-06', '{defekt');
  localStorage.setItem('dienstplanrad:dirty-months', JSON.stringify(['2026-06']));
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return okResponse(); };
  const { persistDirtyState, state } = await freshState('corrupt-restart');
  await persistDirtyState();
  assert.equal(fetches, 0);
  assert.equal(state.dirty, false);
  assert.equal(localStorage.getItem('dienstplanrad:dirty-months'), null);
});

test('Serverexport gewinnt gegen sauberen lokalen Cache, Dirty-Daten behalten Vorrang', async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.fetch = async () => okResponse();
  const cached = createEmptyMonth(2026, 7);
  cached.days['2026-07-01'].bd = 'lurz';
  localStorage.setItem('dienstplanrad:month:2026-07', JSON.stringify(cached));
  const module = await freshState('backup-precedence');
  module.state.settings = { schemaVersion: 2 };
  const server = createEmptyMonth(2026, 7);
  server.days['2026-07-01'].bd = 'becker';
  const serverPayload = { settings: { schemaVersion: 7 }, staff: DEFAULT_STAFF, rbnNames: ['Server'], months: [['2026-07', server]] };
  const cleanBackup = module.buildBackupPayload(serverPayload);
  assert.equal(cleanBackup.settings.schemaVersion, 7);
  assert.deepEqual(cleanBackup.rbnNames, ['Server']);
  assert.equal(new Map(cleanBackup.months).get('2026-07').days['2026-07-01'].bd, 'becker');
  module.state.settings = { schemaVersion: 9 };
  module.markBootstrapDirty();
  module.getMonthData(2026, 7).days['2026-07-01'].bd = 'lurz';
  module.markMonthDirty(2026, 7);
  const dirtyBackup = module.buildBackupPayload(serverPayload);
  assert.equal(dirtyBackup.settings.schemaVersion, 9);
  assert.equal(new Map(dirtyBackup.months).get('2026-07').days['2026-07-01'].bd, 'lurz');
});

test('Excel-Merge ist nur mit bestätigtem Serverstand oder bewusstem Dirty-Lokalstand zulässig', async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.fetch = async () => okResponse();
  const module = await freshState('excel-merge-safety');
  const month = createEmptyMonth(2026, 8);
  module.setMonthData(2026, 8, month, 'fallback');
  assert.equal(module.isMonthMergeSafe(2026, 8), false);
  module.setMonthData(2026, 8, month, 'local');
  assert.equal(module.isMonthMergeSafe(2026, 8), false);
  module.markMonthDirty(2026, 8);
  assert.equal(module.isMonthMergeSafe(2026, 8), true);
  module.markMonthSynced(2026, 8);
  assert.equal(module.isMonthMergeSafe(2026, 8), true);
});

test('Excel-Import bricht vor dem Merge ab, wenn ein Zielmonat nicht verlässlich geladen wurde', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const guard = source.indexOf('const unsafeTargets = parsedImports.filter');
  const merge = source.indexOf('const merge = mergeMonthData(targetMonth, imported.monthData)');
  assert.ok(guard >= 0 && merge > guard);
  assert.match(source, /Excel-Import abgebrochen – Zielmonat nicht verlässlich geladen/);
});

