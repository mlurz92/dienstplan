/**
 * Auto-Plan Studio – Oberfläche für Parametrierung, Lauf und Prüfung.
 *
 * Der Aufbau folgt drei Abschnitten in einem gemeinsamen, durchgehend
 * scrollbaren Arbeitsbereich: Parameter festlegen, Lauf beobachten, Ergebnis
 * prüfen. Der gemeinsame Scrollbereich ist keine Kosmetik – zuvor lag der
 * Parameterbereich in einer Grid-Zeile fester Höhe, wodurch die unteren Zeilen
 * der Mitarbeitendentabelle und die Validierungsmeldung außerhalb des sichtbaren
 * Bereichs lagen und sich nicht mehr erreichen ließen.
 *
 * Die Vorschlagsansicht spiegelt bewusst die Diensttabelle der Anwendung: eine
 * Zeile je Kalendertag, BD und HG nebeneinander, Wochenenden und Feiertage
 * hervorgehoben. So wird der Vorschlag in derselben Leserichtung geprüft, in der
 * später gearbeitet wird.
 */

import {
  applyAutoPlanProposal,
  createDefaultAutoPlanConfig,
  validateAutoPlanConfig
} from './auto-planner.js?v=20260801.11';
import { parallelSearchCount, runAutoPlan, workersAvailable } from './auto-plan-runner.js?v=20260801.11';
import {
  getMonthData,
  getMonthLabel,
  markMonthDirty,
  persistMonth,
  setMonthData,
  state
} from './state.js?v=20260801.11';
import {
  assignmentLabel,
  computeWeekendEquivalent,
  countRoleInMonth,
  fmtGermanDate,
  getPlanningStaff,
  getStaffById,
  parseIso,
  roleLabelForMonth,
  weekdayLabel
} from './rules.js?v=20260801.11';
import { holidayName } from './holidays.js?v=20260801.11';
import { AlgorithmCommentary } from './auto-plan-commentary.js?v=20260801.11';
import { AutoPlanVisualizer } from './auto-plan-visualizer.js?v=20260801.11';

const RELEASE = '20260801.11';
const STYLESHEETS = ['/auto-plan-studio.css'];

const PHASES = Object.freeze([
  ['analysis', 'Fixpunkte'],
  ['propagate', 'Constraint'],
  ['repair', 'Reparatur'],
  ['polish', 'Tausche'],
  ['perfect', 'Perfektion'],
  ['certify', 'Zertifizierung']
]);

/**
 * `audit` ist der Schlussaudit des *Aufbaus*, nicht der Optimalitätsnachweis.
 * Er fällt mit der Fairness-Politur zusammen und gehört deshalb auf „Tausche".
 * Auf „Zertifizierung" abgebildet spränge das Band schon nach wenigen Sekunden
 * auf die letzte Stufe und stünde dort minutenlang still.
 */
const PHASE_ALIASES = Object.freeze({
  search: 'propagate',
  audit: 'polish',
  complete: null,
  blocked: null
});

const CORE_LABELS = Object.freeze({
  analysis: 'Analyse',
  propagate: 'Propagation',
  search: 'Suche',
  repair: 'Reparatur',
  polish: 'Tausche',
  perfect: 'Perfektion',
  certify: 'Beweis',
  audit: 'Audit',
  complete: 'Bereit',
  blocked: 'Prüfung'
});

const LEVEL_ORDER = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });

const ICON = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M12 2 14.2 7.8 20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2Z"/>'
  + '<path d="m18 16 .9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9L18 16Z"/>'
  + '</svg>';

let dialog;
let trigger;
let controller;
let proposal;
let visualizer;
let installed = false;
let activeMonth;
let triggerFocus;
let clockTimer;

/**
 * Die verstrichene Zeit läuft in der Oberfläche selbst weiter.
 *
 * Sie an Fortschrittsmeldungen zu hängen wäre irreführend: Zwischen zwei
 * Meldungen liegen je nach Phase Sekunden, und ein stehender Zähler sieht aus
 * wie ein hängender Lauf.
 */
function startClock() {
  stopClock();
  const startedAt = Date.now();
  const paint = () => { byId('autoPlanElapsed').textContent = formatDuration(Date.now() - startedAt); };
  paint();
  clockTimer = setInterval(paint, 500);
}

function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = undefined;
}

const byId = id => document.getElementById(id);

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const numberOrNull = value => value === '' || value === null || value === undefined
  ? null
  : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

const formatNumber = value => Number(value || 0).toLocaleString('de-DE');

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')} min`;
}

function installStylesheets() {
  for (const href of STYLESHEETS) {
    if (document.querySelector(`link[data-auto-plan-style="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${href}?v=${RELEASE}`;
    link.dataset.autoPlanStyle = href;
    document.head.append(link);
  }
}

function createTrigger() {
  const existing = byId('autoPlanBtn');
  if (existing) return existing;
  const actions = document.querySelector('.toolbar-section--planning .toolbar-actions')
    || document.querySelector('.toolbar .toolbar-group');
  if (!actions) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'autoPlanBtn';
  button.className = 'tool-action tool-action--accent auto-plan-trigger';
  button.title = 'Auto-Plan Studio öffnen, Parameter festlegen und alle offenen BD/HG optimieren';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = `${ICON}<span class="tool-label">Auto-Plan</span><span class="auto-plan-spark" aria-hidden="true"></span>`;
  actions.insertBefore(button, actions.children[1] || null);
  window.dispatchEvent(new Event('resize'));
  return button;
}

function template() {
  return `<dialog id="autoPlanDialog" class="auto-plan-dialog is-configuring" aria-labelledby="autoPlanTitle">
    <div class="auto-plan-shell">
      <header class="auto-plan-header">
        <div class="auto-plan-headline">
          <div class="auto-plan-kicker">Constraint Intelligence · Globaler Monatslauf</div>
          <h2 id="autoPlanTitle" tabindex="-1">Auto-Plan Studio</h2>
          <p id="autoPlanSubtitle">Parameter festlegen, Optimierung starten, Tagesvorschlag vollständig prüfen</p>
        </div>
        <button type="button" class="auto-plan-close" id="autoPlanCloseBtn" aria-label="Auto-Plan schließen">✕</button>
        <div class="auto-plan-progress-rail" aria-hidden="true"><i></i></div>
      </header>

      <div class="auto-plan-body" id="autoPlanBody">
        <section class="auto-plan-config" id="autoPlanConfig" aria-labelledby="autoPlanConfigTitle">
          <div class="auto-plan-config-hero">
            <article class="auto-plan-card">
              <header>
                <span>Optimierungsarchitektur</span>
                <h3 id="autoPlanConfigTitle">Laufparameter</h3>
                <p>Harte Grenzen bestimmen die Machbarkeit. Erst danach steuert das Profil die weichen Qualitätsziele.</p>
              </header>
              <div class="auto-plan-field-grid">
                <label class="auto-plan-field">
                  <span>Suchintensität</span>
                  <select id="autoPlanSearchIntensity" title="Breite der Konstruktionssuche. Standard baut schnell auf, Maximum prüft beim Aufbau mehr Varianten. Die eigentliche Qualität entsteht danach in der Perfektionsphase.">
                    <option value="standard">Standard</option>
                    <option value="deep" selected>Tief</option>
                    <option value="maximum">Maximum</option>
                  </select>
                  <small>Breite der Konstruktionssuche</small>
                </label>
                <label class="auto-plan-field">
                  <span>Optimierungsschwerpunkt</span>
                  <select id="autoPlanOptimizationFocus" title="Reihenfolge der weichen Ziele. Harte Regeln, vollständige Belegung sowie rote, orange und gelbe Hinweise haben immer Vorrang; der Schwerpunkt ordnet nur das, was danach kommt.">
                    <option value="balanced" selected>Ausgewogen</option>
                    <option value="wishes">Wünsche zuerst</option>
                    <option value="workload">Lastenausgleich zuerst</option>
                    <option value="weekends">Wochenenden zuerst</option>
                  </select>
                  <small>Reihenfolge der weichen Ziele</small>
                </label>
                <label class="auto-plan-field auto-plan-field--wide">
                  <span>Zeitrahmen der Perfektionsphase</span>
                  <div class="auto-plan-range">
                    <input id="autoPlanTimeBudget" type="range" min="10" max="900" step="5" value="60" title="Zeit für die Ruin-and-Recreate-Suche und den abschließenden Optimalitätsnachweis. Die Suche nutzt den Rahmen vollständig aus; mehr Zeit bedeutet verlässlich bessere Pläne.">
                    <output id="autoPlanTimeBudgetOut">60 s</output>
                  </div>
                  <small>Die Ruin-and-Recreate-Suche nutzt diesen Rahmen vollständig aus. Mehr Zeit bedeutet verlässlich bessere Pläne.</small>
                </label>
                <label class="auto-plan-field">
                  <span>Iterative Reparaturrunden</span>
                  <input id="autoPlanRepairIterations" type="number" min="0" max="30" step="1" value="4" title="Runden der einfachen Tauschreparatur direkt nach dem Aufbau. Sie glättet grobe Ausreißer, bevor die Perfektionsphase übernimmt.">
                  <small>Vorstufe vor der Perfektion</small>
                </label>
                <label class="auto-plan-field">
                  <span>Lokales Neuplanungsbudget</span>
                  <input id="autoPlanLocalBudget" type="number" min="200" max="12000" step="200" value="3200" title="Zahl der Knoten, die eine lokale Neuplanung auffälliger Tage höchstens durchsuchen darf.">
                  <small>Knoten je Teilneuplanung</small>
                </label>
                <label class="auto-plan-field">
                  <span>Late-Acceptance-Fenster</span>
                  <input id="autoPlanLateAcceptance" type="number" min="10" max="5000" step="10" value="400" title="Wie viele Runden die Suche zurückblickt, bevor sie einen Zustand annimmt. Größere Werte lassen mehr vorübergehende Verschlechterung zu und verlassen lokale Optima leichter.">
                  <small>Toleranz gegen lokale Optima</small>
                </label>
                <label class="auto-plan-field">
                  <span>Maximal rote Vorschläge</span>
                  <input id="autoPlanMaxRed" type="number" min="0" max="62" step="1" placeholder="keine Grenze" title="Harte Obergrenze für bestätigungspflichtige rote Vorschläge. Leer bedeutet keine zusätzliche Grenze über die Regeln hinaus.">
                  <small>Leer: keine zusätzliche Grenze</small>
                </label>
              </div>
              <div class="auto-plan-switch-row">
                <label class="auto-plan-switch">
                  <input id="autoPlanAllowRed" type="checkbox" checked title="Erlaubt eine vollständige Belegung mit einzeln zu bestätigenden roten Ausnahmen, falls keine vollständige Null-Rot-Lösung existiert.">
                  <span>Minimal-Rot-Fallback erlauben, wenn keine vollständige Null-Rot-Belegung existiert.</span>
                </label>
                <label class="auto-plan-switch">
                  <input id="autoPlanPerfection" type="checkbox" checked title="Führt nach dem Aufbau die Ruin-and-Recreate-Suche und den abschließenden Optimalitätsnachweis aus. Abgeschaltet endet der Lauf nach der einfachen Tauschreparatur.">
                  <span>Perfektionsphase mit Ruin-and-Recreate und abschließender Zertifizierung ausführen.</span>
                </label>
              </div>
            </article>

            <article class="auto-plan-card auto-plan-card--context">
              <header>
                <span>Vorprüfung</span>
                <h3>Planungskontext</h3>
                <p>Bestehende Einteilungen bleiben unveränderliche Fixpunkte.</p>
              </header>
              <div class="auto-plan-context-list" id="autoPlanConfigSummary"></div>
            </article>
          </div>

          <section class="auto-plan-card auto-plan-limit-panel" aria-labelledby="autoPlanLimitTitle">
            <header class="auto-plan-limit-head">
              <div>
                <span>Harte individuelle Grenzen</span>
                <h3 id="autoPlanLimitTitle">Dienstobergrenzen je Mitarbeitendem</h3>
                <p>Leere Felder bedeuten keine zusätzliche Laufgrenze. Hinterlegte Personalmaxima und sämtliche fachlichen Regeln gelten unabhängig davon weiter.</p>
              </div>
              <div class="auto-plan-limit-tools">
                <button type="button" class="auto-plan-mini" id="autoPlanLimitReset" title="Setzt alle Zeilen auf die festgelegten Vorgaben zurück: die monatliche BD-Zahl je Person und die HG-Sperre für alle, die im Monat an keinem Tag HG-berechtigt sind.">Vorschlagswerte</button>
                <button type="button" class="auto-plan-mini" id="autoPlanLimitClear" title="Entfernt sämtliche Laufgrenzen. Hinterlegte Personalmaxima und alle fachlichen Regeln gelten unabhängig davon weiter.">Alle Grenzen leeren</button>
              </div>
            </header>
            <div class="auto-plan-limit-scroll">
              <table class="auto-plan-limit-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col" title="Bereits im Monat gesetzte Bereitschaftsdienste dieser Person. Sie zählen auf jede Obergrenze an.">BD fix</th>
                    <th scope="col" title="Höchstzahl an Bereitschaftsdiensten, die dieser Person im Monat insgesamt zugeteilt sein dürfen. Leer bedeutet keine zusätzliche Grenze.">BD max.</th>
                    <th scope="col" title="Bereits im Monat gesetzte Hintergrunddienste dieser Person.">HG fix</th>
                    <th scope="col" title="Höchstzahl an Hintergrunddiensten. Für Assistenzärztinnen und Assistenzärzte steht hier null, solange sie im Monat nicht HG-berechtigt sind.">HG max.</th>
                    <th scope="col" title="Höchstzahl aus Bereitschafts- und Hintergrunddiensten zusammen.">Gesamt max.</th>
                  </tr>
                </thead>
                <tbody id="autoPlanLimitBody"></tbody>
              </table>
            </div>
          </section>

          <div class="auto-plan-validation" id="autoPlanValidation" aria-live="polite">Parameter werden geprüft.</div>
        </section>

        <section class="auto-plan-stage" id="autoPlanStage" hidden>
          <div class="auto-plan-visual">
            <canvas id="autoPlanCanvas" aria-hidden="true"></canvas>
            <div class="auto-plan-core">
              <strong id="autoPlanPercent">0</strong><span>%</span>
              <small id="autoPlanCoreLabel">Analyse</small>
            </div>
            <div class="auto-plan-orbit-legend" aria-hidden="true">
              <span class="auto-plan-orbit-label auto-plan-orbit-label--bd">BD innen</span>
              <span class="auto-plan-orbit-label auto-plan-orbit-label--hg">HG außen</span>
            </div>
            <div class="auto-plan-visual-foot">
              <span id="autoPlanElapsed">0 s</span>
              <span id="autoPlanRemaining"></span>
            </div>
          </div>

          <div class="auto-plan-console">
            <div class="auto-plan-phase-list" id="autoPlanPhaseList">${PHASES
              .map(([id, label]) => `<div class="auto-plan-phase" data-phase="${id}"><i></i><span>${label}</span><b>offen</b></div>`)
              .join('')}</div>
            <section class="auto-plan-log" aria-labelledby="autoPlanLogTitle">
              <div class="auto-plan-log-head">
                <span id="autoPlanLogTitle">Algorithmus-Kommentar</span>
                <b id="autoPlanLogCount">—</b>
              </div>
              <div class="auto-plan-log-stream" id="autoPlanLog" role="log" aria-live="polite" aria-relevant="additions"></div>
            </section>
            <p class="visually-hidden" id="autoPlanMessage">Monatszustand wird vorbereitet …</p>
            <div class="auto-plan-live-metrics">
              <div title="Zahl der Belegungsvarianten, die der Suchstrahl gerade parallel weiterverfolgt."><span>Varianten</span><strong id="autoPlanBeam">—</strong></div>
              <div title="Zahl der Personen, die für das zuletzt bearbeitete Dienstfeld regelkonform wählbar waren."><span>Kandidaten</span><strong id="autoPlanCandidates">—</strong></div>
              <div title="Zahl der vollständig bewerteten Zustände seit Beginn des Laufs."><span>Geprüft</span><strong id="autoPlanExplored">—</strong></div>
              <div title="Zustände, die als Sackgasse erkannt oder nach der Bewertung abgelehnt wurden."><span>Verworfen</span><strong id="autoPlanDeadEnds">—</strong></div>
              <div title="Zahl der übernommenen echten Verbesserungen des Gesamtplans."><span>Besser</span><strong id="autoPlanRepair">—</strong></div>
              <div title="Zahl der offenen BD- und HG-Felder, die dieser Lauf besetzen muss."><span>Felder</span><strong id="autoPlanFields">—</strong></div>
            </div>
          </div>
        </section>

        <section class="auto-plan-result" id="autoPlanResult" hidden>
          <div class="auto-plan-result-hero">
            <div class="auto-plan-seal" id="autoPlanSeal"><span>✓</span></div>
            <div>
              <div class="auto-plan-kicker" id="autoPlanResultKicker">Optimierung abgeschlossen</div>
              <h3 id="autoPlanResultTitle" tabindex="-1">Vorschlag bereit</h3>
              <p id="autoPlanResultText"></p>
              <div class="auto-plan-run-config" id="autoPlanRunConfig"></div>
            </div>
          </div>

          <div class="auto-plan-scorecards" id="autoPlanScorecards"></div>

          <section class="auto-plan-card auto-plan-panel">
            <div class="auto-plan-section-title"><span>Such-, Tausch- und Qualitätsnachweis</span><b id="autoPlanSearchProfile"></b></div>
            <div class="auto-plan-search-metrics" id="autoPlanSearchMetrics"></div>
          </section>

          <section class="auto-plan-card auto-plan-panel">
            <div class="auto-plan-section-title"><span>Monatsvorschlag in der Leserichtung der Diensttabelle</span><b id="autoPlanChangeCount"></b></div>
            <div class="auto-plan-change-list" id="autoPlanChangeList">
              <table class="auto-plan-proposal-table" id="autoPlanProposalTable">
                <thead>
                  <tr>
                    <th scope="col" class="auto-plan-day-number" title="Kalendertag des Monats, in derselben Leserichtung wie die Diensttabelle.">Tag</th>
                    <th scope="col">Wochentag</th>
                    <th scope="col" title="Bereitschaftsdienst des Tages. Vorschläge tragen die Marke Auto-Plan, bestehende Einträge die Marke Fixpunkt.">BD</th>
                    <th scope="col" title="Hintergrunddienst des Tages.">HG</th>
                    <th scope="col" title="Höchste Bewertungsstufe des Tages und sämtliche Regelgründe zum Aufklappen.">Prüfung</th>
                  </tr>
                </thead>
                <tbody id="autoPlanProposalBody"></tbody>
              </table>
            </div>
          </section>

          <section class="auto-plan-card auto-plan-panel">
            <div class="auto-plan-section-title"><span>Verteilungsbild und Sollausgleich</span><b>vorher → nachher</b></div>
            <div class="auto-plan-load-table" id="autoPlanLoadTable"></div>
          </section>

          <section class="auto-plan-red-review" id="autoPlanRedReview" hidden>
            <div class="auto-plan-red-review-head">
              <div><span>Bestätigungspflichtiger Fallback</span><h4>Rote Regelabweichungen einzeln prüfen</h4></div>
              <strong id="autoPlanRedCount"></strong>
            </div>
            <div class="auto-plan-red-list" id="autoPlanRedList"></div>
            <label class="auto-plan-comment-label">
              <span id="autoPlanOverrideCommentLabel">Gemeinsamer Kommentar</span>
              <textarea id="autoPlanOverrideComment" rows="3" placeholder="Begründung der bestätigten Minimal-Rot-Variante"></textarea>
            </label>
            <label class="auto-plan-confirm-red auto-plan-confirm-red--master">
              <input type="checkbox" id="autoPlanConfirmRed">
              <span>Alle einzeln markierten roten Regelabweichungen gemeinsam bestätigen.</span>
            </label>
          </section>

          <div class="auto-plan-confirm-note" id="autoPlanConfirmNote" aria-live="polite"></div>
        </section>
      </div>

      <footer class="auto-plan-footer">
        <button type="button" class="secondary" id="autoPlanCancelBtn" title="Bricht den Lauf ab und schließt das Studio. Am Monatsplan wird nichts verändert.">Abbrechen</button>
        <button type="button" class="auto-plan-start" id="autoPlanStartBtn" title="Startet die Optimierung mit den eingestellten Parametern. Bis zur ausdrücklichen Übernahme wird nichts geschrieben.">Optimierung starten</button>
        <button type="button" class="auto-plan-apply" id="autoPlanApplyBtn" hidden title="Prüft den Vorschlag erneut vollständig gegen alle Regeln und schreibt ihn dann in einem Zug in den Monatsplan.">Vorschläge übernehmen</button>
      </footer>
    </div>
  </dialog>`;
}

function createDialog() {
  const existing = byId('autoPlanDialog');
  if (existing) return existing;
  const holder = document.createElement('template');
  holder.innerHTML = template();
  document.body.append(holder.content);
  return byId('autoPlanDialog');
}

function planningStaff(monthData) {
  const unique = new Map();
  for (const dateIso of Object.keys(monthData.days || {}).sort()) {
    for (const person of getPlanningStaff(state.staff, dateIso)) unique.set(person.id, person);
  }
  return [...unique.values()];
}

/**
 * Die Zeilen der Obergrenzentabelle.
 *
 * Vorbelegt wird mit den festgelegten Laufvorgaben: die monatliche BD-Zahl je
 * Person und die HG-Sperre für alle, die im gesamten Monat an keinem Tag
 * HG-berechtigt sind. Beides bleibt frei änderbar; „Alle Grenzen leeren" setzt
 * sämtliche Felder auf unbegrenzt.
 */
function renderLimitRows(monthData, { reset = false } = {}) {
  const defaults = createDefaultAutoPlanConfig(state, monthData);
  byId('autoPlanLimitBody').innerHTML = planningStaff(monthData).map(person => {
    const bd = countRoleInMonth(monthData, person.id, 'bd');
    const hg = countRoleInMonth(monthData, person.id, 'hg');
    const limits = defaults.staffLimits?.[person.id] || {};
    const maxBd = reset || limits.maxBd === null || limits.maxBd === undefined ? '' : limits.maxBd;
    const maxHg = reset || limits.maxHg === null || limits.maxHg === undefined ? '' : limits.maxHg;
    const name = esc(person.short || person.name);
    const blocked = !reset && limits.maxHg === 0;
    return `<tr data-staff-id="${esc(person.id)}"${blocked ? ' class="is-hg-blocked"' : ''}>
      <th scope="row"><strong>${name}</strong><small>${esc(roleLabelForMonth(person, monthData.year, monthData.month))}</small></th>
      <td class="auto-plan-fixed-count">${bd}</td>
      <td><input data-limit="maxBd" type="number" min="${bd}" max="31" step="1" value="${maxBd}" aria-label="BD-Obergrenze ${name}" placeholder="∞"></td>
      <td class="auto-plan-fixed-count">${hg}</td>
      <td><input data-limit="maxHg" type="number" min="${hg}" max="31" step="1" value="${maxHg}" aria-label="HG-Obergrenze ${name}" placeholder="∞"></td>
      <td><input data-limit="maxTotal" type="number" min="${bd + hg}" max="62" step="1" aria-label="Gesamtobergrenze ${name}" placeholder="∞"></td>
    </tr>`;
  }).join('');
}

function renderConfig(monthData) {
  const defaults = createDefaultAutoPlanConfig(state, monthData);
  const staff = planningStaff(monthData);
  byId('autoPlanSearchIntensity').value = defaults.searchIntensity || 'deep';
  byId('autoPlanOptimizationFocus').value = defaults.optimizationFocus || 'balanced';
  byId('autoPlanAllowRed').checked = defaults.allowRedFallback !== false;
  byId('autoPlanPerfection').checked = true;
  byId('autoPlanMaxRed').value = defaults.maxRedViolations ?? '';
  syncIntensityDefaults({ force: true });
  renderLimitRows(monthData);

  const open = Object.values(monthData.days || {}).reduce((sum, day) => sum + Number(!day.bd) + Number(!day.hg), 0);
  const fixed = Object.values(monthData.days || {}).reduce((sum, day) => sum + Number(Boolean(day.bd)) + Number(Boolean(day.hg)), 0);
  byId('autoPlanConfigSummary').innerHTML = [
    ['Monat', getMonthLabel(monthData.year, monthData.month)],
    ['Offene BD/HG', String(open)],
    ['Geschützte Fixpunkte', String(fixed)],
    ['Planbarer Pool', `${staff.length} Personen`],
    ['Feiertagsregion', 'Sachsen']
  ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  syncConfigValidation();
}

const INTENSITY_PRESETS = Object.freeze({
  standard: { autoPlanTimeBudget: 45, autoPlanRepairIterations: 2, autoPlanLocalBudget: 2400, autoPlanLateAcceptance: 150 },
  deep: { autoPlanTimeBudget: 120, autoPlanRepairIterations: 3, autoPlanLocalBudget: 3200, autoPlanLateAcceptance: 400 },
  maximum: { autoPlanTimeBudget: 300, autoPlanRepairIterations: 4, autoPlanLocalBudget: 7000, autoPlanLateAcceptance: 800 }
});

/**
 * Die Suchintensität schlägt Werte für die abhängigen Felder vor.
 *
 * Ein selbst eingetragener Wert bleibt dabei erhalten: Wer den Zeitrahmen oder
 * die Rundenzahl bewusst gesetzt hat, verliert sie nicht dadurch, dass danach
 * noch die Intensität gewechselt wird. Nur beim Öffnen des Studios werden alle
 * Felder auf die Vorschlagswerte zurückgesetzt.
 */
function syncIntensityDefaults({ force = false } = {}) {
  const preset = INTENSITY_PRESETS[byId('autoPlanSearchIntensity').value] || INTENSITY_PRESETS.deep;
  for (const [id, value] of Object.entries(preset)) {
    const field = byId(id);
    if (!field) continue;
    if (!force && field.dataset.userSet === '1') continue;
    field.value = String(value);
    delete field.dataset.userSet;
  }
  syncTimeBudgetLabel();
}

function markUserSet(target) {
  if (target instanceof HTMLElement && INTENSITY_PRESETS.deep[target.id] !== undefined) {
    target.dataset.userSet = '1';
  }
}

function syncTimeBudgetLabel() {
  const seconds = Number(byId('autoPlanTimeBudget').value) || 0;
  byId('autoPlanTimeBudgetOut').textContent = seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`
    : `${seconds} s`;
}

function readConfig() {
  const staffLimits = {};
  for (const row of byId('autoPlanLimitBody').querySelectorAll('tr[data-staff-id]')) {
    const staffId = row.dataset.staffId;
    staffLimits[staffId] = {};
    for (const input of row.querySelectorAll('input[data-limit]')) {
      staffLimits[staffId][input.dataset.limit] = numberOrNull(input.value);
    }
  }
  return {
    searchIntensity: byId('autoPlanSearchIntensity').value,
    optimizationFocus: byId('autoPlanOptimizationFocus').value,
    allowRedFallback: byId('autoPlanAllowRed').checked,
    perfectionEnabled: byId('autoPlanPerfection').checked,
    maxRedViolations: numberOrNull(byId('autoPlanMaxRed').value),
    repairIterations: numberOrNull(byId('autoPlanRepairIterations').value) ?? 0,
    localRebuildBudget: numberOrNull(byId('autoPlanLocalBudget').value) ?? 3200,
    lateAcceptanceSize: numberOrNull(byId('autoPlanLateAcceptance').value) ?? 400,
    timeBudgetMs: (Number(byId('autoPlanTimeBudget').value) || 60) * 1000,
    staffLimits
  };
}

function syncConfigValidation() {
  if (!activeMonth) return false;
  const config = readConfig();
  const validation = validateAutoPlanConfig(state, activeMonth, config);
  const extra = [];
  if (config.repairIterations < 0 || config.repairIterations > 30) {
    extra.push('Iterative Reparaturrunden müssen zwischen 0 und 30 liegen.');
  }
  if (config.localRebuildBudget < 200 || config.localRebuildBudget > 12000) {
    extra.push('Das lokale Neuplanungsbudget muss zwischen 200 und 12.000 liegen.');
  }
  if (config.lateAcceptanceSize < 10 || config.lateAcceptanceSize > 5000) {
    extra.push('Das Late-Acceptance-Fenster muss zwischen 10 und 5.000 liegen.');
  }
  const errors = [...validation.errors, ...extra];
  const box = byId('autoPlanValidation');
  box.classList.toggle('invalid', errors.length > 0);
  box.innerHTML = errors.length
    ? `<div><strong>Start blockiert.</strong><ul>${errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul></div>`
    : `<div><strong>Parameter konsistent.</strong> Harte Grenzen, Fixpunkte und Suchprofil sind startbereit · Zeitrahmen ${byId('autoPlanTimeBudgetOut').textContent}.</div>`;
  byId('autoPlanStartBtn').disabled = errors.length > 0;
  for (const row of byId('autoPlanLimitBody').querySelectorAll('tr[data-staff-id]')) {
    const person = getStaffById(state.staff, row.dataset.staffId);
    const name = person?.short || person?.name || row.dataset.staffId;
    row.classList.toggle('is-invalid', validation.errors.some(error => error.startsWith(`${name}:`)));
  }
  return errors.length === 0;
}

/**
 * Die laufende Klartextkommentierung des Algorithmus.
 *
 * Sie ersetzt das frühere Feldraster. Das Raster zeigte, *dass* etwas passiert;
 * die Kommentierung zeigt, *was* – welcher Ausschnitt neu aufgebaut wurde,
 * welcher Tausch etwas gebracht hat, wie weit der Optimalitätsnachweis ist.
 */
const MAX_LOG_ENTRIES = 220;
let commentary;

function appendLogEntry({ kind, text, time }) {
  const stream = byId('autoPlanLog');
  if (!stream) return;
  const entry = document.createElement('p');
  entry.className = `auto-plan-log-entry is-${kind}`;
  entry.innerHTML = `<time>${esc(time)}</time><i></i><span>${text}</span>`;
  stream.append(entry);
  while (stream.childElementCount > MAX_LOG_ENTRIES) stream.firstElementChild.remove();
  byId('autoPlanLogCount').textContent = `${stream.childElementCount} Meldungen`;
  stream.scrollTop = stream.scrollHeight;
}

function resetLog() {
  byId('autoPlanLog')?.replaceChildren();
  const count = byId('autoPlanLogCount');
  if (count) count.textContent = '—';
}

function phasePosition(phase) {
  if (phase === 'complete' || phase === 'blocked') return PHASES.length;
  const normalized = PHASE_ALIASES[phase] === undefined ? phase : (PHASE_ALIASES[phase] || phase);
  const index = PHASES.findIndex(([id]) => id === normalized);
  return index < 0 ? 1 : index;
}

let highestPhase = 0;

/**
 * Das Phasenband läuft nur vorwärts. Mehrere parallele Läufe melden
 * unterschiedliche Stufen; ohne Sperre spränge die Anzeige zwischen ihnen.
 */
function renderPhases(phase) {
  const position = phasePosition(phase);
  highestPhase = Math.max(highestPhase, position);
  const active = highestPhase;
  document.querySelectorAll('#autoPlanPhaseList .auto-plan-phase').forEach((element, index) => {
    const status = index < active ? 'done' : index === active ? 'active' : 'pending';
    element.dataset.state = status;
    element.querySelector('b').textContent = status === 'done' ? 'erledigt' : status === 'active' ? 'läuft' : 'offen';
  });
}

/**
 * Fortschritt mehrerer paralleler Suchläufe.
 *
 * Angezeigt wird der jeweils weiteste Lauf; Zählwerte werden über alle Läufe
 * summiert. Ohne diese Zusammenführung sprängen Balken und Kennzahlen bei jedem
 * eintreffenden Ereignis zwischen den Läufen hin und her.
 */
const searchProgress = new Map();
let searchStage = '';

function mergeSearchProgress(update) {
  // Beim Wechsel von Aufbau auf Perfektion beginnen neue Läufe mit eigenen
  // Zählwerten. Ohne Zurücksetzen summierten sich die Stände beider Phasen.
  if (update.stage && update.stage !== searchStage) {
    searchStage = update.stage;
    searchProgress.clear();
  }
  const index = Number.isInteger(update.searchIndex) ? update.searchIndex : 0;
  searchProgress.set(index, update);
  if (searchProgress.size <= 1) return update;
  let leader = update;
  let explored = 0;
  let improvements = 0;
  for (const entry of searchProgress.values()) {
    if ((Number(entry.progress) || 0) > (Number(leader.progress) || 0)) leader = entry;
    explored += Number(entry.exploredNodes ?? entry.evaluations) || 0;
    improvements += Number(entry.improvements) || 0;
  }
  return { ...leader, exploredNodes: explored, evaluations: explored, improvements };
}

function updateProgress(rawUpdate) {
  const update = mergeSearchProgress(rawUpdate);
  const percent = Math.round(Math.max(0, Math.min(1, Number(update.progress) || 0)) * 100);
  dialog.dataset.phase = update.phase || 'search';
  byId('autoPlanPercent').textContent = String(percent);
  byId('autoPlanCoreLabel').textContent = update.phase === 'search' && update.subphase
    ? update.subphase.toUpperCase()
    : CORE_LABELS[update.phase] || 'Optimierung';
  byId('autoPlanMessage').textContent = update.message || 'Optimierung läuft …';

  const setMetric = (id, value) => {
    if (value !== undefined) byId(id).textContent = formatNumber(value);
  };
  setMetric('autoPlanBeam', update.beamSize);
  setMetric('autoPlanCandidates', update.candidateCount);
  setMetric('autoPlanExplored', update.exploredNodes ?? update.evaluations);
  setMetric('autoPlanDeadEnds', update.deadEnds ?? update.rejected);
  if (update.improvements !== undefined) byId('autoPlanRepair').textContent = `+${formatNumber(update.improvements)}`;
  if (update.total !== undefined) byId('autoPlanFields').textContent = String(update.total);
  if (update.remainingMs !== undefined) {
    byId('autoPlanRemaining').textContent = update.remainingMs > 0
      ? `Perfektion noch ${formatDuration(update.remainingMs)}`
      : '';
  }

  document.querySelector('.auto-plan-shell')?.style.setProperty('--auto-progress', `${percent}%`);
  renderPhases(update.phase);

  commentary?.observe(update);
  visualizer?.update(update);
}

function staffLabel(staffId) {
  const person = getStaffById(state.staff, staffId);
  return person?.short || assignmentLabel(state.staff, staffId, { short: true }) || staffId || 'offen';
}

function auditMap(result) {
  return new Map((result.audit || []).map(item => [`${item.dateIso}|${item.role}`, item]));
}

function roleCell(result, audits, dateIso, role) {
  const before = result.baseline.days?.[dateIso]?.[role] || '';
  const after = result.plannedMonth.days?.[dateIso]?.[role] || '';
  const proposed = !before && Boolean(after);
  const audit = audits.get(`${dateIso}|${role}`);
  const level = proposed ? (audit?.level || 'green') : before ? 'fixed' : 'open';
  const reasons = proposed ? (audit?.reasons || []) : [];
  return `<div class="auto-plan-assignment-cell ${esc(level)} ${proposed ? 'proposed' : before ? 'fixed' : 'open'}">
    <div class="auto-plan-person-line">
      <strong>${esc(after ? staffLabel(after) : 'offen')}</strong>
      <span class="auto-plan-source-pill">${proposed ? 'Auto-Plan' : before ? 'Fixpunkt' : 'offen'}</span>
    </div>
    <div class="auto-plan-cell-state"><i></i><span>${esc(level === 'fixed' ? 'bestehend' : level)}</span></div>
    ${reasons.length ? `<details class="auto-plan-cell-reasons"><summary>${reasons.length} Regelhinweis${reasons.length === 1 ? '' : 'e'}</summary><ul>${reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

function rowLevel(audits, dateIso) {
  const levels = ['bd', 'hg'].map(role => audits.get(`${dateIso}|${role}`)?.level).filter(Boolean);
  return levels.length ? levels.sort((a, b) => (LEVEL_ORDER[b] ?? -1) - (LEVEL_ORDER[a] ?? -1))[0] : 'fixed';
}

function rowReview(result, audits, dateIso) {
  const items = ['bd', 'hg'].map(role => ({ role, audit: audits.get(`${dateIso}|${role}`) })).filter(item => item.audit);
  if (!items.length) return '<span class="auto-plan-row-status fixed">Fixpunkte</span>';
  const highest = rowLevel(audits, dateIso);
  const details = items.filter(item => item.audit.reasons?.length).map(item =>
    `<section><strong>${item.role.toUpperCase()} · ${esc(item.audit.level)}</strong><ul>${item.audit.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></section>`).join('');
  return `<div class="auto-plan-row-review">
    <span class="auto-plan-row-status ${esc(highest)}">${items.length} Vorschläge · ${esc(highest)}</span>
    ${details ? `<details><summary>Regelgründe des Tages</summary>${details}</details>` : ''}
  </div>`;
}

const LONG_WEEKDAYS = Object.freeze({
  Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag',
  Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag'
});

/**
 * Der Vorschlag in der Form der Diensttabelle.
 *
 * Übernommen sind bewusst auch die Kleinigkeiten, an denen die Ansicht sonst
 * fremd wirkt: die Tagesnummer ohne führende Null, der ausgeschriebene
 * Wochentag und dieselbe Unterscheidung von Samstag, Sonntag und Feiertag.
 * Die Spalten RBN und 2. RBN fehlen, weil der Auto-Plan sie nicht plant; an
 * ihre Stelle tritt die Prüfspalte.
 */
function renderProposalTable(result) {
  const audits = auditMap(result);
  byId('autoPlanProposalBody').innerHTML = Object.keys(result.plannedMonth.days || {}).sort().map(dateIso => {
    const holiday = holidayName(dateIso);
    const short = weekdayLabel(dateIso);
    const level = rowLevel(audits, dateIso);
    const flags = [
      short === 'Sa' ? 'saturday-row' : '',
      short === 'So' ? 'sunday-row' : '',
      holiday ? 'holiday-row' : ''
    ].filter(Boolean).join(' ');
    return `<tr id="auto-plan-row-${dateIso}" data-level="${esc(level)}" class="${flags}"${holiday ? ` title="${esc(holiday)}"` : ''}>
      <th scope="row" class="auto-plan-day-number"><strong>${Number(dateIso.slice(-2))}</strong></th>
      <td class="auto-plan-weekday"><span>${esc(LONG_WEEKDAYS[short] || short)}</span>${holiday ? `<small class="auto-plan-holiday-name">${esc(holiday)}</small>` : `<small>${esc(fmtGermanDate(dateIso))}</small>`}</td>
      <td>${roleCell(result, audits, dateIso, 'bd')}</td>
      <td>${roleCell(result, audits, dateIso, 'hg')}</td>
      <td>${rowReview(result, audits, dateIso)}</td>
    </tr>`;
  }).join('');
}

function renderLoadTable(result) {
  const rows = planningStaff(result.plannedMonth).map(person => {
    const beforeBd = countRoleInMonth(result.baseline, person.id, 'bd');
    const afterBd = countRoleInMonth(result.plannedMonth, person.id, 'bd');
    const beforeHg = countRoleInMonth(result.baseline, person.id, 'hg');
    const afterHg = countRoleInMonth(result.plannedMonth, person.id, 'hg');
    const target = Number(person.bdTarget || 0);
    return { person, beforeBd, afterBd, beforeHg, afterHg, target,
      beforeTotal: beforeBd + beforeHg,
      afterTotal: afterBd + afterHg,
      beforeWeekend: computeWeekendEquivalent(result.baseline, person.id),
      afterWeekend: computeWeekendEquivalent(result.plannedMonth, person.id) };
  });
  byId('autoPlanLoadTable').innerHTML = `<table class="auto-plan-distribution-table">
    <thead><tr><th scope="col">Person</th><th scope="col">BD</th><th scope="col">HG</th><th scope="col">Gesamt</th><th scope="col">WE</th><th scope="col">BD-Soll</th></tr></thead>
    <tbody>${rows.map(row => {
      const delta = row.target ? row.afterBd - row.target : 0;
      const tone = !row.target ? '' : delta === 0 ? 'on-target' : delta > 0 ? 'over-target' : 'under-target';
      return `<tr class="${tone}">
        <th scope="row">${esc(row.person.short || row.person.name)}</th>
        <td>${row.beforeBd}<i>→</i><strong>${row.afterBd}</strong></td>
        <td>${row.beforeHg}<i>→</i><strong>${row.afterHg}</strong></td>
        <td>${row.beforeTotal}<i>→</i><strong>${row.afterTotal}</strong></td>
        <td>${row.beforeWeekend.toFixed(1)}<i>→</i><strong>${row.afterWeekend.toFixed(1)}</strong></td>
        <td>${row.target || '—'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function renderSearch(result) {
  const metrics = result.metrics || {};
  const iterative = metrics.iterative || {};
  const optimizer = metrics.optimizer || {};
  const entries = [
    // Nicht mit den parallelen Suchläufen verwechseln: gezählt werden die
    // Aufbauversuche des Gewinnerlaufs bis zu seiner ersten gültigen Belegung.
    ['Aufbauversuche', String(metrics.attempts?.length || 0), ''],
    ['Varianten geprüft', formatNumber(metrics.exploredNodes), ''],
    ['Nachfolger', formatNumber(metrics.generatedNodes), ''],
    ['Sackgassen', formatNumber(metrics.deadEnds), ''],
    ['Exakte Restknoten', formatNumber(metrics.exactNodes), ''],
    ['Tauschrunden', String(iterative.rounds || 0), 'iterative'],
    ['Nachbarschaften', formatNumber(iterative.neighbors), 'iterative'],
    ['Lokale Neuplanungen', `${iterative.localRebuilds || 0} · ${formatNumber(iterative.localNodes)} Knoten`, 'iterative'],
    ['Perfektionsrunden', formatNumber(optimizer.rounds), 'perfect'],
    ['Züge geprüft', formatNumber(optimizer.moves), 'perfect'],
    ['Vollbewertungen', formatNumber(optimizer.evaluations), 'perfect'],
    ['Angenommen', formatNumber(optimizer.accepted), 'perfect'],
    ['Neustarts', formatNumber(optimizer.restarts), 'perfect'],
    ['Verbesserungen', formatNumber(optimizer.improvements), 'perfect'],
    ['Zertifizierungszüge', formatNumber(optimizer.certificationMoves), 'certify'],
    ['Optimalitätsnachweis', optimizer.certified ? 'bestanden' : optimizer.skipped ? 'nicht ausgeführt' : 'offen', 'certify'],
    ['Laufzeit', `${formatNumber(result.elapsedMs)} ms`, '']
  ];
  byId('autoPlanSearchProfile').textContent = result.searchProfile || '—';
  byId('autoPlanSearchMetrics').innerHTML = entries
    .map(([label, value, cls]) => `<div class="${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join('');
}

function renderRunConfig(result) {
  const config = result.runConfig || {};
  const iterative = result.iterativeConfig || {};
  const optimizer = result.optimizerConfig || {};
  byId('autoPlanRunConfig').innerHTML = [
    ['Suche', config.searchIntensity],
    ['Fokus', config.optimizationFocus],
    ['Rote Fallbacks', config.allowRedFallback ? 'erlaubt' : 'gesperrt'],
    ['Reparaturrunden', iterative.repairIterations],
    ['Neuplanungsbudget', iterative.localRebuildBudget],
    ['Zeitrahmen', formatDuration(optimizer.timeBudgetMs)],
    ['Late-Acceptance', optimizer.lateAcceptanceSize]
  ].filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => `<span>${esc(label)}: <b>${esc(value)}</b></span>`).join('');
}

function renderRedReview(result) {
  const review = byId('autoPlanRedReview');
  const required = result.requiresConfirmation && result.redViolations.length;
  review.hidden = !required;
  dialog.classList.toggle('requires-confirmation', Boolean(required));
  byId('autoPlanConfirmRed').checked = false;
  byId('autoPlanConfirmRed').indeterminate = false;
  byId('autoPlanOverrideComment').value = '';
  if (!required) return;
  const special = result.redViolations.some(violation => violation.confirmationType === 'special');
  byId('autoPlanOverrideComment').required = special;
  byId('autoPlanOverrideCommentLabel').textContent = special
    ? 'Begründender Kommentar, für besondere Ausnahmen erforderlich'
    : 'Gemeinsamer Kommentar, optional';
  byId('autoPlanRedCount').textContent = `${result.redViolations.length} rot`;
  byId('autoPlanRedList').innerHTML = result.redViolations.map((violation, index) => `<article class="auto-plan-red-item">
    <div class="auto-plan-red-item-main">
      <div><time>${esc(weekdayLabel(violation.dateIso))}, ${esc(fmtGermanDate(violation.dateIso))}</time><strong>${violation.role.toUpperCase()} · ${esc(staffLabel(violation.staffId))}</strong></div>
      <span>${violation.confirmationType === 'special' ? 'besondere Bestätigung' : 'Bestätigung'}</span>
    </div>
    <ul>${violation.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
    <div class="auto-plan-red-item-actions">
      <label><input type="checkbox" data-red-check="${index}"><span>Diese Abweichung geprüft</span></label>
      <button type="button" class="secondary" data-jump="${esc(violation.dateIso)}">In Tabelle zeigen</button>
    </div>
  </article>`).join('');
}

function allRedConfirmed() {
  const checks = [...document.querySelectorAll('[data-red-check]')];
  return checks.length > 0 && checks.every(check => check.checked);
}

function syncRed() {
  if (!proposal?.requiresConfirmation) return;
  const master = byId('autoPlanConfirmRed');
  const checks = [...document.querySelectorAll('[data-red-check]')];
  const checked = checks.filter(check => check.checked).length;
  master.checked = checks.length > 0 && checked === checks.length;
  master.indeterminate = checked > 0 && checked < checks.length;
  const special = proposal.redViolations.some(violation => violation.confirmationType === 'special');
  const comment = byId('autoPlanOverrideComment').value.trim();
  const ready = allRedConfirmed() && (!special || comment);
  byId('autoPlanApplyBtn').disabled = !ready;
  byId('autoPlanConfirmNote').textContent = ready
    ? 'Alle roten Abweichungen sind geprüft. Erst der Übernahmebutton schreibt den Plan.'
    : `${checked}/${checks.length} rote Abweichungen geprüft${special && !comment ? ' · Begründung erforderlich' : ''}.`;
}

function scorecards(result) {
  const metrics = result.metrics;
  const warning = result.requiresConfirmation;
  const before = metrics.qualityBefore;
  const cards = [
    ['Regel-Audit', warning ? `${metrics.red} rot` : result.complete ? '0 rot' : `${metrics.gray} gesperrt`,
      warning ? 'warning' : result.complete ? 'verified' : 'failed'],
    ['Fairness', `${metrics.fairnessIndex}%`, 'fair'],
    ['Wünsche', `${metrics.wishesFulfilled}/${metrics.wishesPossible}`, 'wish'],
    ['Vorschläge', String(metrics.proposed), 'count'],
    ['Hinweise', `${metrics.yellow} gelb · ${metrics.orange} orange`, 'notes'],
    ['Optimalität', result.certified ? 'zertifiziert' : metrics.optimizer?.skipped ? 'ohne Perfektion' : 'zeitbegrenzt',
      result.certified ? 'verified' : 'notes']
  ];
  if (before) {
    cards.push(['Gewinn durch Perfektion',
      `${before.yellow - metrics.yellow >= 0 ? '−' : '+'}${Math.abs(before.yellow - metrics.yellow)} gelb`,
      'search']);
  }
  return cards;
}

function renderResult(result) {
  dialog.classList.remove('is-running', 'is-configuring');
  dialog.classList.add('show-result');
  dialog.dataset.phase = result.complete ? 'complete' : 'blocked';
  byId('autoPlanStage').hidden = true;
  byId('autoPlanResult').hidden = false;
  byId('autoPlanBody').scrollTop = 0;

  const warning = result.requiresConfirmation;
  const seal = byId('autoPlanSeal');
  seal.classList.toggle('warning', warning);
  seal.classList.toggle('failed', !result.complete);
  seal.querySelector('span').textContent = !result.complete ? '!' : warning ? '⚠' : '✓';

  byId('autoPlanResultKicker').textContent = !result.complete
    ? 'Planung blockiert'
    : warning ? 'Minimal-Rot-Fallback abgeschlossen' : 'Optimierung abgeschlossen';
  byId('autoPlanResultTitle').textContent = !result.complete
    ? 'Keine vollständige technisch wählbare Belegung'
    : warning ? 'Vollständige Belegung mit roten Ausnahmen' : 'Regelkonformer Vorschlag bereit';
  byId('autoPlanResultText').textContent = !result.complete
    ? `${result.metrics.unfilled} Felder blieben unbesetzt.`
    : warning
      ? 'Die vollständig tabellarisch dargestellte Lösung minimiert rote Abweichungen und benötigt deren ausdrückliche Prüfung.'
      : `${result.changes.length} offene Felder wurden ohne rote oder nicht überschreibbare Regelverletzung global optimiert${result.certified ? ' und als nicht weiter verbesserbar zertifiziert' : ''}.`;

  byId('autoPlanScorecards').innerHTML = scorecards(result)
    .map(([label, value, tone]) => `<div class="auto-plan-scorecard ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join('');
  byId('autoPlanChangeCount').textContent = `${result.changes.length} neue Einträge · ${Object.keys(result.plannedMonth.days || {}).length} Tageszeilen`;

  renderRunConfig(result);
  renderSearch(result);
  renderProposalTable(result);
  renderLoadTable(result);
  renderRedReview(result);

  const apply = byId('autoPlanApplyBtn');
  apply.hidden = !result.complete || !result.changes.length;
  apply.disabled = warning;
  apply.textContent = warning ? 'Geprüfte rote Ausnahmen übernehmen' : 'Vorschläge übernehmen';
  byId('autoPlanStartBtn').hidden = true;
  byId('autoPlanCancelBtn').textContent = result.complete ? 'Vorschläge verwerfen' : 'Schließen';
  byId('autoPlanConfirmNote').textContent = !result.complete
    ? 'Es wurde nichts geschrieben.'
    : 'Der Monatsplan bleibt bis zur ausdrücklichen Übernahme unverändert.';
  if (warning) syncRed();
  requestAnimationFrame(() => byId('autoPlanResultTitle').focus({ preventScroll: true }));
}

function resetProgress(monthData) {
  proposal = null;
  dialog.classList.remove('show-result', 'requires-confirmation', 'is-running');
  dialog.classList.add('is-configuring');
  dialog.dataset.phase = 'analysis';
  byId('autoPlanConfig').hidden = false;
  byId('autoPlanStage').hidden = true;
  byId('autoPlanResult').hidden = true;
  byId('autoPlanStartBtn').hidden = false;
  byId('autoPlanApplyBtn').hidden = true;
  byId('autoPlanCancelBtn').textContent = 'Abbrechen';
  byId('autoPlanPercent').textContent = '0';
  byId('autoPlanMessage').textContent = 'Monatszustand wird vorbereitet …';
  byId('autoPlanElapsed').textContent = '0 s';
  byId('autoPlanRemaining').textContent = '';
  for (const id of ['autoPlanBeam', 'autoPlanCandidates', 'autoPlanExplored', 'autoPlanDeadEnds', 'autoPlanRepair', 'autoPlanFields']) {
    byId(id).textContent = '—';
  }
  byId('autoPlanBody').scrollTop = 0;
  stopClock();
  searchProgress.clear();
  searchStage = '';
  highestPhase = 0;
  renderPhases('analysis');
  resetLog();
  visualizer?.stop();
  visualizer = null;
  renderConfig(monthData);
}

function openStudio() {
  triggerFocus = document.activeElement;
  activeMonth = getMonthData(state.currentYear, state.currentMonth);
  resetProgress(activeMonth);
  byId('autoPlanSubtitle').textContent = `${getMonthLabel(activeMonth.year, activeMonth.month)} · zuerst Grenzen und Suchprofil festlegen`;
  dialog.showModal();
  requestAnimationFrame(() => byId('autoPlanTitle').focus({ preventScroll: true }));
}

async function startPlanner() {
  if (!syncConfigValidation()) return;
  const runConfig = readConfig();
  dialog.classList.remove('is-configuring');
  dialog.classList.add('is-running');
  dialog.dataset.phase = 'analysis';
  byId('autoPlanConfig').hidden = true;
  byId('autoPlanStage').hidden = false;
  byId('autoPlanSubtitle').textContent = workersAvailable()
    ? `${getMonthLabel(activeMonth.year, activeMonth.month)} · ${parallelSearchCount()} parallele Suchläufe auf eigenen Kernen`
    : `${getMonthLabel(activeMonth.year, activeMonth.month)} · Optimierung läuft`;
  byId('autoPlanStartBtn').hidden = true;
  byId('autoPlanBody').scrollTop = 0;
  trigger.disabled = true;
  controller?.abort();
  controller = new AbortController();
  visualizer?.stop();
  visualizer = new AutoPlanVisualizer(byId('autoPlanCanvas'), activeMonth);
  startClock();

  resetLog();
  commentary = new AlgorithmCommentary({ onEntry: appendLogEntry });
  const open = Object.values(activeMonth.days || {}).reduce((sum, day) => sum + Number(!day.bd) + Number(!day.hg), 0);
  const fixed = Object.values(activeMonth.days || {}).reduce((sum, day) => sum + Number(Boolean(day.bd)) + Number(Boolean(day.hg)), 0);
  commentary.begin({ open, fixed, searches: workersAvailable() ? parallelSearchCount() : 1 });

  try {
    proposal = await runAutoPlan({
      state,
      monthData: activeMonth,
      year: activeMonth.year,
      month: activeMonth.month,
      runConfig,
      signal: controller.signal,
      onProgress: update => updateProgress(update)
    });
    // Kurz stehen lassen: Der Balken erreicht sichtbar hundert Prozent, bevor
    // die Ansicht auf das Ergebnis wechselt.
    commentary?.finish(proposal);
    await new Promise(resolve => setTimeout(resolve, 620));
    renderResult(proposal);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    proposal = {
      success: false, complete: false, requiresConfirmation: false, status: 'blocked',
      changes: [], redViolations: [], baseline: activeMonth, plannedMonth: activeMonth, audit: [],
      runConfig,
      iterativeConfig: { repairIterations: runConfig.repairIterations, localRebuildBudget: runConfig.localRebuildBudget },
      optimizerConfig: { timeBudgetMs: runConfig.timeBudgetMs },
      metrics: {
        proposed: 0, unfilled: 0, red: 0, specialRed: 0, gray: 0, orange: 0, yellow: 0,
        wishesFulfilled: 0, wishesPossible: 0, fairnessIndex: 0, attempts: [], iterative: {}, optimizer: {}
      }
    };
    updateProgress({ phase: 'blocked', progress: 1, message: error?.message || 'Auto-Plan fehlgeschlagen' });
    renderResult(proposal);
  } finally {
    trigger.disabled = false;
    stopClock();
    visualizer?.finish();
    document.body.classList.remove('auto-plan-running');
  }
}

async function applyProposal() {
  if (!proposal?.success || !proposal.complete || !proposal.changes.length) return;
  const confirmation = proposal.requiresConfirmation
    ? { accepted: allRedConfirmed(), comment: byId('autoPlanOverrideComment').value.trim() }
    : null;
  if (proposal.requiresConfirmation && !confirmation.accepted) {
    syncRed();
    return;
  }
  const button = byId('autoPlanApplyBtn');
  button.disabled = true;
  button.textContent = 'Übernahme wird erneut geprüft und gesichert …';
  try {
    const current = getMonthData(proposal.year, proposal.month);
    const merged = applyAutoPlanProposal({ state, currentMonth: current, proposal, confirmation });
    setMonthData(proposal.year, proposal.month, merged, 'local');
    markMonthDirty(proposal.year, proposal.month);
    const saved = await persistMonth(proposal.year, proposal.month);
    byId('autoPlanConfirmNote').textContent = saved.ok
      ? 'Auto-Plan vollständig übernommen, protokolliert und gespeichert.'
      : 'Lokal übernommen · Serversynchronisierung ausstehend.';
    await new Promise(resolve => setTimeout(resolve, 520));
    dialog.close('applied');
    byId('reloadBtn')?.click();
  } catch (error) {
    button.disabled = proposal.requiresConfirmation && !allRedConfirmed();
    button.textContent = proposal.requiresConfirmation ? 'Geprüfte rote Ausnahmen übernehmen' : 'Vorschläge übernehmen';
    byId('autoPlanConfirmNote').textContent = error?.message || 'Übernahme nicht möglich.';
  }
}

function closeStudio() {
  controller?.abort();
  controller = null;
  stopClock();
  visualizer?.stop();
  visualizer = null;
  dialog.close('cancel');
}

function bind() {
  trigger.addEventListener('click', openStudio);
  byId('autoPlanCloseBtn').addEventListener('click', closeStudio);
  byId('autoPlanCancelBtn').addEventListener('click', closeStudio);
  byId('autoPlanStartBtn').addEventListener('click', startPlanner);
  byId('autoPlanApplyBtn').addEventListener('click', applyProposal);

  byId('autoPlanConfig').addEventListener('input', event => {
    markUserSet(event.target);
    if (event.target === byId('autoPlanTimeBudget')) syncTimeBudgetLabel();
    syncConfigValidation();
  });
  byId('autoPlanSearchIntensity').addEventListener('change', () => {
    syncIntensityDefaults();
    syncConfigValidation();
  });
  byId('autoPlanConfig').addEventListener('change', syncConfigValidation);
  byId('autoPlanLimitReset').addEventListener('click', () => {
    renderLimitRows(activeMonth);
    syncConfigValidation();
  });
  byId('autoPlanLimitClear').addEventListener('click', () => {
    renderLimitRows(activeMonth, { reset: true });
    syncConfigValidation();
  });

  byId('autoPlanRedReview').addEventListener('change', event => {
    if (event.target === byId('autoPlanConfirmRed')) {
      document.querySelectorAll('[data-red-check]').forEach(check => { check.checked = event.target.checked; });
    }
    syncRed();
  });
  byId('autoPlanOverrideComment').addEventListener('input', syncRed);
  byId('autoPlanRedList').addEventListener('click', event => {
    const button = event.target.closest('[data-jump]');
    if (!button) return;
    const row = byId(`auto-plan-row-${button.dataset.jump}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.classList.add('auto-plan-jump-highlight');
    setTimeout(() => row?.classList.remove('auto-plan-jump-highlight'), 1400);
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeStudio();
  });
  dialog.addEventListener('close', () => {
    controller?.abort();
    controller = null;
    stopClock();
    visualizer?.stop();
    visualizer = null;
    triggerFocus?.focus?.();
  });
}

function initialize() {
  if (installed) return;
  installStylesheets();
  const attempt = () => {
    trigger = createTrigger();
    if (!trigger) {
      setTimeout(attempt, 80);
      return;
    }
    dialog = createDialog();
    bind();
    installed = true;
  };
  requestAnimationFrame(attempt);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
