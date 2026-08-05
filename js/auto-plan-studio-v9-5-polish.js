/**
 * Auto-Plan Studio v9.5 – final interaction and result-semantics polish.
 *
 * A native modal dialog promotes only itself and its descendants to the top
 * layer. The global appearance button is therefore moved into the open dialog
 * and restored to its original toolbar position when the dialog closes.
 *
 * Result titles are resolved after all legacy/v9/v9.5 result listeners. Safety
 * always wins over solver status: a complete plan with red, confirmable
 * exceptions must never be presented as an ordinary rule-clean proposal.
 */

import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';

const RELEASE = '20260805.3';
let themeHome = null;
let activeDialog = null;
let lastResult = null;

function byId(id) {
  return document.getElementById(id);
}

function closeButtonOf(dialog) {
  return dialog?.querySelector('#autoPlanCloseBtn, .auto-plan-close, .auto-plan-close-button, button[data-action="close"]');
}

function restoreThemeToggle(dialog = activeDialog) {
  const button = byId('themeModeBtn');
  if (!button || !themeHome?.parent?.isConnected) return;
  if (dialog && activeDialog && dialog !== activeDialog) return;
  const { parent, nextSibling } = themeHome;
  if (nextSibling?.parentNode === parent) parent.insertBefore(button, nextSibling);
  else parent.append(button);
  button.classList.remove('auto-plan-modal-theme-toggle');
  themeHome = null;
  activeDialog = null;
}

function installThemeToggle(dialog) {
  const button = byId('themeModeBtn');
  const header = dialog?.querySelector('.auto-plan-header');
  if (!button || !header || !dialog.open) return;

  if (!dialog.contains(button)) {
    themeHome = {
      parent: button.parentNode,
      nextSibling: button.nextSibling
    };
    const closeButton = closeButtonOf(dialog);
    if (closeButton?.parentNode) closeButton.parentNode.insertBefore(button, closeButton);
    else header.append(button);
  }

  button.classList.add('auto-plan-modal-theme-toggle', 'tool-action--icon-only-v95');
  setRichTooltip(button, button.getAttribute('aria-label') || 'Hell-/Dunkelmodus wechseln.');
  activeDialog = dialog;
}

function hasConfirmableRed(result) {
  const redViolations = Array.isArray(result?.redViolations) ? result.redViolations.length : 0;
  const metricRed = Number(result?.metrics?.red || 0);
  return result?.requiresConfirmation === true || redViolations > 0 || metricRed > 0;
}

function authoritativeResultTitle(result) {
  if (!result?.complete) return 'Keine vollständige technisch wählbare Belegung';
  if (hasConfirmableRed(result)) return 'Vollständige Belegung mit roten Ausnahmen';
  return result?.certified === true
    ? 'Modelloptimaler, vollständig regelgeprüfter Vorschlag'
    : 'Bester gefundener, vollständig regelgeprüfter Vorschlag';
}

function applyResultTitle(result = lastResult) {
  const title = byId('autoPlanResultTitle');
  if (!title || !result) return;
  const expected = authoritativeResultTitle(result);
  if (title.textContent !== expected) title.textContent = expected;
}

function settleResultTitle(result) {
  lastResult = result;
  // Other compatibility layers queue their own first-level microtasks. The
  // nested microtask is deliberately last without introducing a timer or race.
  queueMicrotask(() => queueMicrotask(() => applyResultTitle(result)));
}

function bindDialog(dialog) {
  if (!dialog || dialog.dataset.v95PolishBound === 'true') return;
  dialog.dataset.v95PolishBound = 'true';
  dialog.dataset.v95Polish = RELEASE;

  const syncOpenState = () => {
    if (dialog.open) installThemeToggle(dialog);
    else restoreThemeToggle(dialog);
  };

  new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'open')) syncOpenState();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });

  dialog.addEventListener('close', () => restoreThemeToggle(dialog));
  dialog.addEventListener('cancel', () => queueMicrotask(() => restoreThemeToggle(dialog)));
  syncOpenState();
}

function synchronizeThemeToggle() {
  const dialog = byId('autoPlanDialog');
  if (!dialog) return;
  bindDialog(dialog);
  if (dialog.open) installThemeToggle(dialog);
  else restoreThemeToggle(dialog);
}

function initialize() {
  const install = event => {
    const dialog = event?.detail?.dialog || byId('autoPlanDialog');
    if (dialog) bindDialog(dialog);
    queueMicrotask(synchronizeThemeToggle);
  };

  window.addEventListener('autoplanstudioready', install);
  install();

  // The native showModal() call makes every element outside the dialog inert.
  // A capture listener schedules synchronization after the trigger's own click
  // handler has opened the dialog, so the real theme button is a descendant of
  // the modal before the browser processes the next user interaction.
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('#autoPlanBtn')) return;
    queueMicrotask(synchronizeThemeToggle);
  }, { capture: true });

  // Defensive late binding also covers pages where either the toolbar button or
  // the studio template is inserted after this additive module initialized.
  new MutationObserver(() => synchronizeThemeToggle())
    .observe(document.body, { childList: true, subtree: true });

  window.addEventListener('autoplanresult', event => {
    settleResultTitle(event.detail || null);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}

export const AUTO_PLAN_STUDIO_V95_POLISH_RELEASE = RELEASE;
