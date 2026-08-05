import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyMonth, DEFAULT_STAFF } from '../js/defaults.js';
import { buildStats, computeWeekendEquivalent, evaluateCandidate, getRoleProperties, setAbsence, setAssignment } from '../js/rules.js';

function planningState(year = 2026, month = 7) {
  const data = createEmptyMonth(year, month);
  return {
    data,
    state: {
      staff: structuredClone(DEFAULT_STAFF),
      months: new Map([[`${year}-${String(month).padStart(2, '0')}`, data]]),
      currentYear: year,
      currentMonth: month
    }
  };
}

test('createEmptyMonth creates exactly the valid leap-year days', () => {
  assert.equal(Object.keys(createEmptyMonth(2028, 2).days).length, 29);
  assert.equal(Object.keys(createEmptyMonth(2027, 2).days).length, 28);
});

test('time-dependent promotion changes HG and Saturday-BD eligibility', () => {
  assert.equal(getRoleProperties(DEFAULT_STAFF.find(person => person.id === 'elhouba'), '2026-09-21').canHg, false);
  assert.equal(getRoleProperties(DEFAULT_STAFF.find(person => person.id === 'elhouba'), '2026-09-22').canHg, true);
});

test('absence, same-day double assignment and personal restrictions become red conflicts', () => {
  const { state, data } = planningState();
  setAbsence(data, 'lurz', '2026-07-01', 'urlaub');
  assert.equal(evaluateCandidate({ state, monthData: data, dateIso: '2026-07-01', role: 'bd', staffId: 'lurz' }).level, 'red');
  setAssignment(data, '2026-07-02', 'hg', 'martin');
  assert.equal(evaluateCandidate({ state, monthData: data, dateIso: '2026-07-02', role: 'bd', staffId: 'martin' }).level, 'red');
  assert.equal(evaluateCandidate({ state, monthData: data, dateIso: '2026-07-05', role: 'hg', staffId: 'polednia' }).level, 'red');
});

test('weekend equivalent counts BD weekends once and HG-only weekends as half', () => {
  const month = createEmptyMonth(2026, 7);
  setAssignment(month, '2026-07-03', 'bd', 'lurz');
  setAssignment(month, '2026-07-05', 'hg', 'lurz');
  setAssignment(month, '2026-07-10', 'hg', 'lurz');
  assert.equal(computeWeekendEquivalent(month, 'lurz'), 1.5);
});

test('statistics honor activation dates, role transitions and remaining targets', () => {
  const { state, data } = planningState(2026, 9);
  setAssignment(data, '2026-09-01', 'bd', 'lurz');
  const september = buildStats(state, data);
  assert.equal(september.some(item => item.id === 'hellmann'), false);
  assert.equal(september.find(item => item.id === 'lurz').bdRemaining, 3);
  assert.equal(september.find(item => item.id === 'elhouba').roleLabel, 'AA → FA');

  const october = createEmptyMonth(2026, 10);
  state.months.set('2026-10', october);
  const octoberStats = buildStats(state, october);
  assert.equal(octoberStats.some(item => item.id === 'hellmann'), true);
  assert.equal(octoberStats.find(item => item.id === 'elhouba').roleLabel, 'FA');
});