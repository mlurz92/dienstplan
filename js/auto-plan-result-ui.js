import {
  assignmentLabel,
  computeWeekendEquivalent,
  countRoleInMonth,
  getPlanningStaff,
  getStaffById,
  weekdayLabel
} from './rules.js?v=20260801.11';
import { holidayName, parseIsoDate } from './holidays.js?v=20260801.11';

const byId = id => document.getElementById(id);
const ROLE_ORDER = Object.freeze(['bd', 'hg']);
const LEVEL_ORDER = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const formatDate = dateIso => `${dateIso.slice(8, 10)}.${dateIso.slice(5, 7)}.${dateIso.slice(0, 4)}`;

let stateRef = null;
let currentResult = null;

export function resultTemplate() {
  return `<section class="auto-plan-result" id="autoPlanResult" hidden>
    <div class="auto-plan-result-hero">
      <div class="auto-plan-seal" id="autoPlanSeal"><span>✓</span></div>
      <div>
        <div class="auto-plan-kicker" id="autoPlanResultKicker">Optimierung abgeschlossen</div>
        <h3 id="autoPlanResultTitle" tabindex="-1">Vorschlag bereit</h3>
        <p id="autoPlanResultText"></p>
      </div>
    </div>
    <div class="auto-plan-scorecards" id="autoPlanScorecards"></div>

    <section class="auto-plan-search-report" aria-labelledby="autoPlanSearchReportTitle">
      <div class="auto-plan-section-title">
        <span id="autoPlanSearchReportTitle">Such- und Qualitätsnachweis</span>
        <b id="autoPlanSearchProfile"></b>
      </div>
      <div class="auto-plan-search-metrics" id="autoPlanSearchMetrics"></div>
    </section>

    <section class="auto-plan-run-config-review" aria-labelledby="autoPlanRunConfigTitle">
      <div class="auto-plan-section-title">
        <span id="autoPlanRunConfigTitle">Verwendete Laufparameter</span>
        <b>revisionsgebunden</b>
      </div>
      <div class="auto-plan-run-config-chips" id="autoPlanRunConfigChips"></div>
    </section>

    <section class="auto-plan-proposal-panel" aria-labelledby="autoPlanProposalTitle">
      <div class="auto-plan-section-title">
        <span id="autoPlanProposalTitle">Monatsvorschlag wie in der Diensttabelle</span>
        <b id="autoPlanChangeCount"></b>
      </div>
      <div class="auto-plan-change-list auto-plan-table-scroll" id="autoPlanChangeList" tabindex="0">
        <table class="auto-plan-proposal-table" id="autoPlanProposalTable">
          <thead><tr>
            <th scope="col" class="auto-plan-day-number">Tag</th>
            <th scope="col">Wochentag</th>
            <th scope="col">BD</th>
            <th scope="col">HG</th>
            <th scope="col">Prüfung</th>
          </tr></thead>
          <tbody id="autoPlanProposalBody"></tbody>
        </table>
      </div>
    </section>

    <section class="auto-plan-load-panel" aria-labelledby="autoPlanLoadTitle">
      <div class="auto-plan-section-title">
        <span id="autoPlanLoadTitle">Verteilungsbild und Sollausgleich</span>
        <b>vorher → nachher</b>
      </div>
      <div class="auto-plan-load-table auto-plan-table-scroll" id="autoPlanLoadTable" tabindex="0"></div>
    </section>

    <section class="auto-plan-red-review" id="autoPlanRedReview" hidden aria-labelledby="autoPlanRedReviewTitle">
      <div class="auto-plan-red-review-head">
        <div><span>Bestätigungspflichtiger Fallback</span><h4 id="autoPlanRedReviewTitle">Rote Regelabweichungen einzeln prüfen</h4></div>
        <strong id="autoPlanRedCount"></strong>
      </div>
      <div class="auto-plan-red-list" id="autoPlanRedList"></div>
      <label class="auto-plan-comment-label" for="autoPlanOverrideComment">
        <span id="autoPlanOverrideCommentLabel">Gemeinsamer Kommentar zur Entscheidung</span>
        <textarea id="autoPlanOverrideComment" rows="3" placeholder="Begründung der bestätigten Minimal-Rot-Variante"></textarea>
      </label>
      <label class="auto-plan-confirm-red auto-plan-confirm-red--master">
        <input type="checkbox" id="autoPlanConfirmRed">
        <span>Alle oben einzeln markierten roten Regelabweichungen gemeinsam bestätigen.</span>
      </label>
    </section>
    <div class="auto-plan-confirm-note" id="autoPlanConfirmNote" aria-live="polite"></div>
  </section>`;
}

function planningStaff(result) {
  const unique = new Map();
  for (const dateIso of Object.keys(result.plannedMonth?.days || {}).sort()) {
    for (const person of getPlanningStaff(stateRef.staff, dateIso)) unique.set(person.id, person);
  }
  return [...unique.values()];
}

function staffLabel(staffId) {
  const person = getStaffById(stateRef.staff, staffId);
  return person?.short || assignmentLabel(stateRef.staff, staffId, { short: true }) || staffId || 'offen';
}

function auditMap(result) {
  return new Map((result.audit || []).map(item => [`${item.dateIso}|${item.role}`, item]));
}

function roleCell(result, audits, dateIso, role) {
  const before = result.baseline?.days?.[dateIso]?.[role] || '';
  const after = result.plannedMonth?.days?.[dateIso]?.[role] || '';
  const proposed = !before && Boolean(after);
  const audit = audits.get(`${dateIso}|${role}`);
  const level = proposed ? (audit?.level || 'green') : before ? 'fixed' : 'open';
  const reasons = proposed ? (audit?.reasons || []) : [];
  const status = proposed ? 'Auto-Plan' : before ? 'Fixpunkt' : 'offen';
  const reasonText = reasons.length
    ? `<details class="auto-plan-cell-reasons"><summary>${reasons.length} Regelhinweis${reasons.length === 1 ? '' : 'e'}</summary><ul>${reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></details>`
    : '';
  return `<div class="auto-plan-assignment-cell ${esc(level)} ${proposed ? 'proposed' : before ? 'fixed' : 'open'}">
    <div class="auto-plan-person-line"><strong>${esc(after ? staffLabel(after) : 'offen')}</strong><span class="auto-plan-source-pill">${esc(status)}</span></div>
    <div class="auto-plan-cell-state"><i></i><span>${esc(level === 'fixed' ? 'bestehend' : level)}</span></div>
    ${reasonText}
  </div>`;
}

function rowLevel(audits, dateIso) {
  const levels = ROLE_ORDER.map(role => audits.get(`${dateIso}|${role}`)?.level).filter(Boolean);
  if (!levels.length) return 'fixed';
  return levels.sort((left, right) => (LEVEL_ORDER[right] ?? -1) - (LEVEL_ORDER[left] ?? -1))[0];
}

function rowReview(result, audits, dateIso) {
  const items = ROLE_ORDER.map(role => {
    const audit = audits.get(`${dateIso}|${role}`);
    return audit ? { role, level: audit.level || 'green', reasons: audit.reasons || [] } : null;
  }).filter(Boolean);
  if (!items.length) {
    return ROLE_ORDER.some(role => !result.plannedMonth?.days?.[dateIso]?.[role])
      ? '<span class="auto-plan-row-status red">unvollständig</span>'
      : '<span class="auto-plan-row-status fixed">Fixpunkte</span>';
  }
  const highest = rowLevel(audits, dateIso);
  const details = items.filter(item => item.reasons.length).map(item =>
    `<section><strong>${item.role.toUpperCase()} · ${esc(item.level)}</strong><ul>${item.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></section>`).join('');
  return `<div class="auto-plan-row-review">
    <span class="auto-plan-row-status ${esc(highest)}">${items.length} Vorschlag${items.length === 1 ? '' : 'e'} · ${esc(highest)}</span>
    ${details ? `<details><summary>Regelgründe des Tages</summary>${details}</details>` : ''}
  </div>`;
}

function renderProposalTable(result) {
  const audits = auditMap(result);
  byId('autoPlanProposalBody').innerHTML = Object.keys(result.plannedMonth.days || {}).sort().map(dateIso => {
    const date = parseIsoDate(dateIso);
    const holiday = holidayName(dateIso);
    const weekend = date.getDay() === 6 ? 'saturday' : date.getDay() === 0 ? 'sunday' : '';
    const proposed = ROLE_ORDER.some(role => !result.baseline?.days?.[dateIso]?.[role] && result.plannedMonth?.days?.[dateIso]?.[role]);
    return `<tr id="auto-plan-row-${esc(dateIso)}" class="${weekend} ${holiday ? 'holiday' : ''} ${proposed ? 'has-proposal' : 'fixed-only'}">
      <th scope="row" class="auto-plan-day-number"><span>${esc(dateIso.slice(-2))}</span></th>
      <td class="auto-plan-weekday"><strong>${esc(weekdayLabel(dateIso))}</strong>${holiday ? `<small>${esc(holiday)}</small>` : ''}</td>
      <td>${roleCell(result, audits, dateIso, 'bd')}</td>
      <td>${roleCell(result, audits, dateIso, 'hg')}</td>
      <td>${rowReview(result, audits, dateIso)}</td>
    </tr>`;
  }).join('');
}

function capLabel(value) {
  return value === null || value === undefined ? 'frei' : String(value);
}

function loadRows(result) {
  return planningStaff(result).map(person => {
    const beforeBd = countRoleInMonth(result.baseline, person.id, 'bd');
    const afterBd = countRoleInMonth(result.plannedMonth, person.id, 'bd');
    const beforeHg = countRoleInMonth(result.baseline, person.id, 'hg');
    const afterHg = countRoleInMonth(result.plannedMonth, person.id, 'hg');
    return {
      person,
      beforeBd,
      afterBd,
      beforeHg,
      afterHg,
      beforeTotal: beforeBd + beforeHg,
      afterTotal: afterBd + afterHg,
      beforeWeekend: computeWeekendEquivalent(result.baseline, person.id),
      afterWeekend: computeWeekendEquivalent(result.plannedMonth, person.id),
      target: Number(person.bdTarget || 0),
      limits: result.runConfig?.staffLimits?.[person.id] || {}
    };
  });
}

function renderLoadTable(result) {
  byId('autoPlanLoadTable').innerHTML = `<table class="auto-plan-distribution-table">
    <thead><tr><th scope="col">Person</th><th scope="col">BD</th><th scope="col">HG</th><th scope="col">Gesamt</th><th scope="col">WE</th><th scope="col">BD-Soll</th><th scope="col">Obergrenzen BD/HG/Σ</th></tr></thead>
    <tbody>${loadRows(result).map(row => {
      const delta = row.target ? row.target - row.afterBd : null;
      return `<tr>
        <th scope="row">${esc(row.person.short || row.person.name)}</th>
        <td>${row.beforeBd}<i>→</i><strong>${row.afterBd}</strong></td>
        <td>${row.beforeHg}<i>→</i><strong>${row.afterHg}</strong></td>
        <td>${row.beforeTotal}<i>→</i><strong>${row.afterTotal}</strong></td>
        <td>${row.beforeWeekend.toFixed(1)}<i>→</i><strong>${row.afterWeekend.toFixed(1)}</strong></td>
        <td>${row.target || '—'}${delta === null ? '' : `<small class="${delta < 0 ? 'over' : delta === 0 ? 'met' : ''}">${delta === 0 ? 'erfüllt' : delta > 0 ? `${delta} offen` : `${Math.abs(delta)} über Soll`}</small>`}</td>
        <td><strong>${capLabel(row.limits.maxBd)} / ${capLabel(row.limits.maxHg)} / ${capLabel(row.limits.maxTotal)}</strong></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderSearchReport(result) {
  const metrics = result.metrics || {};
  const attempts = Array.isArray(metrics.attempts) ? metrics.attempts : [];
  byId('autoPlanSearchProfile').textContent = result.searchProfile || '—';
  const entries = [
    ['Suchläufe', String(attempts.length)],
    ['vollständig', String(attempts.filter(attempt => attempt.complete).length)],
    ['Varianten geprüft', Number(metrics.exploredNodes || 0).toLocaleString('de-DE')],
    ['Nachfolger erzeugt', Number(metrics.generatedNodes || 0).toLocaleString('de-DE')],
    ['Sackgassen', Number(metrics.deadEnds || 0).toLocaleString('de-DE')],
    ['Grenzfilter', Number(metrics.limitRejects || 0).toLocaleString('de-DE')],
    ['exakte Restknoten', Number(metrics.exactNodes || 0).toLocaleString('de-DE')],
    ['Politur', `${Number(metrics.improvements || 0)} Verbesserungen`],
    ['Laufzeit', `${Number(result.elapsedMs || 0).toLocaleString('de-DE')} ms`]
  ];
  byId('autoPlanSearchMetrics').innerHTML = entries.map(([label, value]) =>
    `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}

function renderRunConfig(result) {
  const config = result.runConfig || {};
  const focus = { balanced: 'ausgewogen', wishes: 'Wünsche', workload: 'Lastenausgleich', weekends: 'Wochenenden' };
  const intensity = { standard: 'Standard', deep: 'Tief', maximum: 'Maximum' };
  const capped = Object.values(config.staffLimits || {}).filter(limits =>
    limits.maxBd !== null || limits.maxHg !== null || limits.maxTotal !== null).length;
  const chips = [
    `Suche: ${intensity[config.searchIntensity] || config.searchIntensity || '—'}`,
    `Fokus: ${focus[config.optimizationFocus] || config.optimizationFocus || '—'}`,
    `Minimal-Rot: ${config.allowRedFallback ? 'zulässig' : 'ausgeschlossen'}`,
    `Rot-Limit: ${config.maxRedViolations === null ? 'unbegrenzt' : config.maxRedViolations}`,
    `individuelle Grenzen: ${capped}`
  ];
  byId('autoPlanRunConfigChips').innerHTML = chips.map(label => `<span>${esc(label)}</span>`).join('');
}

function renderRedReview(result) {
  const required = result.requiresConfirmation && result.redViolations.length > 0;
  byId('autoPlanRedReview').hidden = !required;
  byId('autoPlanConfirmRed').checked = false;
  byId('autoPlanConfirmRed').indeterminate = false;
  byId('autoPlanOverrideComment').value = '';
  if (!required) return;
  const hasSpecial = result.redViolations.some(violation => violation.confirmationType === 'special');
  byId('autoPlanOverrideComment').required = hasSpecial;
  byId('autoPlanOverrideCommentLabel').textContent = hasSpecial
    ? 'Begründender Kommentar, für besondere Ausnahmen erforderlich'
    : 'Gemeinsamer Kommentar zur Entscheidung, optional';
  byId('autoPlanRedCount').textContent = `${result.redViolations.length} rot`;
  byId('autoPlanRedList').innerHTML = result.redViolations.map((violation, index) =>
    `<article class="auto-plan-red-item">
      <div class="auto-plan-red-item-main">
        <div><time>${esc(weekdayLabel(violation.dateIso))}, ${esc(formatDate(violation.dateIso))}</time><strong>${esc(violation.role.toUpperCase())} · ${esc(staffLabel(violation.staffId))}</strong></div>
        <span>${esc(violation.confirmationType === 'special' ? 'besondere Bestätigung' : 'Bestätigung')}</span>
      </div>
      <ul>${violation.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
      <div class="auto-plan-red-item-actions">
        <label><input type="checkbox" data-auto-plan-red-check="${index}"><span>Diese Abweichung geprüft</span></label>
        <button type="button" class="secondary auto-plan-jump" data-auto-plan-jump="${esc(violation.dateIso)}">In Tabelle zeigen</button>
      </div>
    </article>`).join('');
}

export function allRedConfirmed() {
  const checks = [...document.querySelectorAll('[data-auto-plan-red-check]')];
  return checks.length > 0 && checks.every(check => check.checked);
}

export function syncRedConfirmation({ masterChanged = false } = {}) {
  if (!currentResult?.requiresConfirmation) return false;
  const master = byId('autoPlanConfirmRed');
  const checks = [...document.querySelectorAll('[data-auto-plan-red-check]')];
  if (masterChanged) checks.forEach(check => { check.checked = master.checked; });
  const checked = checks.filter(check => check.checked).length;
  master.checked = checks.length > 0 && checked === checks.length;
  master.indeterminate = checked > 0 && checked < checks.length;
  const hasSpecial = currentResult.redViolations.some(violation => violation.confirmationType === 'special');
  const commentReady = !hasSpecial || Boolean(byId('autoPlanOverrideComment').value.trim());
  const ready = allRedConfirmed() && commentReady;
  byId('autoPlanApplyBtn').disabled = !ready;
  const note = byId('autoPlanConfirmNote');
  note.classList.add('warning');
  note.classList.toggle('confirmed-ready', ready);
  note.textContent = ready
    ? 'Alle roten Abweichungen sind geprüft. Die Übernahme bleibt bis zum Klick unverändert.'
    : hasSpecial && allRedConfirmed()
      ? 'Alle roten Abweichungen sind markiert. Für die besondere Ausnahme fehlt noch ein begründender Kommentar.'
      : `${checked}/${checks.length} rote Abweichungen geprüft.`;
  return ready;
}

export function getConfirmation() {
  if (!currentResult?.requiresConfirmation) return null;
  return {
    accepted: allRedConfirmed(),
    comment: byId('autoPlanOverrideComment').value.trim()
  };
}

export function renderResultUI(state, result) {
  stateRef = state;
  currentResult = result;
  const complete = result.complete;
  const confirmationRequired = result.requiresConfirmation;
  const seal = byId('autoPlanSeal');
  seal.classList.toggle('failed', !complete);
  seal.classList.toggle('warning', confirmationRequired);
  seal.querySelector('span').textContent = !complete ? '!' : confirmationRequired ? '⚠' : '✓';
  byId('autoPlanResultKicker').textContent = !complete
    ? 'Planung blockiert'
    : confirmationRequired ? 'Minimal-Rot-Fallback abgeschlossen' : 'Optimierung abgeschlossen';
  byId('autoPlanResultTitle').textContent = !complete
    ? 'Keine vollständige technisch wählbare Belegung'
    : confirmationRequired ? 'Vollständige Belegung mit roten Ausnahmen' : 'Regelkonformer Vorschlag bereit';
  byId('autoPlanResultText').textContent = !complete
    ? `${result.metrics.unfilled} Felder konnten innerhalb der festgelegten Obergrenzen und Regeln nicht besetzt werden.`
    : confirmationRequired
      ? 'Die Lösung hält sämtliche Laufobergrenzen ein, minimiert rote Abweichungen und wird erst nach deren vollständiger Prüfung übernommen.'
      : `${result.changes.length} offene Felder wurden innerhalb der festgelegten Obergrenzen ohne rote oder nicht überschreibbare Regelverletzung global optimiert.`;

  const cards = [
    ['Regel-Audit', confirmationRequired ? `${result.metrics.red} rot` : complete ? '0 rot' : `${result.metrics.gray} gesperrt`, confirmationRequired ? 'warning' : complete ? 'verified' : 'failed'],
    ['Fairness', `${result.metrics.fairnessIndex}%`, 'fair'],
    ['Wünsche', `${result.metrics.wishesFulfilled}/${result.metrics.wishesPossible}`, 'wish'],
    ['Vorschläge', String(result.metrics.proposed), 'count'],
    ['Hinweise', `${result.metrics.yellow} gelb · ${result.metrics.orange} orange`, 'notes'],
    ['Suchprofil', result.searchProfile || '—', 'search']
  ];
  byId('autoPlanScorecards').innerHTML = cards.map(([label, value, tone]) =>
    `<div class="auto-plan-scorecard ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  byId('autoPlanChangeCount').textContent = `${result.changes.length} neue Einträge · ${Object.keys(result.plannedMonth.days || {}).length} Tageszeilen`;
  renderSearchReport(result);
  renderRunConfig(result);
  renderProposalTable(result);
  renderLoadTable(result);
  renderRedReview(result);

  const apply = byId('autoPlanApplyBtn');
  apply.hidden = !complete || !result.changes.length;
  apply.disabled = confirmationRequired;
  apply.textContent = confirmationRequired ? 'Geprüfte rote Ausnahmen übernehmen' : 'Vorschläge übernehmen';
  const note = byId('autoPlanConfirmNote');
  note.classList.toggle('failed', !complete);
  note.classList.toggle('warning', confirmationRequired);
  note.classList.remove('accepted', 'confirmed-ready');
  note.textContent = !complete
    ? 'Es wurde nichts geschrieben. Parameter können angepasst und der Algorithmus erneut gestartet werden.'
    : confirmationRequired
      ? 'Der Monatsplan bleibt unverändert, bis jede rote Abweichung geprüft und gegebenenfalls begründet wurde.'
      : result.changes.length
        ? 'Monatstabelle, Laufparameter und Belastungsstatistik können vor der Übernahme vollständig geprüft werden.'
        : 'Der Monat enthält keine offenen BD/HG-Felder.';
  if (confirmationRequired) syncRedConfirmation();
  requestAnimationFrame(() => byId('autoPlanResultTitle')?.focus({ preventScroll: true }));
}

export function bindResultUI() {
  byId('autoPlanConfirmRed').addEventListener('change', () => syncRedConfirmation({ masterChanged: true }));
  byId('autoPlanOverrideComment').addEventListener('input', () => syncRedConfirmation());
  byId('autoPlanRedList').addEventListener('change', event => {
    if (event.target.matches('[data-auto-plan-red-check]')) syncRedConfirmation();
  });
  byId('autoPlanRedList').addEventListener('click', event => {
    const button = event.target.closest('[data-auto-plan-jump]');
    if (!button) return;
    const row = byId(`auto-plan-row-${button.dataset.autoPlanJump}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.classList.add('review-focus');
    setTimeout(() => row?.classList.remove('review-focus'), 1200);
  });
}
