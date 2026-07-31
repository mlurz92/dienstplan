import { holidayBlocks, isFirstRegularWorkdayAfter, isHoliday } from './holidays.js?v=20260731.1';
import {
  addDays, basicallyEligiblePeers, countHgForAaBdExcept, countRoleInMonthExcept,
  countSaturdayBdExcept, countServicesInLoadedYearExcept, getAbsenceFromState, getEffectiveAbsence,
  getAssignment, getPlanningStaff, getPreference, getRoleProperties, getStaffById,
  hasCompleteLoadedHistory, hasVacationInFollowingWeek, isAaOn, isFaOn, isPositivePreference,
  isStaffActiveOn, labelForAbsence, listOwnRoleDates, monthForIso, parseIso,
  projectedWeekendEquivalent, severityRank, toLocalIso, weekendEquivalentFromMap, weekendMap
} from './rules-core.js?v=20260731.1';

function hasCompletedDistributionRound(loads, unit = 1) {
  return loads.length > 0 && loads.reduce((sum, load) => sum + load, 0) >= loads.length * unit;
}

function applyBundlingRules({ state, dateIso, role, staffId, push, recommend }) {
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  const prevIso = toLocalIso(addDays(date, -1));
  const nextIso = toLocalIso(addDays(date, 1));

  const requirePerson = (requiredId, okReason, conflictReason) => {
    if (!requiredId) return;
    if (staffId === requiredId) recommend(okReason, 60);
    else push('red', conflictReason);
  };

  // AA-Freitags-BD: Freitag-HG = Person des Samstags-BD.
  if (weekday === 5 && role === 'hg') {
    const fridayBd = getAssignment(state, dateIso, 'bd');
    const saturdayBd = getAssignment(state, nextIso, 'bd');
    if (isAaOn(state, fridayBd, dateIso) && saturdayBd) {
      requirePerson(saturdayBd, 'Kopplung: Freitag-HG passend zum Samstags-BD', 'Kopplung: Bei AA-Freitags-BD muss der Samstags-BD den Freitag-HG übernehmen');
    }
  }
  if (weekday === 6 && role === 'bd') {
    const fridayBd = getAssignment(state, prevIso, 'bd');
    const fridayHg = getAssignment(state, prevIso, 'hg');
    if (isAaOn(state, fridayBd, prevIso) && fridayHg) {
      requirePerson(fridayHg, 'Kopplung: Samstags-BD passend zum Freitag-HG', 'Kopplung: Samstags-BD muss bei AA-Freitags-BD dem Freitag-HG entsprechen');
    }
  }
  if (weekday === 5 && role === 'bd' && isAaOn(state, staffId, dateIso)) {
    const fridayHg = getAssignment(state, dateIso, 'hg');
    const saturdayBd = getAssignment(state, nextIso, 'bd');
    if (fridayHg && saturdayBd && fridayHg !== saturdayBd) push('red', 'Kopplung: AA-Freitags-BD erfordert identische Person in Freitag-HG und Samstags-BD');
  }

  // Samstags-BD: dieselbe Person übernimmt den Sonntag-HG.
  if (weekday === 0 && role === 'hg') {
    const saturdayBd = getAssignment(state, prevIso, 'bd');
    if (saturdayBd && isFaOn(state, saturdayBd, prevIso)) {
      requirePerson(saturdayBd, 'Kopplung: Sonntag-HG passend zum Samstags-BD', 'Kopplung: Sonntag-HG muss durch den Samstags-BD übernommen werden');
    }
  }
  if (weekday === 6 && role === 'bd') {
    const sundayHg = getAssignment(state, nextIso, 'hg');
    if (sundayHg) requirePerson(sundayHg, 'Kopplung: Samstags-BD passend zum Sonntag-HG', 'Kopplung: Samstags-BD muss dem bereits eingetragenen Sonntag-HG entsprechen');
  }

  // AA-BD am Feiertagsvortag: Vortags-HG = Person des Feiertags-BD.
  if (isHoliday(nextIso) && role === 'hg') {
    const eveBd = getAssignment(state, dateIso, 'bd');
    const holidayBd = getAssignment(state, nextIso, 'bd');
    if (isAaOn(state, eveBd, dateIso) && holidayBd) {
      requirePerson(holidayBd, 'Kopplung: Vortags-HG passend zum Feiertags-BD', 'Kopplung: Bei AA-BD am Feiertagsvortag muss der Feiertags-BD den Vortags-HG übernehmen');
    }
  }
  if (isHoliday(dateIso) && role === 'bd') {
    const eveBd = getAssignment(state, prevIso, 'bd');
    const eveHg = getAssignment(state, prevIso, 'hg');
    if (isAaOn(state, eveBd, prevIso) && eveHg) {
      requirePerson(eveHg, 'Kopplung: Feiertags-BD passend zum Vortags-HG', 'Kopplung: Feiertags-BD muss bei AA-BD am Vortag dem Vortags-HG entsprechen');
    }
  }
  if (isHoliday(nextIso) && role === 'bd' && isAaOn(state, staffId, dateIso)) {
    const eveHg = getAssignment(state, dateIso, 'hg');
    const holidayBd = getAssignment(state, nextIso, 'bd');
    if (eveHg && holidayBd && eveHg !== holidayBd) push('red', 'Kopplung: AA-BD am Feiertagsvortag erfordert identische Person in Vortags-HG und Feiertags-BD');
  }
}

function applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, push, recommend, note }) {
  const person = getStaffById(state.staff, staffId);
  const peers = basicallyEligiblePeers(state, monthData, dateIso, 'bd');
  const targetStaff = getPlanningStaff(state.staff, dateIso).filter(peer => (peer.bdTarget || 0) > 0);
  const monthlyBalanceEnabled = targetStaff.some(peer =>
    countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) >= (peer.bdTarget || 0)
  );
  const deficits = peers.map(peer => ({
    id: peer.id,
    value: Math.max(0, (peer.bdTarget || 0) - countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso))
  }));
  const ownDeficit = Math.max(0, (person.bdTarget || 0) - currentBd);
  const maxDeficit = Math.max(0, ...deficits.map(item => item.value));

  if (monthlyBalanceEnabled && maxDeficit > 0) {
    if (ownDeficit === maxDeficit) recommend(`Monatsausgleich: noch ${ownDeficit} BD bis zum Soll`, 25 + ownDeficit);
    else push('yellow', `Monatsausgleich: andere geeignete Personen haben größeren BD-Rückstand (${maxDeficit} statt ${ownDeficit})`);
  }

  const positiveWishExists = peers.some(peer => peer.id !== 'lurz' && isPositivePreference(getPreference(monthData, peer.id, dateIso), 'bd'));
  const allReached = peers.length > 0 && peers.every(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) >= (peer.bdTarget || 0));
  const lurz = getStaffById(state.staff, 'lurz');
  const lurzBd = countRoleInMonthExcept(monthData, 'lurz', 'bd', dateIso);
  const lurzNotOverTarget = !lurz?.bdTarget || lurzBd <= lurz.bdTarget;
  const firstOverhangOpen = allReached
    && lurzNotOverTarget
    && peers.every(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) <= (peer.bdTarget || 0));
  if (firstOverhangOpen && !positiveWishExists) {
    if (staffId === 'lurz' && currentBd === (person.bdTarget || 0)) recommend('Erster BD-Überhang nach Monatsausgleich bevorzugt bei Dr. Lurz', 35);
    else if (peers.some(peer => peer.id === 'lurz' && countRoleInMonthExcept(monthData, 'lurz', 'bd', dateIso) === (peer.bdTarget || 0))) {
      push('yellow', 'Erster BD-Überhang nach Monatsausgleich nachrangig gegenüber Dr. Lurz');
    }
  }

  const currentMonth = Number(dateIso.slice(5, 7));
  const year = Number(dateIso.slice(0, 4));
  if (hasCompleteLoadedHistory(state, year, currentMonth)) {
    const comparable = peers.filter(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) === currentBd);
    if (comparable.length > 1) {
      const histories = comparable.map(peer => countServicesInLoadedYearExcept(state, peer.id, year, dateIso, currentMonth));
      const minimum = Math.min(...histories);
      const own = countServicesInLoadedYearExcept(state, staffId, year, dateIso, currentMonth);
      if (own === minimum) note(`Jahresverlauf: niedrigste bisherige Dienstlast (${own})`);
      else note(`Jahresverlauf: höhere bisherige Dienstlast (${own} statt ${minimum})`);
    }
  }
}

function applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend, note }) {
  const peers = basicallyEligiblePeers(state, monthData, dateIso, 'hg');
  if (!peers.length) return;
  const totals = peers.map(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) + countRoleInMonthExcept(monthData, peer.id, 'hg', dateIso));
  const minimumTotal = Math.min(...totals);
  const ownTotal = currentBd + currentHg;
  const monthlyRoundComplete = hasCompletedDistributionRound(totals);
  if (ownTotal === minimumTotal) recommend('BD/HG-Ausgleich: aktuell geringste kombinierte Monatslast', 24);
  else if (monthlyRoundComplete) push('yellow', `BD/HG-Ausgleich: andere Fachärzte haben geringere kombinierte Monatslast (${minimumTotal} statt ${ownTotal})`);
  else note(`BD/HG-Ausgleich: erste Verteilungsrunde noch offen; andere Fachärzte haben geringere kombinierte Monatslast (${minimumTotal} statt ${ownTotal})`);

  const currentDayBd = getAssignment(state, dateIso, 'bd');
  if (isAaOn(state, currentDayBd, dateIso)) {
    const aaHgCounts = peers.map(peer => countHgForAaBdExcept(state, monthData, peer.id, dateIso));
    const minimumAaHg = Math.min(...aaHgCounts);
    const ownAaHg = countHgForAaBdExcept(state, monthData, staffId, dateIso);
    const aaRoundComplete = hasCompletedDistributionRound(aaHgCounts);
    if (ownAaHg === minimumAaHg) recommend('AA-HG-Ausgleich: aktuell geringste Zahl belastender HG für AA', 18);
    else if (aaRoundComplete) push('yellow', `AA-HG-Ausgleich: andere Fachärzte haben weniger HG für AA (${minimumAaHg} statt ${ownAaHg})`);
    else note(`AA-HG-Ausgleich: erste Verteilungsrunde noch offen; andere Fachärzte haben weniger HG für AA (${minimumAaHg} statt ${ownAaHg})`);
  }

  const currentMonth = Number(dateIso.slice(5, 7));
  const year = Number(dateIso.slice(0, 4));
  if (hasCompleteLoadedHistory(state, year, currentMonth)) {
    const comparable = peers.filter(peer => {
      const bd = countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso);
      const hg = countRoleInMonthExcept(monthData, peer.id, 'hg', dateIso);
      return bd + hg === ownTotal;
    });
    if (comparable.length > 1) {
      const histories = comparable.map(peer => countServicesInLoadedYearExcept(state, peer.id, year, dateIso, currentMonth));
      const minimum = Math.min(...histories);
      const own = countServicesInLoadedYearExcept(state, staffId, year, dateIso, currentMonth);
      if (own === minimum) note(`Jahresverlauf: niedrigste bisherige Dienstlast (${own})`);
      else note(`Jahresverlauf: höhere bisherige Dienstlast (${own} statt ${minimum})`);
    }
  }
}

function applyWeekendFairness({ state, monthData, dateIso, role, staffId, push, recommend, note }) {
  const date = parseIso(dateIso);
  if (![5, 6, 0].includes(date.getDay())) return;
  const projected = projectedWeekendEquivalent(monthData, staffId, dateIso, role);
  const peers = basicallyEligiblePeers(state, monthData, dateIso, role);
  const peerLoads = peers.map(peer => weekendEquivalentFromMap(weekendMap(monthData, peer.id, dateIso)));
  const minimum = peerLoads.length ? Math.min(...peerLoads) : 0;
  const ownBase = weekendEquivalentFromMap(weekendMap(monthData, staffId, dateIso));
  const weekendRoundComplete = hasCompletedDistributionRound(peerLoads, 0.5);

  if (ownBase === minimum) recommend(`Wochenend-Ausgleich: aktuell geringste Belastung (${ownBase.toFixed(1)})`, 20);
  else if (weekendRoundComplete) push('yellow', `Wochenend-Ausgleich: andere geeignete Personen liegen niedriger (${minimum.toFixed(1)} statt ${ownBase.toFixed(1)})`);
  else note(`Wochenend-Ausgleich: erste Verteilungsrunde noch offen; andere geeignete Personen liegen niedriger (${minimum.toFixed(1)} statt ${ownBase.toFixed(1)})`);
  if (projected > 1) push('yellow', `Wochenendziel 1,0 würde auf ${projected.toFixed(1)} steigen`);

  if (role === 'bd' && date.getDay() === 6 && countSaturdayBdExcept(monthData, staffId, dateIso) >= 1) {
    push('orange', 'Weiterer Samstags-BD im selben Monat; strenge Rotation bevorzugt andere Fachärzte');
  }
}

export function evaluateCandidate({ state, monthData, dateIso, role, staffId }) {
  const person = getStaffById(state.staff, staffId);
  if (!person) return { level: 'gray', reasons: ['Unbekannte Person'], canSelect: false, meta: { recommendationScore: 0 } };

  const roleProps = getRoleProperties(person, dateIso);
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  let level = 'green';
  let blocked = false;
  let recommendationScore = 0;
  const reasons = [];
  const seenReasons = new Set();
  const addReason = reason => {
    if (!reason || seenReasons.has(reason)) return;
    seenReasons.add(reason);
    reasons.push(reason);
  };
  const push = (nextLevel, reason) => {
    if (nextLevel === 'gray') blocked = true;
    else if (severityRank[nextLevel] > severityRank[level]) level = nextLevel;
    addReason(reason);
  };
  const recommend = (reason, score = 1) => {
    recommendationScore += score;
    addReason(reason);
  };
  const note = addReason;

  if (!person.includeInPlanning) push('gray', 'Nicht im aktiven Dienstpool');
  if (!isStaffActiveOn(person, dateIso)) push('gray', 'Zu diesem Zeitpunkt noch nicht bzw. nicht mehr aktiv');

  const currentBd = countRoleInMonthExcept(monthData, staffId, 'bd', dateIso);
  const currentHg = countRoleInMonthExcept(monthData, staffId, 'hg', dateIso);
  if (role === 'bd' && monthData.days?.[dateIso]?.hg === staffId) push('red', 'Gleichzeitige Einteilung in HG und BD am selben Tag');
  if (role === 'hg' && monthData.days?.[dateIso]?.bd === staffId) push('red', 'Gleichzeitige Einteilung in BD und HG am selben Tag');

  const absence = getEffectiveAbsence(state, monthData, staffId, dateIso);
  if (absence) push('red', `${labelForAbsence(absence)} eingetragen`);
  const preference = getPreference(monthData, staffId, dateIso);
  if (preference === 'kein-dienst') push('red', 'Wunsch: kein Dienst');
  if (preference === 'kein-bd' && role === 'bd') push('red', 'Wunsch: kein BD');
  if (preference === 'kein-hg' && role === 'hg') push('red', 'Wunsch: kein HG');
  if (preference === 'bd-bevorzugt' && role === 'bd') recommend('Wunsch: BD bevorzugt', 100);
  if (preference === 'hg-bevorzugt' && role === 'hg') recommend('Wunsch: HG bevorzugt', 100);
  if (preference === 'dienst-bevorzugt') recommend('Wunsch: Dienst bevorzugt', 100);

  if (role === 'hg' && !roleProps.canHg) push('red', 'HG nur für Fachärzte zulässig');
  if (role === 'bd' && weekday === 6 && !roleProps.canSaturdayBd) push('red', 'Samstags-BD nur für Fachärzte zulässig');

  if (person.id === 'polednia' && [0, 2].includes(weekday) && (role === 'bd' || role === 'hg')) push('red', 'Dr. Polednia dienstags und sonntags weder BD noch HG');
  if (person.id === 'becker' && role === 'bd' && weekday === 6) push('orange', 'Samstags-BD für Dr. Becker nur nachrangig');
  if (person.id === 'dalitz' && role === 'hg' && [0, 1].includes(weekday) && monthData.days?.[dateIso]?.bd === 'sebastian') push('orange', 'Dalitz-HG an So/Mo bei Sebastian-BD nur nachrangig');

  applyBundlingRules({ state, dateIso, role, staffId, push, recommend });

  const prevDateIso = toLocalIso(addDays(date, -1));
  if (role === 'bd') {
    const ownBdDates = listOwnRoleDates(state, staffId, 'bd').filter(iso => iso !== dateIso).concat(dateIso).sort();
    const idx = ownBdDates.indexOf(dateIso);
    if (idx > 0) {
      const prevBd = parseIso(ownBdDates[idx - 1]);
      const diff = Math.round((date - prevBd) / 86400000);
      const middleDate = addDays(date, -1);
      const middleIso = toLocalIso(middleDate);
      const middleMonth = monthForIso(state, middleIso) || monthData;
      const isWeekdayPattern = [prevBd, middleDate, date].every(item => item.getDay() >= 1 && item.getDay() <= 5);
      const isBdFzaBd = diff === 2 && isWeekdayPattern && getEffectiveAbsence(state, middleMonth, staffId, middleIso) === 'fza';
      if (diff === 1) push('yellow', 'BD bereits am Vortag');
      else if (isBdFzaBd) push('yellow', 'BD–FZA–BD werktags');
      else if (diff > 1 && diff < 4) push('yellow', 'Kurzer Abstand zum letzten BD');
    }
    if (idx >= 0 && idx < ownBdDates.length - 1) {
      const nextBd = parseIso(ownBdDates[idx + 1]);
      const diffForward = Math.round((nextBd - date) / 86400000);
      if (diffForward === 1) push('yellow', 'BD bereits am Folgetag');
      else if (diffForward > 1 && diffForward < 4) push('yellow', 'Kurzer Abstand zum nächsten BD');
    }

    if (person.maxBd && currentBd >= person.maxBd) push('red', `Monatsmaximum von ${person.maxBd} BD bereits erreicht`);
    else if (person.bdTarget && currentBd >= person.bdTarget) push('yellow', `BD-Richtwert ${person.bdTarget} bereits erreicht`);

    const nextIso = toLocalIso(addDays(date, 1));
    if (!absence && getAbsenceFromState(state, staffId, nextIso) === 'urlaub') push('orange', 'BD unmittelbar vor Urlaubsbeginn');
    if (weekday === 4 && hasVacationInFollowingWeek(state, staffId, dateIso)) recommend('Donnerstags-BD als Urlaubsverlängerer vor Urlaub in der Folgewoche', 45);

    if (person.id === 'becker' && isFirstRegularWorkdayAfter(dateIso, iso => parseIso(iso).getDay() === 6 && getAssignment(state, iso, 'bd') === 'becker')) {
      push('red', 'Nächster regulärer Werktag nach Samstags-BD für Dr. Becker für BD gesperrt');
    }

    const previousHg = getAssignment(state, prevDateIso, 'hg');
    const previousBd = getAssignment(state, prevDateIso, 'bd');
    const fridaySaturdayBundle = weekday === 6;
    const previousBdWasFa = isFaOn(state, previousBd, prevDateIso);
    if (previousHg === staffId && !fridaySaturdayBundle && !previousBdWasFa) push('orange', 'Eigener HG am Vortag vor BD');

    applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, push, recommend, note });
    applyWeekendWarnings(state, staffId, date, 'bd', push);
    applyWeekendFairness({ state, monthData, dateIso, role, staffId, push, recommend, note });
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  if (role === 'hg') {
    const hgAt = offset => getAssignment(state, toLocalIso(addDays(date, offset)), 'hg') === staffId;
    const neighbours = [-3, -2, -1, 1, 2, 3].filter(hgAt);
    const threeConsecutive = (hgAt(-2) && hgAt(-1)) || (hgAt(-1) && hgAt(1)) || (hgAt(1) && hgAt(2));
    if (threeConsecutive) push('orange', 'Dritter HG an drei aufeinanderfolgenden Tagen');
    else if (neighbours.length) push('yellow', 'Erneuter HG innerhalb von 3 Kalendertagen');

    const nextIso = toLocalIso(addDays(date, 1));
    const ownBdNext = getAssignment(state, nextIso, 'bd') === staffId;
    const fridaySaturdayBundle = weekday === 5;
    const todayBd = getAssignment(state, dateIso, 'bd');
    const todayBdIsFa = isFaOn(state, todayBd, dateIso);
    if (ownBdNext && !fridaySaturdayBundle && !todayBdIsFa) push('orange', 'HG am Tag vor eigenem BD');

    applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, push, recommend, note });
    applyWeekendWarnings(state, staffId, date, 'hg', push);
    applyWeekendFairness({ state, monthData, dateIso, role, staffId, push, recommend, note });
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  if (level === 'green' && reasons.length === 0) reasons.push('Keine relevanten Konflikte');
  const meta = {
    currentBd,
    currentHg,
    recommendationScore,
    historicalServices: countServicesInLoadedYearExcept(state, staffId, Number(dateIso.slice(0, 4)), dateIso, Number(dateIso.slice(5, 7)))
  };
  if (blocked) return { level: 'gray', reasons, canSelect: false, meta };
  return { level, reasons, canSelect: true, meta };
}

function applyWeekendWarnings(state, staffId, date, role, push) {
  const weekday = date.getDay();
  if (![5, 6, 0].includes(weekday)) return;
  const friday = new Date(date);
  friday.setDate(date.getDate() - ((weekday + 2) % 7));
  const weekend = offset => {
    const start = addDays(friday, offset);
    const dates = [0, 1, 2].map(index => toLocalIso(addDays(start, index)));
    return {
      bd: dates.some(iso => getAssignment(state, iso, 'bd') === staffId),
      hg: dates.some(iso => getAssignment(state, iso, 'hg') === staffId)
    };
  };
  const neighbours = [weekend(-7), weekend(7)];
  const adjacentBd = neighbours.some(item => item.bd);
  const adjacentService = neighbours.some(item => item.bd || item.hg);
  if (!adjacentService) return;
  if (role === 'bd' && adjacentBd) push('red', 'BD-Wochenende direkt neben BD-Wochenende');
  else push('orange', 'Dienst an aufeinanderfolgenden Wochenenden');
}

function applyHolidayBlockWarnings(state, staffId, date, push) {
  const { easterBlock, pentecostBlock } = holidayBlocks(date.getFullYear());
  const iso = toLocalIso(date);
  const inEaster = easterBlock.includes(iso);
  const inPentecost = pentecostBlock.includes(iso);
  if (!inEaster && !inPentecost) return;
  const otherBlock = inEaster ? pentecostBlock : easterBlock;
  if (otherBlock.some(day => getAssignment(state, day, 'bd') === staffId || getAssignment(state, day, 'hg') === staffId)) {
    push('orange', 'Bereits Dienst im alternierenden Oster-/Pfingstblock');
  }
}

