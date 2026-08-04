import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createEmptyMonth, DEFAULT_SETTINGS, DEFAULT_STAFF } from '../js/defaults.js';
import {
  AUTO_PLAN_V9_CONSTRAINTS,
  AUTO_PLAN_V9_RULESET_VERSION,
  AUTO_PLAN_V9_SCHEMA_VERSION,
  compileAutoPlanV9Snapshot,
  stableFingerprint
} from '../js/constraint-registry-v9.js';
import { AUTO_PLAN_V9_TOOLTIPS } from '../js/auto-plan-tooltips-v9.js';
import { formatV9Commentary, v9CommentaryKey } from '../js/auto-plan-commentary-v9.js';

const planner = await import('../js/auto-planner.js');
const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

function fixture() {
  const monthData = createEmptyMonth(2026, 9);
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.autoPlan ||= {};
  settings.autoPlan.v9 = {
    mode: 'proof',
    goal: 'new-plan',
    alternatives: 4,
    targetGapPermille: 0,
    minimumAlternativeDistance: 7,
    maxChanges: null,
    deterministic: true,
    exactLns: true,
    lnsMinSize: 10,
    lnsMaxSize: 32,
    remoteSolver: true,
    relaxAbsence: true,
    relaxHardMaximum: false,
    relaxOrganizational: true,
    seed: 42
  };
  return {
    monthData,
    state: {
      settings,
      staff: structuredClone(DEFAULT_STAFF),
      months: new Map([['2026-09', monthData]]),
      monthSources: new Map([['2026-09', 'server']]),
      currentYear: 2026,
      currentMonth: 9
    }
  };
}

test('produktive Facade exportiert Engine v9 und den vollständigen Phasenvertrag', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 9);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v9-cpsat-guided-exact-lns');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id), [
    'snapshot', 'presolve', 'strict-feasibility', 'minimal-relaxation',
    'quality', 'fairness', 'exact-lns', 'alternatives', 'explain', 'audit'
  ]);
  assert.ok(planner.AUTO_PLAN_STAGES.every(stage => stage.title && stage.detail));
});

test('Constraint Registry deckt harte Regeln, Fairness, Stabilität und Diversität ab', () => {
  const ids = new Set(AUTO_PLAN_V9_CONSTRAINTS.map(item => item.id));
  for (const id of [
    'SLOT_COVERAGE', 'QUALIFICATION_REQUIRED', 'ACTIVE_STAFF_REQUIRED',
    'NO_SAME_DAY_BD_HG', 'NO_CONSECUTIVE_BD', 'PERSON_MAX_BD',
    'PERSON_MAX_HG', 'PERSON_MAX_TOTAL', 'WEEKDAY_HG_BEFORE_OWN_BD',
    'BD_TARGET_DEVIATION', 'TOTAL_LOAD_SPREAD', 'WEEKEND_LOAD_SPREAD',
    'PLAN_STABILITY', 'ALTERNATIVE_DISTANCE'
  ]) assert.ok(ids.has(id), `${id} fehlt in der v9-Registry`);
  assert.equal(AUTO_PLAN_V9_SCHEMA_VERSION, 9);
  assert.equal(AUTO_PLAN_V9_RULESET_VERSION, '5.0.0');
});

test('Solver-Snapshot ist versioniert, deterministisch und enthält alle Dienstfelder', () => {
  const { state, monthData } = fixture();
  const runConfig = {
    timeBudgetMs: 600_000,
    allowRedFallback: true,
    maxRedViolations: 2,
    optimizationFocus: 'balanced',
    staffLimits: {}
  };
  const first = compileAutoPlanV9Snapshot({ state, monthData, runConfig });
  const second = compileAutoPlanV9Snapshot({ state, monthData, runConfig });
  assert.equal(first.schemaVersion, 9);
  assert.equal(first.rulesetVersion, AUTO_PLAN_V9_RULESET_VERSION);
  assert.equal(first.slots.length, Object.keys(monthData.days).length * 2);
  assert.equal(first.requestFingerprint, second.requestFingerprint);
  assert.equal(first.baselineFingerprint, second.baselineFingerprint);
  assert.equal(first.config.mode, 'proof');
  assert.equal(first.config.targetGapPermille, 0);
  assert.equal(first.config.alternatives, 4);
  assert.equal(first.config.lnsMinSize, 10);
  assert.equal(first.config.lnsMaxSize, 32);
  assert.ok(first.slots.every(slot => slot.fixedStaffId || Array.isArray(slot.candidates)));
  assert.ok(first.slots.flatMap(slot => slot.candidates).every(candidate => candidate.level !== 'gray' || candidate.canSelect === false));
});

test('Fingerprints sind schlüsselordnungsstabil und änderungssensitiv', () => {
  assert.equal(stableFingerprint({ b: 2, a: 1 }), stableFingerprint({ a: 1, b: 2 }));
  assert.notEqual(stableFingerprint({ a: 1 }), stableFingerprint({ a: 2 }));
});

test('proof-aware Kommentierung unterscheidet Beweis, Gap und Fallback wahrheitsgetreu', () => {
  const optimal = formatV9Commentary({ stage: 'fairness', solverStatus: 'OPTIMAL', objectiveValue: 3, bestBound: 3, relativeGap: 0 });
  const feasible = formatV9Commentary({ stage: 'quality', solverStatus: 'FEASIBLE', objectiveValue: 5, bestBound: 4, relativeGap: .2 });
  const fallback = formatV9Commentary({ stage: 'remote-fallback', remoteFallback: true, message: 'HTTP 503' });
  assert.match(optimal.text, /kompilierten v9-Modell optimal bewiesen/);
  assert.match(feasible.text, /Gap 20/);
  assert.match(fallback.text, /lokale Warmstart übernimmt/);
  assert.notEqual(v9CommentaryKey({ stage: 'fairness', sequence: 1 }), v9CommentaryKey({ stage: 'fairness', sequence: 2 }));
});

test('jeder v9-Studiocontroller besitzt einen erklärenden Tooltip', () => {
  for (const id of [
    'autoPlanV9Mode', 'autoPlanV9Goal', 'autoPlanV9Alternatives',
    'autoPlanV9Gap', 'autoPlanV9Distance', 'autoPlanV9MaxChanges',
    'autoPlanV9Deterministic', 'autoPlanV9ExactLns', 'autoPlanV9LnsMin',
    'autoPlanV9LnsMax', 'autoPlanV9Remote', 'autoPlanV9RelaxAbsence',
    'autoPlanV9RelaxMaximum', 'autoPlanV9RelaxOrganizational'
  ]) assert.ok(AUTO_PLAN_V9_TOOLTIPS[id]?.length > 30, `${id} ohne ausreichenden Tooltip`);
});

test('hybrider Runner erzwingt Browseraudit und lokalen Degraded Mode', async () => {
  const runner = await source('../js/auto-plan-runner.js');
  assert.match(runner, /compileAutoPlanV9Snapshot/);
  assert.match(runner, /materializeAutoPlanV9Result/);
  assert.match(runner, /runLocalFallback/);
  assert.match(runner, /remoteFallback:\s*true/);
  assert.match(runner, /perfectionEnabled:\s*true/);
});

test('Startup-Root-Cause ist behoben und eine äußere Fehlergrenze vorhanden', async () => {
  const shell = await source('../js/ui-v8-5.js');
  const health = await source('../js/startup-health-v9.js');
  assert.doesNotMatch(shell, /toolbar\.insertBefore\(toggle,\s*settings\)/);
  assert.match(shell, /const host = settings\.parentElement/);
  assert.match(shell, /settings\.parentElement === host/);
  assert.match(shell, /safeStep\('toolbar'/);
  assert.match(health, /unhandledrejection/);
  assert.match(health, /WATCHDOG_MS/);
  assert.match(health, /serviceWorker\.getRegistrations/);
  assert.match(health, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(health, /localStorage\.clear/);
});

test('Cloudflare- und Solverartefakte sind produktiv verdrahtet', async () => {
  const pages = await source('../functions/api/autoplan/v9/runs.js');
  const cancel = await source('../functions/api/autoplan/v9/runs/[runId]/cancel.js');
  const worker = await source('../workers/autoplan-v9/src/index.ts');
  const wrangler = await source('../workers/autoplan-v9/wrangler.jsonc');
  const solver = await source('../solver/app/solver_core.py');
  assert.match(pages, /AUTO_PLAN_V9/);
  assert.match(pages, /Idempotency-Key/);
  assert.match(cancel, /\/cancel/);
  assert.match(worker, /class AutoPlanJob/);
  assert.match(worker, /class AutoPlanContainer/);
  assert.match(worker, /class AutoPlanWorkflow extends WorkflowEntrypoint/);
  assert.match(worker, /step\.do/);
  assert.match(worker, /workflow-execute/);
  assert.match(worker, /run_events/);
  assert.match(wrangler, /AUTO_PLAN_WORKFLOW/);
  assert.match(wrangler, /dienstplanrad-autoplan-v9-preview-workflow/);
  assert.match(solver, /lexicographic_solve/);
  assert.match(solver, /adaptive_exact_lns/);
  assert.match(solver, /diagnose_infeasibility/);
  assert.match(solver, /generate_alternatives/);
});

test('v9-Monatspersistenz ist revisionsgebunden und degradiert kontrolliert auf KV', async () => {
  const endpoint = await source('../functions/api/month/[year]/[month].js');
  const api = await source('../js/api.js');
  const runner = await source('../js/auto-plan-runner.js');
  const job = await source('../workers/autoplan-v9/src/index.ts');
  assert.match(endpoint, /MONTH_STATE/);
  assert.match(endpoint, /expectedRevision/);
  assert.match(endpoint, /MONTH_REVISION_CONFLICT/);
  assert.match(endpoint, /eventual-fallback/);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /error\.status = res\.status/);
  assert.match(runner, /Snapshot compilation can fail/);
  assert.match(runner, /removeEventListener\?\.\('abort'/);
  assert.match(job, /executionPromise/);
  assert.match(job, /solverContainerKey/);
  assert.doesNotMatch(job, /ctx\.waitUntil\(this\.execute/);
});
