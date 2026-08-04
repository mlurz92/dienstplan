/**
 * DienstplanRAD v9 – globale Startüberwachung und nicht-destruktive Recovery.
 *
 * Ein Fehler in einem async DOMContentLoaded-Handler erscheint im Browser als
 * `unhandledrejection`; ohne äußere Grenze blieb die Anwendung bisher dauerhaft
 * bei „Lädt …“. Dieses Modul wird vor dem DOMContentLoaded-Start ausgewertet,
 * protokolliert synchrone und asynchrone Fehler und bietet eine Recovery, die
 * ausschließlich veraltete Code-Caches/Service-Worker entfernt. Lokale
 * Dienstplandaten werden ausdrücklich nicht gelöscht.
 */
const WATCHDOG_MS = 18_000;
const CACHE_PREFIX = 'dienstplanrad';
let failed = false;
let watchdog = null;

function traceId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function detailFrom(reason, source = 'startup') {
  const error = reason instanceof Error ? reason : null;
  return {
    traceId: traceId(),
    source,
    name: error?.name || 'Error',
    message: error?.message || String(reason || 'Unbekannter Startfehler'),
    stack: error?.stack || '',
    build: document.querySelector('meta[name="dienstplanrad-build"]')?.content || 'unknown',
    url: location.pathname
  };
}

async function clearCodeCachesAndReload(button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Code-Cache wird bereinigt …';
  }
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(registration => {
        const worker = registration.active || registration.waiting || registration.installing;
        if (!worker) return false;
        try { return new URL(worker.scriptURL, location.href).pathname === '/sw.js'; }
        catch { return false; }
      }).map(registration => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    }
  } finally {
    location.reload();
  }
}

function renderFailure(detail) {
  if (!document.body) return;
  let panel = document.getElementById('startupFailureV9');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'startupFailureV9';
    panel.className = 'startup-failure-v9';
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    panel.innerHTML = `<div><span>Startdiagnose</span><h2>DienstplanRAD konnte nicht vollständig gestartet werden</h2><p id="startupFailureMessage"></p><small id="startupFailureTrace"></small></div><menu><button type="button" id="startupRetryBtn">Neu laden</button><button type="button" class="secondary" id="startupRepairBtn">Code-Cache bereinigen und neu laden</button></menu>`;
    document.body.prepend(panel);
    panel.querySelector('#startupRetryBtn')?.addEventListener('click', () => location.reload());
    panel.querySelector('#startupRepairBtn')?.addEventListener('click', event => clearCodeCachesAndReload(event.currentTarget));
  }
  const message = panel.querySelector('#startupFailureMessage');
  const trace = panel.querySelector('#startupFailureTrace');
  if (message) message.textContent = `${detail.name}: ${detail.message}`;
  if (trace) trace.textContent = `Diagnose-ID ${detail.traceId} · Build ${detail.build}`;

  const status = document.getElementById('saveStatus');
  const dot = document.getElementById('statusDot');
  if (status) status.textContent = 'Startfehler – Diagnose eingeblendet';
  if (dot) dot.style.background = 'var(--red, #c94756)';
  document.documentElement.dataset.startupState = 'failed';
}

function report(reason, source) {
  if (failed && source === 'watchdog') return;
  failed = true;
  clearTimeout(watchdog);
  const detail = detailFrom(reason, source);
  console.error('[DienstplanRAD] Startfehler', detail);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderFailure(detail), { once: true });
  } else renderFailure(detail);
  window.dispatchEvent(new CustomEvent('dienstplanstartupfailed', { detail }));
}

function looksReady() {
  const status = document.getElementById('saveStatus')?.textContent?.trim() || '';
  const table = document.getElementById('planTableBody');
  return Boolean(table?.children.length) && status !== 'Lädt …' && status !== 'Lädt';
}

function startWatchdog() {
  clearTimeout(watchdog);
  document.documentElement.dataset.startupState = 'starting';
  watchdog = setTimeout(() => {
    if (looksReady()) {
      document.documentElement.dataset.startupState = 'ready';
      return;
    }
    report(new Error('Die Initialisierung blieb länger als 18 Sekunden im Ladezustand.'), 'watchdog');
  }, WATCHDOG_MS);

  const status = document.getElementById('saveStatus');
  if (status && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      if (!looksReady()) return;
      clearTimeout(watchdog);
      document.documentElement.dataset.startupState = 'ready';
      observer.disconnect();
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  }
}

window.addEventListener('error', event => {
  if (event.error) report(event.error, 'window.error');
}, { capture: true });

window.addEventListener('unhandledrejection', event => {
  report(event.reason, 'unhandledrejection');
});

window.addEventListener('dienstplanstartuperror', event => {
  report(new Error(event.detail?.message || 'UI-Initialisierung fehlgeschlagen.'), event.detail?.source || 'ui-extension');
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWatchdog, { once: true });
else startWatchdog();

window.__dienstplanStartupHealth = Object.freeze({ report, clearCodeCachesAndReload });
