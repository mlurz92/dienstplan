import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loader = await import('../js/auto-plan-solver-loader-v9-5.js');
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

function linearExpression(value = 0) {
  return {
    value,
    times(coefficient) { return linearExpression(this.value * coefficient); },
    plus(other) { return linearExpression(this.value + other.value); }
  };
}

class FakeModel {
  newIntVar(lb, ub, name) {
    return {
      lb,
      ub,
      name,
      value: lb,
      times(coefficient) { return linearExpression(this.value * coefficient); }
    };
  }
  addLinearConstraint(expression, lb, ub) {
    this.constraint = { expression, lb, ub };
    return this.constraint;
  }
  minimize(expression) {
    this.objective = expression;
  }
  addHint(variable, value) {
    variable.value = value;
  }
}

test('der Solverlader verlangt kein document und erkennt die Node-Laufzeit korrekt', async () => {
  const environment = loader.v95SolverEnvironment();
  assert.equal(environment.webAssembly, true);
  assert.equal(environment.document, false);
  assert.equal(environment.worker, false);

  const text = await source('../js/auto-plan-solver-loader-v9-5.js');
  assert.doesNotMatch(text, /typeof globalThis\.document === ['"]undefined['"]/);
  assert.match(text, /typeof WebAssembly !== ['"]object['"]/);
});

test('Factory-Bindungen werden vor dem allgemeinen Konstruktorzweig normalisiert', async () => {
  let factoryCalls = 0;
  let constructorCalls = 0;
  function SolverFacade() {
    constructorCalls += 1;
    throw new Error('Konstruktorzweig darf für Factory-Bindung nicht laufen.');
  }
  SolverFacade.create = async () => {
    factoryCalls += 1;
    return {
      async solve() {
        return {
          status: 'OPTIMAL',
          objectiveValue: 1,
          bestObjectiveBound: 1,
          value: variable => variable.value
        };
      },
      delete() {}
    };
  };

  const api = loader.normalizeV95SolverApi({ CpModel: FakeModel, CpSolver: SolverFacade }, 'factory');
  assert.ok(api);
  await loader.selfTestV95Solver(api);
  assert.equal(factoryCalls, 1);
  assert.equal(constructorCalls, 0);
});

test('Konstruktor-Bindungen bleiben als zweiter kompatibler API-Pfad verfügbar', async () => {
  let constructorCalls = 0;
  class ConstructorSolver {
    constructor() { constructorCalls += 1; }
    async solve() { return 'OPTIMAL'; }
    statusName(status) { return status; }
    objectiveValue() { return 1; }
    bestObjectiveBound() { return 1; }
    value(variable) { return variable.value; }
    delete() {}
  }
  const api = loader.normalizeV95SolverApi({ CpModel: FakeModel, CpSolver: ConstructorSolver }, 'constructor');
  assert.ok(api);
  await loader.selfTestV95Solver(api);
  assert.equal(constructorCalls, 1);
});

test('Ladereihenfolge ist versionsfixiert und priorisiert das lokale Worker-Asset', () => {
  assert.equal(loader.V95_SOLVER_LOAD_ORDER[0].source, 'local');
  assert.equal(loader.V95_SOLVER_LOAD_ORDER[0].url, '/vendor/or-tools-wasm/cp-sat/index.js');
  assert.deepEqual(
    loader.V95_SOLVER_LOAD_ORDER.map(candidate => candidate.version),
    ['0.9.1', '0.9.1', '1.0.0']
  );
});
