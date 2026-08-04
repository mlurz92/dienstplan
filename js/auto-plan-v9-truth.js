/**
 * Auto-Plan v9 – eindeutige Ergebnis- und Nachweissprache.
 *
 * Die v8.5-Basisschicht kennt nur ihren lokalen Nachbarschaftsaudit. v9 ersetzt
 * dessen sichtbare Kurzform nach dem Ergebnisereignis durch den tatsächlichen
 * globalen Status. So stehen niemals gleichzeitig „zertifiziert“ und
 * „Optimum nicht bewiesen“ in derselben Vorschau.
 */

import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';

const STATUS_TONE = Object.freeze({
  OPTIMAL: 'verified',
  FEASIBLE: 'warning',
  INFEASIBLE: 'failed',
  UNKNOWN: 'neutral'
});

function dialog() {
  return document.getElementById('autoPlanDialog');
}

function replaceImpreciseCopy(root = dialog()) {
  if (!root) return;
  for (const element of root.querySelectorAll('#autoPlanV9SolverModeHelp, #autoPlanV9ProofTargetHelp, .auto-plan-v9-ribbon small')) {
    const next = String(element.textContent || '')
      .replace(/Branch-and-Bound-Suche/gi, 'Constraint-Tiefensuche')
      .replace(/Branch-and-Bound/gi, 'vollständige Constraint-Tiefensuche');
    if (next !== element.textContent) element.textContent = next;
  }
}

function resultMessage(result, proof) {
  const proposed = Number(result?.changes?.length || 0);
  const red = Number(result?.metrics?.red || 0);
  if (proof.status === 'OPTIMAL') {
    return proof.relaxed
      ? `${proposed} Vorschläge vollständig auditiert; das globale Minimal-Rot-Optimum ist bewiesen (${red} rote Ausnahme${red === 1 ? '' : 'n'}).`
      : `${proposed} Vorschläge vollständig auditiert; das globale Null-Rot-Optimum ist bewiesen.`;
  }
  if (proof.status === 'INFEASIBLE') {
    return 'Der vollständig untersuchte strikte Suchraum enthält keine technisch zulässige Komplettbelegung.';
  }
  if (proof.status === 'UNKNOWN') {
    return 'Die exakte Suche erreichte ihr Zeit- oder Knotenlimit. Es liegt weder ein Unmöglichkeits- noch ein Optimalitätsnachweis vor.';
  }
  if (!proof.exactAttempted) {
    return `${proposed} Vorschläge vollständig auditiert. Der schnelle v8.5-Modus liefert einen zulässigen Incumbent ohne globalen Nachweis.`;
  }
  return `${proposed} Vorschläge vollständig auditiert. Die Lösung ist zulässig; das globale Optimum wurde innerhalb des Limits nicht bewiesen.`;
}

function proofCard(root) {
  return [...root.querySelectorAll('#autoPlanScorecards .auto-plan-scorecard')]
    .find(card => /Optimalität|Globaler Nachweis/i.test(card.querySelector('span')?.textContent || ''));
}

function renderTruth(result) {
  const root = dialog();
  const proof = result?.metrics?.proof;
  if (!root || !proof) return;
  replaceImpreciseCopy(root);

  const text = root.querySelector('#autoPlanResultText');
  if (text) {
    text.textContent = resultMessage(result, proof);
    setRichTooltip(text, `${proof.truthfulLabel}. Der Status folgt ausschließlich aus dem vollständigen Regel-Audit und dem dokumentierten Suchumfang.`);
  }

  const card = proofCard(root);
  if (card) {
    card.classList.remove('verified', 'warning', 'failed', 'neutral');
    card.classList.add(STATUS_TONE[proof.status] || 'neutral');
    const label = card.querySelector('span');
    const value = card.querySelector('strong');
    const detail = card.querySelector('small');
    if (label) label.textContent = 'Globaler Nachweis';
    if (value) value.textContent = proof.status;
    if (detail) detail.textContent = proof.truthfulLabel;
    setRichTooltip(card, `${proof.truthfulLabel}. ${proof.globalSearchComplete ? 'Der betrachtete Suchraum wurde vollständig abgeschlossen.' : 'Die Suche endete vor Abschluss des globalen Suchraums.'}`);
  }

  const proofDetail = root.querySelector('#autoPlanV9ProofDetail');
  if (proofDetail) proofDetail.textContent = proof.truthfulLabel;
  const proofScope = root.querySelector('#autoPlanV9ProofScope');
  if (proofScope) {
    proofScope.textContent = proof.scope === 'global-relaxed'
      ? 'global · Minimal-Rot'
      : proof.scope === 'global-strict'
        ? 'global · Null-Rot'
        : proof.scope === 'feasible-incumbent'
          ? 'zeitbegrenzt'
          : 'offen';
  }
}

function install(root = dialog()) {
  if (!root || root.dataset.v9TruthInstalled === 'true') return false;
  root.dataset.v9TruthInstalled = 'true';
  replaceImpreciseCopy(root);
  new MutationObserver(() => queueMicrotask(() => replaceImpreciseCopy(root)))
    .observe(root, { childList: true, subtree: true, characterData: true });
  return true;
}

window.addEventListener('autoplanstudioready', event => install(event.detail?.dialog), { once: true });
window.addEventListener('autoplanresult', event => {
  install();
  queueMicrotask(() => renderTruth(event.detail));
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
else install();
