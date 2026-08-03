import './month-view-transition.js?v=20260803.2';
import './color-director.js?v=20260803.2';
import './month-transition-stability.js?v=20260803.2';

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

/**
 * Dichtestufen der Werkzeugleiste.
 *
 * Die Leiste passt ihre Dichte an den tatsächlich vorhandenen Platz an, nicht an
 * feste Viewport-Schwellen. Feste Schwellen waren der Grund für das frühere
 * Fehlbild: Zwischen 1120 px und 1400 px behielten die drei Gruppen ihre volle
 * Breite, überlagerten einander und schnitten Beschriftungen ab.
 *
 * Gemessen wird die Leiste selbst. Von der reichsten Stufe abwärts wird die
 * erste genommen, die vollständig hineinpasst:
 *
 * 1. `full`      – Gruppenüberschriften und alle Beschriftungen;
 * 2. `groups`    – ohne Gruppenüberschriften;
 * 3. `secondary` – nur die Planungsaktionen bleiben beschriftet;
 * 4. `icons`     – reine Symbolschaltflächen;
 * 5. `overflow`  – Planung bleibt sichtbar, alles Weitere zieht in ein Menü.
 */
export const TOOLBAR_DENSITY_STEPS = Object.freeze(['full', 'groups', 'secondary', 'icons', 'overflow']);

const OVERFLOW_SECTIONS = Object.freeze(['data', 'output']);

function overflowButtonMarkup() {
  return '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>'
    + '<span class="tool-label">Mehr</span>';
}

/**
 * Baut die Überlaufgruppe. Die Schaltflächen werden dabei verschoben, nicht neu
 * erzeugt: IDs, Ereignisbindungen und die versteckten Datei-Eingaben bleiben
 * dadurch unverändert bestehen.
 */
function createOverflow(toolbar) {
  const host = document.createElement('div');
  host.className = 'toolbar-overflow';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'toolbarOverflowBtn';
  trigger.className = 'tool-action tool-action--overflow';
  trigger.title = 'Weitere Aktionen';
  trigger.setAttribute('aria-label', 'Weitere Aktionen');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'toolbarOverflowPanel');
  trigger.innerHTML = overflowButtonMarkup();

  const panel = document.createElement('div');
  panel.id = 'toolbarOverflowPanel';
  panel.className = 'toolbar-overflow-panel';
  panel.hidden = true;

  /**
   * Das Menü liegt fest positioniert über der Seite.
   *
   * Die Leiste selbst klippt ihren Inhalt, damit eine noch nicht bestimmte
   * Dichtestufe nie überstehen kann. Ein fest positioniertes Menü ist davon
   * nicht betroffen und legt sich zugleich sauber über die Monatskarte.
   */
  const place = () => {
    const anchor = trigger.getBoundingClientRect();
    panel.style.top = `${Math.round(anchor.bottom + 7)}px`;
    panel.style.left = 'auto';
    panel.style.right = `${Math.round(window.innerWidth - anchor.right)}px`;
  };

  const close = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
  };
  const open = () => {
    panel.hidden = false;
    place();
    trigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
  };

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    if (panel.hidden) open(); else close();
  });
  panel.addEventListener('click', event => {
    // Eine ausgelöste Aktion schließt das Menü; das Dateifeld selbst nicht,
    // sonst verschwände der Auslöser noch vor dem Öffnen des Dateidialogs.
    if (event.target instanceof HTMLInputElement) return;
    close();
  });
  document.addEventListener('click', event => {
    if (!host.contains(event.target) && !panel.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    close();
    trigger.focus();
  });

  // Das Menü hängt bewusst am <body>: Die Leiste selbst klippt ihren Inhalt und
  // ist wegen ihrer Einblend-Animation zugleich Bezugsrahmen für fest
  // positionierte Nachfahren. Nur außerhalb dieses Rahmens kann das Menü
  // zuverlässig über der Monatskarte liegen.
  host.append(trigger);
  toolbar.append(host);
  document.body.append(panel);
  return { host, trigger, panel, close };
}

function installToolbarDensity(toolbar, sections) {
  if (typeof window === 'undefined') return;
  const overflow = createOverflow(toolbar);
  // Reihenfolge der auslagerbaren Gruppen. Beim Zurückholen werden sie in genau
  // dieser Reihenfolge vor die Überlauf-Schaltfläche gesetzt. Ein gemerkter
  // Nachbarknoten taugt dafür nicht: Beim Auslagern beider Gruppen wäre der
  // Nachbar der ersten selbst schon im Menü und nicht mehr Kind der Leiste.
  const movable = OVERFLOW_SECTIONS.map(key => sections.get(key)).filter(Boolean);

  const setDensity = density => {
    toolbar.dataset.toolbarDensity = density;
    if (density === 'overflow') {
      for (const section of movable) overflow.panel.append(section);
    } else {
      for (const section of movable) {
        if (section.parentNode !== toolbar) toolbar.insertBefore(section, overflow.host);
      }
      overflow.close();
    }
  };

  /**
   * Breitenbedarf der aktuellen Stufe.
   *
   * Gemessen wird die Summe der Kinder samt Abständen, nicht `scrollWidth`:
   * Die Gruppen schrumpfen nicht, deshalb ist diese Summe der tatsächliche
   * Bedarf – und sie bleibt auch dann eindeutig, wenn `justify-content` die
   * Elemente über die volle Breite verteilt.
   */
  const measurements = () => {
    const style = getComputedStyle(toolbar);
    const gap = parseFloat(style.columnGap) || 0;
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const visible = [...toolbar.children].filter(child => child.offsetParent !== null || child.offsetWidth > 0);
    const required = visible.length
      ? visible.reduce((total, child) => total + child.offsetWidth, 0) + gap * (visible.length - 1)
      : 0;
    // `clientWidth` schließt die Innenabstände ein, die Summe der Kinder nicht.
    return { required, available: toolbar.clientWidth - padding };
  };

  const fits = () => {
    const { required, available } = measurements();
    return required <= available + 1;
  };

  let scheduled = false;
  let measuredWidth = -1;

  // Bezugsgröße ist die Fensterbreite. Der Container kann bei einem waagerechten
  // Bildlauf breiter bleiben als das Fenster; eine Sperre auf seiner Breite
  // ließe die Leiste dann in einer zu weiten Stufe stehen bleiben.
  const availableWidth = () => window.innerWidth;

  const measure = () => {
    scheduled = false;
    const width = availableWidth();
    if (!width) return;
    measuredWidth = width;
    for (const density of TOOLBAR_DENSITY_STEPS) {
      setDensity(density);
      if (fits()) return;
    }
  };

  /**
   * Nur eine geänderte Containerbreite löst eine neue Messung aus.
   *
   * Die Messung ändert die Höhe und Breite der Leiste selbst. Ohne diese Sperre
   * meldete der Beobachter diese eigenen Änderungen zurück, der Browser verwarf
   * die Benachrichtigungen der Rückkopplung – und die Leiste blieb anschließend
   * auf ihrer zuletzt gesetzten Stufe stehen.
   */
  const schedule = ({ force = false } = {}) => {
    if (scheduled) return;
    if (!force && availableWidth() === measuredWidth) return;
    scheduled = true;
    requestAnimationFrame(measure);
  };

  setDensity('full');
  schedule({ force: true });
  // Beobachtet wird bewusst der umgebende Container, nicht die Leiste selbst:
  // Die Messung verändert die Breite der Leiste und würde den Beobachter sonst
  // in eine Rückkopplung treiben, deren Benachrichtigungen der Browser
  // anschließend verwirft.
  const host = toolbar.parentElement;
  if (typeof ResizeObserver === 'function' && host) new ResizeObserver(() => schedule()).observe(host);
  window.addEventListener('resize', () => schedule());
  // Schriftlieferung ändert die Textbreiten und damit die passende Stufe.
  document.fonts?.ready?.then?.(() => schedule({ force: true }));
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
  const sections = new Map();
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
    sections.set(group.key, section);
    fragment.append(section);
  }

  toolbar.replaceChildren(fragment);
  toolbar.classList.add('toolbar-organized');
  toolbar.dataset.organized = 'true';
  toolbar.setAttribute('aria-label', 'Werkzeugleiste');
  installToolbarDensity(toolbar, sections);
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
