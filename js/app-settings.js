import { DEFAULT_SETTINGS, normalizeSettings } from './defaults.js?v=20260803.4';
import { markBootstrapDirty, persistBootstrap, state } from './state.js?v=20260803.4';

const RELEASE = '20260803.4';
const byId = id => document.getElementById(id);

function addStylesheet() {
  if (document.querySelector('link[data-app-settings-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/app-settings.css?v=${RELEASE}`;
  link.dataset.appSettingsStyle = 'true';
  document.head.append(link);
}

function dialogMarkup() {
  return `<dialog id="settingsDialog" class="app-dialog settings-dialog" aria-labelledby="settingsTitle">
    <form method="dialog" class="dialog-card settings-card" id="settingsForm">
      <header class="settings-header">
        <div>
          <div class="eyebrow">DienstplanRAD konfigurieren</div>
          <h2 id="settingsTitle" tabindex="-1">Einstellungen</h2>
          <p>Darstellung und Auto-Plan-Voreinstellungen gelten auf diesem Gerät und werden mit der Anwendung synchronisiert.</p>
        </div>
        <button type="button" class="icon-btn close-btn" id="settingsCloseBtn" aria-label="Einstellungen schließen">✕</button>
      </header>
      <div class="settings-body">
        <section class="settings-section" aria-labelledby="settingsAppearanceTitle">
          <div class="settings-section-heading">
            <span class="settings-section-icon" aria-hidden="true">Aa</span>
            <div><h3 id="settingsAppearanceTitle">Darstellung &amp; Bedienung</h3><p>Ruhige, dichte Arbeitsoberfläche ohne die Systempräferenzen zu übergehen.</p></div>
          </div>
          <div class="settings-grid">
            <label><span>Informationsdichte</span><small>Komfortabel bietet mehr Luft, kompakt zeigt mehr Plan auf einmal.</small>
              <select id="settingsDensity"><option value="comfortable">Komfortabel</option><option value="compact">Kompakt</option></select>
            </label>
            <label><span>Bewegung</span><small>„System“ folgt der Betriebssystem-Vorgabe; reduziert entfernt nicht notwendige Bewegung.</small>
              <select id="settingsMotion"><option value="system">Systemeinstellung</option><option value="reduced">Reduziert</option></select>
            </label>
            <label class="settings-toggle"><span><strong>Erklärende Tooltips</strong><small>Zeigt vertiefte Erklärungen zu Auto-Plan-Parametern.</small></span><input id="settingsRichTooltips" type="checkbox"></label>
          </div>
        </section>
        <section class="settings-section settings-section--accent" aria-labelledby="settingsAutoPlanTitle">
          <div class="settings-section-heading">
            <span class="settings-section-icon" aria-hidden="true">v7.5</span>
            <div><h3 id="settingsAutoPlanTitle">Auto-Plan Engine</h3><p>Sichere Voreinstellungen für neue Läufe; im Studio bleibt jeder Wert pro Lauf änderbar.</p></div>
          </div>
          <div class="settings-grid settings-grid--three">
            <label><span>Leistungsprofil</span><small>Steuert das geräteabhängige Worker-Budget.</small>
              <select id="settingsPerformanceProfile"><option value="responsive">Responsiv</option><option value="adaptive">Adaptiv · empfohlen</option><option value="power">Power</option></select>
            </label>
            <label><span>Suchintensität</span><small>Breite und Tiefe der Konstruktion.</small>
              <select id="settingsSearchIntensity"><option value="standard">Standard</option><option value="deep">Tief · empfohlen</option><option value="maximum">Maximum</option></select>
            </label>
            <label><span>Optimierungsfokus</span><small>Ordnet die weichen Ziele nach der Machbarkeit.</small>
              <select id="settingsOptimizationFocus"><option value="balanced">Ausgewogen</option><option value="wishes">Wünsche</option><option value="workload">Lastverteilung</option><option value="weekends">Wochenenden</option></select>
            </label>
            <label><span>Zeitbudget</span><small>10 bis 900 Sekunden für Verbesserung und Nachweis.</small>
              <span class="settings-number"><input id="settingsTimeBudget" type="number" min="10" max="900" step="5"><b>s</b></span>
            </label>
            <label><span>Parallele Suchläufe</span><small>Automatisch berücksichtigt Kerne, Speicher und Monat.</small>
              <select id="settingsParallelSearches"><option value="">Automatisch</option>${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}</select>
            </label>
            <label><span>Maximal rote Ausnahmen</span><small>Leer lässt nur das gewählte Fallback entscheiden.</small>
              <input id="settingsMaxRed" type="number" min="0" max="62" step="1" placeholder="keine Zusatzgrenze">
            </label>
            <label class="settings-toggle"><span><strong>Perfektionsphase</strong><small>ALNS, Abstieg und Optimalitätsnachweis ausführen.</small></span><input id="settingsPerfection" type="checkbox"></label>
            <label class="settings-toggle"><span><strong>Minimal-Rot-Fallback erlauben</strong><small>Erst nach erfolgloser strikter Suche und Null-Rot-Rescue.</small></span><input id="settingsAllowRed" type="checkbox"></label>
          </div>
        </section>
      </div>
      <p class="settings-status" id="settingsStatus" aria-live="polite"></p>
      <menu class="dialog-actions settings-actions">
        <button type="button" class="secondary" id="settingsResetBtn">Vorschlagswerte</button>
        <span></span>
        <button type="button" class="secondary" id="settingsCancelBtn">Abbrechen</button>
        <button type="submit" id="settingsSaveBtn">Einstellungen speichern</button>
      </menu>
    </form>
  </dialog>`;
}

function ensureDialog() {
  let dialog = byId('settingsDialog');
  if (dialog) return dialog;
  const template = document.createElement('template');
  template.innerHTML = dialogMarkup();
  document.body.append(template.content);
  dialog = byId('settingsDialog');
  bindDialog(dialog);
  return dialog;
}

function valueOrNull(value) {
  return value === '' ? null : Number(value);
}

function populate(settings) {
  const normalized = normalizeSettings(settings);
  byId('settingsDensity').value = normalized.appearance.density;
  byId('settingsMotion').value = normalized.appearance.motion;
  byId('settingsRichTooltips').checked = normalized.appearance.richTooltips;
  byId('settingsPerformanceProfile').value = normalized.autoPlan.performanceProfile;
  byId('settingsSearchIntensity').value = normalized.autoPlan.searchIntensity;
  byId('settingsOptimizationFocus').value = normalized.autoPlan.optimizationFocus;
  byId('settingsTimeBudget').value = String(normalized.autoPlan.timeBudgetSeconds);
  byId('settingsParallelSearches').value = normalized.autoPlan.parallelSearches ?? '';
  byId('settingsMaxRed').value = normalized.autoPlan.maxRedViolations ?? '';
  byId('settingsPerfection').checked = normalized.autoPlan.perfectionEnabled;
  byId('settingsAllowRed').checked = normalized.autoPlan.allowRedFallback;
  byId('settingsStatus').textContent = '';
}

function readForm() {
  return normalizeSettings({
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    appearance: {
      density: byId('settingsDensity').value,
      motion: byId('settingsMotion').value,
      richTooltips: byId('settingsRichTooltips').checked
    },
    autoPlan: {
      performanceProfile: byId('settingsPerformanceProfile').value,
      searchIntensity: byId('settingsSearchIntensity').value,
      optimizationFocus: byId('settingsOptimizationFocus').value,
      timeBudgetSeconds: Number(byId('settingsTimeBudget').value),
      parallelSearches: valueOrNull(byId('settingsParallelSearches').value),
      maxRedViolations: valueOrNull(byId('settingsMaxRed').value),
      perfectionEnabled: byId('settingsPerfection').checked,
      allowRedFallback: byId('settingsAllowRed').checked
    }
  }, { strict: true });
}

export function applyApplicationSettings(settings = state.settings) {
  const normalized = normalizeSettings(settings);
  const root = document.documentElement;
  root.dataset.appDensity = normalized.appearance.density;
  root.dataset.motion = normalized.appearance.motion;
  root.dataset.richTooltips = String(normalized.appearance.richTooltips);
  root.classList.toggle('reduce-motion', normalized.appearance.motion === 'reduced');
  window.dispatchEvent(new CustomEvent('appsettingschange', { detail: structuredClone(normalized) }));
  return normalized;
}

function closeDialog() {
  byId('settingsDialog')?.close();
}

async function save(event) {
  event.preventDefault();
  const status = byId('settingsStatus');
  try {
    const settings = readForm();
    state.settings = settings;
    markBootstrapDirty();
    applyApplicationSettings(settings);
    closeDialog();
    const result = await persistBootstrap();
    if (!result.ok) window.dispatchEvent(new CustomEvent('appsettingssaveerror', { detail: result.error }));
  } catch (error) {
    status.textContent = error?.message || 'Einstellungen konnten nicht gespeichert werden.';
  }
}

function bindDialog(dialog) {
  const trigger = byId('settingsBtn');
  byId('settingsForm').addEventListener('submit', save);
  byId('settingsCloseBtn').addEventListener('click', closeDialog);
  byId('settingsCancelBtn').addEventListener('click', closeDialog);
  byId('settingsResetBtn').addEventListener('click', () => {
    populate(DEFAULT_SETTINGS);
    byId('settingsStatus').textContent = 'Vorschlagswerte geladen. Zum Übernehmen noch speichern.';
  });
  dialog.addEventListener('close', () => trigger?.focus({ preventScroll: true }));
}

export function openSettings() {
  const dialog = ensureDialog();
  populate(state.settings);
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => byId('settingsTitle')?.focus({ preventScroll: true }));
}

function initialize() {
  addStylesheet();
  byId('settingsBtn')?.addEventListener('click', openSettings);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
