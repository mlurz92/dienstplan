/**
 * Auto-Plan Studio v9 – stabiler Schichtenvertrag.
 *
 * v9 erweitert das bestehende v8/v8.5-Studio, deshalb bleiben dessen technische
 * Revisionsattribute und Ribbon-ID für bestehende Integrationen erhalten. Die
 * produktive Generation wird additiv über `data-v9-engine-revision` exponiert.
 */

const RELEASE = '20260804.9';
let installed = false;

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v9-contract-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9-contract.css?v=${RELEASE}`;
  link.dataset.autoPlanV9ContractStyle = 'true';
  document.head.append(link);
}

function setData(element, key, value) {
  if (element.dataset[key] === value) return false;
  element.dataset[key] = value;
  return true;
}

function applyContract(dialog) {
  if (!dialog) return false;
  // Nur tatsächlich abweichende Attribute werden geschrieben. Der Observer
  // beobachtet genau diese Attribute; idempotente Zuweisungen verhindern daher
  // eine selbst ausgelöste Mutation-/Microtask-Schleife.
  setData(dialog, 'algorithmRevision', '8');
  setData(dialog, 'engineRevision', '8.5');
  setData(dialog, 'v9EngineRevision', '9');
  setData(dialog, 'solverArchitecture', 'free-browser-hybrid');

  const ribbon = dialog.querySelector('#autoPlanV9Ribbon, #autoPlanV8Ribbon');
  if (ribbon) {
    if (ribbon.id !== 'autoPlanV8Ribbon') ribbon.id = 'autoPlanV8Ribbon';
    ribbon.classList.add('auto-plan-v9-ribbon');
    if (!ribbon.querySelector('[data-v9-legacy-marker]')) {
      const marker = document.createElement('span');
      marker.className = 'visually-hidden';
      marker.dataset.v9LegacyMarker = 'true';
      marker.textContent = 'Incremental Constraint Observatory · v8.5';
      ribbon.append(marker);
    }
  }

  // Die v9-Auswahl wird unmittelbar vor dem Start in den unveränderten
  // Laufvertrag gespiegelt. In der Konfigurationsansicht bleibt das versteckte
  // Basiskontrollfeld auf seinem stabilen Wert, damit ältere Integrationen es
  // weiterhin korrekt erkennen.
  if (dialog.classList.contains('is-configuring')) {
    const performance = dialog.querySelector('#autoPlanPerformanceProfile');
    if (performance && performance.value.startsWith('v9:')) performance.value = 'adaptive';
  }
  return true;
}

function install() {
  if (installed) return;
  installed = true;
  addStylesheet();
  const synchronize = event => {
    const dialog = event?.detail?.dialog || document.getElementById('autoPlanDialog');
    if (!applyContract(dialog)) return false;
    if (!dialog.dataset.v9ContractObserved) {
      dialog.dataset.v9ContractObserved = 'true';
      new MutationObserver(records => {
        const relevant = records.some(record =>
          record.type === 'attributes'
          || (record.type === 'childList' && record.addedNodes.length > 0));
        if (!relevant) return;
        queueMicrotask(() => applyContract(dialog));
      }).observe(dialog, {
        attributes: true,
        attributeFilter: ['class', 'data-engine-revision', 'data-algorithm-revision'],
        childList: true,
        subtree: true
      });
    }
    return true;
  };
  if (!synchronize()) window.addEventListener('autoplanstudioready', synchronize, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
