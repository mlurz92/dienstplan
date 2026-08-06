/**
 * Auto-Plan Studio v10.5.
 *
 * Diese Schicht ordnet die über mehrere Fassungen gewachsene Konfiguration neu
 * und ergänzt die Regler, die die Engine v10 tatsächlich liest.
 *
 * DREI ENTSCHEIDUNGEN
 *
 * 1. **Gruppen statt Spalten.** Die Felder wurden bisher in ein Raster gelegt
 *    und dort belassen, wo die jeweilige Fassung sie eingefügt hatte. Bei
 *    schmalem Fenster ragten Karten aus dem Dialog — der Grund für den bisher
 *    fehlschlagenden Layouttest. v10.5 sortiert alle Felder unabhängig von
 *    ihrer Herkunft in aufklappbare Sachgruppen. Was gerade nicht gebraucht
 *    wird, nimmt keinen Platz weg, und nichts muss mehr abgeschnitten werden.
 *
 * 2. **Kein Regler ohne Wirkung.** Die Gewichtsregler der Vorgängerfassung
 *    veränderten das Ergebnis nachweislich nicht, weil je Stufe genau eine
 *    Zielkomponente mit einheitlichem Gewicht minimiert wurde. Sie entfallen.
 *    An ihre Stelle tritt die Stufenreihenfolge — die ehrliche Form der
 *    Gewichtung, weil sie genau das ausdrückt, was die Engine wirklich tut.
 *
 * 3. **Kein Feld ohne Erklärung.** Jedes Bedienelement bekommt einen
 *    erklärenden Tooltip. Wo eine Fassung ihn vergessen hat, wird er aus
 *    Beschriftung und Beschreibung erzeugt, statt das Feld unerklärt zu lassen.
 */

import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260806.1';
import { state } from './state.js?v=20260806.1';
import { OBJECTIVE_COMPONENTS } from './auto-planner.js?v=20260806.1';

const RELEASE = '20260806.1';
const STORAGE_KEY = 'dienstplanrad:autoplan-v10-studio';
const VISUAL_KEY = 'dienstplanrad:autoplan-visual';

const byId = id => document.getElementById(id);

/**
 * Sachgruppen der Konfiguration. Die Reihenfolge ist die Lesereihenfolge:
 * erst wofür geplant wird, dann wie exakt, dann womit, dann was erlaubt ist.
 *
 * Alle Sachgruppen sind voreingestellt offen. Das Einklappen ist ein Angebot an
 * die Bedienung, keine Voreinstellung: Ein Regler, den man erst suchen muss,
 * ist für Tastatur und Vorlesesoftware nicht erreichbar und für alle anderen
 * unauffindbar. Die zuletzt gewählten Zustände werden lokal gemerkt.
 */
const GROUPS = Object.freeze([
  {
    id: 'goals',
    title: 'Ziele und ihre Reihenfolge',
    hint: 'Was der Plan erreichen soll — und in welcher Rangfolge. Die Engine optimiert Stufe für Stufe und schreibt jeden erreichten Wert fest, bevor die nächste Stufe beginnt.',
    open: true,
    fields: ['autoPlanOptimizationFocus', 'autoPlanV10StageOrder', 'autoPlanV10LeximinDepth', 'autoPlanV10HgLoad', 'autoPlanV10CarryWindow', 'autoPlanV10CarryWeight', 'autoPlanV10Stability']
  },
  {
    id: 'exact',
    title: 'Exakte Suche',
    hint: 'Der Solver läuft als WebAssembly im Browser. Er liefert nicht nur einen Plan, sondern bei erreichter unterer Schranke den Nachweis, dass es keinen besseren gibt.',
    open: true,
    fields: ['autoPlanV9SolverBackend', 'autoPlanV9TimeBudget', 'autoPlanV9WarmStart', 'autoPlanV10Conflict', 'autoPlanV9Determinism']
  },
  {
    id: 'heuristic',
    title: 'Heuristik, Reparatur und Perfektion',
    hint: 'Die bewährte Suche bleibt vollwertig: Sie liefert den Warmstart, sie trägt allein, wenn kein WebAssembly verfügbar ist, und sie gewinnt, wenn ihr Ergebnis besser ist.',
    open: true,
    fields: ['autoPlanSearchIntensity', 'autoPlanTimeBudget', 'autoPlanRepairIterations', 'autoPlanLocalBudget', 'autoPlanLateAcceptance', 'autoPlanPerfection', 'autoPlanV85Wave', 'autoPlanV85Parallel', 'autoPlanV85Diversity', 'autoPlanV85CleanProfile']
  },
  {
    id: 'permissions',
    title: 'Grenzen und Freigaben',
    hint: 'Was der Vorschlag enthalten darf. Graue und technisch unmögliche Besetzungen sind in jeder Stufe ausgeschlossen und stehen hier nicht zur Wahl.',
    open: true,
    fields: ['autoPlanAllowRed', 'autoPlanMaxRed', 'autoPlanV9ProtectBaseline', 'autoPlanV9RepairOnEdit', 'autoPlanV9Explanation', 'autoPlanV9RelaxationDepth', 'autoPlanV9Exactness']
  },
  {
    id: 'view',
    title: 'Darstellung des Laufs',
    hint: 'Wie die laufende Suche gezeigt wird. Die Darstellung kostet keine Rechenzeit der Suche; sie liest nur mit.',
    // Offen wie alle übrigen Gruppen. Zugeklappt war die Wahl der Laufansicht
    // faktisch verschwunden: Eine Einstellung, die
    // man erst aufklappen muss, um zu erfahren, dass es sie gibt, existiert für
    // die Bedienung nicht.
    open: true,
    fields: ['autoPlanV10VisualMode']
  }
]);

/** Erklärungen für jedes Bedienelement — auch für die geerbten. */
const TOOLTIPS = Object.freeze({
  '#autoPlanOptimizationFocus': 'Setzt die Voreinstellung der Stufenreihenfolge. Harte Regeln, vollständige Besetzung und rote Bewertungen haben immer Vorrang; der Schwerpunkt ordnet nur, was danach kommt.',
  '#autoPlanV10StageOrder': 'Die lexikografische Rangfolge der Ziele. Die oberste Stufe wird zuerst exakt minimiert, ihr Wert festgeschrieben, dann folgt die nächste. Eine höhere Stufe kann durch keine spätere verschlechtert werden — deshalb ersetzt diese Liste jede Gewichtung.',
  '#autoPlanV10LeximinDepth': 'Wie viele Ränge des sortierten Lastvektors exakt festgezurrt werden. Rang eins senkt die Höchstlast, jeder weitere die nächstniedrigere Stufe. Mehr Ränge bedeuten gleichmäßigere Verteilung und längere Rechenzeit.',
  '#autoPlanV10HgLoad': 'Wie stark ein Hintergrunddienst gegenüber einem Bereitschaftsdienst als Belastung zählt. Bei 60 Prozent entsprechen fünf HG rund drei BD.',
  '#autoPlanV10CarryWindow': 'Wie viele abgeschlossene Monate in die Fairness einfließen. Null plant jeden Monat für sich — gerecht innerhalb des Monats, ungerecht über das Jahr.',
  '#autoPlanV10CarryWeight': 'Wie stark ein Vorsprung aus den Vormonaten den Startwert anhebt. Wer zuletzt über dem Mittel lag, startet erhöht und wird von der Lastminimierung entlastet.',
  '#autoPlanV10Stability': 'Wie stark der Vorschlag am Ausgangsplan festhält. „Bei Gleichstand“ ändert nur, was die Qualität verbessert; „streng“ stellt Stabilität über alle weichen Ziele.',
  '#autoPlanV10Conflict': 'Verhalten bei unlösbarem Monat. Die Korrekturmengen-Diagnose sagt in einem einzigen Lauf, welche Regelgruppen aufgegeben werden müssten, und liefert den zugehörigen Plan mit.',
  '#autoPlanV10VisualMode': 'Vier Blicke auf denselben Lauf. Kristallisation zeigt den Zusammenfall des Suchraums, die Annäherung von Zielwert und unterer Schranke sowie die Lastverteilung. Die Weberei zeigt den entstehenden Plan als Gewebe aus Personen und Tagen. Die Kaskade zeigt die lexikografische Rangfolge als Becken, deren Ungewissheitsband sich bis zum Beweis schließt. Orbit ist die frühere Ringdarstellung.',
  '#autoPlanV9SolverBackend': 'Automatisch versucht die exakte Suche und fällt bei fehlendem WebAssembly vollständig auf die Heuristik zurück. „Nur Heuristik“ erzwingt den Rückfallweg, etwa zum Vergleich.',
  '#autoPlanV9TimeBudget': 'Gesamtbudget der exakten Kaskade, anteilig auf die Stufen verteilt. Bei rund sechzig offenen Feldern ist jede Stufe meist in Millisekunden beweisbar optimal.',
  '#autoPlanV9WarmStart': 'Übergibt die Heuristik-Lösung als Startpunkt. Der Solver darf davon abweichen — ein Hinweis beschränkt nichts, er spart nur Suchzeit.',
  '#autoPlanV9Determinism': 'Leitet alle Zufallsströme aus Konfiguration und Monatszustand ab. Reproduzierbar ist ein Lauf, solange jede Stufe innerhalb ihres Budgets den Optimalitätsnachweis erreicht; bricht eine Stufe am Zeitlimit ab, hängt ihr Ergebnis an der Maschine.',
  '#autoPlanV9ProtectBaseline': 'Schützt bestehende Einteilungen als unveränderliche Fixpunkte. Auto-Plan verändert ausschließlich zuvor leere BD- und HG-Felder.',
  '#autoPlanV9RepairOnEdit': 'Nach einer manuellen Änderung wird beim nächsten Lauf nur die Umgebung der Änderung neu optimiert, statt den Monat umzubauen.',
  '#autoPlanV9Explanation': 'Wie ausführlich Begründungen für rote und offene Felder ausfallen.',
  '#autoPlanV9RelaxationDepth': 'Wie tief die Konfliktanalyse nach der Ursache sucht, bevor sie das Ergebnis meldet.',
  '#autoPlanV9Exactness': 'Verlangt den Optimalitätsnachweis, statt sich mit einer guten Lösung zu begnügen.',
  '#autoPlanSearchIntensity': 'Breite der heuristischen Konstruktion. Die eigentliche Qualität entsteht danach in der exakten Kaskade beziehungsweise der Perfektionsphase.',
  '#autoPlanTimeBudget': 'Zeitrahmen der heuristischen Perfektionsphase. Sie entfällt vollständig, wenn die exakte Suche Optimalität bereits bewiesen hat.',
  '#autoPlanRepairIterations': 'Runden der einfachen Tauschreparatur direkt nach dem Aufbau.',
  '#autoPlanLocalBudget': 'Wie viele Knoten eine lokale Neuplanung auffälliger Tage höchstens durchsuchen darf.',
  '#autoPlanLateAcceptance': 'Wie viele Runden die Suche zurückblickt, bevor sie einen Zustand annimmt. Größere Werte verlassen lokale Optima leichter.',
  '#autoPlanPerfection': 'Schaltet die Ruin-and-Recreate-Perfektion ab. Ohne sie endet der Lauf nach Aufbau und Reparatur.',
  '#autoPlanAllowRed': 'Erlaubt als letzten Ausweg rote Besetzungen. Sie bleiben ausdrücklich bestätigungspflichtig und werden vollständig ausgewiesen.',
  '#autoPlanMaxRed': 'Obergrenze roter Besetzungen im Vorschlag. Leer bedeutet: keine zusätzliche Grenze über die Zielordnung hinaus.',
  '#autoPlanLimitBody': 'Personengebundene Obergrenzen für diesen Lauf. Sie sind harte Bedingungen des Modells und werden in jeder Stufe eingehalten.',
  '#autoPlanCanvas': 'Lebende Ablesung des Laufs. Jede Bewegung entspricht einem echten Ereignis der Suche — es wird nichts interpoliert.',
  '#autoPlanStartBtn': 'Startet den Lauf. Bis zur ausdrücklichen Übernahme wird der Monatsplan nicht verändert.',
  '#autoPlanApplyBtn': 'Übernimmt den vollständigen Vorschlag atomar. Vorher wird er erneut gegen das aktuelle Regelwerk auditiert.',
  '#autoPlanCancelBtn': 'Bricht den laufenden Lauf ab. Der bisherige Monatsplan bleibt unverändert.'
});

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* nicht kritisch */ }
}

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v10-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v10.css?v=${RELEASE}`;
  link.dataset.autoPlanV10Style = 'true';
  document.head.append(link);
}

/**
 * Entfernt die Regler, die das Ergebnis nachweislich nicht verändern.
 * Sie stehen lassen wäre die schlechtere Wahl: Ein Regler ohne Wirkung
 * beschädigt das Vertrauen in alle übrigen.
 */
function removeInertControls(dialog) {
  const inert = [
    '#autoPlanV9FairnessWeight', '#autoPlanV9PerturbationWeight', '#autoPlanV9Workers',
    '#autoPlanV9Fairness', '#autoPlanV9Infeasibility', '#autoPlanV9MusAutoRelax'
  ];
  for (const selector of inert) {
    const control = dialog.querySelector(selector);
    const field = control?.closest('.auto-plan-field, label');
    field?.remove();
  }
}

function fieldMarkup() {
  const stageOptions = Object.entries(OBJECTIVE_COMPONENTS)
    .filter(([id]) => id !== 'perturbation')
    .map(([id, label]) => `<li class="auto-plan-stage-row" data-stage="${id}">
        <span class="auto-plan-stage-rank" aria-hidden="true"></span>
        <span class="auto-plan-stage-label">${label}</span>
        <span class="auto-plan-stage-buttons">
          <button type="button" class="auto-plan-stage-up" aria-label="${label} eine Stufe höher">▲</button>
          <button type="button" class="auto-plan-stage-down" aria-label="${label} eine Stufe tiefer">▼</button>
        </span>
      </li>`).join('');

  return `
    <label class="auto-plan-field auto-plan-field--wide" data-v10-field="autoPlanV10StageOrder">
      <span>Rangfolge der Ziele</span>
      <ol class="auto-plan-stage-order" id="autoPlanV10StageOrder">${stageOptions}</ol>
      <small>Oben steht, was zuerst exakt optimiert und dann festgeschrieben wird.</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10LeximinDepth">
      <span>Leximin-Tiefe</span>
      <input id="autoPlanV10LeximinDepth" type="number" min="1" max="8" step="1" value="3">
      <small>Ränge des sortierten Lastvektors</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10HgLoad">
      <span>HG-Gewicht in der Last</span>
      <div class="auto-plan-range">
        <input id="autoPlanV10HgLoad" type="range" min="0" max="100" step="5" value="60">
        <output id="autoPlanV10HgLoadOut">60 %</output>
      </div>
      <small>Ein HG zählt anteilig wie ein BD</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10CarryWindow">
      <span>Fairness-Gedächtnis</span>
      <input id="autoPlanV10CarryWindow" type="number" min="0" max="6" step="1" value="3">
      <small>Berücksichtigte Vormonate</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10CarryWeight">
      <span>Gewicht des Gedächtnisses</span>
      <div class="auto-plan-range">
        <input id="autoPlanV10CarryWeight" type="range" min="0" max="100" step="5" value="50">
        <output id="autoPlanV10CarryWeightOut">50 %</output>
      </div>
      <small>Wirkung der Vormonate auf den Start</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10Stability">
      <span>Stabilität</span>
      <select id="autoPlanV10Stability">
        <option value="off">Aus</option>
        <option value="tiebreak" selected>Bei Gleichstand</option>
        <option value="strict">Streng</option>
      </select>
      <small>Nähe zum Ausgangsvorschlag</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10Conflict">
      <span>Bei Unlösbarkeit</span>
      <select id="autoPlanV10Conflict">
        <option value="report">Nur melden</option>
        <option value="show" selected>Korrekturmenge anzeigen</option>
        <option value="apply">Korrekturmenge anwenden</option>
      </select>
      <small>Umgang mit unlösbaren Monaten</small>
    </label>
    <label class="auto-plan-field" data-v10-field="autoPlanV10VisualMode">
      <span>Laufansicht</span>
      <select id="autoPlanV10VisualMode">
        <option value="crystal" selected>Kristallisation</option>
        <option value="weave">Weberei</option>
        <option value="cascade">Kaskade</option>
        <option value="orbit">Orbit</option>
      </select>
      <small>Darstellung der laufenden Suche</small>
    </label>`;
}

function installFields(dialog) {
  if (dialog.querySelector('#autoPlanV10StageOrder')) return;
  const grid = dialog.querySelector('.auto-plan-field-grid');
  if (!grid) return;
  const holder = document.createElement('template');
  holder.innerHTML = fieldMarkup();
  grid.append(...holder.content.children);
}

/**
 * Baut die Sachgruppen und hängt die vorhandenen Felder um.
 *
 * Umhängen statt neu erzeugen: Alle Ereignisbindungen der früheren Fassungen
 * bleiben dadurch bestehen. Ein Feld, das keiner Gruppe zugeordnet ist, landet
 * in „Weitere Einstellungen“ — verschwinden darf keines.
 */
function buildAccordion(dialog) {
  const grid = dialog.querySelector('.auto-plan-field-grid');
  if (!grid || grid.dataset.v10Accordion === 'ready') return;

  const container = document.createElement('div');
  container.className = 'auto-plan-groups';
  container.dataset.v10Groups = 'true';

  const stored = readStore();
  const fieldOf = id => {
    const control = dialog.querySelector(`#${id}`);
    if (!control) return null;
    return control.closest('.auto-plan-field') || control.closest('label') || null;
  };

  const claimed = new Set();
  for (const group of GROUPS) {
    const details = document.createElement('details');
    details.className = 'auto-plan-group';
    details.dataset.group = group.id;
    details.open = stored.groups?.[group.id] ?? group.open;
    const summary = document.createElement('summary');
    summary.className = 'auto-plan-group-summary';
    summary.innerHTML = `<span class="auto-plan-group-title">${group.title}</span><span class="auto-plan-group-count"></span>`;
    const body = document.createElement('div');
    body.className = 'auto-plan-group-body';
    let count = 0;
    for (const id of group.fields) {
      const field = fieldOf(id);
      if (!field || claimed.has(field)) continue;
      claimed.add(field);
      body.append(field);
      count += 1;
    }
    if (!count) continue;
    summary.querySelector('.auto-plan-group-count').textContent = `${count}`;
    setRichTooltip(summary, group.hint);
    details.append(summary, body);
    details.addEventListener('toggle', () => {
      const store = readStore();
      store.groups = { ...(store.groups || {}), [group.id]: details.open };
      writeStore(store);
    });
    container.append(details);
  }

  // Alles, was keiner Gruppe zugeordnet war, bleibt sichtbar.
  const orphans = [...grid.children].filter(child => !claimed.has(child) && child.matches('.auto-plan-field, label'));
  if (orphans.length) {
    const details = document.createElement('details');
    details.className = 'auto-plan-group';
    details.dataset.group = 'more';
    details.open = stored.groups?.more ?? true;
    const summary = document.createElement('summary');
    summary.className = 'auto-plan-group-summary';
    summary.innerHTML = `<span class="auto-plan-group-title">Weitere Einstellungen</span><span class="auto-plan-group-count">${orphans.length}</span>`;
    const body = document.createElement('div');
    body.className = 'auto-plan-group-body';
    body.append(...orphans);
    details.append(summary, body);
    container.append(details);
  }

  grid.append(container);
  grid.dataset.v10Accordion = 'ready';
}

/** Rangfolge der Zielstufen als bedienbare Liste. */
function installStageOrder(dialog) {
  const list = dialog.querySelector('#autoPlanV10StageOrder');
  if (!list || list.dataset.ready === 'true') return;
  list.dataset.ready = 'true';

  const stored = readStore().stageOrder;
  if (Array.isArray(stored) && stored.length) {
    for (const id of [...stored].reverse()) {
      const row = list.querySelector(`[data-stage="${id}"]`);
      if (row) list.prepend(row);
    }
  }

  const renumber = () => {
    [...list.children].forEach((row, index) => {
      row.querySelector('.auto-plan-stage-rank').textContent = String(index + 1);
      row.querySelector('.auto-plan-stage-up').disabled = index === 0;
      row.querySelector('.auto-plan-stage-down').disabled = index === list.children.length - 1;
    });
    const store = readStore();
    store.stageOrder = [...list.children].map(row => row.dataset.stage);
    writeStore(store);
  };

  list.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    event.preventDefault();
    const row = button.closest('.auto-plan-stage-row');
    if (!row) return;
    if (button.classList.contains('auto-plan-stage-up') && row.previousElementSibling) {
      row.parentElement.insertBefore(row, row.previousElementSibling);
    } else if (button.classList.contains('auto-plan-stage-down') && row.nextElementSibling) {
      row.parentElement.insertBefore(row.nextElementSibling, row);
    }
    renumber();
    button.focus();
  });
  renumber();
}

/** Wertanzeigen der Schieberegler und Speicherung aller v10-Felder. */
function bindValues(dialog) {
  const pairs = [['autoPlanV10HgLoad', 'autoPlanV10HgLoadOut'], ['autoPlanV10CarryWeight', 'autoPlanV10CarryWeightOut']];
  const sync = () => {
    for (const [inputId, outputId] of pairs) {
      const input = byId(inputId);
      const output = byId(outputId);
      if (input && output) output.textContent = `${input.value} %`;
    }
  };
  dialog.addEventListener('input', sync);
  sync();

  const persist = () => {
    const store = readStore();
    store.values = {
      leximinDepth: Number(byId('autoPlanV10LeximinDepth')?.value ?? 3),
      hgLoadPercent: Number(byId('autoPlanV10HgLoad')?.value ?? 60),
      carryOverWindow: Number(byId('autoPlanV10CarryWindow')?.value ?? 3),
      carryOverPercent: Number(byId('autoPlanV10CarryWeight')?.value ?? 50),
      stabilityLevel: byId('autoPlanV10Stability')?.value || 'tiebreak',
      conflictMode: byId('autoPlanV10Conflict')?.value || 'show',
      visualMode: byId('autoPlanV10VisualMode')?.value || 'crystal'
    };
    writeStore(store);
    document.documentElement.dataset.autoPlanVisual = store.values.visualMode;
    try { localStorage.setItem(VISUAL_KEY, store.values.visualMode); } catch { /* nicht kritisch */ }
  };
  dialog.addEventListener('change', persist);

  const stored = readStore().values;
  if (stored) {
    if (byId('autoPlanV10LeximinDepth')) byId('autoPlanV10LeximinDepth').value = String(stored.leximinDepth ?? 3);
    if (byId('autoPlanV10HgLoad')) byId('autoPlanV10HgLoad').value = String(stored.hgLoadPercent ?? 60);
    if (byId('autoPlanV10CarryWindow')) byId('autoPlanV10CarryWindow').value = String(stored.carryOverWindow ?? 3);
    if (byId('autoPlanV10CarryWeight')) byId('autoPlanV10CarryWeight').value = String(stored.carryOverPercent ?? 50);
    if (byId('autoPlanV10Stability')) byId('autoPlanV10Stability').value = stored.stabilityLevel || 'tiebreak';
    if (byId('autoPlanV10Conflict')) byId('autoPlanV10Conflict').value = stored.conflictMode || 'show';
    // Ein gespeicherter Wert aus einer Fassung mit anderem Ansichtsangebot darf
    // die Auswahlliste nicht leer lassen: Ein `select` ohne passende Option
    // zeigt gar nichts an, und die Laufansicht wäre nicht mehr wählbar.
    const visual = byId('autoPlanV10VisualMode');
    if (visual) {
      visual.value = stored.visualMode || 'crystal';
      if (!visual.value) visual.value = 'crystal';
    }
    sync();
  }
  document.documentElement.dataset.autoPlanVisual = byId('autoPlanV10VisualMode')?.value
    || readStore().values?.visualMode
    || 'crystal';
}

/**
 * Die Laufkonfiguration, die die Engine erwartet.
 * Wird vom Studio-Kern über `window.__autoPlanV10RunConfig` abgefragt.
 */
export function currentRunConfig() {
  const list = document.getElementById('autoPlanV10StageOrder');
  const stageOrder = list ? [...list.children].map(row => row.dataset.stage) : undefined;
  return {
    ...(stageOrder?.length ? { stageOrder } : {}),
    leximinDepth: Number(byId('autoPlanV10LeximinDepth')?.value ?? 3),
    hgLoadPercent: Number(byId('autoPlanV10HgLoad')?.value ?? 60),
    carryOverWindow: Number(byId('autoPlanV10CarryWindow')?.value ?? 3),
    carryOverPercent: Number(byId('autoPlanV10CarryWeight')?.value ?? 50),
    stabilityLevel: byId('autoPlanV10Stability')?.value || 'tiebreak',
    conflictMode: byId('autoPlanV10Conflict')?.value || 'show'
  };
}

/**
 * Ein Tooltip an jedem Bedienelement — ohne Ausnahme.
 *
 * Zuerst der gepflegte Katalog, dann der geerbte `title`, zuletzt eine aus
 * Beschriftung und Beschreibung gebildete Erklärung. Ein Feld ohne jede
 * Erklärung ist ein Feld, das niemand zu bedienen wagt.
 */
function ensureTooltips(dialog) {
  for (const [selector, text] of Object.entries(TOOLTIPS)) {
    const element = dialog.querySelector(selector);
    if (element) setRichTooltip(element, text);
  }
  for (const control of dialog.querySelectorAll('select, input, textarea, button, output, table')) {
    if (control.dataset.tooltip) continue;
    const field = control.closest('.auto-plan-field, label');
    const title = control.getAttribute('title');
    const label = field?.querySelector(':scope > span')?.textContent?.trim();
    const detail = field?.querySelector(':scope > small')?.textContent?.trim();
    const text = title || [label, detail].filter(Boolean).join(' — ');
    if (text) setRichTooltip(control, text);
  }
}

/** Phasenliste und Kennung auf v10 heben. */
function upgradeIdentity(dialog) {
  const badge = dialog.querySelector('.auto-plan-engine-badge span');
  if (badge) badge.textContent = 'Engine v10 · Exakter boolescher Kern';
  const ribbon = dialog.querySelector('#autoPlanV8Ribbon, .auto-plan-v85-ribbon');
  const title = ribbon?.querySelector('b');
  if (title) title.textContent = 'Exact Boolean Rostering Core · v10';
  // Die Phasenliste selbst wird bewusst nicht neu geschrieben: Sie wird von der
  // v9-Schicht aus derselben Quelle (`AUTO_PLAN_STAGES`) erzeugt und trägt dort
  // die Klassen und Zustände, an denen Fortschritt und Tests hängen. Zweimal
  // dasselbe zu erzeugen hieße, eine der beiden Fassungen zu verlieren.
}

/** Ergebnis-Panel: Nachweis, Konflikt und Verteilungskennzahlen. */
export function renderResult(dialog, result) {
  let panel = dialog.querySelector('#autoPlanV10Result');
  if (!panel) {
    const anchor = dialog.querySelector('#autoPlanV9Result') || dialog.querySelector('#autoPlanResult');
    if (!anchor) return;
    panel = document.createElement('section');
    panel.id = 'autoPlanV10Result';
    panel.className = 'auto-plan-card auto-plan-panel auto-plan-v10-result';
    anchor.after(panel);
  }
  const exact = result?.metrics?.exact;
  const conflict = result?.metrics?.conflict;
  const status = exact?.status || (exact?.available === false ? 'UNAVAILABLE' : '–');
  const tone = exact?.optimal ? 'proof' : status === 'INFEASIBLE' ? 'conflict' : 'plain';
  const rows = [];
  rows.push(['Status der exakten Suche', exact?.optimal ? 'OPTIMAL · bewiesen' : status]);
  if (exact?.certifiedStages !== undefined) rows.push(['Stufen mit erreichter Schranke', `${exact.certifiedStages} von ${exact?.trace?.length ?? 0}`]);
  if (exact?.model) rows.push(['Modellgröße', `${exact.model.assignments} Zuordnungen · ${exact.model.constraints} Bedingungen`]);
  if (Number.isFinite(exact?.wallTimeMs)) rows.push(['Rechenzeit der Kaskade', `${exact.wallTimeMs} ms`]);
  if (Number.isFinite(result?.metrics?.jainIndex)) rows.push(['Jain-Index der Last', `${(result.metrics.jainIndex * 100).toFixed(1)} % Gleichverteilung`]);
  if (Number.isFinite(result?.metrics?.giniIndex)) rows.push(['Gini-Koeffizient', result.metrics.giniIndex.toFixed(3)]);
  if (conflict?.dropped?.length) rows.push(['Aufzugebende Regeln', conflict.dropped.map(entry => entry.label).join(', ')]);

  panel.innerHTML = `<div class="auto-plan-section-title">
      <span>Nachweis und Verteilung · Engine v10</span>
      <b class="auto-plan-v10-status" data-tone="${tone}">${exact?.optimal ? 'bewiesen optimal' : status}</b>
    </div>
    <dl class="auto-plan-v10-facts">${rows.map(([term, value]) =>
      `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl>
    ${exact?.trace?.length
      ? `<ol class="auto-plan-v10-trace">${exact.trace.map(entry =>
        `<li data-status="${entry.status}"><span>${entry.label}</span><b>${entry.value === null || entry.value === undefined ? '–' : Number(entry.value).toFixed(2)}</b><small>${entry.status}</small></li>`).join('')}</ol>`
      : ''}
    ${conflict?.detail ? `<p class="auto-plan-v10-conflict">${conflict.detail}${conflict.proven ? '' : ' Die Aufgabemenge ist die kleinste im Zeitbudget nachgewiesene, nicht notwendig die kleinstmögliche.'}</p>` : ''}`;

  setRichTooltip(panel.querySelector('.auto-plan-v10-status'), exact?.optimal
    ? 'Der Zielwert jeder Stufe trifft ihre bewiesene untere Schranke. Es gibt in dieser Zielordnung keinen besseren Plan.'
    : 'Ohne erreichte untere Schranke bleibt der Vorschlag gut, aber unbewiesen. Ein größeres Zeitbudget oder eine geringere Leximin-Tiefe schließt die Lücke meist.');
}

function enhance(dialog) {
  if (!dialog) return;
  addStylesheet();
  dialog.dataset.v10Layout = '1';
  removeInertControls(dialog);
  installFields(dialog);
  installStageOrder(dialog);
  bindValues(dialog);
  buildAccordion(dialog);
  upgradeIdentity(dialog);
  ensureTooltips(dialog);
}

function initialize() {
  const attach = () => {
    const dialog = document.getElementById('autoPlanDialog');
    if (dialog) enhance(dialog);
  };
  attach();
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.id === 'autoPlanDialog' || node.querySelector?.('#autoPlanDialog')) attach();
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  globalThis.__autoPlanV10RunConfig = currentRunConfig;
  globalThis.__autoPlanV10RenderResult = renderResult;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}

export const STUDIO_V10_VERSION = RELEASE;
export { GROUPS, TOOLTIPS };
