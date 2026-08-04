/** DienstplanRAD v9 – additive shell integration. */
import './ui-v8-5.js?v=20260804.9';

const RELEASE = '20260804.9';

function addStylesheet() {
  if (document.querySelector('link[data-v9-shell-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/app-v9.css?v=${RELEASE}`;
  link.dataset.v9ShellStyle = 'true';
  document.head.append(link);
}

function markRevision() {
  document.documentElement.dataset.appRevision = '9';
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.dataset.commandBarGeneration = '9';
}

export function installUiV9() {
  addStylesheet();
  markRevision();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUiV9, { once: true });
else installUiV9();
