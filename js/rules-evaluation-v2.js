import { evaluateCandidate as evaluateCandidateBase } from './rules-evaluation.js?v=20260801.11';
import { addDays, getAssignment, parseIso, toLocalIso } from './rules-core.js?v=20260801.11';

export * from './rules-evaluation.js?v=20260801.11';

const WEEKDAY_HG_BEFORE_BD = 'HG am Werktag vor eigenem BD';

function weekdayHgBeforeBdConflict({ state, dateIso, role, staffId }) {
  const date = parseIso(dateIso);
  if (role === 'hg') {
    const weekday = date.getDay();
    if (weekday < 1 || weekday > 4) return false;
    const nextIso = toLocalIso(addDays(date, 1));
    return getAssignment(state, nextIso, 'bd') === staffId;
  }
  if (role === 'bd') {
    const previous = addDays(date, -1);
    const previousWeekday = previous.getDay();
    if (previousWeekday < 1 || previousWeekday > 4) return false;
    const previousIso = toLocalIso(previous);
    return getAssignment(state, previousIso, 'hg') === staffId;
  }
  return false;
}

function withWeekdayHgBeforeBdConflict(evaluation) {
  const reason = `${WEEKDAY_HG_BEFORE_BD}: nicht zulässige werktägliche Dienstfolge.`;
  const existing = Array.isArray(evaluation?.reasonDetails) ? evaluation.reasonDetails : [];
  const reasonDetails = existing.some(item => item?.text === reason)
    ? existing
    : [{ level: 'red', kind: 'conflict', text: reason }, ...existing];
  const reasons = reasonDetails.map(item => item.text).filter(Boolean);
  return {
    ...evaluation,
    level: 'red',
    canSelect: true,
    reasons,
    reasonDetails,
    meta: {
      ...(evaluation?.meta || {}),
      confirmationType: evaluation?.meta?.confirmationType || 'standard',
      weekdayHgBeforeBd: true
    }
  };
}

/**
 * Zentrale Erweiterung der bestehenden Eignungsprüfung.
 *
 * Montag bis Donnerstag ist ein eigener HG am unmittelbar vorangehenden Tag
 * eines eigenen BD rot. Die Bewertung ist symmetrisch und daher unabhängig von
 * der Eingabereihenfolge. Freitag-HG vor Samstags-BD bleibt von dieser Regel
 * ausgenommen, damit die definierte Wochenendkopplung erhalten bleibt.
 */
export function evaluateCandidate(parameters) {
  const evaluation = evaluateCandidateBase(parameters);
  if (!weekdayHgBeforeBdConflict(parameters)) return evaluation;
  return withWeekdayHgBeforeBdConflict(evaluation);
}
