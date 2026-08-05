/**
 * Auto-Plan v10 — Solver-Brücke.
 *
 * Überträgt die reine Modellbeschreibung aus `js/auto-plan-model.js` in die
 * WebAssembly-Bindung von CP-SAT und liefert das Ergebnis zurück.
 *
 * DREI DINGE, DIE HIER BEWUSST ANDERS SIND ALS IN DER VORGÄNGERFASSUNG
 *
 * 1. **Erkennung nach Fabrik, nicht nach Namen.** `cpsat-js` und
 *    `or-tools-wasm` exportieren beide `CpModel` und `CpSolver`. Eine Prüfung
 *    auf das bloße Vorhandensein beider Namen wählt deshalb immer dieselbe
 *    Bindung — in der Vorgängerfassung die falsche, weshalb jeder Lösungsversuch
 *    in einem verschluckten Fehler endete. Entschieden wird hier an der
 *    tatsächlichen Fabrik: `CpSolver.create` gibt es nur bei `cpsat-js`.
 *
 * 2. **Ein selbsttragendes Bündel als erste Quelle.** Die ausgelieferten
 *    `cpsat-js`-Quellen enthalten den bloßen Bezeichner `@bufbuild/protobuf`.
 *    Ohne Import-Map lässt sich das im Browser nicht auflösen, und in einem
 *    Modul-Worker gilt die Import-Map des Dokuments ohnehin nicht. Deshalb wird
 *    ein gebündelter, vollständig relativer Einstiegspunkt ausgeliefert.
 *
 * 3. **`notEquals` wird nie verwendet.** In `cpsat-js` erzeugt
 *    `IntVar.notEquals()` eine Bedingung über die volle Wertedomäne — also gar
 *    keine Bedingung. Der Quelltext kündigt eine Sonderbehandlung an, die nicht
 *    existiert. Jede Ungleichheit wird hier über Binärvariablen ausgedrückt.
 */

const VERSION_MARKER = '20260806.1';

/**
 * Ladeordnung. Das lokale Bündel hat Vorrang: kein Netzabhängigkeit zur
 * Laufzeit, offlinefähig, und mit `immutable`-Cache genau einmal geladen.
 */
export const SOLVER_SOURCES = Object.freeze([
  { id: 'cpsat-js', origin: 'local', url: '/vendor/cpsat-js/dist/cpsat-portable.bundle.js' },
  { id: 'cpsat-js', origin: 'cdn', url: 'https://cdn.jsdelivr.net/npm/cpsat-js@1.3.0/+esm' }
]);

let loader = null;
let loadDiagnostics = [];

/**
 * Lädt die Bindung einmalig je Ausführungskontext.
 * Node-Umgebungen ohne DOM und ohne Worker-Scope bleiben absichtlich ohne
 * Bindung; dort greift der heuristische Pfad, und die Modelltests laufen
 * solverfrei.
 */
export async function loadSolver({ signal = null, sources = SOLVER_SOURCES } = {}) {
  if (loader) return loader;
  loader = (async () => {
    loadDiagnostics = [];
    for (const candidate of sources) {
      if (signal?.aborted) return null;
      try {
        const module = await import(/* webpackIgnore: true */ candidate.url);
        const api = adapt(module, candidate);
        if (api) {
          // Die WASM-Instanz einmal je Kontext erzeugen: Das Modul ist rund
          // sechs Megabyte groß, seine Instanziierung dominiert die Laufzeit
          // kleiner Modelle bei weitem.
          api.solverInstance = await module.CpSolver.create();
          loadDiagnostics.push({ ...candidate, ok: true });
          return api;
        }
        loadDiagnostics.push({ ...candidate, ok: false, reason: 'unbekannte Oberfläche' });
      } catch (error) {
        loadDiagnostics.push({ ...candidate, ok: false, reason: error?.message || String(error) });
      }
    }
    return null;
  })();
  return loader;
}

export function solverDiagnostics() {
  return [...loadDiagnostics];
}

export async function isSolverReady(options = {}) {
  return Boolean(await loadSolver(options));
}

export function resetSolverForTests() {
  loader = null;
  loadDiagnostics = [];
}

function adapt(module, candidate) {
  if (typeof module?.CpSolver?.create !== 'function' || typeof module?.CpModel !== 'function') return null;
  const statusEnum = module.CpSolverStatus || {};
  const byCode = new Map();
  for (const [key, value] of Object.entries(statusEnum)) {
    if (typeof value === 'number' && !/^\d+$/.test(key)) byCode.set(value, key);
  }
  return {
    id: candidate.id,
    origin: candidate.origin,
    url: candidate.url,
    module,
    solverInstance: null,
    statusName: code => (typeof code === 'string' ? code : byCode.get(code) || 'UNKNOWN')
  };
}

/**
 * Summiert Literale und Terme zu einem linearen Ausdruck.
 *
 * `IntVar.plus(x)` wandelt sein Argument selbst um, `LinearExpr.plus(x)` nicht —
 * ein gemischter Aufruf endet in `other.terms is not iterable`. Diese Funktion
 * ist die einzige Stelle, an der Ausdrücke zusammengesetzt werden, damit die
 * Unterscheidung genau einmal getroffen werden muss.
 */
export function sumOf(pairs) {
  let expression = null;
  for (const [variable, coefficient] of pairs) {
    if (!coefficient) continue;
    const term = variable.toLinearExpr().times(coefficient);
    expression = expression === null ? term : expression.plus(term);
  }
  return expression;
}

/**
 * Sichere ganzzahlige Schranken für eine Termmenge.
 * CP-SAT erwartet ganzzahlige Domänengrenzen; „unbeschränkt" wird deshalb aus
 * den Koeffizienten und Variablengrenzen ausgerechnet statt geraten.
 */
export function termBounds(terms, vars) {
  let low = 0;
  let high = 0;
  for (const [variableIndex, coefficient] of terms) {
    const variable = vars[variableIndex];
    const a = coefficient * variable.lb;
    const b = coefficient * variable.ub;
    low += Math.min(a, b);
    high += Math.max(a, b);
  }
  return [low, high];
}

/**
 * Materialisiert ein Modell und löst es.
 *
 * @param {object} model Beschreibung aus `buildPlanModel`
 * @param {object} api Bindung aus `loadSolver`
 * @param {object} options
 * @param {Array<{terms:Array,lb:number,ub:number}>} [options.extraConstraints] zusätzliche Schnitte (lexikografische Fixierung)
 * @param {Array<[number,number]>} [options.objectiveTerms] zu minimierender Ausdruck
 * @param {Array<[number,number]>} [options.fixedValues] Variablen auf feste Werte legen (LNS, Relaxationsliterale)
 * @param {Set<string>|null} [options.disabledGroups] Gruppen, deren Constraints entfallen
 * @param {(update:object)=>void} [options.onIncumbent] Rückruf je gefundener Zwischenlösung
 */
export function solveModel(model, api, {
  timeLimitMs = 8000,
  workers = 1,
  extraVars = [],
  extraConstraints = [],
  objectiveTerms = null,
  maximize = false,
  fixedValues = [],
  disabledGroups = null,
  hintValues = null,
  onIncumbent = null
} = {}) {
  if (!api || !model) {
    return { statusName: 'UNAVAILABLE', objectiveValue: null, bestBound: null, values: [], wallTimeMs: 0 };
  }
  const startedAt = Date.now();
  try {
    const { CpModel } = api.module;
    const bound = new CpModel();
    // Zusatzvariablen der laufenden Stufe schließen lückenlos an den festen
    // Variablenraum des Modells an. Nur so dürfen Stufenausdrücke (etwa die
    // Leximin-Überschüsse) auf sie verweisen, ohne das Modell umzubauen.
    const allVars = [...model.vars, ...(extraVars || [])];
    const variables = allVars.map(variable => (variable.lb === 0 && variable.ub === 1
      ? bound.newBoolVar(variable.name)
      : bound.newIntVar(variable.lb, variable.ub, variable.name)));

    const skip = disabledGroups instanceof Set ? disabledGroups : null;
    let applied = 0;
    const addLinear = (terms, lb, ub, enforce) => {
      const expression = sumOf(terms.map(([variableIndex, coefficient]) => [variables[variableIndex], coefficient]));
      if (!expression) return;
      const constraint = bound.addLinearConstraint(expression, Math.round(lb), Math.round(ub));
      if (enforce !== null && enforce !== undefined) constraint.onlyEnforceIf(variables[enforce]);
      applied += 1;
    };

    for (const constraint of model.constraints) {
      if (skip && skip.has(constraint.group)) continue;
      addLinear(constraint.terms, constraint.lb, constraint.ub, constraint.enforce);
    }
    for (const constraint of extraConstraints || []) {
      addLinear(constraint.terms, constraint.lb, constraint.ub, constraint.enforce ?? null);
    }
    for (const [variableIndex, value] of fixedValues || []) {
      bound.add(variables[variableIndex].equals(Math.round(value)));
      applied += 1;
    }

    if (objectiveTerms && objectiveTerms.length) {
      const expression = sumOf(objectiveTerms.map(([variableIndex, coefficient]) => [variables[variableIndex], coefficient]));
      if (expression) {
        if (maximize) bound.maximize(expression);
        else bound.minimize(expression);
      }
    }

    // Hinweise: Der von OR-Tools empfohlene Weg durch eine lexikografische
    // Kaskade ist, die Lösung der vorigen Stufe vollständig als Hinweis zu
    // übergeben. Liegt keine vor, bleibt der Warmstart aus der Heuristik.
    if (Array.isArray(hintValues) && hintValues.length) {
      for (let index = 0; index < Math.min(hintValues.length, variables.length); index += 1) {
        const value = hintValues[index];
        if (Number.isFinite(Number(value))) bound.addHint(variables[index], Math.round(Number(value)));
      }
    } else {
      for (const [variableIndex, value] of model.hintPairs || []) {
        bound.addHint(variables[variableIndex], value);
      }
    }

    const params = {
      maxTimeInSeconds: Math.max(0.05, Number(timeLimitMs || 8000) / 1000),
      numWorkers: Number.isInteger(workers) && workers >= 1 ? workers : 1
    };
    if (typeof onIncumbent === 'function') {
      params.onSolution = solution => {
        try {
          onIncumbent({
            objectiveValue: Number(solution.objectiveValue ?? 0),
            bestBound: Number.isFinite(Number(solution.bestObjectiveBound)) ? Number(solution.bestObjectiveBound) : null,
            live: Boolean(solution.live),
            values: allVars.map((_variable, index) => Number(solution.value(variables[index]) ?? 0))
          });
        } catch {
          // Ein Fehler in der Darstellung darf die Suche niemals abbrechen.
        }
      };
    }

    const solver = api.solverInstance;
    const result = solver.solve(bound, params);
    const statusName = api.statusName(result.status);
    const solved = statusName === 'OPTIMAL' || statusName === 'FEASIBLE';
    const values = solved ? allVars.map((_variable, index) => Number(result.value(variables[index]) ?? 0)) : [];
    return {
      statusName,
      optimal: statusName === 'OPTIMAL',
      objectiveValue: solved ? Number(result.objectiveValue ?? 0) : null,
      bestBound: Number.isFinite(Number(result.bestObjectiveBound)) ? Number(result.bestObjectiveBound) : null,
      values,
      appliedConstraints: applied,
      wallTimeMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      statusName: 'ERROR',
      reason: error?.message || String(error),
      objectiveValue: null,
      bestBound: null,
      values: [],
      wallTimeMs: Date.now() - startedAt
    };
  }
}

export const SOLVER_BRIDGE_VERSION = VERSION_MARKER;
