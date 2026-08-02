import './color-director.js?v=20260801.11';
import './month-transition-stability.js?v=20260801.11';

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
  backup: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/><path d="M12 9v7M9.5 13.5 12 16l2.5-2.5"/></svg>'
});

export const TOOLBAR_GROUPS = Object.freeze([
  Object.freeze({
    key: 'planning',
    label: 'Planung',
    items: Object.freeze([
      Object.freeze({ id: 'todayBtn', label: 'Aktueller Monat', shortLabel: 'Aktueller Monat', icon: 'calendar', tone: 'accent' }),
      Object.freeze({ id: 'absenceManagerBtn', label: 'Abwesenheiten verwalten', shortLabel: 'Abwesenheiten', icon: 'absence' }),
      Object.freeze({ id: 'preferenceManagerBtn', label: 'Dienstwünsche und Optionen verwalten', shortLabel: 'Wünsche / Optionen', icon: 'sliders' }),
      Object.freeze({ id: 'clearMonthBtn', label: 'Sichtbaren Monat vollständig leeren', shortLabel: 'Leeren', icon: 'trash', tone: 'danger' })
    ])
  }),
  Object.freeze({
    key: 'data',
    label: 'Daten',
    items: Object.freeze([
      Object.freeze({ id: 'reloadBtn', label: 'Serverstand neu laden', shortLabel: 'Neu laden', icon: 'refresh', tone: 'quiet' }),
      Object.freeze({ id: 'excelImportInput', label: 'Excel-Datei importieren', shortLabel: 'Excel importieren', icon: 'import', hostSelector: 'label' }),
      Object.freeze({ id: 'jsonImportInput', label: 'JSON-Sicherung laden', shortLabel: 'JSON laden', icon: 'restore', hostSelector: 'label' })
    ])
  }),
  Object.freeze({
    key: 'output',
    label: 'Ausgabe',
    items: Object.freeze([
      Object.freeze({ id: 'exportExcelBtn', label: 'Monatsplan als Excel exportieren', shortLabel: 'Excel', icon: 'spreadsheet' }),
      Object.freeze({ id: 'exportPdfBtn', label: 'Monatsplan als PDF drucken', shortLabel: 'PDF', icon: 'print' }),
      Object.freeze({ id: 'exportJsonBtn', label: 'Vollständige JSON-Sicherung erstellen', shortLabel: 'JSON sichern', icon: 'backup' })
    ])
  })
]);

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
  if (!item.hostSelector) return target;
  return target.closest(item.hostSelector);
}

function decorateAction(element, item) {
  const input = element.querySelector('input[type="file"]');
  element.classList.add('tool-action');
  if (item.tone) element.classList.add(`tool-action--${item.tone}`);
  element.title = item.label;
  element.setAttribute('aria-label', item.label);

  const label = document.createElement('span');
  label.className = 'tool-label';
  label.textContent = item.shortLabel;
  element.replaceChildren(iconElement(item.icon), label);

  if (input) {
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
}

export function organizeToolbar() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar || toolbar.dataset.organized === 'true') return false;

  const resolved = TOOLBAR_GROUPS.map(group => ({
    ...group,
    items: group.items.map(item => ({ item, element: actionHost(item) }))
  }));
  if (resolved.some(group => group.items.some(entry => !entry.element))) return false;

  const fragment = document.createDocumentFragment();
  for (const group of resolved) {
    const section = document.createElement('section');
    section.className = `toolbar-section toolbar-section--${group.key}`;
    section.setAttribute('aria-label', group.label);

    const heading = document.createElement('span');
    heading.className = 'toolbar-section-label';
    heading.textContent = group.label;

    const actions = document.createElement('div');
    actions.className = 'toolbar-actions';
    for (const { item, element } of group.items) {
      decorateAction(element, item);
      actions.append(element);
    }

    section.append(heading, actions);
    fragment.append(section);
  }

  toolbar.replaceChildren(fragment);
  toolbar.classList.add('toolbar-organized');
  toolbar.dataset.organized = 'true';
  toolbar.setAttribute('aria-label', 'Werkzeugleiste');
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
