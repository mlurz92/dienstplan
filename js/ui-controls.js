import './month-view-transition.js?v=20260803.6';
import './color-director.js?v=20260803.6';
import './month-transition-stability.js?v=20260803.6';

const ICONS = Object.freeze({
  calendar: '<svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="m9 15 2 2 4-5"/></svg>',
  absence: '<svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 15h8"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h6M14 7h6M4 17h10M18 17h2M10 4v6M14 14v6"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 10A7 7 0 0 0 6.2 6.2L4 9M5.5 14A7 7 0 0 0 17.8 17.8L20 15"/></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M12 10v7M9 14l3 3 3-3"/></svg>',
  restore: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3 1.2 0 2.3-.1 3.2-.4"/><path d="M18 20v-6M15.5 16.5 18 14l2.5 2.5"/></svg>',
  spreadsheet: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M8.5 11h7M8.5 15h7M12 11v7"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7ZM17 11h.01"/></svg>',
  backup: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/><path d="M12 9v7M9.5 13.5 12 16l2.5-2.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  autoplan: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5Z"/><path d="M8 8h8M8 12h3M8 16h5M16 14l1 2 2-4"/></svg>'
});

const ACTIONS = Object.freeze({
  todayBtn: Object.freeze({ id: 'todayBtn', label: 'Aktuellen Monat anzeigen', shortLabel: 'Aktueller Monat', icon: 'calendar', tone: 'accent' }),
  absenceManagerBtn: Object.freeze({ id: 'absenceManagerBtn', label: 'Abwesenheiten verwalten', shortLabel: 'Abwesenheiten', icon: 'absence' }),
  preferenceManagerBtn: Object.freeze({ id: 'preferenceManagerBtn', label: 'Dienstwünsche und Optionen verwalten', shortLabel: 'Wünsche', icon: 'sliders' }),
  clearMonthBtn: Object.freeze({ id: 'clearMonthBtn', label: 'Sichtbaren Monat vollständig leeren', shortLabel: 'Monat leeren', icon: 'trash', tone: 'danger' }),
  autoPlanBtn: Object.freeze({ id: 'autoPlanBtn', label: 'Auto-Plan Studio öffnen', shortLabel: 'Auto-Plan Studio', icon: 'autoplan', tone: 'accent', deferred: true }),
  reloadBtn: Object.freeze({ id: 'reloadBtn', label: 'Serverstand neu laden', shortLabel: 'Neu laden', icon: 'refresh', tone: 'quiet' }),
  excelImportInput: Object.freeze({ id: 'excelImportInput', label: 'Excel-Datei importieren', shortLabel: 'Excel öffnen', icon: 'import', hostSelector: 'label' }),
  jsonImportInput: Object.freeze({ id: 'jsonImportInput', label: 'JSON-Sicherung laden', shortLabel: 'Sicherung öffnen', icon: 'restore', hostSelector: 'label' }),
  exportExcelBtn: Object.freeze({ id: 'exportExcelBtn', label: 'Monatsplan als Excel exportieren', shortLabel: 'Excel-Arbeitsmappe', icon: 'spreadsheet' }),
  exportPdfBtn: Object.freeze({ id: 'exportPdfBtn', label: 'Monatsplan als PDF drucken', shortLabel: 'PDF / Drucken', icon: 'print' }),
  exportJsonBtn: Object.freeze({ id: 'exportJsonBtn', label: 'Vollständige JSON-Sicherung erstellen', shortLabel: 'Sicherung', icon: 'backup' }),
  settingsBtn: Object.freeze({ id: 'settingsBtn', label: 'Anwendungseinstellungen öffnen', shortLabel: 'Einstellungen', icon: 'settings', tone: 'quiet' })
});

const group = (key, label, items) => Object.freeze({ key, label, items: Object.freeze(items) });
const tab = (key, label, groups) => Object.freeze({ key, label, groups: Object.freeze(groups) });

/**
 * Microsoft-365-artige Informationsarchitektur. Die fachlichen Aktionen
 * behalten ihre IDs; nur ihre sichtbare Einordnung in Ribbon-Tabs ändert sich.
 */
export const OFFICE_RIBBON_TABS = Object.freeze([
  tab('file', 'Datei', [
    group('open', 'Öffnen', ['excelImportInput', 'jsonImportInput']),
    group('output', 'Exportieren', ['exportExcelBtn', 'exportPdfBtn', 'exportJsonBtn'])
  ]),
  tab('home', 'Start', [
    group('home', 'Plan bearbeiten', ['todayBtn', 'absenceManagerBtn', 'preferenceManagerBtn'])
  ]),
  tab('planning', 'Planung', [
    group('planning', 'Monat', ['clearMonthBtn'])
  ]),
  tab('auto-plan', 'Auto-Plan', [
    group('auto-plan', 'Optimieren', ['autoPlanBtn'])
  ]),
  tab('data', 'Daten', [
    group('data', 'Aktualisieren', ['reloadBtn'])
  ]),
  tab('view', 'Ansicht', [
    group('application', 'Darstellung', ['settingsBtn'])
  ])
]);

export const TOOLBAR_GROUPS = Object.freeze(OFFICE_RIBBON_TABS.flatMap(ribbonTab => ribbonTab.groups.map(ribbonGroup => Object.freeze({
  key: ribbonGroup.key,
  label: ribbonGroup.label,
  tab: ribbonTab.key,
  items: Object.freeze(ribbonGroup.items.map(id => ACTIONS[id]))
}))));

const ACTION_TAB = new Map(OFFICE_RIBBON_TABS.flatMap(ribbonTab =>
  ribbonTab.groups.flatMap(ribbonGroup => ribbonGroup.items.map(id => [id, ribbonTab.key]))
));

export function ribbonTabForAction(actionId) {
  return ACTION_TAB.get(String(actionId || '')) || 'home';
}

export function visiblePaletteName(value) {
  const raw = String(value ?? '').trim().replace(/^Monatskontrast\s*·\s*/i, '');
  if (!raw) return '';
  return raw.split(/\s+·\s+/)[0].trim();
}

export function visiblePaletteTooltip(value) {
  return String(value ?? '')
    .split(/\s+·\s+/)
    .map(part => part.trim())
    .filter(part => part && !/^Edition\s+/i.test(part))
    .join(' · ');
}

function iconElement(name) {
  const template = document.createElement('template');
  template.innerHTML = ICONS[name] || ICONS.sliders;
  const svg = template.content.firstElementChild;
  svg.classList.add('tool-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

function actionHost(item) {
  const target = document.getElementById(item.id);
  if (!target) return null;
  return item.hostSelector ? target.closest(item.hostSelector) : target;
}

function decorateAction(element, item) {
  const input = element.querySelector('input[type="file"]');
  element.classList.add('tool-action');
  element.dataset.ribbonAction = item.id;
  if (item.tone) element.classList.add(`tool-action--${item.tone}`);
  element.title = item.label;
  element.setAttribute('aria-label', item.label);

  const label = document.createElement('span');
  label.className = 'tool-label';
  label.textContent = item.shortLabel;
  element.replaceChildren(iconElement(item.icon), label);

  if (!input) return;
  element.append(input);
  element.classList.add('tool-action--file');
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  input.setAttribute('aria-label', item.label);
  element.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    input.click();
  });
}

function setRibbonTab(key, { focus = false } = {}) {
  const workspace = document.querySelector('.office-workspace');
  const toolbar = document.querySelector('.office-ribbon');
  const tabs = [...document.querySelectorAll('.office-ribbon-tabs [role="tab"]')];
  const requested = tabs.find(item => item.dataset.ribbonTab === key) || tabs.find(item => item.dataset.ribbonTab === 'home');
  if (!requested || !toolbar) return false;

  workspace?.setAttribute('data-active-ribbon-tab', requested.dataset.ribbonTab);
  for (const item of tabs) {
    const active = item === requested;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  }
  for (const panel of toolbar.querySelectorAll('[role="tabpanel"]')) {
    panel.hidden = panel.dataset.ribbonPanel !== requested.dataset.ribbonTab;
  }
  if (focus) requested.focus();
  return true;
}

function installRibbonNavigation() {
  const tabs = [...document.querySelectorAll('.office-ribbon-tabs [role="tab"]')];
  if (!tabs.length) return;

  for (const item of tabs) {
    item.addEventListener('click', () => setRibbonTab(item.dataset.ribbonTab));
    item.addEventListener('keydown', event => {
      const current = tabs.indexOf(item);
      let target = -1;
      if (event.key === 'ArrowRight') target = (current + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target < 0) return;
      event.preventDefault();
      setRibbonTab(tabs[target].dataset.ribbonTab, { focus: true });
    });
  }
  setRibbonTab('home');
}

function setRibbonCollapsed(collapsed) {
  const workspace = document.querySelector('.office-workspace');
  const toggle = document.getElementById('officeRibbonToggle');
  if (!workspace) return false;

  workspace.dataset.ribbonCollapsed = String(collapsed);
  toggle?.setAttribute('aria-expanded', String(!collapsed));
  toggle?.setAttribute('aria-label', collapsed ? 'Ribbon einblenden' : 'Ribbon ausblenden');
  toggle?.setAttribute('title', collapsed ? 'Ribbon einblenden (Strg+F1)' : 'Ribbon ausblenden (Strg+F1)');
  return true;
}

function installRibbonCollapse() {
  const workspace = document.querySelector('.office-workspace');
  const toggle = document.getElementById('officeRibbonToggle');
  if (!workspace) return;

  const toggleCollapsed = () => setRibbonCollapsed(workspace.dataset.ribbonCollapsed !== 'true');
  toggle?.addEventListener('click', toggleCollapsed);
  document.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.key !== 'F1') return;
    event.preventDefault();
    toggleCollapsed();
  });
  setRibbonCollapsed(false);
}

function installWorkbookNavigation() {
  const tabs = [...document.querySelectorAll('.office-sheet-tab')];
  for (const item of tabs) {
    item.addEventListener('click', () => {
      for (const candidate of tabs) {
        if (candidate === item) candidate.setAttribute('aria-current', 'true');
        else candidate.removeAttribute('aria-current');
      }
      const actionId = item.dataset.sheetAction;
      if (actionId) {
        setRibbonTab(ribbonTabForAction(actionId));
        document.getElementById(actionId)?.click();
        return;
      }
      document.querySelector(item.dataset.sheetTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function installFormulaBar() {
  const name = document.querySelector('.office-formula-name');
  const value = document.querySelector('.office-formula-value');
  const monthTitle = document.getElementById('monthTitle');
  if (!name || !value) return;

  const showMonth = () => {
    name.textContent = 'MONAT';
    value.textContent = `Bereitschaftsdienstplan · ${monthTitle?.textContent?.trim() || 'Monat'}`;
  };
  showMonth();
  if (monthTitle && typeof MutationObserver === 'function') {
    new MutationObserver(showMonth).observe(monthTitle, { childList: true, characterData: true, subtree: true });
  }

  document.getElementById('planTable')?.addEventListener('focusin', event => {
    const cell = event.target.closest('td');
    const row = cell?.parentElement;
    if (!cell || !row) return;
    name.textContent = `${String.fromCharCode(65 + cell.cellIndex)}${row.sectionRowIndex + 2}`;
    const heading = document.querySelector(`#planTable thead th:nth-child(${cell.cellIndex + 1})`)?.textContent?.trim();
    const cellValue = cell.textContent?.replace(/\s+/g, ' ').trim() || 'Leer';
    value.textContent = `${heading || 'Zelle'} · ${cellValue}`;
  });
}

function installCommandSearch() {
  const search = document.getElementById('officeCommandSearch');
  if (!search) return;
  const activate = () => {
    const query = search.value.trim().toLocaleLowerCase('de-DE');
    if (!query) return;
    const action = Object.values(ACTIONS).find(item =>
      item.label.toLocaleLowerCase('de-DE').includes(query)
      || item.shortLabel.toLocaleLowerCase('de-DE').includes(query)
    );
    if (!action) return;
    setRibbonCollapsed(false);
    setRibbonTab(ribbonTabForAction(action.id));
    requestAnimationFrame(() => {
      actionHost(action)?.focus();
      search.value = '';
    });
  };
  search.addEventListener('change', activate);
  search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    activate();
  });
  document.addEventListener('keydown', event => {
    if (!event.altKey || event.key.toLocaleLowerCase('de-DE') !== 'q') return;
    event.preventDefault();
    search.focus();
  });
}

export function organizeToolbar() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar || toolbar.dataset.organized === 'true') return false;

  for (const item of Object.values(ACTIONS)) {
    if (!item.deferred && !actionHost(item)) return false;
  }

  const fragment = document.createDocumentFragment();
  for (const ribbonTab of OFFICE_RIBBON_TABS) {
    const panel = document.createElement('div');
    panel.id = `officeRibbonPanel-${ribbonTab.key}`;
    panel.className = 'office-ribbon-panel';
    panel.dataset.ribbonPanel = ribbonTab.key;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `officeRibbonTab-${ribbonTab.key}`);
    panel.hidden = ribbonTab.key !== 'home';

    for (const ribbonGroup of ribbonTab.groups) {
      const section = document.createElement('section');
      section.className = `toolbar-section toolbar-section--${ribbonGroup.key}`;
      section.setAttribute('aria-label', ribbonGroup.label);

      const actions = document.createElement('div');
      actions.className = 'toolbar-actions';
      for (const id of ribbonGroup.items) {
        const item = ACTIONS[id];
        const element = actionHost(item);
        if (!element) continue;
        decorateAction(element, item);
        actions.append(element);
      }

      const heading = document.createElement('span');
      heading.className = 'toolbar-section-label';
      heading.textContent = ribbonGroup.label;
      section.append(actions, heading);
      panel.append(section);
    }
    fragment.append(panel);
  }

  toolbar.replaceChildren(fragment);
  toolbar.classList.add('toolbar-organized', 'office-ribbon');
  toolbar.id = 'officeRibbonCommands';
  toolbar.dataset.organized = 'true';
  toolbar.setAttribute('aria-label', 'Menübandbefehle');
  installRibbonNavigation();
  return true;
}

export function simplifyPaletteBadge() {
  const label = document.getElementById('monthPaletteLabel');
  if (!label) return false;
  const visibleName = visiblePaletteName(label.textContent);
  const desired = visibleName ? `Monatskontrast · ${visibleName}` : 'Monatskontrast';
  if (label.textContent !== desired) label.textContent = desired;
  const tooltip = visiblePaletteTooltip(label.title);
  if (tooltip && label.title !== tooltip) label.title = tooltip;
  return true;
}

function initializeUiControls() {
  organizeToolbar();
  installRibbonCollapse();
  installWorkbookNavigation();
  installFormulaBar();
  installCommandSearch();
  simplifyPaletteBadge();

  const label = document.getElementById('monthPaletteLabel');
  if (label && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => simplifyPaletteBadge());
    observer.observe(label, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeUiControls, { once: true });
  else initializeUiControls();
}
