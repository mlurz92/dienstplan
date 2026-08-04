/** Auto-Plan Studio v9 – CP-SAT, Exact-LNS und Nachweissteuerung. */
import './auto-plan-studio-v8-5.js?v=20260803.4';
import { AUTO_PLAN_STAGES } from './auto-planner-v9.js?v=20260803.4';
import { state } from './state.js?v=20260803.4';
import { installAutoPlanV9Tooltips } from './auto-plan-tooltips-v9.js?v=20260803.4';
import { formatV9Commentary, v9CommentaryKey } from './auto-plan-commentary-v9.js?v=20260803.4';
import { AutoPlanV9ProofVisualizer } from './auto-plan-visualizer-v9.js?v=20260803.4';

const RELEASE = '20260803.4';
const STORAGE_KEY = 'dienstplanrad:autoplan-v9-studio';
const DEFAULTS = Object.freeze({
  mode: 'balanced', goal: 'new-plan', alternatives: 3,
  targetGapPermille: 20, minimumAlternativeDistance: 5, maxChanges: null,
  deterministic: false, exactLns: true, lnsMinSize: 8, lnsMaxSize: 24,
  remoteSolver: true, relaxAbsence: true, relaxHardMaximum: false,
  relaxOrganizational: true, seed: 0
});
const PRESETS = Object.freeze({
  quick: { alternatives: 1, targetGapPermille: 100, lnsMinSize: 6, lnsMaxSize: 14, seconds: 15 },
  balanced: { alternatives: 3, targetGapPermille: 20, lnsMinSize: 8, lnsMaxSize: 24, seconds: 60 },
  intensive: { alternatives: 5, targetGapPermille: 10, lnsMinSize: 12, lnsMaxSize: 36, seconds: 180 },
  proof: { alternatives: 3, targetGapPermille: 0, lnsMinSize: 14, lnsMaxSize: 48, seconds: 600 }
});
const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

let highestStage = 0;
let proofVisualizer = null;
let result = null;
let alternatives = [];
const seenComments = new Set();

function readStored() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function settings() {
  state.settings ||= {};
  state.settings.autoPlan ||= {};
  state.settings.autoPlan.v9 = {
    ...DEFAULTS,
    ...readStored(),
    ...(state.settings.autoPlan.v9 || {})
  };
  return state.settings.autoPlan.v9;
}

function fieldValue(id) {
  const field = byId(id);
  return field?.type === 'checkbox' ? field.checked : field?.value;
}

function bounded(id, fallback, min, max, nullable = false) {
  const value = fieldValue(id);
  if (nullable && (value === '' || value === undefined || value === null)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function writeField(id, value) {
  const field = byId(id);
  if (!field) return;
  if (field.type === 'checkbox') field.checked = Boolean(value);
  else field.value = value === null || value === undefined ? '' : String(value);
}

function persist() {
  const target = settings();
  Object.assign(target, {
    mode: fieldValue('autoPlanV9Mode') || target.mode,
    goal: fieldValue('autoPlanV9Goal') || target.goal,
    alternatives: bounded('autoPlanV9Alternatives', target.alternatives, 1, 5),
    targetGapPermille: bounded('autoPlanV9Gap', target.targetGapPermille, 0, 500),
    minimumAlternativeDistance: bounded('autoPlanV9Distance', target.minimumAlternativeDistance, 1, 20),
    maxChanges: bounded('autoPlanV9MaxChanges', target.maxChanges, 0, 62, true),
    deterministic: Boolean(fieldValue('autoPlanV9Deterministic')),
    exactLns: Boolean(fieldValue('autoPlanV9ExactLns')),
    lnsMinSize: bounded('autoPlanV9LnsMin', target.lnsMinSize, 4, 30),
    lnsMaxSize: bounded('autoPlanV9LnsMax', target.lnsMaxSize, 8, 62),
    remoteSolver: Boolean(fieldValue('autoPlanV9Remote')),
    relaxAbsence: Boolean(fieldValue('autoPlanV9RelaxAbsence')),
    relaxHardMaximum: Boolean(fieldValue('autoPlanV9RelaxMaximum')),
    relaxOrganizational: Boolean(fieldValue('autoPlanV9RelaxOrganizational')),
    seed: bounded('autoPlanV9Seed', target.seed, 0, 2_147_483_647)
  });
  target.lnsMaxSize = Math.max(target.lnsMinSize, target.lnsMaxSize);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(target)); } catch { /* optional */ }
  renderDerived();
}

function applyPreset(mode) {
  const preset = PRESETS[mode] || PRESETS.balanced;
  for (const [id, value] of Object.entries({
    autoPlanV9Mode: mode,
    autoPlanV9Alternatives: preset.alternatives,
    autoPlanV9Gap: preset.targetGapPermille,
    autoPlanV9LnsMin: preset.lnsMinSize,
    autoPlanV9LnsMax: preset.lnsMaxSize,
    autoPlanTimeBudget: preset.seconds
  })) writeField(id, value);
  byId('autoPlanTimeBudget')?.dispatchEvent(new Event('input', { bubbles: true }));
  persist();
}

function markup() {
  return `<section class="auto-plan-card auto-plan-v9-config" aria-labelledby="autoPlanV9ConfigTitle">
    <header><span>CP-SAT Guided Adaptive Exact-LNS</span><h3 id="autoPlanV9ConfigTitle">Engine v9</h3><p>Exakte Machbarkeit, lexikografische Ziele, adaptive exakte Teilneuplanung, Varianten und unabhängiger Browseraudit.</p></header>
    <div class="auto-plan-v9-grid">
      <label class="auto-plan-field"><span>Laufmodus</span><select id="autoPlanV9Mode"><option value="quick">Schnell</option><option value="balanced">Ausgewogen · empfohlen</option><option value="intensive">Intensiv</option><option value="proof">Nachweis</option></select><small>Verbindlicher Phasen- und Budgetvertrag</small></label>
      <label class="auto-plan-field"><span>Planungsziel</span><select id="autoPlanV9Goal"><option value="new-plan">Offene Felder neu planen</option><option value="repair">Plan reparieren</option><option value="minimal-change">Änderungen minimieren</option></select><small>Priorität der Planstabilität</small></label>
      <label class="auto-plan-field"><span>Varianten</span><select id="autoPlanV9Alternatives">${[1,2,3,4,5].map(value => `<option>${value}</option>`).join('')}</select><small>Qualitätsgebundene Alternativen</small></label>
      <label class="auto-plan-field"><span>Ziel-Gap</span><select id="autoPlanV9Gap"><option value="100">10 %</option><option value="50">5 %</option><option value="20">2 %</option><option value="10">1 %</option><option value="0">0 % · Modelloptimum beweisen</option></select><small>Abstand zur mathematischen Schranke</small></label>
      <label class="auto-plan-field"><span>Variantendistanz</span><select id="autoPlanV9Distance"><option value="2">2 Zellen</option><option value="5">5 Zellen</option><option value="10">10 Zellen</option><option value="15">15 Zellen</option></select><small>Mindest-Hamming-Distanz</small></label>
      <label class="auto-plan-field"><span>Maximale Änderungen</span><input id="autoPlanV9MaxChanges" type="number" min="0" max="62" placeholder="unbegrenzt"><small>Für Reparatur und Minimaländerung</small></label>
    </div>
    <details class="auto-plan-v9-advanced"><summary>Solver, Exact-LNS und Relaxierungen</summary>
      <div class="auto-plan-v9-grid">
        <label class="auto-plan-field"><span>Exact-LNS Minimum</span><input id="autoPlanV9LnsMin" type="number" min="4" max="30"><small>Kleinste Teilmodellgröße</small></label>
        <label class="auto-plan-field"><span>Exact-LNS Maximum</span><input id="autoPlanV9LnsMax" type="number" min="8" max="62"><small>Größte Teilmodellgröße</small></label>
        <label class="auto-plan-field"><span>Seed</span><input id="autoPlanV9Seed" type="number" min="0" max="2147483647"><small>0: aus Planfingerprint</small></label>
      </div>
      <div class="auto-plan-switch-row auto-plan-v9-switches">
        <label class="auto-plan-switch"><input id="autoPlanV9Remote" type="checkbox"><span>Nativen CP-SAT-Dienst über Cloudflare verwenden.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9Deterministic" type="checkbox"><span>Reproduzierbaren Nachweismodus bevorzugen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9ExactLns" type="checkbox"><span>Adaptive Exact-LNS ausführen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9RelaxAbsence" type="checkbox"><span>Abwesenheit als letzte bestätigungspflichtige Ausnahme zulassen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9RelaxMaximum" type="checkbox"><span>Personenobergrenzen als letzte Ausnahme zulassen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9RelaxOrganizational" type="checkbox"><span>Organisatorische Kopplungen nachgelagert relaxieren.</span></label>
      </div>
    </details>
    <div class="auto-plan-v9-derived" id="autoPlanV9Derived"></div>
  </section>`;
}

function installControls(dialog) {
  if (dialog.querySelector('#autoPlanV9ConfigTitle')) return;
  const anchor = dialog.querySelector('.auto-plan-config-hero');
  if (!anchor) return;
  const template = document.createElement('template');
  template.innerHTML = markup();
  anchor.prepend(template.content);
  const current = settings();
  const map = {
    mode: 'autoPlanV9Mode', goal: 'autoPlanV9Goal', alternatives: 'autoPlanV9Alternatives',
    targetGapPermille: 'autoPlanV9Gap', minimumAlternativeDistance: 'autoPlanV9Distance',
    maxChanges: 'autoPlanV9MaxChanges', deterministic: 'autoPlanV9Deterministic',
    exactLns: 'autoPlanV9ExactLns', lnsMinSize: 'autoPlanV9LnsMin', lnsMaxSize: 'autoPlanV9LnsMax',
    remoteSolver: 'autoPlanV9Remote', relaxAbsence: 'autoPlanV9RelaxAbsence',
    relaxHardMaximum: 'autoPlanV9RelaxMaximum', relaxOrganizational: 'autoPlanV9RelaxOrganizational',
    seed: 'autoPlanV9Seed'
  };
  for (const [key, id] of Object.entries(map)) writeField(id, current[key]);
  byId('autoPlanV9Mode')?.addEventListener('change', event => applyPreset(event.target.value));
  dialog.querySelectorAll('.auto-plan-v9-config input, .auto-plan-v9-config select').forEach(field => {
    if (field.id !== 'autoPlanV9Mode') field.addEventListener('change', persist);
  });
  byId('autoPlanStartBtn')?.addEventListener('click', persist, { capture: true });
  installAutoPlanV9Tooltips(dialog);
  renderDerived();
}

function renderDerived() {
  const host = byId('autoPlanV9Derived');
  if (!host) return;
  const current = settings();
  host.innerHTML = `<span><b>${esc(current.mode)}</b> Profil</span><span><b>${current.alternatives}</b> Varianten</span><span><b>${(current.targetGapPermille / 10).toLocaleString('de-DE')} %</b> Ziel-Gap</span><span><b>${current.lnsMinSize}–${current.lnsMaxSize}</b> LNS-Felder</span><span><b>${current.remoteSolver ? 'CP-SAT' : 'lokal'}</b> Primärpfad</span>`;
}

function stageIndex(update) {
  const direct = AUTO_PLAN_STAGES.findIndex(stage => stage.id === String(update?.stage || '').toLowerCase());
  if (direct >= 0) return direct;
  const aliases = {
    analysis: 0, propagate: 1, search: 2, repair: 3, polish: 4,
    perfect: 6, certify: 8, audit: 9, complete: 9, blocked: 8
  };
  return aliases[String(update?.phase || '').toLowerCase()] ?? highestStage;
}

function installTheatre(dialog) {
  if (dialog.querySelector('#autoPlanV9Theatre')) return;
  const legacy = dialog.querySelector('#autoPlanV85Theatre');
  if (legacy) legacy.hidden = true;
  const anchor = legacy || dialog.querySelector('#autoPlanPhaseList');
  if (!anchor) return;
  const section = document.createElement('section');
  section.id = 'autoPlanV9Theatre';
  section.className = 'auto-plan-v9-theatre';
  section.setAttribute('aria-label', 'Bearbeitungs- und Nachweisstand der Auto-Plan Engine v9');
  section.innerHTML = `<header><div><span>CP-SAT Guided Adaptive Exact-LNS</span><h3>Solver- und Nachweisobservatorium</h3></div><strong id="autoPlanV9Status" data-v9-tooltip="autoPlanV9ProofStatus">bereit</strong></header>
    <ol>${AUTO_PLAN_STAGES.map((stage, index) => `<li data-index="${index}" data-stage="${stage.id}"><i></i><div><b>${esc(stage.title)}</b><small>${esc(stage.detail)}</small></div><span>offen</span></li>`).join('')}</ol>
    <div class="auto-plan-v9-proof-metrics"><div><span>Status</span><b id="autoPlanV9SolverStatus">—</b></div><div id="autoPlanV9BestBound" data-v9-tooltip="autoPlanV9BestBound"><span>Beste Schranke</span><b>—</b></div><div><span>Gap</span><b id="autoPlanV9GapLive">—</b></div><div><span>Branches</span><b id="autoPlanV9Branches">—</b></div><div><span>Konflikte</span><b id="autoPlanV9Conflicts">—</b></div></div>`;
  anchor.after(section);
  installAutoPlanV9Tooltips(section);
}

function appendComment(update) {
  const formatted = formatV9Commentary(update);
  const stream = byId('autoPlanLog');
  if (!formatted || !stream) return;
  const key = v9CommentaryKey(update);
  if (seenComments.has(key)) return;
  seenComments.add(key);
  const entry = document.createElement('p');
  entry.className = `auto-plan-log-entry is-${formatted.kind} is-v9-proof`;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('de-DE');
  const marker = document.createElement('i');
  marker.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = formatted.text.replace(/<\/?b>/g, '');
  entry.append(time, marker, text);
  stream.append(entry);
  while (stream.childElementCount > 220) stream.firstElementChild?.remove();
  stream.scrollTop = stream.scrollHeight;
}

function updateTheatre(dialog, update = {}) {
  highestStage = Math.max(highestStage, stageIndex(update));
  dialog.querySelectorAll('#autoPlanV9Theatre li').forEach((item, index) => {
    const value = index < highestStage ? 'done' : index === highestStage ? 'active' : 'pending';
    item.dataset.state = value;
    item.querySelector(':scope > span').textContent = value === 'done' ? 'erledigt' : value === 'active' ? 'läuft' : 'offen';
  });
  const status = String(update.solverStatus || update.status || '').toUpperCase();
  if (status) {
    byId('autoPlanV9SolverStatus').textContent = status;
    byId('autoPlanV9Status').textContent = status;
  }
  if (Number.isFinite(Number(update.bestBound))) byId('autoPlanV9BestBound').querySelector('b').textContent = Number(update.bestBound).toLocaleString('de-DE');
  if (Number.isFinite(Number(update.relativeGap))) byId('autoPlanV9GapLive').textContent = `${(Number(update.relativeGap) * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
  if (Number.isFinite(Number(update.branches))) byId('autoPlanV9Branches').textContent = Number(update.branches).toLocaleString('de-DE');
  if (Number.isFinite(Number(update.conflicts))) byId('autoPlanV9Conflicts').textContent = Number(update.conflicts).toLocaleString('de-DE');
  appendComment(update);
  proofVisualizer?.update(update);
}

function installResults(dialog) {
  if (dialog.querySelector('#autoPlanV9ProofResult')) return;
  const anchor = dialog.querySelector('#autoPlanV85Result') || dialog.querySelector('#autoPlanSearchMetrics')?.closest('.auto-plan-panel');
  if (!anchor) return;
  const proof = document.createElement('section');
  proof.id = 'autoPlanV9ProofResult';
  proof.className = 'auto-plan-card auto-plan-v9-proof-result';
  proof.hidden = true;
  const variants = document.createElement('section');
  variants.id = 'autoPlanV9Variants';
  variants.className = 'auto-plan-card auto-plan-v9-variants';
  variants.hidden = true;
  anchor.after(proof, variants);
}

function renderProof(value) {
  const panel = byId('autoPlanV9ProofResult');
  if (!panel) return;
  const metrics = value?.metrics || {};
  const status = metrics.solverStatus || value?.solverStatus || 'HEURISTIC';
  const stages = metrics.lexicographicStages || [];
  const core = metrics.conflictCore || [];
  const suggestions = metrics.relaxationSuggestions || [];
  panel.hidden = false;
  panel.innerHTML = `<header><div><span>v9 Nachweisprotokoll</span><h4>${esc(status === 'OPTIMAL' ? 'Optimum im kompilierten v9-Modell bewiesen' : status === 'INFEASIBLE' ? 'Unlösbarkeit im kompilierten v9-Modell bewiesen' : status === 'FEASIBLE' ? 'Beste gefundene Modelllösung' : 'Lokaler, vollständig auditierter Fallback')}</h4></div><strong>${esc(status)}</strong></header>
    <div class="auto-plan-v9-result-grid"><div><span>Zielfunktionswert</span><b>${Number.isFinite(metrics.objectiveValue) ? esc(metrics.objectiveValue) : '—'}</b></div><div><span>Beste Schranke</span><b>${Number.isFinite(metrics.bestBound) ? esc(metrics.bestBound) : '—'}</b></div><div><span>Gap</span><b>${Number.isFinite(metrics.relativeGap) ? `${(metrics.relativeGap * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %` : '—'}</b></div><div><span>Branches</span><b>${Number(metrics.branches || 0).toLocaleString('de-DE')}</b></div></div>
    ${stages.length ? `<details open><summary>Lexikografische Zielstufen</summary><ol>${stages.map(stage => `<li><span>${esc(stage.title || stage.id)}</span><b>${esc(stage.status)}</b><small>${stage.value === undefined ? '' : `Wert ${esc(stage.value)}`}</small></li>`).join('')}</ol></details>` : ''}
    ${core.length ? `<details id="autoPlanV9ConflictCore" open data-v9-tooltip="autoPlanV9ConflictCore"><summary>Reduzierter Konfliktkern · ${core.length}</summary><ul>${core.map(item => `<li><b>${esc(item.title || item.id)}</b>${item.detail ? ` · ${esc(item.detail)}` : ''}</li>`).join('')}</ul></details>` : ''}
    ${suggestions.length ? `<details open><summary>Relaxierungsvorschläge</summary><ol>${suggestions.map(item => `<li>${esc(item.label || item.description || item.id || item)}</li>`).join('')}</ol></details>` : ''}`;
  installAutoPlanV9Tooltips(panel);
}

function selectAlternative(index) {
  if (!result || !alternatives[index]) return;
  const selected = alternatives[index];
  for (const key of ['plannedMonth', 'changes', 'audit', 'redViolations', 'metrics', 'objectiveKey', 'searchProfile', 'proposalFingerprint']) {
    result[key] = selected[key];
  }
  result.v9VariantIndex = index;
  renderProof(result);
  document.querySelectorAll('#autoPlanV9Variants button').forEach(button => {
    const active = Number(button.dataset.variant) === index;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderVariants(value) {
  const panel = byId('autoPlanV9Variants');
  if (!panel) return;
  alternatives = [value, ...(value.alternatives || [])];
  if (alternatives.length < 2) { panel.hidden = true; return; }
  const selectable = !value.requiresConfirmation;
  panel.hidden = false;
  panel.innerHTML = `<header><div><span>Diverse Lösungen</span><h4>${alternatives.length} Vorschlagsvarianten</h4></div><strong>${selectable ? 'auswählbar' : 'Vergleich'}</strong></header><div class="auto-plan-v9-variant-list">${alternatives.map((item, index) => `<button type="button" data-variant="${index}" aria-pressed="${index === 0}" class="${index === 0 ? 'is-selected' : ''}" ${selectable ? '' : 'disabled'}><span>${index ? `Variante ${index + 1}` : 'Hauptlösung'}</span><b>${item.metrics?.red || 0} rot · ${item.metrics?.orange || 0} orange · ${item.metrics?.yellow || 0} gelb</b><small>Fairness ${item.metrics?.fairnessIndex || 0} % · ${item.changes?.length || 0} Zellen</small></button>`).join('')}</div>`;
  if (selectable) panel.querySelectorAll('button').forEach(button => button.addEventListener('click', () => selectAlternative(Number(button.dataset.variant))));
}

function reset(dialog) {
  highestStage = 0;
  seenComments.clear();
  dialog.querySelectorAll('#autoPlanV9Theatre li').forEach((item, index) => {
    item.dataset.state = index === 0 ? 'active' : 'pending';
    item.querySelector(':scope > span').textContent = index === 0 ? 'läuft' : 'offen';
  });
  proofVisualizer?.reset();
}

function upgradeIdentity(dialog) {
  // Alte Integrationshooks bleiben für bestehende Automatisierung stabil.
  dialog.dataset.algorithmRevision = '9';
  dialog.dataset.engineRevision = '9';
  dialog.dataset.solverRevision = '9';
  dialog.dataset.legacyAlgorithmRevision = '8';
  dialog.dataset.legacyEngineRevision = '8.5';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, #autoPlanV75Ribbon, #autoPlanV7Ribbon');
  if (ribbon) {
    ribbon.classList.add('auto-plan-v9-ribbon');
    ribbon.querySelector('b').textContent = 'CP-SAT Guided Adaptive Exact-LNS · v9';
    ribbon.querySelector('small').textContent = 'Modell-Machbarkeit · lexikografische Zielstufen · adaptive exakte Teilneuplanung · Varianten · Konfliktkerne · unabhängiger Audit';
    ribbon.querySelector(':scope > strong').textContent = 'ENGINE v9';
  }
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.v9Enhanced === 'true') return;
  dialog.dataset.v9Enhanced = 'true';
  upgradeIdentity(dialog);
  installControls(dialog);
  installTheatre(dialog);
  installResults(dialog);
  proofVisualizer = new AutoPlanV9ProofVisualizer(dialog);
  new MutationObserver(() => {
    if (dialog.classList.contains('is-configuring')) reset(dialog);
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('autoplanprogress', event => updateTheatre(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    result = event.detail || null;
    if (!result) return;
    result.v9VariantIndex = 0;
    proofVisualizer?.finish(result);
    renderProof(result);
    renderVariants(result);
  });
}

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v9-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9.css?v=${RELEASE}`;
  link.dataset.autoPlanV9Style = 'true';
  document.head.append(link);
}

function initialize() {
  addStylesheet();
  const install = event => {
    const dialog = event?.detail?.dialog || byId('autoPlanDialog');
    if (!dialog) return false;
    enhance(dialog);
    return true;
  };
  if (!install()) window.addEventListener('autoplanstudioready', install, { once: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}
