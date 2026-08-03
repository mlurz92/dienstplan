import { holidayBlocks, isFirstRegularWorkdayAfter, isHoliday } from './holidays.js?v=20260803.2';
import {
  addDays, countHgForAaBdExcept, countRoleInMonthExcept, countSaturdayBdExcept,
  countServicesInLoadedYearExcept, getAbsenceFromState, getEffectiveAbsence,
  getAssignment, getPlanningStaff, getPreference, getRoleProperties, getStaffById,
  hasCompleteLoadedHistory, hasOption, isAaOn, isFaOn, isPositivePreference,
  isStaffActiveOn, labelForAbsence, listOwnRoleDates, monthForIso, parseIso,
  projectedWeekendEquivalent, severityRank, toLocalIso, weekendEquivalentFromMap, weekendMap
} from './rules-core.js?v=20260803.2';

export const RECOMMENDATION_LANES = Object.freeze([
  'coupling',
  'wish',
  'option',
  'monthly',
  'weekend',
  'other'
]);

const RECOMMENDATION_LANE_INDEX = new Map(RECOMMENDATION_LANES.map((lane, index) => [lane, index]));
const SELECTION_PRIORITY = Object.freeze({ normal: 0, standard: 1, special: 2, blocked: 3 });
const REASON_KIND_PRIORITY = Object.freeze({ conflict: 0, confirmation: 1, recommendation: 2, note: 3 });

function hasCompletedDistributionRound(loads, unit = 1) {
  return loads.length > 0 && loads.reduce((sum, load) => sum + load, 0) >= loads.length * unit;
}

function createEvaluationCollector() {
  let level = 'green';
  let selectionPolicy = 'normal';
  let recommendationScore = 0;
  const recommendationVector = Array(RECOMMENDATION_LANES.length).fill(0);
  const entries = [];
  const seen = new Set();
  let sequence = 0;

  const add = ({ text, kind, entryLevel = 'green', lane = null, selection = 'normal' }) => {
    if (!text || seen.has(text)) return;
    seen.add(text);
    entries.push({ text, kind, level: entryLevel, lane, selection, sequence: sequence++ });
  };

  const push = (nextLevel, reason, { selection = 'normal' } = {}) => {
    if (nextLevel === 'gray') selection = 'blocked';
    if (nextLevel !== 'gray' && severityRank[nextLevel] > severityRank[level]) level = nextLevel;
    if (nextLevel === 'gray') level = 'gray';
    if (SELECTION_PRIORITY[selection] > SELECTION_PRIORITY[selectionPolicy]) selectionPolicy = selection;
    add({ text: reason, kind: 'conflict', entryLevel: nextLevel, selection });
  };

  const recommend = (reason, lane = 'other', score = 1) => {
    const index = RECOMMENDATION_LANE_INDEX.get(lane) ?? RECOMMENDATION_LANE_INDEX.get('other');
    recommendationVector[index] += score;
    recommendationScore += score;
    add({ text: reason, kind: 'recommendation', entryLevel: 'green', lane });
  };

  const note = reason => add({ text: reason, kind: 'note', entryLevel: 'green' });

  const snapshot = () => ({ level, selectionPolicy });

  const finalize = meta => {
    if (level === 'red' && selectionPolicy === 'special') {
      add({
        text: 'Besondere Bestätigung erforderlich',
        kind: 'confirmation',
        entryLevel: 'red',
        selection: 'special'
      });
    }

    entries.sort((left, right) => {
      const kindDifference = REASON_KIND_PRIORITY[left.kind] - REASON_KIND_PRIORITY[right.kind];
      if (kindDifference) return kindDifference;
      if (left.kind === 'conflict') {
        const severityDifference = severityRank[right.level] - severityRank[left.level];
        if (severityDifference) return severityDifference;
        const selectionDifference = SELECTION_PRIORITY[right.selection] - SELECTION_PRIORITY[left.selection];
        if (selectionDifference) return selectionDifference;
      }
      if (left.kind === 'recommendation') {
        const laneDifference = (RECOMMENDATION_LANE_INDEX.get(left.lane) ?? 99)
          - (RECOMMENDATION_LANE_INDEX.get(right.lane) ?? 99);
        if (laneDifference) return laneDifference;
      }
      return left.sequence - right.sequence;
    });

    if (level === 'green' && entries.length === 0) {
      add({ text: 'Keine relevanten Konflikte', kind: 'note', entryLevel: 'green' });
    }

    const reasonDetails = entries.map(({ sequence: _sequence, ...entry }) => entry);
    const confirmationType = level === 'red'
      ? (selectionPolicy === 'special' ? 'special' : 'standard')
      : null;
    const canSelect = selectionPolicy !== 'blocked' && level !== 'gray';

    return {
      level,
      reasons: reasonDetails.map(entry => entry.text),
      reasonDetails,
      canSelect,
      meta: {
        ...meta,
        recommendationScore,
        recommendationVector,
        confirmationType,
        selectionPolicy
      }
    };
  };

  return { push, recommend, note, snapshot, finalize };
}

function applyBundlingRules({ state, dateIso, role, staffId, push, recommend, note }) {
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  const prevIso = toLocalIso(addDays(date, -1));
  const nextIso = toLocalIso(addDays(date, 1));

  const requirePerson = (requiredId, okReason, conflictReason) => {
    if (!requiredId) return;
    if (staffId === requiredId) recommend(okReason, 'coupling', 60);
    else push('red', conflictReason);
  };

  // AA-Freitags-BD: Freitag-HG = Person des Samstags-BD.
  if (weekday === 5 && role === 'hg') {
    const fridayBd = getAssignment(state, dateIso, 'bd');
    const saturdayBd = getAssignment(state, nextIso, 'bd');
    if (isAaOn(state, fridayBd, dateIso)) {
      if (saturdayBd) {
        requirePerson(
          saturdayBd,
          'Kopplung: Freitag-HG passend zum Samstags-BD',
          'Kopplung: Bei AA-Freitags-BD muss der Samstags-BD den Freitag-HG übernehmen'
        );
      } else {
        note('Kopplung offen: Ein späterer Samstags-BD muss mit diesem Freitag-HG übereinstimmen');
      }
    }
  }
  if (weekday === 6 && role === 'bd') {
    const fridayBd = getAssignment(state, prevIso, 'bd');
    const fridayHg = getAssignment(state, prevIso, 'hg');
    if (isAaOn(state, fridayBd, prevIso)) {
      if (fridayHg) {
        requirePerson(
          fridayHg,
          'Kopplung: Samstags-BD passend zum Freitag-HG',
          'Kopplung: Samstags-BD muss bei AA-Freitags-BD dem Freitag-HG entsprechen'
        );
      } else {
        note('Kopplung offen: Der Freitag-HG muss mit diesem Samstags-BD übereinstimmen');
      }
    }
  }
  if (weekday === 5 && role === 'bd' && isAaOn(state, staffId, dateIso)) {
    const fridayHg = getAssignment(state, dateIso, 'hg');
    const saturdayBd = getAssignment(state, nextIso, 'bd');
    if (fridayHg && saturdayBd && fridayHg !== saturdayBd) {
      push('red', 'Kopplung: AA-Freitags-BD erfordert identische Person in Freitag-HG und Samstags-BD');
    } else if (!fridayHg || !saturdayBd) {
      note('Kopplung offen: Freitag-HG und Samstags-BD müssen später identisch besetzt werden');
    }
  }

  // Samstags-BD: dieselbe Person übernimmt den Sonntag-HG.
  if (weekday === 0 && role === 'hg') {
    const saturdayBd = getAssignment(state, prevIso, 'bd');
    if (saturdayBd && isFaOn(state, saturdayBd, prevIso)) {
      requirePerson(
        saturdayBd,
        'Kopplung: Sonntag-HG passend zum Samstags-BD',
        'Kopplung: Sonntag-HG muss durch den Samstags-BD übernommen werden'
      );
    } else if (!saturdayBd) {
      note('Kopplung offen: Ein späterer Samstags-BD muss mit diesem Sonntag-HG übereinstimmen');
    }
  }
  if (weekday === 6 && role === 'bd') {
    const sundayHg = getAssignment(state, nextIso, 'hg');
    if (sundayHg) {
      requirePerson(
        sundayHg,
        'Kopplung: Samstags-BD passend zum Sonntag-HG',
        'Kopplung: Samstags-BD muss dem bereits eingetragenen Sonntag-HG entsprechen'
      );
    } else {
      note('Kopplung offen: Der Sonntag-HG muss durch diese Person übernommen werden');
    }
  }

  // AA-BD am Feiertagsvortag: Vortags-HG = Person des Feiertags-BD.
  if (isHoliday(nextIso) && role === 'hg') {
    const eveBd = getAssignment(state, dateIso, 'bd');
    const holidayBd = getAssignment(state, nextIso, 'bd');
    if (isAaOn(state, eveBd, dateIso)) {
      if (holidayBd) {
        requirePerson(
          holidayBd,
          'Kopplung: Vortags-HG passend zum Feiertags-BD',
          'Kopplung: Bei AA-BD am Feiertagsvortag muss der Feiertags-BD den Vortags-HG übernehmen'
        );
      } else {
        note('Kopplung offen: Ein späterer Feiertags-BD muss mit diesem Vortags-HG übereinstimmen');
      }
    }
  }
  if (isHoliday(dateIso) && role === 'bd') {
    const eveBd = getAssignment(state, prevIso, 'bd');
    const eveHg = getAssignment(state, prevIso, 'hg');
    if (isAaOn(state, eveBd, prevIso)) {
      if (eveHg) {
        requirePerson(
          eveHg,
          'Kopplung: Feiertags-BD passend zum Vortags-HG',
          'Kopplung: Feiertags-BD muss bei AA-BD am Vortag dem Vortags-HG entsprechen'
        );
      } else {
        note('Kopplung offen: Der Vortags-HG muss mit diesem Feiertags-BD übereinstimmen');
      }
    }
  }
  if (isHoliday(nextIso) && role === 'bd' && isAaOn(state, staffId, dateIso)) {
    const eveHg = getAssignment(state, dateIso, 'hg');
    const holidayBd = getAssignment(state, nextIso, 'bd');
    if (eveHg && holidayBd && eveHg !== holidayBd) {
      push('red', 'Kopplung: AA-BD am Feiertagsvortag erfordert identische Person in Vortags-HG und Feiertags-BD');
    } else if (!eveHg || !holidayBd) {
      note('Kopplung offen: Vortags-HG und Feiertags-BD müssen später identisch besetzt werden');
    }
  }
}

function followingWeekVacationBlock(state, staffId, dateIso) {
  const date = parseIso(dateIso);
  const daysToMonday = ((8 - date.getDay()) % 7) || 7;
  const monday = addDays(date, daysToMonday);
  const mondayIso = toLocalIso(monday);
  if (getAbsenceFromState(state, staffId, mondayIso) !== 'urlaub') return null;

  let start = new Date(monday);
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = addDays(monday, -offset);
    if (getAbsenceFromState(state, staffId, toLocalIso(candidate)) !== 'urlaub') break;
    start = candidate;
  }

  let end = new Date(monday);
  for (let offset = 1; offset <= 31; offset += 1) {
    const candidate = addDays(monday, offset);
    if (getAbsenceFromState(state, staffId, toLocalIso(candidate)) !== 'urlaub') break;
    end = candidate;
  }

  return {
    startIso: toLocalIso(start),
    mondayIso,
    endIso: toLocalIso(end)
  };
}

function projectedAssignment(state, dateIso, role, candidateDateIso, candidateRole, staffId) {
  if (dateIso === candidateDateIso && role === candidateRole) return staffId;
  return getAssignment(state, dateIso, role);
}

function applyWeekendBundleWarning({ state, dateIso, role, staffId, push }) {
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  if (![5, 6, 0].includes(weekday)) return;

  const friday = addDays(date, -((weekday + 2) % 7));
  const fridayIso = toLocalIso(friday);
  const saturdayIso = toLocalIso(addDays(friday, 1));
  const sundayIso = toLocalIso(addDays(friday, 2));
  const slots = [];

  for (const iso of [fridayIso, saturdayIso, sundayIso]) {
    for (const slotRole of ['bd', 'hg']) {
      if (projectedAssignment(state, iso, slotRole, dateIso, role, staffId) === staffId) {
        slots.push(`${iso}:${slotRole}`);
      }
    }
  }

  if (slots.length < 2) return;
  const covered = new Set();
  const fridayHg = `${fridayIso}:hg`;
  const saturdayBd = `${saturdayIso}:bd`;
  const sundayHg = `${sundayIso}:hg`;
  const fridayBdValue = projectedAssignment(state, fridayIso, 'bd', dateIso, role, staffId);

  if (slots.includes(fridayHg) && slots.includes(saturdayBd) && isAaOn(state, fridayBdValue, fridayIso)) {
    covered.add(fridayHg);
    covered.add(saturdayBd);
  }
  if (slots.includes(saturdayBd) && slots.includes(sundayHg) && isFaOn(state, staffId, saturdayIso)) {
    covered.add(saturdayBd);
    covered.add(sundayHg);
  }

  if (slots.some(slot => !covered.has(slot))) {
    push('yellow', 'Zusätzliche nicht gekoppelte Mehrfachbelastung am selben Wochenende');
  }
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

function evaluateCandidateInternal({ state, monthData, dateIso, role, staffId, includeFairness }) {
  const person = getStaffById(state.staff, staffId);
  if (!person) {
    return {
      level: 'gray',
      reasons: ['Unbekannte Person'],
      reasonDetails: [{ text: 'Unbekannte Person', kind: 'conflict', level: 'gray', lane: null, selection: 'blocked' }],
      canSelect: false,
      meta: {
        currentBd: 0,
        currentHg: 0,
        combinedLoad: 0,
        aaHgCount: 0,
        recommendationScore: 0,
        recommendationVector: Array(RECOMMENDATION_LANES.length).fill(0),
        confirmationType: null,
        selectionPolicy: 'blocked',
        historicalServices: 0
      }
    };
  }

  const collector = createEvaluationCollector();
  const { push, recommend, note } = collector;
  const roleProps = getRoleProperties(person, dateIso);
  const date = parseIso(dateIso);
  const weekday = date.getDay();

  if (role !== 'bd' && role !== 'hg') {
    push('gray', 'Unbekannte Dienstrolle', { selection: 'blocked' });
    return collector.finalize({ currentBd: 0, currentHg: 0, combinedLoad: 0, aaHgCount: 0, historicalServices: 0 });
  }

  if (!person.includeInPlanning) push('gray', 'Nicht im aktiven Dienstpool', { selection: 'blocked' });
  if (!isStaffActiveOn(person, dateIso)) push('gray', 'Zu diesem Zeitpunkt noch nicht bzw. nicht mehr aktiv', { selection: 'blocked' });

  const currentBd = countRoleInMonthExcept(monthData, staffId, 'bd', dateIso);
  const currentHg = countRoleInMonthExcept(monthData, staffId, 'hg', dateIso);
  const combinedLoad = currentBd + currentHg;
  const aaHgCount = countHgForAaBdExcept(state, monthData, staffId, dateIso);

  if (role === 'bd' && monthData.days?.[dateIso]?.hg === staffId) {
    push('red', 'Gleichzeitige Einteilung in HG und BD am selben Tag', { selection: 'blocked' });
  }
  if (role === 'hg' && monthData.days?.[dateIso]?.bd === staffId) {
    push('red', 'Gleichzeitige Einteilung in BD und HG am selben Tag', { selection: 'blocked' });
  }

  const absence = getEffectiveAbsence(state, monthData, staffId, dateIso);
  if (absence) push('red', `${labelForAbsence(absence)} eingetragen`, { selection: 'special' });

  const preference = getPreference(monthData, staffId, dateIso);
  if (preference === 'kein-dienst') push('red', 'Wunsch: kein Dienst');
  if (preference === 'kein-bd' && role === 'bd') push('red', 'Wunsch: kein BD');
  if (preference === 'kein-hg' && role === 'hg') push('red', 'Wunsch: kein HG');
  if (preference === 'bd-bevorzugt' && role === 'bd') recommend('Wunsch: BD bevorzugt', 'wish', 100);
  if (preference === 'hg-bevorzugt' && role === 'hg') recommend('Wunsch: HG bevorzugt', 'wish', 100);
  if (preference === 'dienst-bevorzugt') recommend('Wunsch: Dienst bevorzugt', 'wish', 100);
  if (role === 'bd' && hasOption(monthData, staffId, dateIso, 'bd-moeglich')) {
    recommend('Option: BD möglich', 'option', 45);
  }
  if (role === 'hg' && hasOption(monthData, staffId, dateIso, 'hg-moeglich')) {
    recommend('Option: HG möglich', 'option', 45);
  }

  if (role === 'hg' && !roleProps.canHg) {
    push('red', 'HG nur für Fachärzte zulässig', { selection: 'blocked' });
  }
  if (role === 'bd' && weekday === 6 && !roleProps.canSaturdayBd) {
    push('red', 'Samstags-BD nur für Fachärzte zulässig', { selection: 'blocked' });
  }

  if (person.id === 'polednia' && [0, 2].includes(weekday)) {
    push('red', 'Dr. Polednia dienstags und sonntags weder BD noch HG', { selection: 'special' });
  }
  if (person.id === 'becker' && role === 'bd' && weekday === 6) {
    push('orange', 'Samstags-BD für Dr. Becker nur nachrangig');
  }
  if (person.id === 'dalitz' && role === 'hg' && [0, 1].includes(weekday) && monthData.days?.[dateIso]?.bd === 'sebastian') {
    push('orange', 'Dalitz-HG an So/Mo bei Sebastian-BD nur nachrangig');
  }

  applyBundlingRules({ state, dateIso, role, staffId, push, recommend, note });

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
      if (diff === 1) push('red', 'BD bereits am Vortag', { selection: 'blocked' });
      else if (isBdFzaBd) push('yellow', 'BD–FZA–BD werktags');
      else if (diff > 1 && diff < 4) push('yellow', 'Kurzer Abstand zum letzten BD');
    }
    if (idx >= 0 && idx < ownBdDates.length - 1) {
      const nextBd = parseIso(ownBdDates[idx + 1]);
      const diffForward = Math.round((nextBd - date) / 86400000);
      const middleDate = addDays(date, 1);
      const middleIso = toLocalIso(middleDate);
      const middleMonth = monthForIso(state, middleIso) || monthData;
      const isWeekdayPattern = [date, middleDate, nextBd].every(item => item.getDay() >= 1 && item.getDay() <= 5);
      const isBdFzaBd = diffForward === 2 && isWeekdayPattern && getEffectiveAbsence(state, middleMonth, staffId, middleIso) === 'fza';
      if (diffForward === 1) push('red', 'BD bereits am Folgetag', { selection: 'blocked' });
      else if (isBdFzaBd) push('yellow', 'BD–FZA–BD werktags');
      else if (diffForward > 1 && diffForward < 4) push('yellow', 'Kurzer Abstand zum nächsten BD');
    }

    if (person.maxBd != null && currentBd >= person.maxBd) {
      push('red', `Monatsmaximum von ${person.maxBd} BD bereits erreicht`, { selection: 'special' });
    } else if (person.bdTarget && currentBd >= person.bdTarget) {
      push('yellow', `BD-Richtwert ${person.bdTarget} bereits erreicht`);
    }

    const nextIso = toLocalIso(addDays(date, 1));
    if (!absence && getAbsenceFromState(state, staffId, nextIso) === 'urlaub') {
      push('orange', 'BD unmittelbar vor Urlaubsbeginn');
    }

    const followingBlock = !absence ? followingWeekVacationBlock(state, staffId, dateIso) : null;
    if (weekday === 5 && followingBlock) {
      push('orange', 'Freitags-BD vor zusammenhängendem Urlaubsblock ab spätestens Montag');
    }
    if (weekday === 4 && followingBlock) {
      recommend(
        'Donnerstags-BD als Urlaubsverlängerer vor zusammenhängendem Urlaubsblock ab spätestens Montag',
        'other',
        45
      );
    }

    if (person.id === 'becker' && isFirstRegularWorkdayAfter(
      dateIso,
      iso => parseIso(iso).getDay() === 6 && getAssignment(state, iso, 'bd') === 'becker'
    )) {
      push('red', 'Nächster regulärer Werktag nach Samstags-BD für Dr. Becker für BD gesperrt', { selection: 'special' });
    }

    const previousHg = getAssignment(state, prevDateIso, 'hg');
    const previousBd = getAssignment(state, prevDateIso, 'bd');
    const fridaySaturdayBundle = weekday === 6;
    const previousBdWasFa = isFaOn(state, previousBd, prevDateIso);
    if (previousHg === staffId && !fridaySaturdayBundle && !previousBdWasFa) {
      push('orange', 'Eigener HG am Vortag vor BD');
    }

    applyWeekendWarnings(state, staffId, date, 'bd', push);
    applyWeekendBundleWarning({ state, dateIso, role, staffId, push });
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
    if (ownBdNext && !fridaySaturdayBundle && !todayBdIsFa) {
      push('orange', 'HG am Tag vor eigenem BD');
    }

    applyWeekendWarnings(state, staffId, date, 'hg', push);
    applyWeekendBundleWarning({ state, dateIso, role, staffId, push });
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  const baseSnapshot = collector.snapshot();
  if (includeFairness && baseSnapshot.level !== 'red' && baseSnapshot.level !== 'gray') {
    const peers = eligiblePeersWithoutRed({ state, monthData, dateIso, role });
    if (role === 'bd') {
      applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, peers, push, recommend, note });
      applyWeekendFairness({ state, monthData, dateIso, role, staffId, peers, push, recommend, note });
    } else {
      applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, peers, push, recommend, note });
      applyWeekendFairness({ state, monthData, dateIso, role, staffId, peers, push, recommend, note });
    }
  }

  return collector.finalize({
    currentBd,
    currentHg,
    combinedLoad,
    aaHgCount,
    historicalServices: countServicesInLoadedYearExcept(
      state,
      staffId,
      Number(dateIso.slice(0, 4)),
      dateIso,
      Number(dateIso.slice(5, 7))
    )
  });
}

/**
 * Zwischenspeicher für die Vergleichsgruppe eines Dienstfelds.
 *
 * Die Fairnessregeln vergleichen eine Person mit allen anderen, die an diesem
 * Tag ohne roten Konflikt einteilbar wären. Diese Vergleichsgruppe hängt nur am
 * Feld und am Monatszustand, nicht an der bewerteten Person – bei neun
 * Kandidaten am selben Feld wurde sie bisher neunmal identisch neu berechnet.
 * Sie ist mit Abstand der teuerste Teil einer Bewertung.
 *
 * Der Speicher ist ausdrücklich abzuschalten und standardmäßig aus: Die
 * Anwendung verändert Monatsdaten an vielen Stellen und würde von einem
 * veralteten Eintrag falsch beraten. Nur der Auto-Plan schaltet ihn ein, und
 * zwar über eine Marke, die den vollständigen Belegungszustand beschreibt.
 * Ändert sich auch nur ein Dienst, ändert sich die Marke und der Speicher wird
 * verworfen. Ein veralteter Treffer ist damit ausgeschlossen.
 */
let peerCacheToken = null;
let peerCache = new Map();

export function setPeerGroupCacheToken(token) {
  if (token === peerCacheToken) return;
  peerCacheToken = token ?? null;
  peerCache = new Map();
}

function computeEligiblePeers({ state, monthData, dateIso, role }) {
  return getPlanningStaff(state.staff, dateIso).filter(person => {
    const base = evaluateCandidateInternal({
      state,
      monthData,
      dateIso,
      role,
      staffId: person.id,
      includeFairness: false
    });
    return base.level !== 'red' && base.level !== 'gray' && base.canSelect !== false;
  });
}

function eligiblePeersWithoutRed(parameters) {
  if (peerCacheToken === null) return computeEligiblePeers(parameters);
  const key = `${parameters.dateIso}|${parameters.role}`;
  const cached = peerCache.get(key);
  if (cached) return cached;
  const peers = computeEligiblePeers(parameters);
  peerCache.set(key, peers);
  return peers;
}

function applyMonthlyBdFairness({ state, monthData, dateIso, staffId, currentBd, peers, push, recommend, note }) {
  const person = getStaffById(state.staff, staffId);
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
    if (ownDeficit === maxDeficit) {
      recommend(`Monatsausgleich: noch ${ownDeficit} BD bis zum Soll`, 'monthly', 25 + ownDeficit);
    } else {
      push('yellow', `Monatsausgleich: andere geeignete Personen haben größeren BD-Rückstand (${maxDeficit} statt ${ownDeficit})`);
    }
  }

  const positiveWishExists = peers.some(peer =>
    peer.id !== 'lurz' && isPositivePreference(getPreference(monthData, peer.id, dateIso), 'bd')
  );
  const allReached = peers.length > 0 && peers.every(peer =>
    countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) >= (peer.bdTarget || 0)
  );
  const lurz = getStaffById(state.staff, 'lurz');
  const lurzBd = countRoleInMonthExcept(monthData, 'lurz', 'bd', dateIso);
  const lurzNotOverTarget = !lurz?.bdTarget || lurzBd <= lurz.bdTarget;
  const firstOverhangOpen = allReached
    && lurzNotOverTarget
    && peers.every(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) <= (peer.bdTarget || 0));

  if (firstOverhangOpen && !positiveWishExists) {
    if (staffId === 'lurz' && currentBd === (person.bdTarget || 0)) {
      recommend('Erster BD-Überhang nach Monatsausgleich bevorzugt bei Dr. Lurz', 'monthly', 35);
    } else if (peers.some(peer =>
      peer.id === 'lurz'
      && countRoleInMonthExcept(monthData, 'lurz', 'bd', dateIso) === (peer.bdTarget || 0)
    )) {
      push('yellow', 'Erster BD-Überhang nach Monatsausgleich nachrangig gegenüber Dr. Lurz');
    }
  }

  const currentMonth = Number(dateIso.slice(5, 7));
  const year = Number(dateIso.slice(0, 4));
  if (hasCompleteLoadedHistory(state, year, currentMonth)) {
    const comparable = peers.filter(peer => countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso) === currentBd);
    if (comparable.length > 1) {
      const histories = comparable.map(peer =>
        countServicesInLoadedYearExcept(state, peer.id, year, dateIso, currentMonth)
      );
      const minimum = Math.min(...histories);
      const own = countServicesInLoadedYearExcept(state, staffId, year, dateIso, currentMonth);
      if (own === minimum) note(`Jahresverlauf: niedrigste bisherige Dienstlast (${own})`);
      else note(`Jahresverlauf: höhere bisherige Dienstlast (${own} statt ${minimum})`);
    }
  }
}

function applyHgFairness({ state, monthData, dateIso, staffId, currentBd, currentHg, peers, push, recommend, note }) {
  if (!peers.length) return;
  const totals = peers.map(peer =>
    countRoleInMonthExcept(monthData, peer.id, 'bd', dateIso)
    + countRoleInMonthExcept(monthData, peer.id, 'hg', dateIso)
  );
  const minimumTotal = Math.min(...totals);
  const ownTotal = currentBd + currentHg;
  const monthlyRoundComplete = hasCompletedDistributionRound(totals);

  if (ownTotal === minimumTotal) {
    recommend('BD/HG-Ausgleich: aktuell geringste kombinierte Monatslast', 'monthly', 24);
  } else if (monthlyRoundComplete) {
    push('yellow', `BD/HG-Ausgleich: andere Fachärzte haben geringere kombinierte Monatslast (${minimumTotal} statt ${ownTotal})`);
  } else {
    note(`BD/HG-Ausgleich: erste Verteilungsrunde noch offen; andere Fachärzte haben geringere kombinierte Monatslast (${minimumTotal} statt ${ownTotal})`);
  }

  const currentDayBd = getAssignment(state, dateIso, 'bd');
  if (isAaOn(state, currentDayBd, dateIso)) {
    const aaHgCounts = peers.map(peer => countHgForAaBdExcept(state, monthData, peer.id, dateIso));
    const minimumAaHg = Math.min(...aaHgCounts);
    const ownAaHg = countHgForAaBdExcept(state, monthData, staffId, dateIso);
    const aaRoundComplete = hasCompletedDistributionRound(aaHgCounts);
    if (ownAaHg === minimumAaHg) {
      recommend('AA-HG-Ausgleich: aktuell geringste Zahl belastender HG für AA', 'monthly', 18);
    } else if (aaRoundComplete) {
      push('yellow', `AA-HG-Ausgleich: andere Fachärzte haben weniger HG für AA (${minimumAaHg} statt ${ownAaHg})`);
    } else {
      note(`AA-HG-Ausgleich: erste Verteilungsrunde noch offen; andere Fachärzte haben weniger HG für AA (${minimumAaHg} statt ${ownAaHg})`);
    }
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
      const histories = comparable.map(peer =>
        countServicesInLoadedYearExcept(state, peer.id, year, dateIso, currentMonth)
      );
      const minimum = Math.min(...histories);
      const own = countServicesInLoadedYearExcept(state, staffId, year, dateIso, currentMonth);
      if (own === minimum) note(`Jahresverlauf: niedrigste bisherige Dienstlast (${own})`);
      else note(`Jahresverlauf: höhere bisherige Dienstlast (${own} statt ${minimum})`);
    }
  }
}

function applyWeekendFairness({ state, monthData, dateIso, role, staffId, peers, push, recommend, note }) {
  const date = parseIso(dateIso);
  if (![5, 6, 0].includes(date.getDay())) return;
  const projected = projectedWeekendEquivalent(monthData, staffId, dateIso, role);
  const peerLoads = peers.map(peer => weekendEquivalentFromMap(weekendMap(monthData, peer.id, dateIso)));
  const minimum = peerLoads.length ? Math.min(...peerLoads) : 0;
  const ownBase = weekendEquivalentFromMap(weekendMap(monthData, staffId, dateIso));
  const weekendRoundComplete = hasCompletedDistributionRound(peerLoads, 0.5);

  if (ownBase === minimum) {
    recommend(`Wochenend-Ausgleich: aktuell geringste Belastung (${ownBase.toFixed(1)})`, 'weekend', 20);
  } else if (weekendRoundComplete) {
    push('yellow', `Wochenend-Ausgleich: andere geeignete Personen liegen niedriger (${minimum.toFixed(1)} statt ${ownBase.toFixed(1)})`);
  } else {
    note(`Wochenend-Ausgleich: erste Verteilungsrunde noch offen; andere geeignete Personen liegen niedriger (${minimum.toFixed(1)} statt ${ownBase.toFixed(1)})`);
  }
  if (projected > 1) push('yellow', `Wochenendziel 1,0 würde auf ${projected.toFixed(1)} steigen`);

  if (role === 'bd' && date.getDay() === 6 && countSaturdayBdExcept(monthData, staffId, dateIso) >= 1) {
    push('orange', 'Weiterer Samstags-BD im selben Monat; strenge Rotation bevorzugt andere Fachärzte');
  }
}

export function evaluateCandidate({ state, monthData, dateIso, role, staffId }) {
  return evaluateCandidateInternal({ state, monthData, dateIso, role, staffId, includeFairness: true });
}
