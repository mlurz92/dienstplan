import { state, getMonthData } from './state.js';
import {
  getAbsence,
  getAssignment,
  getPreference,
  getStaffById,
  labelForAbsence,
  labelForPreference,
  weekdayLabel
} from './rules.js';

const SPACING_REASON = 'Weniger als 3 dienstfreie Tage seit letztem BD';
const LOW_SEVERITY_REASONS = [
  SPACING_REASON,
  'BD-Richtwert',
  'Wunsch:'
];

let refreshQueued = false;

function parseIso(iso) {
  return new Date(`${iso}T00:00:00`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function monthForDate(iso) {
  const date = parseIso(iso);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return state.months.get(key);
}

function absenceAt(staffId, iso) {
  const month = monthForDate(iso);
  return month ? getAbsence(month, staffId, iso) : '';
}

function isWeekday(date) {
  return date.getDay() >= 1 && date.getDay() <= 5;
}

function isWeekdayBdFzaBd(staffId, dateIso) {
  const current = parseIso(dateIso);
  const fzaDate = addDays(current, -1);
  const previousBdDate = addDays(current, -2);

  if (![current, fzaDate, previousBdDate].every(isWeekday)) return false;
  if (absenceAt(staffId, toIso(fzaDate)) !== 'fza') return false;
  return getAssignment(state, toIso(previousBdDate), 'bd') === staffId;
}

function isDerivedPostBdFza(staffId, dateIso, absence) {
  if (absence !== 'fza') return false;
  const previousIso = toIso(addDays(parseIso(dateIso), -1));
  return getAssignment(state, previousIso, 'bd') === staffId;
}

function reasonsAllowDowngrade(reasons) {
  return reasons.length > 0 && reasons.every(reason =>
    LOW_SEVERITY_REASONS.some(prefix => reason.startsWith(prefix))
  );
}

function downgradeElement(container, chip, label = 'Hinweis') {
  container.classList.remove('orange');
  container.classList.add('yellow');
  if (chip) {
    chip.classList.remove('orange');
    chip.classList.add('yellow');
    chip.textContent = label;
  }
}

function downgradePickerItems() {
  const picker = state.currentPicker;
  if (!picker || picker.role !== 'bd') return;

  document.querySelectorAll('#pickerList .picker-item.orange').forEach(item => {
    const name = item.querySelector('.name')?.textContent?.trim();
    const person = state.staff.find(entry => entry.name === name);
    if (!person || !isWeekdayBdFzaBd(person.id, picker.dateIso)) return;

    const reasons = [...item.querySelectorAll('.reasons span')]
      .map(node => node.textContent.trim())
      .filter(Boolean);
    if (!reasons.includes(SPACING_REASON) || !reasonsAllowDowngrade(reasons)) return;

    downgradeElement(item, item.querySelector('.small-chip'));
    item.title = item.title.replace(SPACING_REASON, 'BD–FZA–BD werktags: zulässige Konstellation mit Hinweis');
    const reasonNode = [...item.querySelectorAll('.reasons span')]
      .find(node => node.textContent.trim() === SPACING_REASON);
    if (reasonNode) reasonNode.textContent = 'BD–FZA–BD werktags: gelber Hinweis';
  });
}

function downgradeAssignedButtons() {
  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const dates = Object.keys(monthData.days || {});

  document.querySelectorAll('#planTableBody tr').forEach((row, index) => {
    const dateIso = dates[index];
    if (!dateIso) return;
    const button = row.children[2]?.querySelector('.assignment-btn');
    if (!button?.title?.includes(SPACING_REASON)) return;

    const name = button.querySelector('.assignment-name')?.textContent?.trim();
    const person = state.staff.find(entry => entry.name === name);
    if (!person || !isWeekdayBdFzaBd(person.id, dateIso)) return;

    const reasons = button.title.split('\n').map(value => value.trim()).filter(Boolean);
    if (!reasonsAllowDowngrade(reasons)) return;

    downgradeElement(button, button.querySelector('.small-chip'));
    button.title = button.title.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
  });
}

function downgradeIssueCards() {
  document.querySelectorAll('#issuesList .issue-card').forEach(card => {
    const details = card.querySelector('p')?.textContent || '';
    if (!details.includes(SPACING_REASON)) return;

    const title = card.querySelector('strong')?.textContent || '';
    const dateMatch = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) return;
    const dateIso = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    const person = state.staff.find(entry => title.includes(entry.name));
    if (!person || !isWeekdayBdFzaBd(person.id, dateIso)) return;

    const reasons = details.split(' · ').map(value => value.trim()).filter(Boolean);
    if (!reasonsAllowDowngrade(reasons)) return;

    downgradeElement(card, card.querySelector('.small-chip'));
    const paragraph = card.querySelector('p');
    if (paragraph) paragraph.textContent = details.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
  });
}

function planningEntries(monthData) {
  const result = [];

  for (const dateIso of Object.keys(monthData.days || {})) {
    const entries = [];
    for (const person of state.staff.filter(entry => entry.includeInAbsenceList)) {
      const absence = getAbsence(monthData, person.id, dateIso);
      const preference = getPreference(monthData, person.id, dateIso);

      if (absence && !isDerivedPostBdFza(person.id, dateIso, absence)) {
        entries.push({
          staffId: person.id,
          name: person.name,
          short: person.short,
          kind: 'absence',
          type: absence,
          label: labelForAbsence(absence)
        });
      }

      if (preference) {
        entries.push({
          staffId: person.id,
          name: person.name,
          short: person.short,
          kind: 'preference',
          type: preference,
          label: labelForPreference(preference)
        });
      }
    }

    if (entries.length) result.push({ dateIso, entries });
  }

  return result;
}

function initials(name) {
  return name
    .replace(/^(Dr\.|Prof\.|Fr\.|Hr\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function openDayEditor(dateIso) {
  const dates = Object.keys(getMonthData(state.currentYear, state.currentMonth).days || {});
  const index = dates.indexOf(dateIso);
  const row = document.querySelectorAll('#planTableBody tr')[index];
  row?.querySelector('.summary-cell .link-btn')?.click();
}

function renderPlanningOverview() {
  const panel = document.querySelector('.metric-panel');
  const grid = document.getElementById('statsGrid');
  if (!panel || !grid) return;

  panel.classList.add('planning-overview-panel');
  panel.querySelector('.eyebrow').textContent = 'Planungslage';
  panel.querySelector('h3').textContent = 'Urlaub, Frei & Wünsche';

  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const days = planningEntries(monthData);
  const absenceCount = days.reduce((sum, day) => sum + day.entries.filter(entry => entry.kind === 'absence').length, 0);
  const preferenceCount = days.reduce((sum, day) => sum + day.entries.filter(entry => entry.kind === 'preference').length, 0);

  grid.className = 'planning-overview';
  grid.innerHTML = `
    <div class="planning-summary-strip">
      <div><strong>${absenceCount}</strong><span>Urlaub / Frei</span></div>
      <div><strong>${preferenceCount}</strong><span>Dienstwünsche</span></div>
      <div><strong>${days.length}</strong><span>betroffene Tage</span></div>
    </div>
    <div class="planning-overview-note">FZA unmittelbar nach eigenem BD wird hier bewusst ausgeblendet.</div>
    <div class="planning-day-list"></div>`;

  const list = grid.querySelector('.planning-day-list');
  if (!days.length) {
    list.innerHTML = `
      <div class="planning-empty-state">
        <div class="planning-empty-icon">✓</div>
        <strong>Keine Einträge im aktuellen Monat</strong>
        <span>Urlaub, Frei und Dienstwünsche erscheinen hier automatisch.</span>
      </div>`;
    return;
  }

  days.forEach(day => {
    const date = parseIso(day.dateIso);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'planning-day-card';
    card.title = 'Tagesmarkierungen bearbeiten';
    card.innerHTML = `
      <div class="planning-date-block">
        <span class="planning-weekday">${weekdayLabel(day.dateIso)}</span>
        <strong>${String(date.getDate()).padStart(2, '0')}</strong>
        <span>${String(date.getMonth() + 1).padStart(2, '0')}</span>
      </div>
      <div class="planning-entry-stack"></div>
      <span class="planning-edit-arrow">›</span>`;

    const stack = card.querySelector('.planning-entry-stack');
    const grouped = new Map();
    day.entries.forEach(entry => {
      if (!grouped.has(entry.staffId)) grouped.set(entry.staffId, []);
      grouped.get(entry.staffId).push(entry);
    });

    grouped.forEach((entries, staffId) => {
      const person = getStaffById(state.staff, staffId);
      const row = document.createElement('div');
      row.className = 'planning-person-row';
      row.innerHTML = `
        <span class="planning-avatar">${initials(person?.name || staffId)}</span>
        <span class="planning-person-copy">
          <strong>${person?.name || staffId}</strong>
          <span class="planning-badges"></span>
        </span>`;

      const badges = row.querySelector('.planning-badges');
      entries.forEach(entry => {
        const badge = document.createElement('span');
        badge.className = `planning-badge ${entry.kind} ${entry.type}`;
        badge.textContent = entry.label;
        badges.appendChild(badge);
      });
      stack.appendChild(row);
    });

    card.addEventListener('click', () => openDayEditor(day.dateIso));
    list.appendChild(card);
  });
}

function injectStyles() {
  if (document.getElementById('planning-overview-styles')) return;
  const style = document.createElement('style');
  style.id = 'planning-overview-styles';
  style.textContent = `
    .planning-overview-panel { position: sticky; top: 1rem; overflow: hidden; }
    .planning-overview { display: grid; gap: .8rem; }
    .planning-summary-strip {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: .55rem;
      padding: .35rem; border-radius: 17px; background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.075);
    }
    .planning-summary-strip > div {
      min-width: 0; padding: .65rem .45rem; border-radius: 13px; text-align: center;
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.025));
    }
    .planning-summary-strip strong { display: block; font-size: 1.16rem; letter-spacing: -.04em; }
    .planning-summary-strip span { display: block; margin-top: .12rem; color: var(--muted); font-size: .68rem; line-height: 1.2; }
    .planning-overview-note {
      padding: .58rem .7rem; border-radius: 13px; color: rgba(245,246,247,.58); font-size: .74rem;
      background: rgba(255,255,255,.032); border: 1px solid rgba(255,255,255,.06);
    }
    .planning-day-list { display: grid; gap: .6rem; max-height: calc(100vh - 310px); overflow: auto; padding-right: .15rem; }
    .planning-day-card {
      width: 100%; display: grid; grid-template-columns: 48px minmax(0,1fr) 18px; align-items: center; gap: .72rem;
      padding: .72rem; text-align: left; border-radius: 17px;
      background: linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
      border: 1px solid rgba(255,255,255,.09);
    }
    .planning-day-card:hover { background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055)); }
    .planning-date-block {
      display: grid; place-items: center; align-content: center; min-height: 58px; border-radius: 14px;
      background: rgba(255,255,255,.065); border: 1px solid rgba(255,255,255,.08);
    }
    .planning-date-block strong { font-size: 1.22rem; line-height: 1; }
    .planning-date-block > span { color: var(--muted); font-size: .67rem; }
    .planning-date-block .planning-weekday { text-transform: uppercase; letter-spacing: .12em; }
    .planning-entry-stack { display: grid; gap: .52rem; min-width: 0; }
    .planning-person-row { display: grid; grid-template-columns: 30px minmax(0,1fr); gap: .55rem; align-items: center; }
    .planning-avatar {
      width: 30px; height: 30px; display: grid; place-items: center; border-radius: 10px;
      background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.1);
      font-size: .68rem; font-weight: 700; color: rgba(255,255,255,.82);
    }
    .planning-person-copy { display: grid; gap: .26rem; min-width: 0; }
    .planning-person-copy > strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .84rem; }
    .planning-badges { display: flex; flex-wrap: wrap; gap: .28rem; }
    .planning-badge {
      display: inline-flex; width: fit-content; padding: .22rem .43rem; border-radius: 999px;
      font-size: .65rem; line-height: 1.2; border: 1px solid rgba(255,255,255,.09); color: rgba(255,255,255,.76);
      background: rgba(255,255,255,.05);
    }
    .planning-badge.absence.urlaub { background: rgba(255,255,255,.11); color: #fff; }
    .planning-badge.absence.fza { border-style: dashed; }
    .planning-badge.preference { color: var(--yellow); border-color: rgba(242,207,102,.22); background: rgba(242,207,102,.065); }
    .planning-edit-arrow { color: rgba(255,255,255,.36); font-size: 1.35rem; }
    .planning-empty-state {
      display: grid; justify-items: center; gap: .38rem; padding: 2rem 1rem; text-align: center;
      border-radius: 18px; border: 1px dashed rgba(255,255,255,.11); color: var(--muted);
    }
    .planning-empty-state strong { color: var(--text); }
    .planning-empty-state span { font-size: .78rem; }
    .planning-empty-icon {
      width: 42px; height: 42px; display: grid; place-items: center; border-radius: 14px;
      background: rgba(82,212,138,.1); color: var(--green); border: 1px solid rgba(82,212,138,.18);
    }
    #planTableBody .assignment-btn.yellow { border-color: rgba(242,207,102,.28); }
    @media (max-width: 1120px) {
      .planning-overview-panel { position: static; }
      .planning-day-list { max-height: 520px; }
    }
  `;
  document.head.appendChild(style);
}

function refreshEnhancements() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    renderPlanningOverview();
    downgradeAssignedButtons();
    downgradePickerItems();
    downgradeIssueCards();
  });
}

function start() {
  injectStyles();

  const tableBody = document.getElementById('planTableBody');
  const pickerList = document.getElementById('pickerList');
  if (tableBody) new MutationObserver(refreshEnhancements).observe(tableBody, { childList: true, subtree: true });
  if (pickerList) new MutationObserver(refreshEnhancements).observe(pickerList, { childList: true, subtree: true });

  document.addEventListener('change', refreshEnhancements, true);
  document.addEventListener('click', event => {
    if (event.target.closest('#absenceManagerBtn, #preferenceManagerBtn, #batchApplyBtn, .meta-chip, #prevMonthBtn, #nextMonthBtn, #todayBtn')) {
      setTimeout(refreshEnhancements, 0);
    }
  }, true);

  setTimeout(refreshEnhancements, 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
