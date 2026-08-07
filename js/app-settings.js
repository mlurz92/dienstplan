/**
 * Anwendungseinstellungen – ein Ort für alles, was die Anwendung dauerhaft
 * anders arbeiten lässt.
 *
 * Zwei Grundsätze bestimmen den Inhalt:
 *
 * 1. **Kein Schalter ohne Wirkung.** Jede Einstellung hier wird an einer
 *    nachvollziehbaren Stelle gelesen. Ein Schalter, der nur gespeichert wird,
 *    ist schlimmer als kein Schalter: Er verspricht etwas, das nicht eintritt.
 * 2. **Keine Einstellung für eine fachliche Regel.** Die Regelengine ist die
 *    Wahrheitsquelle der Dienstplanung und lässt sich nicht über ein Modal
 *    weichzeichnen. Einstellbar sind Darstellung, Arbeitsverhalten und die
 *    Voreinstellungen des Auto-Plans – nicht, was fachlich erlaubt ist.
 *
 * Die drei Abschnitte folgen der Gliederung des Einstellungsschemas.
 */
import { DEFAULT_SETTINGS, normalizeSettings } from './defaults.js?v=20260806.1';
import { markBootstrapDirty, persistBootstrap, state } from './state.js?v=20260806.1';

const RELEASE = '20260806.1';
const byId = id => document.getElementById(id);

function addStylesheet() {
  if (document.querySelector('link[data-app-settings-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/app-settings.css?v=${RELEASE}`;
  link.dataset.appSettingsStyle = 'true';
  document.head.append(link);
}

function toggle(id, title, detail) {
  return `<label class="settings-toggle"><span><strong>${title}</strong><small>${detail}</small></span><input id="${id}" type="checkbox"></label>`;
}

function dialogMarkup() {
  return `<dialog id="settingsDialog" class="app-dialog settings-dialog" aria-labelledby="settingsTitle">
    <form method="dialog" class="dialog-card settings-card" id="settingsForm">
      <header class="settings-header">
        <div>
          <div class="eyebrow">DienstplanRAD konfigurieren</div>
          <h2 id="settingsTitle" tabindex="-1">Einstellungen</h2>
          <p>Darstellung, Arbeitsverhalten und Auto-Plan-Voreinstellungen. Sie werden mit der Anwendung synchronisiert und gelten auf allen Geräten dieses Kontos.</p>
        </div>
        <button type="button" class="icon-btn close-btn" id="settingsCloseBtn" aria-label="Einstellungen schließen">✕</button>
      </header>

      <nav class="settings-tabs" role="tablist" aria-label="Einstellungsbereiche">
        <button type="button" role="tab" id="settingsTabAppearance" aria-controls="settingsPanelAppearance" aria-selected="true" data-settings-tab="appearance">Darstellung</button>
        <button type="button" role="tab" id="settingsTabWorkflow" aria-controls="settingsPanelWorkflow" aria-selected="false" tabindex="-1" data-settings-tab="workflow">Arbeitsweise</button>
        <button type="button" role="tab" id="settingsTabAutoPlan" aria-controls="settingsPanelAutoPlan" aria-selected="false" tabindex="-1" data-settings-tab="autoplan">Auto-Plan v10</button>
      </nav>

      <div class="settings-body">
        <section class="settings-section" role="tabpanel" id="settingsPanelAppearance" aria-labelledby="settingsTabAppearance" data-settings-panel="appearance">
          <div class="settings-section-heading">
            <span class="settings-section-icon" aria-hidden="true">Aa</span>
            <div><h3>Darstellung &amp; Bedienung</h3><p>Ruhige, dichte Arbeitsoberfläche, ohne die Systempräferenzen zu übergehen.</p></div>
          </div>
          <div class="settings-grid">
            <label><span>Informationsdichte</span><small>Komfortabel bietet mehr Luft, kompakt zeigt mehr Plan auf einmal.</small>
              <select id="settingsDensity"><option value="comfortable">Komfortabel</option><option value="compact">Kompakt</option></select>
            </label>
            <label><span>Bewegung</span><small>„System“ folgt der Betriebssystem-Vorgabe; reduziert entfernt jede nicht notwendige Bewegung.</small>
              <select id="settingsMotion"><option value="system">Systemeinstellung</option><option value="reduced">Reduziert</option></select>
            </label>
            <label><span>Monatsfarbsystem</span><small>Der Trend-Atlas gibt jedem Monat einen eigenen Kontrast; Regenbogen, Pastell und Juwel führen die zwölf Monate jahresunabhängig durch das Spektrum; klassisch nutzt die feste Monatspalette, neutral verzichtet darauf.</small>
              <select id="settingsMonthColors">
                <option value="spectrum">Trend-Atlas · empfohlen</option>
                <option value="rainbow">Regenbogen · zwölf Monate im Spektrum</option>
                <option value="pastel">Pastell · zarte Monatstöne</option>
                <option value="deep">Juwel · satte Edelsteintöne</option>
                <option value="classic">Klassische Monatspalette</option>
                <option value="neutral">Neutral, ohne Monatsfarbe</option>
              </select>
            </label>
          </div>
          <div class="settings-grid">
            ${toggle('settingsRichTooltips', 'Erklärende Tooltips', 'Zeigt vertiefte Erklärungen zu Auto-Plan-Parametern und Regelbegriffen.')}
            ${toggle('settingsWeekendEmphasis', 'Wochenenden und Feiertage hervorheben', 'Verstärkt die farbliche Absetzung von Samstag, Sonntag und sächsischen Feiertagen in allen Tabellen.')}
            ${toggle('settingsAmbientBackdrop', 'Atmosphärischer Hintergrund', 'Die weichen Farbfelder hinter der Arbeitsfläche. Abgeschaltet wird die Seite spürbar ruhiger und auf schwacher Grafik flüssiger.')}
          </div>
        </section>

        <section class="settings-section" role="tabpanel" id="settingsPanelWorkflow" aria-labelledby="settingsTabWorkflow" data-settings-panel="workflow" hidden>
          <div class="settings-section-heading">
            <span class="settings-section-icon" aria-hidden="true">⏱</span>
            <div><h3>Arbeitsweise</h3><p>Wann gespeichert wird und wie viel das Auto-Plan Studio währenddessen von sich zeigt.</p></div>
          </div>
          <div class="settings-grid">
            <label><span>Verzögerung des automatischen Speicherns</span><small>Kurz sichert früher, lang bündelt schnelle Eingabefolgen zu einem einzigen Serverlauf. 300 bis 5000 Millisekunden.</small>
              <span class="settings-number"><input id="settingsAutoSaveDelay" type="number" min="300" max="5000" step="100"><b>ms</b></span>
            </label>
          </div>
          <div class="settings-grid">
            ${toggle('settingsCommentary', 'Algorithmus-Kommentar im Studio', 'Der laufende Klartextbericht darüber, welchen Ausschnitt die Suche gerade neu aufbaut und welcher Tausch etwas gebracht hat.')}
            ${toggle('settingsVisualizer', 'Lebende Suchvisualisierung', 'Die Ringdarstellung der Dienstfelder während des Laufs. Abgeschaltet bleibt der Fortschrittsbalken, die Rechenzeit geht vollständig in die Suche.')}
          </div>
        </section>

        <section class="settings-section settings-section--accent" role="tabpanel" id="settingsPanelAutoPlan" aria-labelledby="settingsTabAutoPlan" data-settings-panel="autoplan" hidden>
          <div class="settings-section-heading">
            <span class="settings-section-icon" aria-hidden="true">v10</span>
            <div><h3>Auto-Plan Engine v10</h3><p>Sichere Voreinstellungen für neue Läufe; im Studio bleibt jeder Wert pro Lauf änderbar.</p></div>
          </div>
          <div class="settings-grid settings-grid--three">
            <label><span>Leistungsprofil</span><small>Steuert das geräteabhängige Worker-Budget und die für die Oberfläche reservierten Kerne.</small>
              <select id="settingsPerformanceProfile"><option value="responsive">Responsiv</option><option value="adaptive">Adaptiv · empfohlen</option><option value="power">Power</option></select>
            </label>
            <label><span>Suchintensität</span><small>Breite und Tiefe der Konstruktion.</small>
              <select id="settingsSearchIntensity"><option value="standard">Standard</option><option value="deep">Tief · empfohlen</option><option value="maximum">Maximum</option></select>
            </label>
            <label><span>Optimierungsfokus</span><small>Ordnet die weichen Ziele. Harte Regeln und Vollständigkeit haben immer Vorrang.</small>
              <select id="settingsOptimizationFocus"><option value="balanced">Ausgewogen</option><option value="wishes">Wünsche</option><option value="workload">Lastverteilung</option><option value="weekends">Wochenenden</option></select>
            </label>
            <label><span>Zeitbudget</span><small>10 bis 900 Sekunden für Verbesserung und Nachweis.</small>
              <span class="settings-number"><input id="settingsTimeBudget" type="number" min="10" max="900" step="5"><b>s</b></span>
            </label>
            <label><span>Parallele Suchläufe</span><small>Automatisch berücksichtigt Kerne, Speicher und Monatsgröße.</small>
              <select id="settingsParallelSearches"><option value="">Automatisch</option>${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}</select>
            </label>
            <label><span>Maximal rote Ausnahmen</span><small>Leer lässt nur das gewählte Fallback entscheiden.</small>
              <input id="settingsMaxRed" type="number" min="0" max="62" step="1" placeholder="keine Zusatzgrenze">
            </label>
            <label><span>Runden des Optimalitätsnachweises</span><small>Jede Runde prüft Einzelumsetzung, Paartausch und Tagespaket vollständig. Mehr Runden fangen Verbesserungen auf, die erst eine vorige Runde ermöglicht hat.</small>
              <input id="settingsCertificationRounds" type="number" min="1" max="8" step="1">
            </label>
          </div>
          <div class="settings-grid">
            ${toggle('settingsPerfection', 'Perfektionsphase', 'Ruin-and-Recreate, absteigende Nachbarschaften und Optimalitätsnachweis ausführen.')}
            ${toggle('settingsPortfolioDiversity', 'Portfolio-Diversität', 'Die parallelen Perfektionsläufe unterscheiden sich zusätzlich in Late-Acceptance-Fenster und Abstiegsfrequenz, nicht nur im Startwert.')}
            ${toggle('settingsAllowRed', 'Minimal-Rot-Fallback erlauben', 'Erst nach erfolgloser strikter Suche und ausgeschöpfter Null-Rot-Rescue.')}
          </div>

          <div class="settings-section-heading" style="margin-top:20px">
            <span class="settings-section-icon" aria-hidden="true">≈</span>
            <div><h3>Exakte Suche (v10)</h3><p>CP-SAT löst den Monat im Browser als boolesches Zuordnungsmodell; ohne verfügbares WebAssembly übernimmt die Heuristik vollständig.</p></div>
          </div>
          <div class="settings-grid settings-grid--three">
            <label><span>Solver-Backend</span><small>Automatisch versucht die exakte Suche und fällt bei Nichtverfügbarkeit auf die Heuristik zurück.</small>
              <select id="settingsSolverBackend">
                <option value="auto">Automatisch · empfohlen</option>
                <option value="cp-sat-exact">Exakt (CP-SAT)</option>
                <option value="cp-sat-lns">Exakt mit Nachbarschaftssuche</option>
                <option value="heuristic-alns">Nur Heuristik</option>
              </select>
            </label>
            <label><span>Zeitbudget der Kaskade</span><small>2 bis 60 Sekunden, anteilig auf die Stufen verteilt. Bei 60 offenen Feldern ist jede Stufe meist in Millisekunden beweisbar optimal.</small>
              <span class="settings-number"><input id="settingsCpSatBudget" type="number" min="1" max="60" step="1"><b>s</b></span>
            </label>
            <label><span>Warmstart</span><small>Die Heuristik-Startbelegung wird der exakten Suche als Lösungshinweis übergeben.</small>
              <select id="settingsCpSatWarmStart"><option value="heuristic">Heuristik-Hinweis</option><option value="none">Ohne Hinweis</option></select>
            </label>
            <label><span>Leximin-Tiefe</span><small>Wie viele Ränge des sortierten Lastvektors exakt festgezurrt werden. Ein Rang senkt die Höchstlast, jeder weitere die nächste Stufe darunter.</small>
              <span class="settings-number"><input id="settingsLeximinDepth" type="number" min="1" max="8" step="1"><b>Ränge</b></span>
            </label>
            <label><span>HG-Gewicht in der Last</span><small>Wie stark ein Hintergrunddienst gegenüber einem Bereitschaftsdienst als Belastung zählt.</small>
              <span class="settings-number"><input id="settingsHgLoadPercent" type="number" min="0" max="100" step="5"><b>%</b></span>
            </label>
            <label><span>Fairness-Gedächtnis</span><small>Länge des Rückblicks auf abgeschlossene Monate. Null schaltet die monatsübergreifende Fairness ab.</small>
              <span class="settings-number"><input id="settingsCarryOverWindow" type="number" min="0" max="6" step="1"><b>Monate</b></span>
            </label>
            <label><span>Gewicht des Gedächtnisses</span><small>Wie stark ein Vorsprung aus den Vormonaten den Startwert der Lastverteilung anhebt.</small>
              <span class="settings-number"><input id="settingsCarryOverPercent" type="number" min="0" max="100" step="5"><b>%</b></span>
            </label>
            <label><span>Stabilität gegenüber dem Warmstart</span><small>Wie stark der Vorschlag am Ausgangsplan festhält, wenn mehrere Lösungen gleich gut sind.</small>
              <select id="settingsStabilityLevel">
                <option value="off">Aus</option>
                <option value="tiebreak">Bei Gleichstand · empfohlen</option>
                <option value="strict">Streng – Stabilität zuerst</option>
              </select>
            </label>
            <label><span>Bei Unlösbarkeit</span><small>Die Korrekturmengen-Diagnose nennt in einem Lauf, welche Regelgruppen aufgegeben werden müssten.</small>
              <select id="settingsConflictMode">
                <option value="report">Nur melden</option>
                <option value="show">Korrekturmenge anzeigen · empfohlen</option>
                <option value="apply">Korrekturmenge anwenden</option>
              </select>
            </label>
            <label><span>Erklärungstiefe</span><small>Kurz, ausführlich mit Regel-Kennungen oder optional LLM-gestützt.</small>
              <select id="settingsExplanationDepth">
                <option value="short">Kurz</option>
                <option value="detailed">Ausführlich · empfohlen</option>
                <option value="llm">LLM-gestützt</option>
              </select>
            </label>
          </div>
          <div class="settings-grid">
            ${toggle('settingsDeterministic', 'Deterministische Läufe', 'Alle Zufallsströme leiten sich aus Konfiguration und Monatszustand ab; identische Eingaben ergeben identische Pläne.')}
            ${toggle('settingsRepairOnEdit', 'Reparatur nach Änderung', 'Nach manuellen Änderungen beim nächsten Lauf nur den betroffenen Bereich exakt neu lösen.')}
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
  byId('settingsMonthColors').value = normalized.appearance.monthColors;
  byId('settingsRichTooltips').checked = normalized.appearance.richTooltips;
  byId('settingsWeekendEmphasis').checked = normalized.appearance.weekendEmphasis;
  byId('settingsAmbientBackdrop').checked = normalized.appearance.ambientBackdrop;
  byId('settingsAutoSaveDelay').value = String(normalized.workflow.autoSaveDelayMs);
  byId('settingsCommentary').checked = normalized.workflow.algorithmCommentary;
  byId('settingsVisualizer').checked = normalized.workflow.studioVisualizer;
  byId('settingsPerformanceProfile').value = normalized.autoPlan.performanceProfile;
  byId('settingsSearchIntensity').value = normalized.autoPlan.searchIntensity;
  byId('settingsOptimizationFocus').value = normalized.autoPlan.optimizationFocus;
  byId('settingsTimeBudget').value = String(normalized.autoPlan.timeBudgetSeconds);
  byId('settingsParallelSearches').value = normalized.autoPlan.parallelSearches ?? '';
  byId('settingsMaxRed').value = normalized.autoPlan.maxRedViolations ?? '';
  byId('settingsCertificationRounds').value = String(normalized.autoPlan.certificationRounds);
  byId('settingsPerfection').checked = normalized.autoPlan.perfectionEnabled;
  byId('settingsPortfolioDiversity').checked = normalized.autoPlan.portfolioDiversity;
  byId('settingsAllowRed').checked = normalized.autoPlan.allowRedFallback;
  byId('settingsSolverBackend').value = normalized.autoPlan.solverBackend;
  byId('settingsCpSatBudget').value = String(normalized.autoPlan.cpSatTimeBudgetSeconds);
  byId('settingsCpSatWarmStart').value = normalized.autoPlan.cpSatWarmStart;
  byId('settingsLeximinDepth').value = String(normalized.autoPlan.leximinDepth);
  byId('settingsHgLoadPercent').value = String(normalized.autoPlan.hgLoadPercent);
  byId('settingsCarryOverWindow').value = String(normalized.autoPlan.carryOverWindow);
  byId('settingsCarryOverPercent').value = String(normalized.autoPlan.carryOverPercent);
  byId('settingsStabilityLevel').value = normalized.autoPlan.stabilityLevel;
  byId('settingsConflictMode').value = normalized.autoPlan.conflictMode;
  byId('settingsExplanationDepth').value = normalized.autoPlan.explanationDepth;
  byId('settingsDeterministic').checked = normalized.autoPlan.deterministic;
  byId('settingsRepairOnEdit').checked = normalized.autoPlan.repairOnEdit;
  byId('settingsStatus').textContent = '';
}

function readForm() {
  return normalizeSettings({
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    appearance: {
      density: byId('settingsDensity').value,
      motion: byId('settingsMotion').value,
      monthColors: byId('settingsMonthColors').value,
      richTooltips: byId('settingsRichTooltips').checked,
      weekendEmphasis: byId('settingsWeekendEmphasis').checked,
      ambientBackdrop: byId('settingsAmbientBackdrop').checked
    },
    workflow: {
      autoSaveDelayMs: Number(byId('settingsAutoSaveDelay').value),
      algorithmCommentary: byId('settingsCommentary').checked,
      studioVisualizer: byId('settingsVisualizer').checked
    },
    autoPlan: {
      performanceProfile: byId('settingsPerformanceProfile').value,
      searchIntensity: byId('settingsSearchIntensity').value,
      optimizationFocus: byId('settingsOptimizationFocus').value,
      timeBudgetSeconds: Number(byId('settingsTimeBudget').value),
      parallelSearches: valueOrNull(byId('settingsParallelSearches').value),
      maxRedViolations: valueOrNull(byId('settingsMaxRed').value),
      certificationRounds: Number(byId('settingsCertificationRounds').value),
      perfectionEnabled: byId('settingsPerfection').checked,
      portfolioDiversity: byId('settingsPortfolioDiversity').checked,
      allowRedFallback: byId('settingsAllowRed').checked,
      solverBackend: byId('settingsSolverBackend').value,
      cpSatTimeBudgetSeconds: Number(byId('settingsCpSatBudget').value),
      cpSatWarmStart: byId('settingsCpSatWarmStart').value,
      leximinDepth: Number(byId('settingsLeximinDepth').value),
      hgLoadPercent: Number(byId('settingsHgLoadPercent').value),
      carryOverWindow: Number(byId('settingsCarryOverWindow').value),
      carryOverPercent: Number(byId('settingsCarryOverPercent').value),
      stabilityLevel: byId('settingsStabilityLevel').value,
      conflictMode: byId('settingsConflictMode').value,
      explanationDepth: byId('settingsExplanationDepth').value,
      deterministic: byId('settingsDeterministic').checked,
      repairOnEdit: byId('settingsRepairOnEdit').checked
    }
  }, { strict: true });
}

/**
 * Überträgt die Einstellungen auf die Oberfläche.
 *
 * Sämtliche Darstellungsentscheidungen laufen über Datenattribute an der
 * Wurzel: Das Stylesheet bleibt damit die einzige Stelle, die über Aussehen
 * entscheidet, und ein späterer Umbau des Designs muss nicht durch dieses
 * Modul hindurch.
 */
export function applyApplicationSettings(settings = state.settings) {
  const normalized = normalizeSettings(settings);
  const root = document.documentElement;
  root.dataset.appDensity = normalized.appearance.density;
  root.dataset.motion = normalized.appearance.motion;
  root.dataset.richTooltips = String(normalized.appearance.richTooltips);
  root.dataset.monthColors = normalized.appearance.monthColors;
  root.dataset.weekendEmphasis = String(normalized.appearance.weekendEmphasis);
  root.dataset.ambientBackdrop = String(normalized.appearance.ambientBackdrop);
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

/**
 * Die drei Bereiche als echte Reiter.
 *
 * Vorher lagen alle Abschnitte untereinander in einem Bildlaufbereich. Mit der
 * gewachsenen Zahl an Einstellungen war der Auto-Plan-Abschnitt dadurch nur
 * noch über eine lange Rollbewegung erreichbar. Die Reiter folgen dem
 * ARIA-Muster einschließlich Pfeiltastensteuerung.
 */
function selectTab(dialog, key) {
  for (const tab of dialog.querySelectorAll('[data-settings-tab]')) {
    const active = tab.dataset.settingsTab === key;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of dialog.querySelectorAll('[data-settings-panel]')) {
    panel.hidden = panel.dataset.settingsPanel !== key;
  }
}

function bindTabs(dialog) {
  const tabs = [...dialog.querySelectorAll('[data-settings-tab]')];
  for (const tab of tabs) tab.addEventListener('click', () => selectTab(dialog, tab.dataset.settingsTab));
  dialog.querySelector('.settings-tabs').addEventListener('keydown', event => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    const next = tabs[(current + step + tabs.length) % tabs.length];
    selectTab(dialog, next.dataset.settingsTab);
    next.focus();
  });
}

function bindDialog(dialog) {
  byId('settingsForm').addEventListener('submit', save);
  byId('settingsCloseBtn').addEventListener('click', closeDialog);
  byId('settingsCancelBtn').addEventListener('click', closeDialog);
  byId('settingsResetBtn').addEventListener('click', () => {
    populate(DEFAULT_SETTINGS);
    byId('settingsStatus').textContent = 'Vorschlagswerte geladen. Zum Übernehmen noch speichern.';
  });
  bindTabs(dialog);
  dialog.addEventListener('close', () => settingsTrigger()?.focus({ preventScroll: true }));
}

function settingsTrigger() {
  return byId('settingsBtn');
}

export function openSettings() {
  const dialog = ensureDialog();
  populate(state.settings);
  // Immer im ersten Bereich beginnen. Ein Modal, das dort wieder aufgeht, wo
  // man es zuletzt verlassen hat, wirkt beim nächsten Öffnen wie ein anderes
  // Modal — der Einstiegspunkt bleibt deshalb fest.
  selectTab(dialog, 'appearance');
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => byId('settingsTitle')?.focus({ preventScroll: true }));
}

/**
 * Das Zahnrad der Aktionsleiste.
 *
 * Die Werkzeugleiste baut sich in `ui-controls.js` neu auf und ordnet die
 * Einstellungen dort als fixiertes Zahnrad am rechten Rand an – außerhalb jeder
 * Dichtestufe und außerhalb des Überlaufmenüs. Hier wird ausschließlich das
 * Verhalten gebunden; das Aussehen bleibt in der Leiste, wo es hingehört.
 *
 * Die Bindung erfolgt über das Ereignis am `document`, damit sie einen Neubau
 * der Leiste unbeschadet übersteht: Der Knopf wird dabei verschoben, nicht neu
 * erzeugt, aber ein direkt gebundener Zuhörer ginge bei einem späteren Ersatz
 * des Knotens verloren.
 */
function initialize() {
  addStylesheet();
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('#settingsBtn')) openSettings();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
