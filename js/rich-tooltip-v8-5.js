/** Accessible explanatory tooltips for toolbar, dialogs and Auto-Plan controls. */

const TOOLTIP_ID = 'appRichTooltip';
const SELECTOR = '[data-tooltip], .toolbar [title], .topbar [title], .auto-plan-dialog [title], .settings-dialog [title]';
const registry = new WeakMap();
let host = null;
let active = null;
let showTimer = 0;
let hideTimer = 0;
let observer = null;
let delegatesBound = false;

function enabled() {
  return document.documentElement.dataset.richTooltips !== 'false';
}

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.id = TOOLTIP_ID;
  host.className = 'app-rich-tooltip';
  host.setAttribute('role', 'tooltip');
  host.hidden = true;
  document.body.append(host);
  host.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  host.addEventListener('pointerleave', scheduleHide);
  return host;
}

function textFor(element) {
  return String(element?.dataset?.tooltip || element?.getAttribute?.('title') || '').trim();
}

function remember(element) {
  if (!(element instanceof Element)) return;
  const title = element.getAttribute('title');
  if (title && !element.dataset.tooltip) element.dataset.tooltip = title;
  if (element.dataset.tooltip && !registry.has(element)) registry.set(element, title || '');
  syncNativeTitle(element);
}

function syncNativeTitle(element) {
  if (!(element instanceof Element) || !element.dataset.tooltip) return;
  if (enabled()) element.removeAttribute('title');
  else element.setAttribute('title', element.dataset.tooltip);
}

function scan(root = document) {
  if (root instanceof Element && root.matches(SELECTOR)) remember(root);
  root.querySelectorAll?.(SELECTOR).forEach(remember);
}

function describedBy(element, add) {
  const tokens = new Set(String(element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  if (add) tokens.add(TOOLTIP_ID); else tokens.delete(TOOLTIP_ID);
  if (tokens.size) element.setAttribute('aria-describedby', [...tokens].join(' '));
  else element.removeAttribute('aria-describedby');
}

function position(element) {
  if (!host || host.hidden || !element?.isConnected) return;
  const anchor = element.getBoundingClientRect();
  const tip = host.getBoundingClientRect();
  const gap = 10;
  const margin = 10;
  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - tip.width - margin, left));
  let top = anchor.bottom + gap;
  if (top + tip.height > window.innerHeight - margin) top = Math.max(margin, anchor.top - tip.height - gap);
  host.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
}

function show(element) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  const text = textFor(element);
  if (!enabled() || !text) return;
  ensureHost();
  if (active && active !== element) describedBy(active, false);
  active = element;
  host.textContent = text;
  host.hidden = false;
  describedBy(element, true);
  requestAnimationFrame(() => position(element));
}

function scheduleShow(element, immediate = false) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  showTimer = setTimeout(() => show(element), immediate ? 0 : 360);
}

function hide() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  if (active) describedBy(active, false);
  active = null;
  if (host) host.hidden = true;
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 90);
}

function triggerFrom(target) {
  return target instanceof Element ? target.closest(SELECTOR) : null;
}

function bindDelegates() {
  if (delegatesBound) return;
  delegatesBound = true;
  document.addEventListener('pointerover', event => {
    const trigger = triggerFrom(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) scheduleShow(trigger, false);
  });
  document.addEventListener('pointerout', event => {
    const trigger = triggerFrom(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) scheduleHide();
  });
  document.addEventListener('focusin', event => {
    const trigger = triggerFrom(event.target);
    if (trigger) scheduleShow(trigger, true);
  });
  document.addEventListener('focusout', event => {
    const trigger = triggerFrom(event.target);
    if (trigger) scheduleHide();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('appsettingschange', () => {
    scan();
    if (!enabled()) hide();
  });
}

export function setRichTooltip(element, text) {
  if (!(element instanceof Element)) return element;
  element.dataset.tooltip = String(text || '').trim();
  remember(element);
  return element;
}

export function installRichTooltips() {
  ensureHost();
  scan();
  bindDelegates();
  if (typeof MutationObserver === 'function' && !observer) {
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') remember(record.target);
        for (const node of record.addedNodes) if (node instanceof Element) scan(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'data-tooltip'] });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installRichTooltips, { once: true });
  else installRichTooltips();
}
