/**
 * Ausführung eines Auto-Plan-Laufs auf mehreren Kernen.
 *
 * ZUR GRAFIKKARTE
 *
 * Die naheliegende Idee, diese Rechnung auf die Grafikkarte zu geben, trägt
 * hier nicht. Grafikprozessoren gewinnen ihre Leistung daraus, dass tausende
 * Rechenwerke denselben Befehlsstrom auf flachen Zahlenfeldern ausführen. Die
 * Regelbewertung ist das Gegenteil davon: verzweigungsreich, auf Zeichenketten
 * und Objektgraphen arbeitend, mit Datumsrechnung und Nachschlagen in
 * Nachbarmonaten. Sie ließe sich dort nur ausführen, indem man das gesamte
 * Regelwerk ein zweites Mal als numerische Fassung nachbaut – und genau das ist
 * ausgeschlossen: Die bestehende Regelengine ist die einzige fachliche
 * Wahrheitsquelle; eine zweite Fassung würde von ihr abweichen, ohne dass es
 * jemand bemerkt. Hinzu kommt, dass die Suche in ihrem Kern aufeinanderfolgend
 * ist: Jede Annahmeentscheidung hängt am Ergebnis der vorigen.
 *
 * WAS STATTDESSEN TRÄGT
 *
 * Arbeitsstränge, und zwar in beiden Phasen:
 *
 * 1. **Aufbau.** Die Suchläufe eines Monats – reguläre Null-Rot-Suche,
 *    vertiefte Null-Rot-Suche, Minimal-Rot-Rückfall – bilden nacheinander eine
 *    Kette: Der nächste startet nur, wenn der vorige scheitert. Bei schwierigen
 *    Monaten läuft dadurch alles dreimal hintereinander. Gleichzeitig gestartet
 *    dauert es nur so lange wie der längste, und es gewinnt derselbe Lauf, den
 *    auch die Kette gewählt hätte.
 * 2. **Perfektion.** Mehrere Stränge verbessern denselben Aufbau mit
 *    verschiedenen Startwerten. Weil die Suche stochastisch ist, streuen ihre
 *    Ergebnisse; der beste aus mehreren unabhängigen Läufen ist verlässlich
 *    besser als ein einzelner.
 *
 * Der Aufbau wird dabei genau einmal berechnet und an alle Perfektionsläufe
 * verteilt. Ihn je Strang zu wiederholen wäre dieselbe Arbeit mehrfach.
 *
 * Fehlt die Unterstützung für Arbeitsstränge, läuft alles unverändert im
 * Anzeigestrang weiter.
 */

import { buildAutoPlan } from './auto-planner.js?v=20260801.11';
import { planProfileIds } from './auto-planner-engine.js?v=20260801.11';

const WORKER_URL = '/js/auto-plan-worker.js?v=20260801.11';

/**
 * Wie viele Perfektionsläufe parallel starten.
 *
 * Ein Kern bleibt für Anzeige und Animation frei. Mehr als vier Läufe bringen
 * kaum noch Streuungsgewinn, kosten aber Speicher und Startzeit.
 */
export function parallelSearchCount() {
  const cores = Number(globalThis.navigator?.hardwareConcurrency) || 2;
  return Math.max(1, Math.min(4, cores - 1));
}

export function workersAvailable() {
  return typeof Worker === 'function';
}

/**
 * Vergleicht zwei Ergebnisse in derselben Ordnung, die auch die Suche verwendet.
 *
 * Die Zielbewertung trägt Obergrenzen, gesperrte Zellen, unbesetzte Felder und
 * rote Ausnahmen an ihrer Spitze. Damit wählt derselbe Vergleich sowohl unter
 * den Aufbauläufen den richtigen aus – eine Null-Rot-Lösung schlägt jeden
 * Minimal-Rot-Rückfall – als auch unter den Perfektionsläufen den besten.
 */
function isBetter(candidate, incumbent) {
  if (!incumbent) return Boolean(candidate);
  if (!candidate) return false;
  if (candidate.complete !== incumbent.complete) return Boolean(candidate.complete);
  const left = candidate.objectiveKey;
  const right = incumbent.objectiveKey;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const a = Number(left[index] || 0);
      const b = Number(right[index] || 0);
      if (Math.abs(a - b) > 1e-9) return a < b;
    }
    return false;
  }
  const rank = result => [
    result.metrics?.unfilled || 0,
    result.metrics?.gray || 0,
    result.metrics?.red || 0,
    result.metrics?.orange || 0,
    result.metrics?.yellow || 0
  ];
  const a = rank(candidate);
  const b = rank(incumbent);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] < b[index];
  return false;
}

/**
 * Startet den Lauf und liefert das beste Ergebnis.
 *
 * `onProgress` erhält zusätzlich `searchIndex` und `searchCount`, damit die
 * Oberfläche sichtbar machen kann, dass mehrere Läufe gleichzeitig arbeiten.
 */
export async function runAutoPlan({ state, monthData, year, month, runConfig, onProgress, signal }) {
  const inline = () => buildAutoPlan({
    state,
    monthData,
    year,
    month,
    runConfig,
    signal,
    onProgress: update => onProgress?.({ ...update, searchIndex: 0, searchCount: 1 })
  });

  if (!workersAvailable()) return inline();

  let profileIds;
  try {
    profileIds = planProfileIds(state, monthData, runConfig);
  } catch {
    return inline();
  }
  if (!profileIds.length) return inline();

  const perfectionCount = runConfig?.parallelSearches === undefined
    ? parallelSearchCount()
    : Math.max(1, Math.min(8, Number(runConfig.parallelSearches) || 1));

  /**
   * Ein Strang je Aufbaulauf, danach ein Strang je Perfektionslauf. Die bereits
   * gestarteten Stränge werden für die zweite Phase weiterverwendet: Sie haben
   * ihre Module geladen, ein neuer Strang müsste das wiederholen.
   */
  const pool = [];
  const cleanup = () => {
    for (const worker of pool) worker.terminate();
    pool.length = 0;
  };
  const workerState = () => ({
    months: state.months,
    staff: state.staff,
    currentYear: state.currentYear,
    currentMonth: state.currentMonth,
    monthSources: state.monthSources
  });

  try {
    return await new Promise((resolve, reject) => {
      let phase = 'construct';
      let pending = profileIds.length;
      let bestConstruction = null;
      let best = null;
      let firstError = null;
      let closed = false;

      const fail = error => {
        if (closed) return;
        closed = true;
        cleanup();
        reject(error);
      };
      const succeed = result => {
        if (closed) return;
        closed = true;
        cleanup();
        resolve(result);
      };
      const fallback = () => {
        if (closed) return;
        closed = true;
        cleanup();
        resolve(inline());
      };

      const onAbort = () => {
        const error = new Error('Auto-Plan wurde abgebrochen.');
        error.name = 'AbortError';
        fail(error);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });

      const send = (index, message) => {
        let worker = pool[index];
        if (!worker) {
          try {
            worker = new Worker(WORKER_URL, { type: 'module' });
          } catch {
            fallback();
            return false;
          }
          pool[index] = worker;
          worker.addEventListener('message', event => handleMessage(event.data));
          worker.addEventListener('error', event => {
            if (!firstError) firstError = new Error(event.message || 'Arbeitsstrang fehlgeschlagen.');
            settle();
          });
        }
        worker.postMessage(message);
        return true;
      };

      const startPerfection = () => {
        phase = 'perfect';
        pending = perfectionCount;
        for (let index = 0; index < perfectionCount; index += 1) {
          const started = send(index, {
            type: 'perfect',
            runId: index,
            state: workerState(),
            constructed: bestConstruction,
            progressFloor: .55,
            runConfig: { ...runConfig, seedSalt: index }
          });
          if (!started) return;
        }
        // Überzählige Stränge aus der Aufbauphase werden nicht mehr gebraucht.
        for (let index = perfectionCount; index < pool.length; index += 1) pool[index]?.terminate();
        pool.length = Math.min(pool.length, perfectionCount);
      };

      const settle = () => {
        if (closed) return;
        pending -= 1;
        if (pending > 0) return;
        if (phase === 'construct') {
          if (!bestConstruction) return fallback();
          startPerfection();
          return;
        }
        if (best) succeed(best);
        else fail(firstError || new Error('Auto-Plan lieferte kein Ergebnis.'));
      };

      const handleMessage = message => {
        if (!message || closed) return;
        if (message.type === 'progress') {
          onProgress?.({
            ...message.update,
            searchIndex: Number(message.runId) || 0,
            searchCount: phase === 'construct' ? profileIds.length : perfectionCount
          });
          return;
        }
        if (message.type === 'constructed') {
          if (isBetter(message.result, bestConstruction)) bestConstruction = message.result;
          /**
           * Kurzschluss auf den ersten Suchlauf.
           *
           * Nacheinander ausgeführt bricht die Kette ab, sobald der erste Lauf
           * eine vollständige Belegung ohne rote Ausnahme liefert – die
           * späteren Stufen laufen dann gar nicht erst. Genau dieser Fall wird
           * hier nachgebildet: Meldet der erste Lauf Erfolg, werden die übrigen
           * beendet, statt auf den langsamsten zu warten. Scheitert er, zahlt
           * sich aus, dass die anderen längst mitgelaufen sind.
           */
          if (Number(message.runId) === 0 && message.result?.complete && !(message.result.metrics?.red > 0)) {
            for (let index = 1; index < pool.length; index += 1) pool[index]?.terminate();
            pool.length = 1;
            pending = 1;
          }
          settle();
          return;
        }
        if (message.type === 'done') {
          if (isBetter(message.result, best)) best = message.result;
          settle();
          return;
        }
        if (message.type === 'error') {
          if (message.name === 'AbortError') return;
          if (!firstError) firstError = new Error(message.message);
          settle();
        }
      };

      for (const [index, profileId] of profileIds.entries()) {
        const started = send(index, {
          type: 'construct',
          runId: index,
          state: workerState(),
          monthData,
          year,
          month,
          runConfig: { ...runConfig, profileFilter: [profileId] }
        });
        if (!started) return;
      }
    });
  } finally {
    cleanup();
  }
}
