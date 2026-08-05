/**
 * Auto-Plan v8 – Incremental Constraint Observatory.
 *
 * v8 ändert keine einzige fachliche Regel. Die produktive Regelengine bleibt die
 * alleinige Wahrheitsquelle; jede Bewertung, die über Annahme oder Ablehnung
 * entscheidet, durchläuft unverändert dieselbe Prüfung wie eine Eingabe von
 * Hand. Was sich ändert, ist alles *um* diese Bewertung herum.
 *
 * WAS v8 GEGENÜBER v7.5 AUSMACHT
 *
 * 1. **Inkrementelle Nebenrechnung.** Sortierte Tagesliste, offene Dienstfelder,
 *    Zählwerke je Person und die Marke des Vergleichsgruppen-Speichers wurden
 *    zuvor in jedem Bewertungspfad neu gebildet. Sie werden jetzt einmal
 *    bestimmt und fortgeschrieben. Der Perfektionsoptimierer besitzt dafür genau
 *    einen Schreibtrichter, und dessen Zusicherung ist durch Tests belegt.
 * 2. **Zwei adaptive Dimensionen.** Neben den acht Zerstörungsoperatoren lernt
 *    die Suche jetzt auch den Wiederaufbau: kleinster Spielraum, Regret-2 oder
 *    rein gierig. Beide Tabellen werden segmentweise nach Ropke und Pisinger
 *    neu gewichtet und vergessen dadurch veraltete Erfolge.
 * 3. **Neustarts nach Luby.** Die feste Stagnationsschwelle ist einer
 *    universellen Neustartfolge gewichen, die ohne Instanzwissen auskommt.
 * 4. **Portfolio ohne Doppelarbeit.** Kein Arbeitsstrang rechnet mehr eine
 *    Suche, die ein anderer bereits rechnet; die Streuung entsteht aus
 *    unterschiedlicher Parametrierung statt aus Wiederholung.
 * 5. **Gerechtigkeit mit Spannweite.** Neben den Varianzen entscheidet
 *    nachrangig die Spannweite zwischen der am stärksten und der am schwächsten
 *    belasteten Person — genau das, was am Plan als unfair wahrgenommen wird.
 * 6. **Stärkerer Nachweis.** Die Zertifizierung prüft zusätzlich das
 *    Tagespaket. Ein als nicht weiter verbesserbar ausgewiesener Plan enthält
 *    damit keine Verbesserung mehr, die die Suche selbst kennt.
 */
import * as V75 from './auto-planner-v7-5.js?v=20260805.1';

export * from './auto-planner-v7-5.js?v=20260805.1';

export const AUTO_PLAN_REVISION = 8;
export const AUTO_PLAN_ENGINE_ID = 'v8-incremental-constraint-observatory';

/**
 * Die Bausteine des Laufs in der Reihenfolge ihrer Ausführung.
 *
 * Die Oberfläche liest diese Beschreibung, statt sie ein zweites Mal als Text
 * vorzuhalten. Eine zweite Fassung wäre erfahrungsgemäß nach der nächsten
 * Änderung falsch, ohne dass es jemand bemerkt.
 */
export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({
    id: 'analysis',
    title: 'Fixpunkte und Domänen',
    detail: 'Bestehende Einteilungen werden gesichert, personengebundene Grenzen abgeleitet, erfüllbare Wünsche einmalig katalogisiert.'
  }),
  Object.freeze({
    id: 'construct',
    title: 'Constraint-gerichtete Konstruktion',
    detail: 'Beam-Suche über die Dienstfelder, geordnet nach kleinstem Spielraum, mit Vorwärts-Checking gegen Sackgassen.'
  }),
  Object.freeze({
    id: 'rescue',
    title: 'Null-Rot-Rescue',
    detail: 'Verbreiterter Suchstrahl, größerer Kandidatenfächer, tieferes Backtracking — bevor überhaupt ein roter Vorschlag erwogen wird.'
  }),
  Object.freeze({
    id: 'repair',
    title: 'Iterative Tauschreparatur',
    detail: 'Einzelumsetzungen, Paartausche, Dreierketten, Tagespakete und lokale Neuplanung auffälliger Tage.'
  }),
  Object.freeze({
    id: 'perfect',
    title: 'Adaptive Ruin-and-Recreate-Perfektion',
    detail: 'Acht Zerstörungs- und drei Reparaturoperatoren, segmentweise neu gewichtet, mit Late-Acceptance-Annahme und Luby-Neustarts.'
  }),
  Object.freeze({
    id: 'certify',
    title: 'Optimalitätsnachweis',
    detail: 'Einzelumsetzung, Paartausch und Tagespaket werden vollständig und ohne Abkürzung geprüft.'
  })
]);

function annotate(result) {
  if (!result) return result;
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  return result;
}

export async function constructAutoPlan(parameters) {
  return annotate(await V75.constructAutoPlan(parameters));
}

export async function perfectAutoPlan(parameters) {
  return annotate(await V75.perfectAutoPlan(parameters));
}

export async function buildAutoPlan(parameters) {
  return annotate(await V75.buildAutoPlan(parameters));
}
