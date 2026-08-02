import { buildAutoPlan, applyAutoPlanProposal } from './auto-planner.js?v=20260802.1';
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

const ICON = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M12 2 14.2 7.8 20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2Z"/>'
  + '<path d="m18 16 .9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9L18 16Z"/>'
  + '</svg>';

const PHASES = Object.freeze([
  ['analysis', 'Fixpunkte'],
  ['bd', 'BD-Optimierung'],
  ['hg', 'HG-Optimierung'],
  ['polish', 'Fairness-Politur'],
  ['audit', 'Regel-Audit']
]);

let currentProposal = null;
let currentController = null;
let visualizer = null;
let triggerButton = null;
let dialog = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function ensureStylesheet() {
  if (document.querySelector('link[data-auto-plan-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/auto-plan.css?v=20260802.1';
  link.dataset.autoPlanStyle = 'true';
  document.head.append(link);
}

function createTrigger() {
  if (document.getElementById('autoPlanBtn')) return document.getElementById('autoPlanBtn');
  const actions = document.querySelector('.toolbar-section--planning .toolbar-actions')
    || document.querySelector('.toolbar .toolbar-group');
  if (!actions) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'autoPlanBtn';
  button.className = 'tool-action tool-action--accent auto-plan-trigger';
  button.title = 'Alle noch offenen BD und HG regelkonform automatisch planen';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = `${ICON}<span class="tool-label">Auto-Plan</span><span class="auto-plan-spark" aria-hidden="true"></span>`;
  actions.insertBefore(button, actions.children[1] || null);
  window.dispatchEvent(new Event('resize'));
  return button;
}

function dialogMarkup() {
  return `
    <dialog id="autoPlanDialog" class="auto-plan-dialog" aria-labelledby="autoPlanTitle">
      <div class="auto-plan-shell">
        <header class="auto-plan-header">
          <div>
            <div class="auto-plan-kicker">Constraint Intelligence · Globaler Monatslauf</div>
            <h2 id="autoPlanTitle">Auto-Plan Studio</h2>
            <p id="autoPlanSubtitle">Regelkonforme Verteilung aller offenen BD und HG</p>
          </div>
          <button type="button" class="auto-plan-close" id="autoPlanCloseBtn" aria-label="Auto-Plan schließen">✕</button>
        </header>

        <section class="auto-plan-stage" id="autoPlanStage">
          <div class="auto-plan-visual">
            <canvas id="autoPlanCanvas" aria-hidden="true"></canvas>
            <div class="auto-plan-orbit" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
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
              <span class="auto-plan-message-dot"></span>
              <span id="autoPlanMessage">Monatszustand wird vorbereitet …</span>
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
              <h3 id="autoPlanResultTitle">Regelkonformer Vorschlag bereit</h3>
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
          <div class="auto-plan-confirm-note" id="autoPlanConfirmNote">
            Bestehende Einteilungen bleiben Fixpunkte. Erst „Vorschläge übernehmen“ schreibt die neuen BD/HG in den Monatsplan.
          </div>
        </section>

        <footer class="auto-plan-footer">
          <button type="button" class="secondary" id="autoPlanCancelBtn">Abbrechen</button>
          <button type="button" class="auto-plan-apply" id="autoPlanApplyBtn" hidden>Vorschläge übernehmen</button>
        </footer>
      </div>
    </dialog>`;
}

function createDialog() {
  if (document.getElementById('autoPlanDialog')) return document.getElementById('autoPlanDialog');
  const template = document.createElement('template');
  template.innerHTML = dialogMarkup().trim();
  document.body.append(template.content);
  return document.getElementById('autoPlanDialog');
}

class PlannerVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.progress = 0;
    this.phase = 'analysis';
    this.active = true;
    this.frame = 0;
    this.nodes = Array.from({ length: 62 }, (_, index) => ({
      angle: (Math.PI * 2 * index) / 62,
      radius: 0.58 + ((index * 17) % 13) / 44,
      pulse: 0
    }));
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    this.resizeObserver?.observe(canvas);
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

  update(progress, phase, processed = null) {
    this.progress = Math.max(this.progress, Math.min(1, Number(progress) || 0));
    this.phase = phase || this.phase;
    if (Number.isInteger(processed) && this.nodes.length) {
      this.nodes[Math.max(0, Math.min(this.nodes.length - 1, processed - 1))].pulse = 1;
    }
  }

  stop() {
    this.active = false;
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  draw() {
    if (!this.active) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const context = this.context;
    const cx = width / 2;
    const cy = height / 2;
    const size = Math.min(width, height) * 0.43;
    const time = reduced ? 0 : performance.now() / 1000;
    context.clearRect(0, 0, width, height);

    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, size * 1.25);
    gradient.addColorStop(0, 'rgba(126, 175, 255, .18)');
    gradient.addColorStop(.55, 'rgba(111, 93, 255, .075)');
    gradient.addColorStop(1, 'rgba(20, 28, 48, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, size * 1.25, 0, Math.PI * 2);
    context.fill();

    const processed = Math.round(this.progress * this.nodes.length);
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index];
      const drift = Math.sin(time * 0.7 + index * 0.41) * 0.025;
      const radius = size * (node.radius + drift);
      const angle = node.angle + time * (index % 2 ? 0.018 : -0.014);
      node.x = cx + Math.cos(angle) * radius;
      node.y = cy + Math.sin(angle) * radius;
      node.pulse *= 0.92;
    }

    context.lineWidth = 1;
    for (let index = 0; index < processed; index += 1) {
      const node = this.nodes[index];
      const partner = this.nodes[(index * 11 + 7) % this.nodes.length];
      context.strokeStyle = `rgba(105, 171, 255, ${0.035 + (index % 5) * 0.012})`;
      context.beginPath();
      context.moveTo(node.x, node.y);
      context.lineTo(partner.x, partner.y);
      context.stroke();
    }

    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index];
      const done = index < processed;
      const pulse = node.pulse;
      context.fillStyle = done ? `rgba(143, 202, 255, ${0.68 + pulse * 0.3})` : 'rgba(180, 201, 230, .16)';
      context.beginPath();
      context.arc(node.x, node.y, done ? 1.8 + pulse * 3.8 : 1.25, 0, Math.PI * 2);
      context.fill();
      if (pulse > 0.05) {
        context.strokeStyle = `rgba(129, 197, 255, ${pulse * 0.55})`;
        context.beginPath();
        context.arc(node.x, node.y, 4 + (1 - pulse) * 14, 0, Math.PI * 2);
        context.stroke();
      }
    }

    this.frame = requestAnimationFrame(this.draw);
  }
}

function buildSlotGrid(monthData) {
  const grid = document.getElementById('autoPlanGrid');
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

function markGridProgress(update) {
  if (!update?.dateIso || !update?.role) return;
  const key = `${update.dateIso}|${update.role}`;
  const cell = [...document.querySelectorAll('#autoPlanGrid [data-slot]')]
    .find(element => element.dataset.slot === key);
  if (!cell) return;
  cell.classList.remove('open', 'active');
  cell.classList.add('done');
  const previous = document.querySelector('#autoPlanGrid .active');
  previous?.classList.remove('active');
  const next = cell.nextElementSibling;
  if (next?.classList.contains('open')) next.classList.add('active');
}

function phaseIndex(phase) {
  const index = PHASES.findIndex(([id]) => id === phase);
  return index < 0 ? PHASES.length : index;
}

function updatePhases(activePhase, complete = false) {
  const activeIndex = phaseIndex(activePhase);
  for (const [index, element] of [...document.querySelectorAll('#autoPlanPhaseList .auto-plan-phase')].entries()) {
    const stateName = complete || index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
    element.dataset.state = stateName;
    element.querySelector('b').textContent = stateName === 'done' ? 'erledigt' : stateName === 'active' ? 'läuft' : 'offen';
  }
}

function setProgress(update) {
  const percent = Math.round(Math.max(0, Math.min(1, update.progress || 0)) * 100);
  document.getElementById('autoPlanPercent').textContent = String(percent);
  document.getElementById('autoPlanCoreLabel').textContent = ({
    analysis: 'Analyse', bd: 'BD', hg: 'HG', polish: 'Fairness', audit: 'Audit', complete: 'Bereit', blocked: 'Prüfung'
  })[update.phase] || 'Optimierung';
  document.getElementById('autoPlanMessage').textContent = update.message || 'Optimierung läuft …';
  document.getElementById('autoPlanBeam').textContent = update.beamSize ?? document.getElementById('autoPlanBeam').textContent;
  document.getElementById('autoPlanCandidates').textContent = update.candidateCount ?? document.getElementById('autoPlanCandidates').textContent;
  document.getElementById('autoPlanFixed').textContent = update.fixed ?? document.getElementById('autoPlanFixed').textContent;
  document.getElementById('autoPlanFields').textContent = update.total ?? document.getElementById('autoPlanFields').textContent;
  document.querySelector('.auto-plan-shell')?.style.setProperty('--auto-progress', `${percent}%`);
  updatePhases(update.phase, update.phase === 'complete');
  markGridProgress(update);
  visualizer?.update(update.progress, update.phase, update.processed);
}

function resetDialog(monthData) {
  currentProposal = null;
  document.getElementById('autoPlanStage').hidden = false;
  document.getElementById('autoPlanResult').hidden = true;
  document.getElementById('autoPlanApplyBtn').hidden = true;
  document.getElementById('autoPlanApplyBtn').disabled = false;
  document.getElementById('autoPlanCancelBtn').textContent = 'Abbrechen';
  document.getElementById('autoPlanCloseBtn').disabled = false;
  document.getElementById('autoPlanSubtitle').textContent = `${getMonthLabel(monthData.year, monthData.month)} · bestehende Einteilungen bleiben geschützt`;
  document.getElementById('autoPlanPercent').textContent = '0';
  document.getElementById('autoPlanMessage').textContent = 'Monatszustand wird vorbereitet …';
  for (const id of ['autoPlanBeam', 'autoPlanCandidates', 'autoPlanFixed', 'autoPlanFields']) document.getElementById(id).textContent = '—';
  updatePhases('analysis');
  buildSlotGrid(monthData);
  visualizer?.stop();
  visualizer = new PlannerVisualizer(document.getElementById('autoPlanCanvas'));
}

function activeStaff(proposal) {
  const dates = Object.keys(proposal.plannedMonth.days || {}).sort();
  const byId = new Map();
  for (const iso of [dates[0], dates[Math.floor(dates.length / 2)], dates.at(-1)].filter(Boolean)) {
    for (const person of getPlanningStaff(state.staff, iso)) byId.set(person.id, person);
  }
  return [...byId.values()];
}

function loadRows(proposal) {
  const before = proposal.baseline;
  const after = proposal.plannedMonth;
  return activeStaff(proposal).map(person => ({
    person,
    beforeBd: countRoleInMonth(before, person.id, 'bd'),
    afterBd: countRoleInMonth(after, person.id, 'bd'),
    beforeHg: countRoleInMonth(before, person.id, 'hg'),
    afterHg: countRoleInMonth(after, person.id, 'hg'),
    beforeWeekend: computeWeekendEquivalent(before, person.id),
    afterWeekend: computeWeekendEquivalent(after, person.id)
  }));
}

function renderResult(proposal) {
  const success = proposal.success;
  document.getElementById('autoPlanStage').hidden = true;
  document.getElementById('autoPlanResult').hidden = false;
  const seal = document.getElementById('autoPlanSeal');
  seal.classList.toggle('failed', !success);
  seal.querySelector('span').textContent = success ? '✓' : '!';
  document.getElementById('autoPlanResultKicker').textContent = success ? 'Optimierung abgeschlossen' : 'Vollständige Planung nicht möglich';
  document.getElementById('autoPlanResultTitle').textContent = success
    ? 'Regelkonformer Vorschlag bereit'
    : 'Keine konfliktfreie Komplettbelegung gefunden';
  document.getElementById('autoPlanResultText').textContent = success
    ? `${proposal.changes.length} offene Felder wurden global optimiert. Vor der Übernahme bleibt der Monatsplan unverändert.`
    : `${proposal.metrics.unfilled} Felder konnten ohne rote Regelverletzung nicht besetzt werden. Der Vorschlag wird nicht freigegeben.`;

  const cards = [
    ['Regel-Audit', success ? '0 rot' : `${proposal.metrics.red} rot`, success ? 'verified' : 'failed'],
    ['Fairness', `${proposal.metrics.fairnessIndex}%`, 'fair'],
    ['Wünsche', `${proposal.metrics.wishesFulfilled}/${proposal.metrics.wishesPossible}`, 'wish'],
    ['Vorschläge', String(proposal.metrics.proposed), 'count'],
    ['Hinweise', `${proposal.metrics.yellow} gelb · ${proposal.metrics.orange} orange`, 'notes']
  ];
  document.getElementById('autoPlanScorecards').innerHTML = cards.map(([label, value, tone]) => `
    <div class="auto-plan-scorecard ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

  document.getElementById('autoPlanChangeCount').textContent = `${proposal.changes.length} Einträge`;
  document.getElementById('autoPlanChangeList').innerHTML = proposal.changes.map(change => {
    const person = getStaffById(state.staff, change.staffId);
    const audit = proposal.audit.find(item => item.dateIso === change.dateIso && item.role === change.role);
    return `<div class="auto-plan-change ${audit?.level || 'green'}">
      <time>${esc(weekdayLabel(change.dateIso))}<b>${esc(change.dateIso.slice(-2))}</b></time>
      <span>${esc(change.role.toUpperCase())}</span>
      <strong>${esc(person?.short || assignmentLabel(state.staff, change.staffId, { short: true }))}</strong>
      <i title="${esc((audit?.reasons || []).join(' · '))}"></i>
    </div>`;
  }).join('');

  document.getElementById('autoPlanLoadTable').innerHTML = `
    <div class="auto-plan-load-head"><span>Person</span><span>BD</span><span>HG</span><span>WE</span></div>
    ${loadRows(proposal).map(row => `<div class="auto-plan-load-row">
      <strong>${esc(row.person.short || row.person.name)}</strong>
      <span>${row.beforeBd}<i>→</i><b>${row.afterBd}</b></span>
      <span>${row.beforeHg}<i>→</i><b>${row.afterHg}</b></span>
      <span>${row.beforeWeekend.toFixed(1)}<i>→</i><b>${row.afterWeekend.toFixed(1)}</b></span>
    </div>`).join('')}`;

  const apply = document.getElementById('autoPlanApplyBtn');
  apply.hidden = !success;
  document.getElementById('autoPlanCancelBtn').textContent = success ? 'Vorschläge verwerfen' : 'Schließen';
  document.getElementById('autoPlanConfirmNote').classList.toggle('failed', !success);
  document.getElementById('autoPlanConfirmNote').textContent = success
    ? 'Bestehende Einteilungen bleiben Fixpunkte. Erst „Vorschläge übernehmen“ schreibt die neuen BD/HG in den Monatsplan.'
    : 'Es wurde nichts in den Monatsplan geschrieben. Prüfe Abwesenheiten, harte Sperren oder bestehende Fixpunkte und starte Auto-Plan danach erneut.';
  dialog.classList.add('show-result');
}

async function runAutoPlan() {
  const year = state.currentYear;
  const month = state.currentMonth;
  const monthData = getMonthData(year, month);
  resetDialog(monthData);
  dialog.classList.remove('show-result');
  dialog.showModal();
  document.body.classList.add('auto-plan-running');
  triggerButton.disabled = true;
  currentController?.abort();
  currentController = new AbortController();

  try {
    currentProposal = await buildAutoPlan({
      state,
      monthData,
      year,
      month,
      signal: currentController.signal,
      onProgress: async update => {
        setProgress(update);
        if (update.phase === 'complete' || update.phase === 'blocked') {
          await new Promise(resolve => setTimeout(resolve, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 520));
        }
      }
    });
    renderResult(currentProposal);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    currentProposal = null;
    setProgress({ phase: 'blocked', progress: 1, message: error?.message || 'Auto-Plan fehlgeschlagen' });
    renderResult({
      success: false,
      changes: [],
      baseline: monthData,
      plannedMonth: monthData,
      audit: [],
      metrics: { unfilled: 0, red: 0, gray: 0, orange: 0, yellow: 0, wishesFulfilled: 0, wishesPossible: 0, fairnessIndex: 0, proposed: 0 }
    });
  } finally {
    document.body.classList.remove('auto-plan-running');
    triggerButton.disabled = false;
  }
}

async function applyProposal() {
  if (!currentProposal?.success) return;
  const button = document.getElementById('autoPlanApplyBtn');
  button.disabled = true;
  button.textContent = 'Übernahme wird gesichert …';
  try {
    const year = currentProposal.year;
    const month = currentProposal.month;
    const current = getMonthData(year, month);
    const merged = applyAutoPlanProposal(current, currentProposal);
    setMonthData(year, month, merged, 'local');
    markMonthDirty(year, month);
    const save = await persistMonth(year, month);
    button.textContent = save.ok ? 'Übernommen und gespeichert' : 'Lokal übernommen · Server ausstehend';
    document.getElementById('autoPlanConfirmNote').textContent = save.ok
      ? 'Auto-Plan wurde vollständig übernommen und zentral gespeichert.'
      : 'Auto-Plan wurde lokal übernommen. Die Serversynchronisierung wird bei wiederhergestellter Verbindung nachgeholt.';
    document.getElementById('autoPlanConfirmNote').classList.add('accepted');
    await new Promise(resolve => setTimeout(resolve, 420));
    dialog.close('applied');
    document.getElementById('reloadBtn')?.click();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Vorschläge übernehmen';
    document.getElementById('autoPlanConfirmNote').textContent = error?.message || 'Übernahme nicht möglich.';
    document.getElementById('autoPlanConfirmNote').classList.add('failed');
  }
}

function closeDialog() {
  currentController?.abort();
  currentController = null;
  visualizer?.stop();
  dialog?.close('cancel');
}

function bindDialog() {
  document.getElementById('autoPlanCloseBtn').addEventListener('click', closeDialog);
  document.getElementById('autoPlanCancelBtn').addEventListener('click', closeDialog);
  document.getElementById('autoPlanApplyBtn').addEventListener('click', applyProposal);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener('close', () => {
    currentController?.abort();
    currentController = null;
    visualizer?.stop();
    visualizer = null;
    document.body.classList.remove('auto-plan-running');
  });
}

function initializeAutoPlan() {
  ensureStylesheet();
  const install = () => {
    triggerButton = createTrigger();
    if (!triggerButton) {
      setTimeout(install, 80);
      return;
    }
    dialog = createDialog();
    bindDialog();
    triggerButton.addEventListener('click', runAutoPlan);
  };
  requestAnimationFrame(install);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeAutoPlan, { once: true });
else initializeAutoPlan();
