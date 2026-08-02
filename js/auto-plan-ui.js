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
  bindConfigUI,
  configTemplate,
  persistConfig,
  renderConfigUI,
  validateConfigUI
} from './auto-plan-config-ui.js?v=20260801.11';
import {
  resetRunUI,
  runTemplate,
  stopRunUI,
  updateRunUI
} from './auto-plan-run-ui.js?v=20260801.11';
import {
  allRedConfirmed,
  bindResultUI,
  getConfirmation,
  renderResultUI,
  resultTemplate,
  syncRedConfirmation
} from './auto-plan-result-ui.js?v=20260801.11';

const RELEASE = '20260801.11';
const ICON = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M12 2 14.2 7.8 20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2Z"/>'
  + '<path d="m18 16 .9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9L18 16Z"/>'
  + '</svg>';

let installed = false;
let trigger = null;
let dialog = null;
let controller = null;
let proposal = null;
let activeMonth = null;
let activeConfig = null;
let currentView = 'config';

const byId = id => document.getElementById(id);

function installStylesheets() {
  for (const href of [
    '/auto-plan.css',
    '/auto-plan-review.css',
    '/auto-plan-v2.css',
    '/auto-plan-config.css'
  ]) {
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
  button.title = 'Auto-Plan Studio öffnen, Parameter festlegen und offene BD/HG planen';
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
          <div class="auto-plan-kicker">Constraint Intelligence · Konfigurierbarer Monatslauf</div>
          <h2 id="autoPlanTitle" tabindex="-1">Auto-Plan Studio</h2>
          <p id="autoPlanSubtitle">Parameter festlegen, global optimieren, vollständig prüfen</p>
        </div>
        <button type="button" class="auto-plan-close" id="autoPlanCloseBtn" aria-label="Auto-Plan schließen">✕</button>
      </header>
      ${configTemplate()}
      ${runTemplate()}
      ${resultTemplate()}
      <footer class="auto-plan-footer">
        <button type="button" class="secondary" id="autoPlanCancelBtn">Abbrechen</button>
        <button type="button" class="auto-plan-start" id="autoPlanStartBtn">Algorithmus starten</button>
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

function setView(view) {
  currentView = view;
  byId('autoPlanConfig').hidden = view !== 'config';
  byId('autoPlanStage').hidden = view !== 'running';
  byId('autoPlanResult').hidden = view !== 'result';
  byId('autoPlanStartBtn').hidden = view !== 'config';
  byId('autoPlanApplyBtn').hidden = view !== 'result'
    || !proposal?.complete
    || !proposal?.changes?.length;
  byId('autoPlanCancelBtn').textContent = view === 'config'
    ? 'Abbrechen'
    : view === 'running'
      ? 'Lauf abbrechen'
      : 'Parameter ändern';
  dialog.classList.toggle('show-config', view === 'config');
  dialog.classList.toggle('show-result', view === 'result');
}

function currentMonthData() {
  return activeMonth || getMonthData(state.currentYear, state.currentMonth);
}

function openStudio() {
  controller?.abort();
  controller = null;
  stopRunUI();
  proposal = null;
  activeConfig = null;
  activeMonth = getMonthData(state.currentYear, state.currentMonth);
  renderConfigUI(state, activeMonth);
  byId('autoPlanSubtitle').textContent = `${getMonthLabel(activeMonth.year, activeMonth.month)} · zuerst verbindliche Parameter festlegen`;
  setView('config');
  dialog.showModal();
  requestAnimationFrame(() => byId('autoPlanTitle')?.focus({ preventScroll: true }));
}

function returnToConfig() {
  controller?.abort();
  controller = null;
  stopRunUI();
  proposal = null;
  setView('config');
  renderConfigUI(state, currentMonthData(), activeConfig);
  requestAnimationFrame(() => byId('autoPlanConfigTitle')?.focus({ preventScroll: true }));
}

function closeStudio() {
  controller?.abort();
  controller = null;
  stopRunUI();
  dialog?.close('cancel');
}

function handleCancel() {
  if (currentView === 'config') closeStudio();
  else returnToConfig();
}

async function startPlanner(config) {
  const validation = validateConfigUI(state, currentMonthData());
  if (!validation.valid) return;
  activeConfig = config || validation.config;
  persistConfig(activeMonth, activeConfig);
  proposal = null;
  setView('running');
  resetRunUI(activeMonth);
  document.body.classList.add('auto-plan-running');
  trigger.disabled = true;
  byId('autoPlanStartBtn').disabled = true;
  controller?.abort();
  controller = new AbortController();

  try {
    const result = await buildAutoPlan({
      state,
      monthData: activeMonth,
      year: activeMonth.year,
      month: activeMonth.month,
      runConfig: activeConfig,
      signal: controller.signal,
      onProgress: async update => {
        updateRunUI(update);
        if (update.phase === 'complete' || update.phase === 'blocked') {
          await new Promise(resolve => setTimeout(resolve, 620));
        }
      }
    });
    proposal = result;
    renderResultUI(state, result);
    setView('result');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    proposal = {
      success: false,
      complete: false,
      requiresConfirmation: false,
      status: 'blocked',
      searchProfile: 'Fehler',
      year: activeMonth.year,
      month: activeMonth.month,
      changes: [],
      redViolations: [],
      baseline: activeMonth,
      plannedMonth: activeMonth,
      audit: [],
      elapsedMs: 0,
      runConfig: activeConfig,
      metrics: {
        proposed: 0,
        unfilled: Object.values(activeMonth.days || {}).reduce((sum, day) =>
          sum + Number(!day?.bd) + Number(!day?.hg), 0),
        red: 0,
        specialRed: 0,
        gray: 0,
        orange: 0,
        yellow: 0,
        wishesFulfilled: 0,
        wishesPossible: 0,
        fairnessIndex: 0,
        exploredNodes: 0,
        generatedNodes: 0,
        candidateEvaluations: 0,
        limitRejects: 0,
        deadEnds: 0,
        exactNodes: 0,
        improvements: 0,
        attempts: []
      }
    };
    renderResultUI(state, proposal);
    byId('autoPlanResultText').textContent = error?.message || 'Auto-Plan fehlgeschlagen.';
    setView('result');
  } finally {
    document.body.classList.remove('auto-plan-running');
    trigger.disabled = false;
    byId('autoPlanStartBtn').disabled = false;
  }
}

async function applyProposal() {
  if (!proposal?.success || !proposal.complete || !proposal.changes.length) return;
  const confirmation = getConfirmation();
  if (proposal.requiresConfirmation && !confirmation?.accepted) {
    syncRedConfirmation();
    return;
  }
  if (proposal.requiresConfirmation
    && proposal.redViolations.some(violation => violation.confirmationType === 'special')
    && !confirmation?.comment) {
    byId('autoPlanOverrideComment').reportValidity();
    syncRedConfirmation();
    return;
  }

  const button = byId('autoPlanApplyBtn');
  button.disabled = true;
  button.textContent = 'Übernahme wird erneut geprüft und gesichert …';
  try {
    const current = getMonthData(proposal.year, proposal.month);
    const merged = applyAutoPlanProposal({
      state,
      currentMonth: current,
      proposal,
      confirmation
    });
    setMonthData(proposal.year, proposal.month, merged, 'local');
    markMonthDirty(proposal.year, proposal.month);
    const saved = await persistMonth(proposal.year, proposal.month);
    button.textContent = saved.ok
      ? 'Übernommen und gespeichert'
      : 'Lokal übernommen · Server ausstehend';
    const note = byId('autoPlanConfirmNote');
    note.classList.remove('failed', 'warning');
    note.classList.add('accepted');
    note.textContent = saved.ok
      ? 'Auto-Plan, Laufparameter und bestätigte Ausnahmen wurden vollständig übernommen und gespeichert.'
      : 'Auto-Plan wurde lokal übernommen; Serversynchronisierung steht aus.';
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

function bind() {
  trigger.addEventListener('click', openStudio);
  byId('autoPlanCloseBtn').addEventListener('click', closeStudio);
  byId('autoPlanCancelBtn').addEventListener('click', handleCancel);
  byId('autoPlanApplyBtn').addEventListener('click', applyProposal);
  bindConfigUI({
    state,
    getMonthData: currentMonthData,
    onStart: startPlanner
  });
  bindResultUI();
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeStudio();
  });
  dialog.addEventListener('close', () => {
    controller?.abort();
    controller = null;
    stopRunUI();
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
