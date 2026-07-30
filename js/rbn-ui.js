import { state, saveLocalBootstrap } from './state.js?v=20260730.3';
import { toIsoDate } from './defaults.js?v=20260730.3';
import { getRbnOptions, isRbnValueAllowed } from './rbn.js?v=20260730.3';

function enhanceRbnInput(input, field, dateIso) {
  if (!input || input.dataset.rbnEnhanced === 'true') return;

  const label = field === 'rbn1' ? 'RBN' : '2. RBN';
  const currentValue = String(input.value ?? '').trim();
  const select = document.createElement('select');
  select.className = 'rbn-input';
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

    // Die bestehende Änderungsroutine in app.js bleibt die einzige Stelle, die
    // den Monatsdatensatz als geändert markiert. Vor dem Auslösen wird der feste
    // Wert in den historischen Kompatibilitätspool aufgenommen, damit die alte
    // Freitext-Namens-API nicht mehr im kritischen Speicherpfad abgewartet wird.
    if (value && !state.rbnNames.includes(value)) {
      state.rbnNames.push(value);
      state.rbnNames = [...new Set(state.rbnNames)].sort((a, b) => a.localeCompare(b, 'de'));
      saveLocalBootstrap();
    }

    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  input.dataset.rbnEnhanced = 'true';
  input.hidden = true;
  input.tabIndex = -1;
  input.removeAttribute('list');
  input.setAttribute('aria-hidden', 'true');
  input.parentElement?.appendChild(select);
}

function enhanceRbnRows() {
  const body = document.getElementById('planTableBody');
  if (!body) return;

  for (const row of body.rows) {
    const day = Number(row.cells[0]?.textContent);
    if (!Number.isInteger(day)) continue;
    const dateIso = toIsoDate(state.currentYear, state.currentMonth, day);
    enhanceRbnInput(row.cells[4]?.querySelector('input.rbn-input'), 'rbn1', dateIso);
    enhanceRbnInput(row.cells[5]?.querySelector('input.rbn-input'), 'rbn2', dateIso);
  }

  // Die alte gemeinsame Datalist wird nach jeder Tabellenrenderung entfernt.
  // Sie ist nicht mehr interaktiv und darf die neue, getrennte Auswahl nicht
  // als vermeintliche Datenquelle erscheinen lassen.
  document.getElementById('rbnSuggestions')?.remove();
}

function initRbnUi() {
  const body = document.getElementById('planTableBody');
  if (!body) return;
  const observer = new MutationObserver(enhanceRbnRows);
  observer.observe(body, { childList: true });
  enhanceRbnRows();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initRbnUi, { once: true });
} else {
  initRbnUi();
}
