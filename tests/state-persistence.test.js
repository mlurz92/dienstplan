import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

test('ein älterer Server-Save löscht keinen danach entstandenen Dirty-Stand', async () => {
  globalThis.localStorage = new MemoryStorage();

  let releaseFetch;
  globalThis.fetch = () => new Promise(resolve => {
    releaseFetch = () => resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  });

  const module = await import(`../js/state.js?race=${Date.now()}`);
  const { state, getMonthData, persistMonth, scheduleSave } = module;
  state.months.clear();
  state.currentYear = 2026;
  state.currentMonth = 7;
  state.dirty = false;
  state.dirtyVersion = 0;

  getMonthData(2026, 7).days['2026-07-01'].bd = 'lurz';
  scheduleSave(() => {});
  clearTimeout(state.saveTimer);
  state.saveTimer = null;

  const save = persistMonth(2026, 7);
  const versionAtSave = state.dirtyVersion;

  // Neue Änderung, während der ältere Serveraufruf noch aussteht.
  scheduleSave(() => {});
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  assert.equal(state.dirtyVersion, versionAtSave + 1);

  releaseFetch();
  await save;

  assert.equal(state.dirty, true);
  assert.ok(localStorage.getItem('dienstplanrad:month:2026-07'));
});
