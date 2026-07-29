import { state, getMonthData } from './state.js';
import { getAbsence, getAssignment } from './rules.js';

const SPACING_REASON = 'Weniger als 3 dienstfreie Tage seit letztem BD';
const LOW_SEVERITY_REASONS = [SPACING_REASON, 'BD-Richtwert', 'Wunsch:'];

function parseIso(iso) { return new Date(`${iso}T00:00:00`); }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function toIso(date) { return date.toISOString().slice(0, 10); }
function isWeekday(date) { return date.getDay() >= 1 && date.getDay() <= 5; }

function monthForDate(iso) {
  const date = parseIso(iso);
  return state.months.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
}

function absenceAt(staffId, iso) {
  const month = monthForDate(iso);
  return month ? getAbsence(month, staffId, iso) : '';
}

function isWeekdayBdFzaBd(staffId, dateIso) {
  const current = parseIso(dateIso);
  const fzaDate = addDays(current, -1);
  const previousBdDate = addDays(current, -2);
  return [current, fzaDate, previousBdDate].every(isWeekday)
    && absenceAt(staffId, toIso(fzaDate)) === 'fza'
    && getAssignment(state, toIso(previousBdDate), 'bd') === staffId;
}

function reasonsAllowDowngrade(reasons) {
  return reasons.length > 0 && reasons.every(reason => LOW_SEVERITY_REASONS.some(prefix => reason.startsWith(prefix)));
}

function downgrade(container, chip) {
  container.classList.remove('orange');
  container.classList.add('yellow');
  if (chip) {
    chip.classList.remove('orange');
    chip.classList.add('yellow');
    chip.textContent = 'Hinweis';
  }
}

function applyDowngrade() {
  const picker = state.currentPicker;
  if (picker?.role === 'bd') {
    document.querySelectorAll('#pickerList .picker-item.orange').forEach(item => {
      const name = item.querySelector('.name')?.textContent?.trim();
      const person = state.staff.find(entry => entry.name === name);
      const reasons = [...item.querySelectorAll('.reasons span')].map(node => node.textContent.trim()).filter(Boolean);
      if (person && isWeekdayBdFzaBd(person.id, picker.dateIso) && reasons.includes(SPACING_REASON) && reasonsAllowDowngrade(reasons)) {
        downgrade(item, item.querySelector('.small-chip'));
        item.title = item.title.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
      }
    });
  }

  const monthData = getMonthData(state.currentYear, state.currentMonth);
  const dates = Object.keys(monthData.days || {});
  document.querySelectorAll('#planTableBody tr').forEach((row, index) => {
    const dateIso = dates[index];
    const button = row.children[2]?.querySelector('.assignment-btn');
    if (!dateIso || !button?.title?.includes(SPACING_REASON)) return;
    const person = state.staff.find(entry => entry.name === button.querySelector('.assignment-name')?.textContent?.trim());
    const reasons = button.title.split('\n').map(value => value.trim()).filter(Boolean);
    if (person && isWeekdayBdFzaBd(person.id, dateIso) && reasonsAllowDowngrade(reasons)) {
      downgrade(button, button.querySelector('.small-chip'));
      button.title = button.title.replace(SPACING_REASON, 'BD–FZA–BD werktags: gelber Hinweis');
    }
  });
}

new MutationObserver(() => queueMicrotask(applyDowngrade)).observe(document.body, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', applyDowngrade);
