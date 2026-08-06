/** DienstplanRAD v8.5 – Command Bar, Theme, Tooltips und Chrome-Shell. */
import { createThemeToggle, installThemeController } from './app-theme-v8-5.js?v=20260806.1';
import { installRichTooltips, setRichTooltip } from './rich-tooltip-v8-5.js?v=20260806.1';
import { state } from './state.js?v=20260806.1';

const RELEASE = '20260806.1';
const STYLESHEETS = Object.freeze(['/app-v8-5.css', '/toolbar-v8-5.css', '/app-v9.css']);
const NAV_ICONS = Object.freeze({
  prevMonthBtn: '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  nextMonthBtn: '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
});
const ACTION_COPY = Object.freeze({
  todayBtn: ['Heute', 'Zum aktuellen Kalendermonat wechseln.'],
  absenceManagerBtn: ['Abwesenheiten', 'Urlaub, FZA und weitere Abwesenheiten für mehrere Tage verwalten.'],
  preferenceManagerBtn: ['Wünsche', 'Dienstwünsche, Sperren und mögliche Dienste gesammelt pflegen.'],
  clearMonthBtn: ['Leeren', 'Alle Dienstzuweisungen des sichtbaren Monats nach Bestätigung entfernen.'],
  reloadBtn: ['Neu laden', 'Den aktuellen Monat erneut vom Server laden; lokale Änderungen bleiben geschützt.'],
  dataImportInput: ['Importieren', 'Jahresmappe, Monatsplan oder Neuroradiologie-Hintergrunddienstplan einlesen — als Excel-Mappe oder als PDF-Ausdruck. Eine JSON-Sicherung stellt denselben Weg den Gesamtstand wieder her.'],
  exportExcelBtn: ['Excel', 'Den sichtbaren Monatsplan als Excel-Arbeitsmappe exportieren.'],
  exportPdfBtn: ['PDF', 'Die druckoptimierte Monatsansicht öffnen und als PDF ausgeben.'],
  exportJsonBtn: ['Sichern', 'Eine vollständige, wieder einlesbare JSON-Sicherung aller Plandaten erstellen.'],
  settingsBtn: ['Einstellungen', 'Darstellung, Arbeitsweise und Auto-Plan-Voreinstellungen öffnen.'],
  autoPlanBtn: ['Auto-Plan', 'Auto-Plan Studio v9 öffnen, die hybride exakte Suche (CP-SAT) parametrieren und den vollständigen Monatsvorschlag prüfen.']
});

let lateControlsObserver = null;
let scrollPolicyInstalled = false;
let uiInstalled = false;

function addStylesheets() {
  for (const href of STYLESHEETS) {
    if (document.querySelector(`link[data-v85-shell-style="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${href}?v=${RELEASE}`;
    link.dataset.v85ShellStyle = href;
    document.head.append(link);
  }
}

function actionHost(id) {
  const element = document.getElementById(id);
  return element?.matches('input[type="file"]') ? element.closest('label') : element;
}

function upgradeActions(root = document) {
  for (const [id, [shortLabel, tooltip]] of Object.entries(ACTION_COPY)) {
    const element = actionHost(id);
    if (!element || !root.contains(element)) continue;
    const label = element.querySelector('.tool-label');
    // `textContent` ersetzt immer alle Kindknoten. Die Wertprüfung ist deshalb
    // funktional notwendig: Ohne sie erzeugt der Body-MutationObserver seine
    // eigene nächste Benachrichtigung und hält den Bootstrap in einer
    // endlosen Microtask-Schleife fest.
    if (label && label.textContent !== shortLabel) label.textContent = shortLabel;
    // Der zugängliche Name bleibt kurz und stabil. Die ausführliche Erklärung
    // gehört in den Tooltip und wird über aria-describedby verknüpft.
    if (!element.hasAttribute('aria-label')) element.setAttribute('aria-label', shortLabel);
    setRichTooltip(element, tooltip);
  }
}

function upgradeMonthNavigation() {
  for (const [id, markup] of Object.entries(NAV_ICONS)) {
    const button = document.getElementById(id);
    if (!button || button.dataset.v85Icon === 'true') continue;
    const tooltip = id === 'prevMonthBtn' ? 'Vorherigen Monat öffnen.' : 'Nächsten Monat öffnen.';
    button.innerHTML = markup;
    button.dataset.v85Icon = 'true';
    button.setAttribute('aria-label', tooltip);
    setRichTooltip(button, tooltip);
  }
}

function installThemeButton() {
  const toolbar = document.querySelector('.toolbar.toolbar-organized, .toolbar');
  const settings = document.getElementById('settingsBtn');
  if (!toolbar || !settings) return false;
  const toggle = createThemeToggle();
  if (toggle.parentElement !== toolbar || toggle.nextElementSibling !== settings) {
    toolbar.insertBefore(toggle, settings);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  return true;
}

function markToolbarReady() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return false;
  if (toolbar.dataset.commandBarRevision !== '8.5') toolbar.dataset.commandBarRevision = '8.5';
  if (toolbar.getAttribute('aria-label') !== 'DienstplanRAD Befehlsleiste') {
    toolbar.setAttribute('aria-label', 'DienstplanRAD Befehlsleiste');
  }
  upgradeActions(toolbar);
  installThemeButton();
  return true;
}

/**
 * Entfernt den früheren anwendungsspezifischen Modus vollständig aus dem
 * wirksamen Zustand. Das alte Schema wird beim Einlesen weiterhin toleriert,
 * damit vorhandene Profile migrationsfest bleiben; gespeichert und angewendet
 * wird der Wert ab v8.5 nicht mehr.
 */
function removeLegacyMotionMode(root = document) {
  const select = root.querySelector?.('#settingsMotion') || document.getElementById('settingsMotion');
  if (select) {
    if (select.value !== 'system') select.value = 'system';
    const field = select.closest('label');
    if (field) {
      if (!field.hidden) field.hidden = true;
      if (field.getAttribute('aria-hidden') !== 'true') field.setAttribute('aria-hidden', 'true');
    }
  }
  if (state.settings?.appearance && Object.hasOwn(state.settings.appearance, 'motion')) {
    delete state.settings.appearance.motion;
  }
  const html = document.documentElement;
  html.classList.remove('reduce-motion');
  delete html.dataset.motion;
}

function installScrollPerformancePolicy() {
  if (scrollPolicyInstalled) return;
  scrollPolicyInstalled = true;
  let timer = 0;
  let scheduled = false;
  const update = () => {
    scheduled = false;
    document.documentElement.classList.add('is-scrolling');
    clearTimeout(timer);
    timer = setTimeout(() => document.documentElement.classList.remove('is-scrolling'), 140);
  };
  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }, { passive: true, capture: true });
}

function mayAffectToolbar(node) {
  if (!(node instanceof Element)) return false;
  const selector = '.toolbar, #autoPlanBtn, #settingsBtn, #themeModeBtn';
  return node.matches(selector) || Boolean(node.querySelector(selector));
}

function observeLateControls() {
  if (typeof MutationObserver !== 'function' || lateControlsObserver) return;
  lateControlsObserver = new MutationObserver(records => {
    let toolbarChanged = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        upgradeActions(node);
        removeLegacyMotionMode(node);
        toolbarChanged ||= mayAffectToolbar(node);
      }
    }
    // Nur tatsächlich relevante Einbauten dürfen die globale Command Bar
    // erneut synchronisieren. Unabhängige Dialog-/Tabellenmutationen bleiben
    // vollständig quieszent.
    if (toolbarChanged) markToolbarReady();
  });
  lateControlsObserver.observe(document.body, { childList: true, subtree: true });
}

export function installUiV85() {
  if (uiInstalled) return;
  uiInstalled = true;
  addStylesheets();
  installThemeController();
  installRichTooltips();
  removeLegacyMotionMode();
  upgradeMonthNavigation();
  markToolbarReady();
  observeLateControls();
  installScrollPerformancePolicy();
  window.addEventListener('appsettingschange', () => removeLegacyMotionMode());
  requestAnimationFrame(() => {
    removeLegacyMotionMode();
    upgradeMonthNavigation();
    markToolbarReady();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUiV85, { once: true });
  else installUiV85();
}
