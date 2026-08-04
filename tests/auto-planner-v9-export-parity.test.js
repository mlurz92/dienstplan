import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

// js/auto-planner.js re-exports auto-planner-v9.js via an explicit named
// export list instead of `export *`. That protects against exports being
// removed/renamed (an immediate reference error), but it does NOT protect
// against a *new* export being added to auto-planner-v9.js: with an
// explicit list, a new export would silently be dropped and never reach
// consumers of js/auto-planner.js. This test guards against that silent
// regression by asserting that every export of auto-planner-v9.js is
// accounted for in auto-planner.js, either re-exported under its own name
// or intentionally shadowed by a local implementation.
const INTENTIONALLY_LOCALLY_REDEFINED = new Set([
  'buildAutoPlan',
  'constructAutoPlan',
  'perfectAutoPlan',
  'applyAutoPlanProposal'
]);

test('js/auto-planner.js re-exports every auto-planner-v9.js export (directly or via an intentional local override)', async () => {
  // js/auto-planner.js imports auto-planner-v9.js with a cache-busting
  // `?v=...` query string. Node treats module specifiers with different
  // query strings as distinct module instances, so the import here must
  // use the identical specifier to reference the same instance and allow
  // reference-equality checks on the directly re-exported bindings.
  const v9 = await import('../js/auto-planner-v9.js?v=20260804.9');
  const autoPlanner = await import('../js/auto-planner.js');

  const missing = [];
  const mismatched = [];

  for (const name of Object.keys(v9)) {
    if (INTENTIONALLY_LOCALLY_REDEFINED.has(name)) {
      if (typeof autoPlanner[name] === 'undefined') {
        missing.push(name);
      }
      continue;
    }

    if (typeof autoPlanner[name] === 'undefined') {
      missing.push(name);
      continue;
    }

    if (autoPlanner[name] !== v9[name]) {
      mismatched.push(name);
    }
  }

  assert.deepEqual(
    missing,
    [],
    `New export(s) added to auto-planner-v9.js are not reachable through js/auto-planner.js: ${missing.join(', ')}. ` +
      'Add them to the explicit re-export list (or to INTENTIONALLY_LOCALLY_REDEFINED if js/auto-planner.js ' +
      'deliberately provides its own implementation).'
  );
  assert.deepEqual(
    mismatched,
    [],
    `auto-planner.js exports name(s) that shadow auto-planner-v9.js without being declared intentional: ${mismatched.join(', ')}.`
  );
});
