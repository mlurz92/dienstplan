import { api } from './api.js?v=20260801.11';
import { loadMonth, monthKey, state } from './state.js?v=20260801.11';

const MOTION_DURATION_MS = 430;
const PREFETCH_TIMEOUT_MS = 4500;
const STABILIZATION_FRAMES = 5;
const NAVIGATION_CONTROLS = new Set(['prevMonthBtn', 'nextMonthBtn', 'todayBtn']);
const APP_LOAD_HANDOFF_MS = 900;
const FROZEN_THEME_VARIABLES = [
  '--month-accent', '--month-accent-strong', '--month-ink', '--month-glow', '--month-panel-tint',
  '--weekday-field-bg', '--saturday-row-bg', '--sunday-row-bg', '--holiday-row-bg'
];

// Der Übergangs-Preload und openCurrentMonth benötigen denselben Monatsstand.
// Ein einmalig konsumierbarer Handoff verhindert einen zweiten identischen GET,
// ohne den expliziten Button „Serverstand neu laden“ längerfristig zu cachen.
const originalGetMonth = api.getMonth.bind(api);
const monthLoadHandoffs = new Map();
api.getMonth = (year, month) => {
  const key = monthKey(year, month);
  const handoff = monthLoadHandoffs.get(key);
  if (handoff && handoff.expiresAt >= performance.now()) {
    monthLoadHandoffs.delete(key);
    return Promise.resolve(structuredClone(handoff.payload));
  }
  if (handoff) monthLoadHandoffs.delete(key);
  return originalGetMonth(year, month);
};

function installTransitionStylesheet() {
  if (typeof document === 'undefined' || document.querySelector('link[data-month-motion-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/transitions.css?v=20260801.11';
  link.dataset.monthMotionStyles = 'true';
  document.head.appendChild(link);
}

installTransitionStylesheet();

let bypassInterception = false;
let navigationGeneration = 0;
let activeViewTransition = null;
let activeFallback = null;

function selectedDate() {
  const now = new Date();
  return {
    year: Number(document.getElementById('yearSelect')?.value) || Number(document.documentElement.dataset.year) || now.getFullYear(),
    month: Number(document.getElementById('monthSelect')?.value) || Number(document.documentElement.dataset.month) || now.getMonth() + 1
  };
}

function committedDate() {
  const root = document.documentElement;
  const fallback = selectedDate();
  return {
    year: Number(root.dataset.year) || fallback.year,
    month: Number(root.dataset.month) || fallback.month
  };
}

function normalizeDate(year, month) {
  const date = new Date(Number(year), Number(month) - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function offsetDate(date, delta) {
  return normalizeDate(date.year, date.month + delta);
}

function sameDate(first, second) {
  return first.year === second.year && first.month === second.month;
}

function directionBetween(from, to) {
  return Math.sign((to.year * 12 + to.month) - (from.year * 12 + from.month)) || 1;
}

function targetFromControl(control) {
  const current = selectedDate();
  if (control.id === 'prevMonthBtn') return offsetDate(current, -1);
  if (control.id === 'nextMonthBtn') return offsetDate(current, 1);
  if (control.id === 'todayBtn') {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return current;
}

function setSelectors(date) {
  const monthSelect = document.getElementById('monthSelect');
  const yearSelect = document.getElementById('yearSelect');
  if (yearSelect && ![...yearSelect.options].some(option => Number(option.value) === date.year)) {
    const option = new Option(String(date.year), String(date.year));
    const before = [...yearSelect.options].find(existing => Number(existing.value) > date.year);
    if (before) yearSelect.insertBefore(option, before);
    else yearSelect.append(option);
  }
  if (yearSelect) yearSelect.value = String(date.year);
  if (monthSelect) monthSelect.value = String(date.month);
}

function dispatchAppNavigation(date) {
  const monthSelect = document.getElementById('monthSelect');
  if (!monthSelect) return;
  setSelectors(date);
  bypassInterception = true;
  try {
    monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    bypassInterception = false;
  }
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function primeAppLoadHandoff(date) {
  const key = monthKey(date.year, date.month);
  const month = state.months.get(key);
  if (!month) return;
  monthLoadHandoffs.set(key, {
    expiresAt: performance.now() + APP_LOAD_HANDOFF_MS,
    payload: { ok: true, month: structuredClone(month) }
  });
  setTimeout(() => {
    const current = monthLoadHandoffs.get(key);
    if (current?.expiresAt <= performance.now()) monthLoadHandoffs.delete(key);
  }, APP_LOAD_HANDOFF_MS + 50);
}

function sourceIsFresh(date) {
  const key = monthKey(date.year, date.month);
  if (!state.months.has(key)) return false;
  const source = state.monthSources.get(key);
  return source === 'server' || (source === 'local' && state.dirtyMonths.has(key));
}

async function preloadTarget(date, generation) {
  if (sourceIsFresh(date)) {
    primeAppLoadHandoff(date);
    return;
  }

  const load = loadMonth(date.year, date.month).catch(() => null);
  const timeout = new Promise(resolve => setTimeout(resolve, PREFETCH_TIMEOUT_MS, null));
  await Promise.race([load, timeout]);
  if (generation !== navigationGeneration) throw new DOMException('Navigation superseded', 'AbortError');
  primeAppLoadHandoff(date);
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function stabilizeNewView(date, generation) {
  const expectedRows = new Date(date.year, date.month, 0).getDate();
  let consecutiveStableFrames = 0;

  while (consecutiveStableFrames < STABILIZATION_FRAMES) {
    await nextFrame();
    if (generation !== navigationGeneration) throw new DOMException('Navigation superseded', 'AbortError');

    const root = document.documentElement;
    const rows = document.querySelectorAll('#planTableBody tr').length;
    const title = document.getElementById('monthTitle')?.textContent || '';
    const stable = Number(root.dataset.year) === date.year
      && Number(root.dataset.month) === date.month
      && rows === expectedRows
      && title.includes(String(date.year));

    consecutiveStableFrames = stable ? consecutiveStableFrames + 1 : 0;
  }
}

function setMotionState(stateName, engine, direction) {
  const root = document.documentElement;
  root.dataset.monthMotionState = stateName;
  if (engine) root.dataset.monthMotionEngine = engine;
  if (direction) root.dataset.monthMotionDirection = direction > 0 ? 'forward' : 'backward';
}

function clearMotionState(generation) {
  if (generation !== navigationGeneration) return;
  const root = document.documentElement;
  root.dataset.monthMotionState = 'idle';
  delete root.dataset.monthMotionDirection;
}

function cancelActiveTransition() {
  if (activeViewTransition?.skipTransition) activeViewTransition.skipTransition();
  activeViewTransition = null;

  if (activeFallback) {
    activeFallback.cancel();
    activeFallback = null;
  }
}

function syncFormState(source, clone) {
  const sourceControls = source.querySelectorAll('input, select, textarea');
  const cloneControls = clone.querySelectorAll('input, select, textarea');
  sourceControls.forEach((control, index) => {
    const copy = cloneControls[index];
    if (!copy) return;
    if ('value' in copy) copy.value = control.value;
    if ('checked' in copy) copy.checked = control.checked;
    copy.disabled = true;
  });
}

function freezeThemeVariables(clone) {
  const computed = getComputedStyle(document.documentElement);
  for (const name of FROZEN_THEME_VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) clone.style.setProperty(name, value);
  }
}

function stripCloneIdentity(root) {
  root.removeAttribute('id');
  root.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  root.querySelectorAll('[name]').forEach(element => element.removeAttribute('name'));
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
}

function createFallbackSnapshot() {
  const source = document.querySelector('.sheet-panel');
  if (!source) return null;

  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true);
  syncFormState(source, clone);
  freezeThemeVariables(clone);
  stripCloneIdentity(clone);
  clone.classList.add('month-motion-fallback-snapshot');
  Object.assign(clone.style, {
    position: 'fixed',
    zIndex: '2147483000',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    overflow: 'hidden'
  });
  document.body.appendChild(clone);
  return { source, clone };
}

async function runFallbackTransition(date, direction, generation) {
  const snapshot = createFallbackSnapshot();
  if (!snapshot) {
    await preloadTarget(date, generation);
    dispatchAppNavigation(date);
    await stabilizeNewView(date, generation);
    return;
  }

  const { source, clone } = snapshot;
  source.classList.add('month-motion-fallback-live');
  source.style.opacity = '0';

  let cancelled = false;
  activeFallback = {
    cancel() {
      cancelled = true;
      clone.getAnimations().forEach(animation => animation.cancel());
      source.getAnimations().forEach(animation => animation.cancel());
      clone.remove();
      source.classList.remove('month-motion-fallback-live');
      source.style.removeProperty('opacity');
      source.style.removeProperty('transform');
      source.style.removeProperty('will-change');
    }
  };

  try {
    await preloadTarget(date, generation);
    if (cancelled) return;
    dispatchAppNavigation(date);
    await stabilizeNewView(date, generation);
    if (cancelled) return;

    const sign = direction > 0 ? 1 : -1;
    source.style.opacity = '0';
    source.style.transform = `translate3d(${sign * 34}px, 0, 0) scale(.994)`;
    source.style.willChange = 'transform, opacity';

    const options = {
      duration: MOTION_DURATION_MS,
      easing: 'cubic-bezier(.22, 1, .36, 1)',
      fill: 'both'
    };
    const outgoing = clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: `translate3d(${-sign * 28}px, 0, 0) scale(.994)`, opacity: 0 }
    ], options);
    const incoming = source.animate([
      { transform: `translate3d(${sign * 34}px, 0, 0) scale(.994)`, opacity: 0 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ], options);

    setMotionState('animating', 'waapi-fallback', direction);
    await Promise.allSettled([outgoing.finished, incoming.finished]);
  } finally {
    if (!cancelled) {
      clone.remove();
      source.classList.remove('month-motion-fallback-live');
      source.style.removeProperty('opacity');
      source.style.removeProperty('transform');
      source.style.removeProperty('will-change');
      activeFallback = null;
    }
  }
}

async function runNativeTransition(date, direction, generation) {
  setMotionState('preloading', 'native-view-transition', direction);

  const transition = document.startViewTransition(async () => {
    await preloadTarget(date, generation);
    dispatchAppNavigation(date);
    await stabilizeNewView(date, generation);
  });
  activeViewTransition = transition;

  transition.updateCallbackDone.then(() => {
    if (generation === navigationGeneration) setMotionState('animating', 'native-view-transition', direction);
  }).catch(() => {});

  try {
    await transition.finished;
  } finally {
    if (activeViewTransition === transition) activeViewTransition = null;
  }
}

async function navigate(date, fromDate) {
  const target = normalizeDate(date.year, date.month);
  const origin = normalizeDate(fromDate.year, fromDate.month);
  const direction = directionBetween(origin, target);
  const generation = ++navigationGeneration;

  cancelActiveTransition();
  setMotionState('preloading', document.startViewTransition ? 'native-view-transition' : 'waapi-fallback', direction);

  try {
    if (sameDate(origin, target) || prefersReducedMotion()) {
      await preloadTarget(target, generation);
      dispatchAppNavigation(target);
      await stabilizeNewView(target, generation);
      return;
    }

    if (typeof document.startViewTransition === 'function') {
      await runNativeTransition(target, direction, generation);
    } else {
      await runFallbackTransition(target, direction, generation);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      dispatchAppNavigation(target);
      console.warn('Monatsanimation wurde auf einen direkten Wechsel zurückgesetzt.', error);
    }
  } finally {
    clearMotionState(generation);
  }
}

function interceptClick(event) {
  if (bypassInterception || event.defaultPrevented || event.button !== 0) return;
  const control = event.target instanceof Element ? event.target.closest('button') : null;
  if (!control || !NAVIGATION_CONTROLS.has(control.id)) return;

  const origin = selectedDate();
  const target = targetFromControl(control);
  event.preventDefault();
  event.stopImmediatePropagation();
  void navigate(target, origin);
}

function interceptSelection(event) {
  if (bypassInterception) return;
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || !['monthSelect', 'yearSelect'].includes(select.id)) return;

  const target = selectedDate();
  const origin = committedDate();
  event.preventDefault();
  event.stopImmediatePropagation();

  // Der Browser hat die Select-Auswahl bereits aktualisiert, der Monatsplan aber
  // noch nicht. Für einen konsistenten alten Snapshot werden die Selects bis zum
  // eigentlichen Update-Callback kurz auf den zuletzt dargestellten Monat gesetzt.
  setSelectors(origin);
  void navigate(target, origin);
}

function initialize() {
  setMotionState('idle', null, 0);
  document.addEventListener('click', interceptClick, true);
  document.addEventListener('change', interceptSelection, true);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}
