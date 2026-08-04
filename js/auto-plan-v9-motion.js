/** Auto-Plan v9 – vollständige Animation in allen Systemmodi. */

const RELEASE = '20260804.9';

function install() {
  if (document.querySelector('link[data-auto-plan-v9-motion]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9-always-motion.css?v=${RELEASE}`;
  link.dataset.autoPlanV9Motion = 'true';
  document.head.append(link);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
