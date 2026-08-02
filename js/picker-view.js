/**
 * Auswahlmodell für den Dienst-Picker.
 *
 * Der Picker öffnet sich mitten in der Planung und beantwortet genau eine
 * Frage: „Wer übernimmt diesen Dienst?“ Die frühere Liste zeigte alle
 * Bewertungen gleich gewichtet als breite Textblöcke – fachlich vollständig,
 * aber ohne Rangfolge und ohne schnellen Zugriff.
 *
 * Dieses Modul liefert dafür die reine, DOM-freie Logik:
 *
 * - Einordnung jeder Person in eine Entscheidungsgruppe;
 * - Rangfolge innerhalb der Gruppe nach Empfehlung, Monatslast und Verlauf;
 * - Tippfilter mit Umlaut- und Akzentnormalisierung;
 * - kompakte Kennzahlen für Monatslast und Begründungen.
 *
 * Die Reihenfolge der Gruppen ist die Reihenfolge der Entscheidung: zuerst
 * die klare Empfehlung, zuletzt das, was ausdrücklich bestätigt oder gar nicht
 * gewählt werden kann.
 */

export const PICKER_GROUPS = Object.freeze([
  Object.freeze({ id: 'recommended', label: 'Empfohlen', hint: 'Wunsch, Ausgleich und Verlauf sprechen dafür' }),
  Object.freeze({ id: 'available', label: 'Möglich', hint: 'Keine relevanten Konflikte' }),
  Object.freeze({ id: 'notice', label: 'Mit Hinweis', hint: 'Wählbar, aber mit Anmerkung' }),
  Object.freeze({ id: 'secondary', label: 'Nachrangig', hint: 'Nur wenn keine bessere Besetzung möglich ist' }),
  Object.freeze({ id: 'confirm', label: 'Bestätigung nötig', hint: 'Roter Konflikt, ausdrückliche Bestätigung erforderlich' }),
  Object.freeze({ id: 'blocked', label: 'Nicht verfügbar', hint: 'Nicht im Dienstpool oder zum Termin nicht aktiv' })
]);

const GROUP_BY_LEVEL = Object.freeze({ yellow: 'notice', orange: 'secondary', red: 'confirm' });

export function groupIdForCandidate(candidate) {
  const evaluation = candidate?.evaluation;
  if (!evaluation || evaluation.canSelect === false || evaluation.level === 'gray') return 'blocked';
  const mapped = GROUP_BY_LEVEL[evaluation.level];
  if (mapped) return mapped;
  return (evaluation.meta?.recommendationScore || 0) > 0 ? 'recommended' : 'available';
}

/**
 * Monatslast als kompakte Kennzahl.
 *
 * Die Zahl steht ohne den bereits geöffneten Tag; sie beantwortet damit
 * „wie viel trägt diese Person diesen Monat sonst schon?“.
 */
export function loadSummary(candidate) {
  const meta = candidate?.evaluation?.meta || {};
  const role = candidate?.role === 'hg' ? 'hg' : 'bd';
  const count = Number(role === 'hg' ? meta.currentHg : meta.currentBd) || 0;
  const target = role === 'bd' ? Number(candidate?.person?.bdTarget) || 0 : 0;
  const text = target > 0 ? `${count}/${target}` : String(count);
  return {
    role,
    count,
    target,
    text,
    ratio: target > 0 ? count / target : null,
    exceeded: target > 0 && count >= target,
    title: target > 0
      ? `${role.toUpperCase()} im Monat: ${count} von ${target} (ohne diesen Tag)`
      : `${role.toUpperCase()} im Monat: ${count} (ohne diesen Tag)`
  };
}

const CANDIDATE_ORDER = (first, second) => {
  const score = (second.evaluation.meta?.recommendationScore || 0) - (first.evaluation.meta?.recommendationScore || 0);
  if (score) return score;
  const load = loadSummary(first).count - loadSummary(second).count;
  if (load) return load;
  const history = (first.evaluation.meta?.historicalServices || 0) - (second.evaluation.meta?.historicalServices || 0);
  if (history) return history;
  return String(first.person?.name || '').localeCompare(String(second.person?.name || ''), 'de');
};

/**
 * Baut die gruppierte, sortierte Auswahl. Leere Gruppen entfallen.
 */
export function buildPickerModel(candidates) {
  const byGroup = new Map(PICKER_GROUPS.map(group => [group.id, []]));
  for (const candidate of candidates) byGroup.get(groupIdForCandidate(candidate)).push(candidate);
  return PICKER_GROUPS
    .map(group => ({ ...group, entries: byGroup.get(group.id).slice().sort(CANDIDATE_ORDER) }))
    .filter(group => group.entries.length > 0);
}

const FOLD = Object.freeze({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', ê: 'e', á: 'a', à: 'a', í: 'i', ó: 'o', ú: 'u', ç: 'c' });

export function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[äöüßéèêáàíóúç]/g, character => FOLD[character])
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tippfilter: Jeder eingegebene Begriff muss in Name, Kurzname oder
 * Funktionsbezeichnung vorkommen. „dr ma“ findet damit „Dr. Martin“.
 */
export function candidateMatchesQuery(candidate, query) {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearchText([
    candidate?.person?.name,
    candidate?.person?.short,
    candidate?.person?.roleLabel
  ].filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
}

export function filterPickerModel(model, query) {
  if (!normalizeSearchText(query)) return model;
  return model
    .map(group => ({ ...group, entries: group.entries.filter(entry => candidateMatchesQuery(entry, query)) }))
    .filter(group => group.entries.length > 0);
}

export function flattenPickerModel(model) {
  return model.flatMap(group => group.entries);
}

/**
 * Die wichtigste Begründung steht in der Zeile, alle weiteren im Detailbereich.
 * `evaluateCandidate` liefert die Begründungen bereits in fachlicher
 * Reihenfolge, deshalb genügt die erste.
 */
export function primaryReason(candidate) {
  return candidate?.evaluation?.reasons?.[0] || '';
}

export function additionalReasons(candidate) {
  return (candidate?.evaluation?.reasons || []).slice(1);
}

/**
 * Nächster wählbarer Eintrag für die Pfeiltasten. Gesperrte Personen werden
 * übersprungen, die Auswahl läuft an den Enden um.
 */
export function nextSelectableIndex(entries, currentIndex, delta) {
  const selectable = entries
    .map((entry, index) => ({ entry, index }))
    .filter(item => item.entry.evaluation?.canSelect !== false)
    .map(item => item.index);
  if (!selectable.length) return -1;
  if (currentIndex < 0) return delta >= 0 ? selectable[0] : selectable[selectable.length - 1];
  const position = selectable.indexOf(currentIndex);
  if (position === -1) {
    const ahead = selectable.find(index => index > currentIndex);
    if (delta >= 0) return ahead ?? selectable[0];
    const behind = [...selectable].reverse().find(index => index < currentIndex);
    return behind ?? selectable[selectable.length - 1];
  }
  const next = (position + delta + selectable.length) % selectable.length;
  return selectable[next];
}
