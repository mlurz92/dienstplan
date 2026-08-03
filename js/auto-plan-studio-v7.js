/** Auto-Plan Studio v7 – adaptive portfolio controls and execution telemetry. */
import './auto-plan-studio-v6.js?v=20260803.5';

const RELEASE = '20260803.5';

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v7-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v7.css?v=${RELEASE}`;
  link.dataset.autoPlanV7Style = 'true';
  document.head.append(link);
}

function enhance(dialog) {
  if (dialog.dataset.algorithmRevision === '7') return;
  dialog.dataset.algorithmRevision = '7';

  const ribbon = document.createElement('aside');
  ribbon.id = 'autoPlanV7Ribbon';
  ribbon.className = 'auto-plan-v7-ribbon';
  ribbon.innerHTML = '<span class="auto-plan-v7-orbit" aria-hidden="true"><i></i><i></i><i></i></span>'
    + '<div><b>Adaptive Constraint Portfolio</b><small>Globale Engpasswahl · inkrementelle Lastzähler · cost-aware ALNS · geräteadaptiver Worker-Pool</small></div>'
    + '<strong>ENGINE v7</strong>';
  dialog.querySelector('#autoPlanConfig')?.prepend(ribbon);

  const field = document.createElement('label');
  field.className = 'auto-plan-field auto-plan-field--v7';
  field.innerHTML = '<span>Leistungsprofil</span>'
    + '<select id="autoPlanPerformanceProfile" title="Passt Zahl und Rolle der Worker an Prozessor, Gerätespeicher und Monatsgröße an.">'
    + '<option value="responsive">Responsiv</option><option value="adaptive" selected>Adaptiv · empfohlen</option><option value="power">Power</option></select>'
    + '<small>Worker-Budget und UI-Reserve</small>';
  dialog.querySelector('.auto-plan-field-grid')?.prepend(field);

  const oldHeading = dialog.querySelector('.auto-plan-zero-red-guardrail header > span');
  if (oldHeading) oldHeading.textContent = 'Null-Rot-Guardrail · Algorithmus v7';
}

function initialize() {
  addStylesheet();
  const install = event => {
    const dialog = event?.detail?.dialog || document.getElementById('autoPlanDialog');
    if (!dialog) return false;
    enhance(dialog);
    return true;
  };
  if (!install()) window.addEventListener('autoplanstudioready', install, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
