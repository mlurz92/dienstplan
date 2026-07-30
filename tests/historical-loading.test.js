import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyMonth } from '../js/defaults.js';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

const { api } = await import('../js/api.js?v=20260730.3');
const { state, warmAdjacentMonths } = await import('../js/state.js');

test('Vorladen umfasst Nachbarmonate und lückenlosen Jahresverlauf bis zum Vormonat', async () => {
  const originalGetMonth = api.getMonth;
  const calls = [];
  state.months.clear();
  state.serverReady = true;

  api.getMonth = async (year, month) => {
    calls.push([year, month]);
    return { month: createEmptyMonth(year, month) };
  };

  try {
    await warmAdjacentMonths(2026, 7);
  } finally {
    api.getMonth = originalGetMonth;
  }

  assert.deepEqual(calls.sort((a, b) => a[0] - b[0] || a[1] - b[1]), [
    [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 8]
  ]);
  for (const month of [1, 2, 3, 4, 5, 6, 8]) {
    assert.ok(state.months.has(`2026-${String(month).padStart(2, '0')}`));
  }
  assert.equal(state.serverReady, true);
});
