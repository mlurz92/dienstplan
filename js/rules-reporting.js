import { isRegularWorkdayIso } from './holidays.js?v=20260806.1';
import { isRbnValueAllowed, isSecondRbnAvailable } from './rbn.js?v=20260806.1';
import {
  ABSENCE_FOR_CT_LEADERSHIP, computeWeekendEquivalent, countRoleInMonth, dayIso,
  externalAssignmentLabel, fmtGermanDate, getEffectiveAbsence, getRoleProperties, getStaffById,
  isExternalAssignment, isStaffActiveDuringMonth, severityRank
} from './rules-core.js?v=20260806.1';
import { evaluateCandidate } from './rules-evaluation.js?v=20260806.1';

function matchingOverride(monthData, { dateIso, role, staffId, evaluation }) {
  const entries = Array.isArray(monthData?.overrideLog) ? monthData.overrideLog : [];
  const redReasons = (evaluation.reasonDetails || [])
    .filter(reason => reason.level === 'red' && reason.kind === 'conflict')
    .map(reason => reason.text);

  return [...entries].reverse().find(entry => {
    if (entry?.dateIso !== dateIso || entry?.role !== role || entry?.staffId !== staffId) return false;
    if (!Array.isArray(entry.reasons) || entry.reasons.length === 0 || redReasons.length === 0) return true;
    return redReasons.some(reason => entry.reasons.includes(reason));
  }) || null;
}

function confirmedIssueDetails(evaluation, override) {
  const timestamp = override?.timestamp ? new Date(override.timestamp) : null;
  const validTimestamp = timestamp && !Number.isNaN(timestamp.getTime());
  const confirmation = override?.source === 'auto-plan'
    ? (evaluation.meta?.confirmationType === 'special'
        ? 'Besondere Auto-Plan-Ausnahme bestätigt'
        : 'Rote Auto-Plan-Ausnahme bestätigt')
    : (evaluation.meta?.confirmationType === 'special'
        ? 'Besondere Bestätigung dokumentiert'
        : 'Rote Planabweichung bestätigt');
  const dateText = validTimestamp
    ? ` am ${timestamp.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`
    : '';
  const comment = String(override?.comment || '').trim();
  return `${confirmation}${dateText}${comment ? ` · Kommentar: ${comment}` : ''} · ${evaluation.reasons.join(' · ')}`;
}

/**
 * Funktionsbezeichnung einer Person für einen ganzen Monat.
 *
 * Maßgeblich ist die datumsabhängige Qualifikation, nicht der statische
 * Stammwert: Wer im Monat befördert wird, trägt vorher die alte und nachher die
 * neue Bezeichnung, und für den Übergangsmonat wird beides genannt. Jede
 * monatsbezogene Liste muss diese Fassung verwenden – der Stammwert bliebe
 * sonst dauerhaft auf dem Stand vor der Beförderung stehen.
 */
export function roleLabelForMonth(person, year, month) {
  const firstIso = dayIso(year, month, 1);
  const lastIso = dayIso(year, month, new Date(year, month, 0).getDate());
  const first = getRoleProperties(person, firstIso).roleLabel || '';
  const last = getRoleProperties(person, lastIso).roleLabel || first;
  return first === last ? first : `${first} → ${last}`;
}

/**
 * Sammelbefund des Monats.
 *
 * Jeder Eintrag trägt neben Stufe und Text ein `kind`: `open` für eine noch
 * fehlende Besetzung, `finding` für eine fachliche Auffälligkeit. Bestätigte
 * rote Ausnahmen bleiben sichtbar, werden jedoch als eigener Status markiert,
 * damit sie nicht mit einer noch ungeprüften Regelverletzung verwechselt werden.
 */
export function collectIssues(state, monthData, { evaluate = null } = {}) {
  const evaluateCandidateCached = evaluate || (parameters => evaluateCandidate(parameters));
  const issues = [];
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    if (!day.hg) issues.push({ kind: 'open', level: 'yellow', title: `${fmtGermanDate(iso)}: HG offen`, details: 'Kein HG eingetragen.' });
    if (!day.bd) issues.push({ kind: 'open', level: 'yellow', title: `${fmtGermanDate(iso)}: BD offen`, details: 'Kein BD eingetragen.' });

    for (const role of ['bd', 'hg']) {
      const staffId = day[role];
      if (!staffId) continue;
      if (isExternalAssignment(staffId)) {
        issues.push({
          level: 'yellow',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · ${externalAssignmentLabel(staffId)}`,
          details: 'Aus einem Import übernommener Name ohne hinterlegte Person. Der Eintrag bleibt erhalten, ist aber nicht bewertbar und nicht erneut auswählbar.'
        });
        continue;
      }
      if (!getStaffById(state.staff, staffId)) {
        issues.push({
          level: 'red',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · unbekannte Personal-ID`,
          details: `Der gespeicherte Wert „${staffId}“ ist keiner gültigen Person zugeordnet.`
        });
        continue;
      }

      const evaluation = evaluateCandidateCached({ state, monthData, dateIso: iso, role, staffId });
      // Grau ODER nicht wählbar bedeutet dieselbe Sache: Die Besetzung ist nicht
      // zulässig und darf niemals als bestätigbare Ausnahme geführt werden.
      if (evaluation.level === 'gray' || evaluation.canSelect === false) {
        issues.push({
          level: 'red',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · nicht mehr zulässige Besetzung`,
          details: evaluation.reasons.join(' · ')
        });
      } else if (['orange', 'red'].includes(evaluation.level)) {
        const override = evaluation.level === 'red'
          ? matchingOverride(monthData, { dateIso: iso, role, staffId, evaluation })
          : null;
        const confirmed = Boolean(override);
        issues.push({
          level: evaluation.level,
          confirmed,
          title: confirmed
            ? `${fmtGermanDate(iso)} · ${role.toUpperCase()} · bestätigte rote Ausnahme · ${getStaffById(state.staff, staffId)?.name || staffId}`
            : `${fmtGermanDate(iso)} · ${role.toUpperCase()} · ${getStaffById(state.staff, staffId)?.name || staffId}`,
          details: confirmed ? confirmedIssueDetails(evaluation, override) : evaluation.reasons.join(' · ')
        });
      }
    }

    const secondAvailable = isSecondRbnAvailable(iso, day.rbn1);
    if (day.rbn1 && !isRbnValueAllowed('rbn1', iso, day.rbn1)) {
      issues.push({ level: 'orange', title: `${fmtGermanDate(iso)} · RBN-Altwert`, details: `„${day.rbn1}“ gehört an diesem Datum nicht zum gültigen RBN-Pool.` });
    }
    if (day.rbn2 && !isRbnValueAllowed('rbn2', iso, day.rbn2)) {
      issues.push({ level: 'orange', title: `${fmtGermanDate(iso)} · 2. RBN-Altwert`, details: `„${day.rbn2}“ gehört nicht zum gültigen Pool der zweiten RBN.` });
    }
    if (day.rbn2 && !secondAvailable) {
      issues.push({ level: 'orange', title: `${fmtGermanDate(iso)} · 2. RBN ohne gültigen Trigger`, details: 'Die erste RBN schaltet an diesem Datum keine zweite RBN frei.' });
    } else if (secondAvailable && !day.rbn2) {
      issues.push({ kind: 'open', level: 'yellow', title: `${fmtGermanDate(iso)}: 2. RBN offen`, details: 'Die Erstbesetzung erfordert eine zweite RBN.' });
    }
  }

  for (const iso of Object.keys(monthData.days || {})) {
    if (!isRegularWorkdayIso(iso)) continue;
    const becker = getEffectiveAbsence(state, monthData, 'becker', iso);
    const martin = getEffectiveAbsence(state, monthData, 'martin', iso);
    if (!ABSENCE_FOR_CT_LEADERSHIP.has(becker) || !ABSENCE_FOR_CT_LEADERSHIP.has(martin)) continue;
    issues.push({ level: 'red', title: `${fmtGermanDate(iso)} · Becker/Martin gleichzeitig abwesend`, details: 'CT-Leitungsbesetzung prüfen.' });
  }

  return issues
    .map(issue => ({ kind: 'finding', ...issue }))
    .sort((a, b) => {
      const severityDifference = severityRank[b.level] - severityRank[a.level];
      if (severityDifference) return severityDifference;
      if (a.confirmed !== b.confirmed) return Number(Boolean(a.confirmed)) - Number(Boolean(b.confirmed));
      return a.title.localeCompare(b.title, 'de');
    });
}

export function buildStats(state, monthData) {
  return state.staff
    .filter(person => person.includeInPlanning && isStaffActiveDuringMonth(person, monthData.year, monthData.month))
    .map(person => ({
      id: person.id,
      name: person.name,
      roleLabel: roleLabelForMonth(person, monthData.year, monthData.month),
      bd: countRoleInMonth(monthData, person.id, 'bd'),
      hg: countRoleInMonth(monthData, person.id, 'hg'),
      weekendEq: Number(computeWeekendEquivalent(monthData, person.id).toFixed(1)),
      bdTarget: person.bdTarget || 0,
      bdRemaining: person.bdTarget ? person.bdTarget - countRoleInMonth(monthData, person.id, 'bd') : null
    }));
}