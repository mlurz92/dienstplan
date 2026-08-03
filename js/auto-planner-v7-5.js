/** Auto-Plan v7.5 – wahrer Portfoliofortschritt und gehärteter Lebenszyklus. */
import * as V7 from './auto-planner-v7.js?v=20260803.6';

export * from './auto-planner-v7.js?v=20260803.6';

export const AUTO_PLAN_REVISION = 7.5;

function annotate(result) {
  if (!result) return result;
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = 'v7.5-constraint-portfolio';
  return result;
}

export async function constructAutoPlan(parameters) {
  return annotate(await V7.constructAutoPlan(parameters));
}

export async function perfectAutoPlan(parameters) {
  return annotate(await V7.perfectAutoPlan(parameters));
}

export async function buildAutoPlan(parameters) {
  return annotate(await V7.buildAutoPlan(parameters));
}
