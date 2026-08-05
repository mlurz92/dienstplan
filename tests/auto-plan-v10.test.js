/**
 * Auto-Plan v10 — Modell-, Kaskaden- und Kennzahlentests.
 *
 * Die Modelltests laufen solverfrei; wo eine Bindung verfügbar ist (lokales
 * WebAssembly-Bündel), wird zusätzlich exakt gelöst. Damit bleibt die Suite in
 * jeder Umgebung aussagekräftig und ist dort, wo es zählt, echt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.TZ = 'Europe/Berlin';

// Dieselben Modulbezeichner wie in der Engine – inklusive Abfragezeichen.
// Ein abweichender Bezeichner erzeugt eine zweite Modulinstanz mit eigenem
// Solver-Zustand; der exakte Pfad liefe dann im Test niemals, und genau das
// hat einen Absturz in der Leximin-Bindung bis in den Browser durchgelassen.
const model = await import('../js/auto-plan-model.js?v=20260806.1');
const solverBridge = await import('../js/auto-plan-solver.js?v=20260806.1');
const planner = await import('../js/auto-planner.js');
const { DEFAULT_STAFF } = await import('../js/defaults.js');
const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

const BUNDLE_URL = new URL('../vendor/cpsat-js/dist/cpsat-portable.bundle.js', import.meta.url).href;

function emptyDay() {
  return { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
}

function monthOf(year, monthNumber) {
  const days = new Date(year, monthNumber, 0).getDate();
  const dates = Array.from({ length: days }, (_, index) =>
    `${year}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
  return {
    schemaVersion: 1,
    year,
    month: monthNumber,
    revision: 0,
    updatedAt: null,
    days: Object.fromEntries(dates.map(iso => [iso, emptyDay()])),
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function stateWith(monthData, extraMonths = []) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData], ...extraMonths]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: monthData.year,
    currentMonth: monthData.month,
    monthSources: new Map([[key, 'server']])
  };
}

async function solverOrNull() {
  solverBridge.resetSolverForTests();
  return solverBridge.loadSolver({ sources: [{ id: 'cpsat-js', origin: 'local', url: BUNDLE_URL }] });
}

/* ------------------------------------------------------------------ *
 * Modellstruktur
 * ------------------------------------------------------------------ */

test('das Modell erzeugt genau eine Binärvariable je Feld und zulässiger Person', () => {
  const monthData = monthOf(2026, 9);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  assert.equal(built.slots.length, built.assign.length);
  assert.ok(built.counts.assignments > built.counts.slots, 'jedes Feld muss mehrere Kandidaten haben');
  for (const variable of built.vars) {
    if (!variable.meta?.slotKey) continue;
    assert.equal(variable.lb, 0);
    assert.equal(variable.ub, 1);
  }
});

test('jede Belegungsbedingung fordert genau eine Person – nicht mindestens eine', () => {
  const monthData = monthOf(2026, 9);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  const cover = built.constraints.filter(constraint => constraint.id.startsWith('cover_'));
  assert.ok(cover.length > 0);
  for (const constraint of cover) {
    assert.equal(constraint.lb, 1);
    assert.equal(constraint.ub, 1);
  }
});

test('Obergrenzen zählen Personen und nicht Personencodes', () => {
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData);
  const staffLimits = Object.fromEntries(state.staff.map(person => [person.id, { maxBd: 5, maxHg: 9, maxTotal: 12 }]));
  const built = model.buildPlanModel({ state, monthData, config: { staffLimits } });
  const limits = built.constraints.filter(constraint => constraint.id.startsWith('limit_bd_'));
  assert.ok(limits.length >= 2);
  const signatures = new Set(limits.map(constraint => JSON.stringify(constraint.terms.map(term => term[0]))));
  assert.equal(signatures.size, limits.length, 'jede Person braucht ihre eigene Termmenge');
  for (const constraint of limits) {
    for (const [variableIndex] of constraint.terms) {
      assert.equal(built.vars[variableIndex].meta.role, 'bd');
    }
  }
});

test('Wochenend-, Samstags- und HG-Ziel messen die Spitzenlast einer Person, keine Konstante', () => {
  const monthData = monthOf(2026, 9);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  for (const key of ['weekend', 'saturday', 'hgBurden']) {
    const terms = built.components[key].terms;
    assert.equal(terms.length, 1, `${key}: genau eine Höchstlastvariable`);
    const [variableIndex] = terms[0];
    assert.equal(built.vars[variableIndex].name, `peak_${key}`);

    // Die entscheidende Eigenschaft: Der Zielausdruck darf nicht die Summe
    // aller Zuordnungsvariablen einer Kategorie sein. Die ist wegen
    // Σ_p y[f][p] = 1 konstant, und die Stufe wäre wirkungslos.
    const bounding = built.constraints.filter(constraint => constraint.id.startsWith(`peak_${key}_`));
    assert.ok(bounding.length >= 2, `${key}: je Person eine Schranke`);
    for (const constraint of bounding) {
      assert.equal(constraint.terms[0][0], variableIndex);
      assert.equal(constraint.terms[0][1], 1);
      for (const [, coefficient] of constraint.terms.slice(1)) assert.equal(coefficient, -1);
    }
    // Jede Schranke gehört zu genau einer Person.
    const owners = bounding.map(constraint => new Set(constraint.terms.slice(1)
      .map(([index]) => built.vars[index].meta.staffId)));
    for (const owner of owners) assert.equal(owner.size, 1);
    assert.equal(new Set(owners.map(owner => [...owner][0])).size, owners.length);
  }
});

test('ein Feld ohne jeden Kandidaten wird gemeldet statt das Modell unerfüllbar zu machen', () => {
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData);
  // Alle Personen abwesend: Für jedes Feld ist niemand wählbar.
  const isoDays = Object.keys(monthData.days);
  for (const person of state.staff) {
    monthData.absences[person.id] = Object.fromEntries(isoDays.map(iso => [iso, 'U']));
  }
  const built = model.buildPlanModel({ state, monthData });
  assert.ok(built.uncoverableSlots.length > 0, 'unbesetzbare Felder werden ausgewiesen');
  assert.ok(built.constraints.every(constraint => !constraint.id.startsWith('cover_empty_')),
    'kein Constraint nagelt das globale Deckungsliteral auf 0 fest');
  for (const constraint of built.constraints) {
    if (constraint.terms.length !== 1) continue;
    const [[variableIndex]] = constraint.terms;
    assert.ok(!(variableIndex === built.relaxLiterals.coverage && constraint.ub === 0),
      'das Deckungsliteral bleibt frei');
  }
});

test('kein Constraint verwendet eine Big-M-Konstante', () => {
  const monthData = monthOf(2026, 9);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  for (const constraint of built.constraints) {
    assert.ok(Math.abs(constraint.lb) <= 400, `${constraint.id}: lb ${constraint.lb}`);
    assert.ok(Math.abs(constraint.ub) <= 400, `${constraint.id}: ub ${constraint.ub}`);
  }
});

test('jede relaxierbare Gruppe besitzt genau ein Literal', () => {
  const monthData = monthOf(2026, 9);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  const groups = Object.keys(model.RELAX_GROUPS);
  assert.deepEqual(Object.keys(built.relaxLiterals).sort(), [...groups].sort());
  const enforced = new Set(built.constraints.filter(constraint => constraint.enforce !== null).map(constraint => constraint.group));
  for (const group of enforced) assert.ok(groups.includes(group), `${group} ist nicht relaxierbar deklariert`);
});

test('das Fairness-Gedächtnis belastet die Vielarbeiter und nicht die Wenigarbeiter', () => {
  const past = monthOf(2026, 8);
  const isoDays = Object.keys(past.days).sort();
  // Eine Person trägt im Vormonat auffällig viel.
  for (let index = 0; index < 8; index += 2) past.days[isoDays[index]].bd = 'lurz';
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData, [['2026-08', past]]);
  const offsets = model.carryOverOffsets(state, monthData, { window: 3, hgFactor: 0.6, weight: 1 });
  assert.ok(offsets.get('lurz') > 0, 'wer viel getragen hat, startet mit erhöhter Last');
  const others = [...offsets.entries()].filter(([staffId]) => staffId !== 'lurz');
  for (const [, value] of others) assert.ok(value <= 0, 'alle übrigen starten nicht über dem Mittel');
});

/* ------------------------------------------------------------------ *
 * Kennzahlen
 * ------------------------------------------------------------------ */

test('Jain-Index ist eins bei Gleichverteilung und sinkt bei Konzentration', () => {
  assert.equal(planner.jainIndex([4, 4, 4, 4]), 1);
  assert.ok(planner.jainIndex([10, 1, 1, 1]) < 0.5);
  assert.equal(planner.jainIndex([]), 1);
  // Bekannter Wert: n=2, Werte 1 und 3 → 16 / (2·10) = 0.8
  assert.equal(Number(planner.jainIndex([1, 3]).toFixed(4)), 0.8);
});

test('Gini-Koeffizient ist null bei Gleichverteilung und positiv sonst', () => {
  assert.equal(planner.giniIndex([3, 3, 3]), 0);
  assert.ok(planner.giniIndex([0, 0, 9]) > 0.6);
  // Bekannter Wert: Werte 1 und 3 → mittlere absolute Differenz 1, Mittel 2 → 0.25
  assert.equal(Number(planner.giniIndex([1, 3]).toFixed(4)), 0.25);
});

/* ------------------------------------------------------------------ *
 * Verträge der Engine
 * ------------------------------------------------------------------ */

test('v10 meldet Revision, Kennung und die vollständige Stufenliste', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 10);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v10-exact-boolean-rostering-core');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id),
    ['analysis', 'warmstart', 'model', 'exact', 'repair', 'perfect', 'audit', 'certify']);
});

test('die v10-Konfiguration leitet Anteile aus den Prozentwerten der Oberfläche ab', () => {
  const monthData = monthOf(2026, 9);
  const config = planner.normalizeV10Config(stateWith(monthData), monthData, {
    hgLoadPercent: 40, carryOverPercent: 25, carryOverWindow: 2, leximinDepth: 5
  });
  assert.equal(config.hgLoadFactor, 0.4);
  assert.equal(config.carryOverWeight, 0.25);
  assert.equal(config.carryOverWindow, 2);
  assert.equal(config.leximinDepth, 5);
  assert.ok(config.stageOrder.includes('fairness'));
});

test('eine gespeicherte Teilreihenfolge verliert keine Stufe', () => {
  const monthData = monthOf(2026, 9);
  const config = planner.normalizeV10Config(stateWith(monthData), monthData, { stageOrder: ['wishes', 'unsinn'] });
  assert.equal(config.stageOrder[0], 'wishes');
  assert.ok(config.stageOrder.includes('fairness'));
  assert.ok(!config.stageOrder.includes('unsinn'));
  assert.equal(new Set(config.stageOrder).size, config.stageOrder.length);
});

test('die Solver-Brücke verwendet niemals notEquals', async () => {
  const bridge = await source('../js/auto-plan-solver.js');
  const engine = await source('../js/auto-planner-v10.js');
  const planModel = await source('../js/auto-plan-model.js');
  for (const [name, text] of [['solver', bridge], ['engine', engine], ['model', planModel]]) {
    // Nur echte Aufrufe zählen; die Warnung im Kopfkommentar darf den Namen nennen.
    const calls = text.split('\n').filter(line => /\.notEquals\(/.test(line) && !/^\s*(\*|\/\/)/.test(line));
    assert.deepEqual(calls, [], `${name} darf notEquals nicht aufrufen`);
  }
});

test('das ausgelieferte Bündel ist selbsttragend und die WASM-Datei liegt daneben', async () => {
  const bundle = await source('../vendor/cpsat-js/dist/cpsat-portable.bundle.js');
  // Genau daran ist die Vorgängerfassung im Browser gescheitert: ein bloßer
  // Bezeichner lässt sich ohne Import-Map nicht auflösen, und in einem
  // Modul-Worker gilt die Import-Map des Dokuments ohnehin nicht.
  const bareImports = [...bundle.matchAll(/\bfrom\s*["']([^"'.\/][^"']*)["']/g)]
    .map(match => match[1])
    .filter(specifier => !specifier.startsWith('node:'));
  assert.deepEqual(bareImports, [], `nicht auflösbare Bezeichner im Bündel: ${bareImports.join(', ')}`);
  await assert.doesNotReject(readFile(new URL('../vendor/cpsat-js/build/portable/cpsat.wasm', import.meta.url)),
    'die relative WASM-Datei muss neben dem Bündel liegen');
  const bridge = await source('../js/auto-plan-solver.js');
  assert.match(bridge, /cpsat-portable\.bundle\.js\?v=\$\{VERSION_MARKER\}/,
    'die lokale Quelle trägt die Versionsmarke, sonst liefert der Zwischenspeicher ein altes Bündel aus');
});

test('die defekte v9-Brücke ist entfernt', async () => {
  await assert.rejects(() => source('../js/auto-plan-cp-sat.js'));
  await assert.rejects(() => source('../js/auto-planner-v9.js'));
});

/* ------------------------------------------------------------------ *
 * Exakte Läufe gegen das echte WebAssembly-Bündel
 * ------------------------------------------------------------------ */

test('das gebündelte WebAssembly lädt und löst ein Miniaturmodell exakt', async () => {
  const api = await solverOrNull();
  assert.ok(api, `Bündel nicht ladbar: ${JSON.stringify(solverBridge.solverDiagnostics())}`);
  const monthData = monthOf(2026, 9);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  const result = solverBridge.solveModel(built, api, {
    timeLimitMs: 20000,
    fixedValues: Object.values(built.relaxLiterals).map(index => [index, 1])
  });
  assert.equal(result.statusName, 'OPTIMAL');
  const assignments = model.solutionToAssignments(built, result.values);
  assert.equal(assignments.length, built.slots.length, 'jedes offene Feld ist besetzt');
  assert.equal(model.violatedConstraints(built, result.values).length, 0);
});

test('die exakte Lösung verletzt keine der harten fachlichen Regeln', async () => {
  const api = await solverOrNull();
  assert.ok(api);
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData);
  const staffLimits = Object.fromEntries(state.staff.map(person => [person.id, { maxBd: 6, maxHg: 10, maxTotal: 14 }]));
  const built = model.buildPlanModel({ state, monthData, config: { staffLimits } });
  const result = solverBridge.solveModel(built, api, {
    timeLimitMs: 20000,
    fixedValues: Object.values(built.relaxLiterals).map(index => [index, 1])
  });
  assert.equal(result.statusName, 'OPTIMAL');
  const plan = structuredClone(monthData);
  for (const { dateIso, role, staffId } of model.solutionToAssignments(built, result.values)) {
    plan.days[dateIso][role] = staffId;
  }
  const isoDays = Object.keys(plan.days).sort();
  for (let index = 0; index < isoDays.length; index += 1) {
    const day = plan.days[isoDays[index]];
    assert.notEqual(day.bd, day.hg, `${isoDays[index]}: BD und HG identisch besetzt`);
    if (index + 1 < isoDays.length) {
      assert.notEqual(day.bd, plan.days[isoDays[index + 1]].bd, `${isoDays[index]}: BD an Folgetagen`);
      const weekday = new Date(`${isoDays[index]}T12:00:00`).getDay();
      if (weekday >= 1 && weekday <= 4) {
        assert.notEqual(day.hg, plan.days[isoDays[index + 1]].bd, `${isoDays[index]}: HG vor eigenem BD`);
      }
    }
  }
  const counts = new Map();
  for (const iso of isoDays) {
    for (const role of ['bd', 'hg']) {
      const staffId = plan.days[iso][role];
      const entry = counts.get(staffId) || { bd: 0, hg: 0 };
      entry[role] += 1;
      counts.set(staffId, entry);
    }
  }
  for (const [staffId, entry] of counts) {
    assert.ok(entry.bd <= 6, `${staffId}: ${entry.bd} BD über der Obergrenze`);
    assert.ok(entry.hg <= 10, `${staffId}: ${entry.hg} HG über der Obergrenze`);
    assert.ok(entry.bd + entry.hg <= 14, `${staffId}: Gesamtobergrenze verletzt`);
  }
});

test('Leximin senkt die Höchstlast beweisbar und meldet die untere Schranke', async () => {
  const api = await solverOrNull();
  assert.ok(api);
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData);
  const built = model.buildPlanModel({ state, monthData, config: { hgLoadFactor: 0.6 } });
  const base = built.vars.length;
  const maxLoad = [...built.loadTerms.values()]
    .reduce((total, entry) => Math.max(total, entry.terms.length * built.loadScale + entry.constant), 0);
  const extraVars = [{ index: base, name: 'leximin_max', lb: 0, ub: Math.round(maxLoad) }];
  const bind = [];
  for (const [staffId, entry] of built.loadTerms) {
    if (!entry.terms.length) continue;
    bind.push({ id: `bind_${staffId}`, group: 'leximin', terms: [...entry.terms, [base, -1]], lb: -Math.round(maxLoad), ub: -entry.constant, enforce: null });
  }
  const result = solverBridge.solveModel(built, api, {
    timeLimitMs: 20000,
    extraVars,
    extraConstraints: bind,
    objectiveTerms: [[base, 1]],
    fixedValues: Object.values(built.relaxLiterals).map(index => [index, 1])
  });
  assert.equal(result.statusName, 'OPTIMAL');
  assert.equal(result.objectiveValue, result.bestBound, 'OPTIMAL bedeutet Zielwert gleich unterer Schranke');
  const loads = new Map();
  for (const { staffId, role } of model.solutionToAssignments(built, result.values)) {
    loads.set(staffId, (loads.get(staffId) || 0) + (role === 'bd' ? 1 : 0.6));
  }
  const highest = Math.max(...loads.values());
  assert.ok(highest * built.loadScale <= result.objectiveValue + 1e-6, 'die Höchstlast liegt unter der bewiesenen Schranke');
});

test('die Korrekturmengen-Diagnose benennt die aufzugebende Gruppe in einem Lauf', async () => {
  const api = await solverOrNull();
  assert.ok(api);
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData);
  // Unerfüllbar konstruiert: Niemand darf mehr als einen BD übernehmen.
  const staffLimits = Object.fromEntries(state.staff.map(person => [person.id, { maxBd: 1, maxHg: null, maxTotal: null }]));
  const built = model.buildPlanModel({ state, monthData, config: { staffLimits } });
  const strict = solverBridge.solveModel(built, api, {
    timeLimitMs: 8000,
    fixedValues: Object.values(built.relaxLiterals).map(index => [index, 1])
  });
  assert.equal(strict.statusName, 'INFEASIBLE');
  const diagnosis = await planner.diagnoseConflicts(built, api, { timeLimitMs: 8000 });
  assert.equal(diagnosis.solvable, true);
  assert.ok(diagnosis.dropped.length >= 1, 'mindestens eine Gruppe muss aufgegeben werden');
  assert.ok(diagnosis.dropped.some(entry => entry.id === 'limits'), 'die Obergrenzen sind die Ursache');
  assert.ok(diagnosis.kept.some(entry => entry.id === 'coverage'), 'die Besetzung bleibt erhalten');
});

test('der vollständige Lauf liefert einen auditierten, vollständigen Monat', async () => {
  await solverOrNull();
  const monthData = monthOf(2026, 9);
  const state = stateWith(monthData);
  const result = await planner.buildAutoPlan({
    state,
    monthData,
    year: monthData.year,
    month: monthData.month,
    runConfig: { cpSatTimeBudgetSeconds: 6, leximinDepth: 2, searchIntensity: 'standard', repairIterations: 0, perfectionEnabled: false }
  });
  assert.equal(result.algorithmRevision, 10);
  // Der exakte Pfad muss im Lauf tatsächlich erreichbar gewesen sein.
  assert.notEqual(result.metrics.exact?.status, 'UNAVAILABLE',
    `exakter Pfad nicht erreichbar: ${JSON.stringify(solverBridge.solverDiagnostics())}`);
  assert.equal(result.metrics.engine, 'v10-exact-boolean-rostering-core');
  assert.equal(result.openSlots, result.changes.length, 'jedes offene Feld ist vorgeschlagen');
  assert.equal(result.metrics.gray, 0);
  assert.ok(Number.isFinite(result.metrics.jainIndex));
  assert.ok(result.metrics.jainIndex > 0 && result.metrics.jainIndex <= 1);
  assert.ok(Number.isFinite(result.metrics.giniIndex));
});
