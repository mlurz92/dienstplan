/**
 * Auto-Plan Studio v8.5 – clean-search controls and truthful phase theatre.
 */
import './auto-plan-studio-v8.js?v=20260803.4';
import { AUTO_PLAN_STAGES } from './auto-planner-v8-5.js?v=20260803.4';
import { state } from './state.js?v=20260803.4';
import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';

const RELEASE = '20260803.4';
const STORAGE_KEY = 'dienstplanrad:autoplan-v85-studio';

const CLEAN_PROFILES = Object.freeze({
  balanced: Object.freeze({ label: 'Ausgewogen', repairIterations: 4, localBudget: 4000, lateAcceptance: 300 }),
  intensive: Object.freeze({ label: 'Intensiv · empfohlen', repairIterations: 6, localBudget: 6500, lateAcceptance: 500 }),
  exhaustive: Object.freeze({ label: 'Exhaustiv', repairIterations: 8, localBudget: 10000, lateAcceptance: 900 })
});

let lastResult = null;
let highestStage = 0;

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v85-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v8-5.css?v=${RELEASE}`;
  link.dataset.autoPlanV85Style = 'true';
  document.head.append(link);
}

function readStudioSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStudioSettings(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* optional */ }
}

function value(id) {
  return document.getElementById(id)?.value;
}

function setValue(id, next) {
  const field = document.getElementById(id);
  if (!field) return;
  field.value = String(next);
  field.dataset.userSet = '1';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function activeProfileFromBaseFields() {
  const repair = Number(value('autoPlanRepairIterations')) || 0;
  const local = Number(value('autoPlanLocalBudget')) || 0;
  if (repair >= 8 || local >= 8500) return 'exhaustive';
  if (repair >= 6 || local >= 5200) return 'intensive';
  return 'balanced';
}

function applyCleanProfile(profileId, { persist = true } = {}) {
  const profile = CLEAN_PROFILES[profileId] || CLEAN_PROFILES.intensive;
  setValue('autoPlanRepairIterations', profile.repairIterations);
  setValue('autoPlanLocalBudget', profile.localBudget);
  setValue('autoPlanLateAcceptance', profile.lateAcceptance);
  const select = document.getElementById('autoPlanV85CleanProfile');
  if (select) select.value = profileId;
  if (persist) storeControls();
  syncDerivedSummary();
}

function derivedValues() {
  const repair = Number(value('autoPlanRepairIterations')) || 0;
  const local = Number(value('autoPlanLocalBudget')) || 0;
  return {
    waves: Math.max(1, Math.min(4, Math.ceil(Math.max(2, repair) / 2))),
    strength: Math.max(100, Math.min(250, Math.round(100 + (local - 200) / 11800 * 150)))
  };
}

function syncDerivedSummary() {
  const host = document.getElementById('autoPlanV85Derived');
  if (!host) return;
  const { waves, strength } = derivedValues();
  host.innerHTML = `<span><b>${waves}</b> strikte Wellen</span><span><b>${strength}%</b> Rescue-Breite</span><span><b>Pflicht</b> Perfektion + Nachweis</span>`;
}

function storeControls() {
  writeStudioSettings({
    cleanProfile: value('autoPlanV85CleanProfile') || activeProfileFromBaseFields(),
    parallelSearches: value('autoPlanV85Parallel') || '',
    portfolioDiversity: Boolean(document.getElementById('autoPlanV85Diversity')?.checked)
  });
}

function syncRuntimeSettings() {
  const autoPlan = state.settings?.autoPlan;
  if (!autoPlan) return;
  const parallel = value('autoPlanV85Parallel');
  autoPlan.parallelSearches = parallel === '' ? null : Math.max(1, Math.min(8, Number(parallel) || 1));
  autoPlan.portfolioDiversity = document.getElementById('autoPlanV85Diversity')?.checked !== false;
  const perfection = document.getElementById('autoPlanPerfection');
  if (perfection) perfection.checked = true;
  storeControls();
}

function controlsMarkup() {
  const options = Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('');
  return `<label class="auto-plan-field auto-plan-field--v85">
    <span>Null-Rot-Suchprofil</span>
    <select id="autoPlanV85CleanProfile">
      <option value="balanced">Ausgewogen</option>
      <option value="intensive">Intensiv · empfohlen</option>
      <option value="exhaustive">Exhaustiv</option>
    </select>
    <small>Steuert Reparaturrunden, lokale Neuplanung und die v8.5-Eskalationsbreite gemeinsam.</small>
  </label>
  <label class="auto-plan-field auto-plan-field--v85">
    <span>Parallele Perfektionsstränge</span>
    <select id="autoPlanV85Parallel"><option value="">Automatisch</option>${options}</select>
    <small>Begrenzt die diversifizierten ALNS-Läufe; das UI-Kernbudget bleibt geschützt.</small>
  </label>`;
}

function installControls(dialog) {
  if (dialog.querySelector('#autoPlanV85CleanProfile')) return;
  const grid = dialog.querySelector('.auto-plan-field-grid');
  if (!grid) return;
  const holder = document.createElement('template');
  holder.innerHTML = controlsMarkup();
  grid.prepend(holder.content);

  const switchRow = dialog.querySelector('.auto-plan-switch-row');
  if (switchRow && !dialog.querySelector('#autoPlanV85Diversity')) {
    const diversity = document.createElement('label');
    diversity.className = 'auto-plan-switch auto-plan-switch--v85';
    diversity.innerHTML = '<input id="autoPlanV85Diversity" type="checkbox" checked><span>Portfolio-Diversität: Stränge variieren Suchfenster, Abstiegsfrequenz und Startbahn.</span>';
    switchRow.append(diversity);
  }

  const perfection = dialog.querySelector('#autoPlanPerfection');
  if (perfection) {
    perfection.checked = true;
    perfection.tabIndex = -1;
    perfection.closest('label')?.classList.add('auto-plan-switch--mandatory');
    const text = perfection.closest('label')?.querySelector('span');
    if (text) text.textContent = 'Perfektionsphase und vollständiger Optimalitätsnachweis sind in v8.5 verbindlich.';
  }

  const derived = document.createElement('div');
  derived.id = 'autoPlanV85Derived';
  derived.className = 'auto-plan-v85-derived';
  grid.after(derived);

  const saved = readStudioSettings();
  const profileId = CLEAN_PROFILES[saved.cleanProfile] ? saved.cleanProfile : activeProfileFromBaseFields();
  document.getElementById('autoPlanV85CleanProfile').value = profileId;
  document.getElementById('autoPlanV85Parallel').value = saved.parallelSearches ?? state.settings?.autoPlan?.parallelSearches ?? '';
  document.getElementById('autoPlanV85Diversity').checked = saved.portfolioDiversity ?? state.settings?.autoPlan?.portfolioDiversity !== false;

  document.getElementById('autoPlanV85CleanProfile').addEventListener('change', event => applyCleanProfile(event.target.value));
  document.getElementById('autoPlanV85Parallel').addEventListener('change', () => { syncRuntimeSettings(); syncDerivedSummary(); });
  document.getElementById('autoPlanV85Diversity').addEventListener('change', syncRuntimeSettings);
  for (const id of ['autoPlanRepairIterations', 'autoPlanLocalBudget', 'autoPlanLateAcceptance']) {
    document.getElementById(id)?.addEventListener('input', () => {
      const select = document.getElementById('autoPlanV85CleanProfile');
      if (select) select.value = activeProfileFromBaseFields();
      syncDerivedSummary();
    });
  }

  setRichTooltip(document.getElementById('autoPlanV85CleanProfile'), 'Ein gekoppeltes Suchprofil verhindert widersprüchliche Tiefenparameter. Exhaustiv nutzt vier strikte Eskalationswellen und das größte lokale Neuplanungsbudget.');
  setRichTooltip(document.getElementById('autoPlanV85Parallel'), 'Mehr Stränge erhöhen die Chance auf eine bessere Endlösung, werden jedoch durch Prozessor, Gerätespeicher, Monatsgröße und UI-Reserve begrenzt.');
  setRichTooltip(document.getElementById('autoPlanV85Diversity'), 'Aktiviert unterschiedliche, reproduzierbare Suchbahnen statt mehrfach identischer Arbeit.');
  syncDerivedSummary();
}

function stageIndex(update) {
  const stage = String(update?.stage || update?.subphase || '').toLowerCase();
  const phase = String(update?.phase || '').toLowerCase();
  if (stage.includes('null-rot') || stage.includes('rescue') || update?.strictWave) return 2;
  if (phase === 'analysis') return 0;
  if (phase === 'search' || phase === 'propagate') return 1;
  if (phase === 'repair' || phase === 'polish' || phase === 'audit') return 3;
  if (phase === 'perfect') return 4;
  if (phase === 'certify') return 5;
  if (phase === 'complete' || phase === 'blocked') return AUTO_PLAN_STAGES.length;
  return Math.min(highestStage, AUTO_PLAN_STAGES.length - 1);
}

function installPhaseTheatre(dialog) {
  if (dialog.querySelector('#autoPlanV85Theatre')) return;
  const anchor = dialog.querySelector('#autoPlanV8Lanes') || dialog.querySelector('#autoPlanPhaseList');
  if (!anchor) return;
  const theatre = document.createElement('section');
  theatre.id = 'autoPlanV85Theatre';
  theatre.className = 'auto-plan-v85-theatre';
  theatre.setAttribute('aria-label', 'Aktueller Bearbeitungsstand der Auto-Plan Engine v8.5');
  theatre.innerHTML = `<div class="auto-plan-v85-constellation" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <ol>${AUTO_PLAN_STAGES.map((stage, index) => `<li data-index="${index}" data-stage="${stage.id}"><i></i><div><b>${stage.title}</b><small>${stage.detail}</small></div><span>offen</span></li>`).join('')}</ol>
    <div class="auto-plan-v85-wave" id="autoPlanV85Wave" hidden><span>Null-Rot-Welle</span><b></b><i><em></em></i></div>`;
  anchor.after(theatre);
}

function updatePhaseTheatre(dialog, update) {
  const theatre = dialog.querySelector('#autoPlanV85Theatre');
  if (!theatre) return;
  const current = stageIndex(update);
  highestStage = Math.max(highestStage, current);
  theatre.dataset.phase = String(update?.phase || 'analysis');
  theatre.querySelectorAll('li').forEach((item, index) => {
    const stateName = index < highestStage ? 'done' : index === Math.min(highestStage, AUTO_PLAN_STAGES.length - 1) ? 'active' : 'pending';
    item.dataset.state = stateName;
    item.querySelector('span').textContent = stateName === 'done' ? 'erledigt' : stateName === 'active' ? 'läuft' : 'offen';
  });

  const wave = theatre.querySelector('#autoPlanV85Wave');
  if (update?.strictWave) {
    const count = Math.max(1, Number(update.strictWaveCount) || 1);
    const index = Math.max(1, Number(update.strictWave) || 1);
    wave.hidden = false;
    wave.querySelector('b').textContent = `${index}/${count} · Beam ${update.beamWidth || '—'} · exakt ${Number(update.exactBudget || 0).toLocaleString('de-DE')}`;
    wave.querySelector('em').style.inlineSize = `${Math.min(100, index / count * 100)}%`;
  } else if (highestStage > 2) {
    wave.hidden = true;
  }

  if (Number(update?.improvements) > 0 || update?.neighbourhood) {
    theatre.classList.remove('quality-pulse');
    void theatre.offsetWidth;
    theatre.classList.add('quality-pulse');
  }
}

function resetTheatre(dialog) {
  highestStage = 0;
  const theatre = dialog.querySelector('#autoPlanV85Theatre');
  if (!theatre) return;
  theatre.classList.remove('quality-pulse');
  theatre.querySelector('#autoPlanV85Wave').hidden = true;
  theatre.querySelectorAll('li').forEach((item, index) => {
    item.dataset.state = index === 0 ? 'active' : 'pending';
    item.querySelector('span').textContent = index === 0 ? 'läuft' : 'offen';
  });
}

function renderEscalationResult(dialog) {
  const panel = dialog.querySelector('#autoPlanV85Result');
  if (!panel) return;
  const data = lastResult?.metrics?.strictEscalation;
  if (!data) {
    panel.hidden = true;
    return;
  }
  const waves = Array.isArray(data.waves) ? data.waves : [];
  const nodes = waves.reduce((sum, wave) => sum + Number(wave.exploredNodes || 0), 0);
  panel.hidden = false;
  panel.innerHTML = `<header><div><span>v8.5 Null-Rot-Protokoll</span><h4>${data.cleanFound ? 'Konfliktfreie Belegung erreicht' : 'Strikte Suche vollständig ausgeschöpft'}</h4></div><strong>${data.completed || 0}/${data.attempted || 0} Wellen</strong></header>
    <div class="auto-plan-v85-result-grid"><div><span>Rescue-Breite</span><b>${data.strength || 0}%</b></div><div><span>Zusätzliche Knoten</span><b>${nodes.toLocaleString('de-DE')}</b></div><div><span>Reparaturprofil</span><b>${data.repairAggressiveness || '—'}</b></div></div>
    ${waves.length ? `<ol>${waves.map(wave => `<li><span>Welle ${wave.index}</span><b>${wave.complete ? `${wave.red} rot · ${wave.unfilled} offen` : `${wave.unfilled} offen`}</b><small>Beam ${wave.beamWidth} · Branch ${wave.branchLimit} · exakt ${Number(wave.exactBudget).toLocaleString('de-DE')}</small></li>`).join('')}</ol>` : '<p>Die reguläre Portfolio-Suche lieferte bereits eine vollständige Null-Rot-Lösung; keine Zusatzwelle erforderlich.</p>'}`;
}

function installResultPanel(dialog) {
  if (dialog.querySelector('#autoPlanV85Result')) return;
  const anchor = dialog.querySelector('#autoPlanV8Learning')?.closest('.auto-plan-panel') || dialog.querySelector('#autoPlanSearchMetrics')?.closest('.auto-plan-panel');
  if (!anchor) return;
  const panel = document.createElement('section');
  panel.id = 'autoPlanV85Result';
  panel.className = 'auto-plan-card auto-plan-panel auto-plan-v85-result';
  panel.hidden = true;
  anchor.after(panel);
}

function upgradeIdentity(dialog) {
  dialog.dataset.algorithmRevision = '8.5';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, #autoPlanV75Ribbon, #autoPlanV7Ribbon');
  if (ribbon) {
    ribbon.id = 'autoPlanV85Ribbon';
    ribbon.classList.add('auto-plan-v85-ribbon');
    const title = ribbon.querySelector('b');
    const detail = ribbon.querySelector('small');
    const badge = ribbon.querySelector(':scope > strong');
    if (title) title.textContent = 'Exhaustive Clean-Solution Observatory';
    if (detail) detail.textContent = 'Vollständiges Portfolio · mehrstufige Null-Rot-Intensivierung · adaptive Reparatur · verpflichtende Perfektion und Zertifizierung';
    if (badge) badge.textContent = 'ENGINE v8.5';
  }
  const engine = dialog.querySelector('.auto-plan-engine-badge span');
  if (engine) engine.textContent = 'Constraint Engine v8.5';
  const guardrail = dialog.querySelector('.auto-plan-zero-red-guardrail header > span');
  if (guardrail) guardrail.textContent = 'Null-Rot-Guardrail · Algorithmus v8.5';
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.v85Enhanced === 'true') return;
  dialog.dataset.v85Enhanced = 'true';
  upgradeIdentity(dialog);
  installControls(dialog);
  installPhaseTheatre(dialog);
  installResultPanel(dialog);

  document.getElementById('autoPlanStartBtn')?.addEventListener('click', syncRuntimeSettings, { capture: true });
  new MutationObserver(() => {
    if (dialog.classList.contains('is-configuring')) {
      resetTheatre(dialog);
      const saved = readStudioSettings();
      if (saved.cleanProfile) applyCleanProfile(saved.cleanProfile, { persist: false });
      syncRuntimeSettings();
    }
    if (dialog.classList.contains('show-result')) renderEscalationResult(dialog);
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('autoplanprogress', event => updatePhaseTheatre(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    lastResult = event.detail || null;
    renderEscalationResult(dialog);
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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}
