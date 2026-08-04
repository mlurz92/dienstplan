import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const planner = await import('../js/auto-planner.js');
const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { setAssignment } = await import('../js/rules.js');
const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

function oneDayMonth(dateIso) {
  return {
    schemaVersion: 1,
    year: Number(dateIso.slice(0, 4)),
    month: Number(dateIso.slice(5, 7)),
    revision: 0,
    updatedAt: null,
    days: { [dateIso]: { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' } },
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function stateWith(monthData) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

test('produktiver Auto-Plan exportiert Revision 9 und den vollständigen Hybridvertrag', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 9);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v9-free-hybrid-exact-browser');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id), [
    'analysis', 'construct', 'rescue', 'repair', 'perfect', 'exact', 'certify'
  ]);
  assert.ok(planner.AUTO_PLAN_STAGES.every(stage => stage.title && stage.detail));
});

test('v9 leitet Solvermodus und Nachweisziel verlustfrei aus dem Studiovertrag ab', () => {
  const direct = planner.deriveV9Tuning({});
  assert.equal(direct.solverMode, 'fast');
  assert.equal(direct.exactEnabled, false, 'ältere direkte API-Aufrufe bleiben schnell und kompatibel');

  const hybrid = planner.deriveV9Tuning({
    performanceProfile: 'v9:hybrid:best-within-budget',
    timeBudgetMs: 120_000
  });
  assert.equal(hybrid.solverMode, 'hybrid');
  assert.equal(hybrid.proofTarget, 'best-within-budget');
  assert.equal(hybrid.exactEnabled, true);
  assert.equal(hybrid.totalBudgetMs, 120_000);
  assert.ok(hybrid.exactTimeBudgetMs > 0);
  assert.equal(hybrid.heuristicTimeBudgetMs + hybrid.exactTimeBudgetMs, hybrid.totalBudgetMs);

  const fast = planner.deriveV9Tuning({ performanceProfile: 'v9:fast:first-feasible', timeBudgetMs: 30_000 });
  assert.equal(fast.exactEnabled, false);
  assert.equal(fast.stopAtFirstFeasible, true);

  const diagnose = planner.deriveV9Tuning({ performanceProfile: 'v9:diagnose:prove-optimal', timeBudgetMs: 300_000 });
  assert.equal(diagnose.forceStrict, true);
  assert.equal(diagnose.proofTarget, 'prove-optimal');
  assert.ok(diagnose.exactTimeBudgetMs > diagnose.heuristicTimeBudgetMs);
});

test('Heuristikfortschritt bleibt vor der exakten Suche monoton und nichtterminal', () => {
  const updates = [];
  const forward = planner.mapHeuristicProgress(update => updates.push(update));
  forward({ phase: 'perfect', progress: .2, message: 'früh' });
  forward({ phase: 'perfect', progress: .95, message: 'spät' });
  forward({ phase: 'complete', progress: 1, message: 'intern fertig' });

  assert.deepEqual(updates.map(update => update.progress), [...updates.map(update => update.progress)].sort((a, b) => a - b));
  assert.ok(updates.every(update => update.progress >= .55 && update.progress <= .80));
  assert.equal(updates.at(-1).phase, 'perfect');
  assert.equal(updates.at(-1).stage, 'incumbent-ready');
  assert.equal(updates.at(-1).heuristicTerminal, true);
});

test('exakte MRV-Suche schließt einen kleinen realen Regelraum global ab', async () => {
  const monthData = oneDayMonth('2026-07-06');
  setAssignment(monthData, '2026-07-06', 'bd', 'lurz');
  const state = stateWith(monthData);
  const exact = await planner.solveExactly({
    state,
    monthData,
    runConfig: { allowRedFallback: false },
    allowRed: false,
    timeLimitMs: 2_000,
    nodeLimit: 100_000
  });

  assert.equal(exact.solverStatus, planner.V9_SOLVER_STATUSES.OPTIMAL);
  assert.equal(exact.completeSearch, true);
  assert.equal(exact.result.complete, true);
  assert.equal(exact.result.metrics.red, 0);
  assert.ok(exact.result.plannedMonth.days['2026-07-06'].hg);
  assert.notEqual(exact.result.plannedMonth.days['2026-07-06'].hg, 'lurz');
});

test('exakter Browser-Solver verwendet die produktive Regelengine und ehrliche Statussemantik', async () => {
  const exact = await source('../js/auto-planner-v9-exact.js');
  assert.match(exact, /OPTIMAL:\s*'OPTIMAL'/);
  assert.match(exact, /FEASIBLE:\s*'FEASIBLE'/);
  assert.match(exact, /INFEASIBLE:\s*'INFEASIBLE'/);
  assert.match(exact, /UNKNOWN:\s*'UNKNOWN'/);
  assert.match(exact, /evaluateCandidate\(/);
  assert.match(exact, /planRespectsLimits\(/);
  assert.match(exact, /compareObjectiveKeys\(/);
  assert.match(exact, /chooseSlot/);
  assert.match(exact, /completeSearch/);
  assert.doesNotMatch(exact, /https?:\/\//);
  assert.doesNotMatch(exact, /DurableObject|Container|Workers AI|Gurobi|CPLEX/);
});

test('Minimal-Rot-Exaktsuche beginnt nur nach bewiesener strikter Unlösbarkeit', async () => {
  const hybrid = await source('../js/auto-planner-v9.js');
  const strict = hybrid.indexOf('const exact = await solveExactly');
  const proof = hybrid.indexOf('exact.solverStatus === V9_SOLVER_STATUSES.INFEASIBLE');
  const fallback = hybrid.indexOf('fallbackExact = await solveExactly');
  assert.ok(strict >= 0 && proof > strict && fallback > proof);
  assert.match(hybrid, /UNKNOWN ist ausdrücklich kein/);
});

test('Studio v9 enthält Solversteuerung, Beweisstatus und flächendeckende Tooltips', async () => {
  const studio = await source('../js/auto-plan-studio-v9.js');
  const contract = await source('../js/auto-plan-studio-v9-contract.js');
  assert.match(studio, /autoPlanV9SolverMode/);
  assert.match(studio, /autoPlanV9ProofTarget/);
  assert.match(studio, /autoPlanV9ExactMeter/);
  assert.match(studio, /autoPlanV9ProofPanel/);
  assert.match(studio, /installAllTooltips/);
  assert.match(studio, /setRichTooltip/);
  assert.match(contract, /data-v9-engine-revision|v9EngineRevision/);
  assert.match(contract, /free-browser-hybrid/);
});

test('v9 behebt das abgeschnittene Studio und härtet Dunkelmodus sowie Bewegungsfallback', async () => {
  const studioCss = await source('../auto-plan-studio-v9.css');
  const contractCss = await source('../auto-plan-studio-v9-contract.css');
  const appCss = await source('../app-v9.css');
  assert.match(studioCss, /100dvh/);
  assert.match(contractCss, /grid-template-rows:\s*auto auto auto minmax\(190px, 1fr\) auto/);
  assert.match(contractCss, /overflow:\s*auto/);
  assert.match(studioCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(appCss, /html\[data-color-scheme="dark"\] \.plan-table/);
  assert.match(appCss, /focus-visible/);
  assert.match(appCss, /forced-colors:\s*active/);
});

test('v9 bleibt vollständig in der bestehenden Pages-/KV-Kostenarchitektur', async () => {
  const hybrid = await source('../js/auto-planner-v9.js');
  const exact = await source('../js/auto-planner-v9-exact.js');
  assert.match(hybrid, /zero-recurring-cost/);
  assert.match(hybrid, /free-browser-hybrid/);
  assert.doesNotMatch(`${hybrid}\n${exact}`, /@cloudflare\/containers|DurableObjectNamespace|D1Database|R2Bucket/);
});
