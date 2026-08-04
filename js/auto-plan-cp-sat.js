/**
 * Auto-Plan v9 – CP-SAT-Brücke.
 *
 * Diese Schicht übersetzt den Monatszustand in ein Constraint-Modell und löst
 * es mit Googles OR-Tools CP-SAT, das 2026 als WebAssembly im Browser läuft.
 *
 * ARCHITEKTUR IN ZWEI EBENEN
 *
 * 1. `buildCpSatModel(...)` erzeugt ein reines Datenmodell: Slot-Variablen,
 *    Hilfsvariablen (binär für ≠-Klauseln, Slack für weiche Ziele), lineare
 *    Constraints, phasenweise Zielkomponenten, Hinweise und relaxierbare
 *    Gruppen. Diese Ebene ist frei von jeder Solver-Bibliothek und vollständig
 *    in Node testbar.
 * 2. `solveCpSatModel(...)` übersetzt das Datenmodell in die API der
 *    geladenen Bindung. Unterstützt werden zwei Bindungen mit derselben, an
 *    Googles Python-API angelehnten Oberfläche:
 *      - `or-tools-wasm` (multithreaded WASM, benötigt COOP/COEP-Header)
 *      - `cpsat-js` (single-threaded WASM, benötigt keine Isolation)
 *
 * MODELLIERUNG
 *
 * - Ungleichheit x ≠ v wird als Klauselpaar mit zwei Binärvariablen und
 *   big-M-Codierung abgebildet (x ≥ v+1 ∨ x ≤ v−1). Das ist linear und
 *   funktioniert mit jeder Bindung, ohne `onlyEnforceIf`-Abhängigkeit.
 * - Weiche Ziele werden als phasenweise Komponenten geführt. Die v9-Engine
 *   löst sequenziell (z. B. zuerst Maximin-Fairness, dann Wünsche) und fixiert
 *   erreichte Werte über Zusatzconstraints.
 *
 * FALLBACK-VERTRAG
 *
 * Kann keine Bindung geladen werden (älterer Browser, keine Header, CDN nicht
 * erreichbar), meldet `isCpSatReady()` false. Die v9-Engine läuft dann
 * unverändert mit der bewährten v8.5-Heuristik. Der fachliche Schlussaudit
 * der Regelengine bleibt in allen Pfaden die einzige Wahrheitsquelle.
 *
 * Die Relaxations-Diagnose („MUS-artig“) benötigt keine Assumptions-API:
 * Bei INFEASIBLE werden relaxierbare Constraint-Gruppen gierig wieder
 * aktiviert, bis das Modell zulässig wird. Das Ergebnis ist eine erklärbare,
 * minimal angenäherte Ursachenliste für die Oberfläche.
 */

import { basicallyEligiblePeers, getPlanningStaff } from './rules-core.js?v=20260803.4';

export const CP_SAT_REVISION = 1;

export const SOLVER_LOAD_ORDER = Object.freeze([
  { id: 'or-tools-wasm', source: 'local', url: '/vendor/or-tools-wasm/cp-sat/index.js' },
  { id: 'or-tools-wasm', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/or-tools-wasm@0.9.1/cp-sat/+esm' },
  { id: 'cpsat-js', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/cpsat-js@1.3.0/+esm' }
]);

export const RELAX_GROUPS = Object.freeze({
  qualification: { label: 'Qualifikationsregeln', priority: 0 },
  availability: { label: 'Verfügbarkeit (Abwesenheit, Aktivität)', priority: 1 },
  sequence: { label: 'Sequenzregeln (Ruhezeit, HG vor BD)', priority: 2 },
  limits: { label: 'Personengebundene Obergrenzen', priority: 3 },
  coupling: { label: 'BD/HG-Kopplungen am Wochenende', priority: 4 },
  coverage: { label: 'Vollständige Belegung (offene Felder)', priority: 5 }
});

export const OBJECTIVE_COMPONENTS = Object.freeze({
  fairness: 'fairness',
  wishes: 'wishes',
  bdTarget: 'bdTarget',
  weekend: 'weekend',
  saturday: 'saturday',
  hgBurden: 'hgBurden'
});

const VERSION_MARKER = '20260803.4';
const BIG_M = 128;

let loader = null;

function weekdayOf(dateIso) {
  return new Date(`${dateIso}T12:00:00`).getDay();
}

function sortedDays(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function countFixedRole(baseline, staffId, role) {
  let count = 0;
  for (const iso of Object.keys(baseline?.days || {})) {
    if (baseline.days?.[iso]?.[role] === staffId) count += 1;
  }
  return count;
}

/**
 * Lädt die Solver-Bindung (einmalig je Session).
 */
export async function loadCpSatSolver({ signal = null } = {}) {
  if (loader) return loader;
  loader = (async () => {
    if (typeof globalThis === 'undefined' || typeof globalThis.document === 'undefined') return null;
    for (const candidate of SOLVER_LOAD_ORDER) {
      if (signal?.aborted) return null;
      try {
        const module = await import(/* webpackIgnore: true */ candidate.url);
        const api = normalizeSolverApi(module, candidate.id);
        if (api) {
          api.loadedFrom = candidate;
          return api;
        }
      } catch {
        // Nächste Quelle versuchen.
      }
    }
    return null;
  })();
  return loader;
}

export async function isCpSatReady({ signal = null } = {}) {
  const api = await loadCpSatSolver({ signal });
  return Boolean(api);
}

export function cpSatLoadState() {
  if (loader === null) return 'idle';
  if (loader instanceof Promise) return 'loading';
  return loader ? 'ready' : 'unavailable';
}

/**
 * Normalisiert die beiden Bindungsoberflächen auf eine gemeinsame API.
 */
function normalizeSolverApi(module, id) {
  try {
    if (module?.CpModel && module?.CpSolver) {
      return {
        id,
        createModel() { return new module.CpModel(); },
        newIntVar(model, lb, ub, name) { return model.newIntVar(lb, ub, name); },
        addLinear(model, terms, lb, ub) {
          const expression = terms.reduce((acc, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return acc === null ? term : acc.plus(term);
          }, null);
          if (!expression) return null;
          return model.addLinearConstraint(expression, lb, ub);
        },
        minimize(model, terms) {
          const expression = terms.reduce((acc, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return acc === null ? term : acc.plus(term);
          }, null);
          if (expression && typeof model.minimize === 'function') model.minimize(expression);
        },
        addHint(model, variable, value) {
          if (typeof model.addHint === 'function') model.addHint(variable, value);
        },
        async solve(model, params) {
          const solver = new module.CpSolver();
          const status = await solver.solve(model, params);
          return {
            status,
            statusName: String(solver.statusName?.(status) || 'UNKNOWN'),
            objectiveValue: () => Number(solver.objectiveValue?.() ?? 0),
            bestBound: () => {
              const value = solver.bestObjectiveBound?.();
              return Number.isFinite(Number(value)) ? Number(value) : null;
            },
            value: variable => solver.value(variable)
          };
        }
      };
    }
    if (module?.CpModel && module?.CpSolver?.create) {
      return {
        id,
        createModel() { return new module.CpModel(); },
        newIntVar(model, lb, ub, name) { return model.newIntVar(lb, ub, name); },
        addLinear(model, terms, lb, ub) {
          const expression = terms.reduce((acc, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return acc === null ? term : acc.plus(term);
          }, null);
          if (!expression) return null;
          return model.addLinearConstraint(expression, lb, ub);
        },
        minimize(model, terms) {
          const expression = terms.reduce((acc, [variable, coefficient]) => {
            const term = variable.times(coefficient);
            return acc === null ? term : acc.plus(term);
          }, null);
          if (expression && typeof model.minimize === 'function') model.minimize(expression);
        },
        addHint(model, variable, value) {
          if (typeof model.addHint === 'function') model.addHint(variable, value);
        },
        async solve(model, params) {
          const solver = await module.CpSolver.create();
          const result = await solver.solve(model, params);
          return {
            status: result.status,
            statusName: String(result.status || 'UNKNOWN'),
            objectiveValue: () => Number(result.objectiveValue ?? 0),
            bestBound: () => (Number.isFinite(Number(result.bestObjectiveBound)) ? Number(result.bestObjectiveBound) : null),
            value: variable => result.value(variable)
          };
        }
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Baut das reine Datenmodell für einen Monat.
 */
export function buildCpSatModel({ state, monthData, baseline = monthData, config = {}, slots = null, hints = [] } = {}) {
  const openSlots = slots || Object.keys(monthData?.days || {}).sort().flatMap(dateIso =>
    ['bd', 'hg'].filter(role => !monthData.days?.[dateIso]?.[role]).map(role => ({ dateIso, role })));

  const staffIndex = new Map();
  const staffIds = [];
  {
    // Derselbe planbare Pool wie die Engine: die Vereinigung des planbaren
    // Personals über alle Tage des Monats (nicht das includeInPlanning-Flag).
    const seen = new Set();
    for (const dateIso of sortedDays(monthData)) {
      for (const person of getPlanningStaff(state?.staff || [], dateIso)) {
        if (seen.has(person.id)) continue;
        seen.add(person.id);
        staffIndex.set(person.id, staffIds.length + 1);
        staffIds.push(person.id);
      }
    }
  }
  const staffCount = staffIds.length;

  const variables = [];
  const auxiliary = [];
  const slotByKey = new Map();
  const candidateBySlot = [];

  for (const slot of openSlots) {
    const key = `${slot.dateIso}|${slot.role}`;
    const candidates = basicallyEligiblePeers(state, monthData, slot.dateIso, slot.role)
      .filter(person => staffIndex.has(person.id))
      .map(person => person.id);
    const variableIndex = variables.length;
    variables.push({ name: `x_${key}`, lb: 0, ub: staffCount, slot: { ...slot, key } });
    slotByKey.set(key, variableIndex);
    candidateBySlot.push(candidates);
  }

  const slotVariable = (dateIso, role) => {
    const key = `${dateIso}|${role}`;
    return slotByKey.get(key);
  };

  const hardConstraints = [];

  /**
   * Erzeugt eine Hilfsvariable im gemeinsamen Indexraum.
   * Slot-Variablen belegen 0..V−1, Hilfsvariablen V..V+A−1.
   */
  const addAuxiliary = (name, lb, ub) => {
    const index = variables.length + auxiliary.length;
    auxiliary.push({ index, name, lb, ub });
    return index;
  };

  /**
   * Fügt eine Ungleichheit left ≠ value als Klauselpaar hinzu.
   *
   * (left − right ≥ value + 1) ∨ (left − right ≤ value − 1) mit zwei
   * Binärvariablen und big-M-Relaxierung der inaktiven Klausel:
   *   b1=1 ⇒ left − right ≥ value + 1
   *   b2=1 ⇒ left − right ≤ value − 1
   *   b1 + b2 ≥ 1
   */
  const addNotEqual = (leftTerms, rightTerms, value, group, id, detail) => {
    const left = leftTerms[0];
    const right = rightTerms[0];
    const b1 = addAuxiliary(`b_${id}_hi`, 0, 1);
    const b2 = addAuxiliary(`b_${id}_lo`, 0, 1);
    // b1=1 ⇒ left − right ≥ value + 1
    hardConstraints.push({
      id: `${id}_hi`, group,
      terms: [[left[0], left[1]], [right[0], -right[1]], [b1, -BIG_M]],
      lb: value + 1 - BIG_M,
      ub: BIG_M,
      detail
    });
    // b2=1 ⇒ left − right ≤ value − 1
    hardConstraints.push({
      id: `${id}_lo`, group,
      terms: [[left[0], left[1]], [right[0], -right[1]], [b2, BIG_M]],
      lb: -BIG_M,
      ub: value - 1 + BIG_M,
      detail
    });
    // b1 ∨ b2
    hardConstraints.push({
      id: `${id}_or`, group,
      terms: [[b1, 1], [b2, 1]],
      lb: 1,
      ub: 2,
      detail
    });
  };

  // 1. Vollständige Belegung: jedes offene Feld ≥ 1.
  for (let index = 0; index < variables.length; index += 1) {
    hardConstraints.push({
      id: `cover_${variables[index].name}`, group: 'coverage',
      terms: [[index, 1]], lb: 1, ub: staffCount,
      detail: `Feld ${variables[index].slot.key} muss besetzt werden.`
    });
  }

  // 2. Domänen: nicht wählbare Personen ausschließen (x ≠ p).
  for (let index = 0; index < variables.length; index += 1) {
    const allowed = new Set(candidateBySlot[index]);
    const slot = variables[index].slot;
    for (let personValue = 1; personValue <= staffCount; personValue += 1) {
      if (allowed.has(staffIds[personValue - 1])) continue;
      addNotEqual(
        [[index, 1]], [[0, 0]], personValue, 'qualification',
        `domain_${slot.key}_p${personValue}`,
        `Person ${staffIds[personValue - 1]} ist für Feld ${slot.key} nicht wählbar.`
      );
    }
  }

  // 3. Doppelbelegung am selben Tag: x_bd ≠ x_hg.
  for (const dateIso of sortedDays(monthData)) {
    const bd = slotVariable(dateIso, 'bd');
    const hg = slotVariable(dateIso, 'hg');
    if (bd === undefined || hg === undefined) continue;
    addNotEqual(
      [[bd, 1]], [[hg, 1]], 0, 'sequence', `exclusive_${dateIso}`,
      `Doppelbelegung am ${dateIso} ausgeschlossen.`
    );
  }

  // 4. Kein BD an zwei aufeinanderfolgenden Kalendertagen: x_d ≠ x_{d+1}.
  const days = sortedDays(monthData);
  for (let index = 0; index < days.length - 1; index += 1) {
    const a = slotVariable(days[index], 'bd');
    const b = slotVariable(days[index + 1], 'bd');
    if (a === undefined || b === undefined) continue;
    addNotEqual(
      [[a, 1]], [[b, 1]], 0, 'sequence', `rest_${days[index]}`,
      `Kein Bereitschaftsdienst an zwei aufeinanderfolgenden Tagen (${days[index]} → ${days[index + 1]}).`
    );
  }

  // 5. HG am Werktag (Mo–Do) schließt BD am Folgetag aus: x_hg ≠ x_bd.
  for (let index = 0; index < days.length - 1; index += 1) {
    const weekday = weekdayOf(days[index]);
    if (weekday < 1 || weekday > 4) continue;
    const hg = slotVariable(days[index], 'hg');
    const bd = slotVariable(days[index + 1], 'bd');
    if (hg === undefined || bd === undefined) continue;
    addNotEqual(
      [[hg, 1]], [[bd, 1]], 0, 'sequence', `hgBeforeBd_${days[index]}`,
      `HG am Werktag ${days[index]} schließt BD am Folgetag aus.`
    );
  }

  // 6. Personengebundene Obergrenzen (Laufgrenzen + Personalmaxima).
  const configLimits = config.staffLimits || {};
  for (const staffId of staffIds) {
    const person = (state?.staff || []).find(item => item.id === staffId);
    for (const role of ['bd', 'hg']) {
      const max = Number.isInteger(configLimits[staffId]?.[`max${role === 'bd' ? 'Bd' : 'Hg'}`])
        ? configLimits[staffId][`max${role === 'bd' ? 'Bd' : 'Hg'}`]
        : role === 'bd' && Number.isInteger(person?.maxBd)
          ? person.maxBd
          : null;
      if (!Number.isInteger(max) || max >= 31) continue;
      const terms = [];
      for (let index = 0; index < variables.length; index += 1) {
        if (variables[index].slot.role !== role) continue;
        terms.push([index, 1]);
      }
      if (!terms.length) continue;
      const fixedCount = countFixedRole(baseline, staffId, role);
      hardConstraints.push({
        id: `limit_${role}_${staffId}`, group: 'limits',
        terms, lb: -BIG_M, ub: max - fixedCount,
        detail: `Obergrenze ${role.toUpperCase()} für ${staffId}: höchstens ${max} im Monat.`
      });
    }
    const totalMax = configLimits[staffId]?.maxTotal;
    if (Number.isInteger(totalMax)) {
      const terms = [];
      for (let index = 0; index < variables.length; index += 1) terms.push([index, 1]);
      let fixedCount = 0;
      for (const iso of Object.keys(baseline?.days || {})) {
        const day = baseline.days?.[iso] || {};
        if (day.bd === staffId || day.hg === staffId) fixedCount += 1;
      }
      hardConstraints.push({
        id: `limit_total_${staffId}`, group: 'limits',
        terms, lb: -BIG_M, ub: totalMax - fixedCount,
        detail: `Gesamtobergrenze für ${staffId}: höchstens ${totalMax} Dienste im Monat.`
      });
    }
  }

  // 7. Weiche Zielkomponenten.
  const components = {
    fairness: { terms: [], slack: [] },
    wishes: { terms: [], slack: [] },
    bdTarget: { terms: [], slack: [] },
    weekend: { terms: [] },
    saturday: { terms: [] },
    hgBurden: { terms: [] }
  };
  const weights = {
    fairness: Number(config.cpSatFairnessWeight ?? 90),
    wish: Number(config.cpSatWishWeight ?? 80),
    bdTarget: Number(config.cpSatBdTargetWeight ?? 60),
    weekend: Number(config.cpSatWeekendWeight ?? 55),
    saturday: Number(config.cpSatSaturdayWeight ?? 30),
    hgBurden: Number(config.cpSatHgWeight ?? 40)
  };

  // 7a. Fairness-Slack F: F ≥ |bdCount_i − bdTarget_i| für alle Personen.
  const fairnessSlack = addAuxiliary('slack_fairness', 0, BIG_M);
  for (const staffId of staffIds) {
    const person = (state?.staff || []).find(item => item.id === staffId);
    const target = Number(person?.bdTarget || 0);
    const bdTerms = [];
    for (let index = 0; index < variables.length; index += 1) {
      if (variables[index].slot.role !== 'bd') continue;
      bdTerms.push([index, 1]);
    }
    const fixedBd = countFixedRole(baseline, staffId, 'bd');
    // bdCount − target ≤ F  ⇒  Σ x − F ≤ target − fixedBd
    hardConstraints.push({
      id: `fairness_hi_${staffId}`, group: 'limits',
      terms: [...bdTerms, [fairnessSlack, -1]], lb: -BIG_M, ub: target - fixedBd,
      detail: `Fairness: Überlast ${staffId} begrenzt.`
    });
    // target − bdCount ≤ F  ⇒  −Σ x − F ≤ fixedBd − target
    hardConstraints.push({
      id: `fairness_lo_${staffId}`, group: 'limits',
      terms: [...bdTerms.map(([variableIndex, coefficient]) => [variableIndex, -coefficient]), [fairnessSlack, -1]],
      lb: -BIG_M, ub: fixedBd - target,
      detail: `Fairness: Unterlast ${staffId} begrenzt.`
    });
  }
  components.fairness.terms.push([fairnessSlack, weights.fairness]);
  components.fairness.slack.push(fairnessSlack);

  // 7b. Wunsch-Slacks: |x − gewünschtePerson|, gewichtet.
  const wishes = [];
  for (const [staffId, byDate] of Object.entries(monthData?.preferences || {})) {
    const personValue = staffIndex.get(staffId);
    if (personValue === undefined) continue;
    for (const [dateIso, type] of Object.entries(byDate || {})) {
      if (!['bd-bevorzugt', 'hg-bevorzugt', 'dienst-bevorzugt'].includes(type)) continue;
      const roles = type === 'bd-bevorzugt' ? ['bd'] : type === 'hg-bevorzugt' ? ['hg'] : ['bd', 'hg'];
      for (const role of roles) {
        const variableIndex = slotVariable(dateIso, role);
        if (variableIndex === undefined) continue;
        wishes.push({ variableIndex, personValue });
      }
    }
  }
  for (const { variableIndex, personValue } of wishes) {
    const slack = addAuxiliary(`slack_wish_${variableIndex}`, 0, staffCount);
    // x − p ≤ s  ⇒  x − s ≤ p
    hardConstraints.push({
      id: `wish_hi_${variableIndex}`, group: 'coupling',
      terms: [[variableIndex, 1], [slack, -1]], lb: -BIG_M, ub: personValue,
      detail: 'Dienstwunsch: Abweichung nach oben begrenzt.'
    });
    // p − x ≤ s  ⇒  −x − s ≤ −p
    hardConstraints.push({
      id: `wish_lo_${variableIndex}`, group: 'coupling',
      terms: [[variableIndex, -1], [slack, -1]], lb: -BIG_M, ub: -personValue,
      detail: 'Dienstwunsch: Abweichung nach unten begrenzt.'
    });
    components.wishes.terms.push([slack, weights.wish]);
    components.wishes.slack.push(slack);
  }

  // 7c. BD-Soll-Slacks: |bdCount_i − target_i|.
  for (const staffId of staffIds) {
    const person = (state?.staff || []).find(item => item.id === staffId);
    const target = Number(person?.bdTarget || 0);
    if (!Number.isFinite(target)) continue;
    const bdTerms = [];
    for (let index = 0; index < variables.length; index += 1) {
      if (variables[index].slot.role !== 'bd') continue;
      bdTerms.push([index, 1]);
    }
    if (!bdTerms.length) continue;
    const fixedBd = countFixedRole(baseline, staffId, 'bd');
    const slack = addAuxiliary(`slack_target_${staffId}`, 0, staffCount);
    hardConstraints.push({
      id: `target_hi_${staffId}`, group: 'limits',
      terms: [...bdTerms, [slack, -1]], lb: -BIG_M, ub: target - fixedBd,
      detail: `BD-Soll ${staffId}: Übererfüllung begrenzt.`
    });
    hardConstraints.push({
      id: `target_lo_${staffId}`, group: 'limits',
      terms: [...bdTerms.map(([variableIndex, coefficient]) => [variableIndex, -coefficient]), [slack, -1]],
      lb: -BIG_M, ub: fixedBd - target,
      detail: `BD-Soll ${staffId}: Untererfüllung begrenzt.`
    });
    components.bdTarget.terms.push([slack, weights.bdTarget]);
    components.bdTarget.slack.push(slack);
  }

  // 7d. Wochenend-/Samstags-/HG-Last (linear, gewichtet).
  for (let index = 0; index < variables.length; index += 1) {
    const slot = variables[index].slot;
    const weekday = weekdayOf(slot.dateIso);
    if (slot.role === 'hg' && [5, 6, 0].includes(weekday)) {
      components.weekend.terms.push([index, weights.weekend]);
      components.hgBurden.terms.push([index, weights.hgBurden]);
    }
    if (slot.role === 'bd' && weekday === 6) {
      components.saturday.terms.push([index, weights.saturday]);
    }
  }

  // 8. Hinweise für den Warmstart.
  const hintMap = {};
  for (const hint of hints || []) {
    const variableIndex = slotVariable(hint.dateIso, hint.role);
    const personValue = staffIndex.get(hint.staffId);
    if (variableIndex === undefined || personValue === undefined) continue;
    hintMap[variableIndex] = personValue;
  }

  return {
    revision: CP_SAT_REVISION,
    variables,
    auxiliary,
    staffIds,
    staffIndex,
    candidateBySlot,
    slotByKey,
    hardConstraints,
    components,
    weights,
    hintMap,
    relaxGroups: [...new Set(hardConstraints.map(constraint => constraint.group))],
    counts: {
      variables: variables.length,
      auxiliary: auxiliary.length,
      hardConstraints: hardConstraints.length,
      openSlots: openSlots.length,
      staff: staffCount
    }
  };
}

/**
 * Standard-Parameter für einen Solve-Lauf.
 */
export function cpSatParameters({ timeLimitMs = 10000, maxWorkers = null, randomSeed = 42, logSearch = false } = {}) {
  const params = {
    max_time_in_seconds: Math.max(0.1, Number(timeLimitMs || 10000) / 1000),
    random_seed: Number.isInteger(randomSeed) ? randomSeed : 42,
    log_search_progress: Boolean(logSearch)
  };
  if (Number.isInteger(maxWorkers) && maxWorkers >= 1) params.num_search_workers = Math.max(1, Math.min(8, maxWorkers));
  return params;
}

/**
 * Übersetzt das Datenmodell in die Bindung und löst.
 *
 * @param {object} options
 * @param {string[]} [options.objectiveComponentIds] auszuwählende Zielkomponenten
 * @param {Array<{terms:Array,lb:number,ub:number,id:string,group:string,detail:string}>} [options.extraConstraints]
 * @param {Set<string>|string[]} [options.activeConstraintIds] auf diese Constraints begrenzen
 */
export async function solveCpSatModel(model, api, {
  timeLimitMs = 10000,
  maxWorkers = null,
  randomSeed = 42,
  objectiveComponentIds = null,
  extraConstraints = [],
  activeConstraintIds = null,
  logSearch = false
} = {}) {
  if (!api || !model) return { status: 'UNKNOWN', statusName: 'UNKNOWN', reason: 'solver-unavailable', values: [], solution: {} };
  const startedAt = Date.now();
  try {
    const boundModel = api.createModel();
    const boundVariables = model.variables.map(variable => api.newIntVar(boundModel, variable.lb, variable.ub, variable.name));
    const boundAuxiliary = model.auxiliary.map(variable => api.newIntVar(boundModel, variable.lb, variable.ub, variable.name));
    const boundAll = [...boundVariables, ...boundAuxiliary];
    const allVariableCount = model.variables.length + model.auxiliary.length;

    const active = activeConstraintIds === null
      ? null
      : new Set(activeConstraintIds);

    let applied = 0;
    const applyConstraint = constraint => {
      if (active && !active.has(constraint.id)) return;
      const terms = constraint.terms.map(([variableIndex, coefficient]) => [boundAll[variableIndex], coefficient]);
      if (!terms.length) return;
      const lb = Number.isFinite(constraint.lb) ? constraint.lb : -BIG_M;
      const ub = Number.isFinite(constraint.ub) ? constraint.ub : BIG_M;
      if (api.addLinear(boundModel, terms, lb, ub)) applied += 1;
    };
    for (const constraint of model.hardConstraints) applyConstraint(constraint);
    for (const constraint of extraConstraints || []) applyConstraint(constraint);

    if (objectiveComponentIds !== null && objectiveComponentIds.length) {
      const selected = new Set(objectiveComponentIds);
      const terms = [];
      for (const [id, component] of Object.entries(model.components)) {
        if (!selected.has(id)) continue;
        for (const [variableIndex, coefficient] of component.terms) {
          if (variableIndex >= allVariableCount) continue;
          terms.push([variableIndex, coefficient]);
        }
      }
      if (terms.length) api.minimize(boundModel, terms);
    } else if (model.components) {
      const terms = [];
      for (const component of Object.values(model.components)) {
        for (const [variableIndex, coefficient] of component.terms) {
          if (variableIndex >= allVariableCount) continue;
          terms.push([variableIndex, coefficient]);
        }
      }
      if (terms.length) api.minimize(boundModel, terms);
    }

    for (const [variableIndex, value] of Object.entries(model.hintMap)) {
      const index = Number(variableIndex);
      if (index < boundAll.length) api.addHint(boundModel, boundAll[index], value);
    }

    const result = await api.solve(boundModel, cpSatParameters({ timeLimitMs, maxWorkers, randomSeed, logSearch }));
    const statusName = String(result.statusName || 'UNKNOWN');
    const values = model.variables.map((variable, index) => Number(result.value(boundVariables[index]) ?? 0));
    const solution = {};
    for (let index = 0; index < model.variables.length; index += 1) {
      const staffId = model.staffIds[values[index] - 1];
      if (staffId) solution[model.variables[index].slot.key] = staffId;
    }
    return {
      status: statusName,
      statusName,
      objectiveValue: Number(result.objectiveValue?.() ?? 0),
      bestBound: result.bestBound?.(),
      values,
      solution,
      appliedConstraints: applied,
      wallTimeMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'UNKNOWN', statusName: 'UNKNOWN', reason: 'solve-failed',
      error: error?.message || String(error), values: [], solution: {},
      wallTimeMs: Date.now() - startedAt
    };
  }
}

export function constraintIdsOfGroup(model, group) {
  return model.hardConstraints
    .filter(constraint => constraint.group === group)
    .map(constraint => constraint.id);
}

/**
 * Reihenfolge der relaxierbaren Gruppen gemäß Konfiguration.
 */
export function relaxGroupOrder(config) {
  const order = Object.entries(RELAX_GROUPS).sort((a, b) => a[1].priority - b[1].priority).map(([id]) => id);
  if (config?.infeasibilityMode === 'relax' && Array.isArray(config.relaxOrder) && config.relaxOrder.length) {
    const configured = config.relaxOrder.filter(id => RELAX_GROUPS[id]);
    if (configured.length) return [...configured, ...order.filter(id => !configured.includes(id))];
  }
  return order;
}

/**
 * MUS-artige Relaxations-Diagnose: Gruppen werden gierig wieder aktiviert,
 * bis das Modell unzulässig wird; die zuletzt aktivierte Gruppe ist die
 * kleinste nachgewiesene Konfliktursache.
 */
export async function diagnoseInfeasibility(model, api, {
  timeLimitMs = 4000,
  maxWorkers = null,
  randomSeed = 42
} = {}) {
  if (!api || !model) return { infeasible: true, groups: [], detail: 'Solver nicht verfügbar.' };
  const order = relaxGroupOrder({});
  const causes = [];
  let activeIds = new Set();
  for (const group of order) {
    const ids = constraintIdsOfGroup(model, group);
    if (!ids.length) continue;
    const trial = new Set(activeIds);
    for (const id of ids) trial.add(id);
    const result = await solveCpSatModel(model, api, {
      timeLimitMs,
      maxWorkers,
      randomSeed,
      activeConstraintIds: [...trial]
    });
    if (result.statusName === 'INFEASIBLE' || result.statusName === 'MODEL_INVALID') {
      causes.push(group);
      break;
    }
    activeIds = trial;
  }
  return {
    infeasible: causes.length > 0,
    groups: causes.map(id => ({ id, label: RELAX_GROUPS[id]?.label || id })),
    activeGroups: [...activeIds].map(id => ({ id, label: RELAX_GROUPS[id]?.label || id })),
    detail: causes.length
      ? `Konfliktursache: ${causes.map(id => RELAX_GROUPS[id]?.label || id).join(', ')}`
      : 'Keine einzelne Gruppe erklärt die Unzulässigkeit – die Ursache liegt in der Kombination.'
  };
}

export const CP_SAT_BRIDGE_VERSION = VERSION_MARKER;
