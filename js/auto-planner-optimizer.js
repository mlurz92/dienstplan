/**
 * Perfektionsphase des Auto-Plans – adaptive Ruin-and-Recreate-Suche.
 *
 * Diese Stufe übernimmt eine bereits vollständige, regelgeprüfte Belegung und
 * verbessert sie so lange, bis sie gegenüber allen betrachteten Zügen nachweisbar
 * nicht mehr verbesserbar ist. Sie folgt dem in der Personaleinsatzplanung
 * etablierten Aufbau (Large Neighborhood Search mit adaptiver Operatorwahl,
 * Late-Acceptance-Annahme und abschließender Nachbarschaftsabsuche):
 *
 * 1. **Zerstören und neu aufbauen.** Ein Operator entfernt einen Ausschnitt der
 *    selbst gesetzten Dienste – zufällige Felder, ein Tagesfenster, ein
 *    Wochenende, alle Dienste einer Person, die schlechtesten Zellen. Der
 *    Ausschnitt wird anschließend mit Vorwärts-Checking neu belegt. Die
 *    Operatoren tragen Gewichte, die sich am tatsächlichen Erfolg ausrichten.
 * 2. **Late-Acceptance-Annahme.** Ein Zustand wird angenommen, wenn er besser
 *    ist als der aktuelle oder als der Zustand einer festen Zahl von Runden
 *    zuvor. Das erlaubt kontrolliertes Bergabgehen und verlässt lokale Optima,
 *    ohne einen Temperaturplan abstimmen zu müssen.
 * 3. **Absteigende Nachbarschaften.** Zwischen den Runden laufen vollständige
 *    Nachbarschaften: Einzelumsetzung, Paartausch, Dreierkette, Tagespaket,
 *    Wochenendpaket und Rollentausch am selben Tag.
 * 4. **Zertifizierung.** Zum Schluss werden sämtliche Einzelumsetzungen und
 *    sämtliche Paartausche vollständig und ohne Abkürzung geprüft. Findet sich
 *    keine Verbesserung mehr, ist das Ergebnis bezüglich dieser Nachbarschaften
 *    beweisbar optimal und wird als zertifiziert ausgewiesen.
 *
 * Zwei Eigenschaften gelten dabei ausnahmslos:
 *
 * - **Fixpunkte bleiben unberührt.** Verändert werden ausschließlich Felder, die
 *   im Ausgangsmonat leer waren. Jede erzeugte Variante wird zusätzlich gegen
 *   den Ausgangsmonat geprüft.
 * - **Kein Zustand verletzt harte Regeln.** Angenommen wird nur, was
 *   vollständig belegt, technisch wählbar und innerhalb aller Laufgrenzen ist.
 *
 * ZUR REPRODUZIERBARKEIT
 *
 * Der Zufallsgenerator wird aus Ausgangsmonat und Laufparametern abgeleitet, nie
 * aus der Uhr. Der Suchpfad ist damit vollständig festgelegt.
 *
 * Die erreichte Suchtiefe hängt dagegen am Zeitrahmen und an der Rechenleistung:
 * Wie viele Runden in eine Minute passen, entscheidet die Maschine. Im
 * Konvergenzmodus – ohne ausdrücklichen Zeitrahmen – endet der Lauf an einem
 * eigenen Abbruchkriterium statt an der Uhr und ist dadurch streng
 * deterministisch. Im Zeitrahmenmodus ist er es praktisch, aber nicht
 * beweisbar; die abschließende Zertifizierung stabilisiert den Endpunkt
 * zusätzlich, weil sie unabhängig vom Weg dorthin auf ein lokal optimales
 * Ergebnis führt.
 */

import {
  candidateEvaluationVector,
  compareObjectiveKeys,
  evaluatePlanObjective,
  isObjectiveAdmissible,
  listOpenSlots,
  listProposedAssignments,
  planRespectsLimits,
  planningContextFor,
  syncPeerCache as syncPlanPeerCache
} from './auto-planner-engine.js?v=20260803.6';
import { createPacer, createTicker, now } from './cooperative-scheduling.js?v=20260803.6';
import {
  basicallyEligiblePeers,
  countRoleInMonth,
  evaluateCandidate,
  getPlanningStaff,
  parseIso,
  setAssignment,
  setPeerGroupCacheToken,
  toLocalIso
} from './rules.js?v=20260803.6';

const ROLE_ORDER = Object.freeze(['bd', 'hg']);
const LEVEL_RANK = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

/**
 * Deterministischer Zufallsgenerator (xorshift32).
 *
 * Ein Auto-Plan muss reproduzierbar sein: Derselbe Monat mit denselben
 * Parametern muss denselben Vorschlag ergeben, sonst lässt sich ein Ergebnis
 * weder nachvollziehen noch überprüfen. Der Startwert wird deshalb aus den
 * Eingaben abgeleitet und nicht aus der Uhr.
 */
function createRandom(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function pick(random, items) {
  return items.length ? items[Math.min(items.length - 1, Math.floor(random() * items.length))] : null;
}

function shuffled(random, items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function abortIfRequested(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Auto-Plan wurde abgebrochen.');
  error.name = 'AbortError';
  throw error;
}

function keyFor(dateIso, role) {
  return `${dateIso}|${role}`;
}

function monthKey(monthData) {
  return `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
}

/**
 * Die Zerstörungsoperatoren der Suche.
 *
 * Jeder Operator wählt einen zusammenhängenden fachlichen Ausschnitt: nach
 * Zufall, nach Bewertungsqualität, nach Kalenderlage, nach Person oder nach
 * Verwandtschaft. Die Vielfalt ist entscheidend – ein einzelner Operator führt
 * die Suche zuverlässig in dieselben lokalen Optima zurück.
 */
const DESTROY_OPERATORS = Object.freeze([
  'zufallsfelder',
  'schwaechste-zellen',
  'tagesfenster',
  'wochenende',
  'personenlast',
  'verwandte-felder',
  'rollenblock',
  'sollabweichung'
]);

const NEIGHBOURHOODS = Object.freeze([
  'einzelumsetzung',
  'paartausch',
  'rollentausch',
  'dreierkette',
  'tagespaket',
  'wochenendpaket'
]);

export class PlanOptimizer {
  constructor({ state, baseline, config, allowRed, seed }) {
    // Zuerst den Bewertungsspeicher stilllegen: Der Planungskontext unten wird
    // bereits bewertet, und eine Marke aus einem früheren Lauf würde dabei
    // fremde Vergleichsgruppen liefern.
    setPeerGroupCacheToken(null);
    this.state = state;
    this.baseline = baseline;
    this.config = config;
    this.allowRed = allowRed;
    this.random = createRandom(seed);
    this.context = planningContextFor(state, baseline);
    this.slots = listOpenSlots(baseline);
    this.slotSet = new Set(this.slots.map(slot => keyFor(slot.dateIso, slot.role)));
    this.dates = Object.keys(baseline.days || {}).sort();
    this.working = clone(baseline);
    this.sandbox = this.createSandbox(this.working);
    this.evaluations = 0;
    this.candidateChecks = 0;
    this.weekendGroups = this.buildWeekendGroups();
  }

  createSandbox(monthData) {
    const months = new Map(this.state?.months || []);
    months.set(monthKey(monthData), monthData);
    return { ...this.state, months, currentYear: monthData.year, currentMonth: monthData.month };
  }

  buildWeekendGroups() {
    const groups = new Map();
    for (const dateIso of this.dates) {
      const date = parseIso(dateIso);
      const weekday = date.getDay();
      if (weekday !== 5 && weekday !== 6 && weekday !== 0) continue;
      const friday = new Date(date);
      friday.setDate(date.getDate() - ((weekday + 2) % 7));
      const groupKey = toLocalIso(friday);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(dateIso);
    }
    return [...groups.values()];
  }

  /** Die aktuell im Arbeitsmonat gesetzten, selbst geplanten Felder. */
  plannedSlots() {
    return this.slots.filter(slot => this.working.days?.[slot.dateIso]?.[slot.role]);
  }

  /** Übernimmt eine Belegung in den Arbeitsmonat; Fixpunkte bleiben gesperrt. */
  load(monthData) {
    for (const slot of this.slots) {
      this.working.days[slot.dateIso][slot.role] = monthData.days?.[slot.dateIso]?.[slot.role] || '';
    }
  }

  snapshot() {
    return clone(this.working);
  }

  /**
   * Vollständige, exakte Bewertung des Arbeitsmonats.
   *
   * Es gibt bewusst keine Näherung und keinen Kurzschluss: Jede Bewertung, die
   * über Annahme oder Ablehnung entscheidet, durchläuft dieselbe Regelprüfung
   * wie die spätere Übernahme.
   */
  objective() {
    this.syncPeerCache();
    this.evaluations += 1;
    return evaluatePlanObjective(this.state, this.working, this.baseline, this.config);
  }

  admissible(objective) {
    return isObjectiveAdmissible(objective, this.allowRed) && !objective.unfilled;
  }

  /** Bewertung einer einzelnen Zelle im aktuellen Arbeitsmonat. */
  evaluateCell(dateIso, role, staffId) {
    this.syncPeerCache();
    this.candidateChecks += 1;
    return evaluateCandidate({ state: this.sandbox, monthData: this.working, dateIso, role, staffId });
  }

  /**
   * Wählbare Personen für ein Feld, nach Eignung sortiert.
   *
   * Grau bewertete und nicht wählbare Personen entfallen immer, rot bewertete
   * nur dann, wenn der Lauf keine bestätigungspflichtigen Ausnahmen zulässt.
   * Zusätzlich gelten die vor dem Lauf festgelegten Obergrenzen.
   */
  candidates(dateIso, role) {
    this.syncPeerCache();
    const result = [];
    for (const person of getPlanningStaff(this.state.staff, dateIso)) {
      const evaluation = this.evaluateCell(dateIso, role, person.id);
      if (evaluation.canSelect === false || evaluation.level === 'gray') continue;
      if (!this.allowRed && evaluation.level === 'red') continue;
      if (!planRespectsLimits(this.working, person.id, role, this.config)) continue;
      result.push({ person, evaluation, vector: candidateEvaluationVector(evaluation) });
    }
    result.sort((left, right) => (LEVEL_RANK[left.evaluation.level] ?? 9) - (LEVEL_RANK[right.evaluation.level] ?? 9)
      || compareObjectiveKeys(left.vector.map(value => -value), right.vector.map(value => -value)));
    return result;
  }

  /**
   * Meldet den aktuellen Belegungszustand an den Bewertungsspeicher.
   *
   * Verwendet wird dieselbe Marke wie in Konstruktion und Tauschreparatur: Zwei
   * unterschiedliche Markenformate würden sich gegenseitig verwerfen und den
   * Speicher wirkungslos machen. Sie wird an jeder bewertenden Stelle neu
   * gebildet – das kostet einen Bruchteil dessen, was der Speicher einspart,
   * und ist im Gegensatz zu einem mitgeführten Änderungszähler nicht dadurch zu
   * unterlaufen, dass irgendwo eine Änderung nicht gemeldet wird.
   */
  syncPeerCache() {
    syncPlanPeerCache(this.working);
  }

  /**
   * Grobe Größe der Kandidatenmenge eines Feldes ohne Regelbewertung.
   *
   * Dient ausschließlich der Reihenfolge beim Wiederaufbau nach dem Prinzip des
   * kleinsten Spielraums. Der Filter berücksichtigt Qualifikation, Abwesenheit,
   * Sperrwünsche, Doppelbelegung und Monatsmaxima – also alles, was ohne die
   * teure Regelauswertung sicher entscheidbar ist.
   */
  roughDomain(dateIso, role) {
    return basicallyEligiblePeers(this.sandbox, this.working, dateIso, role)
      .filter(person => planRespectsLimits(this.working, person.id, role, this.config)).length;
  }

  /**
   * Setzt eine Menge von Änderungen, ruft `fn` und stellt den Zustand wieder her.
   *
   * Die Suche prüft ein Vielfaches dessen, was sie am Ende übernimmt. Statt für
   * jede Probe einen vollständigen Monat zu kopieren, wird der Arbeitsmonat
   * verändert und anschließend exakt zurückgesetzt – auch bei Ausnahmen.
   */
  probe(changes, fn) {
    const previous = changes.map(change => this.working.days[change.dateIso][change.role]);
    for (const change of changes) {
      this.working.days[change.dateIso][change.role] = change.staffId;
    }
    try {
      return fn();
    } finally {
      changes.forEach((change, index) => {
        this.working.days[change.dateIso][change.role] = previous[index];
      });
    }
  }

  /**
   * Schnelle Vorprüfung eines Zuges.
   *
   * Ein Zug, der an einer veränderten Zelle eine gesperrte oder unzulässige
   * Bewertung erzeugt, kann die Gesamtlösung nicht verbessern und wird ohne
   * vollständige Monatsbewertung verworfen. Das ist keine Näherung des
   * Ergebnisses, sondern nur eine Vorauswahl: Was die Vorprüfung übersteht,
   * wird anschließend vollständig bewertet.
   */
  /**
   * Einhaltung der Laufgrenzen im bereits gesetzten Zustand.
   *
   * Wichtig ist der Unterschied zur Kandidatenprüfung: Dort wird ein noch nicht
   * gesetzter Dienst hinzugerechnet, hier ist er bereits enthalten. Würde man
   * hier dieselbe Prüfung verwenden, zählte der Zug doppelt und jeder Zug, der
   * eine Obergrenze genau erreicht, gälte fälschlich als Verstoß.
   */
  withinLimits(staffId) {
    const limits = this.config.staffLimits?.[staffId];
    if (!limits) return true;
    const bd = countRoleInMonth(this.working, staffId, 'bd');
    const hg = countRoleInMonth(this.working, staffId, 'hg');
    return (limits.maxBd === null || bd <= limits.maxBd)
      && (limits.maxHg === null || hg <= limits.maxHg)
      && (limits.maxTotal === null || bd + hg <= limits.maxTotal);
  }

  changeIsViable(changes) {
    for (const change of changes) {
      if (!this.slotSet.has(keyFor(change.dateIso, change.role))) return false;
      if (!change.staffId) return false;
    }
    for (const staffId of new Set(changes.map(change => change.staffId))) {
      if (!this.withinLimits(staffId)) return false;
    }
    for (const change of changes) {
      const evaluation = this.evaluateCell(change.dateIso, change.role, change.staffId);
      if (evaluation.canSelect === false || evaluation.level === 'gray') return false;
      if (!this.allowRed && evaluation.level === 'red') return false;
    }
    return true;
  }

  /**
   * Prüft einen Zug vollständig und übernimmt ihn bei echter Verbesserung.
   * Rückgabe ist die neue Zielbewertung oder `null`.
   */
  tryMove(changes, current, { requireImprovement = true } = {}) {
    if (!changes.length) return null;
    const meaningful = changes.some(change => this.working.days[change.dateIso][change.role] !== change.staffId);
    if (!meaningful) return null;
    return this.probe(changes, () => {
      if (!this.changeIsViable(changes)) return null;
      const objective = this.objective();
      if (!this.admissible(objective)) return null;
      if (requireImprovement && compareObjectiveKeys(objective.key, current.key) >= 0) return null;
      return objective;
    });
  }

  /**
   * Der einzige Schreibpunkt in den Arbeitsmonat.
   *
   * Die Sperre auf offene Felder steht hier bewusst noch einmal, obwohl alle
   * Aufrufer ihre Züge bereits aus den offenen Feldern ableiten: Ein
   * überschriebener Fixpunkt wäre der schwerwiegendste denkbare Fehler dieser
   * Anwendung und soll an keiner einzigen Stelle möglich sein.
   */
  commit(changes) {
    for (const change of changes) {
      if (!this.slotSet.has(keyFor(change.dateIso, change.role))) {
        throw new Error(`Auto-Plan wollte den gesetzten Dienst ${change.role.toUpperCase()} am ${change.dateIso} überschreiben.`);
      }
      setAssignment(this.working, change.dateIso, change.role, change.staffId);
    }
  }
}

/**
 * Eine vollständige absteigende Suche über alle definierten Nachbarschaften.
 *
 * Die Reihenfolge ist bewusst gewählt: erst der billigste und wirksamste Zug
 * (Einzelumsetzung), dann Tausche wachsender Reichweite. Nach jeder Annahme
 * beginnt die Reihenfolge von vorn, damit ein später Zug einen früheren wieder
 * lohnend machen kann.
 */
export async function descend({ optimizer, current, until, stats, signal, onStep, moveCap = Infinity, pace = null }) {
  const gate = pace || createPacer();
  let objective = current;
  let improved = true;
  let guard = 0;
  while (improved && now() < until && guard < 400) {
    abortIfRequested(signal);
    improved = false;
    guard += 1;
    for (const neighbourhood of NEIGHBOURHOODS) {
      if (now() >= until) break;
      // Eine erfolglose Absuche kann viele Sekunden dauern. Ohne diese Meldung
      // bliebe die Oberfläche solange stumm, obwohl durchgehend gerechnet wird.
      await onStep?.({ kind: 'scan', neighbourhood });
      const result = await exploreNeighbourhood({ optimizer, neighbourhood, objective, stats, signal, onStep, until, moveCap, pace: gate });
      if (!result) continue;
      optimizer.commit(result.changes);
      objective = result.objective;
      stats.improvements += 1;
      stats.byNeighbourhood[neighbourhood] = (stats.byNeighbourhood[neighbourhood] || 0) + 1;
      improved = true;
      await onStep?.({ kind: 'improvement', neighbourhood, changes: result.changes, objective });
      break;
    }
  }
  return objective;
}

/**
 * Eine Nachbarschaft vollständig absuchen, bis die erste echte Verbesserung
 * gefunden ist.
 *
 * Die weiten Nachbarschaften – insbesondere die Dreierkette – wachsen kubisch
 * mit der Zahl der Dienstfelder. Ohne Deckel verbrauchte eine einzige
 * erfolglose Absuche das gesamte Zeitbudget und die Ruin-and-Recreate-Suche kam
 * nie zum Zug. Der Deckel begrenzt nur die Suche zwischendurch; der
 * abschließende Zertifizierungslauf prüft Einzelumsetzung und Paartausch
 * weiterhin ungedeckelt und vollständig.
 */

/**
 * Die selbst gesetzten Dienste, nach Auffälligkeit ihrer Bewertung sortiert:
 * erst rot, dann orange, dann gelb, innerhalb gleicher Stufe die mit der
 * geringsten Empfehlung.
 */
function orderedAssignments(optimizer, objective) {
  const rank = new Map((objective?.audit?.entries || []).map(entry => [
    keyFor(entry.dateIso, entry.role),
    (LEVEL_RANK[entry.evaluation.level] ?? 0) * 1000 - (entry.evaluation.meta?.recommendationScore || 0)
  ]));
  return optimizer.plannedSlots()
    .map(slot => ({
      dateIso: slot.dateIso,
      role: slot.role,
      staffId: optimizer.working.days[slot.dateIso][slot.role],
      weight: rank.get(keyFor(slot.dateIso, slot.role)) || 0
    }))
    .sort((left, right) => right.weight - left.weight
      || left.dateIso.localeCompare(right.dateIso)
      || left.role.localeCompare(right.role));
}

async function exploreNeighbourhood({ optimizer, neighbourhood, objective, stats, signal, onStep, until = Infinity, moveCap = Infinity, pace = null }) {
  const gate = pace || createPacer();
  /**
   * Die schlechtesten Zellen zuerst.
   *
   * Eine absteigende Suche bricht bei der ersten Verbesserung ab. Beginnt sie
   * bei den auffälligsten Zellen, findet sie diese Verbesserung im Mittel
   * deutlich früher und spart die vollständigen Bewertungen aller Züge davor.
   * Auf das Ergebnis wirkt sich die Reihenfolge nicht aus – gesucht wird
   * dieselbe Nachbarschaft.
   */
  const assignments = orderedAssignments(optimizer, objective);

  let inspected = 0;
  let exhausted = false;

  const consider = async changes => {
    abortIfRequested(signal);
    if (inspected >= moveCap || now() >= until) {
      exhausted = true;
      return null;
    }
    inspected += 1;
    stats.moves += 1;
    const result = optimizer.tryMove(changes, objective);
    if (result) return { changes, objective: result };
    // Zeitgesteuert an den Browser abgeben, damit Fortschritt und Animation
    // während der Absuche weiterlaufen.
    if (await gate()) await onStep?.({ kind: 'scan', neighbourhood, moves: stats.moves });
    return null;
  };

  if (neighbourhood === 'einzelumsetzung') {
    for (const assignment of assignments) {
      const alternatives = optimizer.probe(
        [{ dateIso: assignment.dateIso, role: assignment.role, staffId: '' }],
        () => optimizer.candidates(assignment.dateIso, assignment.role)
      );
      for (const candidate of alternatives) {
        if (candidate.person.id === assignment.staffId) continue;
        const found = await consider([{ dateIso: assignment.dateIso, role: assignment.role, staffId: candidate.person.id }]);
        if (found) return found;
      if (exhausted) return null;
        if (exhausted) return null;
      }
    }
    return null;
  }

  if (neighbourhood === 'paartausch') {
    for (let left = 0; left < assignments.length; left += 1) {
      for (let right = left + 1; right < assignments.length; right += 1) {
        const first = assignments[left];
        const second = assignments[right];
        if (first.role !== second.role || first.staffId === second.staffId) continue;
        const found = await consider([
          { dateIso: first.dateIso, role: first.role, staffId: second.staffId },
          { dateIso: second.dateIso, role: second.role, staffId: first.staffId }
        ]);
        if (found) return found;
      if (exhausted) return null;
        if (exhausted) return null;
      }
    }
    return null;
  }

  if (neighbourhood === 'rollentausch') {
    for (const dateIso of optimizer.dates) {
      const bd = assignments.find(item => item.dateIso === dateIso && item.role === 'bd');
      const hg = assignments.find(item => item.dateIso === dateIso && item.role === 'hg');
      if (!bd || !hg || bd.staffId === hg.staffId) continue;
      const found = await consider([
        { dateIso, role: 'bd', staffId: hg.staffId },
        { dateIso, role: 'hg', staffId: bd.staffId }
      ]);
      if (found) return found;
      if (exhausted) return null;
    }
    return null;
  }

  if (neighbourhood === 'dreierkette') {
    for (let a = 0; a < assignments.length; a += 1) {
      for (let b = a + 1; b < assignments.length; b += 1) {
        for (let c = b + 1; c < assignments.length; c += 1) {
          const first = assignments[a];
          const second = assignments[b];
          const third = assignments[c];
          if (first.role !== second.role || second.role !== third.role) continue;
          if (new Set([first.staffId, second.staffId, third.staffId]).size < 3) continue;
          const found = await consider([
            { dateIso: first.dateIso, role: first.role, staffId: third.staffId },
            { dateIso: second.dateIso, role: second.role, staffId: first.staffId },
            { dateIso: third.dateIso, role: third.role, staffId: second.staffId }
          ]);
          if (found) return found;
      if (exhausted) return null;
          if (exhausted) return null;
        if (exhausted) return null;
        }
      }
    }
    return null;
  }

  if (neighbourhood === 'tagespaket') {
    const openDays = optimizer.dates.filter(dateIso =>
      optimizer.slotSet.has(keyFor(dateIso, 'bd')) && optimizer.slotSet.has(keyFor(dateIso, 'hg')));
    for (let left = 0; left < openDays.length; left += 1) {
      for (let right = left + 1; right < openDays.length; right += 1) {
        const first = openDays[left];
        const second = openDays[right];
        const found = await consider([
          { dateIso: first, role: 'bd', staffId: optimizer.working.days[second].bd },
          { dateIso: first, role: 'hg', staffId: optimizer.working.days[second].hg },
          { dateIso: second, role: 'bd', staffId: optimizer.working.days[first].bd },
          { dateIso: second, role: 'hg', staffId: optimizer.working.days[first].hg }
        ]);
        if (found) return found;
      if (exhausted) return null;
        if (exhausted) return null;
      }
    }
    return null;
  }

  if (neighbourhood === 'wochenendpaket') {
    const groups = optimizer.weekendGroups.filter(group =>
      group.every(dateIso => ROLE_ORDER.every(role => optimizer.slotSet.has(keyFor(dateIso, role)))));
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const first = groups[left];
        const second = groups[right];
        if (first.length !== second.length) continue;
        const changes = [];
        for (let index = 0; index < first.length; index += 1) {
          for (const role of ROLE_ORDER) {
            changes.push({ dateIso: first[index], role, staffId: optimizer.working.days[second[index]][role] });
            changes.push({ dateIso: second[index], role, staffId: optimizer.working.days[first[index]][role] });
          }
        }
        const found = await consider(changes);
        if (found) return found;
      if (exhausted) return null;
        if (exhausted) return null;
      }
    }
    return null;
  }

  return null;
}

/**
 * Wählt den zu zerstörenden Ausschnitt.
 *
 * Der Umfang wächst mit der Suchtiefe und bleibt zwischen zwei Feldern und
 * einem Drittel aller selbst gesetzten Dienste – zu kleine Ausschnitte finden
 * nichts Neues, zu große verwerfen jede erreichte Qualität.
 */
/**
 * Umfang des zerstörten Ausschnitts.
 *
 * Ropke und Pisinger zeigen für die adaptive Large Neighborhood Search, dass
 * merklich große Ausschnitte bessere Ergebnisse liefern als kleine; als
 * Größenordnung gelten rund zehn bis vierzig Prozent der Entscheidungsvariablen.
 * Eine erste Fassung dieser Umsetzung lag mit drei bis dreizehn Prozent
 * deutlich darunter: Die Runden waren billig, veränderten aber zu wenig, um aus
 * einem lokalen Optimum herauszuführen. Bei anhaltender Stagnation wächst der
 * Anteil zusätzlich.
 */
const MIN_RUIN_FRACTION = .06;
const MAX_RUIN_FRACTION = .40;
const TARGET_ROUNDS = 260;

/**
 * Selbstregelnde Ausschnittsgröße.
 *
 * Die Literaturempfehlung gilt für Probleme, bei denen der Wiederaufbau billig
 * ist. Hier kostet jedes neu zu besetzende Feld eine vollständige
 * Kandidatenbewertung; ein Ausschnitt von vierzig Prozent verteuert damit die
 * Runde um ein Vielfaches. Bei knappem Zeitrahmen führte das dazu, dass die
 * Suche zwar sehr gründliche, aber viel zu wenige Runden schaffte und am Ende
 * schlechter abschnitt als mit kleinen Ausschnitten.
 *
 * Statt eines auf einen Zeitrahmen abgestimmten Festwerts schätzt die Suche
 * deshalb aus der gemessenen Rundendauer, wie viele Runden noch hineinpassen,
 * und wählt den Anteil so, dass eine sinnvolle Rundenzahl erhalten bleibt.
 * Anhaltende Stagnation vergrößert den Ausschnitt zusätzlich – dann ist ein
 * weiter Sprung mehr wert als viele kleine.
 */
function ruinCount(optimizer, plannedCount, stagnation, affordableRounds) {
  const room = Math.max(0, Math.min(1, affordableRounds / TARGET_ROUNDS));
  const ceiling = MIN_RUIN_FRACTION + (MAX_RUIN_FRACTION - MIN_RUIN_FRACTION) * room;
  const boost = Math.min(.15, stagnation / 1200);
  const fraction = MIN_RUIN_FRACTION + optimizer.random() * Math.max(0, ceiling - MIN_RUIN_FRACTION) + boost;
  return Math.max(2, Math.min(plannedCount - 1, Math.round(plannedCount * fraction)));
}

function destroy({ optimizer, operator, size, objective }) {
  const planned = optimizer.plannedSlots();
  if (planned.length <= 1) return [];
  const random = optimizer.random;
  const limit = Math.max(2, Math.min(size, planned.length - 1));
  const keyOf = slot => keyFor(slot.dateIso, slot.role);

  if (operator === 'zufallsfelder') {
    return shuffled(random, planned).slice(0, limit);
  }

  if (operator === 'schwaechste-zellen') {
    const rank = new Map((objective.audit.entries || []).map(entry => [
      keyFor(entry.dateIso, entry.role),
      (LEVEL_RANK[entry.evaluation.level] ?? 0) * 1000 - (entry.evaluation.meta?.recommendationScore || 0)
    ]));
    return [...planned]
      .sort((left, right) => (rank.get(keyOf(right)) || 0) - (rank.get(keyOf(left)) || 0))
      .slice(0, limit);
  }

  if (operator === 'tagesfenster') {
    const span = Math.max(2, Math.ceil(limit / 2));
    const start = Math.floor(random() * Math.max(1, optimizer.dates.length - span));
    const window = new Set(optimizer.dates.slice(start, start + span));
    return planned.filter(slot => window.has(slot.dateIso));
  }

  if (operator === 'wochenende') {
    const group = pick(random, optimizer.weekendGroups);
    if (!group) return shuffled(random, planned).slice(0, limit);
    const window = new Set(group);
    const neighbours = planned.filter(slot => window.has(slot.dateIso));
    return neighbours.length ? neighbours : shuffled(random, planned).slice(0, limit);
  }

  if (operator === 'personenlast') {
    const person = pick(random, optimizer.context.staff);
    if (!person) return shuffled(random, planned).slice(0, limit);
    const own = planned.filter(slot => optimizer.working.days[slot.dateIso][slot.role] === person.id);
    return own.length ? own : shuffled(random, planned).slice(0, limit);
  }

  if (operator === 'verwandte-felder') {
    const seed = pick(random, planned);
    if (!seed) return [];
    const seedPerson = optimizer.working.days[seed.dateIso][seed.role];
    const seedTime = parseIso(seed.dateIso).getTime();
    return [...planned]
      .map(slot => ({
        slot,
        distance: Math.abs(parseIso(slot.dateIso).getTime() - seedTime) / 86400000
          + (optimizer.working.days[slot.dateIso][slot.role] === seedPerson ? 0 : 6)
          + (slot.role === seed.role ? 0 : 3)
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit)
      .map(entry => entry.slot);
  }

  if (operator === 'rollenblock') {
    const role = random() < .5 ? 'bd' : 'hg';
    const span = Math.max(3, limit);
    const start = Math.floor(random() * Math.max(1, optimizer.dates.length - span));
    const window = new Set(optimizer.dates.slice(start, start + span));
    const inRole = planned.filter(slot => slot.role === role && window.has(slot.dateIso));
    return inRole.length ? inRole : shuffled(random, planned).slice(0, limit);
  }

  if (operator === 'sollabweichung') {
    const deviations = optimizer.context.staff.map(person => ({
      person,
      deviation: countRoleInMonth(optimizer.working, person.id, 'bd') - Number(person.bdTarget || 0)
    })).sort((left, right) => right.deviation - left.deviation);
    const overloaded = deviations[0]?.person;
    if (!overloaded) return shuffled(random, planned).slice(0, limit);
    const own = planned.filter(slot => optimizer.working.days[slot.dateIso][slot.role] === overloaded.id);
    const extra = shuffled(random, planned.filter(slot =>
      optimizer.working.days[slot.dateIso][slot.role] !== overloaded.id)).slice(0, Math.max(1, limit - own.length));
    return [...own, ...extra];
  }

  return shuffled(random, planned).slice(0, limit);
}

/**
 * Belegt einen zerstörten Ausschnitt neu.
 *
 * Gearbeitet wird nach der Regel des kleinsten Spielraums: Immer das Feld mit
 * den wenigsten wählbaren Personen zuerst. Unter den besten Kandidaten wird
 * rangverzerrt gewählt, damit derselbe Ausschnitt in verschiedenen Runden
 * verschieden aufgebaut wird, ohne die Rangfolge der Eignung aufzugeben.
 * Bleibt ein Feld ohne Kandidaten, scheitert der Aufbau und der Ausschnitt
 * wird verworfen.
 */
function recreate({ optimizer, removed, greed }) {
  const open = [...removed];
  const applied = [];
  while (open.length) {
    // Die Reihenfolge bestimmt der billige Eignungsfilter ohne Regelbewertung;
    // vollständig bewertet wird nur das tatsächlich gewählte Feld. Zuvor wurde
    // für jedes offene Feld in jedem Schritt die volle Kandidatenliste erzeugt,
    // was den Wiederaufbau quadratisch teuer machte.
    let selected = open[0];
    let smallest = Infinity;
    for (const slot of open) {
      const rough = optimizer.roughDomain(slot.dateIso, slot.role);
      if (rough < smallest) {
        selected = slot;
        smallest = rough;
        if (rough <= 1) break;
      }
    }
    const selectedCandidates = optimizer.candidates(selected.dateIso, selected.role);
    if (!selectedCandidates.length) return null;
    const span = Math.max(1, Math.min(selectedCandidates.length, greed));
    const bias = Math.floor(optimizer.random() ** 2 * span);
    const chosen = selectedCandidates[Math.min(span - 1, bias)];
    setAssignment(optimizer.working, selected.dateIso, selected.role, chosen.person.id);
    applied.push({ dateIso: selected.dateIso, role: selected.role, staffId: chosen.person.id });
    open.splice(open.indexOf(selected), 1);
  }
  return applied;
}

/**
 * Late-Acceptance-Annahme über einer lexikografischen Zielordnung.
 *
 * Gespeichert wird eine feste Zahl zurückliegender Zielwerte. Angenommen wird,
 * was den aktuellen Zustand verbessert oder mindestens so gut ist wie der
 * Zustand am Anfang des Fensters. Der Verlauf darf sich dadurch zeitweise
 * verschlechtern, ohne die beste je gefundene Lösung zu gefährden – die wird
 * getrennt geführt.
 */
class LateAcceptance {
  constructor(length, initialKey) {
    this.history = new Array(Math.max(1, length)).fill(initialKey);
    this.index = 0;
  }

  accepts(candidateKey, currentKey) {
    const reference = this.history[this.index % this.history.length];
    return compareObjectiveKeys(candidateKey, reference) <= 0
      || compareObjectiveKeys(candidateKey, currentKey) <= 0;
  }

  record(currentKey) {
    const position = this.index % this.history.length;
    if (compareObjectiveKeys(currentKey, this.history[position]) < 0) this.history[position] = currentKey;
    this.index += 1;
  }
}

/**
 * Abschließender Nachweis lokaler Optimalität.
 *
 * Anders als die Suchphasen bricht dieser Durchlauf nicht bei der ersten
 * Verbesserung ab und kennt keine Zeitschranke innerhalb eines Durchgangs: Er
 * prüft jede Einzelumsetzung und jeden Paartausch vollständig. Erst wenn ein
 * kompletter Durchgang ohne Verbesserung bleibt, ist die Belegung bezüglich
 * dieser beiden Nachbarschaften beweisbar nicht mehr verbesserbar.
 */
export async function certify({ optimizer, objective, stats, signal, onStep, rounds = 6, until = Infinity, pace = null }) {
  const gate = pace || createPacer();
  let current = objective;
  for (let round = 1; round <= rounds; round += 1) {
    abortIfRequested(signal);
    let improvedThisRound = false;
    const assignments = orderedAssignments(optimizer, current);

    // Der Nachweis läuft minutenlang ohne jedes Zwischenergebnis. Die
    // Lebenszeichen unten sind gedrosselt und kosten nichts, machen die Phase
    // aber sichtbar arbeitend statt hängend.
    for (const assignment of assignments) {
      if (now() >= until) return { objective: current, certified: false, rounds: round };
      await gate();
      await onStep?.({ kind: 'scan', neighbourhood: 'Einzelumsetzungen', phase: 'certify' });
      const alternatives = optimizer.probe(
        [{ dateIso: assignment.dateIso, role: assignment.role, staffId: '' }],
        () => optimizer.candidates(assignment.dateIso, assignment.role)
      );
      for (const candidate of alternatives) {
        if (candidate.person.id === assignment.staffId) continue;
        stats.certificationMoves += 1;
        const changes = [{ dateIso: assignment.dateIso, role: assignment.role, staffId: candidate.person.id }];
        const result = optimizer.tryMove(changes, current);
        if (!result) continue;
        optimizer.commit(changes);
        current = result;
        assignment.staffId = candidate.person.id;
        improvedThisRound = true;
        stats.improvements += 1;
        await onStep?.({ kind: 'improvement', neighbourhood: 'zertifizierung', changes, objective: current });
        break;
      }
    }

    for (let left = 0; left < assignments.length; left += 1) {
      for (let right = left + 1; right < assignments.length; right += 1) {
        if (now() >= until) return { objective: current, certified: false, rounds: round };
        const first = assignments[left];
        const second = assignments[right];
        if (first.staffId === second.staffId) continue;
        if (first.role !== second.role && first.dateIso !== second.dateIso) continue;
        stats.certificationMoves += 1;
        const changes = [
          { dateIso: first.dateIso, role: first.role, staffId: second.staffId },
          { dateIso: second.dateIso, role: second.role, staffId: first.staffId }
        ];
        const result = optimizer.tryMove(changes, current);
        if (!result) continue;
        optimizer.commit(changes);
        current = result;
        const carried = first.staffId;
        first.staffId = second.staffId;
        second.staffId = carried;
        improvedThisRound = true;
        stats.improvements += 1;
        await onStep?.({ kind: 'improvement', neighbourhood: 'zertifizierung', changes, objective: current });
      }
      await gate();
      await onStep?.({ kind: 'scan', neighbourhood: 'Paartausche', phase: 'certify' });
    }

    if (!improvedThisRound) return { objective: current, certified: true, rounds: round };
  }
  return { objective: current, certified: false, rounds };
}

export function emptyOptimizerStats() {
  return {
    rounds: 0,
    moves: 0,
    improvements: 0,
    accepted: 0,
    rejected: 0,
    repairFailures: 0,
    restarts: 0,
    evaluations: 0,
    candidateChecks: 0,
    certificationMoves: 0,
    certified: false,
    certificationRounds: 0,
    elapsedMs: 0,
    byNeighbourhood: {},
    byOperator: {},
    operatorLearning: {}
  };
}

/**
 * Der vollständige Perfektionslauf.
 *
 * Ablauf je Runde: zerstören, neu aufbauen, bewerten, nach Late-Acceptance
 * annehmen oder verwerfen, in Abständen vollständig absteigen. Die beste je
 * gesehene Belegung wird durchgehend getrennt geführt und am Ende zertifiziert;
 * ein schlechter Zwischenzustand kann das Ergebnis daher nie verschlechtern.
 */
export async function perfect({
  state,
  baseline,
  plannedMonth,
  config,
  allowRed,
  timeBudgetMs,
  mode = 'budget',
  lateAcceptanceSize = 400,
  descentInterval = 25,
  seed,
  onProgress,
  progressStart = .55,
  progressSpan = .42,
  signal
}) {
  const optimizer = new PlanOptimizer({ state, baseline, config, allowRed, seed });
  optimizer.load(plannedMonth);
  try {
    return await runPerfection({ optimizer, timeBudgetMs, mode, lateAcceptanceSize, descentInterval, onProgress, progressStart, progressSpan, signal });
  } finally {
    // Außerhalb des Laufs darf niemand auf zwischengespeicherte
    // Vergleichsgruppen stoßen – auch nicht nach einem Abbruch.
    setPeerGroupCacheToken(null);
  }
}

async function runPerfection({ optimizer, timeBudgetMs, mode, lateAcceptanceSize, descentInterval, onProgress, progressStart, progressSpan, signal }) {
  const stats = emptyOptimizerStats();
  const pace = createPacer();
  const tick = createTicker();
  const startedAt = now();
  const total = Math.max(1000, timeBudgetMs);

  /**
   * Aufteilung des Zeitrahmens.
   *
   * Der erste vollständige Abstieg holt die offensichtlichen Verbesserungen und
   * bekommt dafür ein Viertel der Zeit – ohne Deckel verbrauchte er allein das
   * gesamte Budget, und die eigentliche Ruin-and-Recreate-Suche kam nie zum Zug.
   * Der Hauptteil geht an diese Suche, ein Fünftel bleibt für die abschließende
   * Zertifizierung reserviert.
   */
  /**
   * Aufteilung des Zeitrahmens.
   *
   * Die Reihenfolge muss auch bei kurzen Rahmen gewahrt bleiben: erster
   * Abstieg, dann Ruin-and-Recreate, dann Zertifizierung. Eine feste
   * Mindestreserve für die Zertifizierung durfte deshalb nicht dazu führen,
   * dass das Ende der Suchphase vor dem Ende des ersten Abstiegs liegt – dann
   * lief die Ruin-and-Recreate-Suche überhaupt nicht.
   */
  const converge = mode === 'converge';
  const certifyReserve = Math.min(30000, Math.max(4000, total * .3));
  const searchSpan = Math.max(total * .5, total - certifyReserve);
  const budget = {
    firstDescentUntil: startedAt + (converge ? total : Math.min(total * .45, searchSpan)),
    searchUntil: converge ? startedAt : startedAt + searchSpan,
    until: startedAt + total
  };

  let current = optimizer.objective();
  if (!optimizer.admissible(current)) {
    stats.elapsedMs = Math.round(now() - startedAt);
    return { monthData: optimizer.snapshot(), objective: current, stats, skipped: true };
  }

  let best = { monthData: optimizer.snapshot(), objective: current };
  const late = new LateAcceptance(lateAcceptanceSize, current.key);
  const learning = new Map(DESTROY_OPERATORS.map(operator => [operator, { uses: 0, reward: 0, costMs: 0 }]));

  const report = async (phase, message, extra = {}) => {
    if (typeof onProgress !== 'function') return;
    const share = Math.min(1, Math.max(0, (now() - startedAt) / Math.max(1, budget.until - startedAt)));
    await onProgress({
      phase,
      progress: progressStart + share * progressSpan,
      message,
      optimizerRound: stats.rounds,
      moves: stats.moves,
      improvements: stats.improvements,
      accepted: stats.accepted,
      evaluations: optimizer.evaluations,
      elapsedMs: Math.round(now() - startedAt),
      remainingMs: Math.max(0, Math.round(budget.until - now())),
      red: best.objective.audit.red,
      orange: best.objective.audit.orange,
      yellow: best.objective.audit.yellow,
      ...extra
    });
  };

  // Absuchmeldungen sind Lebenszeichen, keine Erkenntnisse. Sie kommen
  // gedrosselt; Verbesserungen dagegen immer sofort.
  let lastScanReport = 0;
  const onStep = async step => {
    if (step.kind === 'scan') {
      if (now() - lastScanReport < 1500) return;
      lastScanReport = now();
      await report(step.phase || 'perfect', `Nachbarschaft wird abgesucht: ${step.neighbourhood}`, {
        scanning: step.neighbourhood,
        ...(step.phase === 'certify' ? { moves: stats.certificationMoves } : {})
      });
      return;
    }
    if (step.kind !== 'improvement') return;
    await report('perfect', `${step.neighbourhood}: Verbesserung übernommen`, {
      neighbourhood: step.neighbourhood,
      changedCells: step.changes.map(change => ({ dateIso: change.dateIso, role: change.role, staffId: change.staffId }))
    });
  };

  await report('perfect', 'Perfektionsphase gestartet · absteigende Nachbarschaftssuche');
  current = await descend({ optimizer, current, until: budget.firstDescentUntil, stats, signal, onStep, moveCap: 20000, pace });
  if (compareObjectiveKeys(current.key, best.objective.key) < 0) {
    best = { monthData: optimizer.snapshot(), objective: current };
  }

  const searchStartedAt = now();
  const restartAfter = Math.max(120, optimizer.slots.length * 4);
  const stagnationLimit = Math.max(600, optimizer.slots.length * 20);
  let sinceImprovement = 0;
  while (now() < budget.searchUntil) {
    abortIfRequested(signal);
    stats.rounds += 1;

    const operator = selectAdaptiveOperator(optimizer.random, DESTROY_OPERATORS, learning);
    const roundStartedAt = now();
    // Wie viele Runden passen bei der bisher gemessenen Rundendauer noch in die
    // Suchphase? Daraus leitet sich ab, wie groß ein Ausschnitt sein darf.
    const affordableRounds = stats.rounds > 4
      ? (budget.searchUntil - now()) / Math.max(1, (now() - searchStartedAt) / stats.rounds)
      : TARGET_ROUNDS;
    const size = ruinCount(optimizer, optimizer.plannedSlots().length, sinceImprovement, affordableRounds);
    const restore = optimizer.snapshot();
    const removed = destroy({ optimizer, operator, size, objective: current });

    let outcome = 0;
    if (removed.length) {
      for (const slot of removed) optimizer.working.days[slot.dateIso][slot.role] = '';
      /**
       * Große Ausschnitte scheitern beim Wiederaufbau häufiger. Ein zweiter,
       * rein gieriger Versuch rettet einen erheblichen Teil davon: Er nimmt in
       * jedem Schritt den bestbewerteten Kandidaten und findet damit eine
       * Belegung, wo die rangverzerrte Auswahl in eine Sackgasse lief.
       */
      let rebuilt = recreate({ optimizer, removed, greed: 3 });
      if (!rebuilt) {
        for (const slot of removed) optimizer.working.days[slot.dateIso][slot.role] = '';
        rebuilt = recreate({ optimizer, removed, greed: 1 });
      }
      if (!rebuilt) {
        stats.repairFailures += 1;
        optimizer.load(restore);
      } else {
        stats.moves += 1;
        const candidate = optimizer.objective();
        if (!optimizer.admissible(candidate)) {
          optimizer.load(restore);
          stats.rejected += 1;
        } else if (late.accepts(candidate.key, current.key)) {
          const improvedCurrent = compareObjectiveKeys(candidate.key, current.key) < 0;
          current = candidate;
          stats.accepted += 1;
          outcome = improvedCurrent ? 2 : 1;
          if (compareObjectiveKeys(candidate.key, best.objective.key) < 0) {
            best = { monthData: optimizer.snapshot(), objective: candidate };
            stats.improvements += 1;
            outcome = 3;
            sinceImprovement = 0;
            await report('perfect', `Neue Bestlösung über ${operator}`, {
              neighbourhood: operator,
              changedCells: rebuilt.map(change => ({ dateIso: change.dateIso, role: change.role, staffId: change.staffId }))
            });
          }
        } else {
          optimizer.load(restore);
          stats.rejected += 1;
        }
      }
    }

    stats.byOperator[operator] = (stats.byOperator[operator] || 0) + 1;
    const operatorStats = learning.get(operator);
    operatorStats.uses += 1;
    operatorStats.reward += [0, 3, 9, 33][outcome];
    operatorStats.costMs += Math.max(.05, now() - roundStartedAt);
    late.record(current.key);
    sinceImprovement += 1;

    if (stats.rounds % descentInterval === 0) {
      current = await descend({
        optimizer,
        current,
        until: Math.min(budget.searchUntil, now() + Math.max(1500, total * .06)),
        stats,
        signal,
        onStep,
        moveCap: 4000,
        pace
      });
      if (compareObjectiveKeys(current.key, best.objective.key) < 0) {
        best = { monthData: optimizer.snapshot(), objective: current };
        sinceImprovement = 0;
      }
    }

    // Jede Runde gibt zeitgesteuert ab und meldet in festem Takt, damit
    // Fortschrittsbalken und Animation dem Lauf durchgehend folgen können.
    await pace();
    if (tick()) {
      await report('perfect', `Runde ${stats.rounds} · ${operator} · ${stats.accepted} angenommen · ${stats.improvements} Bestwerte`, { neighbourhood: operator });
    }

    /**
     * Stagnationsbehandlung. Bleibt die Suche länger ohne neuen Bestwert,
     * springt sie zunächst auf die beste bekannte Belegung zurück und sucht von
     * dort weiter. Hilft auch das nicht mehr, ist der Zeitrahmen besser in der
     * abschließenden Zertifizierung aufgehoben als in weiteren Leerrunden.
     */
    if (sinceImprovement >= stagnationLimit) break;
    if (sinceImprovement > 0 && sinceImprovement % restartAfter === 0) {
      optimizer.load(best.monthData);
      current = optimizer.objective();
      stats.restarts += 1;
    }
  }

  /**
   * Abschluss: zertifizieren, und solange noch Zeit bleibt und die
   * Zertifizierung selbst noch etwas gefunden hat, erneut vollständig absteigen
   * und erneut zertifizieren. Beendet wird erst, wenn ein vollständiger
   * Zertifizierungsdurchgang ohne jede Verbesserung bleibt.
   */
  optimizer.load(best.monthData);
  current = optimizer.objective();
  let certification = { objective: current, certified: false, rounds: 0 };

  /**
   * Der Nachweis gilt nur für genau den Zustand, den er geprüft hat.
   *
   * Wird nach einer bestandenen Zertifizierung noch einmal abgestiegen und
   * dabei etwas verändert, ist der Nachweis verbraucht: Er beträfe eine
   * Belegung, die gar nicht ausgeliefert wird. Ausgewiesen wird er dann nur
   * weiter, wenn der Abstieg nachweislich nichts mehr gefunden hat.
   */
  let certified = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await report('certify', `Zertifizierung ${attempt + 1} · alle Einzelumsetzungen und Paartausche werden vollständig geprüft`);
    const beforeCertify = stats.improvements;
    certification = await certify({
      optimizer,
      objective: current,
      stats,
      signal,
      onStep,
      until: budget.until,
      pace
    });
    current = certification.objective;
    best = { monthData: optimizer.snapshot(), objective: current };
    certified = certification.certified;
    if (certified && stats.improvements === beforeCertify) break;
    if (now() >= budget.until) break;

    const beforeDescent = stats.improvements;
    current = await descend({
      optimizer,
      current,
      until: Math.min(budget.until, now() + Math.max(2000, total * .1)),
      stats,
      signal,
      onStep,
      moveCap: 8000,
      pace
    });
    best = { monthData: optimizer.snapshot(), objective: current };
    if (stats.improvements !== beforeDescent) certified = false;
  }
  stats.certified = certified;
  stats.certificationRounds = certification.rounds;
  stats.evaluations = optimizer.evaluations;
  stats.candidateChecks = optimizer.candidateChecks;
  stats.elapsedMs = Math.round(now() - startedAt);
  stats.operatorLearning = Object.fromEntries([...learning].map(([operator, value]) => [operator, {
    uses: value.uses,
    reward: value.reward,
    costMs: Number(value.costMs.toFixed(2)),
    rewardPerSecond: value.costMs > 0 ? Number((value.reward / value.costMs * 1000).toFixed(3)) : 0
  }]));

  return { monthData: best.monthData, objective: best.objective, stats, skipped: false };
}

/**
 * Cost-aware UCB operator selection.
 *
 * Every destroy operator is tried before exploitation begins. Afterwards the
 * score combines observed quality gain per compute time with an exploration
 * bonus. The search therefore learns the current month online without training
 * data, while expensive operators must justify their cost.
 */
export function selectAdaptiveOperator(random, operators, learning) {
  const untried = operators.filter(operator => !(learning.get(operator)?.uses > 0));
  if (untried.length) return untried[Math.min(untried.length - 1, Math.floor(random() * untried.length))];
  const totalUses = operators.reduce((sum, operator) => sum + Number(learning.get(operator)?.uses || 0), 0);
  let best = operators[0];
  let bestScore = -Infinity;
  for (const operator of operators) {
    const stats = learning.get(operator) || { uses: 0, reward: 0, costMs: 0 };
    const efficiency = Number(stats.reward || 0) / Math.max(.05, Number(stats.costMs || 0)) * 100;
    const exploration = Math.sqrt(2 * Math.log(Math.max(2, totalUses)) / Math.max(1, Number(stats.uses || 0)));
    const score = efficiency + exploration;
    if (score > bestScore) {
      best = operator;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Sicherheitsnetz vor der Übernahme: Kein vom Nutzer gesetzter Dienst darf sich
 * verändert haben. Die Prüfung ist bewusst unabhängig von der Suchlogik – sie
 * kontrolliert das Ergebnis, nicht den Weg dorthin.
 */
export function assertFixedAssignmentsUntouched(baseline, monthData) {
  for (const dateIso of Object.keys(baseline.days || {})) {
    for (const role of ROLE_ORDER) {
      const fixed = baseline.days[dateIso]?.[role] || '';
      if (!fixed) continue;
      if ((monthData.days?.[dateIso]?.[role] || '') !== fixed) {
        throw new Error(`Auto-Plan hat den gesetzten Dienst ${role.toUpperCase()} am ${dateIso} verändert.`);
      }
    }
  }
  return true;
}

export function proposedChanges(monthData, baseline) {
  return listProposedAssignments(monthData, baseline);
}
