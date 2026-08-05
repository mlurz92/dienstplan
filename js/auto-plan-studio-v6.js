/**
 * Auto-Plan Studio v6 – progressive Erweiterung der stabilen v5-Oberfläche.
 */

import './auto-plan-studio-v5.js?v=20260805.1';
import { installAutoPlanGuardrail } from './auto-plan-guardrail.js?v=20260805.1';
import { installAutoPlanTooltips } from './auto-plan-tooltip.js?v=20260805.1';

const RELEASE = '20260805.1';

function addStylesheet() {
  if (document.querySelector('link[data-auto-plan-v6-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v6.css?v=${RELEASE}`;
  link.dataset.autoPlanV6Style = 'true';
  document.head.append(link);
}

function initialize() {
  addStylesheet();
  const install = event => {
    const dialog = event?.detail?.dialog || document.getElementById('autoPlanDialog');
    if (!dialog) return false;
    installAutoPlanGuardrail(dialog);
    installAutoPlanTooltips(dialog);
    return true;
  };
  if (!install()) window.addEventListener('autoplanstudioready', install, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
