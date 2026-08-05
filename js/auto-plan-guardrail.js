/**
 * Sichtbarer Null-Rot-Guardrail und Phasenerklärung des Auto-Plan Studios.
 */

const PHASE_COPY = Object.freeze({
  analysis: ['Fixpunkte und Domänen', 'Ausgangsmonat und personengebundene Grenzen werden gesichert.'],
  propagate: ['Null-Rot-Constraint-Suche', 'Die engsten Dienstfelder werden zuerst belegt; Forward Checking verwirft Sackgassen.'],
  search: ['Null-Rot-Constraint-Suche', 'Mehrere vollständige Belegungsvarianten werden parallel bewertet.'],
  repair: ['Letzte Eskalationsstufe', 'Erst nach ausgeschöpfter strikter Suche wird ein erlaubter Fallback geprüft.'],
  polish: ['Iterative Tauschreparatur', 'Umsetzungen, Tausche, Ketten und lokale Neuplanungen glätten Ausreißer.'],
  perfect: ['Adaptive Perfektionsphase', 'Ruin-and-Recreate und Late Acceptance verlassen lokale Optima.'],
  certify: ['Optimalitätsnachweis', 'Alle Einzelumsetzungen und Paartausche werden vollständig geprüft.'],
  audit: ['Vollständiger Schlussaudit', 'Jede vorgeschlagene Zelle wird erneut durch die produktive Regelengine bewertet.'],
  complete: ['Vorschlag vollständig geprüft', 'Bis zur bewussten Übernahme bleibt der Monatsplan unverändert.'],
  blocked: ['Machbarkeit nicht nachgewiesen', 'Kein unvollständiger oder technisch unzulässiger Plan wird freigegeben.']
});

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createStep(number, title, detail) {
  const item = make('li');
  item.append(make('b', '', String(number)));
  const text = make('span');
  text.append(make('strong', '', title), make('small', '', detail));
  item.append(text);
  return item;
}

function installGuardrail(dialog) {
  if (document.getElementById('autoPlanZeroRedTitle')) return;
  const limitPanel = dialog.querySelector('.auto-plan-limit-panel');
  if (!limitPanel) return;

  const panel = make('section', 'auto-plan-card auto-plan-zero-red-guardrail');
  panel.setAttribute('aria-labelledby', 'autoPlanZeroRedTitle');
  const header = make('header');
  header.append(
    make('span', '', 'Null-Rot-Guardrail · Algorithmus v7'),
    make('h3', '', 'Rote Vorschläge erst nach vollständig ausgeschöpfter strikter Suche'),
    make('p', '', 'Die fachlichen Regeln bleiben unverändert hart. Verbreitert wird ausschließlich der Suchraum.')
  );
  header.querySelector('h3').id = 'autoPlanZeroRedTitle';

  const flow = make('ol', 'auto-plan-guardrail-flow');
  flow.append(
    createStep(1, 'Reguläre Constraint-Suche', 'MRV, Forward Checking, Beam Search'),
    createStep(2, 'Adaptive Null-Rot-Rescue', 'größerer Suchstrahl, breiterer Kandidatenfächer, tieferes Backtracking'),
    createStep(3, 'Minimal-Rot nur als letzte Eskalation', 'nur bei ausdrücklicher Freigabe')
  );
  flow.lastElementChild.querySelector('small').id = 'autoPlanFallbackState';

  const note = make('div', 'auto-plan-guardrail-note',
    'Kein Rot-Fallback, solange eine vollständige regelkonforme Belegung nachweisbar ist.');
  note.id = 'autoPlanGuardrailNote';
  note.setAttribute('role', 'status');
  panel.append(header, flow, note);
  limitPanel.before(panel);
}

function syncGuardrail(dialog) {
  const enabled = document.getElementById('autoPlanAllowRed')?.checked === true;
  const maxRed = document.getElementById('autoPlanMaxRed')?.value?.trim();
  const state = document.getElementById('autoPlanFallbackState');
  const note = document.getElementById('autoPlanGuardrailNote');
  if (!state || !note) return;
  if (!enabled) {
    state.textContent = 'deaktiviert – ausschließlich Null-Rot';
    note.textContent = 'Scheitert jede strikte Stufe, wird kein Vorschlag zur Übernahme freigegeben.';
    dialog.dataset.fallbackPolicy = 'disabled';
  } else {
    state.textContent = maxRed
      ? `freigegeben, höchstens ${maxRed} rote ${Number(maxRed) === 1 ? 'Ausnahme' : 'Ausnahmen'}`
      : 'freigegeben, jede Ausnahme bleibt einzeln bestätigungspflichtig';
    note.textContent = 'Die Rescue läuft immer vor dem Fallback. Rot erscheint nur nach ausgeschöpfter strikter Suche.';
    dialog.dataset.fallbackPolicy = 'last-resort';
  }
}

function installNarrative(dialog) {
  const visual = dialog.querySelector('.auto-plan-visual');
  if (!visual || document.getElementById('autoPlanPhaseNarrative')) return;
  const narrative = make('div', 'auto-plan-phase-narrative');
  narrative.id = 'autoPlanPhaseNarrative';
  narrative.setAttribute('aria-live', 'polite');
  narrative.append(
    make('span', '', 'Algorithmuszustand'),
    make('strong', '', 'Bereit'),
    make('small', '', 'Die Optimierung startet erst nach Ihrer Freigabe.')
  );
  const badge = make('div', 'auto-plan-engine-badge');
  const dot = make('i');
  dot.setAttribute('aria-hidden', 'true');
  badge.append(dot, make('span', '', 'Constraint Engine v7'));
  visual.append(narrative, badge);
}

function syncPhase(dialog) {
  const phase = dialog.dataset.phase || (dialog.classList.contains('is-running') ? 'analysis' : '');
  const copy = PHASE_COPY[phase];
  const narrative = document.getElementById('autoPlanPhaseNarrative');
  if (!copy || !narrative) return;
  narrative.querySelector('strong').textContent = copy[0];
  narrative.querySelector('small').textContent = copy[1];
  narrative.dataset.phase = phase;
}

export function installAutoPlanGuardrail(dialog) {
  if (!dialog || dialog.dataset.guardrailReady === 'true') return;
  dialog.dataset.guardrailReady = 'true';
  dialog.dataset.algorithmRevision = '6';
  installGuardrail(dialog);
  installNarrative(dialog);
  syncGuardrail(dialog);
  syncPhase(dialog);

  dialog.addEventListener('input', event => {
    if (event.target?.matches?.('#autoPlanMaxRed')) syncGuardrail(dialog);
  });
  dialog.addEventListener('change', event => {
    if (event.target?.matches?.('#autoPlanAllowRed, #autoPlanMaxRed')) syncGuardrail(dialog);
  });
  new MutationObserver(syncPhase.bind(null, dialog)).observe(dialog, {
    attributes: true,
    attributeFilter: ['class', 'data-phase']
  });
}
