/**
 * Auto-Plan Studio v8 – Incremental Constraint Observatory.
 *
 * Die Oberfläche des Studios ist über mehrere Versionen gewachsen, und mit ihr
 * die Zahl der Zahlen, die sie zeigt. v8 ordnet das neu, ohne die tragende
 * v5-Fassung anzutasten:
 *
 * - Das Kopfband nennt, was die Engine tatsächlich tut, und liest die Stufen
 *   aus `auto-planner-v8.js` statt sie ein zweites Mal als Text vorzuhalten.
 *   Eine zweite Fassung wäre nach der nächsten Änderung falsch, ohne dass es
 *   jemand bemerkt.
 * - Die Ergebnisansicht bekommt eine eigene Tafel für das, was v8 neu
 *   beobachtet: welcher Zerstörungs- und welcher Reparaturoperator sich in
 *   diesem Monat bewährt hat. Das ist die einzige Stelle, an der ein Lauf
 *   erklärt, *warum* er so gesucht hat, wie er gesucht hat.
 * - Die Laufansicht macht sichtbar, dass mehrere Stränge arbeiten: je Strang
 *   eine eigene Spur statt einer einzigen zusammengefassten Zahl.
 *
 * Alles hier ist additiv. Fällt diese Schicht aus, bleibt ein vollständig
 * bedienbares Studio zurück.
 */
import './auto-plan-studio-v7-5.js?v=20260806.1';
import { AUTO_PLAN_STAGES } from './auto-planner-v8.js?v=20260806.1';

const RELEASE = '20260806.1';

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v8-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v8.css?v=${RELEASE}`;
  link.dataset.autoPlanV8Style = 'true';
  document.head.append(link);
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const OPERATOR_NAMES = Object.freeze({
  zufallsfelder: 'Zufallsfelder',
  'schwaechste-zellen': 'Schwächste Zellen',
  tagesfenster: 'Tagesfenster',
  wochenende: 'Wochenende',
  personenlast: 'Personenlast',
  'verwandte-felder': 'Verwandte Felder',
  rollenblock: 'Rollenblock',
  sollabweichung: 'Sollabweichung',
  spielraum: 'Kleinster Spielraum',
  bedauern: 'Regret-2',
  gierig: 'Gierig'
});

/**
 * Das Kopfband des Parameterbereichs.
 *
 * Es ersetzt das v7.5-Band. Der Text stammt aus der Stufenbeschreibung der
 * Engine; die Oberfläche formuliert nichts eigenes über den Algorithmus.
 */
function upgradeRibbon(dialog) {
  const ribbon = dialog.querySelector('#autoPlanV75Ribbon, #autoPlanV7Ribbon');
  if (!ribbon) return;
  ribbon.id = 'autoPlanV8Ribbon';
  ribbon.classList.add('auto-plan-v8-ribbon');
  const title = ribbon.querySelector('b');
  const detail = ribbon.querySelector('small');
  const badge = ribbon.querySelector(':scope > strong');
  if (title) title.textContent = 'Incremental Constraint Observatory';
  if (detail) {
    detail.textContent = 'Inkrementelle Zählwerke · zwei adaptive Operatordimensionen · Luby-Neustarts · Portfolio ohne Doppelarbeit';
  }
  if (badge) badge.textContent = 'ENGINE v8';

  if (ribbon.querySelector('.auto-plan-v8-stages')) return;
  const stages = document.createElement('ol');
  stages.className = 'auto-plan-v8-stages';
  stages.setAttribute('aria-label', 'Stufen eines Auto-Plan-Laufs');
  stages.innerHTML = AUTO_PLAN_STAGES
    .map(stage => `<li data-stage="${esc(stage.id)}"><b>${esc(stage.title)}</b><small>${esc(stage.detail)}</small></li>`)
    .join('');
  ribbon.append(stages);
}

function engineBadges(dialog) {
  const badge = dialog.querySelector('.auto-plan-engine-badge span');
  if (badge) badge.textContent = 'Constraint Engine v8';
  const heading = dialog.querySelector('.auto-plan-zero-red-guardrail header > span');
  if (heading) heading.textContent = 'Null-Rot-Guardrail · Algorithmus v8';
}

/**
 * Der Lernbericht der beiden Operatordimensionen.
 *
 * Angezeigt wird, was tatsächlich gemessen wurde: Einsätze, verdiente Belohnung
 * je Sekunde Rechenzeit und das zuletzt gültige Segmentgewicht. Ein Operator
 * ohne Einsatz erscheint nicht — eine Zeile mit lauter Nullen behauptet eine
 * Beobachtung, die es nicht gab.
 */
function learningTable(title, note, learning) {
  const rows = Object.entries(learning || {})
    .filter(([, value]) => Number(value?.uses) > 0)
    .sort((left, right) => Number(right[1].rewardPerSecond || 0) - Number(left[1].rewardPerSecond || 0));
  if (!rows.length) return '';
  const peak = Math.max(...rows.map(([, value]) => Number(value.rewardPerSecond) || 0), 1);
  return `<section class="auto-plan-v8-learning">
    <header><b>${esc(title)}</b><small>${esc(note)}</small></header>
    <ol>${rows.map(([operator, value]) => {
      const rate = Number(value.rewardPerSecond) || 0;
      return `<li>
        <span class="auto-plan-v8-operator">${esc(OPERATOR_NAMES[operator] || operator)}</span>
        <span class="auto-plan-v8-bar" aria-hidden="true"><i style="inline-size:${Math.max(2, Math.round(rate / peak * 100))}%"></i></span>
        <span class="auto-plan-v8-figures">
          <b>${rate.toLocaleString('de-DE', { maximumFractionDigits: 2 })}</b>
          <small>Ertrag/s · ${Number(value.uses).toLocaleString('de-DE')} Einsätze · Gewicht ${Number(value.weight ?? 1).toLocaleString('de-DE', { maximumFractionDigits: 2 })}</small>
        </span>
      </li>`;
    }).join('')}</ol>
  </section>`;
}

function renderLearning(dialog) {
  const host = dialog.querySelector('#autoPlanV8Learning');
  if (!host) return;
  const optimizer = lastResult?.metrics?.optimizer;
  if (!optimizer) {
    host.hidden = true;
    return;
  }
  const markup = [
    learningTable('Zerstörungsoperatoren', 'Welcher Ausschnitt hat sich in diesem Monat gelohnt?', optimizer.operatorLearning),
    learningTable('Wiederaufbauoperatoren', 'Welche Reparatur hat den Ausschnitt am besten wieder besetzt?', optimizer.repairLearning)
  ].filter(Boolean).join('');
  host.innerHTML = markup;
  host.hidden = !markup;
}

/**
 * Die Ergebnisansicht um die Lerntafel erweitern.
 *
 * Sie wird an das bestehende Kennzahlenpanel gehängt und bei jedem Wechsel in
 * die Ergebnisansicht neu gefüllt. Beobachtet wird dafür die Klassenliste des
 * Dialogs; einen eigenen Haken in die v5-Fassung zu schlagen hätte diese Schicht
 * von additiv zu eingreifend gemacht.
 */
function installLearningPanel(dialog) {
  if (dialog.querySelector('#autoPlanV8Learning')) return;
  const anchor = dialog.querySelector('#autoPlanSearchMetrics')?.closest('.auto-plan-panel');
  if (!anchor) return;
  const panel = document.createElement('section');
  panel.className = 'auto-plan-card auto-plan-panel auto-plan-v8-panel';
  panel.innerHTML = '<div class="auto-plan-section-title">'
    + '<span>Was die Suche über diesen Monat gelernt hat</span><b>adaptive Operatorwahl</b></div>'
    + '<div id="autoPlanV8Learning" hidden></div>';
  anchor.after(panel);
}

/**
 * Die Spuren der parallelen Arbeitsstränge.
 *
 * Der Fortschrittsbalken fasst das Portfolio zu einer Zahl zusammen — richtig,
 * aber es verschweigt, dass mehrere Stränge unterschiedlich weit sind. Die
 * Spuren machen genau das sichtbar, ohne eine zweite Wahrheit zu erfinden: Sie
 * lesen dieselben Ereignisse.
 */
function installLanes(dialog) {
  if (dialog.querySelector('#autoPlanV8Lanes')) return;
  const console_ = dialog.querySelector('.auto-plan-console');
  const phaseList = dialog.querySelector('#autoPlanPhaseList');
  if (!console_ || !phaseList) return;
  const lanes = document.createElement('div');
  lanes.id = 'autoPlanV8Lanes';
  lanes.className = 'auto-plan-v8-lanes';
  lanes.setAttribute('aria-label', 'Fortschritt der einzelnen Arbeitsstränge');
  lanes.hidden = true;
  phaseList.after(lanes);
}

const laneState = new Map();
let lastResult = null;

function updateLanes(dialog, update) {
  const host = dialog.querySelector('#autoPlanV8Lanes');
  if (!host) return;
  const total = Number(update.searchCount) || 0;
  if (!Number.isInteger(update.searchIndex) || total <= 1) return;
  const index = update.searchIndex;
  const share = Math.max(0, Math.min(1, Number(update.progress) || 0));
  const previous = laneState.get(index) || { share: 0, done: false };
  laneState.set(index, {
    share: update.workerTerminal ? 1 : Math.max(previous.share, share),
    done: previous.done || Boolean(update.workerTerminal)
  });

  if (host.childElementCount !== total) {
    host.replaceChildren();
    for (let lane = 0; lane < total; lane += 1) {
      const item = document.createElement('div');
      item.className = 'auto-plan-v8-lane';
      item.innerHTML = `<span>Strang ${lane + 1}</span><i><b></b></i>`;
      host.append(item);
    }
  }
  host.hidden = false;
  [...host.children].forEach((element, lane) => {
    const entry = laneState.get(lane) || { share: 0, done: false };
    element.dataset.done = String(entry.done);
    const bar = element.querySelector('b');
    if (bar) bar.style.inlineSize = `${Math.round(entry.share * 100)}%`;
  });
}

function resetLanes(dialog) {
  laneState.clear();
  const host = dialog.querySelector('#autoPlanV8Lanes');
  if (!host) return;
  host.replaceChildren();
  host.hidden = true;
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.algorithmRevision === '8') return;
  dialog.dataset.algorithmRevision = '8';
  upgradeRibbon(dialog);
  engineBadges(dialog);
  installLearningPanel(dialog);
  installLanes(dialog);

  /**
   * Der Wechsel in die Ergebnisansicht ist am Zustand des Dialogs ablesbar.
   * Die v5-Fassung setzt dafür `show-result`; darauf zu horchen ist deutlich
   * robuster, als ihre Renderfunktion zu umschließen.
   */
  new MutationObserver(() => {
    if (dialog.classList.contains('show-result')) renderLearning(dialog);
    else if (dialog.classList.contains('is-configuring')) resetLanes(dialog);
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('autoplanprogress', event => updateLanes(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    lastResult = event.detail || null;
    renderLearning(dialog);
  });
}

function initialize() {
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
