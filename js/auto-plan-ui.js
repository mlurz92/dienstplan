/**
 * Einstiegspunkt der produktiven Auto-Plan-/UI-Schicht v9.
 *
 * Die Module erweitern die bewährte v8.5-Anwendung additiv: kostenlose
 * Browser-Hybridengine, exakte Suchtelemetrie, viewportfestes Studio und
 * kontrastgehärtete Diensttabelle im Dunkelmodus.
 */
import './ui-v9.js?v=20260804.9';
import './auto-plan-studio-v9.js?v=20260804.9';
import './auto-plan-studio-v9-contract.js?v=20260804.9';
import './auto-plan-v9-truth.js?v=20260804.9';
import './auto-plan-v9-motion.js?v=20260804.9';

/**
 * Layout-Invariante für die gemeinsam scrollende Vorschlagstabelle.
 *
 * Die Tooltip-Schicht markiert auch Tabellenüberschriften mit data-tooltip und
 * gibt generischen Informationsträgern position: relative. Für den Tabellenkopf
 * ist position: sticky jedoch funktional: Er muss beim Prüfen langer Monate am
 * oberen Rand des Auto-Plan-Arbeitsbereichs stehen bleiben. Der ID-gebundene
 * Guard stellt diese absichtliche Ausnahme nach allen Stylesheets wieder her,
 * ohne Tooltips oder andere positionierte Informationsträger zu verändern.
 */
function installAutoPlanV9LayoutGuards() {
  if (document.getElementById('autoPlanV9LayoutGuards')) return;
  const style = document.createElement('style');
  style.id = 'autoPlanV9LayoutGuards';
  style.textContent = `
    .auto-plan-dialog[data-engine-revision="9"] #autoPlanProposalTable thead th {
      position: sticky;
      inset-block-start: 0;
    }
  `;
  document.head.append(style);
}

if (typeof document !== 'undefined') installAutoPlanV9LayoutGuards();
