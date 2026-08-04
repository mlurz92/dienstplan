/**
 * Auto-Plan Studio v9 – CP-SAT, Exact-LNS, Nachweis- und Variantensteuerung.
 */
import './auto-plan-studio-v8-5.js?v=20260803.4';
import { AUTO_PLAN_STAGES } from './auto-planner-v9.js?v=20260804.1';
import { state } from './state.js?v=20260803.4';
import {
  assignmentLabel,
  fmtGermanDate,
  getStaffById,
  weekdayLabel
} from './rules.js?v=20260803.4';
import { holidayName } from './holidays.js?v=20260803.4';
import { installAutoPlanV9Tooltips } from './auto-plan-tooltips-v9.js?v=20260804.1';
import { formatV9Commentary, v9CommentaryKey } from './auto-plan-commentary-v9.js?v=20260804.1';
import { AutoPlanV9ProofVisualizer } from './auto-plan-visualizer-v9.js?v=20260804.1';

const RELEASE = '20260804.1';
const STORAGE_KEY = 'dienstplanrad:autoplan-v9-studio';
const DEFAULTS = Object.freeze({
  mode: 'balanced',
  goal: 'new-plan',
  alternatives: 3,
  targetGapPermille: 20,
  minimumAlternativeDistance: 5,
  maxChanges: null,
  deterministic: false,
  exactLns: true,
  lnsMinSize: 8,
  lnsMaxSize: 24,
  remoteSolver: true,
  relaxAbsence: true,
  relaxHardMaximum: false,
  relaxOrganizational: true,
  seed: 0
});

const MODE_PRESETS = Object.freeze({
  quick: { alternatives: 1, targetGapPermille: 100, lnsMinSize: 6, lnsMaxSize: 14, time: 15 },
  balanced: { alternatives: 3, targetGapPermille: 20, lnsMinSize: 8, lnsMaxSize: 24, time: 60 },
  intensive: { alternatives: 5, targetGapPermille: 10, lnsMinSize: 12, lnsMaxSize: 36, time: 180 },
  proof: { alternatives: 3, targetGapPermille: 0, lnsMinSize: 14, lnsMaxSize: 48, time: 600 }
});

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const byId = id => document.getElementById(id);

let proofVisualizer = null;
let lastResult = null;
let variantSnapshots = [];
let highestStage = 0;
const commentarySeen = new Set();

function readStored() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeStored(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* optional */ }
}

function currentSettings() {
  state.settings ||= {};
  state.settings.autoPlan ||= {};
  const stored = readStored();
  state.settings.autoPlan.v9 = {
    ...DEFAULTS,
    ...stored,
    ...(state.settings.autoPlan.v9 || {})
  };
  return state.settings.autoPlan.v9;
}

function valueOf(id) {
  const element = byId(id);
  if (!element) return undefined;
  if (element.type === 'checkbox') return element.checked;
  return element.value;
}

function integer(id, fallback, min, max, nullable = false) {
  const value = valueOf(id);
  if (nullable && (value === '' || value === null || value === undefined)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function syncSettings() {
  const settings = currentSettings();
  Object.assign(settings, {
    mode: valueOf('autoPlanV9Mode') || settings.mode,
    goal: valueOf('autoPlanV9Goal') || settings.goal,
    alternatives: integer('autoPlanV9Alternatives', settings.alternatives, 1, 5),
    targetGapPermille: integer('autoPlanV9Gap', settings.targetGapPermille, 0, 500),
    minimumAlternativeDistance: integer('autoPlanV9Distance', settings.minimumAlternativeDistance, 1, 20),
    maxChanges: integer('autoPlanV9MaxChanges', settings.maxChanges, 0, 62, true),
    deterministic: Boolean(valueOf('autoPlanV9Deterministic')),
    exactLns: Boolean(valueOf('autoPlanV9ExactLns')),
    lnsMinSize: integer('autoPlanV9LnsMin', settings.lnsMinSize, 4, 30),
    lnsMaxSize: integer('autoPlanV9LnsMax', settings.lnsMaxSize, 8, 62),
    remoteSolver: Boolean(valueOf('autoPlanV9Remote')),
    relaxAbsence: Boolean(valueOf('autoPlanV9RelaxAbsence')),
    relaxHardMaximum: Boolean(valueOf('autoPlanV9RelaxMaximum')),
    relaxOrganizational: Boolean(valueOf('autoPlanV9RelaxOrganizational')),
    seed: integer('autoPlanV9Seed', settings.seed, 0, 2_147_483_647)
  });
  if (settings.lnsMaxSize < settings.lnsMinSize) settings.lnsMaxSize = settings.lnsMinSize;
  writeStored(settings);
  syncSummary();
}

function setField(id, value) {
  const element = byId(id);
  if (!element) return;
  if (element.type === 'checkbox') element.checked = Boolean(value);
  else element.value = value === null || value === undefined ? '' : String(value);
}

function applyMode(mode, { persist = true } = {}) {
  const preset = MODE_PRESETS[mode] || MODE_PRESETS.balanced;
  setField('autoPlanV9Mode', mode);
  setField('autoPlanV9Alternatives', preset.alternatives);
  setField('autoPlanV9Gap', preset.targetGapPermille);
  setField('autoPlanV9LnsMin', preset.lnsMinSize);
  setField('autoPlanV9LnsMax', preset.lnsMaxSize);
  const time = byId('autoPlanTimeBudget');
  if (time) {
    time.value = String(preset.time);
    time.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (persist) syncSettings();
}

function controlsMarkup(settings) {
  return `<section class="auto-plan-card auto-plan-v9-config" aria-labelledby="autoPlanV9ConfigTitle">
    <header><span>CP-SAT Guided Adaptive Exact-LNS</span><h3 id="autoPlanV9ConfigTitle">Engine v9</h3><p>Exakte Machbarkeit und Schranken, adaptive Teilneuplanung, qualitätsgebundene Varianten und unabhängiger Browseraudit.</p></header>
    <div class="auto-plan-v9-grid">
      <label class="auto-plan-field"><span>Laufmodus</span><select id="autoPlanV9Mode"><option value="quick">Schnell</option><option value="balanced">Ausgewogen · empfohlen</option><option value="intensive">Intensiv</option><option value="proof">Nachweis</option></select><small>Verbindlicher Phasen- und Budgetvertrag</small></label>
      <label class="auto-plan-field"><span>Planungsziel</span><select id="autoPlanV9Goal"><option value="new-plan">Offene Felder neu planen</option><option value="repair">Bestehenden Plan reparieren</option><option value="minimal-change">Änderungen minimieren</option></select><small>Bestimmt die Rangfolge der Stabilitätsziele</small></label>
      <label class="auto-plan-field"><span>Vorschlagsvarianten</span><select id="autoPlanV9Alternatives">${[1,2,3,4,5].map(number => `<option value="${number}">${number}</option>`).join('')}</select><small>Qualitätsgebundene Alternativen</small></label>
      <label class="auto-plan-field"><span>Ziel-Gap</span><select id="autoPlanV9Gap"><option value="100">10 %</option><option value="50">5 %</option><option value="20">2 %</option><option value="10">1 %</option><option value="0">0 % · Optimum beweisen</option></select><small>Abstand zur mathematischen Schranke</small></label>
      <label class="auto-plan-field"><span>Variantendistanz</span><select id="autoPlanV9Distance"><option value="2">niedrig · 2 Zellen</option><option value="5">mittel · 5 Zellen</option><option value="10">hoch · 10 Zellen</option><option value="15">sehr hoch · 15 Zellen</option></select><small>Mindest-Hamming-Distanz</small></label>
      <label class="auto-plan-field"><span>Maximale Änderungen</span><input id="autoPlanV9MaxChanges" type="number" min="0" max="62" step="1" placeholder="unbegrenzt"><small>Nur für Reparatur und Minimaländerung</small></label>
    </div>
    <details class="auto-plan-v9-advanced"><summary>Solver, Exact-LNS und Relaxierungen</summary>
      <div class="auto-plan-v9-grid">
        <label class="auto-plan-field"><span>Exact-LNS Minimum</span><input id="autoPlanV9LnsMin" type="number" min="4" max="30" step="1"><small>Freigegebene Felder je kleiner Runde</small></label>
        <label class="auto-plan-field"><span>Exact-LNS Maximum</span><input id="autoPlanV9LnsMax" type="number" min="8" max="62" step="1"><small>Maximale Teilmodellgröße</small></label>
        <label class="auto-plan-field"><span>Reproduzierbarer Seed</span><input id="autoPlanV9Seed" type="number" min="0" max="2147483647" step="1"><small>0: aus Planfingerprint abgeleitet</small></label>
      </div>
      <div class="auto-plan-switch-row auto-plan-v9-switches">
        <label class="auto-plan-switch"><input id="autoPlanV9Remote" type="checkbox"><span>Nativen CP-SAT-Dienst über Cloudflare verwenden.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9Deterministic" type="checkbox"><span>Deterministischen Nachweismodus bevorzugen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9ExactLns" type="checkbox"><span>Adaptive Exact-LNS nach der globalen Zielpipeline ausführen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9RelaxAbsence" type="checkbox"><span>Abwesenheit als letzte bestätigungspflichtige Relaxierung zulassen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9RelaxMaximum" type="checkbox"><span>Personengebundene Obergrenzen als letzte Relaxierung zulassen.</span></label>
        <label class="auto-plan-switch"><input id="autoPlanV9RelaxOrganizational" type="checkbox"><span>Organisatorisch lösbare Kopplungen nachgelagert relaxieren.</span></label>
      </div>
    </details>
    <div class="auto-plan-v9-derived" id="autoPlanV9Derived"></div>
  </section>`;
}

function installControls(dialog) {
  if (dialog.querySelector('#autoPlanV9ConfigTitle')) return;
  const settings = currentSettings();
  const hero = dialog.querySelector('.auto-plan-config-hero');
  if (!hero) return;
  const template = document.createElement('template');
  template.innerHTML = controlsMarkup(settings);
  hero.prepend(template.content);

  for (const [key, value] of Object.entries(settings)) {
    const ids = {
      mode: 'autoPlanV9Mode', goal: 'autoPlanV9Goal', alternatives: 'autoPlanV9Alternatives',
      targetGapPermille: 'autoPlanV9Gap', minimumAlternativeDistance: 'autoPlanV9Distance',
      maxChanges: 'autoPlanV9MaxChanges', deterministic: 'autoPlanV9Deterministic',
      exactLns: 'autoPlanV9ExactLns', lnsMinSize: 'autoPlanV9LnsMin', lnsMaxSize: 'autoPlanV9LnsMax',
      remoteSolver: 'autoPlanV9Remote', relaxAbsence: 'autoPlanV9RelaxAbsence',
      relaxHardMaximum: 'autoPlanV9RelaxMaximum', relaxOrganizational: 'autoPlanV9RelaxOrganizational', seed: 'autoPlanV9Seed'
    };
    if (ids[key]) setField(ids[key], value);
  }

  const mode = byId('autoPlanV9Mode');
  mode?.addEventListener('change', event => applyMode(event.target.value));
  dialog.querySelectorAll('.auto-plan-v9-config input, .auto-plan-v9-config select').forEach(element => {
    if (element !== mode) element.addEventListener('change', syncSettings);
  });
  byId('autoPlanStartBtn')?.addEventListener('click', syncSettings, { capture: true });

  const localDetails = document.createElement('details');
  localDetails.className = 'auto-plan-v9-local-tuning';
  localDetails.innerHTML = '<summary>Lokalen Warmstart feinabstimmen</summary><div class="auto-plan-v9-local-grid"></div>';
  const localGrid = localDetails.querySelector('div');
  const movable = [
    '#autoPlanV85CleanProfile', '#autoPlanV85Parallel', '#autoPlanRepairIterations',
    '#autoPlanLocalBudget', '#autoPlanLateAcceptance'
  ];
  for (const selector of movable) {
    const element = dialog.querySelector(selector);
    const label = element?.closest('label');
    if (label && !localGrid.contains(label)) localGrid.append(label);
  }
  const baseCard = dialog.querySelector('#autoPlanSearchIntensity')?.closest('.auto-plan-card');
  baseCard?.append(localDetails);
  dialog.querySelector('#autoPlanV85Derived')?.setAttribute('hidden', '');

  installAutoPlanV9Tooltips(dialog);
  syncSummary();
}

function syncSummary() {
  const host = byId('autoPlanV9Derived');
  if (!host) return;
  const settings = currentSettings();
  host.innerHTML = [
    `<span><b>${esc(settings.mode)}</b> Profil</span>`,
    `<span><b>${esc(settings.alternatives)}</b> Varianten</span>`,
    `<span><b>${(settings.targetGapPermille / 10).toLocaleString('de-DE')} %</b> Ziel-Gap</span>`,
    `<span><b>${settings.lnsMinSize}–${settings.lnsMaxSize}</b> Exact-LNS-Felder</span>`,
    `<span><b>${settings.remoteSolver ? 'CP-SAT' : 'lokal'}</b> Primärpfad</span>`
  ].join('');
}

function stageIndex(update = {}) {
  const stage = String(update.stage || '').toLowerCase();
  const phase = String(update.phase || '').toLowerCase();
  const aliases = {
    analysis: 'snapshot', search: 'strict-feasibility', propagate: 'presolve', repair: 'minimal-relaxation',
    polish: 'quality', perfect: 'exact-lns', certify: 'explain', audit: 'audit', complete: 'audit', blocked: 'explain'
  };
  const id = AUTO_PLAN_STAGES.some(item => item.id === stage) ? stage : aliases[phase] || stage || 'snapshot';
  const index = AUTO_PLAN_STAGES.findIndex(item => item.id === id);
  return index < 0 ? Math.max(0, highestStage) : index;
}

function installTheatre(dialog) {
  if (dialog.querySelector('#autoPlanV9Theatre')) return;
  const old = dialog.querySelector('#autoPlanV85Theatre');
  if (old) old.hidden = true;
  const anchor = old || dialog.querySelector('#autoPlanV8Lanes') || dialog.querySelector('#autoPlanPhaseList');
  if (!anchor) return;
  const section = document.createElement('section');
  section.id = 'autoPlanV9Theatre';
  section.className = 'auto-plan-v9-theatre';
  section.setAttribute('aria-label', 'Nachweisbarer Bearbeitungsstand der Auto-Plan Engine v9');
  section.innerHTML = `<header><div><span>CP-SAT Guided Adaptive Exact-LNS</span><h3>Solver- und Nachweisobservatorium</h3></div><strong id="autoPlanV9Status" data-v9-tooltip="autoPlanV9ProofStatus">bereit</strong></header>
    <ol>${AUTO_PLAN_STAGES.map((stage, index) => `<li data-index="${index}" data-stage="${stage.id}"><i></i><div><b>${esc(stage.title)}</b><small>${esc(stage.detail)}</small></div><span>offen</span></li>`).join('')}</ol>
    <div class="auto-plan-v9-proof-metrics">
      <div><span>Status</span><b id="autoPlanV9SolverStatus">—</b></div>
      <div id="autoPlanV9BestBound" data-v9-tooltip="autoPlanV9BestBound"><span>Beste Schranke</span><b>—</b></div>
      <div><span>Gap</span><b id="autoPlanV9GapLive">—</b></div>
      <div><span>Branches</span><b id="autoPlanV9Branches">—</b></div>
      <div><span>Konflikte</span><b id="autoPlanV9Conflicts">—</b></div>
    </div>`;
  anchor.after(section);
  installAutoPlanV9Tooltips(section);
}

function resetTheatre(dialog) {
  highestStage = 0;
  commentarySeen.clear();
  dialog.querySelectorAll('#autoPlanV9Theatre li').forEach((item, index) => {
    item.dataset.state = index === 0 ? 'active' : 'pending';
    item.querySelector(':scope > span').textContent = index === 0 ? 'läuft' : 'offen';
  });
  for (const id of ['autoPlanV9SolverStatus', 'autoPlanV9GapLive', 'autoPlanV9Branches', 'autoPlanV9Conflicts']) {
    if (byId(id)) byId(id).textContent = '—';
  }
  byId('autoPlanV9BestBound')?.querySelector('b')?.replaceChildren(document.createTextNode('—'));
  byId('autoPlanV9Status')?.replaceChildren(document.createTextNode('bereit'));
  proofVisualizer?.reset();
}

function formatNumber(value) {
  return Number(value).toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

function appendV9Comment(update) {
  const commentary = formatV9Commentary(update);
  if (!commentary) return;
  const key = v9CommentaryKey(update);
  if (commentarySeen.has(key)) return;
  commentarySeen.add(key);
  const stream = byId('autoPlanLog');
  if (!stream) return;
  const entry = document.createElement('p');
  entry.className = `auto-plan-log-entry is-${commentary.kind} is-v9-proof`;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('de-DE');
  const marker = document.createElement('i');
  marker.setAttribute('aria-hidden', 'true');
  const content = document.createElement('span');
  const match = /^<b>(.*?)<\/b>([\s\S]*)$/.exec(commentary.text);
  if (match) {
    const bold = document.createElement('b');
    bold.textContent = match[1];
    content.append(bold, document.createTextNode(match[2]));
  } else content.textContent = commentary.text;
  entry.append(time, marker, content);
  stream.append(entry);
  while (stream.childElementCount > 220) stream.firstElementChild?.remove();
  stream.scrollTop = stream.scrollHeight;
}

function updateTheatre(dialog, update) {
  const current = stageIndex(update);
  highestStage = Math.max(highestStage, current);
  dialog.querySelectorAll('#autoPlanV9Theatre li').forEach((item, index) => {
    const status = index < highestStage ? 'done' : index === highestStage ? 'active' : 'pending';
    item.dataset.state = status;
    item.querySelector(':scope > span').textContent = status === 'done' ? 'erledigt' : status === 'active' ? 'läuft' : 'offen';
  });
  const solverStatus = String(update.solverStatus || update.status || '').toUpperCase();
  if (solverStatus) {
    byId('autoPlanV9SolverStatus').textContent = solverStatus;
    byId('autoPlanV9Status').textContent = solverStatus;
  } else if (update.lane) byId('autoPlanV9Status').textContent = update.lane === 'remote-cpsat' ? 'CP-SAT' : 'Warmstart';
  if (Number.isFinite(Number(update.bestBound))) byId('autoPlanV9BestBound').querySelector('b').textContent = formatNumber(update.bestBound);
  if (Number.isFinite(Number(update.relativeGap))) byId('autoPlanV9GapLive').textContent = `${(Number(update.relativeGap) * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
  if (Number.isFinite(Number(update.branches))) byId('autoPlanV9Branches').textContent = formatNumber(update.branches);
  if (Number.isFinite(Number(update.conflicts))) byId('autoPlanV9Conflicts').textContent = formatNumber(update.conflicts);
  appendV9Comment(update);
  proofVisualizer?.update(update);
}

function staffLabel(staffId) {
  const person = getStaffById(state.staff, staffId);
  return person?.short || assignmentLabel(state.staff, staffId, { short: true }) || staffId || 'offen';
}

function auditMap(result) {
  return new Map((result.audit || []).map(item => [`${item.dateIso}|${item.role}`, item]));
}

function renderVariantProposal(result) {
  const body = byId('autoPlanProposalBody');
  if (!body) return;
  const audits = auditMap(result);
  body.innerHTML = Object.keys(result.plannedMonth?.days || {}).sort().map(dateIso => {
    const holiday = holidayName(dateIso);
    const weekday = weekdayLabel(dateIso);
    const cell = role => {
      const before = result.baseline.days?.[dateIso]?.[role] || '';
      const after = result.plannedMonth.days?.[dateIso]?.[role] || '';
      const audit = audits.get(`${dateIso}|${role}`);
      const proposed = !before && Boolean(after);
      const level = proposed ? audit?.level || 'green' : before ? 'fixed' : 'open';
      return `<div class="auto-plan-assignment-cell ${esc(level)} ${proposed ? 'proposed' : before ? 'fixed' : 'open'}"><div class="auto-plan-person-line"><strong>${esc(staffLabel(after))}</strong><span class="auto-plan-source-pill">${proposed ? 'Auto-Plan v9' : before ? 'Fixpunkt' : 'offen'}</span></div><div class="auto-plan-cell-state"><i></i><span>${esc(level)}</span></div>${audit?.reasons?.length ? `<details class="auto-plan-cell-reasons"><summary>${audit.reasons.length} Regelhinweise</summary><ul>${audit.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></details>` : ''}</div>`;
    };
    return `<tr id="auto-plan-row-${dateIso}" class="${weekday === 'Sa' ? 'saturday-row' : weekday === 'So' ? 'sunday-row' : ''}${holiday ? ' holiday-row' : ''}"><th scope="row" class="auto-plan-day-number"><strong>${Number(dateIso.slice(-2))}</strong></th><td class="auto-plan-weekday"><span>${esc(weekday)}</span><small>${esc(holiday || fmtGermanDate(dateIso))}</small></td><td>${cell('bd')}</td><td>${cell('hg')}</td><td><span class="auto-plan-row-status ${result.metrics.red ? 'red' : result.metrics.orange ? 'orange' : result.metrics.yellow ? 'yellow' : 'green'}">v9 · geprüft</span></td></tr>`;
  }).join('');
  if (byId('autoPlanChangeCount')) byId('autoPlanChangeCount').textContent = `${result.changes.length} neue Einträge · Variante ${Number(result.v9VariantIndex || 0) + 1}`;
  if (byId('autoPlanSearchProfile')) byId('autoPlanSearchProfile').textContent = result.searchProfile || 'Auto-Plan v9';
}

function installResultPanels(dialog) {
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

function renderProofResult(result) {
  const panel = byId('autoPlanV9ProofResult');
  if (!panel) return;
  const metrics = result?.metrics || {};
  const status = metrics.solverStatus || result.solverStatus || 'HEURISTIC';
  const stages = metrics.lexicographicStages || [];
  const core = metrics.conflictCore || [];
  const relaxations = metrics.relaxationSuggestions || [];
  panel.hidden = false;
  panel.innerHTML = `<header><div><span>v9 Nachweisprotokoll</span><h4>${esc(status === 'OPTIMAL' ? 'Globaler Nachweis abgeschlossen' : status === 'INFEASIBLE' ? 'Unlösbarkeit nachgewiesen' : status === 'FEASIBLE' ? 'Beste gefundene Lösung' : 'Lokaler, vollständig auditierter Fallback')}</h4></div><strong>${esc(status)}</strong></header>
    <div class="auto-plan-v9-result-grid"><div><span>Zielfunktionswert</span><b>${Number.isFinite(metrics.objectiveValue) ? esc(formatNumber(metrics.objectiveValue)) : '—'}</b></div><div><span>Beste Schranke</span><b>${Number.isFinite(metrics.bestBound) ? esc(formatNumber(metrics.bestBound)) : '—'}</b></div><div><span>Gap</span><b>${Number.isFinite(metrics.relativeGap) ? `${(metrics.relativeGap * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %` : '—'}</b></div><div><span>Branches</span><b>${esc(formatNumber(metrics.branches || 0))}</b></div></div>
    ${stages.length ? `<details open><summary>Lexikografische Zielstufen</summary><ol>${stages.map(stage => `<li><span>${esc(stage.title || stage.id || 'Ziel')}</span><b>${esc(stage.status || '')}</b><small>${stage.value !== undefined ? `Wert ${esc(stage.value)}` : ''}${stage.bestBound !== undefined ? ` · Schranke ${esc(stage.bestBound)}` : ''}</small></li>`).join('')}</ol></details>` : ''}
    ${core.length ? `<details id="autoPlanV9ConflictCore" open data-v9-tooltip="autoPlanV9ConflictCore"><summary>Reduzierter Konfliktkern · ${core.length} Bedingungen</summary><ul>${core.map(item => `<li><b>${esc(item.title || item.id || 'Constraint')}</b>${item.detail ? ` · ${esc(item.detail)}` : ''}</li>`).join('')}</ul></details>` : ''}
    ${relaxations.length ? `<details open><summary>Minimale Relaxierungsvorschläge</summary><ol>${relaxations.map(item => `<li>${esc(item.label || item.description || item.id || item)}</li>`).join('')}</ol></details>` : ''}`;
  installAutoPlanV9Tooltips(panel);
}

function selectVariant(index) {
  if (!lastResult || !variantSnapshots[index]) return;
  const selected = clone(variantSnapshots[index]);
  const preserved = lastResult.alternatives;
  for (const key of ['plannedMonth', 'changes', 'audit', 'redViolations', 'requiresConfirmation', 'certified', 'metrics', 'objectiveKey', 'searchProfile', 'proposalFingerprint', 'status', 'complete', 'success']) {
    lastResult[key] = selected[key];
  }
  lastResult.alternatives = preserved;
  lastResult.v9VariantIndex = index;
  renderVariantProposal(lastResult);
  renderProofResult(lastResult);
  document.querySelectorAll('#autoPlanV9Variants button[data-variant]').forEach(button => {
    const active = Number(button.dataset.variant) === index;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderVariants(result) {
  const panel = byId('autoPlanV9Variants');
  if (!panel) return;
  variantSnapshots = [clone({ ...result, alternatives: [] }), ...(result.alternatives || []).map(item => clone({ ...item, alternatives: [] }))];
  if (variantSnapshots.length <= 1) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const selectable = !result.requiresConfirmation;
  panel.innerHTML = `<header><div><span>Diverse, qualitätsgebundene Lösungen</span><h4>${variantSnapshots.length} Vorschlagsvarianten</h4></div><strong>${selectable ? 'auswählbar' : 'nur Vergleich'}</strong></header><div class="auto-plan-v9-variant-list">${variantSnapshots.map((variant, index) => `<button type="button" data-variant="${index}" aria-pressed="${index === 0}" ${selectable ? '' : 'disabled'} class="${index === 0 ? 'is-selected' : ''}"><span>${index === 0 ? 'Hauptlösung' : `Variante ${index + 1}`}</span><b>${variant.metrics?.red || 0} rot · ${variant.metrics?.orange || 0} orange · ${variant.metrics?.yellow || 0} gelb</b><small>Fairness ${variant.metrics?.fairnessIndex || 0} % · ${variant.changes?.length || 0} Zellen</small></button>`).join('')}</div>${selectable ? '<p>Die ausgewählte Variante ersetzt das Proposal-Objekt in-place; der bestehende Übernahme-Guardrail auditiert sie erneut.</p>' : '<p>Bei roten Ausnahmen bleibt aus Sicherheitsgründen ausschließlich die vollständig dargestellte Hauptlösung übernehmbar.</p>'}`;
  if (selectable) panel.querySelectorAll('button[data-variant]').forEach(button => button.addEventListener('click', () => selectVariant(Number(button.dataset.variant))));
}

function upgradeIdentity(dialog) {
  dialog.dataset.algorithmRevision = '9';
  dialog.dataset.engineRevision = '9';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, #autoPlanV75Ribbon, #autoPlanV7Ribbon');
  if (ribbon) {
    ribbon.classList.add('auto-plan-v9-ribbon');
    const title = ribbon.querySelector('b');
    const detail = ribbon.querySelector('small');
    const badge = ribbon.querySelector(':scope > strong');
    if (title) title.textContent = 'CP-SAT Guided Adaptive Exact-LNS · v9';
    if (detail) detail.textContent = 'Mathematische Machbarkeit · lexikografische Zielstufen · adaptive exakte Teilneuplanung · Varianten · Konfliktkerne · unabhängiger Audit';
    if (badge) badge.textContent = 'ENGINE v9';
  }
  const engine = dialog.querySelector('.auto-plan-engine-badge span');
  if (engine) engine.textContent = 'Constraint Engine v9';
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.v9Enhanced === 'true') return;
  dialog.dataset.v9Enhanced = 'true';
  upgradeIdentity(dialog);
  installControls(dialog);
  installTheatre(dialog);
  installResultPanels(dialog);
  proofVisualizer = new AutoPlanV9ProofVisualizer(dialog);

  new MutationObserver(() => {
    if (dialog.classList.contains('is-configuring')) resetTheatre(dialog);
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('autoplanprogress', event => updateTheatre(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    lastResult = event.detail || null;
    if (!lastResult) return;
    lastResult.v9VariantIndex = 0;
    proofVisualizer?.finish(lastResult);
    renderProofResult(lastResult);
    renderVariants(lastResult);
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
