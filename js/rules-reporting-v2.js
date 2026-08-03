import {
  buildStats,
  collectIssues as collectIssuesBase,
  roleLabelForMonth
} from './rules-reporting.js?v=20260803.2';
import { evaluateCandidate } from './rules-evaluation-v2.js?v=20260803.2';

export { buildStats, roleLabelForMonth };

export function collectIssues(state, monthData, options = {}) {
  return collectIssuesBase(state, monthData, {
    ...options,
    evaluate: options.evaluate || evaluateCandidate
  });
}
