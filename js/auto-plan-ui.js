import { applyAutoPlanProposal, buildAutoPlan } from './auto-planner.js?v=20260801.11';
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
  getPlanningStaff,
  getStaffById,
  weekdayLabel
} from './rules.js?v=20260801.11';

const RELEASE = '20260801.11';
const PHASES = Object.freeze([
  ['analysis', 'Fixpunkte'],
  ['bd', 'BD-Optimierung'],
  ['hg', 'HG-Optimierung'],
  ['polish', 'Fairness-Politur'],
  ['audit', 'Regel-Audit']
]);
const ICON = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M12 2 14.2 7.8 20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2Z"/>'
  + '<path d="m18 16 .9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9L18 16Z"/>'
  + '</svg>';

let dialog = null;
let trigger = null;
let controller = null;
let proposal = null;
let visualizer = null;
let installed = false;

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function installStylesheets() {
  const files = ['/auto-plan.css', '/auto-plan-review.css'];
  for (const href of files) {
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
  button.title = 'Alle noch offenen BD und HG fair und regelgebunden automatisch planen';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = `${ICON}<span class="tool-label">Auto-Plan</span><span class="auto-plan-spark" aria-hidden="true"></span>`;
  actions.insertBefore(button, actions.children[1] || null);
  window.dispatchEvent(new Event('resize'));
  return button;
}

function dialogTemplate() {
  return `<dialog id="autoPlanDialog" class="auto-plan-dialog" aria-labelledby="autoPlanTitle">
    <div class="auto-plan-shell">
      <header class="auto-plan-header">
        <div>
          <div class="auto-plan-kicker">Constraint Intelligence · Globaler Monatslauf</div>
          <h2 id="autoPlanTitle">Auto-Plan Studio</h2>
          <p id="autoPlanSubtitle">Regelgebundene Verteilung aller offenen BD und HG</p>
        </div>
        <button type="button" class="auto-plan-close" id="autoPlanCloseBtn" aria-label="Auto-Plan schließen">✕</button>
      </header>

      <section class="auto-plan-stage" id="autoPlanStage">
        <div class="auto-plan-visual">
          <canvas id="autoPlanCanvas" aria-hidden="true"></canvas>
          <div class="auto-plan-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="auto-plan-core">
            <strong id="autoPlanPercent">0</strong><span>%</span>
            <small id="autoPlanCoreLabel">Analyse</small>
          </div>
        </div>

        <div class="auto-plan-console">
          <div class="auto-plan-phase-list" id="autoPlanPhaseList">
            ${PHASES.map(([id, label]) => `<div class="auto-plan-phase" data-phase="${id}"><i></i><span>${label}</span><b>offen</b></div>`).join('')}
          </div>
          <div class="auto-plan-message" aria-live="polite">
            <span class="auto-plan-message-dot"></span><span id="autoPlanMessage">Monatszustand wird vorbereitet …</span>
          </div>
          <div class="auto-plan-grid" id="autoPlanGrid" aria-label="Fortschritt je Dienstfeld"></div>
          <div class="auto-plan-live-metrics">
            <div><span>Varianten</span><strong id="autoPlanBeam">—</strong></div>
            <div><span>Kandidaten</span><strong id="autoPlanCandidates">—</strong></div>
            <div><span>Fixpunkte</span><strong id="autoPlanFixed">—</strong></div>
            <div><span>Felder</span><strong id="autoPlanFields">—</strong></div>
          </div>
        </div>
      </section>

      <section class="auto-plan-result" id="autoPlanResult" hidden>
        <div class="auto-plan-result-hero">
          <div class="auto-plan-seal" id="autoPlanSeal"><span>✓</span></div>
          <div>
            <div class="auto-plan-kicker" id="autoPlanResultKicker">Optimierung abgeschlossen</div>
            <h3 id="autoPlanResultTitle">Vorschlag bereit</h3>
            <p id="autoPlanResultText"></p>
          </div>
        </div>
        <div class="auto-plan-scorecards" id="autoPlanScorecards"></div>
        <div class="auto-plan-preview-grid">
          <section>
            <div class="auto-plan-section-title"><span>Vorschläge</span><b id="autoPlanChangeCount"></b></div>
            <div class="auto-plan-change-list" id="autoPlanChangeList"></div>
          </section>
          <section>
            <div class="auto-plan-section-title"><span>Verteilungsbild</span><b>vorher → nachher</b></div>
            <div class="auto-plan-load-table" id="autoPlanLoadTable"></div>
          </section>
        </div>

        <section class="auto-plan-red-review" id="autoPlanRedReview" hidden aria-labelledby="autoPlanRedReviewTitle">
          <div class="auto-plan-red-review-head">
            <div>
              <span>Bestätigungspflichtiger Fallback</span>
              <h4 id="autoPlanRedReviewTitle">Rote Regelabweichungen einzeln prüfen</h4>
            </div>
            <strong id="autoPlanRedCount"></strong>
          </div>
          <div class="auto-plan-red-list" id="autoPlanRedList"></div>
          <label class="auto-plan-comment-label" for="autoPlanOverrideComment">
            Gemeinsamer Kommentar zur Entscheidung
            <textarea id="autoPlanOverrideComment" rows="2" placeholder="Optionaler Grund für die bestätigte Minimal-Rot-Variante"></textarea>
          </label>
          <label class="auto-plan-confirm-red">
            <input type="checkbox" id="autoPlanConfirmRed">
            <span>Ich habe sämtliche oben aufgeführten roten Regelabweichungen geprüft und bestätige ihre gemeinsame Übernahme.</span>
          </label>
        </section>

        <div class="auto-plan-confirm-note" id="autoPlanConfirmNote"></div>
      </section>

      <footer class="auto-plan-footer">
        <button type="button" class="secondary" id="autoPlanCancelBtn">Abbrechen</button>
        <button type="button" class="auto-plan-apply" id="autoPlanApplyBtn" hidden>Vorschläge übernehmen</button>
      </footer>
    </div>
  </dialog>`;
}

function createDialog() {
  const existing = byId('autoPlanDialog');
  if (existing) return existing;
  const template = document.createElement('template');
  template.innerHTML = dialogTemplate();
  document.body.append(template.content);
  return byId('autoPlanDialog');
}

class ConstraintVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.progress = 0;
    this.active = true;
    this.frame = 0;
    this.nodes = Array.from({ length: 62 }, (_, index) => ({
      angle: Math.PI * 2 * index / 62,
      radius: .58 + ((index * 17) % 13) / 44,
      pulse: 0
    }));
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    this.observer?.observe(canvas);
    this.resize();
    this.draw();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  update(progress, processed) {
    this.progress = Math.max(this.progress, Math.min(1, Number(progress) || 0));
    if (Number.isInteger(processed) && processed > 0) {
      this.nodes[Math.min(this.nodes.length - 1, processed - 1)].pulse = 1;
    }
  }

  stop() {
    this.active = false;
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  draw() {
    if (!this.active) return;
    const rect = this.canvas.getBoundingClientRect();
    const context = this.context;
    const width = rect.width;
    const height = rect.height;
    const cx = width / 2;
    const cy = height / 2;
    const size = Math.min(width, height) * .43;
    const time = performance.now() / 1000;
    const processed = Math.round(this.progress * this.nodes.length);

    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, size * 1.3);
    glow.addColorStop(0, 'rgba(126,175,255,.2)');
    glow.addColorStop(.55, 'rgba(111,93,255,.08)');
    glow.addColorStop(1, 'rgba(20,28,48,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(cx, cy, size * 1.3, 0, Math.PI * 2);
    context.fill();

    for (const [index, node] of this.nodes.entries()) {
      const drift = Math.sin(time * .7 + index * .41) * .025;
      const radius = size * (node.radius + drift);
      const angle = node.angle + time * (index % 2 ? .018 : -.014);
      node.x = cx + Math.cos(angle) * radius;
      node.y = cy + Math.sin(angle) * radius;
      node.pulse *= .92;
    }

    context.lineWidth = 1;
    for (let index = 0; index < processed; index += 1) {
      const node = this.nodes[index];
      const partner = this.nodes[(index * 11 + 7) % this.nodes.length];
      context.strokeStyle = `rgba(105,171,255,${.035 + index % 5 * .012})`;
      context.beginPath();
      context.moveTo(node.x, node.y);
      context.lineTo(partner.x, partner.y);
      context.stroke();
    }

    for (const [index, node] of this.nodes.entries()) {
      const done = index < processed;
      context.fillStyle = done
        ? `rgba(143,202,255,${.68 + node.pulse * .3})`
        : 'rgba(180,201,230,.16)';
      context.beginPath();
      context.arc(node.x, node.y, done ? 1.8 + node.pulse * 3.8 : 1.25, 0, Math.PI * 2);
      context.fill();
      if (node.pulse > .05) {
        context.strokeStyle = `rgba(129,197,255,${node.pulse * .55})`;
        context.beginPath();
        context.arc(node.x, node.y, 4 + (1 - node.pulse) * 14, 0, Math.PI * 2);
        context.stroke();
      }
    }
    this.frame = requestAnimationFrame(this.draw);
  }
}

function buildGrid(monthData) {
  const grid = byId('autoPlanGrid');
  grid.replaceChildren();
  for (const dateIso of Object.keys(monthData.days || {}).sort()) {
    for (const role of ['bd', 'hg']) {
      const cell = document.createElement('span');
      cell.dataset.slot = `${dateIso}|${role}`;
      cell.className = monthData.days[dateIso]?.[role] ? 'fixed' : 'open';
      cell.title = `${role.toUpperCase()} ${dateIso}`;
      cell.innerHTML = `<i>${dateIso.slice(-2)}</i><b>${role.toUpperCase()}</b>`;
      grid.append(cell);
    }
  }
}

function phasePosition(phase) {
  const index = PHASES.findIndex(([id]) => id === phase);
  return index < 0 ? PHASES.length : index;
}

function renderPhases(phase, complete = false) {
  const active = phasePosition(phase);
  [...document.querySelectorAll('#autoPlanPhaseList .auto-plan-phase')].forEach((element, index) => {
    const status = complete || index < active ? 'done' : index === active ? 'active' : 'pending';
    element.dataset.state = status;
    element.querySelector('b').textContent = status === 'done' ? 'erledigt' : status === 'active' ? 'läuft' : 'offen';
  });
}

function markGrid(update) {
  if (!update?.dateIso || !update?.role) return;
  const current = document.querySelector(`#autoPlanGrid [data-slot="${update.dateIso}|${update.role}"]`);
  document.querySelector('#autoPlanGrid .active')?.classList.remove('active');
  if (!current) return;
  current.classList.remove('open');
  current.classList.add('done');
  let next = current.nextElementSibling;
  while (next && !next.classList.contains('open')) next = next.nextElementSibling;
  next?.classList.add('active');
}

function updateProgress(update) {
  const percentage = Math.round(Math.max(0, Math.min(1, Number(update.progress) || 0)) * 100);
  byId('autoPlanPercent').textContent = String(percentage);
  byId('autoPlanCoreLabel').textContent = ({
    analysis: 'Analyse', bd: 'BD', hg: 'HG', polish: 'Fairness', audit: 'Audit', complete: 'Bereit', blocked: 'Prüfung'
  })[update.phase] || 'Optimierung';
  byId('autoPlanMessage').textContent = update.message || 'Optimierung läuft …';
  if (update.beamSize !== undefined) byId('autoPlanBeam').textContent = String(update.beamSize);
  if (update.candidateCount !== undefined) byId('autoPlanCandidates').textContent = String(update.candidateCount);
  if (update.fixed !== undefined) byId('autoPlanFixed').textContent = String(update.fixed);
  if (update.total !== undefined) byId('autoPlanFields').textContent = String(update.total);
  document.querySelector('.auto-plan-shell')?.style.setProperty('--auto-progress', `${percentage}%`);
  renderPhases(update.phase, update.phase === 'complete');
  markGrid(update);
  visualizer?.update(update.progress, update.processed);
}

function resetDialog(monthData) {
  proposal = null;
  dialog.classList.remove('show-result', 'requires-confirmation');
  byId('autoPlanStage').hidden = false;
  byId('autoPlanResult').hidden = true;
  byId('autoPlanApplyBtn').hidden = true;
  byId('autoPlanApplyBtn').disabled = false;
  byId('autoPlanApplyBtn').textContent = 'Vorschläge übernehmen';
  byId('autoPlanCancelBtn').textContent = 'Abbrechen';
  byId('autoPlanRedReview').hidden = true;
  byId('autoPlanConfirmRed').checked = false;
  byId('autoPlanOverrideComment').value = '';
  byId('autoPlanSubtitle').textContent = `${getMonthLabel(monthData.year, monthData.month)} · bestehende Einteilungen bleiben geschützt`;
  byId('autoPlanPercent').textContent = '0';
  byId('autoPlanMessage').textContent = 'Monatszustand wird vorbereitet …';
  for (const id of ['autoPlanBeam', 'autoPlanCandidates', 'autoPlanFixed', 'autoPlanFields']) byId(id).textContent = '—';
  renderPhases('analysis');
  buildGrid(monthData);
  visualizer?.stop();
  visualizer = new ConstraintVisualizer(byId('autoPlanCanvas'));
}

function planningStaffForResult(result) {
  const dates = Object.keys(result.plannedMonth.days || {}).sort();
  const unique = new Map();
  for (const dateIso of dates) {
    for (const person of getPlanningStaff(state.staff, dateIso)) unique.set(person.id, person);
  }
  return [...unique.values()];
}

function loadRows(result) {
  return planningStaffForResult(result).map(person => ({
    person,
    beforeBd: countRoleInMonth(result.baseline, person.id, 'bd'),
    afterBd: countRoleInMonth(result.plannedMonth, person.id, 'bd'),
    beforeHg: countRoleInMonth(result.baseline, person.id, 'hg'),
    afterHg: countRoleInMonth(result.plannedMonth, person.id, 'hg'),
    beforeWeekend: computeWeekendEquivalent(result.baseline, person.id),
    afterWeekend: computeWeekendEquivalent(result.plannedMonth, person.id)
  }));
}

function renderRedReview(result) {
  const review = byId('autoPlanRedReview');
  const required = result.requiresConfirmation && result.redViolations.length > 0;
  review.hidden = !required;
  dialog.classList.toggle('requires-confirmation', required);
  byId('autoPlanConfirmRed').checked = false;
  byId('autoPlanOverrideComment').value = '';
  if (!required) return;

  byId('autoPlanRedCount').textContent = `${result.redViolations.length} rot`;
  byId('autoPlanRedList').innerHTML = result.redViolations.map(violation => {
    const person = getStaffById(state.staff, violation.staffId);
    const type = violation.confirmationType === 'special' ? 'besondere Bestätigung' : 'Bestätigung';
    return `<article class="auto-plan-red-item">
      <div><time>${esc(weekdayLabel(violation.dateIso))}, ${esc(violation.dateIso)}</time><strong>${esc(violation.role.toUpperCase())} · ${esc(person?.short || assignmentLabel(state.staff, violation.staffId, { short: true }))}</strong></div>
      <span>${esc(type)}</span>
      <ul>${violation.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
    </article>`;
  }).join('');
}

function renderResult(result) {
  const complete = result.complete;
  const confirmationRequired = result.requiresConfirmation;
  byId('autoPlanStage').hidden = true;
  byId('autoPlanResult').hidden = false;
  dialog.classList.add('show-result');

  const seal = byId('autoPlanSeal');
  seal.classList.toggle('failed', !complete);
  seal.classList.toggle('warning', confirmationRequired);
  seal.querySelector('span').textContent = !complete ? '!' : confirmationRequired ? '⚠' : '✓';
  byId('autoPlanResultKicker').textContent = !complete
    ? 'Planung blockiert'
    : confirmationRequired ? 'Minimal-Rot-Fallback abgeschlossen' : 'Optimierung abgeschlossen';
  byId('autoPlanResultTitle').textContent = !complete
    ? 'Keine vollständige technisch wählbare Belegung'
    : confirmationRequired
      ? 'Vollständige Belegung mit roten Ausnahmen'
      : 'Regelkonformer Vorschlag bereit';
  byId('autoPlanResultText').textContent = !complete
    ? `${result.metrics.unfilled} Felder konnten auch unter Nutzung bestätigbarer roter Abweichungen nicht besetzt werden.`
    : confirmationRequired
      ? `Eine vollständige Null-Rot-Variante wurde nicht gefunden. Die vorliegende Lösung minimiert rote Abweichungen und wird erst nach ihrer ausdrücklichen Gesamtbestätigung übernommen.`
      : `${result.changes.length} offene Felder wurden ohne rote oder nicht überschreibbare Regelverletzung global optimiert.`;

  const cards = [
    ['Regel-Audit', confirmationRequired ? `${result.metrics.red} rot` : complete ? '0 rot' : `${result.metrics.gray} gesperrt`, confirmationRequired ? 'warning' : complete ? 'verified' : 'failed'],
    ['Fairness', `${result.metrics.fairnessIndex}%`, 'fair'],
    ['Wünsche', `${result.metrics.wishesFulfilled}/${result.metrics.wishesPossible}`, 'wish'],
    ['Vorschläge', String(result.metrics.proposed), 'count'],
    ['Hinweise', `${result.metrics.yellow} gelb · ${result.metrics.orange} orange`, 'notes']
  ];
  byId('autoPlanScorecards').innerHTML = cards.map(([label, value, tone]) =>
    `<div class="auto-plan-scorecard ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

  byId('autoPlanChangeCount').textContent = `${result.changes.length} Einträge`;
  byId('autoPlanChangeList').innerHTML = result.changes.map(change => {
    const person = getStaffById(state.staff, change.staffId);
    const audit = result.audit.find(item => item.dateIso === change.dateIso && item.role === change.role);
    return `<div class="auto-plan-change ${audit?.level || 'green'}">
      <time>${esc(weekdayLabel(change.dateIso))}<b>${esc(change.dateIso.slice(-2))}</b></time>
      <span>${esc(change.role.toUpperCase())}</span>
      <strong>${esc(person?.short || assignmentLabel(state.staff, change.staffId, { short: true }))}</strong>
      <i title="${esc((audit?.reasons || []).join(' · '))}"></i>
    </div>`;
  }).join('');

  byId('autoPlanLoadTable').innerHTML = `<div class="auto-plan-load-head"><span>Person</span><span>BD</span><span>HG</span><span>WE</span></div>`
    + loadRows(result).map(row => `<div class="auto-plan-load-row">
      <strong>${esc(row.person.short || row.person.name)}</strong>
      <span>${row.beforeBd}<i>→</i><b>${row.afterBd}</b></span>
      <span>${row.beforeHg}<i>→</i><b>${row.afterHg}</b></span>
      <span>${row.beforeWeekend.toFixed(1)}<i>→</i><b>${row.afterWeekend.toFixed(1)}</b></span>
    </div>`).join('');

  renderRedReview(result);
  const apply = byId('autoPlanApplyBtn');
  apply.hidden = !complete || result.changes.length === 0;
  apply.disabled = confirmationRequired;
  apply.textContent = confirmationRequired ? 'Rote Ausnahmen bestätigen und übernehmen' : 'Vorschläge übernehmen';
  byId('autoPlanCancelBtn').textContent = complete ? 'Vorschläge verwerfen' : 'Schließen';

  const note = byId('autoPlanConfirmNote');
  note.classList.toggle('failed', !complete);
  note.classList.toggle('warning', confirmationRequired);
  note.classList.remove('accepted');
  note.textContent = !complete
    ? 'Es wurde nichts in den Monatsplan geschrieben. Nicht überschreibbare Sperren oder unauflösbare Fixpunktkonflikte verhindern die Komplettbelegung.'
    : confirmationRequired
      ? 'Der Monatsplan bleibt unverändert, bis die roten Abweichungen einzeln geprüft und über das Kontrollfeld ausdrücklich gemeinsam bestätigt wurden.'
      : result.changes.length
        ? 'Bestehende Einteilungen bleiben Fixpunkte. Erst „Vorschläge übernehmen“ schreibt die neuen BD/HG in den Monatsplan.'
        : 'Der Monat enthält keine offenen BD/HG-Felder. Es wurde nichts verändert.';
}

async function runPlanner() {
  const year = state.currentYear;
  const month = state.currentMonth;
  const monthData = getMonthData(year, month);
  resetDialog(monthData);
  dialog.showModal();
  document.body.classList.add('auto-plan-running');
  trigger.disabled = true;
  controller?.abort();
  controller = new AbortController();

  try {
    proposal = await buildAutoPlan({
      state,
      monthData,
      year,
      month,
      signal: controller.signal,
      onProgress: async update => {
        updateProgress(update);
        if (update.phase === 'complete' || update.phase === 'blocked') {
          await new Promise(resolve => setTimeout(resolve, 520));
        }
      }
    });
    renderResult(proposal);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    proposal = {
      success: false,
      complete: false,
      requiresConfirmation: false,
      status: 'blocked',
      changes: [],
      redViolations: [],
      baseline: monthData,
      plannedMonth: monthData,
      audit: [],
      metrics: {
        proposed: 0, unfilled: 0, red: 0, specialRed: 0, gray: 0, orange: 0, yellow: 0,
        wishesFulfilled: 0, wishesPossible: 0, fairnessIndex: 0
      }
    };
    updateProgress({ phase: 'blocked', progress: 1, message: error?.message || 'Auto-Plan fehlgeschlagen' });
    renderResult(proposal);
  } finally {
    document.body.classList.remove('auto-plan-running');
    trigger.disabled = false;
  }
}

async function applyProposal() {
  if (!proposal?.success || !proposal.complete || !proposal.changes.length) return;
  const button = byId('autoPlanApplyBtn');
  const confirmation = proposal.requiresConfirmation
    ? {
        accepted: byId('autoPlanConfirmRed').checked,
        comment: byId('autoPlanOverrideComment').value.trim()
      }
    : null;

  if (proposal.requiresConfirmation && !confirmation.accepted) {
    byId('autoPlanConfirmNote').textContent = 'Die roten Regelabweichungen müssen vor der Übernahme ausdrücklich bestätigt werden.';
    byId('autoPlanConfirmNote').classList.add('warning');
    return;
  }

  button.disabled = true;
  button.textContent = 'Übernahme wird erneut geprüft und gesichert …';

  try {
    const current = getMonthData(proposal.year, proposal.month);
    const merged = applyAutoPlanProposal({ state, currentMonth: current, proposal, confirmation });
    setMonthData(proposal.year, proposal.month, merged, 'local');
    markMonthDirty(proposal.year, proposal.month);
    const saved = await persistMonth(proposal.year, proposal.month);

    button.textContent = saved.ok ? 'Übernommen und gespeichert' : 'Lokal übernommen · Server ausstehend';
    const note = byId('autoPlanConfirmNote');
    note.classList.remove('failed', 'warning');
    note.classList.add('accepted');
    note.textContent = saved.ok
      ? (proposal.requiresConfirmation
          ? 'Auto-Plan und sämtliche bestätigten roten Ausnahmen wurden vollständig protokolliert und zentral gespeichert.'
          : 'Auto-Plan wurde vollständig übernommen und zentral gespeichert.')
      : 'Auto-Plan wurde lokal übernommen. Die Serversynchronisierung wird nach Wiederherstellung der Verbindung nachgeholt.';

    await new Promise(resolve => setTimeout(resolve, 520));
    dialog.close('applied');
    byId('reloadBtn')?.click();
  } catch (error) {
    button.disabled = proposal.requiresConfirmation && !byId('autoPlanConfirmRed').checked;
    button.textContent = proposal.requiresConfirmation
      ? 'Rote Ausnahmen bestätigen und übernehmen'
      : 'Vorschläge übernehmen';
    const note = byId('autoPlanConfirmNote');
    note.classList.add('failed');
    note.textContent = error?.message || 'Übernahme nicht möglich.';
  }
}

function closePlanner() {
  controller?.abort();
  controller = null;
  visualizer?.stop();
  dialog?.close('cancel');
}

function bind() {
  trigger.addEventListener('click', runPlanner);
  byId('autoPlanCloseBtn').addEventListener('click', closePlanner);
  byId('autoPlanCancelBtn').addEventListener('click', closePlanner);
  byId('autoPlanApplyBtn').addEventListener('click', applyProposal);
  byId('autoPlanConfirmRed').addEventListener('change', event => {
    if (!proposal?.requiresConfirmation) return;
    byId('autoPlanApplyBtn').disabled = !event.currentTarget.checked;
    byId('autoPlanConfirmNote').classList.toggle('confirmed-ready', event.currentTarget.checked);
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closePlanner();
  });
  dialog.addEventListener('close', () => {
    controller?.abort();
    controller = null;
    visualizer?.stop();
    visualizer = null;
    document.body.classList.remove('auto-plan-running');
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
