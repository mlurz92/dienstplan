import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

process.env.TZ = 'Europe/Berlin';

const planner = await import('../js/auto-planner.js');
const { buildBooleanAutoPlanModel } = await import('../js/auto-plan-model-v9-5.js');
const { DEFAULT_STAFF } = await import('../js/defaults.js');

function emptyMonth(dates) {
  return {
    schemaVersion: 1,
    year: Number(dates[0].slice(0, 4)),
    month: Number(dates[0].slice(5, 7)),
    revision: 0,
    updatedAt: null,
    days: Object.fromEntries(dates.map(dateIso => [dateIso, { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' }])),
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function stateWith(monthData, staff) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData]]),
    staff: structuredClone(staff),
    settings: { autoPlan: {} },
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

function semanticSignature(model) {
  const variableName = index => model.variables[index]?.name || `missing:${index}`;
  return JSON.stringify({
    assignments: model.assignmentVariables
      .map(variable => [variable.name, variable.slot.key, variable.staffId])
      .sort((left, right) => left[0].localeCompare(right[0])),
    constraints: model.constraints
      .map(constraint => ({
        id: constraint.id,
        group: constraint.group,
        lb: constraint.lb,
        ub: constraint.ub,
        terms: constraint.terms
          .map(([index, coefficient]) => [variableName(index), coefficient])
          .sort((left, right) => left[0].localeCompare(right[0]))
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    phases: model.phaseOrder
  });
}

const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'];
const baseStaff = structuredClone(DEFAULT_STAFF);

test('Property: Personalreihenfolge besitzt keine mathematische Semantik', () => {
  const baseMonth = emptyMonth(dates);
  const baseState = stateWith(baseMonth, baseStaff);
  const baseConfig = planner.normalizeV95Config(baseState, baseMonth, {});
  const expected = semanticSignature(buildBooleanAutoPlanModel({
    state: baseState,
    monthData: baseMonth,
    baseline: baseMonth,
    config: baseConfig
  }));

  fc.assert(fc.property(
    fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
      minLength: baseStaff.length,
      maxLength: baseStaff.length
    }),
    keys => {
      const permuted = structuredClone(baseStaff)
        .map((person, index) => ({ person, key: keys[index], index }))
        .sort((left, right) => left.key - right.key || right.index - left.index)
        .map(entry => entry.person);
      const monthData = emptyMonth(dates);
      const state = stateWith(monthData, permuted);
      const config = planner.normalizeV95Config(state, monthData, {});
      const actual = semanticSignature(buildBooleanAutoPlanModel({
        state,
        monthData,
        baseline: monthData,
        config
      }));
      assert.equal(actual, expected);
    }
  ), { seed: 9501, numRuns: 40 });
});

test('Property: jede BD-Obergrenze zählt ausschließlich BD der betroffenen Person', () => {
  const person = baseStaff.find(candidate => candidate.id === 'lurz') || baseStaff[0];
  fc.assert(fc.property(fc.integer({ min: 0, max: 8 }), maximum => {
    const monthData = emptyMonth(dates);
    const state = stateWith(monthData, baseStaff);
    const config = planner.normalizeV95Config(state, monthData, {
      staffLimits: { [person.id]: { maxBd: maximum, maxHg: null, maxTotal: null } }
    });
    const model = buildBooleanAutoPlanModel({ state, monthData, baseline: monthData, config });
    const constraint = model.constraints.find(item => item.id === `monthly-bd-limit:${person.id}`);
    assert.ok(constraint);
    assert.equal(constraint.ub, maximum);
    for (const [index, coefficient] of constraint.terms) {
      const variable = model.variables[index];
      assert.equal(coefficient, 1);
      assert.equal(variable.kind, 'assignment');
      assert.equal(variable.staffId, person.id);
      assert.equal(variable.slot.role, 'bd');
    }
  }), { seed: 9502, numRuns: 30 });
});

test('Property: Split-Wochenendgewicht wirkt linear und nur auf binäre Indikatoren', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), weight => {
    const monthData = emptyMonth(['2026-07-03', '2026-07-04', '2026-07-05']);
    const state = stateWith(monthData, baseStaff);
    const config = planner.normalizeV95Config(state, monthData, { v95SplitWeekendWeight: weight });
    const model = buildBooleanAutoPlanModel({ state, monthData, baseline: monthData, config });
    assert.ok(model.components.splitWeekend.terms.length > 0);
    for (const [index, coefficient] of model.components.splitWeekend.terms) {
      const variable = model.variables[index];
      assert.equal(coefficient, weight);
      assert.equal(variable.kind, 'auxiliary');
      assert.equal(variable.lb, 0);
      assert.equal(variable.ub, 1);
    }
  }), { seed: 9503, numRuns: 30 });
});
