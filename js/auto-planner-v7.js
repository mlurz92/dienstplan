/**
 * Auto-Plan v7 – adaptive, constraint-directed portfolio search.
 *
 * v7 keeps the strict-before-fallback escalation from v6 and adds the settings
 * and diagnostics contract used by the adaptive worker portfolio.
 */
import * as V6 from './auto-planner-v6.js?v=20260803.4';

export * from './auto-planner-v6.js?v=20260803.4';

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function settingsDefaults(state) {
  const source = state?.settings?.autoPlan;
  if (!source || typeof source !== 'object') return {};
  return {
    performanceProfile: source.performanceProfile,
    searchIntensity: source.searchIntensity,
    optimizationFocus: source.optimizationFocus,
    timeBudgetMs: Number(source.timeBudgetSeconds) * 1000,
    allowRedFallback: source.allowRedFallback,
    maxRedViolations: source.maxRedViolations,
    perfectionEnabled: source.perfectionEnabled,
    parallelSearches: source.parallelSearches,
    certificationRounds: source.certificationRounds,
    portfolioDiversity: source.portfolioDiversity
  };
}

function composeRunConfig(state, supplied) {
  return { ...settingsDefaults(state), ...(supplied && typeof supplied === 'object' ? clone(supplied) : {}) };
}

function annotate(result, runConfig = null) {
  if (!result) return result;
  result.algorithmRevision = 7;
  result.metrics ||= {};
  result.metrics.engine = 'v7-constraint-portfolio';
  result.executionConfig = {
    performanceProfile: runConfig?.performanceProfile || 'adaptive',
    parallelSearches: runConfig?.parallelSearches ?? null
  };
  return result;
}

export function mergeAutoPlanRunConfig(state, monthData, input = null) {
  return V6.mergeAutoPlanRunConfig(state, monthData, composeRunConfig(state, input));
}

export function normalizeAutoPlanConfig(state, monthData, input = null) {
  return V6.normalizeAutoPlanConfig(state, monthData, composeRunConfig(state, input));
}

export function validateAutoPlanConfig(state, monthData, input = null) {
  return V6.validateAutoPlanConfig(state, monthData, composeRunConfig(state, input));
}

export async function constructAutoPlan(parameters) {
  const runConfig = composeRunConfig(parameters.state, parameters.runConfig);
  return annotate(await V6.constructAutoPlan({
    ...parameters,
    runConfig
  }), runConfig);
}

export async function buildAutoPlan(parameters) {
  const runConfig = composeRunConfig(parameters.state, parameters.runConfig);
  const constructed = await constructAutoPlan({ ...parameters, runConfig });
  return annotate(await V6.perfectAutoPlan({ ...parameters, runConfig, constructed }), runConfig);
}
