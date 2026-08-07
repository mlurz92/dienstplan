/**
 * Registratur der Laufansichten — der geschriebene Vertrag.
 *
 * Bis v10.6 stand jede Ansicht an zwei Stellen: als `<option>` im Studio und
 * als Zweig der Erzeugung im Laufpfad. Zwei gleichlautende Änderungen je neuer
 * Ansicht, und eine vergessene fiel nicht auf: Die Auswahl erschien, blieb aber
 * wirkungslos, weil der Laufpfad die Marke nicht kannte. Beides liest jetzt aus
 * dieser Liste. Wer eine Ansicht hinzufügt, ergänzt genau einen Eintrag.
 *
 * DER VERTRAG EINER LAUFANSICHT
 *
 * Eine Ansicht wird über `create(canvas, monthData, context)` gebaut. Der
 * Kontext trägt, was eine Ansicht *zusätzlich* zum Monat brauchen kann — heute
 * `staff`, damit die Weberei ihre Zeilen beschriften kann. Ansichten, die ihn
 * nicht brauchen, ignorieren ihn; die Erzeugung gleicht die uneinheitlichen
 * Konstruktoren hier aus, statt sie den Aufrufer wissen zu lassen.
 *
 * Danach muss das erzeugte Objekt vier Zusagen halten:
 *
 *   update(meldung)  Nimmt jede Fortschrittsmeldung der Engine entgegen und
 *                    verwertet, was sie versteht. Eine unbekannte oder
 *                    unvollständige Meldung ist kein Fehler, sondern der
 *                    Normalfall — sie wird stillschweigend übergangen.
 *   finish()         Der Lauf ist zu Ende; das Bild darf zum Standbild werden.
 *   stop()           Zeitschleife und Beobachter abbauen. Muss nach `finish()`,
 *                    ohne `finish()` und mehrfach aufrufbar sein.
 *
 * Keine Ansicht darf werfen, wenn die Leinwand keinen 2D-Kontext liefert: Der
 * Lauf selbst hängt nicht an der Darstellung und darf nicht mit ihr fallen.
 *
 * ZWEI BEDEUTUNGEN AUF EINEM ATTRIBUT
 *
 * `canvas.dataset.renderMode` ist öffentlich, trägt aber je nach Ansicht
 * Verschiedenes:
 *
 *   Kristallisation, Weberei, Kaskade,  den *Lebenszyklus*: `running`,
 *   Prisma                              `complete`, `stopped`, `unavailable`.
 *   Orbit                               die *Darstellungsgüte* der
 *                                       Animationsrichtlinie: `full`,
 *                                       `balanced`, `constrained`, `hidden`,
 *                                       `reduced`, `finished` — dazu `stopped`
 *                                       und `unavailable`.
 *
 * Gemeinsam sind nur `stopped` und `unavailable`. Vereinheitlichen ließe sich
 * das nicht folgenlos: `auto-plan-studio-v7-5.css` färbt ihre Güteplakette nach
 * `full`/`balanced`/`constrained`, und `tests/e2e/auto-plan.spec.js` prüft, dass
 * bei abgeschalteter Bewegungsreduktion nicht `reduced` steht. Beobachtbares
 * Verhalten ist gebunden, ob zugesagt oder nicht — deshalb steht die Doppeldeutung
 * hier geschrieben, statt still umbenannt zu werden.
 *
 * Einheitlich ist stattdessen `canvas.dataset.runView`: Es trägt für jede
 * Ansicht ihre Marke und wird hier gesetzt, nicht in den Ansichten — eine
 * zusätzliche, verlässliche Angabe statt einer umgedeuteten.
 *
 * WELCHE FELDER EINE MELDUNG TRÄGT
 *
 * `js/auto-planner-v10.js` sendet über einen Kanal an alle Ansichten. Was hier
 * steht, ist damit ein Vertrag mit vier Konsumenten — ein Feld, das eine
 * Ansicht liest, ist gebunden, auch wenn es niemand zugesagt hat:
 *
 *   phase, progress, message   Grundzustand des Laufs.
 *   level                      Bewertungsstufe eines Ereignisses (rot … grau).
 *   stages[]                   Der Stufenplan der Kaskade, einmal vollständig.
 *   stage + cpSatPhase         Die gerade laufende Stufe.
 *   incumbent                  Zwischenlösung: objectiveValue, bestBound,
 *                              hasObjective, stage, assignments[].
 *   loads[]                    Last je Person zum Ende des Laufs.
 *   changedCells[]             Einzelne Zuordnungswechsel.
 *
 * `hasObjective` ist dabei kein Beiwerk: Die vorgeschaltete Zulässigkeitssuche
 * läuft ohne Zielfunktion und meldet Zielwert wie Schranke als null. Wer daraus
 * einen Optimalitätsbeweis ableitet, steht den Rest des Laufs still.
 */

import { AutoPlanCrystallizer } from './auto-plan-crystallize.js?v=20260806.1';
import { AutoPlanWeaver } from './auto-plan-weave.js?v=20260806.1';
import { AutoPlanCascade } from './auto-plan-cascade.js?v=20260806.1';
import { AutoPlanPrism } from './auto-plan-prism.js?v=20260806.1';
import { AutoPlanVisualizer } from './auto-plan-visualizer.js?v=20260806.1';

/**
 * Die Ansichten in der Reihenfolge, in der sie im Studio zur Wahl stehen.
 * Der erste Eintrag ist die Voreinstellung.
 */
export const RUN_VIEWS = Object.freeze([
  Object.freeze({
    id: 'crystal',
    label: 'Kristallisation',
    hint: 'zeigt den Zusammenfall des Suchraums, die Annäherung von Zielwert und unterer Schranke sowie die Lastverteilung',
    create: (canvas, monthData, context) => new AutoPlanCrystallizer(canvas, monthData, context)
  }),
  Object.freeze({
    id: 'weave',
    label: 'Weberei',
    hint: 'zeigt den entstehenden Plan als Gewebe aus Personen und Tagen',
    create: (canvas, monthData, context) => new AutoPlanWeaver(canvas, monthData, context)
  }),
  Object.freeze({
    id: 'cascade',
    label: 'Kaskade',
    hint: 'zeigt die lexikografische Rangfolge als Becken, deren Ungewissheitsband sich bis zum Beweis schließt',
    create: (canvas, monthData, context) => new AutoPlanCascade(canvas, monthData, context)
  }),
  Object.freeze({
    id: 'prism',
    label: 'Prisma',
    hint: 'zeigt den Lauf als Lichtstrahl, den ein Prisma in die Zielstufen auffächert — je Stufe ein Spektralband von Rot bis Violett',
    create: (canvas, monthData, context) => new AutoPlanPrism(canvas, monthData, context)
  }),
  Object.freeze({
    id: 'orbit',
    label: 'Orbit',
    // Die älteste Ansicht kennt den Kontext nicht. Der Unterschied endet hier.
    hint: 'ist die frühere Ringdarstellung',
    create: (canvas, monthData) => new AutoPlanVisualizer(canvas, monthData)
  })
]);

export const DEFAULT_RUN_VIEW = RUN_VIEWS[0].id;

/**
 * Baut die Ansicht zur Marke und schreibt sie an die Leinwand.
 *
 * Der Aufrufer kennt damit nur einen Weg, eine Laufansicht zu bauen — und jede
 * gebaute Ansicht ist von außen erkennbar, unabhängig davon, welche es ist.
 */
export function createRunView(id, canvas, monthData, context = {}) {
  const view = resolveRunView(id);
  const instance = view.create(canvas, monthData, context);
  if (canvas?.dataset) canvas.dataset.runView = view.id;
  return { id: view.id, label: view.label, instance };
}

/**
 * Eine gespeicherte Marke auf eine Ansicht abbilden.
 *
 * Unbekannte Marken — etwa aus einer Fassung mit anderem Ansichtsangebot —
 * fallen auf die Voreinstellung zurück. Eine fehlende Laufanzeige wäre der
 * schlechtere Ausgang als eine andere als die zuletzt gewählte.
 */
export function resolveRunView(id) {
  return RUN_VIEWS.find(view => view.id === id) || RUN_VIEWS[0];
}

export const RUN_VIEWS_VERSION = '20260806.1';
