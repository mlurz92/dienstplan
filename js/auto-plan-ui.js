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
  fmtGermanDate,
  getPlanningStaff,
  getStaffById,
  weekdayLabel
} from './rules.js?v=20260801.11';
import { holidayName, parseIsoDate } from './holidays.js?v=20260801.11';

const RELEASE = '20260801.11';
const PHASES = Object.freeze([
  ['analysis', 'Fixpunkte'],
  ['propagate', 'Constraint-Suche'],
  ['repair', 'Tiefenreparatur'],
  ['polish', 'Fairness-Politur'],
  ['audit', 'Regel-Audit']
]);
const LEVEL_ORDER = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });
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
  const files = ['/auto-plan.css', '/auto-plan-review.css', '/auto-plan-v2.css'];
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
          <h2 id="autoPlanTitle" tabindex="-1">Auto-Plan Studio</h2>
          <p id="autoPlanSubtitle">Regelgebundene Verteilung aller offenen BD und HG</p>
        </div>
        <button type="button" class="auto-plan-close" id="autoPlanCloseBtn" aria-label="Auto-Plan schließen">✕</button>
      </header>

      <section class="auto-plan-stage" id="autoPlanStage">
        <div class="auto-plan-visual">
          <canvas id="autoPlanCanvas" aria-hidden="true"></canvas>
          <div class="auto-plan-halo auto-plan-halo--one" aria-hidden="true"></div>
          <div class="auto-plan-halo auto-plan-halo--two" aria-hidden="true"></div>
          <div class="auto-plan-core">
            <strong id="autoPlanPercent">0</strong><span>%</span>
            <small id="autoPlanCoreLabel">Analyse</small>
          </div>
          <div class="auto-plan-orbit-label auto-plan-orbit-label--bd">BD</div>
          <div class="auto-plan-orbit-label auto-plan-orbit-label--hg">HG</div>
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
            <div><span>Geprüft</span><strong id="autoPlanExplored">—</strong></div>
            <div><span>Verworfen</span><strong id="autoPlanDeadEnds">—</strong></div>
            <div><span>Reparatur</span><strong id="autoPlanRepair">—</strong></div>
            <div><span>Felder</span><strong id="autoPlanFields">—</strong></div>
            <strong id="autoPlanFixed" hidden>—</strong>
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
          </div>
        </div>

        <div class="auto-plan-scorecards" id="autoPlanScorecards"></div>

        <section class="auto-plan-search-report" aria-labelledby="autoPlanSearchReportTitle">
          <div class="auto-plan-section-title">
            <span id="autoPlanSearchReportTitle">Such- und Qualitätsnachweis</span>
            <b id="autoPlanSearchProfile"></b>
          </div>
          <div class="auto-plan-search-metrics" id="autoPlanSearchMetrics"></div>
        </section>

        <section class="auto-plan-proposal-panel" aria-labelledby="autoPlanProposalTitle">
          <div class="auto-plan-section-title">
            <span id="autoPlanProposalTitle">Monatsvorschlag wie in der Diensttabelle</span>
            <b id="autoPlanChangeCount"></b>
          </div>
          <div class="auto-plan-change-list auto-plan-table-scroll" id="autoPlanChangeList" tabindex="0">
            <table class="auto-plan-proposal-table" id="autoPlanProposalTable">
              <thead>
                <tr>
                  <th scope="col" class="auto-plan-day-number">Tag</th>
                  <th scope="col">Wochentag</th>
                  <th scope="col">BD</th>
                  <th scope="col">HG</th>
                  <th scope="col">Prüfung</th>
                </tr>
              </thead>
              <tbody id="autoPlanProposalBody"></tbody>
            </table>
          </div>
        </section>

        <section class="auto-plan-load-panel" aria-labelledby="autoPlanLoadTitle">
          <div class="auto-plan-section-title">
            <span id="autoPlanLoadTitle">Verteilungsbild und Sollausgleich</span>
            <b>vorher → nachher</b>
          </div>
          <div class="auto-plan-load-table auto-plan-table-scroll" id="autoPlanLoadTable" tabindex="0"></div>
        </section>

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
            <span id="autoPlanOverrideCommentLabel">Gemeinsamer Kommentar zur Entscheidung</span>
            <textarea id="autoPlanOverrideComment" rows="3" placeholder="Begründung der bestätigten Minimal-Rot-Variante"></textarea>
          </label>
          <label class="auto-plan-confirm-red auto-plan-confirm-red--master">
            <input type="checkbox" id="autoPlanConfirmRed">
            <span>Alle oben einzeln markierten roten Regelabweichungen gemeinsam bestätigen.</span>
          </label>
        </section>

        <div class="auto-plan-confirm-note" id="autoPlanConfirmNote" aria-live="polite"></div>
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
  constructor(canvas, monthData) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.progress = 0;
    this.phase = 'analysis';
    this.active = true;
    this.frame = 0;
    this.lastTime = performance.now();
    this.explored = 0;
    this.deadEnds = 0;
    this.slotIndex = new Map();
    this.nodes = [];
    let index = 0;
    for (const dateIso of Object.keys(monthData.days || {}).sort()) {
      for (const role of ['bd', 'hg']) {
        this.slotIndex.set(`${dateIso}|${role}`, index);
        this.nodes.push({
          dateIso,
          role,
          angle: Math.PI * 2 * index / Math.max(1, Object.keys(monthData.days || {}).length * 2),
          ring: role === 'bd' ? .62 : .83,
          pulse: monthData.days[dateIso]?.[role] ? .18 : 0,
          fixed: Boolean(monthData.days[dateIso]?.[role])
        });
        index += 1;
      }
    }
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    this.observer?.observe(canvas);
    this.resize();
    this.draw(this.lastTime);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  update(update) {
    this.progress = Math.max(this.progress, Math.min(1, Number(update?.progress) || 0));
    this.phase = update?.phase || this.phase;
    this.explored = Math.max(this.explored, Number(update?.exploredNodes) || 0);
    this.deadEnds = Math.max(this.deadEnds, Number(update?.deadEnds) || 0);
    const index = this.slotIndex.get(`${update?.dateIso}|${update?.role}`);
    if (Number.isInteger(index)) this.nodes[index].pulse = 1;
  }

  stop() {
    this.active = false;
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  phaseColor(alpha = 1) {
    const palette = {
      analysis: [112, 199, 255],
      propagate: [103, 221, 207],
      search: [132, 151, 255],
      repair: [219, 139, 255],
      polish: [255, 190, 105],
      audit: [108, 231, 181],
      complete: [108, 231, 181],
      blocked: [255, 117, 139]
    };
    const [red, green, blue] = palette[this.phase] || palette.search;
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  draw(timestamp) {
    if (!this.active) return;
    const rect = this.canvas.getBoundingClientRect();
    const context = this.context;
    const width = rect.width;
    const height = rect.height;
    const cx = width / 2;
    const cy = height / 2;
    const size = Math.min(width, height) * .42;
    const delta = Math.min(.05, Math.max(0, (timestamp - this.lastTime) / 1000));
    this.lastTime = timestamp;
    const time = timestamp / 1000;
    const decay = Math.pow(.075, delta);

    context.clearRect(0, 0, width, height);

    const background = context.createRadialGradient(cx, cy, 0, cx, cy, size * 1.55);
    background.addColorStop(0, this.phaseColor(.18));
    background.addColorStop(.5, this.phaseColor(.055));
    background.addColorStop(1, 'rgba(5,10,20,0)');
    context.fillStyle = background;
    context.beginPath();
    context.arc(cx, cy, size * 1.55, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.translate(cx, cy);
    context.rotate(time * .018);
    for (let ring = 1; ring <= 3; ring += 1) {
      context.strokeStyle = this.phaseColor(.05 + ring * .025);
      context.lineWidth = ring === 2 ? 1.2 : .7;
      context.setLineDash(ring === 2 ? [5, 10] : []);
      context.beginPath();
      context.arc(0, 0, size * (.35 + ring * .19), 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
    context.setLineDash([]);

    for (const [index, node] of this.nodes.entries()) {
      const drift = Math.sin(time * .82 + index * .37) * .018;
      const angle = node.angle + time * (node.role === 'bd' ? -.025 : .021);
      const radius = size * (node.ring + drift);
      node.x = cx + Math.cos(angle) * radius;
      node.y = cy + Math.sin(angle) * radius;
      node.pulse *= decay;
    }

    const visibleEdges = Math.min(this.nodes.length, Math.round(this.progress * this.nodes.length));
    for (let index = 0; index < visibleEdges; index += 1) {
      const node = this.nodes[index];
      const partner = this.nodes[(index * 13 + 9) % this.nodes.length];
      const gradient = context.createLinearGradient(node.x, node.y, partner.x, partner.y);
      gradient.addColorStop(0, this.phaseColor(.04));
      gradient.addColorStop(.5, this.phaseColor(.16));
      gradient.addColorStop(1, this.phaseColor(.025));
      context.strokeStyle = gradient;
      context.lineWidth = .65;
      context.beginPath();
      context.moveTo(node.x, node.y);
      context.lineTo(partner.x, partner.y);
      context.stroke();

      if (index % 5 === 0) {
        const travel = (time * .23 + index * .071) % 1;
        const px = node.x + (partner.x - node.x) * travel;
        const py = node.y + (partner.y - node.y) * travel;
        context.fillStyle = this.phaseColor(.7);
        context.beginPath();
        context.arc(px, py, 1.25, 0, Math.PI * 2);
        context.fill();
      }
    }

    for (const [index, node] of this.nodes.entries()) {
      const completed = index < visibleEdges || node.fixed;
      const radius = completed ? 2 + node.pulse * 4.5 : 1.25;
      context.fillStyle = node.fixed
        ? 'rgba(164,184,214,.45)'
        : completed
          ? this.phaseColor(.7 + node.pulse * .25)
          : 'rgba(151,173,205,.18)';
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();

      if (node.pulse > .03) {
        context.strokeStyle = this.phaseColor(node.pulse * .65);
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(node.x, node.y, 5 + (1 - node.pulse) * 18, 0, Math.PI * 2);
        context.stroke();
      }
    }

    const sweepAngle = -Math.PI / 2 + Math.PI * 2 * this.progress;
    context.strokeStyle = this.phaseColor(.82);
    context.lineWidth = 2.2;
    context.beginPath();
    context.arc(cx, cy, size * .48, -Math.PI / 2, sweepAngle);
    context.stroke();

    const signalCount = Math.min(10, Math.max(2, Math.round(Math.log10(this.explored + 10) * 3)));
    for (let index = 0; index < signalCount; index += 1) {
      const angle = time * (.35 + index * .015) + index * Math.PI * 2 / signalCount;
      const radius = size * (.23 + (index % 3) * .055);
      context.fillStyle = this.phaseColor(.32 + (index % 3) * .12);
      context.beginPath();
      context.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 1.2 + index % 2, 0, Math.PI * 2);
      context.fill();
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
  const normalized = phase === 'search' ? 'propagate' : phase;
  const index = PHASES.findIndex(([id]) => id === normalized);
  if (phase === 'complete' || phase === 'blocked') return PHASES.length;
  return index < 0 ? 1 : index;
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
  current.classList.add('done', 'active');
  setTimeout(() => current.classList.remove('active'), 420);
}

function updateProgress(update) {
  const percentage = Math.round(Math.max(0, Math.min(1, Number(update.progress) || 0)) * 100);
  byId('autoPlanPercent').textContent = String(percentage);
  byId('autoPlanCoreLabel').textContent = ({
    analysis: 'Analyse',
    propagate: 'Propagation',
    search: update.subphase ? update.subphase.toUpperCase() : 'Suche',
    repair: 'Reparatur',
    polish: 'Fairness',
    audit: 'Audit',
    complete: 'Bereit',
    blocked: 'Prüfung'
  })[update.phase] || 'Optimierung';
  byId('autoPlanMessage').textContent = update.message || 'Optimierung läuft …';
  if (update.beamSize !== undefined) byId('autoPlanBeam').textContent = Number(update.beamSize).toLocaleString('de-DE');
  if (update.candidateCount !== undefined) byId('autoPlanCandidates').textContent = Number(update.candidateCount).toLocaleString('de-DE');
  if (update.exploredNodes !== undefined) byId('autoPlanExplored').textContent = Number(update.exploredNodes).toLocaleString('de-DE');
  if (update.deadEnds !== undefined) byId('autoPlanDeadEnds').textContent = Number(update.deadEnds).toLocaleString('de-DE');
  if (update.exactNodes !== undefined || update.improvements !== undefined) {
    const exact = Number(update.exactNodes || 0);
    const improvements = Number(update.improvements || 0);
    byId('autoPlanRepair').textContent = `${exact.toLocaleString('de-DE')} · +${improvements}`;
  }
  if (update.fixed !== undefined) byId('autoPlanFixed').textContent = String(update.fixed);
  if (update.total !== undefined) byId('autoPlanFields').textContent = String(update.total);
  document.querySelector('.auto-plan-shell')?.style.setProperty('--auto-progress', `${percentage}%`);
  renderPhases(update.phase, update.phase === 'complete');
  markGrid(update);
  visualizer?.update(update);
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
  byId('autoPlanConfirmRed').indeterminate = false;
  byId('autoPlanOverrideComment').value = '';
  byId('autoPlanOverrideComment').required = false;
  byId('autoPlanSubtitle').textContent = `${getMonthLabel(monthData.year, monthData.month)} · bestehende Einteilungen bleiben geschützt`;
  byId('autoPlanPercent').textContent = '0';
  byId('autoPlanMessage').textContent = 'Monatszustand wird vorbereitet …';
  for (const id of [
    'autoPlanBeam', 'autoPlanCandidates', 'autoPlanExplored',
    'autoPlanDeadEnds', 'autoPlanRepair', 'autoPlanFields', 'autoPlanFixed'
  ]) byId(id).textContent = '—';
  renderPhases('analysis');
  buildGrid(monthData);
  visualizer?.stop();
  visualizer = new ConstraintVisualizer(byId('autoPlanCanvas'), monthData);
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
  return planningStaffForResult(result).map(person => {
    const beforeBd = countRoleInMonth(result.baseline, person.id, 'bd');
    const afterBd = countRoleInMonth(result.plannedMonth, person.id, 'bd');
    const beforeHg = countRoleInMonth(result.baseline, person.id, 'hg');
    const afterHg = countRoleInMonth(result.plannedMonth, person.id, 'hg');
    return {
      person,
      beforeBd,
      afterBd,
      beforeHg,
      afterHg,
      beforeTotal: beforeBd + beforeHg,
      afterTotal: afterBd + afterHg,
      beforeWeekend: computeWeekendEquivalent(result.baseline, person.id),
      afterWeekend: computeWeekendEquivalent(result.plannedMonth, person.id),
      target: Number(person.bdTarget || 0)
    };
  });
}

function auditMap(result) {
  return new Map((result.audit || []).map(item => [`${item.dateIso}|${item.role}`, item]));
}

function staffLabel(staffId) {
  const person = getStaffById(state.staff, staffId);
  return person?.short || assignmentLabel(state.staff, staffId, { short: true }) || staffId || 'offen';
}

function roleCell(result, audits, dateIso, role) {
  const before = result.baseline?.days?.[dateIso]?.[role] || '';
  const after = result.plannedMonth?.days?.[dateIso]?.[role] || '';
  const proposed = !before && Boolean(after);
  const audit = audits.get(`${dateIso}|${role}`);
  const level = proposed ? (audit?.level || 'green') : before ? 'fixed' : 'open';
  const reasons = proposed ? (audit?.reasons || []) : [];
  const status = proposed ? 'Auto-Plan' : before ? 'Fixpunkt' : 'offen';
  const reasonText = reasons.length
    ? `<details class="auto-plan-cell-reasons"><summary>${reasons.length} Regelhinweis${reasons.length === 1 ? '' : 'e'}</summary><ul>${reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></details>`
    : '';

  return `<div class="auto-plan-assignment-cell ${esc(level)} ${proposed ? 'proposed' : before ? 'fixed' : 'open'}">
    <div class="auto-plan-person-line">
      <strong>${esc(after ? staffLabel(after) : 'offen')}</strong>
      <span class="auto-plan-source-pill">${esc(status)}</span>
    </div>
    <div class="auto-plan-cell-state"><i></i><span>${esc(level === 'fixed' ? 'bestehend' : level)}</span></div>
    ${reasonText}
  </div>`;
}

function rowLevel(result, audits, dateIso) {
  const levels = ['bd', 'hg']
    .map(role => audits.get(`${dateIso}|${role}`)?.level)
    .filter(Boolean);
  if (!levels.length) return 'fixed';
  return levels.sort((left, right) =>
    (LEVEL_ORDER[right] ?? -1) - (LEVEL_ORDER[left] ?? -1))[0];
}

function rowReview(result, audits, dateIso) {
  const items = ['bd', 'hg'].map(role => {
    const audit = audits.get(`${dateIso}|${role}`);
    if (!audit) return null;
    return {
      role,
      level: audit.level || 'green',
      reasons: audit.reasons || []
    };
  }).filter(Boolean);

  if (!items.length) {
    const open = ['bd', 'hg'].some(role => !result.plannedMonth?.days?.[dateIso]?.[role]);
    return open
      ? '<span class="auto-plan-row-status red">unvollständig</span>'
      : '<span class="auto-plan-row-status fixed">Fixpunkte</span>';
  }
  const highest = rowLevel(result, audits, dateIso);
  const details = items
    .filter(item => item.reasons.length)
    .map(item => `<section><strong>${item.role.toUpperCase()} · ${esc(item.level)}</strong><ul>${item.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></section>`)
    .join('');
  return `<div class="auto-plan-row-review">
    <span class="auto-plan-row-status ${esc(highest)}">${items.length} Vorschlag${items.length === 1 ? '' : 'e'} · ${esc(highest)}</span>
    ${details ? `<details><summary>Regelgründe des Tages</summary>${details}</details>` : ''}
  </div>`;
}

function renderProposalTable(result) {
  const audits = auditMap(result);
  const dates = Object.keys(result.plannedMonth.days || {}).sort();
  byId('autoPlanProposalBody').innerHTML = dates.map(dateIso => {
    const date = parseIsoDate(dateIso);
    const holiday = holidayName(dateIso);
    const weekend = date.getDay() === 6 ? 'saturday' : date.getDay() === 0 ? 'sunday' : '';
    const proposedCount = ['bd', 'hg'].filter(role =>
      !result.baseline?.days?.[dateIso]?.[role] && result.plannedMonth?.days?.[dateIso]?.[role]).length;
    return `<tr id="auto-plan-row-${esc(dateIso)}" class="${weekend} ${holiday ? 'holiday' : ''} ${proposedCount ? 'has-proposal' : 'fixed-only'}">
      <th scope="row" class="auto-plan-day-number"><span>${esc(dateIso.slice(-2))}</span></th>
      <td class="auto-plan-weekday"><strong>${esc(weekdayLabel(dateIso))}</strong>${holiday ? `<small>${esc(holiday)}</small>` : ''}</td>
      <td>${roleCell(result, audits, dateIso, 'bd')}</td>
      <td>${roleCell(result, audits, dateIso, 'hg')}</td>
      <td>${rowReview(result, audits, dateIso)}</td>
    </tr>`;
  }).join('');
}

function renderLoadTable(result) {
  const rows = loadRows(result);
  byId('autoPlanLoadTable').innerHTML = `<table class="auto-plan-distribution-table">
    <thead><tr>
      <th scope="col">Person</th>
      <th scope="col">BD</th>
      <th scope="col">HG</th>
      <th scope="col">Gesamt</th>
      <th scope="col">WE</th>
      <th scope="col">BD-Soll</th>
    </tr></thead>
    <tbody>${rows.map(row => {
      const delta = row.target ? row.target - row.afterBd : null;
      return `<tr>
        <th scope="row">${esc(row.person.short || row.person.name)}</th>
        <td>${row.beforeBd}<i>→</i><strong>${row.afterBd}</strong></td>
        <td>${row.beforeHg}<i>→</i><strong>${row.afterHg}</strong></td>
        <td>${row.beforeTotal}<i>→</i><strong>${row.afterTotal}</strong></td>
        <td>${row.beforeWeekend.toFixed(1)}<i>→</i><strong>${row.afterWeekend.toFixed(1)}</strong></td>
        <td>${row.target || '—'}${delta === null ? '' : `<small class="${delta < 0 ? 'over' : delta === 0 ? 'met' : ''}">${delta === 0 ? 'erfüllt' : delta > 0 ? `${delta} offen` : `${Math.abs(delta)} über Soll`}</small>`}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderSearchReport(result) {
  const metrics = result.metrics || {};
  const attempts = Array.isArray(metrics.attempts) ? metrics.attempts : [];
  const completedAttempts = attempts.filter(attempt => attempt.complete).length;
  byId('autoPlanSearchProfile').textContent = result.searchProfile || (result.requiresConfirmation ? 'Minimal-Rot' : 'Null-Rot');
  const entries = [
    ['Suchläufe', String(attempts.length)],
    ['vollständig', String(completedAttempts)],
    ['Varianten geprüft', Number(metrics.exploredNodes || 0).toLocaleString('de-DE')],
    ['Nachfolger erzeugt', Number(metrics.generatedNodes || 0).toLocaleString('de-DE')],
    ['Sackgassen verworfen', Number(metrics.deadEnds || 0).toLocaleString('de-DE')],
    ['exakte Restknoten', Number(metrics.exactNodes || 0).toLocaleString('de-DE')],
    ['Politur', `${Number(metrics.improvements || 0)} Verbesserungen`],
    ['Laufzeit', `${Number(result.elapsedMs || 0).toLocaleString('de-DE')} ms`]
  ];
  byId('autoPlanSearchMetrics').innerHTML = entries.map(([label, value]) =>
    `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}

function renderRedReview(result) {
  const review = byId('autoPlanRedReview');
  const required = result.requiresConfirmation && result.redViolations.length > 0;
  review.hidden = !required;
  dialog.classList.toggle('requires-confirmation', required);
  byId('autoPlanConfirmRed').checked = false;
  byId('autoPlanConfirmRed').indeterminate = false;
  byId('autoPlanOverrideComment').value = '';
  if (!required) return;

  const hasSpecial = result.redViolations.some(violation => violation.confirmationType === 'special');
  byId('autoPlanOverrideComment').required = hasSpecial;
  byId('autoPlanOverrideCommentLabel').textContent = hasSpecial
    ? 'Begründender Kommentar, für besondere Ausnahmen erforderlich'
    : 'Gemeinsamer Kommentar zur Entscheidung, optional';
  byId('autoPlanRedCount').textContent = `${result.redViolations.length} rot`;
  byId('autoPlanRedList').innerHTML = result.redViolations.map((violation, index) => {
    const type = violation.confirmationType === 'special' ? 'besondere Bestätigung' : 'Bestätigung';
    return `<article class="auto-plan-red-item">
      <div class="auto-plan-red-item-main">
        <div><time>${esc(weekdayLabel(violation.dateIso))}, ${esc(fmtGermanDate(violation.dateIso))}</time><strong>${esc(violation.role.toUpperCase())} · ${esc(staffLabel(violation.staffId))}</strong></div>
        <span>${esc(type)}</span>
      </div>
      <ul>${violation.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
      <div class="auto-plan-red-item-actions">
        <label><input type="checkbox" data-auto-plan-red-check="${index}"><span>Diese Abweichung geprüft</span></label>
        <button type="button" class="secondary auto-plan-jump" data-auto-plan-jump="${esc(violation.dateIso)}">In Tabelle zeigen</button>
      </div>
    </article>`;
  }).join('');
}

function allRedConfirmed() {
  const checks = [...document.querySelectorAll('[data-auto-plan-red-check]')];
  return checks.length > 0 && checks.every(check => check.checked);
}

function syncRedConfirmation({ masterChanged = false } = {}) {
  if (!proposal?.requiresConfirmation) return;
  const master = byId('autoPlanConfirmRed');
  const checks = [...document.querySelectorAll('[data-auto-plan-red-check]')];
  if (masterChanged) checks.forEach(check => { check.checked = master.checked; });

  const checked = checks.filter(check => check.checked).length;
  master.checked = checks.length > 0 && checked === checks.length;
  master.indeterminate = checked > 0 && checked < checks.length;

  const hasSpecial = proposal.redViolations.some(violation => violation.confirmationType === 'special');
  const commentReady = !hasSpecial || Boolean(byId('autoPlanOverrideComment').value.trim());
  const ready = allRedConfirmed() && commentReady;
  byId('autoPlanApplyBtn').disabled = !ready;

  const note = byId('autoPlanConfirmNote');
  note.classList.toggle('confirmed-ready', ready);
  note.classList.add('warning');
  note.textContent = ready
    ? 'Alle roten Abweichungen sind geprüft. Die Übernahme bleibt bis zum Klick auf den Bestätigungsbutton unverändert.'
    : hasSpecial && allRedConfirmed()
      ? 'Alle roten Abweichungen sind markiert. Für die besondere Ausnahme fehlt noch ein begründender Kommentar.'
      : `${checked}/${checks.length} rote Abweichungen geprüft.`;
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
      ? 'Eine vollständige Null-Rot-Variante wurde nicht gefunden. Die tabellarisch dargestellte Lösung minimiert rote Abweichungen und wird erst nach deren vollständiger Prüfung übernommen.'
      : `${result.changes.length} offene Felder wurden ohne rote oder nicht überschreibbare Regelverletzung global optimiert.`;

  const cards = [
    ['Regel-Audit', confirmationRequired ? `${result.metrics.red} rot` : complete ? '0 rot' : `${result.metrics.gray} gesperrt`, confirmationRequired ? 'warning' : complete ? 'verified' : 'failed'],
    ['Fairness', `${result.metrics.fairnessIndex}%`, 'fair'],
    ['Wünsche', `${result.metrics.wishesFulfilled}/${result.metrics.wishesPossible}`, 'wish'],
    ['Vorschläge', String(result.metrics.proposed), 'count'],
    ['Hinweise', `${result.metrics.yellow} gelb · ${result.metrics.orange} orange`, 'notes'],
    ['Suchprofil', result.searchProfile || '—', 'search']
  ];
  byId('autoPlanScorecards').innerHTML = cards.map(([label, value, tone]) =>
    `<div class="auto-plan-scorecard ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

  byId('autoPlanChangeCount').textContent = `${result.changes.length} neue Einträge · ${Object.keys(result.plannedMonth.days || {}).length} Tageszeilen`;
  renderSearchReport(result);
  renderProposalTable(result);
  renderLoadTable(result);
  renderRedReview(result);

  const apply = byId('autoPlanApplyBtn');
  apply.hidden = !complete || result.changes.length === 0;
  apply.disabled = confirmationRequired;
  apply.textContent = confirmationRequired ? 'Geprüfte rote Ausnahmen übernehmen' : 'Vorschläge übernehmen';
  byId('autoPlanCancelBtn').textContent = complete ? 'Vorschläge verwerfen' : 'Schließen';

  const note = byId('autoPlanConfirmNote');
  note.classList.toggle('failed', !complete);
  note.classList.toggle('warning', confirmationRequired);
  note.classList.remove('accepted', 'confirmed-ready');
  note.textContent = !complete
    ? 'Es wurde nichts in den Monatsplan geschrieben. Nicht überschreibbare Sperren oder unauflösbare Fixpunktkonflikte verhindern die Komplettbelegung.'
    : confirmationRequired
      ? 'Der Monatsplan bleibt unverändert, bis jede rote Abweichung geprüft und gegebenenfalls begründet wurde.'
      : result.changes.length
        ? 'Die gesamte Monatstabelle und die Belastungsstatistik können vor der Übernahme geprüft werden. Bestehende Einteilungen bleiben Fixpunkte.'
        : 'Der Monat enthält keine offenen BD/HG-Felder. Es wurde nichts verändert.';

  if (confirmationRequired) syncRedConfirmation();
  requestAnimationFrame(() => byId('autoPlanResultTitle')?.focus({ preventScroll: true }));
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
  requestAnimationFrame(() => byId('autoPlanTitle')?.focus({ preventScroll: true }));

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
          await new Promise(resolve => setTimeout(resolve, 620));
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
      searchProfile: 'Fehler',
      changes: [],
      redViolations: [],
      baseline: monthData,
      plannedMonth: monthData,
      audit: [],
      elapsedMs: 0,
      metrics: {
        proposed: 0, unfilled: 0, red: 0, specialRed: 0, gray: 0, orange: 0, yellow: 0,
        wishesFulfilled: 0, wishesPossible: 0, fairnessIndex: 0, exploredNodes: 0,
        generatedNodes: 0, deadEnds: 0, exactNodes: 0, improvements: 0, attempts: []
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
        accepted: allRedConfirmed(),
        comment: byId('autoPlanOverrideComment').value.trim()
      }
    : null;

  if (proposal.requiresConfirmation && !confirmation.accepted) {
    syncRedConfirmation();
    return;
  }
  if (proposal.requiresConfirmation
    && proposal.redViolations.some(violation => violation.confirmationType === 'special')
    && !confirmation.comment) {
    byId('autoPlanOverrideComment').reportValidity();
    syncRedConfirmation();
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

    await new Promise(resolve => setTimeout(resolve, 620));
    dialog.close('applied');
    byId('reloadBtn')?.click();
  } catch (error) {
    button.disabled = proposal.requiresConfirmation && !allRedConfirmed();
    button.textContent = proposal.requiresConfirmation
      ? 'Geprüfte rote Ausnahmen übernehmen'
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
  byId('autoPlanConfirmRed').addEventListener('change', () => syncRedConfirmation({ masterChanged: true }));
  byId('autoPlanOverrideComment').addEventListener('input', () => syncRedConfirmation());
  byId('autoPlanRedList').addEventListener('change', event => {
    if (event.target.matches('[data-auto-plan-red-check]')) syncRedConfirmation();
  });
  byId('autoPlanRedList').addEventListener('click', event => {
    const button = event.target.closest('[data-auto-plan-jump]');
    if (!button) return;
    const row = byId(`auto-plan-row-${button.dataset.autoPlanJump}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.classList.add('review-focus');
    setTimeout(() => row?.classList.remove('review-focus'), 1200);
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
    trigger?.focus({ preventScroll: true });
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