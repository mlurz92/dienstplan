/**
 * Loads the final narrow-viewport geometry overrides after every compatible
 * Auto-Plan Studio stylesheet. Keeping this final layer separate prevents the
 * cumulative v9.1 density rules from collapsing the configuration grid on
 * phone-sized viewports.
 */

const RELEASE = '20260805.1';

function install() {
  if (document.querySelector('link[data-auto-plan-v95-layout-fix]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/auto-plan-studio-v9-5-layout-fix.css?v=${RELEASE}`;
  link.dataset.autoPlanV95LayoutFix = 'true';
  document.head.append(link);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
