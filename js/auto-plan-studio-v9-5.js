/**
 * Auto-Plan Studio v9.5 – korrekte Nachweissemantik, vollständige Erklärungen,
 * feste Modalgeometrie und hochauflösende Algorithmusvisualisierung.
 *
 * Diese additive Schicht wird nach dem v9-Studio geladen. Sie ersetzt keine
 * funktionierenden DOM-Verträge, sondern korrigiert Beschriftungen, ergänzt die
 * neuen v9.5-Parameter, erweitert die Ergebnisdarstellung und versieht jedes
 * bedienbare oder erklärungsbedürftige Element mit einem Rich Tooltip.
 */

import { AUTO_PLAN_STAGES, AUTO_PLAN_ENGINE_ID } from './auto-planner.js?v=20260805.1';
import { state } from './state.js?v=20260803.4';
import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';

const RELEASE = '20260805.1';
const STORAGE_KEY = 'dienstplanrad:autoplan-v9-5-studio';
const LEGACY_STORAGE_KEY = 'dienstplanrad:autoplan-v9-studio';

const V95_TOOLTIPS = Object.freeze({
  autoPlanV9SolverBackend: 'Lösungsweg: Automatisch nutzt das korrekte Boolean-CP-SAT-Modell der v9.5 und fällt kontrolliert auf die bewährte v8.5-Heuristik zurück. Der Heuristikmodus verzichtet vollständig auf WebAssembly.',
  autoPlanV9Exactness: 'Nachweisart: Strikt bezeichnet nur dann einen Modellnachweis, wenn jede ausgeführte lexikografische Zielphase OPTIMAL ist und der vollständige Regelengine-Audit bestanden wurde. FEASIBLE bleibt ausdrücklich „bester gefundener Stand“.',
  autoPlanV9TimeBudget: 'Gesamtzeit für die lexikografische CP-SAT-Suche. Nicht verbrauchte Zeit einer Phase wird den folgenden Phasen zur Verfügung gestellt. Die nachgelagerte LNS besitzt ein separat abgeleitetes Teilbudget.',
  autoPlanV9Workers: 'Maximale Solverthreads. Automatisch reserviert mindestens einen Prozessorkern für Oberfläche und Browser. Ohne Cross-Origin-Isolation wird sicher auf einen Thread begrenzt.',
  autoPlanV9WarmStart: 'Der v8.5-Vorschlag wird als Lösungshinweis an CP-SAT übergeben. Ein Hinweis beschleunigt die Suche, schränkt den zulässigen Lösungsraum jedoch nicht ein.',
  autoPlanV9Fairness: 'Fairness wird in v9.5 mit echten personenbezogenen Dienstindikatoren berechnet. Primär wird die größte BD-Sollabweichung minimiert, anschließend die Gesamtabweichung und die Spannweite der kombinierten beziehungsweise Wochenendbelastung.',
  autoPlanV9Determinism: 'Deterministisch leitet alle Seeds aus Monatszustand und Konfiguration ab. Damit werden identische Eingaben reproduzierbar; parallele Solver können trotz identischem Seed implementationsbedingt unterschiedliche gleichwertige Optima finden.',
  autoPlanV9Infeasibility: 'Bei nachgewiesener Unzulässigkeit wird eine Konfliktkern-Annäherung erstellt. Sie benennt Regelgruppen und konkrete Constraints, behauptet aber nur dann Minimalität, wenn dies technisch tatsächlich bewiesen wurde.',
  autoPlanV9RepairOnEdit: 'Merkt vor, dass nach einer manuellen Planänderung bevorzugt eine begrenzte Nachbarschaft statt des ganzen Monats neu verbunden wird. Harte Regeln und Schlussaudit bleiben vollständig aktiv.',
  autoPlanV9Explanation: 'Steuert die Detailtiefe der lokalen, regelbasierten Erklärungen. v9.5 verwendet keine kostenpflichtige oder externe KI-Erklärung; alle Begründungen stammen aus Regel- und Solvertelemetrie.',
  autoPlanV95LnsRounds: 'Anzahl der constraint-gesteuerten Large-Neighborhood-Search-Runden. Jede Runde fixiert den Großteil des Plans und löst einen konflikt-, belastungs- oder wochenendbezogenen Ausschnitt exakt neu.',
  autoPlanV95Neighborhood: 'Typischer Anteil der Dienstfelder, die in einer diversifizierenden LNS-Runde freigegeben werden. Kleinere Nachbarschaften sind schneller, größere können weiter entfernte Verbesserungen erreichen.',
  autoPlanV95Alternatives: 'Anzahl der angezeigten Vorschläge einschließlich Hauptvorschlag. Zusätzliche Varianten priorisieren Wünsche, Wochenenden oder Belastung, ohne die Sicherheitsziele zu umgehen.',
  autoPlanV95SplitWeekendWeight: 'Strafstärke für dieselbe Person mit BD am Freitag und erneut am Sonntag bei freiem Samstag. Die Kombination bleibt technisch möglich, wird aber gegenüber zusammenhängenderen Wochenendmustern möglichst vermieden.',
  autoPlanV95LogSearch: 'Erweiterte Solversuche schreibt zusätzliche technische Suchinformationen. Nur zur Diagnose aktivieren; die fachliche Ergebnisbewertung ändert sich nicht.',
  autoPlanStartBtn: 'Startet einen vollständig isolierten Planungslauf. Der Monatsplan wird erst nach Ergebnisprüfung und ausdrücklicher Übernahme verändert.',
  autoPlanApplyBtn: 'Auditiert den Vorschlag erneut gegen den aktuellen Monatszustand und übernimmt ihn atomar. Bei zwischenzeitlichen Änderungen wird die Übernahme blockiert.',
  autoPlanCancelBtn: 'Bricht den laufenden Worker ab oder schließt das Studio. Nicht übernommene Vorschläge werden verworfen, der Monatsplan bleibt unverändert.',
  autoPlanLimitReset: 'Stellt die empfohlenen personengebundenen Laufgrenzen wieder her. Bestehende Dienste werden niemals durch eine niedrigere Grenze ungültig gemacht.',
  autoPlanLimitClear: 'Entfernt ausschließlich zusätzliche Laufgrenzen des Studios. Qualifikation, Aktivität, Fixpunkte und im Personalstamm definierte Maxima bleiben wirksam.',
  autoPlanProgressMeter: 'Gesamtfortschritt über Warmstart, Boolean-Modellbau, lexikografische Suche, LNS, Regelengine-Audit, Alternativen und Nachweis.',
  autoPlanPhaseList: 'Phasenübersicht der v9.5. Die Hervorhebung folgt ausschließlich tatsächlich gemeldeten Fortschrittsereignissen.',
  autoPlanProposalTable: 'Vorschlag in derselben Tagesstruktur wie der Dienstplan. BD und HG eines Tages stehen gemeinsam in einer Zeile; Regelgründe bleiben pro Zelle einsehbar.',
  autoPlanLoadTable: 'Vergleicht Dienste, Sollwerte, Gesamt- und Wochenendbelastung vor und nach dem Vorschlag für jede planbare Person.',
  autoPlanValidation: 'Zeigt Konfigurations-, Fixpunkt- oder Grenzfehler vor dem Start. Ein blockierender Eintrag muss behoben werden, bevor die Suche beginnt.'
});

const GENERIC_CLASS_TOOLTIPS = Object.freeze({
  '.auto-plan-visual': 'Live-Visualisierung der realen Suchphasen. Knoten repräsentieren Dienstfelder, Verbindungen gekoppelte oder gemeinsam neu gelöste Nachbarschaften.',
  '.auto-plan-log': 'Algorithmus-Kommentar mit echten Fortschrittsereignissen. Das Fenster besitzt eine feste Höhe und scrollt intern, damit das Studio-Modal unverändert groß bleibt.',
  '.auto-plan-live-metrics': 'Aktuelle Messwerte des laufenden Suchschritts, etwa Kandidaten, Varianten, Sackgassen, LNS-Nachbarschaften und Verbesserungen.',
  '.auto-plan-truth-strip': 'Zusammenfassung tatsächlich beobachteter Laufwerte. Es werden keine geschätzten oder animierten Scheinkennzahlen angezeigt.',
  '.auto-plan-scorecard': 'Kompakte Ergebniskennzahlen zu Regelstatus, Fairness, Wünschen, Änderungen und Nachweis.',
  '.auto-plan-search-metrics': 'Technische Telemetrie des Warmstarts, der exakten Suche, LNS und Schlussprüfung.',
  '.auto-plan-run-config': 'Effektive normalisierte Konfiguration dieses Laufs. Diese Werte gehören zum Ergebnisfingerprint.',
  '.auto-plan-confirm-note': 'Übernahmestatus und gegebenenfalls notwendige Bestätigung für rote, technisch wählbare Ausnahmen.',
  '.auto-plan-red-item': 'Konkrete bestätigungspflichtige Regelabweichung mit Datum, Rolle, Person und fachlichen Gründen.',
  '.auto-plan-row-review': 'Vollständige Regelprüfung der betreffenden Tageszeile.',
  '.auto-plan-v9-run-strip': 'Live-Status des Boolean-Modellbaus, der CP-SAT-Zielphasen und der constraint-gesteuerten LNS.',
  '.auto-plan-v95-proof': 'Nachweisübersicht. „Modelloptimal“ gilt nur für das korrekte Boolean-Modell und nur nach optimalen Ergebnissen aller Zielphasen plus bestandenem Regelengine-Audit.',
  '.auto-plan-v95-alternatives': 'Weitere regelgeprüfte Schwerpunktvarianten. Die angezeigten Deltas beziehen sich auf den Hauptvorschlag.'
});

function byId(id) {
  return document.getElementById(id);
}

function readJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ }
}

function settingsSnapshot() {
  return { ...readJson(LEGACY_STORAGE_KEY), ...readJson(STORAGE_KEY) };
}

function normalNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}

function applySettingsToState() {
  const saved = settingsSnapshot();
  const target = (state.settings ||= {}).autoPlan ||= {};
  Object.assign(target, {
    solverBackend: saved.solverBackend || target.solverBackend || 'auto',
    cpSatTimeBudgetSeconds: normalNumber(saved.cpSatTimeBudgetSeconds ?? target.cpSatTimeBudgetSeconds, 12, 1, 60),
    cpSatWorkers: saved.cpSatWorkers === null || saved.cpSatWorkers === '' || saved.cpSatWorkers === undefined
      ? null
      : normalNumber(saved.cpSatWorkers, 1, 1, 8),
    cpSatWarmStart: saved.cpSatWarmStart === 'none' ? 'none' : 'heuristic',
    fairnessProfile: saved.fairnessProfile || target.fairnessProfile || 'leximin',
    deterministic: saved.deterministic !== false,
    infeasibilityMode: saved.infeasibilityMode || target.infeasibilityMode || 'mus',
    repairOnEdit: saved.repairOnEdit !== false,
    explanationDepth: saved.explanationDepth === 'short' ? 'short' : 'detailed',
    v95Exactness: saved.v95Exactness || saved.exactness || target.v95Exactness || 'strict',
    v95LnsRounds: normalNumber(saved.v95LnsRounds ?? target.v95LnsRounds, 6, 0, 20),
    v95NeighborhoodPercent: normalNumber(saved.v95NeighborhoodPercent ?? target.v95NeighborhoodPercent, 28, 10, 60),
    v95AlternativeCount: normalNumber(saved.v95AlternativeCount ?? target.v95AlternativeCount, 3, 1, 4),
    v95SplitWeekendWeight: normalNumber(saved.v95SplitWeekendWeight ?? target.v95SplitWeekendWeight, 8, 1, 30),
    v95LogSearch: saved.v95LogSearch === true
  });
  return target;
}

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v95-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9-5.css?v=${RELEASE}`;
  link.dataset.autoPlanV95Style = 'true';
  document.head.append(link);
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function option(select, value, label) {
  const item = select?.querySelector(`option[value="${value}"]`);
  if (item) setText(item, label);
}

function correctLegacyControls(dialog) {
  const backend = dialog.querySelector('#autoPlanV9SolverBackend');
  option(backend, 'auto', 'Automatisch · Boolean CP-SAT v9.5');
  option(backend, 'cp-sat-exact', 'Boolean CP-SAT · Modellnachweis');
  option(backend, 'cp-sat-lns', 'Boolean CP-SAT + Constraint-LNS');
  option(backend, 'heuristic-alns', 'Heuristik v8.5 · ohne WASM');

  const exactness = dialog.querySelector('#autoPlanV9Exactness');
  option(exactness, 'strict', 'Strikter Modellnachweis');
  option(exactness, 'any', 'Bester gefundener Stand genügt');

  const infeasibility = dialog.querySelector('#autoPlanV9Infeasibility');
  option(infeasibility, 'mus', 'Konfliktkern-Annäherung');
  option(infeasibility, 'relax', 'Diagnose + bestätigbare Ausnahmen');
  option(infeasibility, 'report', 'Nur Unzulässigkeit melden');
  const infeasibilityField = infeasibility?.closest('label');
  setText(infeasibilityField?.querySelector('small'), 'Regelgruppen und konkrete Konflikt-Constraints werden nachvollziehbar benannt');

  const explanation = dialog.querySelector('#autoPlanV9Explanation');
  explanation?.querySelector('option[value="llm"]')?.remove();
  option(explanation, 'short', 'Kurz · lokal');
  option(explanation, 'detailed', 'Ausführlich · lokal');
  if (explanation?.value === 'llm') explanation.value = 'detailed';
  const explanationField = explanation?.closest('label');
  setText(explanationField?.querySelector('small'), 'Alle Erklärungen stammen lokal aus Regel- und Solvertelemetrie');

  const budgetField = dialog.querySelector('#autoPlanV9TimeBudget')?.closest('label');
  setText(budgetField?.querySelector('span'), 'Exaktes Gesamtbudget');
  setText(budgetField?.querySelector('small'), 'Phasen nutzen das verbleibende Budget dynamisch');
}

function rangeField({ id, outputId, label, min, max, value, suffix, description }) {
  return `<label class="auto-plan-field auto-plan-field--v95" data-v95-field="${id}">
    <span>${label}</span>
    <div class="auto-plan-range">
      <input id="${id}" type="range" min="${min}" max="${max}" step="1" value="${value}">
      <output id="${outputId}" for="${id}">${value}${suffix}</output>
    </div>
    <small>${description}</small>
  </label>`;
}

function installV95Controls(dialog) {
  if (dialog.querySelector('#autoPlanV95LnsRounds')) return;
  const grid = dialog.querySelector('.auto-plan-field-grid');
  if (!grid) return;
  const target = applySettingsToState();
  const template = document.createElement('template');
  template.innerHTML = `${rangeField({
    id: 'autoPlanV95LnsRounds', outputId: 'autoPlanV95LnsRoundsOut', label: 'Constraint-LNS-Runden',
    min: 0, max: 20, value: target.v95LnsRounds, suffix: '',
    description: 'Gezielte exakte Neuverbindung schwieriger Teilbereiche'
  })}${rangeField({
    id: 'autoPlanV95Neighborhood', outputId: 'autoPlanV95NeighborhoodOut', label: 'LNS-Nachbarschaft',
    min: 10, max: 60, value: target.v95NeighborhoodPercent, suffix: ' %',
    description: 'Freigegebener Anteil bei diversifizierenden Runden'
  })}
    <label class="auto-plan-field auto-plan-field--v95" data-v95-field="autoPlanV95Alternatives">
      <span>Vorschlagsvarianten</span>
      <select id="autoPlanV95Alternatives">
        <option value="1">1 · Hauptvorschlag</option>
        <option value="2">2 · plus eine Alternative</option>
        <option value="3">3 · empfohlen</option>
        <option value="4">4 · vollständiges Portfolio</option>
      </select>
      <small>Ausgewogen, Wünsche, Wochenenden und Belastung</small>
    </label>
    ${rangeField({
      id: 'autoPlanV95SplitWeekendWeight', outputId: 'autoPlanV95SplitWeekendWeightOut', label: 'Split-Wochenende vermeiden',
      min: 1, max: 30, value: target.v95SplitWeekendWeight, suffix: '',
      description: 'Freitag-BD · Samstag frei · Sonntag-BD derselben Person'
    })}
    <label class="auto-plan-field auto-plan-field--v95" data-v95-field="autoPlanV95LogSearch">
      <span>Solverdiagnostik</span>
      <select id="autoPlanV95LogSearch">
        <option value="off">Normal</option>
        <option value="on">Erweitertes Suchprotokoll</option>
      </select>
      <small>Technische Detailausgabe ohne Änderung der Zielordnung</small>
    </label>`;
  grid.append(template.content);

  dialog.querySelector('#autoPlanV95Alternatives').value = String(target.v95AlternativeCount);
  dialog.querySelector('#autoPlanV95LogSearch').value = target.v95LogSearch ? 'on' : 'off';

  const syncOutput = (inputId, outputId, suffix = '') => {
    const input = dialog.querySelector(`#${inputId}`);
    const output = dialog.querySelector(`#${outputId}`);
    const update = () => setText(output, `${input.value}${suffix}`);
    input?.addEventListener('input', update);
    update();
  };
  syncOutput('autoPlanV95LnsRounds', 'autoPlanV95LnsRoundsOut');
  syncOutput('autoPlanV95Neighborhood', 'autoPlanV95NeighborhoodOut', ' %');
  syncOutput('autoPlanV95SplitWeekendWeight', 'autoPlanV95SplitWeekendWeightOut');

  grid.addEventListener('change', event => {
    if (!event.target?.id?.startsWith('autoPlanV95') && !event.target?.id?.startsWith('autoPlanV9')) return;
    persistControls(dialog);
  });
  grid.addEventListener('input', event => {
    if (event.target?.id?.startsWith('autoPlanV95')) persistControls(dialog);
  });
}

function persistControls(dialog) {
  const previous = settingsSnapshot();
  const exactness = dialog.querySelector('#autoPlanV9Exactness')?.value || previous.v95Exactness || 'strict';
  const value = {
    ...previous,
    solverBackend: dialog.querySelector('#autoPlanV9SolverBackend')?.value || 'auto',
    v95Exactness: exactness === 'any' ? 'any' : 'strict',
    exactness: exactness === 'any' ? 'any' : 'strict',
    cpSatTimeBudgetSeconds: normalNumber(dialog.querySelector('#autoPlanV9TimeBudget')?.value, 12, 1, 60),
    cpSatWorkers: dialog.querySelector('#autoPlanV9Workers')?.value
      ? normalNumber(dialog.querySelector('#autoPlanV9Workers').value, 1, 1, 8)
      : null,
    cpSatWarmStart: dialog.querySelector('#autoPlanV9WarmStart')?.value === 'none' ? 'none' : 'heuristic',
    fairnessProfile: dialog.querySelector('#autoPlanV9Fairness')?.value || 'leximin',
    deterministic: dialog.querySelector('#autoPlanV9Determinism')?.value !== 'variable',
    infeasibilityMode: dialog.querySelector('#autoPlanV9Infeasibility')?.value || 'mus',
    repairOnEdit: dialog.querySelector('#autoPlanV9RepairOnEdit')?.value !== 'off',
    explanationDepth: dialog.querySelector('#autoPlanV9Explanation')?.value === 'short' ? 'short' : 'detailed',
    v95LnsRounds: normalNumber(dialog.querySelector('#autoPlanV95LnsRounds')?.value, 6, 0, 20),
    v95NeighborhoodPercent: normalNumber(dialog.querySelector('#autoPlanV95Neighborhood')?.value, 28, 10, 60),
    v95AlternativeCount: normalNumber(dialog.querySelector('#autoPlanV95Alternatives')?.value, 3, 1, 4),
    v95SplitWeekendWeight: normalNumber(dialog.querySelector('#autoPlanV95SplitWeekendWeight')?.value, 8, 1, 30),
    v95LogSearch: dialog.querySelector('#autoPlanV95LogSearch')?.value === 'on'
  };
  writeJson(STORAGE_KEY, value);
  applySettingsToState();
}

function upgradeIdentity(dialog) {
  dialog.dataset.algorithmRevision = '9.5';
  dialog.dataset.engineRevision = '9.5';
  dialog.dataset.v95Layout = '1';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, #autoPlanV75Ribbon, #autoPlanV7Ribbon, .auto-plan-v85-ribbon');
  if (ribbon) {
    ribbon.classList.add('auto-plan-v95-ribbon');
    setText(ribbon.querySelector('b'), 'Correct Boolean Matheuristic · v9.5');
    setText(ribbon.querySelector('small'), 'Boolean-CP-SAT · strikte Lexikografie · Constraint-LNS · vollständiger Regelengine-Audit · ehrlicher Modellnachweis');
    setText(ribbon.querySelector(':scope > strong'), 'ENGINE v9.5');
  }
  setText(dialog.querySelector('.auto-plan-engine-badge span'), 'Constraint Engine v9.5');
  setText(dialog.querySelector('.auto-plan-zero-red-guardrail header > span'), 'Null-Rot-Guardrail · Algorithmus v9.5');
}

function rebuildTheatre(dialog) {
  const list = dialog.querySelector('#autoPlanV85Theatre ol');
  if (!list) return;
  const existing = [...list.querySelectorAll('li')];
  for (let index = existing.length; index < AUTO_PLAN_STAGES.length; index += 1) {
    const item = document.createElement('li');
    item.innerHTML = '<i aria-hidden="true"></i><div><b></b><small></small></div>';
    list.append(item);
  }
  [...list.querySelectorAll('li')].forEach((item, index) => {
    const stage = AUTO_PLAN_STAGES[index];
    item.hidden = !stage;
    if (!stage) return;
    item.dataset.stage = stage.id;
    setText(item.querySelector('b'), stage.title);
    setText(item.querySelector('small'), stage.detail);
    setRichTooltip(item, `${stage.title}: ${stage.detail}`);
  });
}

function inferTooltip(element) {
  const id = element.id;
  if (id && V95_TOOLTIPS[id]) return V95_TOOLTIPS[id];
  const label = element.closest?.('label');
  const heading = label?.querySelector(':scope > span')?.textContent?.trim();
  const detail = label?.querySelector(':scope > small')?.textContent?.trim();
  if (heading && detail) return `${heading}: ${detail}`;
  if (heading) return heading;
  if (element.matches('th')) return `Tabellenspalte ${element.textContent.trim()}.`;
  if (element.matches('output')) return `Aktueller Wert für ${heading || element.getAttribute('for') || 'diese Einstellung'}.`;
  if (element.matches('summary')) return `${element.textContent.trim()}. Mit Enter oder Leertaste ein- und ausklappen.`;
  const accessible = element.getAttribute('aria-label') || element.textContent?.trim();
  if (accessible && accessible.length <= 160) return accessible;
  return '';
}

function installExhaustiveTooltips(dialog) {
  for (const [selector, text] of Object.entries(GENERIC_CLASS_TOOLTIPS)) {
    dialog.querySelectorAll(selector).forEach(element => setRichTooltip(element, text));
  }
  const selector = [
    'button', 'input', 'select', 'textarea', 'output', 'summary',
    '[role="button"]', '[role="status"]', '[role="progressbar"]',
    'th', '.auto-plan-row-status', '.auto-plan-source-pill',
    '.auto-plan-v9-status', '.auto-plan-v95-status', '.auto-plan-phase-list li',
    '.auto-plan-live-metrics > div', '.auto-plan-search-metrics > div',
    '.auto-plan-scorecard > *', '.auto-plan-assignment-cell'
  ].join(',');
  dialog.querySelectorAll(selector).forEach(element => {
    if (element.dataset.tooltip) return;
    const text = inferTooltip(element);
    if (text) setRichTooltip(element, text);
  });
  for (const [id, text] of Object.entries(V95_TOOLTIPS)) {
    const element = dialog.querySelector(`#${id}`);
    if (element) setRichTooltip(element, text);
  }
}

function ensureV95ResultPanel(dialog) {
  let panel = dialog.querySelector('#autoPlanV95Result');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'autoPlanV95Result';
  panel.className = 'auto-plan-card auto-plan-panel auto-plan-v95-result';
  panel.hidden = true;
  const legacy = dialog.querySelector('#autoPlanV9Result');
  if (legacy) legacy.after(panel);
  else (dialog.querySelector('#autoPlanResult') || dialog.querySelector('.auto-plan-body'))?.append(panel);
  return panel;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusLabel(certification, cpSat) {
  const status = certification?.status || '';
  if (status === 'MODEL_OPTIMAL_AUDITED') return { text: 'Modelloptimal · auditiert', tone: 'optimal' };
  if (status === 'BEST_FOUND_FEASIBLE') return { text: 'Bester gefundener Stand', tone: 'feasible' };
  if (status === 'HEURISTIC_WON_RULE_OBJECTIVE') return { text: 'Heuristik gewinnt Audit', tone: 'feasible' };
  if (status === 'SOLVER_UNAVAILABLE_FALLBACK') return { text: 'Heuristik-Fallback', tone: 'unavailable' };
  if (status === 'MODEL_OPTIMAL_AUDIT_NOT_CLEAN') return { text: 'Modelloptimal · Audit offen', tone: 'warning' };
  if (String(cpSat?.status).toUpperCase() === 'INFEASIBLE') return { text: 'Unzulässig', tone: 'infeasible' };
  return { text: status || cpSat?.status || 'Regelgeprüfter Stand', tone: 'feasible' };
}

function formatNumber(value, digits = 0) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
}

function renderTrace(trace) {
  if (!Array.isArray(trace) || !trace.length) return '';
  return `<ol class="auto-plan-v95-trace" aria-label="Lexikografische Zielphasen">${trace.map((entry, index) => {
    const proven = entry.proven === true;
    return `<li class="${proven ? 'is-proven' : 'is-open'}">
      <span><i>${index + 1}</i>${escapeHtml(entry.label || entry.componentId || 'Zulässigkeit')}</span>
      <b>${escapeHtml(entry.status || 'UNKNOWN')}</b>
      <small>Ziel ${formatNumber(entry.objectiveValue)} · Schranke ${formatNumber(entry.bestBound)} · Lücke ${formatNumber(entry.gap)} · ${formatNumber(entry.wallTimeMs)} ms</small>
    </li>`;
  }).join('')}</ol>`;
}

function renderConflictCore(cpSat) {
  const core = cpSat?.conflictCore;
  if (!core?.infeasible) return '';
  const groups = Array.isArray(core.groups) && core.groups.length
    ? `<ul>${core.groups.map(group => `<li>${escapeHtml(group)}</li>`).join('')}</ul>`
    : '';
  const constraints = Array.isArray(core.constraints) && core.constraints.length
    ? `<details><summary>Konkrete Constraints (${core.constraints.length})</summary><ul>${core.constraints.slice(0, 30).map(item => `<li><code>${escapeHtml(item.id)}</code> · ${escapeHtml(item.detail || '')}</li>`).join('')}</ul></details>`
    : '';
  return `<div class="auto-plan-v95-conflict"><span>Konfliktkern-${core.exact ? 'Nachweis' : 'Annäherung'}</span><p>${escapeHtml(core.detail || '')}</p>${groups}${constraints}</div>`;
}

function renderLns(lns) {
  if (!lns) return '';
  const rounds = Array.isArray(lns.rounds) ? lns.rounds : [];
  return `<div class="auto-plan-v95-lns">
    <header><span>Constraint-LNS</span><b>${formatNumber(lns.improvements)} Verbesserungen · ${rounds.length} Runden</b></header>
    ${rounds.length ? `<div class="auto-plan-v95-lns-track" aria-label="LNS-Runden">${rounds.map(round => `<i class="${round.improved ? 'is-improved' : ''}" data-tooltip="Runde ${round.round}: ${round.relaxedSlots} Felder · ${round.status}${round.improved ? ' · verbessert' : ''}"></i>`).join('')}</div>` : ''}
  </div>`;
}

function renderAlternatives(result) {
  const alternatives = Array.isArray(result?.alternatives) ? result.alternatives : [];
  if (!alternatives.length) return '';
  return `<section class="auto-plan-v95-alternatives">
    <header><span>Regelgeprüfte Alternativen</span><small>Unterschiedliche Schwerpunktreihenfolgen bei unveränderter Sicherheitsordnung</small></header>
    <div class="auto-plan-v95-alternative-grid">${alternatives.map(alternative => `<article data-alternative-id="${escapeHtml(alternative.id)}">
      <div><b>${escapeHtml(alternative.label)}</b><span>${escapeHtml(alternative.status)}${alternative.certified ? ' · Modellnachweis' : ''}</span></div>
      <dl>
        <div><dt>Fairness</dt><dd>${formatNumber(alternative.metrics?.fairnessIndex)} %</dd></div>
        <div><dt>Wünsche</dt><dd>${formatNumber(alternative.metrics?.wishesFulfilled)}/${formatNumber(alternative.metrics?.wishesPossible)}</dd></div>
        <div><dt>Wochenendvarianz</dt><dd>${formatNumber(alternative.metrics?.weekendVariance, 3)}</dd></div>
        <div><dt>Hinweise</dt><dd>${formatNumber(alternative.metrics?.red)} rot · ${formatNumber(alternative.metrics?.orange)} orange · ${formatNumber(alternative.metrics?.yellow)} gelb</dd></div>
      </dl>
    </article>`).join('')}</div>
  </section>`;
}

function renderV95Result(dialog, result) {
  const panel = ensureV95ResultPanel(dialog);
  const legacy = dialog.querySelector('#autoPlanV9Result');
  if (legacy) legacy.hidden = true;
  if (!result?.metrics || result.metrics.engine !== AUTO_PLAN_ENGINE_ID) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const cpSat = result.metrics.cpSat || {};
  const certification = result.metrics.certification || result.certification || {};
  const badge = statusLabel(certification, cpSat);
  const model = cpSat.model || {};
  const loader = cpSat.loadedFrom
    ? `${cpSat.loadedFrom.id} ${cpSat.loadedFrom.version || ''} · ${cpSat.loadedFrom.source}`
    : 'Heuristik ohne Solver';
  panel.innerHTML = `<div class="auto-plan-section-title auto-plan-v95-proof">
      <span>Engine v9.5 · Boolean-Modell und Nachweis</span>
      <b class="auto-plan-v95-status ${badge.tone}" role="status">${escapeHtml(badge.text)}</b>
    </div>
    <div class="auto-plan-v95-result-grid">
      <div><span>Gewählter Pfad</span><b>${escapeHtml(certification.source || (result.metrics.cpSatUsed ? 'Boolean CP-SAT' : 'v8.5-Heuristik'))}</b></div>
      <div><span>Phasennachweis</span><b>${certification.allPhasesOptimal ? 'alle optimal' : 'nicht vollständig'}</b></div>
      <div><span>Regelengine-Audit</span><b>${certification.auditPassed ? 'bestanden' : 'nicht sauber'}</b></div>
      <div><span>Solverbindung</span><b>${escapeHtml(loader)}</b></div>
      <div><span>Boolean-Variablen</span><b>${formatNumber(model.assignmentVariables)}</b></div>
      <div><span>Hilfsvariablen</span><b>${formatNumber(model.auxiliaryVariables)}</b></div>
      <div><span>Constraints</span><b>${formatNumber(model.constraints)}</b></div>
      <div><span>Solverzeit</span><b>${formatNumber(cpSat.wallTimeMs)} ms</b></div>
    </div>
    ${renderTrace(cpSat.trace)}
    ${renderLns(result.metrics.lns)}
    ${renderConflictCore(cpSat)}
    ${renderAlternatives(result)}`;

  const tooltip = certification.proven
    ? 'Modelloptimal und regelgeprüft: Jede ausgeführte Zielphase war OPTIMAL, alle früheren Optimalwerte wurden fixiert und der vollständige Regelengine-Audit bestand. Der Nachweis gilt für das v9.5-Boolean-Modell.'
    : badge.tone === 'feasible'
      ? 'Verwendbarer regelgeprüfter Vorschlag ohne vollständigen Optimalitätsnachweis. Ein Zeitlimit oder die produktive Zielordnung verhinderte eine stärkere Aussage.'
      : badge.tone === 'unavailable'
        ? 'Der WASM-Solver war nicht verfügbar oder bewusst deaktiviert. Die vollständige v8.5-Heuristik lieferte den Vorschlag.'
        : 'Der Solverstatus erfordert Prüfung der ausgewiesenen Konflikte oder des Schlussaudits.';
  setRichTooltip(panel.querySelector('.auto-plan-v95-status'), tooltip);
  installExhaustiveTooltips(dialog);
}

function stageId(update) {
  const phase = String(update?.phase || '');
  const stage = String(update?.stage || '');
  if (phase === 'analysis') return 'analysis';
  if (phase === 'model' || stage.includes('boolean')) return 'model';
  if (phase === 'exact' || stage.includes('cp-sat-v9.5')) return 'exact';
  if (phase === 'perfect' && stage.includes('lns')) return 'lns';
  if (phase === 'audit') return 'audit';
  if (phase === 'alternatives') return 'alternatives';
  if (phase === 'certify' || phase === 'complete') return 'certify';
  if (phase === 'search' || phase === 'construct' || stage.includes('heuristik')) return 'warmstart';
  return phase || 'analysis';
}

function updateAnimation(dialog, update) {
  const current = stageId(update);
  dialog.dataset.v95Stage = current;
  dialog.style.setProperty('--v95-progress', String(Math.max(0, Math.min(1, Number(update?.progress || 0)))));
  const visual = dialog.querySelector('.auto-plan-visual');
  if (visual) {
    visual.dataset.v95Stage = current;
    visual.dataset.v95Pulse = String(Date.now());
  }
  dialog.querySelectorAll('.auto-plan-phase-list li, #autoPlanV85Theatre li').forEach(item => {
    item.classList.toggle('is-v95-active', item.dataset.stage === current);
  });
  const strip = dialog.querySelector('#autoPlanV9RunStrip');
  if (strip) {
    strip.hidden = ['certify', 'complete', 'blocked'].includes(String(update?.phase || ''));
    strip.dataset.v95Stage = current;
    const status = strip.querySelector('#autoPlanV9RunStripStatus');
    const detail = strip.querySelector('#autoPlanV9RunStripDetail');
    setText(status, update?.cpSatPhase
      ? `${Number(update.cpSatPhaseIndex || 0) + 1}/${Number(update.cpSatPhaseCount || 0)} · ${update.cpSatPhase}`
      : current === 'lns' && update?.lnsRound
        ? `LNS ${update.lnsRound}/${update.lnsRounds}`
        : current);
    setText(detail, update?.message || '');
  }
}

function ensureFocusVisibility(dialog) {
  dialog.addEventListener('focusin', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const scroller = target.closest('#autoPlanConfig, #autoPlanStage, #autoPlanResult, .auto-plan-log-stream');
    if (!scroller) return;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  });
}

function ensureThemeToggleIsIconOnly() {
  const button = byId('themeModeBtn');
  if (!button) return;
  button.classList.add('tool-action--icon-only-v95');
  button.querySelectorAll('.tool-label:not(.visually-hidden)').forEach(label => label.remove());
  if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', 'Hell-/Dunkelmodus wechseln');
  setRichTooltip(button, button.dataset.tooltip || button.getAttribute('aria-label'));
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.v95Enhanced === 'true') return;
  dialog.dataset.v95Enhanced = 'true';
  upgradeIdentity(dialog);
  correctLegacyControls(dialog);
  installV95Controls(dialog);
  rebuildTheatre(dialog);
  ensureV95ResultPanel(dialog);
  ensureFocusVisibility(dialog);
  installExhaustiveTooltips(dialog);
  ensureThemeToggleIsIconOnly();
  persistControls(dialog);

  byId('autoPlanStartBtn')?.addEventListener('click', () => {
    persistControls(dialog);
    dialog.dataset.v95Stage = 'analysis';
    const panel = dialog.querySelector('#autoPlanV95Result');
    if (panel) panel.hidden = true;
  }, { capture: true });

  const observer = new MutationObserver(records => {
    if (!records.some(record => record.addedNodes.length)) return;
    queueMicrotask(() => installExhaustiveTooltips(dialog));
  });
  observer.observe(dialog, { childList: true, subtree: true });

  window.addEventListener('autoplanprogress', event => updateAnimation(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    const result = event.detail || null;
    queueMicrotask(() => {
      renderV95Result(dialog, result);
      const title = byId('autoPlanResultTitle');
      if (title && result?.metrics?.engine === AUTO_PLAN_ENGINE_ID) {
        setText(title, result?.certified
          ? 'Modelloptimaler, vollständig regelgeprüfter Vorschlag'
          : 'Bester gefundener, vollständig regelgeprüfter Vorschlag');
      }
      dialog.dataset.v95Stage = 'certify';
    });
  });
}

function initialize() {
  addStylesheet();
  applySettingsToState();
  const install = event => {
    const dialog = event?.detail?.dialog || byId('autoPlanDialog');
    if (!dialog) return false;
    // Das v9-Studio wird zuerst synchron auf denselben Ready-Event gesetzt.
    // Ein Microtask stellt sicher, dass v9.5 anschließend Beschriftungen und
    // Ergebnissemantik endgültig korrigiert.
    queueMicrotask(() => enhance(dialog));
    return true;
  };
  if (!install()) window.addEventListener('autoplanstudioready', install, { once: true });
  ensureThemeToggleIsIconOnly();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}

export const AUTO_PLAN_STUDIO_V95_RELEASE = RELEASE;
