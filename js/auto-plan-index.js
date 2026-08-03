/**
 * Auto-Plan v8 – Indexschicht zwischen Monatsdaten und Suche.
 *
 * WARUM ES DIESE SCHICHT GIBT
 *
 * Die fachliche Bewertung einer Zelle ist teuer und bleibt unangetastet: Die
 * produktive Regelengine ist die einzige Wahrheitsquelle. Teuer war jedoch auch
 * alles *um* sie herum. Drei Größen wurden in jedem Bewertungspfad neu
 * berechnet, obwohl sie sich nicht oder nur an bekannten Stellen ändern:
 *
 * 1. die sortierte Tagesliste eines Monats (`Object.keys().sort()`),
 * 2. die Liste der offenen Dienstfelder,
 * 3. die Marke des Vergleichsgruppen-Speichers, die zuvor als Zeichenkette aus
 *    allen Tagen zusammengesetzt wurde.
 *
 * Bei einigen zehntausend Zielfunktionsauswertungen je Lauf dominierte diese
 * Nebenarbeit die Laufzeit. Sie liegt jetzt hier, wird je Monatsobjekt genau
 * einmal bestimmt und über eine `WeakMap` gehalten – ohne den Monat selbst zu
 * verändern und ohne die Lebensdauer der Daten zu verlängern.
 *
 * ZUR EXAKTHEIT DER MARKE
 *
 * Der Vergleichsgruppen-Speicher darf niemals einen Eintrag aus einem anderen
 * Belegungszustand liefern. Deshalb gibt es hier bewusst **keine** Streuwert-
 * marke mit Kollisionsrisiko. Gebildet wird eine verlustfreie Marke aus
 * internierten Personal-Kennungen: Jede Kennung erhält eine kleine ganze Zahl,
 * die Marke ist die Folge dieser Zahlen. Zwei verschiedene Belegungen können
 * damit nie dieselbe Marke tragen, die Bildung kostet aber nur eine
 * Nachschlageoperation je Tag statt einer Zeichenkettenverkettung.
 */

const ROLE_ORDER = Object.freeze(['bd', 'hg']);

/**
 * Internierungstabelle der Personal-Kennungen.
 *
 * Sie wächst monoton und wird nie geleert: Die Zahl der Kennungen ist durch den
 * Personalstamm begrenzt, und eine Leerung würde bestehende Marken ungültig
 * machen, ohne dass es jemand bemerkt. Der leere Dienst trägt fest die Null.
 */
const internedIds = new Map([['', 0]]);
let nextInternedId = 1;

export function internStaffId(staffId) {
  const key = staffId || '';
  const existing = internedIds.get(key);
  if (existing !== undefined) return existing;
  const assigned = nextInternedId;
  nextInternedId += 1;
  internedIds.set(key, assigned);
  return assigned;
}

export function internedStaffCount() {
  return internedIds.size;
}

/**
 * Legt die Nummerierung vor dem Lauf fest.
 *
 * Die Kennungen dienen unter anderem als Sortierschlüssel bei gleichwertigen
 * Varianten. Würden sie in der Reihenfolge ihres ersten Auftretens vergeben,
 * hinge diese Sortierung davon ab, welcher Suchpfad zuerst gelaufen ist – und
 * derselbe Monat ergäbe im Arbeitsstrang eine andere Reihenfolge als im
 * Anzeigestrang. Vor jedem Lauf wird die Nummerierung deshalb aus dem
 * alphabetisch sortierten Personalstamm vorbelegt und ist damit überall gleich.
 */
export function primeStaffIds(staff) {
  if (!Array.isArray(staff)) return;
  for (const id of staff.map(person => person?.id).filter(Boolean).sort()) internStaffId(id);
}

const dateCache = new WeakMap();

/**
 * Die sortierten Kalendertage eines Monats.
 *
 * Das Ergebnis wird geteilt und darf deshalb nicht verändert werden. Alle
 * Aufrufer lesen es ausschließlich; wer eine eigene Reihenfolge braucht, kopiert
 * vorher.
 */
export function monthDatesOf(monthData) {
  const days = monthData?.days;
  if (!days) return [];
  const cached = dateCache.get(monthData);
  if (cached) return cached;
  const dates = Object.keys(days).sort();
  dateCache.set(monthData, dates);
  return dates;
}

const openSlotCache = new WeakMap();

/**
 * Die offenen Dienstfelder eines Monats, BD vor HG und je Rolle nach Datum.
 *
 * Zwischengespeichert wird ausschließlich für **Ausgangsmonate**: Deren
 * Belegung ist während eines Laufs unveränderlich, weil sie die Fixpunkte
 * beschreibt. Für Arbeitsmonate, die sich laufend ändern, wird bewusst jedes Mal
 * neu bestimmt – ein veralteter Eintrag wäre dort ein Fehler.
 */
export function baselineOpenSlots(baseline) {
  const cached = openSlotCache.get(baseline);
  if (cached) return cached;
  const dates = monthDatesOf(baseline);
  const slots = [];
  for (const role of ROLE_ORDER) {
    for (const dateIso of dates) {
      if (!baseline.days?.[dateIso]?.[role]) slots.push({ dateIso, role });
    }
  }
  Object.freeze(slots);
  openSlotCache.set(baseline, slots);
  return slots;
}

/**
 * Verlustfreie Marke des Belegungszustands.
 *
 * `epoch` trennt aufeinanderfolgende Planungsläufe: Zwei Läufe mit
 * unterschiedlichen Abwesenheiten oder Wünschen können denselben Dienstzustand
 * haben, aber unterschiedliche Vergleichsgruppen. Ohne die Epoche träfe der
 * spätere Lauf auf Einträge des früheren.
 */
export function planToken(monthData, epoch = 0) {
  const days = monthData?.days;
  if (!days) return null;
  const dates = monthDatesOf(monthData);
  // Ein vorbelegtes Feld statt fortlaufender Verkettung: Die Zwischenergebnisse
  // der Verkettung waren der eigentliche Aufwand, nicht der Inhalt.
  const parts = new Array(dates.length + 3);
  parts[0] = epoch;
  parts[1] = monthData.year;
  parts[2] = monthData.month;
  for (let index = 0; index < dates.length; index += 1) {
    const day = days[dates[index]];
    parts[index + 3] = internStaffId(day?.bd) * 8192 + internStaffId(day?.hg);
  }
  return parts.join('.');
}

/**
 * Zählwerk der gesetzten Dienste je Person und Rolle.
 *
 * Es ersetzt den vollständigen Monatsscan, den `countRoleInMonth` je Aufruf
 * ausführt. Angelegt wird es einmal je Monatsobjekt; wer schreibt, meldet die
 * Änderung über `ledgerApply`.
 */
export function buildLedger(monthData) {
  const bd = Object.create(null);
  const hg = Object.create(null);
  const days = monthData?.days || {};
  for (const dateIso of monthDatesOf(monthData)) {
    const day = days[dateIso];
    if (day?.bd) bd[day.bd] = (bd[day.bd] || 0) + 1;
    if (day?.hg) hg[day.hg] = (hg[day.hg] || 0) + 1;
  }
  return { bd, hg };
}

export function cloneLedger(ledger) {
  return { bd: { ...ledger.bd }, hg: { ...ledger.hg } };
}

/** Verbucht den Wechsel einer Zelle von `previous` auf `next`. */
export function ledgerApply(ledger, role, previous, next) {
  if (previous === next) return ledger;
  if (previous) {
    const remaining = (ledger[role][previous] || 0) - 1;
    if (remaining > 0) ledger[role][previous] = remaining;
    else delete ledger[role][previous];
  }
  if (next) ledger[role][next] = (ledger[role][next] || 0) + 1;
  return ledger;
}

export function ledgerCount(ledger, staffId, role) {
  return Number(ledger?.[role]?.[staffId] || 0);
}

/**
 * Spannweite einer Verteilung.
 *
 * Die Zielfunktion kannte bisher nur Varianzen. Zwei Pläne mit gleicher Varianz,
 * aber sehr unterschiedlicher Spannweite waren dadurch ununterscheidbar, obwohl
 * die Spannweite genau das ist, was Betroffene an einem Plan als unfair
 * wahrnehmen: der Abstand zwischen der am stärksten und der am schwächsten
 * belasteten Person.
 */
export function spread(values) {
  if (!values.length) return 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  return maximum - minimum;
}

/**
 * Neustartplan nach Luby.
 *
 * Die Folge 1,1,2,1,1,2,4,… ist ohne Instanzwissen bis auf einen konstanten
 * Faktor optimal. Sie ersetzt die feste Stagnationsschwelle, die instanzabhängig
 * entweder zu früh neu startete oder viel zu lange leer lief.
 */
export function lubyValue(index) {
  let position = Math.max(1, Math.floor(index));
  let exponent = 1;
  for (;;) {
    const power = 2 ** exponent;
    if (position === power - 1) return 2 ** (exponent - 1);
    if (position < power - 1) {
      position = position - 2 ** (exponent - 1) + 1;
      exponent = 1;
      continue;
    }
    exponent += 1;
  }
}

/**
 * Fortlaufende, prozessweit eindeutige Marken für Belegungszustände.
 *
 * Wer genau einen Schreibtrichter besitzt – der Perfektionsoptimierer –, kann
 * die Marke des Vergleichsgruppen-Speichers in konstanter Zeit fortschreiben,
 * statt sie aus dem Monat abzuleiten. Die Zähler sind prozessweit eindeutig,
 * damit zwei nacheinander laufende Optimierer nie dieselbe Marke tragen.
 */
let versionCounter = 1;

export function nextPlanVersion() {
  versionCounter += 1;
  return versionCounter;
}

export { ROLE_ORDER };
