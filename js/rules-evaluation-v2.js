import { evaluateCandidate as evaluateCandidateBase } from './rules-evaluation.js?v=20260803.5';
import { addDays, getAssignment, parseIso, toLocalIso } from './rules-core.js?v=20260803.5';

export * from './rules-evaluation.js?v=20260803.5';

const REASON = 'HG am Tag vor eigenem BD (HG am Werktag vor eigenem BD)';
const LEGACY_REASONS = new Set([
  'Eigener HG am Vortag vor BD',
  'HG am Tag vor eigenem BD',
  'HG am Werktag vor eigenem BD',
  `${REASON}: nicht zulässige werktägliche Dienstfolge.`
]);

function weekdayHgBeforeBdConflict({ state, dateIso, role, staffId }) {
  const date = parseIso(dateIso);
  if (role === 'hg') {
    const weekday = date.getDay();
    if (weekday < 1 || weekday > 4) return false;
    return getAssignment(state, toLocalIso(addDays(date, 1)), 'bd') === staffId;
  }
  if (role === 'bd') {
    const previous = addDays(date, -1);
    const previousWeekday = previous.getDay();
    if (previousWeekday < 1 || previousWeekday > 4) return false;
    return getAssignment(state, toLocalIso(previous), 'hg') === staffId;
  }
  return false;
}

function withWeekdayHgBeforeBdConflict(evaluation) {
  if (!evaluation || evaluation.canSelect === false) return evaluation;
  const reasonDetails = (Array.isArray(evaluation.reasonDetails) ? evaluation.reasonDetails : [])
    .filter(item => !LEGACY_REASONS.has(item?.text));
  reasonDetails.unshift({
    text: `${REASON}: rote werktägliche Dienstfolge`,
    kind: 'conflict',
    level: 'red',
    lane: null,
    selection: 'standard'
  });
  const priorType = evaluation.meta?.confirmationType;
  return {
    ...evaluation,
    level: 'red',
    canSelect: true,
    reasons: reasonDetails.map(item => item.text).filter(Boolean),
    reasonDetails,
    meta: {
      ...(evaluation.meta || {}),
      confirmationType: priorType === 'special' ? 'special' : 'standard',
      selectionPolicy: priorType === 'special' ? 'special' : 'standard',
      weekdayHgBeforeBd: true
    }
  };
}

/**
 * Montag bis Donnerstag ist ein eigener HG unmittelbar vor einem eigenen BD
 * am Folgetag rot. Die Prüfung erfolgt symmetrisch bei Auswahl des HG und des
 * BD, damit die Farbe nicht von der Eingabereihenfolge abhängt.
 *
 * Freitag-HG vor Samstags-BD bleibt ausgenommen; hierfür gelten die definierten
 * Wochenendkopplungen. Bereits nicht wählbare Bewertungen werden niemals durch
 * diese Policy wieder freigeschaltet oder in eine bestätigbare Auswahl verwandelt.
 */
export function evaluateCandidate(parameters) {
  const evaluation = evaluateCandidateBase(parameters);
  return weekdayHgBeforeBdConflict(parameters)
    ? withWeekdayHgBeforeBdConflict(evaluation)
    : evaluation;
}
