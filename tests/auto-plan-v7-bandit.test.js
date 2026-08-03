import test from 'node:test';
import assert from 'node:assert/strict';

import { selectAdaptiveOperator } from '../js/auto-planner-optimizer.js';

test('bandit explores an operator that has not been measured', () => {
  const operators = ['fast', 'slow', 'new'];
  const learning = new Map([
    ['fast', { uses: 12, reward: 48, costMs: 120 }],
    ['slow', { uses: 8, reward: 32, costMs: 800 }],
    ['new', { uses: 0, reward: 0, costMs: 0 }]
  ]);

  assert.equal(selectAdaptiveOperator(() => 0, operators, learning), 'new');
});

test('bandit prefers quality gain per compute cost after exploration', () => {
  const operators = ['fast', 'slow'];
  const learning = new Map([
    ['fast', { uses: 20, reward: 80, costMs: 200 }],
    ['slow', { uses: 20, reward: 80, costMs: 2000 }]
  ]);

  assert.equal(selectAdaptiveOperator(() => 0.5, operators, learning), 'fast');
});

test('bandit retains an exploration bonus for underused operators', () => {
  const operators = ['known', 'underused'];
  const learning = new Map([
    ['known', { uses: 100, reward: 100, costMs: 1000 }],
    ['underused', { uses: 1, reward: 1, costMs: 10 }]
  ]);

  assert.equal(selectAdaptiveOperator(() => 0.5, operators, learning), 'underused');
});
