/** DienstplanRAD v8.5 – Command Bar, Theme, Tooltips und Chrome-Shell. */
import { createThemeToggle, installThemeController } from './app-theme-v8-5.js?v=20260804.1';
import { installRichTooltips, setRichTooltip } from './rich-tooltip-v8-5.js?v=20260804.1';
import { state } from './state.js?v=20260803.4';

const RELEASE = '20260804.1';
const STYLESHEETS = Object.freeze(['/app-v8-5.css', '/toolbar-v8-5.css']);
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
  excelImportInput: ['Excel laden', 'Einen Jahresplaner oder Monatsplan aus einer Excel-Datei importieren.'],
  jsonImportInput: ['Sicherung laden', 'Eine vollständige DienstplanRAD-JSON-Sicherung wiederherstellen.'],
  exportExcelBtn: ['Excel', 'Den sichtbaren Monatsplan als Excel-Arbeitsmappe exportieren.'],
  exportPdfBtn: ['PDF', 'Die druckoptimierte Monatsansicht öffnen und als PDF ausgeben.'],
  exportJsonBtn: ['Sichern', 'Eine vollständige, wieder einlesbare JSON-Sicherung aller Plandaten erstellen.'],
  settingsBtn: ['Einstellungen', 'Darstellung, Arbeitsweise und Auto-Plan-Voreinstellungen öffnen.'],
  autoPlanBtn: ['Auto-Plan', 'Auto-Plan Studio v8.5 öffnen, Null-Rot-Suche parametrieren und den vollständigen Monatsvorschlag prüfen.']
});

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
    if (label) label.textContent = shortLabel;
    element.setAttribute('aria-label', tooltip);
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
  toolbar.dataset.commandBarRevision = '8.5';
  toolbar.setAttribute('aria-label', 'DienstplanRAD Befehlsleiste');
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
    select.value = 'system';
    const field = select.closest('label');
    if (field) {
      field.hidden = true;
      field.setAttribute('aria-hidden', 'true');
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

function observeLateControls() {
  if (typeof MutationObserver !== 'function') return;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        upgradeActions(node);
        removeLegacyMotionMode(node);
      }
    }
    markToolbarReady();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function installUiV85() {
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
