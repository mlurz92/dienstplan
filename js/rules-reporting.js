import { isRegularWorkdayIso } from './holidays.js?v=20260730.4';
import {
  ABSENCE_FOR_CT_LEADERSHIP, computeWeekendEquivalent, countRoleInMonth, dayIso,
  fmtGermanDate, getAbsence, getRoleProperties, getStaffById, isStaffActiveOn, severityRank
} from './rules-core.js?v=20260730.4';
import { evaluateCandidate } from './rules-evaluation.js?v=20260730.4';

export function collectIssues(state, monthData) {
  const issues = [];
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    if (!day.hg) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: HG offen`, details: 'Kein HG eingetragen.' });
    if (!day.bd) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: BD offen`, details: 'Kein BD eingetragen.' });
    for (const role of ['bd', 'hg']) {
      const staffId = day[role];
      if (!staffId) continue;
      const evaluation = evaluateCandidate({ state, monthData, dateIso: iso, role, staffId });
      if (['orange', 'red'].includes(evaluation.level)) issues.push({
        level: evaluation.level,
        title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · ${getStaffById(state.staff, staffId)?.name || staffId}`,
        details: evaluation.reasons.join(' · ')
      });
    }
  }

  for (const iso of Object.keys(monthData.days || {})) {
    if (!isRegularWorkdayIso(iso)) continue;
    const becker = getAbsence(monthData, 'becker', iso);
    const martin = getAbsence(monthData, 'martin', iso);
    if (!ABSENCE_FOR_CT_LEADERSHIP.has(becker) || !ABSENCE_FOR_CT_LEADERSHIP.has(martin)) continue;
    issues.push({ level: 'red', title: `${fmtGermanDate(iso)} · Becker/Martin gleichzeitig abwesend`, details: 'CT-Leitungsbesetzung prüfen.' });
  }
  return issues.sort((a, b) => severityRank[b.level] - severityRank[a.level]);
}

export function buildStats(state, monthData) {
  return state.staff
    .filter(person => person.includeInPlanning && isStaffActiveOn(person, dayIso(monthData.year, monthData.month, 1)))
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

