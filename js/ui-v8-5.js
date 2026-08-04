/** DienstplanRAD v8.5 – Command Bar, Theme, Tooltips und Chrome-Shell. */
import { createThemeToggle, installThemeController } from './app-theme-v8-5.js?v=20260803.4';
import { installRichTooltips, setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';
import { state } from './state.js?v=20260803.4';

const RELEASE = '20260803.4';
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
  autoPlanBtn: ['Auto-Plan', 'Auto-Plan Studio v9 öffnen, CP-SAT-/Exact-LNS-Suche parametrieren und den vollständigen Monatsvorschlag prüfen.']
});

function reportEnhancementFailure(step, error) {
  const detail = {
    source: 'ui-v8-5',
    step,
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || ''
  };
  console.error('[DienstplanRAD] UI-Erweiterung fehlgeschlagen', detail);
  window.dispatchEvent(new CustomEvent('dienstplanstartuperror', { detail }));
}

function safeStep(step, action) {
  try { return action(); }
  catch (error) {
    reportEnhancementFailure(step, error);
    return false;
  }
}

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

/**
 * Wertet die sichtbaren Aktionen idempotent auf.
 *
 * Die Funktion wird auch aus einem MutationObserver aufgerufen. Ein
 * bedingungsloses Schreiben von `textContent` erzeugt selbst eine neue
 * `childList`-Mutation und führte deshalb zu einer endlosen Microtask-Kette,
 * obwohl die Oberfläche optisch bereits fertig gerendert war.
 */
function upgradeActions(root = document) {
  for (const [id, [shortLabel, tooltip]] of Object.entries(ACTION_COPY)) {
    const element = actionHost(id);
    if (!element || !root.contains(element)) continue;
    const label = element.querySelector('.tool-label');
    if (label && label.textContent !== shortLabel) label.textContent = shortLabel;
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

/**
 * Setzt den Theme-Schalter unmittelbar vor das Zahnrad.
 *
 * Startabsturzursache: In der nicht oder noch nicht reorganisierten Toolbar
 * liegt `settingsBtn` innerhalb einer `.toolbar-group`. Ein Einfügeversuch an
 * der äußeren Toolbar mit diesem verschachtelten Referenzknoten wirft synchron
 * `NotFoundError`. Je nach Modul-/DOMContentLoaded-Reihenfolge blieb die
 * Anwendung danach bei „Lädt …“ stehen. Der tatsächliche Elternknoten ist
 * deshalb die Einfügefläche; als letzter Fallback wird sicher angehängt.
 */
function installThemeButton() {
  const toolbar = document.querySelector('.toolbar.toolbar-organized, .toolbar');
  const settings = document.getElementById('settingsBtn');
  if (!toolbar || !settings || !toolbar.contains(settings)) return false;
  const toggle = createThemeToggle();
  const host = settings.parentElement && toolbar.contains(settings.parentElement)
    ? settings.parentElement
    : toolbar;
  if (toggle.parentElement === host && toggle.nextElementSibling === settings) return true;
  if (settings.parentElement === host) host.insertBefore(toggle, settings);
  else host.append(toggle);
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  return true;
}

function markToolbarReady() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return false;
  // Bestehender Hook bleibt stabil; v9 wird separat ausgewiesen.
  toolbar.dataset.commandBarRevision = '8.5';
  toolbar.dataset.solverRevision = '9';
  toolbar.setAttribute('aria-label', 'DienstplanRAD Befehlsleiste');
  upgradeActions(toolbar);
  installThemeButton();
  return true;
}

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

/**
 * Beobachtet ausschließlich tatsächlich neu hinzugefügte Steuerelemente.
 * Toolbar-Nacharbeit wird auf einen Frame zusammengefasst. Dadurch kann eine
 * vom Upgrade selbst ausgelöste Mutation weder rekursiv noch unbegrenzt die
 * gesamte Toolbar erneut schreiben.
 */
function observeLateControls() {
  if (typeof MutationObserver !== 'function' || !document.body) return;
  let toolbarRefreshHandle = 0;
  const scheduleToolbarRefresh = () => {
    if (toolbarRefreshHandle) return;
    toolbarRefreshHandle = requestAnimationFrame(() => {
      toolbarRefreshHandle = 0;
      safeStep('mark-late-toolbar', markToolbarReady);
    });
  };
  const observer = new MutationObserver(records => {
    let toolbarTouched = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        safeStep('upgrade-late-actions', () => upgradeActions(node));
        safeStep('remove-late-motion', () => removeLegacyMotionMode(node));
        if (node.matches('.toolbar, .toolbar *') || node.querySelector?.('.toolbar')) toolbarTouched = true;
      }
    }
    if (toolbarTouched) scheduleToolbarRefresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function installUiV85() {
  safeStep('stylesheets', addStylesheets);
  safeStep('theme-controller', installThemeController);
  safeStep('rich-tooltips', installRichTooltips);
  safeStep('legacy-motion', removeLegacyMotionMode);
  safeStep('month-navigation', upgradeMonthNavigation);
  safeStep('toolbar', markToolbarReady);
  safeStep('late-controls', observeLateControls);
  safeStep('scroll-policy', installScrollPerformancePolicy);
  window.addEventListener('appsettingschange', () => safeStep('settings-motion', removeLegacyMotionMode));
  requestAnimationFrame(() => {
    safeStep('raf-motion', removeLegacyMotionMode);
    safeStep('raf-navigation', upgradeMonthNavigation);
    safeStep('raf-toolbar', markToolbarReady);
  });
  document.documentElement.dataset.uiShellReady = 'true';
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUiV85, { once: true });
  else installUiV85();
}