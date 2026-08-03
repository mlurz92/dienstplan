import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, normalizeSettings } from '../js/defaults.js';
import { createAutoPlanExecutionPlan } from '../js/auto-plan-runner.js';

test('v7 settings defaults are complete and safe', () => {
  const settings = normalizeSettings(null);

  assert.deepEqual(settings, DEFAULT_SETTINGS);
  assert.equal(settings.schemaVersion, 4);
  assert.deepEqual(settings.appearance, {
    density: 'comfortable',
    motion: 'system',
    richTooltips: true,
    monthColors: 'spectrum',
    weekendEmphasis: true,
    ambientBackdrop: true
  });
  assert.deepEqual(settings.workflow, {
    autoSaveDelayMs: 1100,
    algorithmCommentary: true,
    studioVisualizer: true
  });
  assert.deepEqual(settings.autoPlan, {
    performanceProfile: 'adaptive',
    searchIntensity: 'deep',
    optimizationFocus: 'balanced',
    timeBudgetSeconds: 120,
    allowRedFallback: true,
    maxRedViolations: null,
    perfectionEnabled: true,
    parallelSearches: null,
    certificationRounds: 4,
    portfolioDiversity: true
  });
});

test('legacy settings migrate without losing explicit values', () => {
  const settings = normalizeSettings({
    schemaVersion: 2,
    appearance: { density: 'compact', motion: 'reduced', richTooltips: false },
    autoPlan: {
      performanceProfile: 'responsive',
      searchIntensity: 'standard',
      optimizationFocus: 'wishes',
      timeBudgetSeconds: 45,
      allowRedFallback: false,
      maxRedViolations: 0,
      perfectionEnabled: false,
      parallelSearches: 2
    }
  });

  assert.equal(settings.schemaVersion, 4);
  assert.equal(settings.appearance.density, 'compact');
  // Ein Stand ohne die v8-Gruppen erhält deren Vorschlagswerte, ohne dass
  // ausdrücklich gesetzte Altwerte verlorengehen.
  assert.equal(settings.appearance.monthColors, 'spectrum');
  assert.equal(settings.workflow.autoSaveDelayMs, 1100);
  assert.equal(settings.autoPlan.certificationRounds, 4);
  assert.equal(settings.appearance.motion, 'reduced');
  assert.equal(settings.appearance.richTooltips, false);
  assert.equal(settings.autoPlan.performanceProfile, 'responsive');
  assert.equal(settings.autoPlan.timeBudgetSeconds, 45);
  assert.equal(settings.autoPlan.maxRedViolations, 0);
  assert.equal(settings.autoPlan.parallelSearches, 2);
});

test('non-strict settings normalization bounds invalid numeric values', () => {
  const settings = normalizeSettings({
    appearance: { density: 'unknown', motion: 'hyper' },
    autoPlan: {
      performanceProfile: 'turbo',
      searchIntensity: 'impossible',
      optimizationFocus: 'random',
      timeBudgetSeconds: 99999,
      maxRedViolations: -3,
      parallelSearches: 99
    }
  });

  assert.equal(settings.appearance.density, DEFAULT_SETTINGS.appearance.density);
  assert.equal(settings.appearance.motion, DEFAULT_SETTINGS.appearance.motion);
  assert.equal(settings.autoPlan.performanceProfile, DEFAULT_SETTINGS.autoPlan.performanceProfile);
  assert.equal(settings.autoPlan.searchIntensity, DEFAULT_SETTINGS.autoPlan.searchIntensity);
  assert.equal(settings.autoPlan.optimizationFocus, DEFAULT_SETTINGS.autoPlan.optimizationFocus);
  assert.equal(settings.autoPlan.timeBudgetSeconds, 900);
  assert.equal(settings.autoPlan.maxRedViolations, null);
  assert.equal(settings.autoPlan.parallelSearches, 8);
});

test('strict settings normalization rejects invalid enum values', () => {
  assert.throws(
    () => normalizeSettings({ appearance: { density: 'tiny' } }, { strict: true }),
    /settings\.appearance\.density/
  );
});

test('adaptive execution plan protects memory-constrained devices', () => {
  const plan = createAutoPlanExecutionPlan({
    hardwareConcurrency: 8,
    deviceMemory: 2,
    openSlots: 62,
    profileCount: 3,
    performanceProfile: 'adaptive'
  });

  assert.equal(plan.workerBudget, 1);
  assert.equal(plan.constructionWorkers, 1);
  assert.equal(plan.perfectionWorkers, 1);
  assert.equal(plan.reason, 'memory-constrained');
});

test('adaptive execution plan diversifies large searches on capable devices', () => {
  const plan = createAutoPlanExecutionPlan({
    hardwareConcurrency: 16,
    deviceMemory: 16,
    openSlots: 62,
    profileCount: 3,
    performanceProfile: 'adaptive'
  });

  assert.equal(plan.workerBudget, 4);
  assert.equal(plan.constructionWorkers, 3);
  assert.equal(plan.perfectionWorkers, 4);
  assert.equal(plan.reserveCores, 2);
  assert.equal(plan.reason, 'balanced-throughput');
});

test('explicit parallel search limit remains authoritative', () => {
  const plan = createAutoPlanExecutionPlan({
    hardwareConcurrency: 32,
    deviceMemory: 32,
    openSlots: 62,
    profileCount: 3,
    performanceProfile: 'power',
    parallelSearches: 3
  });

  assert.equal(plan.workerBudget, 6);
  assert.equal(plan.perfectionWorkers, 3);
  assert.equal(plan.constructionWorkers, 3);
});
