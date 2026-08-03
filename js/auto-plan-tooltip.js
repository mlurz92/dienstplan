/**
 * Zugängliche Tooltips für das Auto-Plan Studio.
 *
 * Native title-Blasen werden in einen gemeinsamen role=tooltip-Container
 * überführt: per Pointer und Tastatur erreichbar, hoverbar, persistent und mit
 * Escape schließbar.
 */

const TOOLTIP_ID = 'autoPlanRichTooltip';

export function installAutoPlanTooltips(dialog) {
  if (!dialog || dialog.dataset.tooltipsReady === 'true') return;
  dialog.dataset.tooltipsReady = 'true';

  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.className = 'auto-plan-rich-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  let active = null;
  let hideTimer;
  let hovered = false;

  const describe = element => {
    const tokens = new Set(String(element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    tokens.add(TOOLTIP_ID);
    element.setAttribute('aria-describedby', [...tokens].join(' '));
  };

  const hydrate = root => {
    const items = [
      ...(root.matches?.('[title]') ? [root] : []),
      ...root.querySelectorAll('[title]')
    ];
    for (const element of items) {
      const text = element.getAttribute('title')?.trim();
      if (!text) continue;
      element.dataset.autoTooltip = text;
      element.removeAttribute('title');
      describe(element);
      if (!element.matches('button, input, select, textarea, a[href], [tabindex]')) {
        element.tabIndex = 0;
      }
    }
  };

  const position = () => {
    if (!active || tooltip.hidden) return;
    const anchor = active.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const margin = 10;
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(margin, Math.min(document.documentElement.clientWidth - box.width - margin, left));
    let top = anchor.bottom + 8;
    if (top + box.height > document.documentElement.clientHeight - margin) top = anchor.top - box.height - 8;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
  };

  const show = trigger => {
    if (document.documentElement.dataset.richTooltips === 'false') return;
    if (!trigger?.dataset?.autoTooltip) return;
    clearTimeout(hideTimer);
    active = trigger;
    tooltip.textContent = trigger.dataset.autoTooltip;
    tooltip.hidden = false;
    tooltip.dataset.visible = 'true';
    requestAnimationFrame(position);
  };

  const hide = () => {
    clearTimeout(hideTimer);
    tooltip.hidden = true;
    delete tooltip.dataset.visible;
    active = null;
  };

  const scheduleHide = (delay = 90) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!hovered) hide();
    }, delay);
  };

  hydrate(dialog);

  dialog.addEventListener('pointerover', event => {
    const trigger = event.target.closest?.('[data-auto-tooltip]');
    if (trigger && !trigger.contains(event.relatedTarget)) show(trigger);
  });
  dialog.addEventListener('pointerout', event => {
    const trigger = event.target.closest?.('[data-auto-tooltip]');
    if (trigger && !trigger.contains(event.relatedTarget) && !tooltip.contains(event.relatedTarget)) scheduleHide();
  });
  dialog.addEventListener('focusin', event => {
    const trigger = event.target.closest?.('[data-auto-tooltip]');
    if (trigger) show(trigger);
  });
  dialog.addEventListener('focusout', event => {
    if (event.target.closest?.('[data-auto-tooltip]')) scheduleHide(20);
  });
  tooltip.addEventListener('pointerenter', () => {
    hovered = true;
    clearTimeout(hideTimer);
  });
  tooltip.addEventListener('pointerleave', () => {
    hovered = false;
    scheduleHide(70);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) hide();
  });
  window.addEventListener('resize', position, { passive: true });
  dialog.querySelector('#autoPlanBody')?.addEventListener('scroll', position, { passive: true });

  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) hydrate(node);
      }
    }
  }).observe(dialog, { childList: true, subtree: true });
}
