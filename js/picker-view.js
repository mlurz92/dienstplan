/**
 * Auswahlmodell für den Dienst-Picker.
 *
 * Die Gruppen bilden zunächst die fachliche Konfliktstufe ab. Innerhalb einer
 * Gruppe wird nicht über einen frei addierten Gesamtscore entschieden, sondern
 * lexikografisch nach einer festen fachlichen Prioritätskaskade:
 *
 * 1. deterministische Kopplung,
 * 2. ausdrücklicher positiver Dienstwunsch,
 * 3. tagesbezogene Option „möglich“,
 * 4. Monats- und Lastenausgleich,
 * 5. Wochenendausgleich,
 * 6. sonstige positive Empfehlung.
 *
 * Der Jahresverlauf bleibt sichtbar, beeinflusst die Reihenfolge jedoch nicht.
 */

export const PICKER_GROUPS = Object.freeze([
  Object.freeze({ id: 'recommended', label: 'Empfohlen', hint: 'Eine fachlich priorisierte Empfehlung spricht dafür' }),
  Object.freeze({ id: 'available', label: 'Möglich', hint: 'Keine relevanten Konflikte' }),
  Object.freeze({ id: 'notice', label: 'Mit Hinweis', hint: 'Wählbar, aber mit Anmerkung' }),
  Object.freeze({ id: 'secondary', label: 'Nachrangig', hint: 'Nur wenn keine bessere Besetzung möglich ist' }),
  Object.freeze({ id: 'confirm', label: 'Bestätigung nötig', hint: 'Roter, organisatorisch überschreibbarer Konflikt' }),
  Object.freeze({ id: 'blocked', label: 'Nicht verfügbar', hint: 'Fachlich oder strukturell nicht überschreibbar' })
]);

const GROUP_BY_LEVEL = Object.freeze({ yellow: 'notice', orange: 'secondary', red: 'confirm' });
const RECOMMENDATION_VECTOR_LENGTH = 6;

function recommendationVector(candidate) {
  const meta = candidate?.evaluation?.meta || {};
  if (Array.isArray(meta.recommendationVector)) {
    return Array.from({ length: RECOMMENDATION_VECTOR_LENGTH }, (_, index) => Number(meta.recommendationVector[index]) || 0);
  }
  // Rückwärtskompatibilität für ältere gespeicherte Tests und Integrationen:
  // ein historischer Einzelscore wird ausschließlich als sonstige Empfehlung
  // behandelt und kann dadurch keine höherrangige Kategorie simulieren.
  return [0, 0, 0, 0, 0, Number(meta.recommendationScore) || 0];
}

function hasRecommendation(candidate) {
  return recommendationVector(candidate).some(value => value > 0);
}

export function groupIdForCandidate(candidate) {
  const evaluation = candidate?.evaluation;
  if (!evaluation || evaluation.canSelect === false || evaluation.level === 'gray') return 'blocked';
  const mapped = GROUP_BY_LEVEL[evaluation.level];
  if (mapped) return mapped;
  return hasRecommendation(candidate) ? 'recommended' : 'available';
}

/**
 * Monatslast als kompakte Kennzahl.
 *
 * Bei BD wird die rollenbezogene Zahl gegen das persönliche Soll gezeigt. Bei
 * HG steht die kombinierte Monatslast im Vordergrund; die Zahl bisheriger HG
 * für Assistenzarzt-BD bleibt als separate Belastungsdimension sichtbar.
 */
export function loadSummary(candidate) {
  const meta = candidate?.evaluation?.meta || {};
  const role = candidate?.role === 'hg' ? 'hg' : 'bd';
  const currentBd = Number(meta.currentBd) || 0;
  const currentHg = Number(meta.currentHg) || 0;
  const combined = Number.isFinite(Number(meta.combinedLoad))
    ? Number(meta.combinedLoad)
    : currentBd + currentHg;
  const aaHg = Number(meta.aaHgCount) || 0;

  if (role === 'hg') {
    return {
      role,
      count: currentHg,
      sortLoad: combined,
      combined,
      aaHg,
      target: 0,
      text: `${currentHg} · Gesamt ${combined}`,
      ratio: null,
      exceeded: false,
      title: `HG im Monat: ${currentHg} · kombinierte Last BD+HG: ${combined} · davon HG für AA-BD: ${aaHg} (ohne diesen Tag)`
    };
  }

  const target = Number(candidate?.person?.bdTarget) || 0;
  return {
    role,
    count: currentBd,
    sortLoad: currentBd,
    combined,
    aaHg,
    target,
    text: target > 0 ? `${currentBd}/${target}` : String(currentBd),
    ratio: target > 0 ? currentBd / target : null,
    exceeded: target > 0 && currentBd >= target,
    title: target > 0
      ? `BD im Monat: ${currentBd} von ${target} (ohne diesen Tag)`
      : `BD im Monat: ${currentBd} (ohne diesen Tag)`
  };
}

function compareRecommendationPriority(first, second) {
  const firstVector = recommendationVector(first);
  const secondVector = recommendationVector(second);
  for (let index = 0; index < RECOMMENDATION_VECTOR_LENGTH; index += 1) {
    const difference = secondVector[index] - firstVector[index];
    if (difference) return difference;
  }
  return 0;
}

const CANDIDATE_ORDER = (first, second) => {
  const recommendation = compareRecommendationPriority(first, second);
  if (recommendation) return recommendation;

  const firstLoad = loadSummary(first);
  const secondLoad = loadSummary(second);
  const loadDifference = firstLoad.sortLoad - secondLoad.sortLoad;
  if (loadDifference) return loadDifference;

  if (firstLoad.role === 'hg' && secondLoad.role === 'hg') {
    const aaHgDifference = firstLoad.aaHg - secondLoad.aaHg;
    if (aaHgDifference) return aaHgDifference;
    const hgDifference = firstLoad.count - secondLoad.count;
    if (hgDifference) return hgDifference;
  }

  // Der Jahresverlauf ist absichtlich kein Sortierkriterium. Bei vollständiger
  // Gleichheit bleibt nur die stabile, nachvollziehbare Namensreihenfolge.
  return String(first.person?.name || '').localeCompare(String(second.person?.name || ''), 'de');
};

/** Baut die gruppierte, sortierte Auswahl. Leere Gruppen entfallen. */
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

/** Die fachlich wichtigste Begründung steht in der kompakten Kandidatenzeile. */
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
