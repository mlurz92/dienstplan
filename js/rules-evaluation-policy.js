import { addDays, getAssignment, parseIso, toLocalIso } from './rules-core.js?v=20260801.11';
import {
  RECOMMENDATION_LANES,
  evaluateCandidate as evaluateCandidateBase
} from './rules-evaluation.js?v=20260801.11';

export { RECOMMENDATION_LANES };

const LEGACY_REASONS = new Set([
  'Eigener HG am Vortag vor BD',
  'HG am Tag vor eigenem BD'
]);

function isWeekdayBdAfterOwnHg({ state, dateIso, role, staffId }) {
  const date = parseIso(dateIso);
  if (role === 'bd') {
    const weekday = date.getDay();
    if (weekday < 1 || weekday > 5) return false;
    const previousIso = toLocalIso(addDays(date, -1));
    return getAssignment(state, previousIso, 'hg') === staffId;
  }
  if (role === 'hg') {
    const nextDate = addDays(date, 1);
    const nextWeekday = nextDate.getDay();
    if (nextWeekday < 1 || nextWeekday > 5) return false;
    return getAssignment(state, toLocalIso(nextDate), 'bd') === staffId;
  }
  return false;
}

function upgradeWeekdayHgBeforeBd(evaluation) {
  if (!evaluation || evaluation.level === 'gray' || evaluation.canSelect === false) return evaluation;
  const text = 'HG am Vortag vor eigenem BD unter der Woche';
  const details = (evaluation.reasonDetails || [])
    .filter(entry => !LEGACY_REASONS.has(entry.text) && entry.text !== text);
  details.push({
    text,
    kind: 'conflict',
    level: 'red',
    lane: null,
    selection: 'standard'
  });
  const kindRank = { conflict: 0, confirmation: 1, recommendation: 2, note: 3 };
  const severityRank = { green: 0, yellow: 1, orange: 2, red: 3, gray: 4 };
  details.sort((left, right) => {
    const kind = (kindRank[left.kind] ?? 9) - (kindRank[right.kind] ?? 9);
    if (kind) return kind;
    if (left.kind === 'conflict') return (severityRank[right.level] ?? 0) - (severityRank[left.level] ?? 0);
    return 0;
  });
  const priorType = evaluation.meta?.confirmationType;
  return {
    ...evaluation,
    level: 'red',
    reasons: details.map(entry => entry.text),
    reasonDetails: details,
    canSelect: true,
    meta: {
      ...(evaluation.meta || {}),
      confirmationType: priorType === 'special' ? 'special' : 'standard',
      selectionPolicy: priorType === 'special' ? 'special' : 'standard'
    }
  };
}

export function evaluateCandidate(parameters) {
  const evaluation = evaluateCandidateBase(parameters);
  return isWeekdayBdAfterOwnHg(parameters)
    ? upgradeWeekdayHgBeforeBd(evaluation)
    : evaluation;
}
