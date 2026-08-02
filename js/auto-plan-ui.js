import './auto-plan-studio-v3.js?v=20260801.11';

function installAutoPlanV4Styles() {
  const href = '/auto-plan-v4.css';
  if (document.querySelector(`link[data-auto-plan-style="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${href}?v=20260801.11`;
  link.dataset.autoPlanStyle = href;
  document.head.append(link);
}

function normalizeProposalCopy(root = document) {
  for (const status of root.querySelectorAll?.('.auto-plan-row-status') || []) {
    const corrected = status.textContent?.replace(/^(\d+) Vorschlage\b/, '$1 Vorschläge');
    if (corrected && corrected !== status.textContent) status.textContent = corrected;
  }
}

const copyObserver = new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.('.auto-plan-row-status')) normalizeProposalCopy(node.parentElement || node);
      else if (node.querySelector?.('.auto-plan-row-status')) normalizeProposalCopy(node);
    }
  }
});

const initializeAutoPlanV4 = () => {
  installAutoPlanV4Styles();
  normalizeProposalCopy();
  copyObserver.observe(document.documentElement, { childList: true, subtree: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAutoPlanV4, { once: true });
} else {
  initializeAutoPlanV4();
}
