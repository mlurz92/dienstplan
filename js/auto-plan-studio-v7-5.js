/** Auto-Plan Studio v7.5 – truthful constraint observatory. */
import './auto-plan-studio-v7.js?v=20260803.4';

const RELEASE = '20260803.4';

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v7-5-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v7-5.css?v=${RELEASE}`;
  link.dataset.autoPlanV75Style = 'true';
  document.head.append(link);
}

function enhance(dialog) {
  if (!dialog || dialog.dataset.algorithmRevision === '7.5') return;
  dialog.dataset.algorithmRevision = '7.5';

  const ribbon = dialog.querySelector('#autoPlanV7Ribbon');
  if (ribbon) {
    ribbon.id = 'autoPlanV75Ribbon';
    ribbon.classList.add('auto-plan-v7-5-ribbon');
    const title = ribbon.querySelector('b');
    const detail = ribbon.querySelector('small');
    const badge = ribbon.querySelector(':scope > strong');
    if (title) title.textContent = 'Truthful Constraint Observatory';
    if (detail) detail.textContent = 'Realer Portfoliofortschritt · beobachtete Dienstfelder · adaptives Framebudget · sicherer Abbruch';
    if (badge) badge.textContent = 'ENGINE v7.5';
  }

  const engineBadge = dialog.querySelector('.auto-plan-engine-badge span');
  if (engineBadge) engineBadge.textContent = 'Constraint Engine v7.5';
  const heading = dialog.querySelector('.auto-plan-zero-red-guardrail header > span');
  if (heading) heading.textContent = 'Null-Rot-Guardrail · Algorithmus v7.5';
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
