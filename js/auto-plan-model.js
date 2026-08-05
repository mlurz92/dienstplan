/**
 * Auto-Plan v10 — Boolean-Zuordnungsmodell (One-Hot).
 *
 * WARUM DIESE DARSTELLUNG
 *
 * Die Vorgängerfassung führte je offenem Feld eine ganzzahlige Variable mit
 * einem Personencode als Wert. Das ist bequem zu lesen und für die eigentliche
 * Aufgabe untauglich: Eine Aussage wie „Person p hat höchstens vier
 * Bereitschaftsdienste" ist über Personencodes linear nicht ausdrückbar. Die
 * Summe von Personennummern ist keine Einsatzzahl. Genau daran ist das alte
 * Modell gescheitert — nicht an der Problemgröße.
 *
 * Hier steht deshalb je Paar aus Feld und zulässiger Person eine Binärvariable
 * `y[f][p]`. Damit wird jede fachliche Regel zu einer Aussage über Summen von
 * Nullen und Einsen, und Kardinalität, Fairness, Wünsche und Stabilität sind
 * überhaupt erst formulierbar.
 *
 * REINE DATENSCHICHT
 *
 * Dieses Modul kennt keinen Solver. Es erzeugt eine Beschreibung aus Variablen,
 * linearen Constraints und Zielkomponenten; erst `js/auto-plan-solver.js`
 * überträgt sie in die WebAssembly-Bindung. Dadurch ist das gesamte Modell in
 * Node testbar — die einzige Möglichkeit, ein Modell dieser Größe ehrlich gegen
 * die Regelengine zu prüfen.
 *
 * VERTRAG GEGENÜBER DER REGELENGINE
 *
 * Das Modell ist ein Spiegel, keine zweite Wahrheit. Die Kandidatenmengen
 * stammen unverändert aus `basicallyEligiblePeers`; jeder darüber hinausgehende
 * harte Constraint ist hier benannt und begründet. Verbindlich bleibt in jedem
 * Fall das Schlussaudit der Regelengine.
 */

import {
  basicallyEligiblePeers,
  getPlanningStaff,
  getAbsence,
  ABSENCE_FOR_CT_LEADERSHIP
} from './rules-core.js?v=20260806.1';
import { isRegularWorkdayIso } from './holidays.js?v=20260806.1';

export const MODEL_REVISION = 10;

/**
 * Relaxierbare Regelgruppen in fachlicher Reihenfolge.
 *
 * Die Priorität steuert zweierlei: die Reihenfolge, in der bei Unerfüllbarkeit
 * aufgegeben wird, und das Gewicht in der Korrekturmengen-Diagnose. Kleine Zahl
 * bedeutet „darf zuletzt fallen".
 */
export const RELAX_GROUPS = Object.freeze({
  coverage: { label: 'Vollständige Besetzung', priority: 0, weight: 1000 },
  qualification: { label: 'Qualifikation und Verfügbarkeit', priority: 1, weight: 900 },
  exclusivity: { label: 'Keine Doppelbelegung am selben Tag', priority: 2, weight: 800 },
  rest: { label: 'Ruhezeit zwischen Bereitschaftsdiensten', priority: 3, weight: 700 },
  sequence: { label: 'Hintergrunddienst vor Bereitschaftsdienst', priority: 4, weight: 600 },
  freizeitausgleich: { label: 'Freizeitausgleich nach Bereitschaftsdienst', priority: 5, weight: 500 },
  limits: { label: 'Personengebundene Obergrenzen', priority: 6, weight: 400 }
});

/**
 * Weiche Zielkomponenten. Die Reihenfolge hier ist nur der Vorrat; welche
 * Komponente in welcher Stufe minimiert wird, entscheidet die Engine.
 */
export const OBJECTIVE_COMPONENTS = Object.freeze({
  fairness: 'Gleichmäßige Gesamtlast (Leximin)',
  wishes: 'Erfüllte Dienstwünsche',
  bdTarget: 'Abweichung vom BD-Soll',
  weekend: 'Wochenendlast',
  saturday: 'Samstagslast',
  hgBurden: 'Hintergrunddienstlast',
  weekendChain: 'Wochenendkette Fr-BD · Sa frei · So-BD',
  ctLeadership: 'CT-Leitung am Freizeitausgleichstag',
  perturbation: 'Abweichung vom Ausgangsvorschlag'
});

const ROLES = Object.freeze(['bd', 'hg']);

function parseIsoLocal(dateIso) {
  return new Date(`${dateIso}T12:00:00`);
}

function weekdayOf(dateIso) {
  return parseIsoLocal(dateIso).getDay();
}

function sortedDays(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function isWeekendIso(dateIso) {
  return [0, 5, 6].includes(weekdayOf(dateIso));
}

/**
 * Nächster regulärer Werktag nach `dateIso` innerhalb des Monats.
 * Wochenenden und Feiertage werden übersprungen.
 */
function nextRegularWorkdayIso(days, dateIso) {
  const index = days.indexOf(dateIso);
  if (index < 0) return null;
  for (let offset = 1; index + offset < days.length; offset += 1) {
    const candidate = days[index + offset];
    if (isRegularWorkdayIso(candidate)) return candidate;
  }
  return null;
}

function monthKeyOf(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Die Last einer Person in einem abgeschlossenen Monat.
 * Wochenendäquivalent wird bewusst nicht verwendet: Für das Gedächtnis zählt,
 * wie viele Dienste jemand tatsächlich getragen hat.
 */
function loadInMonth(monthData, staffId, hgFactor) {
  let bd = 0;
  let hg = 0;
  for (const iso of Object.keys(monthData?.days || {})) {
    const day = monthData.days[iso] || {};
    if (day.bd === staffId) bd += 1;
    if (day.hg === staffId) hg += 1;
  }
  return bd + hgFactor * hg;
}

/**
 * Monatsübergreifendes Fairness-Gedächtnis.
 *
 * Gerechtigkeit in einem einzelnen Monat ist keine Gerechtigkeit. Wer im März
 * drei Wochenenden getragen hat, muss im April entlastet werden.
 *
 * VORZEICHEN — die Stelle, an der man sich zwangsläufig einmal irrt:
 * Die Kaskade **minimiert die Höchstlast**. Ein höherer Startwert `L_p` führt
 * also dazu, dass die Person *weniger* neue Dienste bekommt. Der Versatz ist
 * deshalb `Vorlast − Gruppenmittel`: Wer in den Vormonaten über dem Mittel lag,
 * startet erhöht und wird von der Minimierung entlastet. Das umgekehrte
 * Vorzeichen kehrt die Mehrmonatsfairness genau um.
 *
 * Rückgabe: Map staffId → Versatz in Diensteinheiten (kann negativ sein).
 */
export function carryOverOffsets(state, monthData, { window = 3, hgFactor = 0.6, weight = 0.5 } = {}) {
  const offsets = new Map();
  if (!window || !weight) return offsets;
  const months = state?.months instanceof Map ? state.months : new Map(state?.months || []);
  const currentKey = monthKeyOf(monthData.year, monthData.month);
  const previous = [...months.keys()]
    .filter(key => key < currentKey)
    .sort()
    .slice(-window)
    .map(key => months.get(key))
    .filter(Boolean);
  if (!previous.length) return offsets;

  // Der Vergleichskreis ist das planbare Personal des aktuellen Monats — nicht
  // nur wer in den Vormonaten vorkam. Sonst bestünde die Gruppe aus genau den
  // Personen mit Vorlast, ihr Mittel wäre deren eigenes, und der Versatz aller
  // Beteiligten wäre null: Das Gedächtnis wäre wirkungslos.
  const staffIds = new Set();
  for (const dateIso of Object.keys(monthData?.days || {})) {
    for (const person of getPlanningStaff(state?.staff || [], dateIso)) staffIds.add(person.id);
  }
  for (const past of previous) {
    for (const iso of Object.keys(past?.days || {})) {
      const day = past.days[iso] || {};
      if (day.bd) staffIds.add(day.bd);
      if (day.hg) staffIds.add(day.hg);
    }
  }
  const loads = new Map();
  for (const staffId of staffIds) {
    let total = 0;
    for (const past of previous) total += loadInMonth(past, staffId, hgFactor);
    loads.set(staffId, total / previous.length);
  }
  if (!loads.size) return offsets;
  const values = [...loads.values()];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  for (const [staffId, value] of loads) offsets.set(staffId, weight * (value - mean));
  return offsets;
}

/**
 * Baut die vollständige Modellbeschreibung eines Monats.
 *
 * @returns {object} Beschreibung mit Variablen, Constraints, Zielkomponenten,
 *   Zählausdrücken je Person, Relaxationsliteralen und Hinweisen.
 */
export function buildPlanModel({
  state,
  monthData,
  baseline = monthData,
  config = {},
  hints = [],
  fixedAssignments = null
} = {}) {
  const days = sortedDays(monthData);
  const hgFactor = clampNumber(config.hgLoadFactor, 0, 1, 0.6);

  // 1. Personenkreis: die Vereinigung des planbaren Personals über alle Tage.
  const staffIds = [];
  const staffById = new Map();
  {
    const seen = new Set();
    for (const dateIso of days) {
      for (const person of getPlanningStaff(state?.staff || [], dateIso)) {
        if (seen.has(person.id)) continue;
        seen.add(person.id);
        staffIds.push(person.id);
        staffById.set(person.id, person);
      }
    }
  }

  // 2. Offene Felder und ihre Kandidatenmengen.
  const slots = [];
  for (const dateIso of days) {
    for (const role of ROLES) {
      if (monthData.days?.[dateIso]?.[role]) continue;
      slots.push({ dateIso, role, key: `${dateIso}|${role}` });
    }
  }

  const vars = [];
  const addVar = (name, lb, ub, meta = null) => {
    const index = vars.length;
    vars.push({ index, name, lb, ub, meta });
    return index;
  };

  const constraints = [];
  const addConstraint = (id, group, terms, lb, ub, detail, enforce = null) => {
    if (!terms.length) return null;
    constraints.push({ id, group, terms, lb, ub, detail, enforce });
    return constraints.length - 1;
  };

  const components = {};
  for (const id of Object.keys(OBJECTIVE_COMPONENTS)) components[id] = { id, label: OBJECTIVE_COMPONENTS[id], terms: [] };

  // 3. Zuordnungsvariablen — nur für tatsächlich zulässige Kandidaten.
  const assign = [];
  const candidateIds = [];
  for (const slot of slots) {
    const candidates = basicallyEligiblePeers(state, monthData, slot.dateIso, slot.role)
      .filter(person => staffById.has(person.id))
      .map(person => person.id);
    const map = new Map();
    for (const staffId of candidates) {
      map.set(staffId, addVar(`y_${slot.key}_${staffId}`, 0, 1, { slotKey: slot.key, staffId, role: slot.role, dateIso: slot.dateIso }));
    }
    assign.push(map);
    candidateIds.push(candidates);
  }

  const slotIndexByKey = new Map(slots.map((slot, index) => [slot.key, index]));
  const varOf = (dateIso, role, staffId) => {
    const index = slotIndexByKey.get(`${dateIso}|${role}`);
    if (index === undefined) return undefined;
    return assign[index].get(staffId);
  };

  /**
   * Literal oder Konstante für „Person p hat am Tag d die Rolle r".
   * Fixierte Felder sind keine Variablen, sondern bekannte Wahrheitswerte —
   * sie müssen in jeder Zählung und jeder Kettenbedingung als solche auftreten.
   */
  const literalOrConst = (dateIso, role, staffId) => {
    const fixed = baseline?.days?.[dateIso]?.[role];
    if (fixed) return { constant: fixed === staffId ? 1 : 0 };
    const variableIndex = varOf(dateIso, role, staffId);
    if (variableIndex === undefined) return { constant: 0 };
    return { variableIndex };
  };

  // 4. Vollständige Besetzung: genau eine Person je offenem Feld.
  //    Das Literal `r_coverage` erlaubt der Diagnose, die Bedingung testweise
  //    aufzugeben — im Regelfall ist es fest auf 1 gesetzt.
  const relaxLiterals = {};
  for (const [group, meta] of Object.entries(RELAX_GROUPS)) {
    relaxLiterals[group] = addVar(`relax_${group}`, 0, 1, { relaxGroup: group, weight: meta.weight });
  }

  slots.forEach((slot, index) => {
    const terms = [...assign[index].values()].map(variableIndex => [variableIndex, 1]);
    if (!terms.length) {
      // Ein Feld ohne jeden Kandidaten ist kein Modellfehler, sondern eine
      // fachliche Aussage: Hier kann niemand eingeteilt werden.
      constraints.push({
        id: `cover_empty_${slot.key}`, group: 'coverage', terms: [[relaxLiterals.coverage, 1]],
        lb: 0, ub: 0, detail: `Für ${slot.key} ist niemand wählbar.`, enforce: null
      });
      return;
    }
    addConstraint(`cover_${slot.key}`, 'coverage', terms, 1, 1,
      `Feld ${slot.key} muss mit genau einer Person besetzt werden.`, relaxLiterals.coverage);
  });

  // 5. Keine Doppelbelegung am selben Tag.
  for (const dateIso of days) {
    for (const staffId of staffIds) {
      const bd = varOf(dateIso, 'bd', staffId);
      const hg = varOf(dateIso, 'hg', staffId);
      if (bd === undefined || hg === undefined) continue;
      addConstraint(`excl_${dateIso}_${staffId}`, 'exclusivity', [[bd, 1], [hg, 1]], 0, 1,
        `${staffId} kann am ${dateIso} nicht zugleich BD und HG übernehmen.`, relaxLiterals.exclusivity);
    }
  }

  // 6. Kein Bereitschaftsdienst an zwei aufeinanderfolgenden Kalendertagen.
  for (let index = 0; index < days.length - 1; index += 1) {
    for (const staffId of staffIds) {
      const today = literalOrConst(days[index], 'bd', staffId);
      const tomorrow = literalOrConst(days[index + 1], 'bd', staffId);
      const terms = pairTerms(today, tomorrow);
      if (!terms.length) continue;
      const offset = (today.constant || 0) + (tomorrow.constant || 0);
      if (offset >= 2) continue; // beide fixiert und verletzt: Sache des Audits
      addConstraint(`rest_${days[index]}_${staffId}`, 'rest', terms, 0, 1 - offset,
        `${staffId}: kein BD am ${days[index]} und ${days[index + 1]} zugleich.`, relaxLiterals.rest);
    }
  }

  // 7. Hintergrunddienst an einem Werktag (Mo–Do) schließt den BD am Folgetag aus.
  for (let index = 0; index < days.length - 1; index += 1) {
    const weekday = weekdayOf(days[index]);
    if (weekday < 1 || weekday > 4) continue;
    for (const staffId of staffIds) {
      const hg = literalOrConst(days[index], 'hg', staffId);
      const bd = literalOrConst(days[index + 1], 'bd', staffId);
      const terms = pairTerms(hg, bd);
      if (!terms.length) continue;
      const offset = (hg.constant || 0) + (bd.constant || 0);
      if (offset >= 2) continue;
      addConstraint(`hgbd_${days[index]}_${staffId}`, 'sequence', terms, 0, 1 - offset,
        `${staffId}: HG am ${days[index]} schließt BD am Folgetag aus.`, relaxLiterals.sequence);
    }
  }

  // 8. Freizeitausgleich: Becker leitet aus jedem BD einen wirksamen FZA am
  //    nächsten regulären Werktag ab und ist dort weder für BD noch für HG
  //    einteilbar. Modelliert als Implikation über zwei Literale, ohne big-M.
  const beckerId = staffById.has('becker') ? 'becker' : null;
  if (beckerId) {
    for (const dateIso of days) {
      const source = literalOrConst(dateIso, 'bd', beckerId);
      const next = nextRegularWorkdayIso(days, dateIso);
      if (!next) continue;
      for (const role of ROLES) {
        const target = varOf(next, role, beckerId);
        if (target === undefined) continue;
        if (source.constant === 1) {
          addConstraint(`fza_fix_${dateIso}_${role}`, 'freizeitausgleich', [[target, 1]], 0, 0,
            `Freizeitausgleich am ${next}: ${role.toUpperCase()} gesperrt.`, relaxLiterals.freizeitausgleich);
        } else if (source.variableIndex !== undefined) {
          // y_source + y_target ≤ 1
          addConstraint(`fza_${dateIso}_${role}`, 'freizeitausgleich',
            [[source.variableIndex, 1], [target, 1]], 0, 1,
            `BD am ${dateIso} erzeugt Freizeitausgleich am ${next}: ${role.toUpperCase()} gesperrt.`,
            relaxLiterals.freizeitausgleich);
        }
      }
      // CT-Leitung: Ist Martin am Freizeitausgleichstag abwesend, soll der
      // auslösende BD möglichst vermieden werden — weich, nicht verboten.
      if (source.variableIndex !== undefined && martinAbsentOn(monthData, next)) {
        components.ctLeadership.terms.push([source.variableIndex, 1]);
      }
    }
  }

  // 9. Zählausdrücke je Person: BD, HG, Gesamt — inklusive bereits fixierter
  //    Dienste als Konstante. Ohne diese Ausdrücke ist keine Obergrenze, keine
  //    Fairness und kein Soll formulierbar.
  const counters = new Map();
  for (const staffId of staffIds) {
    const bdTerms = [];
    const hgTerms = [];
    let bdFixed = 0;
    let hgFixed = 0;
    for (const dateIso of days) {
      const day = baseline?.days?.[dateIso] || {};
      if (day.bd === staffId) bdFixed += 1;
      if (day.hg === staffId) hgFixed += 1;
      const bd = varOf(dateIso, 'bd', staffId);
      const hg = varOf(dateIso, 'hg', staffId);
      if (bd !== undefined) bdTerms.push([bd, 1]);
      if (hg !== undefined) hgTerms.push([hg, 1]);
    }
    counters.set(staffId, { bdTerms, hgTerms, bdFixed, hgFixed });
  }

  // 10. Personengebundene Obergrenzen.
  const configLimits = config.staffLimits || {};
  for (const staffId of staffIds) {
    const person = staffById.get(staffId);
    const counter = counters.get(staffId);
    const maxBd = resolveLimit(configLimits[staffId]?.maxBd, person?.maxBd);
    const maxHg = resolveLimit(configLimits[staffId]?.maxHg, null);
    const maxTotal = resolveLimit(configLimits[staffId]?.maxTotal, null);
    if (maxBd !== null && counter.bdTerms.length) {
      addConstraint(`limit_bd_${staffId}`, 'limits', counter.bdTerms, 0, Math.max(0, maxBd - counter.bdFixed),
        `Obergrenze BD für ${staffId}: höchstens ${maxBd} im Monat.`, relaxLiterals.limits);
    }
    if (maxHg !== null && counter.hgTerms.length) {
      addConstraint(`limit_hg_${staffId}`, 'limits', counter.hgTerms, 0, Math.max(0, maxHg - counter.hgFixed),
        `Obergrenze HG für ${staffId}: höchstens ${maxHg} im Monat.`, relaxLiterals.limits);
    }
    if (maxTotal !== null && (counter.bdTerms.length || counter.hgTerms.length)) {
      addConstraint(`limit_total_${staffId}`, 'limits', [...counter.bdTerms, ...counter.hgTerms], 0,
        Math.max(0, maxTotal - counter.bdFixed - counter.hgFixed),
        `Gesamtobergrenze für ${staffId}: höchstens ${maxTotal} Dienste im Monat.`, relaxLiterals.limits);
    }
  }

  // 11. Weiche Ziele.
  // 11a. Dienstwünsche: jeder erfüllbare Wunsch, der nicht erfüllt wird, kostet.
  const wishes = [];
  for (const [staffId, byDate] of Object.entries(monthData?.preferences || {})) {
    for (const [dateIso, type] of Object.entries(byDate || {})) {
      const roles = type === 'bd-bevorzugt' ? ['bd']
        : type === 'hg-bevorzugt' ? ['hg']
          : type === 'dienst-bevorzugt' ? ROLES : null;
      if (!roles) continue;
      for (const role of roles) {
        const variableIndex = varOf(dateIso, role, staffId);
        if (variableIndex === undefined) continue;
        wishes.push({ staffId, dateIso, role, variableIndex });
      }
    }
  }
  // Ein „dienst-bevorzugt" ist erfüllt, sobald eine der beiden Rollen greift.
  const wishGroups = new Map();
  for (const wish of wishes) {
    const key = `${wish.staffId}|${wish.dateIso}`;
    if (!wishGroups.has(key)) wishGroups.set(key, []);
    wishGroups.get(key).push(wish.variableIndex);
  }
  for (const [key, variableIndices] of wishGroups) {
    // miss = 1 − Σ y  (Σ y ≤ 1 folgt aus der Exklusivität)
    const miss = addVar(`wish_miss_${key}`, 0, 1, { wish: key });
    addConstraint(`wish_${key}`, 'coverage',
      [[miss, 1], ...variableIndices.map(index => [index, 1])], 1, 1,
      `Dienstwunsch ${key}: erfüllt oder als Fehlbetrag gezählt.`, null);
    components.wishes.terms.push([miss, 1]);
  }

  // 11b. BD-Soll: |BD_p − Soll_p| über zwei Ungleichungen.
  for (const staffId of staffIds) {
    const person = staffById.get(staffId);
    const target = Number(person?.bdTarget);
    if (!Number.isFinite(target)) continue;
    const counter = counters.get(staffId);
    if (!counter.bdTerms.length) continue;
    const deviation = addVar(`dev_bd_${staffId}`, 0, days.length, { staffId });
    // BD − dev ≤ Soll   und   BD + dev ≥ Soll
    addConstraint(`dev_hi_${staffId}`, 'coverage',
      [...counter.bdTerms, [deviation, -1]], -days.length, Math.round(target) - counter.bdFixed,
      `BD-Soll ${staffId}: Übererfüllung wird gezählt.`, null);
    addConstraint(`dev_lo_${staffId}`, 'coverage',
      [...counter.bdTerms, [deviation, 1]], Math.round(target) - counter.bdFixed, days.length * 2,
      `BD-Soll ${staffId}: Untererfüllung wird gezählt.`, null);
    components.bdTarget.terms.push([deviation, 1]);
  }

  // 11c. Wochenend-, Samstags- und HG-Last als lineare Zählterme.
  slots.forEach((slot, index) => {
    const weekday = weekdayOf(slot.dateIso);
    for (const variableIndex of assign[index].values()) {
      if (slot.role === 'hg') {
        components.hgBurden.terms.push([variableIndex, 1]);
        if (isWeekendIso(slot.dateIso)) components.weekend.terms.push([variableIndex, 1]);
      }
      if (slot.role === 'bd') {
        if (isWeekendIso(slot.dateIso)) components.weekend.terms.push([variableIndex, 1]);
        if (weekday === 6) components.saturday.terms.push([variableIndex, 1]);
      }
    }
  });

  // 11d. Wochenendkette Fr-BD · Sa vollständig frei · So-BD (Regelwerk v4.10).
  //      chain ≥ y_fri + (1 − y_satBD) + (1 − y_satHG) + y_sun − 3
  for (let index = 0; index < days.length - 2; index += 1) {
    if (weekdayOf(days[index]) !== 5) continue;
    const [friday, saturday, sunday] = [days[index], days[index + 1], days[index + 2]];
    if (weekdayOf(sunday) !== 0) continue;
    for (const staffId of staffIds) {
      const parts = [
        { literal: literalOrConst(friday, 'bd', staffId), sign: 1 },
        { literal: literalOrConst(saturday, 'bd', staffId), sign: -1 },
        { literal: literalOrConst(saturday, 'hg', staffId), sign: -1 },
        { literal: literalOrConst(sunday, 'bd', staffId), sign: 1 }
      ];
      // Konstanter Anteil: +1 je gesetztem positiven Teil, +1 je nicht gesetztem negativen Teil.
      let constant = 0;
      const terms = [];
      for (const part of parts) {
        if (part.literal.constant !== undefined) {
          constant += part.sign === 1 ? part.literal.constant : 1 - part.literal.constant;
        } else {
          if (part.sign === 1) terms.push([part.literal.variableIndex, 1]);
          else { terms.push([part.literal.variableIndex, -1]); constant += 1; }
        }
      }
      if (!terms.length) continue;
      const chain = addVar(`chain_${friday}_${staffId}`, 0, 1, { staffId, weekend: friday });
      // chain − Σ terms ≥ constant − 3
      addConstraint(`chain_${friday}_${staffId}`, 'coverage',
        [[chain, 1], ...terms.map(([variableIndex, coefficient]) => [variableIndex, -coefficient])],
        constant - 3, 4,
        `Wochenendkette ${friday}–${sunday} für ${staffId}.`, null);
      components.weekendChain.terms.push([chain, 1]);
    }
  }

  // 11e. Minimal-Perturbation: Abweichung vom Ausgangsvorschlag zählt.
  const hintPairs = [];
  for (const hint of hints || []) {
    const variableIndex = varOf(hint.dateIso, hint.role, hint.staffId);
    if (variableIndex === undefined) continue;
    hintPairs.push([variableIndex, 1]);
    // 1 − y als Abweichungsterm; die Konstante ist für die Optimierung egal.
    components.perturbation.terms.push([variableIndex, -1]);
  }

  // 11f. Fairness-Grundlage: kombinierte Last je Person inklusive Gedächtnis.
  const offsets = carryOverOffsets(state, monthData, {
    window: clampInteger(config.carryOverWindow, 0, 6, 3),
    hgFactor,
    weight: clampNumber(config.carryOverWeight, 0, 1, 0.5)
  });
  // Ganzzahlige Skalierung: CP-SAT rechnet ganzzahlig, deshalb wird die Last in
  // Zehnteln geführt. Ein Zehntel Dienst ist feiner als jede fachlich sinnvolle
  // Unterscheidung und hält zugleich die Koeffizienten klein — bei Hundertsteln
  // wächst der Wertebereich der Minimax-Variablen um eine Größenordnung, und
  // die Höchstlaststufe erreicht in vertretbarer Zeit keinen Beweis mehr.
  const SCALE = 10;
  const loadTerms = new Map();
  for (const staffId of staffIds) {
    const counter = counters.get(staffId);
    const terms = [
      ...counter.bdTerms.map(([variableIndex]) => [variableIndex, SCALE]),
      ...counter.hgTerms.map(([variableIndex]) => [variableIndex, Math.round(hgFactor * SCALE)])
    ];
    const constant = Math.round((counter.bdFixed + hgFactor * counter.hgFixed + (offsets.get(staffId) || 0)) * SCALE);
    loadTerms.set(staffId, { terms, constant });
  }

  const counts = {
    slots: slots.length,
    variables: vars.length,
    assignments: slots.reduce((sum, _slot, index) => sum + assign[index].size, 0),
    constraints: constraints.length,
    staff: staffIds.length,
    wishes: wishGroups.size
  };

  return {
    revision: MODEL_REVISION,
    days,
    slots,
    staffIds,
    assign,
    candidateIds,
    vars,
    constraints,
    components,
    counters,
    loadTerms,
    loadScale: SCALE,
    hgFactor,
    carryOver: offsets,
    relaxLiterals,
    hintPairs,
    fixedAssignments: fixedAssignments || null,
    counts
  };
}

function pairTerms(left, right) {
  const terms = [];
  if (left.variableIndex !== undefined) terms.push([left.variableIndex, 1]);
  if (right.variableIndex !== undefined) terms.push([right.variableIndex, 1]);
  return terms;
}

function martinAbsentOn(monthData, dateIso) {
  const absence = getAbsence(monthData, 'martin', dateIso);
  return Boolean(absence) && ABSENCE_FOR_CT_LEADERSHIP.has(absence);
}

/**
 * Strengste gültige Obergrenze aus Laufkonfiguration und Personalstamm.
 *
 * `Number(null)` ist null und `Number.isInteger(0)` ist wahr — eine nicht
 * gesetzte Grenze würde bei naiver Prüfung also zur härtesten aller Grenzen und
 * das Modell unlösbar machen. Fehlende Werte werden deshalb ausdrücklich vorab
 * ausgeschlossen, bevor überhaupt gerechnet wird.
 */
function resolveLimit(configured, fallback) {
  const values = [configured, fallback]
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0);
  if (!values.length) return null;
  return Math.min(...values);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

/**
 * Übersetzt eine Lösung (Variablenwerte) in eine Feldbelegung.
 */
export function solutionToAssignments(model, values) {
  const result = [];
  model.slots.forEach((slot, index) => {
    for (const [staffId, variableIndex] of model.assign[index]) {
      if (Number(values[variableIndex]) === 1) result.push({ dateIso: slot.dateIso, role: slot.role, staffId });
    }
  });
  return result;
}

/**
 * Prüft eine vollständige Variablenbelegung gegen alle harten Constraints.
 * Wird in Tests verwendet, um Modell und Regelengine gegeneinander zu stellen.
 */
export function violatedConstraints(model, values) {
  const violations = [];
  for (const constraint of model.constraints) {
    if (constraint.enforce !== null && Number(values[constraint.enforce]) !== 1) continue;
    let sum = 0;
    for (const [variableIndex, coefficient] of constraint.terms) sum += Number(values[variableIndex] || 0) * coefficient;
    if (sum < constraint.lb || sum > constraint.ub) violations.push({ id: constraint.id, group: constraint.group, sum, lb: constraint.lb, ub: constraint.ub, detail: constraint.detail });
  }
  return violations;
}

/**
 * Belegt die Variablen so, wie es ein gegebener Monat vorgibt.
 * Hilfsvariablen (Wunsch-Fehlbeträge, Abweichungen, Ketten) werden dabei auf
 * ihren kleinstmöglichen zulässigen Wert gesetzt.
 */
export function valuesFromMonth(model, monthData) {
  const values = new Array(model.vars.length).fill(0);
  for (const group of Object.values(model.relaxLiterals)) values[group] = 1;
  model.slots.forEach((slot, index) => {
    const staffId = monthData?.days?.[slot.dateIso]?.[slot.role];
    if (!staffId) return;
    const variableIndex = model.assign[index].get(staffId);
    if (variableIndex !== undefined) values[variableIndex] = 1;
  });
  // Hilfsvariablen aus ihren definierenden Gleichungen ableiten.
  for (const constraint of model.constraints) {
    const helper = constraint.terms.find(([variableIndex]) => model.vars[variableIndex].meta?.wish !== undefined
      || model.vars[variableIndex].name.startsWith('dev_bd_')
      || model.vars[variableIndex].name.startsWith('chain_'));
    if (!helper) continue;
    const [helperIndex, helperCoefficient] = helper;
    let rest = 0;
    for (const [variableIndex, coefficient] of constraint.terms) {
      if (variableIndex === helperIndex) continue;
      rest += Number(values[variableIndex] || 0) * coefficient;
    }
    const needed = (constraint.lb - rest) / helperCoefficient;
    if (Number.isFinite(needed) && needed > (values[helperIndex] || 0)) {
      values[helperIndex] = Math.max(0, Math.min(model.vars[helperIndex].ub, Math.ceil(needed)));
    }
  }
  return values;
}
