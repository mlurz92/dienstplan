/**
 * Auto-Plan Studio v6 – progressive Erweiterung der stabilen v5-Oberfläche.
 */

import './auto-plan-studio-v5.js?v=20260803.2';
import { installAutoPlanGuardrail } from './auto-plan-guardrail.js?v=20260803.2';
import { installAutoPlanTooltips } from './auto-plan-tooltip.js?v=20260803.2';

const RELEASE = '20260803.2';

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
  const attempt = () => {
    const dialog = document.getElementById('autoPlanDialog');
    if (!dialog) {
      requestAnimationFrame(attempt);
      return;
    }
    installAutoPlanGuardrail(dialog);
    installAutoPlanTooltips(dialog);
  };
  attempt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
