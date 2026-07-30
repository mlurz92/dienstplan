import { state, saveLocalBootstrap } from './state.js?v=20260730.3';
import { toIsoDate } from './defaults.js?v=20260730.3';
import { getRbnOptions, isRbnValueAllowed, isSecondRbnAvailable } from './rbn.js?v=20260730.3';

function rememberCompatibilityName(value) {
  if (!value || state.rbnNames.includes(value)) return;
  state.rbnNames.push(value);
  state.rbnNames = [...new Set(state.rbnNames)].sort((a, b) => a.localeCompare(b, 'de'));
  saveLocalBootstrap();
}

function writeThrough(input, value) {
  const normalized = String(value ?? '').trim();
  if (input.value === normalized) return false;
  input.value = normalized;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function enhanceRbnInput(input, field, dateIso) {
  if (!input) return null;

  const existing = input.parentElement?.querySelector(`select.rbn-input[data-rbn-field="${field}"]`);
  if (existing) return existing;

  const label = field === 'rbn1' ? 'RBN' : '2. RBN';
  const currentValue = String(input.value ?? '').trim();
  const select = document.createElement('select');
  select.className = 'rbn-input';
  select.dataset.rbnField = field;
  select.setAttribute('aria-label', `${label} am ${dateIso}`);
  select.appendChild(new Option('— auswählen —', ''));

  if (currentValue && !isRbnValueAllowed(field, dateIso, currentValue)) {
    const legacyOption = new Option(`${currentValue} (Altwert)`, currentValue, true, true);
    legacyOption.disabled = true;
    select.appendChild(legacyOption);
  }

  for (const name of getRbnOptions(field, dateIso)) {
    select.appendChild(new Option(name, name, false, name === currentValue));
  }
  select.value = currentValue;

  select.addEventListener('change', () => {
    const value = select.value;
    rememberCompatibilityName(value);
    writeThrough(input, value);
  });

  input.dataset.rbnEnhanced = 'true';
  input.hidden = true;
  input.tabIndex = -1;
  input.removeAttribute('list');
  input.setAttribute('aria-hidden', 'true');
  input.parentElement?.appendChild(select);
  return select;
}

function getOrCreateInactiveNote(wrapper, dateIso) {
  let note = wrapper?.querySelector('.rbn2-inactive-note');
  if (note) return note;
  note = document.createElement('span');
  note.className = 'rbn2-inactive-note';
  note.setAttribute('aria-label', `2. RBN am ${dateIso} nicht auswählbar`);
  note.hidden = true;
  wrapper?.appendChild(note);
  return note;
}

function syncSecondRbn(row, dateIso, { clearWhenUnavailable = false } = {}) {
  const firstInput = row.cells[4]?.querySelector('input.rbn-input');
  const secondInput = row.cells[5]?.querySelector('input.rbn-input');
  const firstSelect = row.cells[4]?.querySelector('select.rbn-input[data-rbn-field="rbn1"]');
  const secondSelect = row.cells[5]?.querySelector('select.rbn-input[data-rbn-field="rbn2"]');
  if (!firstInput || !secondInput || !firstSelect || !secondSelect) return;

  const available = isSecondRbnAvailable(dateIso, firstSelect.value);
  if (!available && clearWhenUnavailable && secondInput.value.trim()) {
    secondSelect.value = '';
    writeThrough(secondInput, '');
  }

  secondSelect.hidden = !available;
  secondSelect.disabled = !available;
  secondSelect.setAttribute('aria-hidden', String(!available));
  secondSelect.parentElement?.toggleAttribute('data-rbn2-available', available);

  const note = getOrCreateInactiveNote(secondSelect.parentElement, dateIso);
  const retainedValue = secondInput.value.trim();
  note.textContent = !available && retainedValue ? `${retainedValue} (Altwert)` : '';
  note.hidden = available || !retainedValue;
}

function enhanceRbnRow(row, dateIso) {
  const firstInput = row.cells[4]?.querySelector('input.rbn-input');
  const secondInput = row.cells[5]?.querySelector('input.rbn-input');
  const firstSelect = enhanceRbnInput(firstInput, 'rbn1', dateIso);
  enhanceRbnInput(secondInput, 'rbn2', dateIso);
  if (!firstSelect) return;

  if (firstSelect.dataset.rbn2Binding !== 'true') {
    firstSelect.dataset.rbn2Binding = 'true';
    firstSelect.addEventListener('change', () => {
      syncSecondRbn(row, dateIso, { clearWhenUnavailable: true });
    });
  }
  syncSecondRbn(row, dateIso);
}

/**
 * Zerlegt die kompakte U/FZA-Anzeige in Namen und Ausführung. Der Doppelpunkt
 * gehört bewusst zur normal gewichteten Ausführung, nicht zum fetten Namen.
 */
export function parseAbsenceSummaryText(value) {
  return String(value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const separator = entry.indexOf(':');
      if (separator <= 0) return { name: '', detail: entry };
      return {
        name: entry.slice(0, separator).trim(),
        detail: entry.slice(separator + 1).trim()
      };
    });
}

function formatAbsenceSummary(row) {
  const button = row.cells[6]?.querySelector('.cell-summary-button');
  if (!button || button.dataset.nameWeightFormatted === 'true') return;

  const entries = parseAbsenceSummaryText(button.textContent);
  button.dataset.nameWeightFormatted = 'true';
  if (!entries.length) return;

  button.replaceChildren();
  entries.forEach((entry, index) => {
    if (index > 0) button.appendChild(document.createTextNode(', '));
    if (!entry.name) {
      button.appendChild(document.createTextNode(entry.detail));
      return;
    }

    const name = document.createElement('strong');
    name.className = 'absence-summary-name';
    name.textContent = entry.name;
    const detail = document.createElement('span');
    detail.className = 'absence-summary-detail';
    detail.textContent = `: ${entry.detail}`;
    button.append(name, detail);
  });
}

function enhanceRows() {
  const body = document.getElementById('planTableBody');
  if (!body) return;

  for (const row of body.rows) {
    const day = Number(row.cells[0]?.textContent);
    if (!Number.isInteger(day)) continue;
    const dateIso = toIsoDate(state.currentYear, state.currentMonth, day);
    enhanceRbnRow(row, dateIso);
    formatAbsenceSummary(row);
  }

  // Die alte gemeinsame Datalist wird nach jeder Tabellenrenderung entfernt.
  // Sie ist nicht mehr interaktiv und darf die getrennten Auswahlen nicht als
  // vermeintliche Datenquelle erscheinen lassen.
  document.getElementById('rbnSuggestions')?.remove();
}

function initTableUi() {
  const body = document.getElementById('planTableBody');
  if (!body) return;
  const observer = new MutationObserver(enhanceRows);
  observer.observe(body, { childList: true });
  enhanceRows();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initTableUi, { once: true });
  } else {
    initTableUi();
  }
}
