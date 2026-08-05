import { evaluateCandidate as evaluateCandidateBase } from './rules-evaluation.js?v=20260806.1';
import { addDays, getAssignment, parseIso, toLocalIso } from './rules-core.js?v=20260806.1';

export * from './rules-evaluation.js?v=20260806.1';

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

const GAP_REASON = 'Fr-BD · Sa frei · So-BD (Wochenend-BD mit freiem Samstag)';
const GAP_LEGACY_REASONS = new Set([
  'Fr-BD · Sa frei · So-BD',
  'BD am Freitag mit freiem Samstag vor BD am Sonntag',
  'Wochenend-BD mit freiem Samstag (Fr-BD, Sa frei, So-BD)',
  `${GAP_REASON}: rote Wochenendkette mit freiem Samstag.`
]);

function isStaffFreeOn(state, dateIso, staffId) {
  return ['bd', 'hg', 'rbn1', 'rbn2'].every(role => getAssignment(state, dateIso, role) !== staffId);
}

/**
 * Fr-BD · Sa frei · So-BD: Hat eine Person am Freitag BD, ist sie am Samstag
 * vollständig frei (kein BD, kein HG, kein RBN, keine zweite RBN) und trägt
 * am Sonntag erneut BD, ist diese Wochenendkette mit freiem Samstag rot und
 * besonders bestätigungspflichtig. Die Prüfung erfolgt symmetrisch bei Auswahl
 * des Freitags- und des Sonntags-BD, damit die Farbe nicht von der
 * Eingabereihenfolge abhängt.
 */
function weekendGapBdConflict({ state, dateIso, role, staffId }) {
  if (role !== 'bd') return false;
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  if (weekday === 5) {
    const saturday = toLocalIso(addDays(date, 1));
    const sunday = toLocalIso(addDays(date, 2));
    if (getAssignment(state, sunday, 'bd') !== staffId) return false;
    return isStaffFreeOn(state, saturday, staffId);
  }
  if (weekday === 0) {
    const saturday = toLocalIso(addDays(date, -1));
    const friday = toLocalIso(addDays(date, -2));
    if (getAssignment(state, friday, 'bd') !== staffId) return false;
    return isStaffFreeOn(state, saturday, staffId);
  }
  return false;
}

function withWeekendGapConflict(evaluation) {
  if (!evaluation || evaluation.canSelect === false) return evaluation;
  if (evaluation.meta?.weekendGap) return evaluation;
  const reasonDetails = (Array.isArray(evaluation.reasonDetails) ? evaluation.reasonDetails : [])
    .filter(item => !GAP_LEGACY_REASONS.has(item?.text));
  reasonDetails.unshift({
    text: `${GAP_REASON}: rote Wochenendkette, speziell bestätigungspflichtig`,
    kind: 'conflict',
    level: 'red',
    lane: null,
    selection: 'special'
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
      confirmationType: 'special',
      selectionPolicy: 'special',
      weekendGap: true,
      priorConfirmationType: priorType || null
    }
  };
}

export function evaluateCandidate(parameters) {
  const evaluation = evaluateCandidateBase(parameters);
  const withWeekday = weekdayHgBeforeBdConflict(parameters)
    ? withWeekdayHgBeforeBdConflict(evaluation)
    : evaluation;
  return weekendGapBdConflict(parameters)
    ? withWeekendGapConflict(withWeekday)
    : withWeekday;
}
