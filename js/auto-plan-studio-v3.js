import {
  applyAutoPlanProposal,
  buildAutoPlan,
  createDefaultAutoPlanConfig,
  validateAutoPlanConfig
} from './auto-planner.js?v=20260801.11';
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
import { holidayName } from './holidays.js?v=20260801.11';

const RELEASE = '20260801.11';
const PHASES = Object.freeze([
  ['analysis', 'Fixpunkte'],
  ['propagate', 'Constraint-Suche'],
  ['repair', 'Tiefenreparatur'],
  ['polish', 'Iterative Tausche'],
  ['audit', 'Regel-Audit']
]);
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

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const numberOrNull = value => value === '' || value === null || value === undefined
  ? null
  : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function installStylesheets() {
  for (const href of ['/auto-plan.css', '/auto-plan-review.css', '/auto-plan-v2.css', '/auto-plan-v3.css']) {
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
        <div>
          <div class="auto-plan-kicker">Constraint Intelligence · Globaler Monatslauf</div>
          <h2 id="autoPlanTitle" tabindex="-1">Auto-Plan Studio</h2>
          <p id="autoPlanSubtitle">Parameter festlegen, Optimierung starten, Tagesvorschlag vollständig prüfen</p>
        </div>
        <button type="button" class="auto-plan-close" id="autoPlanCloseBtn" aria-label="Auto-Plan schließen">✕</button>
      </header>

      <section class="auto-plan-config" id="autoPlanConfig" aria-labelledby="autoPlanConfigTitle">
        <div class="auto-plan-config-hero">
          <article class="auto-plan-config-card">
            <header><span>Optimierungsarchitektur</span><h3 id="autoPlanConfigTitle">Laufparameter</h3><p>Harte Grenzen bestimmen die Machbarkeit. Das Profil steuert erst danach die weichen Qualitätsziele.</p></header>
            <div class="auto-plan-config-grid">
              <label class="auto-plan-field"><span>Suchintensität</span><select id="autoPlanSearchIntensity"><option value="standard">Standard</option><option value="deep" selected>Tief</option><option value="maximum">Maximum</option></select></label>
              <label class="auto-plan-field"><span>Optimierungsschwerpunkt</span><select id="autoPlanOptimizationFocus"><option value="balanced" selected>Ausgewogen</option><option value="wishes">Wünsche zuerst</option><option value="workload">Lastenausgleich zuerst</option><option value="weekends">Wochenenden zuerst</option></select></label>
              <label class="auto-plan-field"><span>Iterative Reparaturrunden</span><input id="autoPlanRepairIterations" type="number" min="0" max="30" step="1" value="11"></label>
              <label class="auto-plan-field"><span>Lokales Neuplanungsbudget</span><input id="autoPlanLocalBudget" type="number" min="200" max="12000" step="200" value="3200"></label>
              <label class="auto-plan-field"><span>Maximal rote Vorschläge</span><input id="autoPlanMaxRed" type="number" min="0" max="62" step="1" placeholder="keine zusätzliche Grenze"></label>
              <label class="auto-plan-switch"><input id="autoPlanAllowRed" type="checkbox" checked><span>Minimal-Rot-Fallback erlauben, wenn keine vollständige Null-Rot-Belegung gefunden wird.</span></label>
            </div>
          </article>
          <article class="auto-plan-config-card">
            <header><span>Vorprüfung</span><h3>Planungskontext</h3><p>Bestehende Einteilungen bleiben unveränderliche Fixpunkte.</p></header>
            <div class="auto-plan-config-summary" id="autoPlanConfigSummary"></div>
          </article>
        </div>

        <section class="auto-plan-limit-panel" aria-labelledby="autoPlanLimitTitle">
          <div class="auto-plan-limit-head"><div><span>Harte individuelle Grenzen</span><h3 id="autoPlanLimitTitle">Dienstobergrenzen je Mitarbeitendem</h3></div><p>Leere Felder bedeuten keine zusätzliche Laufgrenze. Hinterlegte Personalmaxima und sämtliche fachlichen Regeln gelten weiterhin.</p></div>
          <div class="auto-plan-limit-scroll" tabindex="0">
            <table class="auto-plan-limit-table">
              <thead><tr><th scope="col">Person</th><th scope="col">BD fix</th><th scope="col">BD max.</th><th scope="col">HG fix</th><th scope="col">HG max.</th><th scope="col">Gesamt max.</th></tr></thead>
              <tbody id="autoPlanLimitBody"></tbody>
            </table>
          </div>
        </section>
        <div class="auto-plan-validation" id="autoPlanValidation" aria-live="polite">Parameter werden geprüft.</div>
      </section>

      <section class="auto-plan-stage" id="autoPlanStage" hidden>
        <div class="auto-plan-visual">
          <canvas id="autoPlanCanvas" aria-hidden="true"></canvas>
          <div class="auto-plan-halo auto-plan-halo--one" aria-hidden="true"></div><div class="auto-plan-halo auto-plan-halo--two" aria-hidden="true"></div>
          <div class="auto-plan-core"><strong id="autoPlanPercent">0</strong><span>%</span><small id="autoPlanCoreLabel">Analyse</small></div>
          <div class="auto-plan-orbit-label auto-plan-orbit-label--bd">BD</div><div class="auto-plan-orbit-label auto-plan-orbit-label--hg">HG</div>
        </div>
        <div class="auto-plan-console">
          <div class="auto-plan-phase-list" id="autoPlanPhaseList">${PHASES.map(([id, label]) => `<div class="auto-plan-phase" data-phase="${id}"><i></i><span>${label}</span><b>offen</b></div>`).join('')}</div>
          <div class="auto-plan-message" aria-live="polite"><span class="auto-plan-message-dot"></span><span id="autoPlanMessage">Monatszustand wird vorbereitet …</span></div>
          <div class="auto-plan-grid" id="autoPlanGrid" aria-label="Fortschritt je Dienstfeld"></div>
          <div class="auto-plan-live-metrics">
            <div><span>Varianten</span><strong id="autoPlanBeam">—</strong></div><div><span>Kandidaten</span><strong id="autoPlanCandidates">—</strong></div>
            <div><span>Geprüft</span><strong id="autoPlanExplored">—</strong></div><div><span>Verworfen</span><strong id="autoPlanDeadEnds">—</strong></div>
            <div><span>Tauschverbesserung</span><strong id="autoPlanRepair">—</strong></div><div><span>Felder</span><strong id="autoPlanFields">—</strong></div>
          </div>
        </div>
      </section>

      <section class="auto-plan-result" id="autoPlanResult" hidden>
        <div class="auto-plan-result-hero"><div class="auto-plan-seal" id="autoPlanSeal"><span>✓</span></div><div><div class="auto-plan-kicker" id="autoPlanResultKicker">Optimierung abgeschlossen</div><h3 id="autoPlanResultTitle" tabindex="-1">Vorschlag bereit</h3><p id="autoPlanResultText"></p><div class="auto-plan-run-config" id="autoPlanRunConfig"></div></div></div>
        <div class="auto-plan-scorecards" id="autoPlanScorecards"></div>
        <section class="auto-plan-search-report"><div class="auto-plan-section-title"><span>Such-, Tausch- und Qualitätsnachweis</span><b id="autoPlanSearchProfile"></b></div><div class="auto-plan-search-metrics" id="autoPlanSearchMetrics"></div></section>
        <section class="auto-plan-proposal-panel"><div class="auto-plan-section-title"><span>Monatsvorschlag wie in der Diensttabelle</span><b id="autoPlanChangeCount"></b></div><div class="auto-plan-change-list auto-plan-table-scroll" id="autoPlanChangeList" tabindex="0"><table class="auto-plan-proposal-table" id="autoPlanProposalTable"><thead><tr><th scope="col" class="auto-plan-day-number">Tag</th><th scope="col">Wochentag</th><th scope="col">BD</th><th scope="col">HG</th><th scope="col">Prüfung</th></tr></thead><tbody id="autoPlanProposalBody"></tbody></table></div></section>
        <section class="auto-plan-load-panel"><div class="auto-plan-section-title"><span>Verteilungsbild und Sollausgleich</span><b>vorher → nachher</b></div><div class="auto-plan-load-table auto-plan-table-scroll" id="autoPlanLoadTable" tabindex="0"></div></section>
        <section class="auto-plan-red-review" id="autoPlanRedReview" hidden><div class="auto-plan-red-review-head"><div><span>Bestätigungspflichtiger Fallback</span><h4>Rote Regelabweichungen einzeln prüfen</h4></div><strong id="autoPlanRedCount"></strong></div><div class="auto-plan-red-list" id="autoPlanRedList"></div><label class="auto-plan-comment-label"><span id="autoPlanOverrideCommentLabel">Gemeinsamer Kommentar</span><textarea id="autoPlanOverrideComment" rows="3" placeholder="Begründung der bestätigten Minimal-Rot-Variante"></textarea></label><label class="auto-plan-confirm-red auto-plan-confirm-red--master"><input type="checkbox" id="autoPlanConfirmRed"><span>Alle einzeln markierten roten Regelabweichungen gemeinsam bestätigen.</span></label></section>
        <div class="auto-plan-confirm-note" id="autoPlanConfirmNote" aria-live="polite"></div>
      </section>

      <footer class="auto-plan-footer"><button type="button" class="secondary" id="autoPlanCancelBtn">Abbrechen</button><button type="button" class="auto-plan-start" id="autoPlanStartBtn">Optimierung starten</button><button type="button" class="auto-plan-apply" id="autoPlanApplyBtn" hidden>Vorschläge übernehmen</button></footer>
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

class ConstraintVisualizer {
  constructor(canvas, monthData) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.nodes = [];
    this.slotIndex = new Map();
    this.progress = 0;
    this.phase = 'analysis';
    this.explored = 0;
    this.deadEnds = 0;
    this.improvements = 0;
    this.active = true;
    let index = 0;
    for (const dateIso of Object.keys(monthData.days || {}).sort()) {
      for (const role of ['bd', 'hg']) {
        this.slotIndex.set(`${dateIso}|${role}`, index);
        this.nodes.push({ angle: index / Math.max(1, Object.keys(monthData.days).length * 2) * Math.PI * 2, ring: role === 'bd' ? .61 : .83, role, pulse: monthData.days[dateIso]?.[role] ? .18 : 0, fixed: Boolean(monthData.days[dateIso]?.[role]) });
        index += 1;
      }
    }
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.draw);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  update(update) {
    this.progress = Math.max(this.progress, Math.min(1, Number(update.progress) || 0));
    this.phase = update.phase || this.phase;
    this.explored = Math.max(this.explored, Number(update.exploredNodes) || 0);
    this.deadEnds = Math.max(this.deadEnds, Number(update.deadEnds) || 0);
    this.improvements = Math.max(this.improvements, Number(update.improvements) || 0);
    const index = this.slotIndex.get(`${update.dateIso}|${update.role}`);
    if (Number.isInteger(index)) this.nodes[index].pulse = 1;
  }
  color(alpha) {
    const colors = { analysis:[111,198,255], search:[133,151,255], propagate:[102,222,206], repair:[219,139,255], polish:[255,189,104], audit:[104,231,181], complete:[104,231,181], blocked:[255,116,139] };
    const [r,g,b] = colors[this.phase] || colors.search;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  draw(time) {
    if (!this.active) return;
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = rect;
    const cx = width / 2, cy = height / 2, size = Math.min(width, height) * .42;
    const t = time / 1000;
    this.context.clearRect(0, 0, width, height);
    const glow = this.context.createRadialGradient(cx, cy, 0, cx, cy, size * 1.55);
    glow.addColorStop(0, this.color(.2)); glow.addColorStop(.55, this.color(.05)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    this.context.fillStyle = glow; this.context.beginPath(); this.context.arc(cx, cy, size * 1.55, 0, Math.PI * 2); this.context.fill();
    for (let ring = 0; ring < 4; ring += 1) {
      this.context.save(); this.context.translate(cx, cy); this.context.rotate(t * (ring % 2 ? .02 : -.017));
      this.context.strokeStyle = this.color(.05 + ring * .018); this.context.lineWidth = ring === 2 ? 1.3 : .7; this.context.setLineDash(ring === 2 ? [5,9] : []);
      this.context.beginPath(); this.context.arc(0,0,size*(.3+ring*.18),0,Math.PI*2); this.context.stroke(); this.context.restore();
    }
    this.context.setLineDash([]);
    const visible = Math.round(this.progress * this.nodes.length);
    this.nodes.forEach((node,index) => {
      const angle = node.angle + t * (node.role === 'bd' ? -.028 : .023);
      const radius = size * (node.ring + Math.sin(t*.8+index*.37)*.018);
      node.x = cx + Math.cos(angle)*radius; node.y = cy + Math.sin(angle)*radius; node.pulse *= .93;
    });
    for (let index=0; index<visible; index += 1) {
      const node=this.nodes[index], partner=this.nodes[(index*13+7)%this.nodes.length];
      const gradient=this.context.createLinearGradient(node.x,node.y,partner.x,partner.y); gradient.addColorStop(0,this.color(.025)); gradient.addColorStop(.5,this.color(.17)); gradient.addColorStop(1,this.color(.02));
      this.context.strokeStyle=gradient; this.context.lineWidth=.7; this.context.beginPath(); this.context.moveTo(node.x,node.y); this.context.lineTo(partner.x,partner.y); this.context.stroke();
      if (index%4===0) { const p=(t*.28+index*.061)%1; this.context.fillStyle=this.color(.8); this.context.beginPath(); this.context.arc(node.x+(partner.x-node.x)*p,node.y+(partner.y-node.y)*p,1.35,0,Math.PI*2); this.context.fill(); }
    }
    this.nodes.forEach((node,index) => {
      const done=index<visible||node.fixed; this.context.fillStyle=node.fixed?'rgba(174,194,222,.44)':done?this.color(.78):'rgba(154,176,207,.16)';
      this.context.beginPath(); this.context.arc(node.x,node.y,done?2+node.pulse*4.2:1.2,0,Math.PI*2); this.context.fill();
      if(node.pulse>.04){this.context.strokeStyle=this.color(node.pulse*.65);this.context.beginPath();this.context.arc(node.x,node.y,5+(1-node.pulse)*19,0,Math.PI*2);this.context.stroke();}
    });
    const signals=Math.min(14,Math.max(3,Math.round(Math.log10(this.explored+10)*3+this.improvements)));
    for(let i=0;i<signals;i+=1){const angle=t*(.38+i*.012)+i*Math.PI*2/signals,r=size*(.2+(i%4)*.055);this.context.fillStyle=this.color(.3+(i%3)*.13);this.context.beginPath();this.context.arc(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,1.1+i%2,0,Math.PI*2);this.context.fill();}
    this.frame=requestAnimationFrame(this.draw);
  }
  stop(){this.active=false;this.observer?.disconnect();cancelAnimationFrame(this.frame);}
}

function planningStaff(monthData) {
  const unique = new Map();
  for (const dateIso of Object.keys(monthData.days || {}).sort()) {
    for (const person of getPlanningStaff(state.staff, dateIso)) unique.set(person.id, person);
  }
  return [...unique.values()];
}

function renderConfig(monthData) {
  const defaults = createDefaultAutoPlanConfig(state, monthData);
  const staff = planningStaff(monthData);
  byId('autoPlanSearchIntensity').value = defaults.searchIntensity || 'deep';
  byId('autoPlanOptimizationFocus').value = defaults.optimizationFocus || 'balanced';
  byId('autoPlanAllowRed').checked = defaults.allowRedFallback !== false;
  byId('autoPlanMaxRed').value = defaults.maxRedViolations ?? '';
  byId('autoPlanRepairIterations').value = defaults.searchIntensity === 'maximum' ? '18' : '11';
  byId('autoPlanLocalBudget').value = defaults.searchIntensity === 'maximum' ? '7000' : '3200';
  byId('autoPlanLimitBody').innerHTML = staff.map(person => {
    const bd = countRoleInMonth(monthData, person.id, 'bd');
    const hg = countRoleInMonth(monthData, person.id, 'hg');
    const defaultBd = defaults.staffLimits?.[person.id]?.maxBd;
    const suggestedBd = defaultBd ?? Math.max(bd, Number(person.bdTarget || 0) + 2);
    return `<tr data-staff-id="${esc(person.id)}"><th scope="row">${esc(person.short || person.name)}<small>${esc(person.roleLabel || '')}</small></th><td>${bd}</td><td><input data-limit="maxBd" type="number" min="${bd}" max="31" step="1" value="${suggestedBd}"></td><td>${hg}</td><td><input data-limit="maxHg" type="number" min="${hg}" max="31" step="1" placeholder="∞"></td><td><input data-limit="maxTotal" type="number" min="${bd+hg}" max="62" step="1" placeholder="∞"></td></tr>`;
  }).join('');
  const open = Object.values(monthData.days || {}).reduce((sum, day) => sum + Number(!day.bd) + Number(!day.hg), 0);
  const fixed = Object.values(monthData.days || {}).reduce((sum, day) => sum + Number(Boolean(day.bd)) + Number(Boolean(day.hg)), 0);
  byId('autoPlanConfigSummary').innerHTML = `<div><span>Monat</span><strong>${esc(getMonthLabel(monthData.year,monthData.month))}</strong></div><div><span>Offene BD/HG</span><strong>${open}</strong></div><div><span>Geschützte Fixpunkte</span><strong>${fixed}</strong></div><div><span>Planbarer Pool</span><strong>${staff.length} Personen</strong></div><div><span>Feiertagsregion</span><strong>Sachsen</strong></div>`;
  syncConfigValidation();
}

function readConfig() {
  const staffLimits = {};
  for (const row of byId('autoPlanLimitBody').querySelectorAll('tr[data-staff-id]')) {
    const staffId = row.dataset.staffId;
    staffLimits[staffId] = {};
    for (const input of row.querySelectorAll('input[data-limit]')) staffLimits[staffId][input.dataset.limit] = numberOrNull(input.value);
  }
  return {
    searchIntensity: byId('autoPlanSearchIntensity').value,
    optimizationFocus: byId('autoPlanOptimizationFocus').value,
    allowRedFallback: byId('autoPlanAllowRed').checked,
    maxRedViolations: numberOrNull(byId('autoPlanMaxRed').value),
    repairIterations: numberOrNull(byId('autoPlanRepairIterations').value) ?? 0,
    localRebuildBudget: numberOrNull(byId('autoPlanLocalBudget').value) ?? 3200,
    staffLimits
  };
}

function syncConfigValidation() {
  if (!activeMonth) return false;
  const config = readConfig();
  const validation = validateAutoPlanConfig(state, activeMonth, config);
  const extra = [];
  if (config.repairIterations < 0 || config.repairIterations > 30) extra.push('Iterative Reparaturrunden müssen zwischen 0 und 30 liegen.');
  if (config.localRebuildBudget < 200 || config.localRebuildBudget > 12000) extra.push('Das lokale Neuplanungsbudget muss zwischen 200 und 12.000 liegen.');
  const errors = [...validation.errors, ...extra];
  const box = byId('autoPlanValidation');
  box.classList.toggle('invalid', errors.length > 0);
  box.innerHTML = errors.length ? `<div><strong>Start blockiert.</strong><ul>${errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul></div>` : '<div><strong>Parameter konsistent.</strong> Harte Grenzen, Fixpunkte und Suchprofil sind startbereit.</div>';
  byId('autoPlanStartBtn').disabled = errors.length > 0;
  return errors.length === 0;
}

function buildGrid(monthData) {
  const grid=byId('autoPlanGrid'); grid.replaceChildren();
  for(const dateIso of Object.keys(monthData.days||{}).sort())for(const role of ['bd','hg']){const cell=document.createElement('span');cell.dataset.slot=`${dateIso}|${role}`;cell.className=monthData.days[dateIso]?.[role]?'fixed':'open';cell.innerHTML=`<i>${dateIso.slice(-2)}</i><b>${role.toUpperCase()}</b>`;grid.append(cell);}
}
function phasePosition(phase){const normalized=phase==='search'?'propagate':phase;const index=PHASES.findIndex(([id])=>id===normalized);return ['complete','blocked'].includes(phase)?PHASES.length:index<0?1:index;}
function renderPhases(phase){const active=phasePosition(phase);document.querySelectorAll('#autoPlanPhaseList .auto-plan-phase').forEach((element,index)=>{const status=index<active?'done':index===active?'active':'pending';element.dataset.state=status;element.querySelector('b').textContent=status==='done'?'erledigt':status==='active'?'läuft':'offen';});}
function updateProgress(update){const percent=Math.round(Math.max(0,Math.min(1,Number(update.progress)||0))*100);dialog.dataset.phase=update.phase||'search';byId('autoPlanPercent').textContent=String(percent);byId('autoPlanCoreLabel').textContent=({analysis:'Analyse',search:update.subphase?.toUpperCase()||'Suche',propagate:'Propagation',repair:'Reparatur',polish:'Tausche',audit:'Audit',complete:'Bereit',blocked:'Prüfung'})[update.phase]||'Optimierung';byId('autoPlanMessage').textContent=update.message||'Optimierung läuft …';if(update.beamSize!==undefined)byId('autoPlanBeam').textContent=Number(update.beamSize).toLocaleString('de-DE');if(update.candidateCount!==undefined)byId('autoPlanCandidates').textContent=Number(update.candidateCount).toLocaleString('de-DE');if(update.exploredNodes!==undefined)byId('autoPlanExplored').textContent=Number(update.exploredNodes).toLocaleString('de-DE');if(update.deadEnds!==undefined)byId('autoPlanDeadEnds').textContent=Number(update.deadEnds).toLocaleString('de-DE');if(update.improvements!==undefined)byId('autoPlanRepair').textContent=`+${Number(update.improvements).toLocaleString('de-DE')}`;if(update.total!==undefined)byId('autoPlanFields').textContent=String(update.total);document.querySelector('.auto-plan-shell')?.style.setProperty('--auto-progress',`${percent}%`);renderPhases(update.phase);const cell=document.querySelector(`#autoPlanGrid [data-slot="${update.dateIso}|${update.role}"]`);if(cell){cell.classList.remove('open');cell.classList.add('done','active');setTimeout(()=>cell.classList.remove('active'),420);}visualizer?.update(update);}

function staffLabel(staffId){const person=getStaffById(state.staff,staffId);return person?.short||assignmentLabel(state.staff,staffId,{short:true})||staffId||'offen';}
function auditMap(result){return new Map((result.audit||[]).map(item=>[`${item.dateIso}|${item.role}`,item]));}
function roleCell(result,audits,dateIso,role){const before=result.baseline.days?.[dateIso]?.[role]||'',after=result.plannedMonth.days?.[dateIso]?.[role]||'',proposed=!before&&Boolean(after),audit=audits.get(`${dateIso}|${role}`),level=proposed?(audit?.level||'green'):before?'fixed':'open',reasons=proposed?(audit?.reasons||[]):[];return `<div class="auto-plan-assignment-cell ${esc(level)} ${proposed?'proposed':before?'fixed':'open'}"><div class="auto-plan-person-line"><strong>${esc(after?staffLabel(after):'offen')}</strong><span class="auto-plan-source-pill">${proposed?'Auto-Plan':before?'Fixpunkt':'offen'}</span></div><div class="auto-plan-cell-state"><i></i><span>${esc(level==='fixed'?'bestehend':level)}</span></div>${reasons.length?`<details class="auto-plan-cell-reasons"><summary>${reasons.length} Regelhinweis${reasons.length===1?'':'e'}</summary><ul>${reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul></details>`:''}</div>`;}
function rowLevel(audits,dateIso){const levels=['bd','hg'].map(role=>audits.get(`${dateIso}|${role}`)?.level).filter(Boolean);return levels.length?levels.sort((a,b)=>(LEVEL_ORDER[b]??-1)-(LEVEL_ORDER[a]??-1))[0]:'fixed';}
function rowReview(result,audits,dateIso){const items=['bd','hg'].map(role=>({role,audit:audits.get(`${dateIso}|${role}`)})).filter(item=>item.audit);if(!items.length)return '<span class="auto-plan-row-status fixed">Fixpunkte</span>';const highest=rowLevel(audits,dateIso),details=items.filter(item=>item.audit.reasons?.length).map(item=>`<section><strong>${item.role.toUpperCase()} · ${esc(item.audit.level)}</strong><ul>${item.audit.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul></section>`).join('');return `<div class="auto-plan-row-review"><span class="auto-plan-row-status ${esc(highest)}">${items.length} Vorschlag${items.length===1?'':'e'} · ${esc(highest)}</span>${details?`<details><summary>Regelgründe des Tages</summary>${details}</details>`:''}</div>`;}
function renderProposalTable(result){const audits=auditMap(result);byId('autoPlanProposalBody').innerHTML=Object.keys(result.plannedMonth.days||{}).sort().map(dateIso=>{const holiday=holidayName(dateIso),level=rowLevel(audits,dateIso);return `<tr id="auto-plan-row-${dateIso}" data-level="${esc(level)}"><th scope="row"><strong>${dateIso.slice(-2)}</strong>${holiday?`<small>${esc(holiday)}</small>`:''}</th><td><span>${esc(weekdayLabel(dateIso))}</span><small>${esc(fmtGermanDate(dateIso))}</small></td><td>${roleCell(result,audits,dateIso,'bd')}</td><td>${roleCell(result,audits,dateIso,'hg')}</td><td>${rowReview(result,audits,dateIso)}</td></tr>`;}).join('');}
function renderLoadTable(result){const rows=planningStaff(result.plannedMonth).map(person=>{const beforeBd=countRoleInMonth(result.baseline,person.id,'bd'),afterBd=countRoleInMonth(result.plannedMonth,person.id,'bd'),beforeHg=countRoleInMonth(result.baseline,person.id,'hg'),afterHg=countRoleInMonth(result.plannedMonth,person.id,'hg');return{person,beforeBd,afterBd,beforeHg,afterHg,beforeTotal:beforeBd+beforeHg,afterTotal:afterBd+afterHg,beforeWeekend:computeWeekendEquivalent(result.baseline,person.id),afterWeekend:computeWeekendEquivalent(result.plannedMonth,person.id),target:Number(person.bdTarget||0)}});byId('autoPlanLoadTable').innerHTML=`<table class="auto-plan-distribution-table"><thead><tr><th>Person</th><th>BD</th><th>HG</th><th>Gesamt</th><th>WE</th><th>BD-Soll</th></tr></thead><tbody>${rows.map(row=>`<tr><th>${esc(row.person.short||row.person.name)}</th><td>${row.beforeBd}<i>→</i><strong>${row.afterBd}</strong></td><td>${row.beforeHg}<i>→</i><strong>${row.afterHg}</strong></td><td>${row.beforeTotal}<i>→</i><strong>${row.afterTotal}</strong></td><td>${row.beforeWeekend.toFixed(1)}<i>→</i><strong>${row.afterWeekend.toFixed(1)}</strong></td><td>${row.target||'—'}</td></tr>`).join('')}</tbody></table>`;}
function renderSearch(result){const m=result.metrics||{},i=m.iterative||{},entries=[['Suchläufe',String(m.attempts?.length||0),''],['Varianten geprüft',Number(m.exploredNodes||0).toLocaleString('de-DE'),''],['Nachfolger',Number(m.generatedNodes||0).toLocaleString('de-DE'),''],['Sackgassen',Number(m.deadEnds||0).toLocaleString('de-DE'),''],['Exakte Restknoten',Number(m.exactNodes||0).toLocaleString('de-DE'),''],['Tauschrunden',String(i.rounds||0),'iterative'],['Nachbarschaften',Number(i.neighbors||0).toLocaleString('de-DE'),'iterative'],['Verbesserungen',String(i.improvements||0),'iterative'],['Paar-/Kettentausche',String((i.swaps||0)+(i.chains||0)+(i.dayBundles||0)),'iterative'],['Lokale Neuplanungen',`${i.localRebuilds||0} · ${Number(i.localNodes||0).toLocaleString('de-DE')} Knoten`,'iterative'],['Laufzeit',`${Number(result.elapsedMs||0).toLocaleString('de-DE')} ms`,'']];byId('autoPlanSearchProfile').textContent=result.searchProfile||'—';byId('autoPlanSearchMetrics').innerHTML=entries.map(([label,value,cls])=>`<div class="${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');}
function renderRunConfig(result){const c=result.runConfig||{},i=result.iterativeConfig||{};byId('autoPlanRunConfig').innerHTML=[['Suche',c.searchIntensity],['Fokus',c.optimizationFocus],['Rote Fallbacks',c.allowRedFallback?'erlaubt':'gesperrt'],['Reparaturrunden',i.repairIterations],['Neuplanungsbudget',i.localRebuildBudget]].map(([label,value])=>`<span>${esc(label)}: <b>${esc(value)}</b></span>`).join('');}

function renderRedReview(result){const review=byId('autoPlanRedReview'),required=result.requiresConfirmation&&result.redViolations.length;review.hidden=!required;dialog.classList.toggle('requires-confirmation',Boolean(required));byId('autoPlanConfirmRed').checked=false;byId('autoPlanConfirmRed').indeterminate=false;byId('autoPlanOverrideComment').value='';if(!required)return;const special=result.redViolations.some(v=>v.confirmationType==='special');byId('autoPlanOverrideComment').required=special;byId('autoPlanOverrideCommentLabel').textContent=special?'Begründender Kommentar, für besondere Ausnahmen erforderlich':'Gemeinsamer Kommentar, optional';byId('autoPlanRedCount').textContent=`${result.redViolations.length} rot`;byId('autoPlanRedList').innerHTML=result.redViolations.map((v,index)=>`<article class="auto-plan-red-item"><div class="auto-plan-red-item-main"><div><time>${esc(weekdayLabel(v.dateIso))}, ${esc(fmtGermanDate(v.dateIso))}</time><strong>${v.role.toUpperCase()} · ${esc(staffLabel(v.staffId))}</strong></div><span>${v.confirmationType==='special'?'besondere Bestätigung':'Bestätigung'}</span></div><ul>${v.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><div class="auto-plan-red-item-actions"><label><input type="checkbox" data-red-check="${index}"><span>Diese Abweichung geprüft</span></label><button type="button" class="secondary" data-jump="${v.dateIso}">In Tabelle zeigen</button></div></article>`).join('');}
function allRedConfirmed(){const checks=[...document.querySelectorAll('[data-red-check]')];return checks.length>0&&checks.every(check=>check.checked);}
function syncRed(){if(!proposal?.requiresConfirmation)return;const master=byId('autoPlanConfirmRed'),checks=[...document.querySelectorAll('[data-red-check]')],checked=checks.filter(c=>c.checked).length;master.checked=checks.length>0&&checked===checks.length;master.indeterminate=checked>0&&checked<checks.length;const special=proposal.redViolations.some(v=>v.confirmationType==='special'),ready=allRedConfirmed()&&(!special||byId('autoPlanOverrideComment').value.trim());byId('autoPlanApplyBtn').disabled=!ready;byId('autoPlanConfirmNote').textContent=ready?'Alle roten Abweichungen sind geprüft. Erst der Übernahmebutton schreibt den Plan.':`${checked}/${checks.length} rote Abweichungen geprüft${special&&!byId('autoPlanOverrideComment').value.trim()?' · Begründung erforderlich':''}.`;}

function renderResult(result){dialog.classList.remove('is-running','is-configuring');dialog.classList.add('show-result');dialog.dataset.phase=result.complete?'complete':'blocked';byId('autoPlanStage').hidden=true;byId('autoPlanResult').hidden=false;const warning=result.requiresConfirmation;byId('autoPlanSeal').classList.toggle('warning',warning);byId('autoPlanSeal').classList.toggle('failed',!result.complete);byId('autoPlanSeal').querySelector('span').textContent=!result.complete?'!':warning?'⚠':'✓';byId('autoPlanResultKicker').textContent=!result.complete?'Planung blockiert':warning?'Minimal-Rot-Fallback abgeschlossen':'Optimierung abgeschlossen';byId('autoPlanResultTitle').textContent=!result.complete?'Keine vollständige technisch wählbare Belegung':warning?'Vollständige Belegung mit roten Ausnahmen':'Regelkonformer Vorschlag bereit';byId('autoPlanResultText').textContent=!result.complete?`${result.metrics.unfilled} Felder blieben unbesetzt.`:warning?'Die vollständig tabellarisch dargestellte Lösung minimiert rote Abweichungen und benötigt deren ausdrückliche Prüfung.':`${result.changes.length} offene Felder wurden ohne rote oder nicht überschreibbare Regelverletzung global und iterativ optimiert.`;const cards=[['Regel-Audit',warning?`${result.metrics.red} rot`:result.complete?'0 rot':`${result.metrics.gray} gesperrt`,warning?'warning':result.complete?'verified':'failed'],['Fairness',`${result.metrics.fairnessIndex}%`,'fair'],['Wünsche',`${result.metrics.wishesFulfilled}/${result.metrics.wishesPossible}`,'wish'],['Vorschläge',String(result.metrics.proposed),'count'],['Hinweise',`${result.metrics.yellow} gelb · ${result.metrics.orange} orange`,'notes'],['Verbesserungen',String(result.metrics.iterative?.improvements||0),'search']];byId('autoPlanScorecards').innerHTML=cards.map(([label,value,tone])=>`<div class="auto-plan-scorecard ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');byId('autoPlanChangeCount').textContent=`${result.changes.length} neue Einträge · ${Object.keys(result.plannedMonth.days||{}).length} Tageszeilen`;renderRunConfig(result);renderSearch(result);renderProposalTable(result);renderLoadTable(result);renderRedReview(result);const apply=byId('autoPlanApplyBtn');apply.hidden=!result.complete||!result.changes.length;apply.disabled=warning;apply.textContent=warning?'Geprüfte rote Ausnahmen übernehmen':'Vorschläge übernehmen';byId('autoPlanStartBtn').hidden=true;byId('autoPlanCancelBtn').textContent=result.complete?'Vorschläge verwerfen':'Schließen';byId('autoPlanConfirmNote').textContent=!result.complete?'Es wurde nichts geschrieben.':'Der Monatsplan bleibt bis zur ausdrücklichen Übernahme unverändert.';if(warning)syncRed();requestAnimationFrame(()=>byId('autoPlanResultTitle').focus({preventScroll:true}));}

function resetProgress(monthData){proposal=null;dialog.classList.remove('show-result','requires-confirmation');dialog.classList.add('is-configuring');dialog.dataset.phase='analysis';byId('autoPlanConfig').hidden=false;byId('autoPlanStage').hidden=true;byId('autoPlanResult').hidden=true;byId('autoPlanStartBtn').hidden=false;byId('autoPlanApplyBtn').hidden=true;byId('autoPlanCancelBtn').textContent='Abbrechen';byId('autoPlanPercent').textContent='0';byId('autoPlanMessage').textContent='Monatszustand wird vorbereitet …';for(const id of ['autoPlanBeam','autoPlanCandidates','autoPlanExplored','autoPlanDeadEnds','autoPlanRepair','autoPlanFields'])byId(id).textContent='—';renderPhases('analysis');buildGrid(monthData);visualizer?.stop();renderConfig(monthData);}
function openStudio(){triggerFocus=document.activeElement;activeMonth=getMonthData(state.currentYear,state.currentMonth);resetProgress(activeMonth);byId('autoPlanSubtitle').textContent=`${getMonthLabel(activeMonth.year,activeMonth.month)} · zuerst Grenzen und Suchprofil festlegen`;dialog.showModal();requestAnimationFrame(()=>byId('autoPlanTitle').focus({preventScroll:true}));}
async function startPlanner(){if(!syncConfigValidation())return;const runConfig=readConfig();dialog.classList.remove('is-configuring');dialog.classList.add('is-running');dialog.dataset.phase='analysis';byId('autoPlanConfig').hidden=true;byId('autoPlanStage').hidden=false;byId('autoPlanStartBtn').hidden=true;trigger.disabled=true;controller?.abort();controller=new AbortController();visualizer?.stop();visualizer=new ConstraintVisualizer(byId('autoPlanCanvas'),activeMonth);try{proposal=await buildAutoPlan({state,monthData:activeMonth,year:activeMonth.year,month:activeMonth.month,runConfig,signal:controller.signal,onProgress:async update=>{updateProgress(update);if(['complete','blocked'].includes(update.phase))await new Promise(resolve=>setTimeout(resolve,620));}});renderResult(proposal);}catch(error){if(error?.name==='AbortError')return;proposal={success:false,complete:false,requiresConfirmation:false,status:'blocked',changes:[],redViolations:[],baseline:activeMonth,plannedMonth:activeMonth,audit:[],runConfig,iterativeConfig:{repairIterations:runConfig.repairIterations,localRebuildBudget:runConfig.localRebuildBudget},metrics:{proposed:0,unfilled:0,red:0,specialRed:0,gray:0,orange:0,yellow:0,wishesFulfilled:0,wishesPossible:0,fairnessIndex:0,attempts:[],iterative:{}}};updateProgress({phase:'blocked',progress:1,message:error?.message||'Auto-Plan fehlgeschlagen'});renderResult(proposal);}finally{trigger.disabled=false;document.body.classList.remove('auto-plan-running');}}
async function applyProposal(){if(!proposal?.success||!proposal.complete||!proposal.changes.length)return;const confirmation=proposal.requiresConfirmation?{accepted:allRedConfirmed(),comment:byId('autoPlanOverrideComment').value.trim()}:null;if(proposal.requiresConfirmation&&!confirmation.accepted){syncRed();return;}const button=byId('autoPlanApplyBtn');button.disabled=true;button.textContent='Übernahme wird erneut geprüft und gesichert …';try{const current=getMonthData(proposal.year,proposal.month),merged=applyAutoPlanProposal({state,currentMonth:current,proposal,confirmation});setMonthData(proposal.year,proposal.month,merged,'local');markMonthDirty(proposal.year,proposal.month);const saved=await persistMonth(proposal.year,proposal.month);byId('autoPlanConfirmNote').textContent=saved.ok?'Auto-Plan vollständig übernommen, protokolliert und gespeichert.':'Lokal übernommen · Serversynchronisierung ausstehend.';await new Promise(resolve=>setTimeout(resolve,520));dialog.close('applied');byId('reloadBtn')?.click();}catch(error){button.disabled=proposal.requiresConfirmation&&!allRedConfirmed();button.textContent=proposal.requiresConfirmation?'Geprüfte rote Ausnahmen übernehmen':'Vorschläge übernehmen';byId('autoPlanConfirmNote').textContent=error?.message||'Übernahme nicht möglich.';}}
function closeStudio(){controller?.abort();controller=null;visualizer?.stop();dialog.close('cancel');}
function bind(){trigger.addEventListener('click',openStudio);byId('autoPlanCloseBtn').addEventListener('click',closeStudio);byId('autoPlanCancelBtn').addEventListener('click',closeStudio);byId('autoPlanStartBtn').addEventListener('click',startPlanner);byId('autoPlanApplyBtn').addEventListener('click',applyProposal);byId('autoPlanConfig').addEventListener('input',syncConfigValidation);byId('autoPlanConfig').addEventListener('change',syncConfigValidation);byId('autoPlanRedReview').addEventListener('change',event=>{if(event.target===byId('autoPlanConfirmRed'))document.querySelectorAll('[data-red-check]').forEach(check=>{check.checked=event.target.checked;});syncRed();});byId('autoPlanOverrideComment').addEventListener('input',syncRed);byId('autoPlanRedList').addEventListener('click',event=>{const button=event.target.closest('[data-jump]');if(!button)return;const row=byId(`auto-plan-row-${button.dataset.jump}`);row?.scrollIntoView({behavior:'smooth',block:'center'});row?.classList.add('auto-plan-jump-highlight');setTimeout(()=>row?.classList.remove('auto-plan-jump-highlight'),1400);});dialog.addEventListener('cancel',event=>{event.preventDefault();closeStudio();});dialog.addEventListener('close',()=>{controller?.abort();controller=null;visualizer?.stop();visualizer=null;triggerFocus?.focus?.();});}
function initialize(){if(installed)return;installStylesheets();const attempt=()=>{trigger=createTrigger();if(!trigger){setTimeout(attempt,80);return;}dialog=createDialog();bind();installed=true;};requestAnimationFrame(attempt);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
