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

import { basicallyEligiblePeers, getPlanningStaff, getAbsence, ABSENCE_FOR_CT_LEADERSHIP } from './rules-core.js?v=20260805.1';
import { isRegularWorkdayIso } from './holidays.js?v=20260805.1';

export const CP_SAT_REVISION = 2;

// Lokale Auslieferung hat Vorrang (kein CDN-Laufzeitrisiko, offline-fähig).
// cpsat-js (portable) läuft ohne Cross-Origin-Isolation; or-tools-wasm bleibt
// als CDN-Fallback erhalten, da das npm-Paket keinen cp-sat-Build mitliefert.
export const SOLVER_LOAD_ORDER = Object.freeze([
  { id: 'cpsat-js', source: 'local', url: '/vendor/cpsat-js/dist/index.portable.js' },
  { id: 'cpsat-js', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/cpsat-js@1.3.0/+esm' },
  { id: 'or-tools-wasm', source: 'cdn', url: 'https://cdn.jsdelivr.net/npm/or-tools-wasm@0.9.1/cp-sat/+esm' }
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

const VERSION_MARKER = '20260805.1';
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
 * Nächster regulärer Werktag (Mo–Fr) nach `dateIso` innerhalb des Monats.
 * Wochenenden werden übersprungen; Ferien sind im Modell nachrangig, da die
 * fachliche Wahrheit ohnehin im Regel-Audit geprüft wird.
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

/**
 * Erzeugt ein 0/1-Literal `b`, das genau dann 1 ist, wenn `targetIndex == value`.
 * Rückgabe ist der Index des Literals.
 */
function addReifiedEqual(addAuxiliary, hardConstraints, targetIndex, value, group, idPrefix) {
  const a = addAuxiliary(`${idPrefix}_eq`, 0, 1);
  // a=1 ⇒ target == value
  hardConstraints.push({ id: `${idPrefix}_eq_hi`, group, terms: [[targetIndex, 1], [a, BIG_M]], lb: -BIG_M, ub: BIG_M + value, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_eq_lo`, group, terms: [[targetIndex, 1], [a, -BIG_M]], lb: value - BIG_M, ub: BIG_M, detail: '' });
  // a=0 ⇒ target != value (über Hilfsliterale b1/b2)
  const b1 = addAuxiliary(`${idPrefix}_neq_hi`, 0, 1);
  const b2 = addAuxiliary(`${idPrefix}_neq_lo`, 0, 1);
  hardConstraints.push({ id: `${idPrefix}_neq_hi`, group, terms: [[targetIndex, 1], [b1, -BIG_M]], lb: value + 1 - BIG_M, ub: BIG_M, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_neq_lo`, group, terms: [[targetIndex, 1], [b2, BIG_M]], lb: -BIG_M, ub: value - 1 + BIG_M, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_neq_or`, group, terms: [[b1, 1], [b2, 1]], lb: 1, ub: 2, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_eq_off`, group, terms: [[a, 1], [b1, -1], [b2, -1]], lb: -BIG_M, ub: 0, detail: '' });
  return a;
}

/**
 * Erzeugt ein 0/1-Literal, das genau dann 1 ist, wenn `targetIndex != value`.
 * Rückgabe ist der Index des Literals.
 */
function addReifiedNotEqual(addAuxiliary, hardConstraints, targetIndex, value, group, idPrefix) {
  const b = addAuxiliary(`${idPrefix}_ne`, 0, 1);
  const b1 = addAuxiliary(`${idPrefix}_ne_hi`, 0, 1);
  const b2 = addAuxiliary(`${idPrefix}_ne_lo`, 0, 1);
  hardConstraints.push({ id: `${idPrefix}_ne_hi`, group, terms: [[targetIndex, 1], [b1, -BIG_M]], lb: value + 1 - BIG_M, ub: BIG_M, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_ne_lo`, group, terms: [[targetIndex, 1], [b2, BIG_M]], lb: -BIG_M, ub: value - 1 + BIG_M, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_ne_or`, group, terms: [[b1, 1], [b2, 1]], lb: 1, ub: 2, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_ne`, group, terms: [[b, 1], [b1, -1], [b2, -1]], lb: -BIG_M, ub: 0, detail: '' });
  hardConstraints.push({ id: `${idPrefix}_ne_impl`, group, terms: [[b, 1], [b1, -1], [b2, -1]], lb: 0, ub: BIG_M, detail: '' });
  return b;
}

/**
 * Lädt die Solver-Bindung (einmalig je Session).
 *
 * Die Engine läuft in Modul-Workern (`auto-plan-worker.js`); dort existiert
 * kein `document`, aber sehr wohl `import()` und WebAssembly. Der Guard prüft
 * deshalb Browser- UND Worker-Kontexte – nur reine Node-Umgebungen (Tests,
 * CLI) bleiben ohne Bindung und nutzen den Heuristik-Fallback.
 */
export async function loadCpSatSolver({ signal = null } = {}) {
  if (loader) return loader;
  loader = (async () => {
    const inRuntime = typeof globalThis !== 'undefined'
      && (typeof globalThis.document !== 'undefined' || typeof globalThis.WorkerGlobalScope !== 'undefined');
    if (!inRuntime) return null;
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
    // cpsat-js liefert einen numerischen CpSolverStatus und erwartet
    // camelCase-Parameter. Beides muss an die status- und parametergesteuerte
    // Engine angepasst werden, sonst fällt v9 immer auf die Heuristik zurück.
    const statusEnum = module.CpSolverStatus || {};
    const byCode = {};
    for (const [key, value] of Object.entries(statusEnum)) {
      if (typeof value === 'number' && typeof key === 'string' && !/^\d+$/.test(key)) byCode[value] = key;
    }
    const statusNameOf = code => byCode[code] ?? 'UNKNOWN';
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
        const adapted = {
          maxTimeInSeconds: Number(params?.max_time_in_seconds ?? params?.maxTimeInSeconds ?? 10),
          numWorkers: Number.isInteger(params?.num_search_workers ?? params?.numWorkers)
            ? (params.num_search_workers ?? params.numWorkers)
            : undefined
        };
        const result = await solver.solve(model, adapted);
        const statusName = statusNameOf(result.status);
        return {
          status: statusName,
          statusName,
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

  // Weiche Zielkomponenten und Gewichte – hier deklariert, damit die
  // harten Regelabschnitte (Becker-FZA, CT-Leitung, Wochenendkette) und die
  // Perturbationsziele bereits beim Aufbau auf sie zugreifen können.
  const components = {
    fairness: { terms: [], slack: [] },
    wishes: { terms: [], slack: [] },
    bdTarget: { terms: [], slack: [] },
    weekend: { terms: [] },
    saturday: { terms: [] },
    hgBurden: { terms: [] },
    ctLeadership: { terms: [], slack: [] },
    weekendChain: { terms: [], slack: [] },
    perturbation: { terms: [], slack: [] }
  };
  const weights = {
    fairness: Number(config.cpSatFairnessWeight ?? 90),
    wish: Number(config.cpSatWishWeight ?? 80),
    bdTarget: Number(config.cpSatBdTargetWeight ?? 60),
    weekend: Number(config.cpSatWeekendWeight ?? 55),
    saturday: Number(config.cpSatSaturdayWeight ?? 30),
    hgBurden: Number(config.cpSatHgWeight ?? 40),
    ctLeadership: Number(config.cpSatCtLeadershipWeight ?? 70),
    weekendChain: Number(config.cpSatWeekendChainWeight ?? 100),
    perturbation: Number(config.cpSatPerturbationWeight ?? 45)
  };

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

  // 5b. Becker-FZA (korrigiert: nach jedem BD, nicht nur Samstag) und CT-Leitung (M1).
  // Becker leitet aus jedem BD einen wirksamen FZA am nächsten regulären Werktag
  // ab; an diesem Tag ist Becker weder für BD noch für HG wählbar. Gleichzeitig
  // soll die Modellierung nicht selbst eine CT-Leitungslücke erzeugen: Ist Martin
  // am FZA-Tag abwesend, wird Becker-BD an vortagigen Tagen bestraft.
  const beckerValue = staffIndex.get('becker');
  const martinAbsentOn = iso => {
    const absence = getAbsence(monthData, 'martin', iso);
    return Boolean(absence) && ABSENCE_FOR_CT_LEADERSHIP.has(absence);
  };
  if (beckerValue !== undefined) {
    for (const dateIso of days) {
      const bd = slotVariable(dateIso, 'bd');
      if (bd === undefined) continue;
      const next = nextRegularWorkdayIso(days, dateIso);
      if (!next) continue;
      const a = addReifiedEqual(addAuxiliary, hardConstraints, bd, beckerValue, 'sequence', `becker_fza_${dateIso}`);
      const nextBd = slotVariable(next, 'bd');
      const nextHg = slotVariable(next, 'hg');
      if (nextBd !== undefined) {
        const ne = addReifiedNotEqual(addAuxiliary, hardConstraints, nextBd, beckerValue, 'sequence', `becker_fza_nbd_${dateIso}`);
        hardConstraints.push({ id: `becker_fza_nbd_imply_${dateIso}`, group: 'sequence', terms: [[a, 1], [ne, -1]], lb: -BIG_M, ub: 0, detail: `Becker-FZA am ${next}: BD gesperrt.` });
      }
      if (nextHg !== undefined) {
        const ne = addReifiedNotEqual(addAuxiliary, hardConstraints, nextHg, beckerValue, 'sequence', `becker_fza_nhg_${dateIso}`);
        hardConstraints.push({ id: `becker_fza_nhg_imply_${dateIso}`, group: 'sequence', terms: [[a, 1], [ne, -1]], lb: -BIG_M, ub: 0, detail: `Becker-FZA am ${next}: HG gesperrt.` });
      }
      if (martinAbsentOn(next)) {
        components.ctLeadership.terms.push([a, weights.ctLeadership]);
        components.ctLeadership.slack.push(a);
      }
    }
  }

  // 5c. Wochenendkette Fr-BD · Sa frei · So-BD (v4.10) – weiches Vermeidungsziel.
  // Die Kette ist rot und besonders bestätigungspflichtig; die exakte Suche soll
  // sie nach Möglichkeit vermeiden, ohne harte Ziele zu verletzen.
  for (let index = 0; index < days.length - 2; index += 1) {
    if (weekdayOf(days[index]) !== 5) continue;
    const fri = days[index];
    const sat = days[index + 1];
    const sun = days[index + 2];
    if (weekdayOf(sun) !== 0) continue;
    const bdFri = slotVariable(fri, 'bd');
    const satBd = slotVariable(sat, 'bd');
    const satHg = slotVariable(sat, 'hg');
    const bdSun = slotVariable(sun, 'bd');
    if (bdFri === undefined || bdSun === undefined) continue;
    for (const staffId of staffIds) {
      const pv = staffIndex.get(staffId);
      if (!pv) continue;
      const a1 = addReifiedEqual(addAuxiliary, hardConstraints, bdFri, pv, 'coupling', `chain_fri_${fri}_${staffId}`);
      const a4 = addReifiedEqual(addAuxiliary, hardConstraints, bdSun, pv, 'coupling', `chain_sun_${fri}_${staffId}`);
      const a2 = satBd !== undefined ? addReifiedNotEqual(addAuxiliary, hardConstraints, satBd, pv, 'coupling', `chain_satbd_${fri}_${staffId}`) : null;
      const a3 = satHg !== undefined ? addReifiedNotEqual(addAuxiliary, hardConstraints, satHg, pv, 'coupling', `chain_sathg_${fri}_${staffId}`) : null;
      const chain = addAuxiliary(`chain_${fri}_${staffId}`, 0, 1);
      const present = [a1, a2, a3, a4].filter(Boolean);
      for (const lit of present) {
        hardConstraints.push({ id: `chain_le_${fri}_${staffId}_${lit}`, group: 'coupling', terms: [[chain, 1], [lit, -1]], lb: -BIG_M, ub: 0, detail: '' });
      }
      const geTerms = [[chain, 1], ...present.map(lit => [lit, -1])];
      hardConstraints.push({ id: `chain_ge_${fri}_${staffId}`, group: 'coupling', terms: geTerms, lb: -(present.length - 1), ub: BIG_M, detail: 'Wochenendkette Fr-BD · Sa frei · So-BD' });
      components.weekendChain.terms.push([chain, weights.weekendChain]);
      components.weekendChain.slack.push(chain);
    }
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

  // 7. Weiche Zielkomponenten (Komponenten und Gewichte sind oben deklariert).
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

  // 8b. Minimal-Perturbation: Abweichung vom Heuristik-Hinweis (ehrt manuelle
  // Edits, da die Heuristik bestehende Belegungen übernimmt) möglichst vermeiden.
  // Aktiv nur, wenn der Stabilitätsschutz (protectBaseline) eingeschaltet ist.
  if (Number(weights.perturbation) > 0 && config.protectBaseline !== false) {
    for (const [variableIndex, personValue] of Object.entries(hintMap)) {
      const idx = Number(variableIndex);
      if (idx >= variables.length) continue;
      if (!candidateBySlot[idx]?.includes(staffIds[personValue - 1])) continue;
      const ne = addReifiedNotEqual(addAuxiliary, hardConstraints, idx, personValue, 'coverage', `perturb_${idx}`);
      components.perturbation.terms.push([ne, weights.perturbation]);
      components.perturbation.slack.push(ne);
    }
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
/**
 * Echte MUS (Minimal Unsatisfiable Subset) via zweistufige Löschdiagnose
 * (QuickXplain-Anleihen), ohne Assumptions-API:
 *
 *  - Ebene 1 (Gruppen): Ausgehend von der vollständigen, unzulässigen
 *    Constraint-Menge wird Gruppe für Gruppe geprüft, ob deren Entfernung die
 *    Zulässigkeit wiederherstellt. Nicht essenzielle Gruppen fallen aus dem
 *    Konflikt. Gruppen mit niedriger Priorität werden zuerst entspannt, damit
 *    im MUS die fachlich gewichtigeren Konflikte stehen bleiben.
 *  - Ebene 2 (Constraint): Innerhalb jeder essenziellen Gruppe wird dieselbe
 *    Löschdiagnose auf einzelne Constraints angewendet – das Ergebnis ist eine
 *    minimale, erklärbare Konfliktmenge, nicht nur eine ganzes Bündel.
 *
 * Die zurückgegebene `groups`-Liste enthält ausschließlich die im Konflikt
 * stehenden relaxierbaren Gruppen (mit Label) und speist direkt die
 * Relaxierungs-UI der v9-Engine.
 */
export async function diagnoseInfeasibility(model, api, {
  timeLimitMs = 8000,
  maxWorkers = null,
  randomSeed = 42,
  signal = null
} = {}) {
  if (!api || !model) return { infeasible: true, mus: [], groups: [], detail: 'Solver nicht verfügbar.' };
  const isFeasible = result => Boolean(result) && (result.statusName === 'FEASIBLE' || result.statusName === 'OPTIMAL');
  const allGroups = [...new Set(model.hardConstraints.map(constraint => constraint.group))];
  const groupPriority = id => RELAX_GROUPS[id]?.priority ?? 99;
  const orderedGroups = [...allGroups].sort((a, b) => groupPriority(a) - groupPriority(b));
  const perGroupBudget = Math.max(700, Math.floor(Number(timeLimitMs || 8000) / Math.max(1, orderedGroups.length + 8)));
  const solveRelaxed = droppedGroups => {
    const dropped = new Set(droppedGroups);
    const activeIds = model.hardConstraints.filter(constraint => !dropped.has(constraint.group)).map(constraint => constraint.id);
    return solveCpSatModel(model, api, { timeLimitMs: perGroupBudget, maxWorkers, randomSeed, activeConstraintIds: activeIds });
  };

  // Ebene 1: Gruppen-MUS.
  const essentialGroups = new Set(allGroups);
  for (const group of orderedGroups) {
    if (signal?.aborted) break;
    const trial = new Set(essentialGroups);
    trial.delete(group);
    const result = await solveRelaxed(trial);
    if (isFeasible(result)) essentialGroups.delete(group);
  }

  // Ebene 2: minimale Konfliktmenge je essenzieller Gruppe.
  const conflictIds = new Set();
  for (const group of essentialGroups) {
    if (signal?.aborted) break;
    const groupConstraints = model.hardConstraints.filter(constraint => constraint.group === group);
    const kept = new Set(groupConstraints.map(constraint => constraint.id));
    for (const constraint of groupConstraints) {
      const trial = new Set(kept);
      trial.delete(constraint.id);
      const activeIds = model.hardConstraints
        .filter(constraint2 => constraint2.group !== group || trial.has(constraint2.id))
        .map(constraint2 => constraint2.id);
      const result = await solveCpSatModel(model, api, { timeLimitMs: perGroupBudget, maxWorkers, randomSeed, activeConstraintIds: activeIds });
      if (isFeasible(result)) kept.delete(constraint.id);
    }
    for (const id of kept) conflictIds.add(id);
  }

  const conflictGroups = [...new Set([...conflictIds].map(id => model.hardConstraints.find(constraint => constraint.id === id)?.group))].filter(Boolean);
  const groups = conflictGroups.map(id => ({ id, label: RELAX_GROUPS[id]?.label || id }));
  return {
    infeasible: true,
    mus: [...conflictIds],
    groups,
    activeGroups: groups.map(group => group.id),
    detail: groups.length
      ? `Kleinste nachgewiesene Konfliktursache (MUS): ${groups.map(group => group.label).join(', ')}`
      : 'Keine einzelne Gruppe erklärt die Unzulässigkeit – die Ursache liegt in der Kombination.'
  };
}

export const CP_SAT_BRIDGE_VERSION = VERSION_MARKER;
