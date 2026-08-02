const byId = id => document.getElementById(id);
const ROLE_ORDER = Object.freeze(['bd', 'hg']);
const PHASES = Object.freeze([
  ['analysis', 'Fixpunkte'],
  ['propagate', 'Constraint-Suche'],
  ['repair', 'Tiefenreparatur'],
  ['polish', 'Fairness-Politur'],
  ['audit', 'Regel-Audit']
]);

let visualizer = null;

export function runTemplate() {
  return `<section class="auto-plan-stage" id="autoPlanStage" hidden>
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
        <div><span>Grenzfilter</span><strong id="autoPlanLimitRejects">—</strong></div>
        <div><span>Reparatur</span><strong id="autoPlanRepair">—</strong></div>
        <div><span>Fixpunkte</span><strong id="autoPlanFixed">—</strong></div>
        <div><span>Felder</span><strong id="autoPlanFields">—</strong></div>
      </div>
    </div>
  </section>`;
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
    this.nodes = [];
    this.slotIndex = new Map();
    let index = 0;
    const dates = Object.keys(monthData.days || {}).sort();
    for (const dateIso of dates) {
      for (const role of ROLE_ORDER) {
        this.slotIndex.set(`${dateIso}|${role}`, index);
        this.nodes.push({
          dateIso,
          role,
          fixed: Boolean(monthData.days[dateIso]?.[role]),
          angle: Math.PI * 2 * index / Math.max(1, dates.length * 2),
          ring: role === 'bd' ? .62 : .83,
          pulse: 0
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

    for (let ring = 1; ring <= 3; ring += 1) {
      context.save();
      context.translate(cx, cy);
      context.rotate(time * (.013 + ring * .006) * (ring % 2 ? 1 : -1));
      context.strokeStyle = this.phaseColor(.045 + ring * .025);
      context.lineWidth = ring === 2 ? 1.2 : .7;
      context.setLineDash(ring === 2 ? [5, 10] : []);
      context.beginPath();
      context.arc(0, 0, size * (.35 + ring * .19), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.setLineDash([]);

    for (const [index, node] of this.nodes.entries()) {
      const drift = Math.sin(time * .82 + index * .37) * .018;
      const angle = node.angle + time * (node.role === 'bd' ? -.025 : .021);
      const radius = size * (node.ring + drift);
      node.x = cx + Math.cos(angle) * radius;
      node.y = cy + Math.sin(angle) * radius;
      node.pulse *= decay;
    }

    const visible = Math.min(this.nodes.length, Math.round(this.progress * this.nodes.length));
    for (let index = 0; index < visible; index += 1) {
      const node = this.nodes[index];
      const partner = this.nodes[(index * 13 + 9) % this.nodes.length];
      const gradient = context.createLinearGradient(node.x, node.y, partner.x, partner.y);
      gradient.addColorStop(0, this.phaseColor(.035));
      gradient.addColorStop(.5, this.phaseColor(.16));
      gradient.addColorStop(1, this.phaseColor(.02));
      context.strokeStyle = gradient;
      context.lineWidth = .65;
      context.beginPath();
      context.moveTo(node.x, node.y);
      context.lineTo(partner.x, partner.y);
      context.stroke();

      if (index % 5 === 0) {
        const travel = (time * .23 + index * .071) % 1;
        context.fillStyle = this.phaseColor(.74);
        context.beginPath();
        context.arc(
          node.x + (partner.x - node.x) * travel,
          node.y + (partner.y - node.y) * travel,
          1.3,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }

    for (const [index, node] of this.nodes.entries()) {
      const completed = index < visible || node.fixed;
      context.fillStyle = node.fixed
        ? 'rgba(164,184,214,.45)'
        : completed
          ? this.phaseColor(.72 + node.pulse * .25)
          : 'rgba(151,173,205,.18)';
      context.beginPath();
      context.arc(node.x, node.y, completed ? 2 + node.pulse * 4.5 : 1.25, 0, Math.PI * 2);
      context.fill();
      if (node.pulse > .03) {
        context.strokeStyle = this.phaseColor(node.pulse * .65);
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(node.x, node.y, 5 + (1 - node.pulse) * 18, 0, Math.PI * 2);
        context.stroke();
      }
    }

    context.strokeStyle = this.phaseColor(.82);
    context.lineWidth = 2.2;
    context.beginPath();
    context.arc(cx, cy, size * .48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.progress);
    context.stroke();

    const signals = Math.min(10, Math.max(2, Math.round(Math.log10(this.explored + 10) * 3)));
    for (let index = 0; index < signals; index += 1) {
      const angle = time * (.35 + index * .015) + index * Math.PI * 2 / signals;
      const radius = size * (.23 + (index % 3) * .055);
      context.fillStyle = this.phaseColor(.34 + (index % 3) * .12);
      context.beginPath();
      context.arc(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        1.2 + index % 2,
        0,
        Math.PI * 2
      );
      context.fill();
    }
    this.frame = requestAnimationFrame(this.draw);
  }
}

function buildGrid(monthData) {
  const grid = byId('autoPlanGrid');
  grid.replaceChildren();
  for (const dateIso of Object.keys(monthData.days || {}).sort()) {
    for (const role of ROLE_ORDER) {
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
  if (phase === 'complete' || phase === 'blocked') return PHASES.length;
  const index = PHASES.findIndex(([id]) => id === normalized);
  return index < 0 ? 1 : index;
}

function renderPhases(phase, complete = false) {
  const active = phasePosition(phase);
  for (const [index, element] of [...document.querySelectorAll('#autoPlanPhaseList .auto-plan-phase')].entries()) {
    const status = complete || index < active ? 'done' : index === active ? 'active' : 'pending';
    element.dataset.state = status;
    element.querySelector('b').textContent = status === 'done' ? 'erledigt' : status === 'active' ? 'läuft' : 'offen';
  }
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

export function resetRunUI(monthData) {
  byId('autoPlanPercent').textContent = '0';
  byId('autoPlanMessage').textContent = 'Monatszustand wird vorbereitet …';
  for (const id of [
    'autoPlanBeam',
    'autoPlanCandidates',
    'autoPlanExplored',
    'autoPlanDeadEnds',
    'autoPlanLimitRejects',
    'autoPlanRepair',
    'autoPlanFixed',
    'autoPlanFields'
  ]) byId(id).textContent = '—';
  renderPhases('analysis');
  buildGrid(monthData);
  visualizer?.stop();
  visualizer = new ConstraintVisualizer(byId('autoPlanCanvas'), monthData);
}

export function updateRunUI(update) {
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
  if (update.limitRejects !== undefined) byId('autoPlanLimitRejects').textContent = Number(update.limitRejects).toLocaleString('de-DE');
  if (update.exactNodes !== undefined || update.improvements !== undefined) {
    byId('autoPlanRepair').textContent = `${Number(update.exactNodes || 0).toLocaleString('de-DE')} · +${Number(update.improvements || 0)}`;
  }
  if (update.fixed !== undefined) byId('autoPlanFixed').textContent = String(update.fixed);
  if (update.total !== undefined) byId('autoPlanFields').textContent = String(update.total);
  document.querySelector('.auto-plan-shell')?.style.setProperty('--auto-progress', `${percentage}%`);
  renderPhases(update.phase, update.phase === 'complete');
  markGrid(update);
  visualizer?.update(update);
}

export function stopRunUI() {
  visualizer?.stop();
  visualizer = null;
}
