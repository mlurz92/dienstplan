import { isRegularWorkdayIso } from './holidays.js?v=20260731.3';
import { isRbnValueAllowed, isSecondRbnAvailable } from './rbn.js?v=20260731.3';
import {
  ABSENCE_FOR_CT_LEADERSHIP, computeWeekendEquivalent, countRoleInMonth, dayIso,
  fmtGermanDate, getEffectiveAbsence, getRoleProperties, getStaffById, isStaffActiveDuringMonth, severityRank
} from './rules-core.js?v=20260731.3';
import { evaluateCandidate } from './rules-evaluation.js?v=20260731.3';

export function collectIssues(state, monthData) {
  const issues = [];
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    if (!day.hg) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: HG offen`, details: 'Kein HG eingetragen.' });
    if (!day.bd) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: BD offen`, details: 'Kein BD eingetragen.' });

    for (const role of ['bd', 'hg']) {
      const staffId = day[role];
      if (!staffId) continue;
      if (!getStaffById(state.staff, staffId)) {
        issues.push({
          level: 'red',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · unbekannte Personal-ID`,
          details: `Der gespeicherte Wert „${staffId}“ ist keiner gültigen Person zugeordnet.`
        });
        continue;
      }
      const evaluation = evaluateCandidate({ state, monthData, dateIso: iso, role, staffId });
      if (evaluation.level === 'gray') {
        issues.push({
          level: 'red',
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · nicht mehr zulässige Besetzung`,
          details: evaluation.reasons.join(' · ')
        });
      } else if (['orange', 'red'].includes(evaluation.level)) {
        issues.push({
          level: evaluation.level,
          title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · ${getStaffById(state.staff, staffId)?.name || staffId}`,
          details: evaluation.reasons.join(' · ')
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
      issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: 2. RBN offen`, details: 'Die Erstbesetzung erfordert eine zweite RBN.' });
    }
  }

  for (const iso of Object.keys(monthData.days || {})) {
    if (!isRegularWorkdayIso(iso)) continue;
    const becker = getEffectiveAbsence(state, monthData, 'becker', iso);
    const martin = getEffectiveAbsence(state, monthData, 'martin', iso);
    if (!ABSENCE_FOR_CT_LEADERSHIP.has(becker) || !ABSENCE_FOR_CT_LEADERSHIP.has(martin)) continue;
    issues.push({ level: 'red', title: `${fmtGermanDate(iso)} · Becker/Martin gleichzeitig abwesend`, details: 'CT-Leitungsbesetzung prüfen.' });
  }
  return issues.sort((a, b) => severityRank[b.level] - severityRank[a.level]);
}

export function buildStats(state, monthData) {
  return state.staff
    .filter(person => person.includeInPlanning && isStaffActiveDuringMonth(person, monthData.year, monthData.month))
    .map(person => ({
      id: person.id,
      name: person.name,
      roleLabel: getRoleProperties(person, dayIso(monthData.year, monthData.month, 15)).roleLabel,
      bd: countRoleInMonth(monthData, person.id, 'bd'),
      hg: countRoleInMonth(monthData, person.id, 'hg'),
      weekendEq: Number(computeWeekendEquivalent(monthData, person.id).toFixed(1)),
      bdTarget: person.bdTarget || 0,
      bdRemaining: person.bdTarget ? person.bdTarget - countRoleInMonth(monthData, person.id, 'bd') : null
    }));
}
