/**
 * Auto-Plan Studio v9 – Solversteuerung, Beweisstatus und erklärbare UI.
 *
 * Die Schicht ist additiv: Fällt sie aus, bleibt das vollständige v8.5-Studio
 * bedienbar. Sie ändert keine fachliche Regel und erzeugt keine zweite
 * Telemetriequelle, sondern visualisiert ausschließlich echte Worker-Ereignisse.
 */

import './auto-plan-studio-v8-5.js?v=20260804.9';
import { AUTO_PLAN_STAGES, V9_SOLVER_STATUSES } from './auto-planner-v9.js?v=20260804.9';
import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260804.9';

const RELEASE = '20260804.9';
const STORAGE_KEY = 'dienstplanrad:auto-plan-v9-studio';
const MODES = Object.freeze({
  fast: {
    label: 'Schnell · v8.5 lokal',
    detail: 'Verwendet das bewährte Beam-/ALNS-Portfolio ohne globale Tiefensuche. Geeignet für sehr schnelle Zwischenvorschläge.'
  },
  hybrid: {
    label: 'Hybrid · empfohlen',
    detail: 'Erzeugt zuerst einen starken v8.5-Incumbent und prüft beziehungsweise verbessert ihn anschließend mit exakter Branch-and-Bound-Suche.'
  },
  exact: {
    label: 'Exakt · maximales Budget',
    detail: 'Reserviert den größten Teil des Zeitrahmens für die verlustfreie globale Suche. Ein Optimum wird nur bei vollständig abgeschlossenem Suchraum ausgewiesen.'
  },
  diagnose: {
    label: 'Diagnose · strikt Null-Rot',
    detail: 'Sperrt den roten Fallback und untersucht ausschließlich strikte Belegungen. UNKNOWN bleibt UNKNOWN und wird nie als Unmöglichkeitsbeweis ausgegeben.'
  }
});
const TARGETS = Object.freeze({
  'first-feasible': {
    label: 'Erste gültige Lösung',
    detail: 'Beendet die exakte Suche nach der ersten zulässigen Lösung. Schnell, aber ohne Optimalitätsnachweis.'
  },
  'high-quality': {
    label: 'Hohe Qualität',
    detail: 'Verwendet den vorhandenen Incumbent und einen ausgewogenen Anteil des Zeitrahmens für weitere exakte Verbesserungen.'
  },
  'best-within-budget': {
    label: 'Bestmöglich im Zeitrahmen',
    detail: 'Durchsucht bis zum Zeit- oder Knotenlimit und behält stets die lexikografisch beste vollständig auditierte Lösung.'
  },
  'prove-optimal': {
    label: 'Optimum beweisen',
    detail: 'Versucht den vollständigen Suchraum abzuschließen. OPTIMAL erscheint ausschließlich nach einem echten globalen Nachweis.'
  }
});

let installed = false;
let latestResult = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v9-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9.css?v=${RELEASE}`;
  link.dataset.autoPlanV9Style = 'true';
  document.head.append(link);
}

function restorePreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      solverMode: MODES[value.solverMode] ? value.solverMode : 'hybrid',
      proofTarget: TARGETS[value.proofTarget] ? value.proofTarget : 'best-within-budget'
    };
  } catch {
    return { solverMode: 'hybrid', proofTarget: 'best-within-budget' };
  }
}

function persistPreferences(dialog) {
  const value = {
    solverMode: dialog.querySelector('#autoPlanV9SolverMode')?.value || 'hybrid',
    proofTarget: dialog.querySelector('#autoPlanV9ProofTarget')?.value || 'best-within-budget'
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Storage ist optional. */ }
  return value;
}

/**
 * Die Basisschicht liest `performanceProfile` in ihren unveränderten
 * Laufvertrag. v9 legt dort einen versionierten, selbstbeschreibenden Wert ab;
 * der Runner behandelt unbekannte Profile defensiv wie „adaptiv“, während die
 * v9-Engine Modus und Nachweisziel verlustfrei ausliest. So bleibt der bestehende
 * Worker-/Inline-Fallback unangetastet.
 */
function bridgeConfig(dialog) {
  const performance = dialog.querySelector('#autoPlanPerformanceProfile');
  if (!performance) return;
  const { solverMode, proofTarget } = persistPreferences(dialog);
  const value = `v9:${solverMode}:${proofTarget}`;
  let option = [...performance.options].find(item => item.value === value);
  if (!option) {
    option = new Option(`v9 · ${MODES[solverMode].label} · ${TARGETS[proofTarget].label}`, value);
    option.hidden = true;
    performance.add(option);
  }
  performance.value = value;
}

function installControls(dialog) {
  if (dialog.querySelector('#autoPlanV9SolverMode')) return;
  const grid = dialog.querySelector('.auto-plan-field-grid');
  if (!grid) return;
  const preferences = restorePreferences();
  const fragment = document.createDocumentFragment();

  const mode = document.createElement('label');
  mode.className = 'auto-plan-field auto-plan-field--v9 auto-plan-field--solver';
  mode.innerHTML = `<span>Solvermodus</span>
    <select id="autoPlanV9SolverMode">
      ${Object.entries(MODES).map(([value, item]) => `<option value="${value}"${preferences.solverMode === value ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}
    </select>
    <small id="autoPlanV9SolverModeHelp">${esc(MODES[preferences.solverMode].detail)}</small>`;

  const target = document.createElement('label');
  target.className = 'auto-plan-field auto-plan-field--v9 auto-plan-field--proof';
  target.innerHTML = `<span>Nachweisziel</span>
    <select id="autoPlanV9ProofTarget">
      ${Object.entries(TARGETS).map(([value, item]) => `<option value="${value}"${preferences.proofTarget === value ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}
    </select>
    <small id="autoPlanV9ProofTargetHelp">${esc(TARGETS[preferences.proofTarget].detail)}</small>`;

  fragment.append(mode, target);
  grid.prepend(fragment);

  const legacyPerformance = dialog.querySelector('#autoPlanPerformanceProfile')?.closest('.auto-plan-field');
  if (legacyPerformance) {
    legacyPerformance.hidden = true;
    legacyPerformance.setAttribute('aria-hidden', 'true');
  }

  const sync = () => {
    const solverMode = dialog.querySelector('#autoPlanV9SolverMode').value;
    const proofTarget = dialog.querySelector('#autoPlanV9ProofTarget').value;
    dialog.querySelector('#autoPlanV9SolverModeHelp').textContent = MODES[solverMode].detail;
    dialog.querySelector('#autoPlanV9ProofTargetHelp').textContent = TARGETS[proofTarget].detail;
    bridgeConfig(dialog);
    installAllTooltips(dialog);
  };
  mode.querySelector('select').addEventListener('change', sync);
  target.querySelector('select').addEventListener('change', sync);
  dialog.querySelector('#autoPlanStartBtn')?.addEventListener('click', () => bridgeConfig(dialog), true);
  sync();
}

function upgradeIdentity(dialog) {
  dialog.dataset.algorithmRevision = '9';
  dialog.dataset.engineRevision = '9';
  dialog.dataset.solverArchitecture = 'free-browser-hybrid';
  const kicker = dialog.querySelector('.auto-plan-kicker');
  if (kicker) kicker.textContent = 'Constraint Intelligence · v9 Free Browser Hybrid';
  const title = dialog.querySelector('#autoPlanTitle');
  if (title) title.textContent = 'Auto-Plan Studio v9';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, #autoPlanV85Ribbon, #autoPlanV7Ribbon');
  if (ribbon) {
    ribbon.id = 'autoPlanV9Ribbon';
    ribbon.classList.add('auto-plan-v9-ribbon');
    const heading = ribbon.querySelector('b');
    const detail = ribbon.querySelector('small');
    const badge = ribbon.querySelector(':scope > strong');
    if (heading) heading.textContent = 'Free Hybrid Constraint Laboratory';
    if (detail) detail.textContent = 'v8.5-Portfolio als Incumbent · exakte MRV-Tiefensuche · ehrliche Solverstatus · vollständig im Browser';
    if (badge) badge.textContent = 'ENGINE v9 · 0 €';
  }
  const engineBadge = dialog.querySelector('.auto-plan-engine-badge span');
  if (engineBadge) engineBadge.textContent = 'Constraint Engine v9 · Browser Hybrid';
}

function installProofHud(dialog) {
  if (!dialog.querySelector('#autoPlanV9Hud')) {
    const visual = dialog.querySelector('.auto-plan-visual');
    if (visual) {
      const hud = document.createElement('div');
      hud.id = 'autoPlanV9Hud';
      hud.className = 'auto-plan-v9-hud';
      hud.setAttribute('aria-hidden', 'true');
      hud.innerHTML = '<i></i><i></i><i></i><i></i><span></span>';
      visual.append(hud);
    }
  }

  if (!dialog.querySelector('#autoPlanV9ExactMeter')) {
    const theatre = dialog.querySelector('#autoPlanV85Theatre');
    if (theatre) {
      const meter = document.createElement('section');
      meter.id = 'autoPlanV9ExactMeter';
      meter.className = 'auto-plan-v9-exact-meter';
      meter.hidden = true;
      meter.innerHTML = '<header><span>Exakte Suche</span><b id="autoPlanV9ExactStatus">wartet</b></header>'
        + '<div><span>Knoten <b id="autoPlanV9ExactNodes">0</b></span><span>Lösungen <b id="autoPlanV9ExactSolutions">0</b></span><span>Sackgassen <b id="autoPlanV9ExactDeadEnds">0</b></span></div>'
        + '<i aria-hidden="true"><em></em></i>';
      theatre.append(meter);
    }
  }
}

function rebuildStages(dialog) {
  const theatre = dialog.querySelector('#autoPlanV85Theatre ol');
  if (!theatre || theatre.dataset.v9Stages === 'true') return;
  theatre.dataset.v9Stages = 'true';
  theatre.innerHTML = AUTO_PLAN_STAGES.map(stage => `<li data-stage="${esc(stage.id)}" data-state="pending" tabindex="0">
    <i aria-hidden="true"></i><div><b>${esc(stage.title)}</b><small>${esc(stage.detail)}</small></div><span>offen</span>
  </li>`).join('');
  installAllTooltips(dialog);
}

function stageId(update) {
  if (update.stage === 'exact-search' || update.stage === 'exact-start' || update.stage === 'exact-incumbent') return 'exact';
  if (update.phase === 'certify') return 'exact';
  if (update.phase === 'audit' || update.phase === 'complete' || update.phase === 'blocked') return 'certify';
  if (update.phase === 'search' || update.phase === 'propagate') return 'construct';
  if (update.phase === 'polish') return 'repair';
  return update.phase || 'analysis';
}

function updateTheatre(dialog, update) {
  const current = stageId(update);
  const stages = AUTO_PLAN_STAGES.map(stage => stage.id);
  const currentIndex = Math.max(0, stages.indexOf(current));
  dialog.querySelectorAll('#autoPlanV85Theatre li[data-stage]').forEach((item, index) => {
    const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
    item.dataset.state = state;
    const label = item.querySelector(':scope > span');
    if (label) label.textContent = state === 'done' ? 'erledigt' : state === 'active' ? 'läuft' : 'offen';
  });

  const progress = Math.max(0, Math.min(1, Number(update.progress) || 0));
  const shell = dialog.querySelector('.auto-plan-shell');
  shell?.style.setProperty('--v9-energy', String(progress));
  shell?.style.setProperty('--v9-angle', `${Math.round(progress * 720)}deg`);
  shell?.classList.toggle('v9-quality-pulse', Number(update.improvements) > 0 || update.stage === 'exact-incumbent');
  if (shell?.classList.contains('v9-quality-pulse')) {
    clearTimeout(shell.__v9PulseTimer);
    shell.__v9PulseTimer = setTimeout(() => shell.classList.remove('v9-quality-pulse'), 760);
  }

  const exact = dialog.querySelector('#autoPlanV9ExactMeter');
  const isExact = current === 'exact';
  if (exact) {
    exact.hidden = !isExact && !Number(update.exactNodes);
    dialog.querySelector('#autoPlanV9ExactStatus').textContent = update.stage === 'exact-incumbent' ? 'verbessert' : isExact ? 'durchsucht' : 'abgeschlossen';
    dialog.querySelector('#autoPlanV9ExactNodes').textContent = Number(update.exactNodes || 0).toLocaleString('de-DE');
    dialog.querySelector('#autoPlanV9ExactSolutions').textContent = Number(update.exactSolutions || 0).toLocaleString('de-DE');
    dialog.querySelector('#autoPlanV9ExactDeadEnds').textContent = Number(update.deadEnds || 0).toLocaleString('de-DE');
    const bar = exact.querySelector('em');
    if (bar) bar.style.inlineSize = `${Math.round(Math.max(0, Math.min(1, Number(update.exactTimeShare || 0))) * 100)}%`;
  }
}

function statusCopy(status) {
  if (status === V9_SOLVER_STATUSES.OPTIMAL) return ['OPTIMAL', 'Globales Optimum bewiesen', 'verified'];
  if (status === V9_SOLVER_STATUSES.INFEASIBLE) return ['INFEASIBLE', 'Striktes Modell nachweisbar unlösbar', 'failed'];
  if (status === V9_SOLVER_STATUSES.FEASIBLE) return ['FEASIBLE', 'Zulässige Lösung; Optimum nicht bewiesen', 'warning'];
  return ['UNKNOWN', 'Zeit- oder Knotenlimit ohne vollständigen Nachweis', 'neutral'];
}

function installProofPanel(dialog) {
  if (dialog.querySelector('#autoPlanV9ProofPanel')) return;
  const anchor = dialog.querySelector('.auto-plan-result-hero') || dialog.querySelector('#autoPlanResult');
  if (!anchor) return;
  const panel = document.createElement('section');
  panel.id = 'autoPlanV9ProofPanel';
  panel.className = 'auto-plan-card auto-plan-v9-proof-panel';
  panel.hidden = true;
  panel.innerHTML = '<header><span>Solvernachweis v9</span><h3>Ehrlicher Ergebnisstatus</h3><p>Ein globaler Nachweis wird nur nach vollständig abgeschlossenem Suchraum ausgewiesen.</p></header>'
    + '<div class="auto-plan-v9-proof-grid">'
    + '<div><span>Status</span><strong id="autoPlanV9ProofStatus">—</strong><small id="autoPlanV9ProofDetail">—</small></div>'
    + '<div><span>Suchumfang</span><strong id="autoPlanV9ProofScope">—</strong><small id="autoPlanV9ProofStop">—</small></div>'
    + '<div><span>Exakte Knoten</span><strong id="autoPlanV9ProofNodes">0</strong><small id="autoPlanV9ProofSolutions">0 Lösungen</small></div>'
    + '<div><span>Kostenmodell</span><strong>0 €</strong><small>Browser · Pages · bestehender KV-Worker</small></div>'
    + '</div>';
  anchor.after(panel);
}

function renderProof(dialog, result) {
  installProofPanel(dialog);
  const panel = dialog.querySelector('#autoPlanV9ProofPanel');
  if (!panel) return;
  const proof = result?.metrics?.proof;
  const search = result?.metrics?.exactSearch;
  if (!proof) {
    panel.hidden = true;
    return;
  }
  const [status, detail, tone] = statusCopy(proof.status);
  panel.hidden = false;
  panel.dataset.tone = tone;
  dialog.querySelector('#autoPlanV9ProofStatus').textContent = status;
  dialog.querySelector('#autoPlanV9ProofDetail').textContent = detail;
  dialog.querySelector('#autoPlanV9ProofScope').textContent = proof.globalSearchComplete ? 'global vollständig' : proof.scope === 'feasible-incumbent' ? 'zeitbegrenzt' : 'offen';
  dialog.querySelector('#autoPlanV9ProofStop').textContent = search?.stoppedBy ? `Stopp: ${search.stoppedBy}` : proof.globalSearchComplete ? 'Suchraum abgeschlossen' : 'kein exakter Lauf';
  dialog.querySelector('#autoPlanV9ProofNodes').textContent = Number(search?.nodes || 0).toLocaleString('de-DE');
  dialog.querySelector('#autoPlanV9ProofSolutions').textContent = `${Number(search?.solutions || 0).toLocaleString('de-DE')} Lösungen`;
  installAllTooltips(dialog);
}

const TOOLTIP_BY_ID = Object.freeze({
  autoPlanV9SolverMode: 'Bestimmt die v9-Orchestrierung. Schnell nutzt nur v8.5; Hybrid kombiniert Incumbent und exakte Suche; Exakt reserviert mehr Budget für Branch-and-Bound; Diagnose verbietet den Rot-Fallback.',
  autoPlanV9ProofTarget: 'Legt fest, wann die exakte Suche enden darf. OPTIMAL wird unabhängig von dieser Auswahl ausschließlich bei vollständig abgeschlossenem Suchraum gemeldet.',
  autoPlanSearchIntensity: 'Steuert Beam-Breite, Verzweigungsfächer und lokale Suchbudgets der v8.5-Incumbent-Phase. Die exakte v9-Suche bleibt verlustfrei und wird separat begrenzt.',
  autoPlanOptimizationFocus: 'Ordnet ausschließlich weiche Ziele nach vollständiger Belegung und Konfliktstufen. Harte Regeln, Grau, Rot, Orange und Gelb behalten immer Vorrang.',
  autoPlanTimeBudget: 'Gesamter Zeitrahmen für ALNS und exakte Suche. v9 teilt ihn nach Solvermodus auf und hält die Oberfläche in einem eigenen UI-Budget responsiv.',
  autoPlanRepairIterations: 'Zahl einfacher Tausch- und Reparaturrunden vor der adaptiven Perfektion. Höhere Werte verbessern den Incumbent, kosten aber Zeit vor der exakten Suche.',
  autoPlanLocalBudget: 'Maximale Knoten je lokaler Teilneuplanung auffälliger Tage. Die globale exakte v9-Suche besitzt ein separates, automatisch abgeleitetes Limit.',
  autoPlanLateAcceptance: 'Größe des ALNS-Rückblickfensters. Ein größeres Fenster akzeptiert vorübergehend schlechtere Zustände und verlässt lokale Optima leichter.',
  autoPlanMaxRed: 'Zusätzliche harte Obergrenze bestätigungspflichtiger Vorschläge. Null erzwingt einen vollständig konfliktfreien Vorschlag; leer verwendet nur die fachlichen Regeln.',
  autoPlanAllowRed: 'Erlaubt den Minimal-Rot-Fallback erst nach Ausschöpfung beziehungsweise echtem Nachweis der strikten Suche. UNKNOWN gilt nicht als Unlösbarkeit.',
  autoPlanPerfection: 'v9 führt die Perfektion verbindlich aus. Sie erzeugt den bestmöglichen Incumbent für die anschließende exakte Prüfung.',
  autoPlanLimitReset: 'Stellt personenspezifische Vorschlagswerte aus Stammdaten, BD-Soll und datumsabhängiger HG-Berechtigung wieder her.',
  autoPlanLimitClear: 'Entfernt nur zusätzliche Laufobergrenzen. Qualifikation, Abwesenheiten, Fixpunkte und sämtliche fachlichen Regeln bleiben unverändert.',
  autoPlanStartBtn: 'Erzeugt einen unveränderlichen Monatssnapshot, startet das Worker-Portfolio und anschließend – je nach Modus – die exakte v9-Suche.',
  autoPlanCancelBtn: 'Beendet alle aktiven Worker. Der Monatsplan bleibt unverändert; ein bereits berechneter, aber nicht bestätigter Vorschlag wird verworfen.',
  autoPlanApplyBtn: 'Übernimmt ausschließlich einen vollständigen, erneut auditierten Vorschlag. Rote Ausnahmen benötigen die vorhandene explizite Bestätigung.',
  autoPlanCloseBtn: 'Schließt das Studio. Während eines Laufs wird zuerst kontrolliert abgebrochen.',
  autoPlanLog: 'Chronologische Klartextdiagnostik aus echten Solverereignissen. Die Liste ist scrollbar und enthält Phasen, Suchumfang, Verbesserungen und Nachweisfortschritt.',
  autoPlanV9ExactMeter: 'Live-Telemetrie der verlustfreien Tiefensuche: untersuchte Knoten, gefundene vollständige Lösungen, Sackgassen und verbrauchter Zeitanteil.',
  autoPlanV9ProofPanel: 'Finaler Solverstatus nach dem OR-üblichen Vertrag OPTIMAL, FEASIBLE, INFEASIBLE oder UNKNOWN. Lokale Stabilität wird nicht als globaler Beweis ausgegeben.'
});

function readableText(element) {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function explainField(field) {
  const label = readableText(field.querySelector(':scope > span'));
  const help = readableText(field.querySelector(':scope > small'));
  return [label, help].filter(Boolean).join(' — ');
}

function installAllTooltips(dialog) {
  for (const [id, text] of Object.entries(TOOLTIP_BY_ID)) {
    const element = dialog.querySelector(`#${id}`);
    if (element) setRichTooltip(element, text);
  }

  dialog.querySelectorAll('.auto-plan-field').forEach(field => {
    const explanation = explainField(field);
    if (explanation) setRichTooltip(field, explanation);
    field.querySelectorAll('input, select, output').forEach(control => {
      if (!control.dataset.tooltip && explanation) setRichTooltip(control, explanation);
    });
  });

  dialog.querySelectorAll('button').forEach(button => {
    if (button.dataset.tooltip) return;
    const text = readableText(button) || button.getAttribute('aria-label');
    if (text) setRichTooltip(button, button.getAttribute('aria-label') || `Aktion: ${text}.`);
  });

  dialog.querySelectorAll('th').forEach(cell => {
    if (cell.dataset.tooltip) return;
    const text = readableText(cell);
    if (text) setRichTooltip(cell, `Spalte „${text}“. Die Überschrift bleibt beim Scrollen dem zugehörigen Wertbereich zugeordnet.`);
  });

  dialog.querySelectorAll('.auto-plan-live-metrics > div, .auto-plan-search-metrics > div, .auto-plan-scorecard, .auto-plan-v9-proof-grid > div').forEach(metric => {
    if (metric.dataset.tooltip) return;
    const label = readableText(metric.querySelector('span')) || 'Kennzahl';
    setRichTooltip(metric, `${label}: Laufzeitkennzahl aus dem aktuellen, unveränderten Planungssnapshot.`);
    if (!metric.hasAttribute('tabindex')) metric.tabIndex = 0;
  });

  dialog.querySelectorAll('.auto-plan-phase, #autoPlanV85Theatre li[data-stage]').forEach(item => {
    const stage = AUTO_PLAN_STAGES.find(entry => entry.id === item.dataset.stage);
    if (stage) setRichTooltip(item, `${stage.title}: ${stage.detail}`);
  });

  dialog.querySelectorAll('.auto-plan-v8-lane').forEach((lane, index) => {
    setRichTooltip(lane, `Arbeitsstrang ${index + 1}: unabhängiger Portfolio-Worker mit eigenem Startwert. Der beste vollständig auditierte Vorschlag gewinnt.`);
  });

  const structural = [
    ['.auto-plan-visual', 'Algorithmusvisualisierung: Fortschritt, Phasenwechsel und Qualitätsimpulse stammen aus echten Solverereignissen; sie beeinflussen die Berechnung nicht.'],
    ['.auto-plan-console', 'Laufkonsole: Phasen, Worker-Spuren, exakte Telemetrie, Klartextkommentare und live aggregierte Kennzahlen.'],
    ['.auto-plan-limit-table', 'Personenspezifische harte Laufobergrenzen. Leere Werte fügen keine zusätzliche Grenze hinzu; bestehende Dienste und Stammdatenregeln bleiben verbindlich.'],
    ['.auto-plan-proposal-table', 'Tagesweise Vorschau wie in der Diensttabelle. BD und HG eines Tages stehen gemeinsam in einer Zeile; Regelhinweise sind je Zelle aufklappbar.'],
    ['.auto-plan-v85-theatre', 'Phasentheater v9: zeigt ausschließlich bereits erreichte, aktive und noch offene reale Rechenschritte.']
  ];
  for (const [selector, text] of structural) {
    const element = dialog.querySelector(selector);
    if (element) setRichTooltip(element, text);
  }
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.v9Enhanced === 'true') return;
  dialog.dataset.v9Enhanced = 'true';
  upgradeIdentity(dialog);
  installControls(dialog);
  rebuildStages(dialog);
  installProofHud(dialog);
  installProofPanel(dialog);
  installAllTooltips(dialog);

  const observer = new MutationObserver(records => {
    if (!records.some(record => record.addedNodes.length)) return;
    queueMicrotask(() => installAllTooltips(dialog));
  });
  observer.observe(dialog, { childList: true, subtree: true });

  window.addEventListener('autoplanprogress', event => updateTheatre(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    latestResult = event.detail || null;
    renderProof(dialog, latestResult);
  });

  new MutationObserver(() => {
    if (dialog.classList.contains('is-configuring')) bridgeConfig(dialog);
    if (dialog.classList.contains('show-result') && latestResult) renderProof(dialog, latestResult);
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });
}

function initialize() {
  if (installed) return;
  installed = true;
  addStylesheet();
  const install = event => {
    const dialog = event?.detail?.dialog || document.getElementById('autoPlanDialog');
    if (!dialog) return false;
    enhance(dialog);
    return true;
  };
  if (!install()) window.addEventListener('autoplanstudioready', install, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
