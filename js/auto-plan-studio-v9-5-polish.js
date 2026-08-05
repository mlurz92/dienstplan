/**
 * Auto-Plan Studio v9.5 – final interaction polish.
 *
 * - Keeps the global pictographic theme switch usable while the native modal
 *   dialog is open by moving the original button into the dialog header and
 *   restoring it afterwards. The existing event handlers and accessibility
 *   state remain attached to the same DOM node.
 * - Restores the explicit safety title for complete proposals containing red,
 *   confirmation-required exceptions. The proof panel independently states
 *   whether the result is model-optimal or merely the best found solution.
 */

import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';

const RELEASE = '20260805.2';
let themeHome = null;
let activeDialog = null;

function byId(id) {
  return document.getElementById(id);
}

function closeButtonOf(dialog) {
  return dialog.querySelector([
    '#autoPlanCloseBtn',
    '.auto-plan-close',
    '.auto-plan-close-button',
    'button[data-action="close"]',
    'button[aria-label*="schließ" i]',
    '.auto-plan-header button:last-of-type'
  ].join(','));
}

function restoreThemeToggle() {
  const button = byId('themeModeBtn');
  if (!button || !themeHome?.parent?.isConnected) return;
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
  if (!button || !header) return;
  if (!dialog.contains(button)) {
    themeHome ||= { parent: button.parentNode, nextSibling: button.nextSibling };
    const closeButton = closeButtonOf(dialog);
    if (closeButton?.parentNode) closeButton.parentNode.insertBefore(button, closeButton);
    else header.append(button);
  }
  button.classList.add('auto-plan-modal-theme-toggle', 'tool-action--icon-only-v95');
  setRichTooltip(button, button.getAttribute('aria-label') || 'Hell-/Dunkelmodus wechseln.');
  activeDialog = dialog;

  if (dialog.dataset.v95ThemeRestoreBound !== 'true') {
    dialog.dataset.v95ThemeRestoreBound = 'true';
    dialog.addEventListener('close', restoreThemeToggle);
    dialog.addEventListener('cancel', () => queueMicrotask(restoreThemeToggle));
  }
}

function setResultTitle(result) {
  const title = byId('autoPlanResultTitle');
  if (!title || !result) return;
  const redCount = Number(result.metrics?.red || result.redViolations?.length || 0);
  if (result.requiresConfirmation === true || redCount > 0) {
    title.textContent = 'Vollständige Belegung mit roten Ausnahmen';
    return;
  }
  title.textContent = result.certified === true
    ? 'Modelloptimaler, vollständig regelgeprüfter Vorschlag'
    : 'Bester gefundener, vollständig regelgeprüfter Vorschlag';
}

function enhance(dialog) {
  if (!dialog) return;
  installThemeToggle(dialog);
  dialog.dataset.v95Polish = RELEASE;
}

function initialize() {
  const ready = event => {
    const dialog = event?.detail?.dialog || byId('autoPlanDialog');
    if (dialog) queueMicrotask(() => enhance(dialog));
  };
  window.addEventListener('autoplanstudioready', ready);
  const existing = byId('autoPlanDialog');
  if (existing?.open) enhance(existing);

  window.addEventListener('autoplanresult', event => {
    queueMicrotask(() => setResultTitle(event.detail || null));
  });

  // Defensive recovery when a legacy close path removes the open attribute
  // without dispatching the native close event.
  const observer = new MutationObserver(() => {
    if (activeDialog && !activeDialog.open) restoreThemeToggle();
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}

export const AUTO_PLAN_STUDIO_V95_POLISH_RELEASE = RELEASE;
