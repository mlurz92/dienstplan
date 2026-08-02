import {
  buildStats,
  collectIssues as collectIssuesBase
} from './rules-reporting.js?v=20260801.11';
import { evaluateCandidate } from './rules-evaluation-policy.js?v=20260801.11';

export { buildStats };

export function collectIssues(state, monthData, options = {}) {
  return collectIssuesBase(state, monthData, {
    ...options,
    evaluate: options.evaluate || evaluateCandidate
  });
}
