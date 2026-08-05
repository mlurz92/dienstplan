import {
  buildStats,
  collectIssues as collectIssuesBase,
  roleLabelForMonth
} from './rules-reporting.js?v=20260806.1';
import { evaluateCandidate } from './rules-evaluation-v2.js?v=20260806.1';

export { buildStats, roleLabelForMonth };

export function collectIssues(state, monthData, options = {}) {
  return collectIssuesBase(state, monthData, {
    ...options,
    evaluate: options.evaluate || evaluateCandidate
  });
}
