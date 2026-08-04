/**
 * DienstplanRAD v8.5 colour-scheme controller.
 *
 * The month colour remains the accent source. This module only selects the
 * luminance system around it and keeps that choice independent of server data,
 * so it can be applied before the application bootstrap completes.
 */

const STORAGE_KEY = 'dienstplanrad:color-scheme:v1';
const VALID = new Set(['light', 'dark']);
const RELEASE = '20260804.1';
const byId = id => document.getElementById(id);

let mode = readStoredMode();
let button = null;
let settingsObserver = null;

function readStoredMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (VALID.has(value)) return value;
  } catch {
    // Storage can be unavailable in hardened/private contexts.
  }
  // v9: Die Anwendung startet standardmäßig im hellen Erscheinungsbild.
  // Ein ausdrücklich gespeicherter Wunsch bleibt selbstverständlich erhalten.
  return 'light';
}

function storeMode(value) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* non-fatal */ }
}

function icon(value) {
  if (value === 'dark') {
    return '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>';
  }
  return '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
}

function label(value) {
  return value === 'dark' ? 'Dunkelmodus aktiv' : 'Hellmodus aktiv';
}

function targetLabel(value) {
  return value === 'dark'
    ? 'Zum hellen Erscheinungsbild wechseln. Monatskontrast und Statusfarben bleiben erhalten.'
    : 'Zum dunklen Erscheinungsbild wechseln. Monatskontrast und Statusfarben bleiben erhalten.';
}

function updateThemeColour(value) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = value === 'dark' ? '#090d12' : '#edf3f7';
}

function paintButton() {
  if (!button) return;
  button.dataset.mode = mode;
  button.setAttribute('aria-pressed', String(mode === 'dark'));
  button.setAttribute('aria-label', targetLabel(mode));
  button.dataset.tooltip = targetLabel(mode);
  // v9: Der Umschalter trägt ausschließlich das Sonnen- bzw. Mondpiktogramm.
  // Die Beschriftung bleibt für Vorlesewerkzeuge unsichtbar erhalten.
  button.innerHTML = `${icon(mode)}<span class="visually-hidden">${label(mode)}</span>`;
}

function syncSettingsControl() {
  const select = byId('settingsColorScheme');
  if (select && select.value !== mode) select.value = mode;
}

function applyImmediately(value, { persist = true, animate = false } = {}) {
  const next = VALID.has(value) ? value : 'light';
  const commit = () => {
    mode = next;
    document.documentElement.dataset.colorScheme = next;
    document.documentElement.style.colorScheme = next;
    updateThemeColour(next);
    if (persist) storeMode(next);
    paintButton();
    syncSettingsControl();
    window.dispatchEvent(new CustomEvent('appcolorschemechange', { detail: { mode: next } }));
  };

  // v8.5 intentionally has no reduced-motion mode. The transition is part of
  // the fixed application experience and falls back atomically where the API
  // is unavailable.
  if (animate && typeof document.startViewTransition === 'function') document.startViewTransition(commit);
  else commit();
  return next;
}

export function getAppColorScheme() {
  return mode;
}

export function setAppColorScheme(value, options = {}) {
  return applyImmediately(value, options);
}

export function toggleAppColorScheme() {
  return applyImmediately(mode === 'dark' ? 'light' : 'dark', { animate: true });
}

export function createThemeToggle() {
  if (button?.isConnected) return button;
  button = byId('themeModeBtn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'themeModeBtn';
    button.className = 'tool-action tool-action--theme tool-action--pinned';
    button.addEventListener('click', toggleAppColorScheme);
  }
  paintButton();
  return button;
}

function installSettingsControl(dialog) {
  if (!dialog || byId('settingsColorScheme')) return;
  const grid = dialog.querySelector('#settingsPanelAppearance .settings-grid');
  if (!grid) return;
  const field = document.createElement('label');
  field.className = 'settings-color-scheme-field';
  field.innerHTML = '<span>Farbschema</span><small>Direkter Hell-/Dunkelmodus. Die Monatsfarbe bleibt als semantischer Akzent erhalten.</small>'
    + '<select id="settingsColorScheme"><option value="light">Hell</option><option value="dark">Dunkel</option></select>';
  grid.prepend(field);
  const select = field.querySelector('select');
  select.value = mode;
  select.addEventListener('change', () => applyImmediately(select.value, { animate: true }));
}

function observeSettingsDialog() {
  if (settingsObserver || typeof MutationObserver !== 'function') return;
  settingsObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.id === 'settingsDialog') installSettingsControl(node);
        else installSettingsControl(node.querySelector?.('#settingsDialog'));
      }
    }
  });
  settingsObserver.observe(document.body, { childList: true, subtree: true });
  installSettingsControl(byId('settingsDialog'));
}

export function installThemeController() {
  applyImmediately(mode, { persist: false, animate: false });
  observeSettingsDialog();
  return mode;
}

if (typeof document !== 'undefined') {
  applyImmediately(mode, { persist: false, animate: false });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeSettingsDialog, { once: true });
  else observeSettingsDialog();
}

export const APP_THEME_RELEASE = RELEASE;
