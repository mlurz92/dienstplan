import {
  createDefaultAutoPlanConfig,
  normalizeAutoPlanConfig,
  validateAutoPlanConfig
} from './auto-planner.js?v=20260801.11';
import { countRoleInMonth, getPlanningStaff } from './rules.js?v=20260801.11';

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const numericOrNull = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

export function configTemplate() {
  return `<section class="auto-plan-config" id="autoPlanConfig" aria-labelledby="autoPlanConfigTitle">
    <div class="auto-plan-config-hero">
      <div>
        <span class="auto-plan-kicker">Schritt 1 · Verbindliche Laufparameter</span>
        <h3 id="autoPlanConfigTitle" tabindex="-1">Planungsgrenzen vor dem Start festlegen</h3>
        <p>Obergrenzen sind harte Bedingungen. Sie werden weder von der Null-Rot-Suche noch von einem bestätigbaren Minimal-Rot-Fallback überschritten.</p>
      </div>
      <div class="auto-plan-config-summary" id="autoPlanConfigSummary"></div>
    </div>

    <div class="auto-plan-parameter-grid">
      <label class="auto-plan-parameter-card">
        <span>Suchintensität</span>
        <select id="autoPlanSearchIntensity">
          <option value="standard">Standard · schnell</option>
          <option value="deep">Tief · empfohlen</option>
          <option value="maximum">Maximum · breiteste Suche</option>
        </select>
        <small>Steuert Suchbreite, Forward-Checking, exakte Restsuche und Fairness-Politur.</small>
      </label>
      <label class="auto-plan-parameter-card">
        <span>Optimierungsfokus</span>
        <select id="autoPlanOptimizationFocus">
          <option value="balanced">Ausgewogen</option>
          <option value="wishes">Wünsche priorisieren</option>
          <option value="workload">Lastenausgleich priorisieren</option>
          <option value="weekends">Wochenenden priorisieren</option>
        </select>
        <small>Harte Regeln bleiben vorrangig; geändert wird nur die Reihenfolge weicher Ziele.</small>
      </label>
      <label class="auto-plan-parameter-card auto-plan-toggle-card">
        <span>Minimal-Rot-Fallback</span>
        <span class="auto-plan-switch-line"><input type="checkbox" id="autoPlanAllowRedFallback"><b>zulassen</b></span>
        <small>Startet nur nach erfolgloser regulärer und vertiefter Null-Rot-Suche.</small>
      </label>
      <label class="auto-plan-parameter-card">
        <span>Maximal rote Vorschläge</span>
        <input type="number" id="autoPlanMaxRed" min="0" step="1" inputmode="numeric" placeholder="unbegrenzt">
        <small>Zusätzliche harte Grenze für den bestätigbaren Minimal-Rot-Fallback.</small>
      </label>
    </div>

    <section class="auto-plan-limits-panel" aria-labelledby="autoPlanLimitsTitle">
      <div class="auto-plan-section-title">
        <span id="autoPlanLimitsTitle">Feste Monatsobergrenzen je Mitarbeitendem</span>
        <button type="button" class="secondary auto-plan-reset-config" id="autoPlanResetConfigBtn">Standardwerte</button>
      </div>
      <div class="auto-plan-table-scroll auto-plan-config-table-scroll" tabindex="0">
        <table class="auto-plan-config-table">
          <thead><tr>
            <th scope="col">Mitarbeitender</th>
            <th scope="col">bestehend</th>
            <th scope="col">BD-Soll</th>
            <th scope="col">max. BD</th>
            <th scope="col">max. HG</th>
            <th scope="col">max. Gesamt</th>
          </tr></thead>
          <tbody id="autoPlanLimitsBody"></tbody>
        </table>
      </div>
      <div class="auto-plan-limit-legend">
        <span><i></i>Leeres Feld = keine zusätzliche Laufobergrenze</span>
        <span><i></i>Bestehende Fixpunkte zählen mit</span>
        <span><i></i>Personalstamm-Maxima werden vorbelegt</span>
      </div>
    </section>

    <div class="auto-plan-config-validation" id="autoPlanConfigValidation" aria-live="polite"></div>
  </section>`;
}

export function planningStaffForMonth(state, monthData) {
  const unique = new Map();
  for (const dateIso of Object.keys(monthData?.days || {}).sort()) {
    for (const person of getPlanningStaff(state.staff, dateIso)) unique.set(person.id, person);
  }
  return [...unique.values()];
}

function storageKey(monthData) {
  return `dienstplanrad:auto-plan-config:${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
}

function storedConfig(monthData) {
  try {
    const raw = sessionStorage.getItem(storageKey(monthData));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistConfig(monthData, config) {
  try {
    sessionStorage.setItem(storageKey(monthData), JSON.stringify(config));
  } catch {
    // Die Sitzungsspeicherung ist optional; die Berechnung bleibt funktionsfähig.
  }
}

function renderLimitRows(state, monthData, config) {
  byId('autoPlanLimitsBody').innerHTML = planningStaffForMonth(state, monthData).map(person => {
    const currentBd = countRoleInMonth(monthData, person.id, 'bd');
    const currentHg = countRoleInMonth(monthData, person.id, 'hg');
    const limits = config.staffLimits?.[person.id] || {};
    const input = (field, value, minimum) => `<input type="number" min="${minimum}" step="1" inputmode="numeric" data-auto-limit="${field}" data-staff-id="${esc(person.id)}" value="${value === null || value === undefined ? '' : esc(value)}" placeholder="frei" aria-label="${esc(field)} für ${esc(person.short || person.name)}">`;
    return `<tr data-staff-id="${esc(person.id)}">
      <th scope="row"><strong>${esc(person.short || person.name)}</strong><small>${esc(person.roleLabel || person.category || '')}</small></th>
      <td><span class="auto-plan-existing-load"><b>${currentBd}</b> BD · <b>${currentHg}</b> HG</span></td>
      <td><span class="auto-plan-target-badge">${Number(person.bdTarget || 0) || '—'}</span></td>
      <td>${input('maxBd', limits.maxBd, currentBd)}</td>
      <td>${input('maxHg', limits.maxHg, currentHg)}</td>
      <td>${input('maxTotal', limits.maxTotal, currentBd + currentHg)}</td>
    </tr>`;
  }).join('');
}

function applyConfigToControls(state, monthData, config) {
  byId('autoPlanSearchIntensity').value = config.searchIntensity;
  byId('autoPlanOptimizationFocus').value = config.optimizationFocus;
  byId('autoPlanAllowRedFallback').checked = config.allowRedFallback;
  byId('autoPlanMaxRed').value = config.maxRedViolations === null ? '' : String(config.maxRedViolations);
  byId('autoPlanMaxRed').disabled = !config.allowRedFallback;
  renderLimitRows(state, monthData, config);
}

export function readConfigFromControls(state, monthData) {
  const staffLimits = Object.fromEntries(planningStaffForMonth(state, monthData).map(person => [person.id, {
    maxBd: null,
    maxHg: null,
    maxTotal: null
  }]));
  for (const input of document.querySelectorAll('[data-auto-limit][data-staff-id]')) {
    const staffId = input.dataset.staffId;
    const field = input.dataset.autoLimit;
    if (!staffLimits[staffId] || !['maxBd', 'maxHg', 'maxTotal'].includes(field)) continue;
    staffLimits[staffId][field] = numericOrNull(input.value);
  }
  return normalizeAutoPlanConfig(state, monthData, {
    searchIntensity: byId('autoPlanSearchIntensity').value,
    optimizationFocus: byId('autoPlanOptimizationFocus').value,
    allowRedFallback: byId('autoPlanAllowRedFallback').checked,
    maxRedViolations: numericOrNull(byId('autoPlanMaxRed').value),
    staffLimits
  });
}

function openSlotCounts(monthData) {
  let bd = 0;
  let hg = 0;
  for (const day of Object.values(monthData?.days || {})) {
    if (!day?.bd) bd += 1;
    if (!day?.hg) hg += 1;
  }
  return { bd, hg, total: bd + hg };
}

function capacityErrors(state, monthData, config) {
  const open = openSlotCounts(monthData);
  let bdCapacity = 0;
  let hgCapacity = 0;
  let totalCapacity = 0;
  let allBdFinite = true;
  let allHgFinite = true;
  let allTotalFinite = true;

  for (const person of planningStaffForMonth(state, monthData)) {
    const limits = config.staffLimits?.[person.id] || {};
    const currentBd = countRoleInMonth(monthData, person.id, 'bd');
    const currentHg = countRoleInMonth(monthData, person.id, 'hg');
    if (limits.maxBd === null) allBdFinite = false;
    else bdCapacity += Math.max(0, limits.maxBd - currentBd);
    if (limits.maxHg === null) allHgFinite = false;
    else hgCapacity += Math.max(0, limits.maxHg - currentHg);
    if (limits.maxTotal === null) allTotalFinite = false;
    else totalCapacity += Math.max(0, limits.maxTotal - currentBd - currentHg);
  }

  const errors = [];
  if (allBdFinite && bdCapacity < open.bd) errors.push(`Die BD-Obergrenzen bieten nur ${bdCapacity} freie Plätze für ${open.bd} offene BD.`);
  if (allHgFinite && hgCapacity < open.hg) errors.push(`Die HG-Obergrenzen bieten nur ${hgCapacity} freie Plätze für ${open.hg} offene HG.`);
  if (allTotalFinite && totalCapacity < open.total) errors.push(`Die Gesamtobergrenzen bieten nur ${totalCapacity} freie Plätze für ${open.total} offene Dienstfelder.`);
  return errors;
}

function renderSummary(state, monthData) {
  const open = openSlotCounts(monthData);
  const fixed = Object.values(monthData.days || {}).reduce((sum, day) =>
    sum + Number(Boolean(day?.bd)) + Number(Boolean(day?.hg)), 0);
  byId('autoPlanConfigSummary').innerHTML = `
    <div><span>offene BD</span><strong>${open.bd}</strong></div>
    <div><span>offene HG</span><strong>${open.hg}</strong></div>
    <div><span>Fixpunkte</span><strong>${fixed}</strong></div>
    <div><span>Personal</span><strong>${planningStaffForMonth(state, monthData).length}</strong></div>`;
}

export function validateConfigUI(state, monthData) {
  const config = readConfigFromControls(state, monthData);
  const validation = validateAutoPlanConfig(state, monthData, config);
  const errors = [...validation.errors, ...capacityErrors(state, monthData, validation.config)];
  const box = byId('autoPlanConfigValidation');
  box.classList.toggle('valid', errors.length === 0);
  box.classList.toggle('invalid', errors.length > 0);
  box.innerHTML = errors.length
    ? `<strong>Konfiguration noch nicht startfähig</strong><ul>${errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul>`
    : '<strong>Konfiguration konsistent</strong><span>Alle Fixpunkte liegen innerhalb der Obergrenzen. Der Algorithmus kann gestartet werden.</span>';
  const start = byId('autoPlanStartBtn');
  if (start) start.disabled = errors.length > 0;
  return { valid: errors.length === 0, errors, config: validation.config };
}

export function renderConfigUI(state, monthData, preferredConfig = null) {
  const fallback = createDefaultAutoPlanConfig(state, monthData);
  const config = normalizeAutoPlanConfig(state, monthData, preferredConfig || storedConfig(monthData) || fallback);
  applyConfigToControls(state, monthData, config);
  renderSummary(state, monthData);
  return validateConfigUI(state, monthData);
}

export function resetConfigUI(state, monthData) {
  const config = createDefaultAutoPlanConfig(state, monthData);
  applyConfigToControls(state, monthData, config);
  renderSummary(state, monthData);
  return validateConfigUI(state, monthData);
}

export function bindConfigUI({ state, getMonthData, onStart }) {
  const config = byId('autoPlanConfig');
  config.addEventListener('input', event => {
    if (event.target.id === 'autoPlanAllowRedFallback') {
      byId('autoPlanMaxRed').disabled = !event.target.checked;
      if (!event.target.checked) byId('autoPlanMaxRed').value = '';
    }
    validateConfigUI(state, getMonthData());
  });
  config.addEventListener('change', () => validateConfigUI(state, getMonthData()));
  byId('autoPlanResetConfigBtn').addEventListener('click', () => resetConfigUI(state, getMonthData()));
  byId('autoPlanStartBtn').addEventListener('click', () => {
    const validation = validateConfigUI(state, getMonthData());
    if (validation.valid) onStart(validation.config);
  });
}
