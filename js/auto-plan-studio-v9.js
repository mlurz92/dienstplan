/**
 * Auto-Plan Studio v9 – exakte Sucharchitektur, Erklärbarkeit und Tooltips.
 *
 * Diese Schicht setzt additiv auf das v8.5-Studio auf (Modulpfad bleibt
 * stabil) und ergänzt:
 *
 * 1. **v9-Regler** für die hybride exakte Engine: Solver-Backend,
 *    CP-SAT-Zeitbudget, Worker-Parallelität, Warmstart, Fairness-Profil,
 *    Determinismus, Infeasibility-Modus, Reparatur-nach-Änderung,
 *    Erklärungstiefe.
 * 2. **Exaktheitsnachweis-Panel** im Ergebnis: Solver-Status, untere Schranke,
 *    Phasenspur, Modellgröße und MUS-artige Konfliktursachen.
 * 3. **Erklärende Tooltips an jeder Stelle** des Studios – auch an Elementen,
 *    die bisher nur native Titel trugen oder gar keine.
 * 4. **v9-Layout**: Der Dialog passt vollständig in den Viewport; nur innere
 *    Bereiche scrollen. Das Algorithmus-Kommentar-Fenster wächst nicht mehr,
 *    sondern scrollt intern. Dark-Mode-Kontraste werden angehoben.
 */

import { AUTO_PLAN_STAGES, isCpSatReady } from './auto-planner.js?v=20260805.1';
import { state } from './state.js?v=20260805.1';
import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260805.1';

const RELEASE = '20260805.1';
const STORAGE_KEY = 'dienstplanrad:autoplan-v9-studio';

const BACKEND_LABELS = Object.freeze({
  auto: 'Automatisch (CP-SAT, Fallback Heuristik)',
  'cp-sat-exact': 'CP-SAT exakt (beweisbar)',
  'cp-sat-lns': 'CP-SAT mit LNS-Reihenfolge',
  'heuristic-alns': 'Heuristik v8.5 (ALNS)'
});

const FAIRNESS_LABELS = Object.freeze({
  leximin: 'Leximin (Maximin zuerst)',
  spread: 'Spannweite',
  variance: 'Varianz',
  owa: 'OWA (gewichtet geordnet)'
});

const INFEASIBILITY_LABELS = Object.freeze({
  mus: 'Ursachenanalyse (MUS-artig)',
  relax: 'Ursachen + schrittweise Relaxierung',
  report: 'Nur melden'
});

/**
 * Vollständiges Verzeichnis der Erklärungstexte für Studio-Elemente.
 * Schlüssel sind CSS-Selektoren innerhalb des Dialogs.
 */
const TOOLTIP_CATALOG = Object.freeze({
  '#autoPlanSearchIntensity': 'Breite der Konstruktionssuche. Standard baut schnell auf, Maximum prüft beim Aufbau mehr Varianten. Die eigentliche Qualität entsteht danach in der Perfektionsphase.',
  '#autoPlanOptimizationFocus': 'Reihenfolge der weichen Ziele. Harte Regeln, vollständige Belegung sowie rote, orange und gelbe Hinweise haben immer Vorrang; der Schwerpunkt ordnet nur das, was danach kommt. In v9 steuert der Schwerpunkt die Reihenfolge der CP-SAT-Phasen.',
  '#autoPlanTimeBudget': 'Zeit für Ruin-and-Recreate-Suche und abschließenden Optimalitätsnachweis. Bei aktiver exakter Suche gilt der Rahmen dem CP-SAT-Lauf; die Heuristik bleibt als Warmstart und Fallback erhalten.',
  '#autoPlanRepairIterations': 'Runden der einfachen Tauschreparatur direkt nach dem Aufbau. Sie glättet grobe Ausreißer, bevor die Perfektionsphase übernimmt.',
  '#autoPlanLocalBudget': 'Zahl der Knoten, die eine lokale Neuplanung auffälliger Tage höchstens durchsuchen darf.',
  '#autoPlanLateAcceptance': 'Wie viele Runden die Suche zurückblickt, bevor sie einen Zustand annimmt. Größere Werte lassen mehr vorübergehende Verschlechterung zu und verlassen lokale Optima leichter.',
  '#autoPlanMaxRed': 'Harte Obergrenze für bestätigungspflichtige rote Vorschläge. Leer bedeutet keine zusätzliche Grenze über die Regeln hinaus.',
  '#autoPlanAllowRed': 'Erlaubt eine vollständige Belegung mit einzeln zu bestätigenden roten Ausnahmen, falls keine vollständige Null-Rot-Lösung existiert.',
  '#autoPlanPerfection': 'Führt nach dem Aufbau die Ruin-and-Recreate-Suche und den abschließenden Optimalitätsnachweis aus. In v9 ist der Nachweis bei CP-SAT-OPTIMAL beweisbar.',
  '#autoPlanV85CleanProfile': 'Ein gekoppeltes Suchprofil verhindert widersprüchliche Tiefenparameter. Exhaustiv nutzt vier strikte Eskalationswellen und das größte lokale Neuplanungsbudget.',
  '#autoPlanV85Parallel': 'Mehr Stränge erhöhen die Chance auf eine bessere Endlösung, werden jedoch durch Prozessor, Gerätespeicher, Monatsgröße und UI-Reserve begrenzt.',
  '#autoPlanV85Diversity': 'Aktiviert unterschiedliche, reproduzierbare Suchbahnen statt mehrfach identischer Arbeit.',
  '#autoPlanV9SolverBackend': 'Welche Engine den Monat löst: Automatisch versucht CP-SAT (WebAssembly) und fällt bei Nichtverfügbarkeit auf die bewährte v8.5-Heuristik zurück. „CP-SAT exakt“ erzwingt den beweisbaren Pfad, „Heuristik“ umgeht WebAssembly vollständig.',
  '#autoPlanV9Exactness': 'Beweisbare Optimalität erzwingen. Bei OPTIMAL wird die untere Schranke angezeigt und der Plan als zertifiziert ausgewiesen. Abgeschaltet begnügt sich CP-SAT mit dem besten gefundenen Stand.',
  '#autoPlanV9TimeBudget': 'Zeitrahmen des CP-SAT-Laufs in Sekunden. Die lexikografischen Phasen teilen sich diesen Rahmen; bei 62 Feldern ist OPTIMAL typischerweise in unter einer Sekunde erreicht – der Rest ist Sicherheitspuffer.',
  '#autoPlanV9Workers': 'Parallele Such-Threads von CP-SAT. Mehr Threads beschleunigen schwierige Monate, benötigen aber Cross-Origin-Isolation (COOP/COEP) und freie Kerne. Automatisch wählt die Engine selbst.',
  '#autoPlanV9WarmStart': 'Warmstart-Hinweise: Die Heuristik liefert eine Startbelegung, die CP-SAT als Lösungshinweis prunt. Ohne Hinweis startet die exakte Suche ungebunden – bei dieser Problemgröße meist genauso schnell.',
  '#autoPlanV9Fairness': 'Fairness-Profil der exakten Zielfunktion. Leximin maximiert zuerst die am schwächsten gestellte Person (Maximin), danach die Nächstschwächere – das robusteste Gerechtigkeitsmaß gegen einzelne Ausreißer.',
  '#autoPlanV9Determinism': 'Deterministischer Modus: Alle Zufallsströme (CP-SAT-Seed, Heuristik-Seed) leiten sich aus Konfiguration und Monatszustand ab. Identische Eingaben ergeben identische Pläne.',
  '#autoPlanV9Infeasibility': 'Verhalten bei unzulässigem Modell: Ursachenanalyse findet die kleinste nachgewiesene Konfliktgruppe (MUS-artig). Mit Relaxierung werden Gruppen in fachlicher Reihenfolge aufgeweicht und die aufgegebenen Regeln im Ergebnis ausgewiesen.',
  '#autoPlanV9RepairOnEdit': 'Nach jeder manuellen Änderung am Monatsplan beim nächsten Lauf automatisch nur den betroffenen Bereich exakt reparieren lassen. Die Einstellung wird gespeichert und beim Start berücksichtigt.',
  '#autoPlanV9Explanation': 'Tiefe der Ergebnis-Erklärung: kurz, ausführlich mit Regel-Kennungen oder LLM-gestützt (optional über Cloudflare Workers AI).',
  '#autoPlanStartBtn': 'Startet die Optimierung mit den eingestellten Parametern. Bis zur ausdrücklichen Übernahme wird nichts geschrieben.',
  '#autoPlanApplyBtn': 'Prüft den Vorschlag erneut vollständig gegen alle Regeln und schreibt ihn dann in einem Zug in den Monatsplan.',
  '#autoPlanCancelBtn': 'Bricht den Lauf ab und schließt das Studio. Am Monatsplan wird nichts verändert.',
  '#autoPlanLimitReset': 'Setzt alle Zeilen auf die festgelegten Vorgaben zurück: die monatliche BD-Zahl je Person und die HG-Sperre für alle, die im Monat an keinem Tag HG-berechtigt sind.',
  '#autoPlanLimitClear': 'Entfernt sämtliche Laufgrenzen. Hinterlegte Personalmaxima und alle fachlichen Regeln gelten unabhängig davon weiter.',
  '#autoPlanV9FairnessWeight': 'Gewichtung der exakten Fairness (Maximin): höhere Werte lassen die Suche stärker zugunsten der am schwächsten gestellten Person ausgleichen, auch wenn andere weiche Ziele darunter leiden.',
  '#autoPlanV9ProtectBaseline': 'Stabilität: Der exakte Kern behält bestehende Belegungen bei und rührt manuelle Edits nur an, wenn es die fachlichen Ziele nennenswert verbessert. So bleiben manuelle Änderungen beim Re-Planen erhalten.',
  '#autoPlanV9PerturbationWeight': 'Gewichtung der Minimal-Perturbation: wie stark Abweichungen vom heuristischen Vorschlag (der manuelle Edits ehrt) vermieden werden sollen.',
  '#autoPlanV9RelaxationDepth': 'Tiefe der Konfliktaufweichung bei unzulässigem Modell: „tief“ entspannt konsequent bis zur ersten zulässigen Lösung, „flach“ nur die nötigsten Gruppen.',
  '#autoPlanV9MusAutoRelax': 'Bei unzulässigem Modell nicht nur die kleinste Konfliktursache (MUS) benennen, sondern die markierten Gruppen sofort relaxieren und einen planbaren Vorschlag liefern.'
});

const CONSOLE_TOOLTIPS = Object.freeze({
  '.auto-plan-visual': 'Lebende Orbit-Ansicht der Suche: innen die BD-Felder, außen die HG-Felder. Jeder Punkt ist ein Dienst; Verbindungen zeigen Kopplungen eines Tages.',
  '#autoPlanProgressMeter': 'Gesamtfortschritt des Laufs über alle Phasen – von der Analyse bis zur Zertifizierung.',
  '.auto-plan-truth-strip': 'Tatsächlich beobachtete Kennzahlen des Laufs – keine Schätzwerte.',
  '#autoPlanPhaseList': 'Die Phasen des Algorithmus laufen nur vorwärts; parallele Stränge melden in die höchste erreichte Stufe.',
  '.auto-plan-log': 'Algorithmus-Kommentar: Jede Zeile entsteht aus einem echten Fortschrittsereignis. Der Bereich scrollt intern, sobald er gefüllt ist.',
  '.auto-plan-live-metrics': 'Live-Kennzahlen des zuletzt bearbeiteten Zustands: Variantenbreite, Kandidaten je Feld, geprüfte Zustände, Sackgassen, übernommene Verbesserungen und offene Felder.'
});

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* optional */ }
}

function applyToState() {
  const saved = readSettings();
  const target = (state.settings ||= {}).autoPlan ||= {};
  Object.assign(target, {
    solverBackend: saved.solverBackend || target.solverBackend || 'auto',
    cpSatTimeBudgetSeconds: Number.isFinite(Number(saved.cpSatTimeBudgetSeconds)) ? Number(saved.cpSatTimeBudgetSeconds) : (target.cpSatTimeBudgetSeconds ?? 10),
    cpSatWorkers: Number.isInteger(Number(saved.cpSatWorkers)) ? Number(saved.cpSatWorkers) : null,
    cpSatWarmStart: saved.cpSatWarmStart || target.cpSatWarmStart || 'heuristic',
    fairnessProfile: saved.fairnessProfile || target.fairnessProfile || 'leximin',
    deterministic: saved.deterministic !== false,
    infeasibilityMode: saved.infeasibilityMode || target.infeasibilityMode || 'mus',
    repairOnEdit: saved.repairOnEdit !== false,
    explanationDepth: saved.explanationDepth || target.explanationDepth || 'detailed',
    cpSatFairnessWeight: Number.isFinite(Number(saved.cpSatFairnessWeight)) ? Number(saved.cpSatFairnessWeight) : (target.cpSatFairnessWeight ?? 90),
    protectBaseline: saved.protectBaseline !== false,
    cpSatPerturbationWeight: Number.isFinite(Number(saved.cpSatPerturbationWeight)) ? Number(saved.cpSatPerturbationWeight) : (target.cpSatPerturbationWeight ?? 45),
    relaxationDepth: saved.relaxationDepth || target.relaxationDepth || 'deep',
    musAutoRelax: saved.musAutoRelax === true
  });
}

function byId(id) { return document.getElementById(id); }

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v9-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9.css?v=${RELEASE}`;
  link.dataset.autoPlanV9Style = 'true';
  document.head.append(link);
}

/**
 * Baut die v9-Regler in das Parameter-Raster ein.
 */
function installV9Controls(dialog) {
  if (dialog.querySelector('#autoPlanV9SolverBackend')) return;
  const grid = dialog.querySelector('.auto-plan-field-grid');
  if (!grid) return;

  const markup = `
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Solver-Backend</span>
      <select id="autoPlanV9SolverBackend">
        <option value="auto">Automatisch (empfohlen)</option>
        <option value="cp-sat-exact">CP-SAT exakt</option>
        <option value="cp-sat-lns">CP-SAT + LNS</option>
        <option value="heuristic-alns">Heuristik v8.5</option>
      </select>
      <small>WebAssembly-CP-SAT mit Fallback auf die bewährte Heuristik</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Beweisbare Optimalität</span>
      <select id="autoPlanV9Exactness">
        <option value="strict">Erzwingen (OPTIMAL)</option>
        <option value="any">Bester Stand genügt</option>
      </select>
      <small>OPTIMAL liefert eine echte untere Schranke</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>CP-SAT-Zeitbudget</span>
      <div class="auto-plan-range">
        <input id="autoPlanV9TimeBudget" type="range" min="1" max="60" step="1" value="10">
        <output id="autoPlanV9TimeBudgetOut">10 s</output>
      </div>
      <small>Lexikografische Phasen teilen sich diesen Rahmen</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>CP-SAT-Worker</span>
      <select id="autoPlanV9Workers">
        <option value="">Automatisch</option>
        ${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}
      </select>
      <small>Parallele Such-Threads; braucht COOP/COEP</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Warmstart</span>
      <select id="autoPlanV9WarmStart">
        <option value="heuristic">Heuristik-Hinweis</option>
        <option value="none">Ohne Hinweis</option>
      </select>
      <small>Startbelegung der Heuristik prunt die exakte Suche</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Fairness-Profil</span>
      <select id="autoPlanV9Fairness">
        <option value="leximin">Leximin (Maximin zuerst)</option>
        <option value="spread">Spannweite</option>
        <option value="variance">Varianz</option>
        <option value="owa">OWA</option>
      </select>
      <small>Robustes Gerechtigkeitsmaß gegen einzelne Ausreißer</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Determinismus</span>
      <select id="autoPlanV9Determinism">
        <option value="deterministic">Deterministisch</option>
        <option value="variable">Variabel</option>
      </select>
      <small>Identische Eingaben ergeben identische Pläne</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Bei Unzulässigkeit</span>
      <select id="autoPlanV9Infeasibility">
        <option value="mus">Ursachenanalyse</option>
        <option value="relax">Ursachen + Relaxierung</option>
        <option value="report">Nur melden</option>
      </select>
      <small>Kleinste nachgewiesene Konfliktgruppe wird benannt</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Reparatur nach Änderung</span>
      <select id="autoPlanV9RepairOnEdit">
        <option value="on">Aktiv</option>
        <option value="off">Inaktiv</option>
      </select>
      <small>Nur den betroffenen Bereich exakt neu lösen</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Erklärungstiefe</span>
      <select id="autoPlanV9Explanation">
        <option value="short">Kurz</option>
        <option value="detailed" selected>Ausführlich</option>
        <option value="llm">LLM-gestützt</option>
      </select>
      <small>Regel-Kennungen bzw. optionale KI-Begründung</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Fairness-Gewicht</span>
      <div class="auto-plan-range">
        <input id="autoPlanV9FairnessWeight" type="range" min="1" max="100" step="1" value="90">
        <output id="autoPlanV9FairnessWeightOut">90</output>
      </div>
      <small>Maximin-Ausgleich der am schwächsten gestellten Person</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Stabilität (Änderungen minimieren)</span>
      <select id="autoPlanV9ProtectBaseline">
        <option value="on">Aktiv (manual edits erhalten)</option>
        <option value="off">Aus (freie Neuplanung)</option>
      </select>
      <small>Re-Planen rührt bestehende Belegungen kaum an</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Minimal-Perturbation-Gewicht</span>
      <div class="auto-plan-range">
        <input id="autoPlanV9PerturbationWeight" type="range" min="0" max="100" step="1" value="45">
        <output id="autoPlanV9PerturbationWeightOut">45</output>
      </div>
      <small>Abweichung vom heuristischen Vorschlag vermeiden</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>Relaxations­tiefe</span>
      <select id="autoPlanV9RelaxationDepth">
        <option value="deep">Tief (konsequent)</option>
        <option value="shallow">Flach (nur nötigstes)</option>
      </select>
      <small>Konfliktaufweichung bei Unzulässigkeit</small>
    </label>
    <label class="auto-plan-field auto-plan-field--v9">
      <span>MUS automatisch relaxieren</span>
      <select id="autoPlanV9MusAutoRelax">
        <option value="off">Nur benennen</option>
        <option value="on">Relaxieren + Vorschlag</option>
      </select>
      <small>Kleinste Konfliktursache sofort aufweichen</small>
    </label>`;

  const holder = document.createElement('template');
  holder.innerHTML = markup;
  grid.prepend(holder.content);

  const saved = readSettings();
  const target = state.settings?.autoPlan || {};
  const setSelect = (id, value) => {
    const field = byId(id);
    if (field && value) field.value = value;
  };
  setSelect('autoPlanV9SolverBackend', saved.solverBackend || target.solverBackend || 'auto');
  setSelect('autoPlanV9Exactness', saved.exactness || 'strict');
  setSelect('autoPlanV9Workers', saved.cpSatWorkers ?? target.cpSatWorkers ?? '');
  setSelect('autoPlanV9WarmStart', saved.cpSatWarmStart || target.cpSatWarmStart || 'heuristic');
  setSelect('autoPlanV9Fairness', saved.fairnessProfile || target.fairnessProfile || 'leximin');
  setSelect('autoPlanV9Determinism', saved.deterministic === false ? 'variable' : 'deterministic');
  setSelect('autoPlanV9Infeasibility', saved.infeasibilityMode || target.infeasibilityMode || 'mus');
  setSelect('autoPlanV9RepairOnEdit', saved.repairOnEdit === false ? 'off' : 'on');
  setSelect('autoPlanV9Explanation', saved.explanationDepth || target.explanationDepth || 'detailed');
  const fairnessWeight = Number(saved.cpSatFairnessWeight ?? target.cpSatFairnessWeight ?? 90);
  byId('autoPlanV9FairnessWeight').value = String(fairnessWeight);
  byId('autoPlanV9FairnessWeightOut').textContent = String(fairnessWeight);
  const perturbationWeight = Number(saved.cpSatPerturbationWeight ?? target.cpSatPerturbationWeight ?? 45);
  byId('autoPlanV9PerturbationWeight').value = String(perturbationWeight);
  byId('autoPlanV9PerturbationWeightOut').textContent = String(perturbationWeight);
  setSelect('autoPlanV9ProtectBaseline', saved.protectBaseline === false ? 'off' : 'on');
  setSelect('autoPlanV9RelaxationDepth', saved.relaxationDepth ?? target.relaxationDepth ?? 'deep');
  setSelect('autoPlanV9MusAutoRelax', saved.musAutoRelax === true ? 'on' : 'off');
  const budget = Number(saved.cpSatTimeBudgetSeconds ?? target.cpSatTimeBudgetSeconds ?? 10);
  byId('autoPlanV9TimeBudget').value = String(budget);
  byId('autoPlanV9TimeBudgetOut').textContent = `${budget} s`;

  const persist = () => {
    const value = {
      solverBackend: byId('autoPlanV9SolverBackend').value,
      exactness: byId('autoPlanV9Exactness').value,
      cpSatTimeBudgetSeconds: Number(byId('autoPlanV9TimeBudget').value) || 10,
      cpSatWorkers: byId('autoPlanV9Workers').value === '' ? null : Number(byId('autoPlanV9Workers').value),
      cpSatWarmStart: byId('autoPlanV9WarmStart').value,
      fairnessProfile: byId('autoPlanV9Fairness').value,
      deterministic: byId('autoPlanV9Determinism').value === 'deterministic',
      infeasibilityMode: byId('autoPlanV9Infeasibility').value,
      repairOnEdit: byId('autoPlanV9RepairOnEdit').value === 'on',
      explanationDepth: byId('autoPlanV9Explanation').value,
      cpSatFairnessWeight: Number(byId('autoPlanV9FairnessWeight').value) || 90,
      protectBaseline: byId('autoPlanV9ProtectBaseline').value === 'on',
      cpSatPerturbationWeight: Number(byId('autoPlanV9PerturbationWeight').value) || 0,
      relaxationDepth: byId('autoPlanV9RelaxationDepth').value,
      musAutoRelax: byId('autoPlanV9MusAutoRelax').value === 'on'
    };
    writeSettings(value);
    applyToState();
  };

  dialog.querySelector('.auto-plan-field-grid').addEventListener('change', event => {
    if (event.target.id?.startsWith('autoPlanV9')) persist();
  });
  byId('autoPlanV9TimeBudget').addEventListener('input', () => {
    byId('autoPlanV9TimeBudgetOut').textContent = `${byId('autoPlanV9TimeBudget').value} s`;
  });
  byId('autoPlanV9FairnessWeight').addEventListener('input', () => {
    byId('autoPlanV9FairnessWeightOut').textContent = byId('autoPlanV9FairnessWeight').value;
  });
  byId('autoPlanV9PerturbationWeight').addEventListener('input', () => {
    byId('autoPlanV9PerturbationWeightOut').textContent = byId('autoPlanV9PerturbationWeight').value;
  });

  applyToState();

  // Tooltips für alle v9-Regler.
  for (const id of [
    'autoPlanV9SolverBackend', 'autoPlanV9Exactness', 'autoPlanV9TimeBudget',
    'autoPlanV9Workers', 'autoPlanV9WarmStart', 'autoPlanV9Fairness',
    'autoPlanV9Determinism',     'autoPlanV9Infeasibility', 'autoPlanV9RepairOnEdit',
    'autoPlanV9Explanation', 'autoPlanV9FairnessWeight', 'autoPlanV9ProtectBaseline',
    'autoPlanV9PerturbationWeight', 'autoPlanV9RelaxationDepth', 'autoPlanV9MusAutoRelax'
  ]) {
    setRichTooltip(byId(id), TOOLTIP_CATALOG[`#${id}`]);
  }
}

/**
 * Tooltips für alle Katalog-Elemente; CONSOLE_TOOLTIPS und die festen
 * Feld-Tooltips werden pro Dialog-Einrichtung ergänzt.
 */
function installCatalogTooltips(dialog) {
  for (const [selector, text] of Object.entries(TOOLTIP_CATALOG)) {
    const element = dialog.querySelector(selector);
    if (element) setRichTooltip(element, text);
  }
  for (const [selector, text] of Object.entries(CONSOLE_TOOLTIPS)) {
    const element = dialog.querySelector(selector);
    if (element) setRichTooltip(element, text);
  }
}

/**
 * Tooltips für dynamisch erzeugte Ergebnis-Elemente.
 */
function attachResultTooltips(dialog) {
  const map = [
    ['.auto-plan-scorecard', index => {
      const labels = [
        'Regel-Audit: Anzahl roter bzw. gesperrter Vorschläge der vollständigen Belegung.',
        'Fairness: 0–100 % aus Soll-Abweichung, Lastvarianz und Wochenendverteilung.',
        'Erfüllte von insgesamt möglichen Dienstwünschen im Monat.',
        'Zahl der neu vorgeschlagenen Belegungen gegenüber dem Ausgangsmonat.',
        'Gelbe und orange Regelhinweise der Vorschläge.',
        'Optimalität: „zertifiziert“ bedeutet beweisbar (CP-SAT-OPTIMAL) oder vollständig lokal nachgewiesen.',
        'Gewinn durch die Perfektionsphase bei gelben Hinweisen.'
      ];
      return labels[index] || '';
    }],
    ['.auto-plan-search-metrics > div', (element, index) => {
      const labels = [
        'Aufbauversuche: Suchläufe bis zur ersten gültigen Belegung.', 'Varianten geprüft: vollständig bewertete Zustände.',
        'Nachfolger: erzeugte Belegungsvarianten.', 'Sackgassen: als unzulässig erkannte Zustände.',
        'Exakte Restknoten: bewiesene Teillösungen der letzten Felder.', 'Ledger-Treffer: aus dem Zählwerk beantwortete Bewertungen.',
        'Worker-Portfolio: Aufbau-/Perfektionsstränge und UI-Reserve.', 'Tauschrunden: Durchläufe der iterativen Reparatur.',
        'Nachbarschaften: geprüfte Tauschpaare.', 'Lokale Neuplanungen: Teil-Neulösungen auffälliger Tage.',
        'Perfektionsrunden: Ruin-and-Recreate-Zyklen.', 'Züge geprüft: bewertete Änderungszüge der Perfektion.',
        'Vollbewertungen: komplette Zielbewertungen im Optimierer.', 'Angenommen: übernommene Züge.',
        'Neustarts: Luby-gesteuerte Neustarts bei Stagnation.', 'Verbesserungen: übernommene echte Zugewinne.',
        'Lernende Operatoren: adaptiv gewichtete Zerstörungs-/Reparaturwahl.', 'Zertifizierungszüge: im Optimalitätsnachweis geprüfte Züge.',
        'Optimalitätsnachweis: bestanden, nicht ausgeführt oder offen.', 'Laufzeit der gesamten Berechnung.'
      ];
      return labels[index] || '';
    }],
    ['.auto-plan-red-item', () => 'Einzelne rote Regelabweichung: Gründe, Bestätigung und Sprung in die Tabelle.'],
    ['#autoPlanLoadTable', () => 'Verteilungsbild je Person: BD, HG, Gesamt, Wochenendäquivalent und BD-Soll vorher → nachher.'],
    ['#autoPlanProposalTable', () => 'Monatsvorschlag in der Leserichtung der Diensttabelle; die Prüfspalte zeigt die Regelgründe je Tag.'],
    ['.auto-plan-run-config', () => 'Die effektiven Laufparameter dieser Berechnung.'],
    ['.auto-plan-confirm-note', () => 'Status der Übernahme: Erst der Übernahmebutton schreibt den Plan.'],
    ['#autoPlanValidation', () => 'Startprüfung der Parameter: Harte Grenzen, Fixpunkte und Suchprofil müssen konsistent sein.']
  ];
  for (const [selector, labelFor] of map) {
    const elements = dialog.querySelectorAll(selector);
    elements.forEach((element, index) => setRichTooltip(element, labelFor(element, index)));
  }
}

/**
 * v9-Exaktheitsnachweis-Panel im Ergebnis.
 */
function installV9ResultPanel(dialog) {
  if (dialog.querySelector('#autoPlanV9Result')) return;
  const anchor = dialog.querySelector('#autoPlanV85Result') || dialog.querySelector('.auto-plan-card.auto-plan-panel');
  if (!anchor) return;
  const panel = document.createElement('section');
  panel.id = 'autoPlanV9Result';
  panel.className = 'auto-plan-card auto-plan-panel auto-plan-v9-result';
  panel.hidden = true;
  anchor.after(panel);
}

function renderV9Result(dialog, result) {
  const panel = dialog.querySelector('#autoPlanV9Result');
  if (!panel) return;
  const cpSat = result?.metrics?.cpSat;
  const mus = result?.metrics?.mus;
  if (!cpSat) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const status = String(cpSat.status || 'UNAVAILABLE');
  const tone = status === 'OPTIMAL' ? 'optimal'
    : status === 'FEASIBLE' || status === 'FEASIBLE_RELAXED' ? 'feasible'
      : status === 'INFEASIBLE' ? 'infeasible'
        : 'unavailable';
  const bound = Number.isFinite(Number(cpSat.bestBound)) ? Number(cpSat.bestBound).toLocaleString('de-DE') : '—';
  const wallTime = Number.isFinite(Number(cpSat.wallTimeMs))
    ? `${(Number(cpSat.wallTimeMs) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
    : '—';
  const model = cpSat.model || {};
  const trace = Array.isArray(cpSat.trace) && cpSat.trace.length
    ? `<ol class="auto-plan-v9-trace">${cpSat.trace.map(entry =>
        `<li><span>${entry.componentId}</span><b>${entry.status}</b><small>${Number(entry.wallTimeMs || 0).toLocaleString('de-DE')} ms</small></li>`).join('')}</ol>`
    : '';
  const musHtml = mus && mus.groups?.length
    ? `<div class="auto-plan-v9-mus"><span>Konfliktursache</span><ul>${mus.groups.map(group => `<li>${group.label}</li>`).join('')}</ul><small>${mus.detail || ''}</small></div>`
    : mus && mus.infeasible
      ? `<div class="auto-plan-v9-mus"><span>Konfliktursache</span><p>${mus.detail || ''}</p></div>`
      : '';
  const relaxedHtml = Array.isArray(cpSat.relaxedGroups) && cpSat.relaxedGroups.length
    ? `<div class="auto-plan-v9-relaxed"><span>Relaxierte Gruppen</span><ul>${cpSat.relaxedGroups.map(group => `<li>${group}</li>`).join('')}</ul></div>`
    : '';
  panel.innerHTML = `<div class="auto-plan-section-title"><span>Exaktheitsnachweis · Engine v9</span><b class="auto-plan-v9-status ${tone}">${status}</b></div>
    <div class="auto-plan-v9-result-grid">
      <div><span>Untere Schranke</span><b>${bound}</b></div>
      <div><span>CP-SAT-Laufzeit</span><b>${wallTime}</b></div>
      <div><span>Modell</span><b>${model.variables ?? '—'} Variablen · ${model.hardConstraints ?? '—'} Constraints</b></div>
      <div><span>Bindung</span><b>${cpSat.loadedFrom ? `${cpSat.loadedFrom.id} (${cpSat.loadedFrom.source})` : '—'}</b></div>
    </div>
    ${trace}
    ${musHtml}
    ${relaxedHtml}`;
  setRichTooltip(panel.querySelector('.auto-plan-v9-status'), status === 'OPTIMAL'
    ? 'Beweisbar optimal: Die untere Schranke entspricht dem Zielwert. Der Plan ist als nicht weiter verbesserbar zertifiziert.'
    : status === 'FEASIBLE'
      ? 'Zulässig, aber nicht beweisbar optimal (Zeitlimit oder Suchabschaltung).'
      : status === 'FEASIBLE_RELAXED'
        ? 'Zulässig nach Aufweichen von Constraint-Gruppen; die aufgegebenen Regeln stehen ausgewiesen darunter.'
        : status === 'INFEASIBLE'
          ? 'Unzulässig: Die Ursachenanalyse benennt die kleinste nachgewiesene Konfliktgruppe.'
          : 'CP-SAT war nicht nutzbar (kein WebAssembly/COOP-COEP) – die Heuristik hat den Plan geliefert.');
  attachResultTooltips(dialog);
}

/**
 * v9-Statuszeile in der Laufansicht (CP-SAT-Phasen).
 */
function installV9RunStrip(dialog) {
  if (dialog.querySelector('#autoPlanV9RunStrip')) return;
  const consoleHost = dialog.querySelector('.auto-plan-console');
  if (!consoleHost) return;
  const strip = document.createElement('div');
  strip.id = 'autoPlanV9RunStrip';
  strip.className = 'auto-plan-v9-run-strip';
  strip.hidden = true;
  strip.innerHTML = '<span>Exakte Suche</span><b id="autoPlanV9RunStripStatus">bereit</b><small id="autoPlanV9RunStripDetail"></small>';
  consoleHost.prepend(strip);
  setRichTooltip(strip, 'Live-Status der exakten CP-SAT-Phasen: welche Zielkomponente gerade minimiert wird und welcher Status erreicht wurde.');
}

function updateV9RunStrip(dialog, update) {
  const strip = dialog.querySelector('#autoPlanV9RunStrip');
  if (!strip) return;
  if (update?.phase === 'exact' || update?.stage === 'cp-sat' || update?.cpSatPhase) {
    strip.hidden = false;
    byId('autoPlanV9RunStripStatus').textContent = update.cpSatPhase
      ? `Phase ${update.cpSatPhaseIndex + 1} · ${update.cpSatPhase}`
      : update.message || 'läuft';
    byId('autoPlanV9RunStripDetail').textContent = update.message || '';
  } else if (update?.phase === 'complete' || update?.phase === 'blocked') {
    strip.hidden = true;
  }
}

/**
 * v8.5-Phasentheater auf die acht v9-Stufen heben.
 *
 * Das v8.5-Theater kannte nur sechs Stufen. v9 ersetzt die Karten vollständig
 * durch den achtstufigen Phasenvertrag (analysis, model, exact, rescue,
 * repair, perfect, audit, certify), damit keine Stufe abgeschnitten bleibt
 * und die exakten Phasen sichtbar durchlaufen.
 */
function upgradeTheatre(dialog) {
  const theatre = dialog.querySelector('#autoPlanV85Theatre');
  const ol = theatre?.querySelector('ol');
  if (ol) {
    ol.innerHTML = AUTO_PLAN_STAGES.map((stage, index) =>
      `<li data-index="${index}" data-stage="${stage.id}"><i></i><div><b>${stage.title}</b><small>${stage.detail}</small></div><span>offen</span></li>`).join('');
  }
  // Die Stufenliste im Kopfband (Ribbon): Flexibler Selektor, der jedes Ribbon-ID
  // (v8, v8.5) abdeckt, damit die 8 v9-Stufen sichtbar werden – egal welches Ribbon
  // das Dialog trägt.
  const ribbonStages = dialog.querySelector('#autoPlanV8Ribbon .auto-plan-v8-stages, #autoPlanV85Ribbon .auto-plan-v8-stages, .auto-plan-v85-ribbon .auto-plan-v8-stages');
  if (ribbonStages) {
    ribbonStages.innerHTML = AUTO_PLAN_STAGES.map(stage =>
      `<li data-stage="${stage.id}"><b>${stage.title}</b><small>${stage.detail}</small></li>`).join('');
  }
}

function upgradeIdentity(dialog) {
  dialog.dataset.algorithmRevision = '9';
  dialog.dataset.engineRevision = '9';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, #autoPlanV75Ribbon, #autoPlanV7Ribbon, .auto-plan-v85-ribbon');
  if (ribbon) {
    ribbon.classList.add('auto-plan-v9-ribbon');
    const title = ribbon.querySelector('b');
    const detail = ribbon.querySelector('small');
    const badge = ribbon.querySelector(':scope > strong');
    if (title) title.textContent = 'Hybrid Exact Observatory · v9';
    if (detail) detail.textContent = 'CP-SAT-Kern mit lexikografischer Leximin-Zielfunktion · Warmstart-Heuristik · Regelengine als Schlussaudit · MUS-artige Konfliktanalyse';
    if (badge) badge.textContent = 'ENGINE v9';
  }
  const engine = dialog.querySelector('.auto-plan-engine-badge span');
  if (engine) engine.textContent = 'Constraint Engine v9';
  const guardrail = dialog.querySelector('.auto-plan-zero-red-guardrail header > span');
  if (guardrail) guardrail.textContent = 'Null-Rot-Guardrail · Algorithmus v9';
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.v9Enhanced === 'true') return;
  dialog.dataset.v9Enhanced = 'true';
  dialog.dataset.v9Layout = '1';
  upgradeIdentity(dialog);
  installV9Controls(dialog);
  installCatalogTooltips(dialog);
  installV9RunStrip(dialog);
  installV9ResultPanel(dialog);
  upgradeTheatre(dialog);

  document.getElementById('autoPlanStartBtn')?.addEventListener('click', () => {
    applyToState();
    dialog.querySelector('#autoPlanV9RunStrip')?.setAttribute('hidden', '');
    byId('autoPlanV9RunStripStatus').textContent = 'bereit';
  }, { capture: true });

  new MutationObserver(() => {
    if (dialog.classList.contains('show-result')) attachResultTooltips(dialog);
  }).observe(dialog, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('autoplanprogress', event => updateV9RunStrip(dialog, event.detail || {}));
  window.addEventListener('autoplanresult', event => {
    const result = event.detail || null;
    renderV9Result(dialog, result);
    if (result?.metrics?.engine?.startsWith('v9') && result?.metrics?.cpSatUsed === true && result.complete) {
      const title = byId('autoPlanResultTitle');
      if (title) title.textContent = result.certified
        ? 'Beweisbar optimaler Vorschlag bereit'
        : 'CP-SAT-Vorschlag bereit (zeitbegrenzt)';
    }
    attachResultTooltips(dialog);
  });
}

function initialize() {
  addStylesheet();
  applyToState();
  const install = event => {
    const dialog = event?.detail?.dialog || document.getElementById('autoPlanDialog');
    if (!dialog) return false;
    enhance(dialog);
    return true;
  };
  if (!install()) window.addEventListener('autoplanstudioready', install, { once: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}

export { isCpSatReady };
export const AUTO_PLAN_STUDIO_V9_RELEASE = RELEASE;
