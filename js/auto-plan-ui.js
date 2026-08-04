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
 * Layout-Invarianten der v9-Oberfläche.
 *
 * 1. Die Tooltip-Schicht markiert auch Tabellenüberschriften mit data-tooltip
 *    und gibt generischen Informationsträgern position: relative. Für den
 *    Tabellenkopf ist position: sticky jedoch funktional.
 * 2. Während eines Laufs besitzt das Studio genau eine feste Viewport-Höhe.
 *    Der Algorithmus-Kommentar darf diese Höhe nicht durch neue Meldungen
 *    vergrößern: Nur sein eigener Meldungsstrom scrollt. Konfiguration und
 *    Ergebnis behalten dagegen den bewusst gemeinsamen Modal-Scrollbereich.
 */
function installAutoPlanV9LayoutGuards() {
  if (document.getElementById('autoPlanV9LayoutGuards')) return;
  const style = document.createElement('style');
  style.id = 'autoPlanV9LayoutGuards';
  style.textContent = `
    .auto-plan-dialog[data-v9-engine-revision="9"] #autoPlanProposalTable thead th {
      position: sticky;
      inset-block-start: 0;
    }

    .auto-plan-dialog[data-v9-engine-revision="9"] #autoPlanLog {
      min-block-size: 0;
      overflow: hidden auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    @media (min-width: 821px) {
      .auto-plan-dialog[data-v9-engine-revision="9"].is-running #autoPlanBody {
        overflow: hidden;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running #autoPlanStage {
        flex: 1 1 0;
        min-block-size: 0;
        max-block-size: 100%;
        grid-template-columns: minmax(250px, .72fr) minmax(0, 1.28fr);
        grid-template-rows: minmax(0, 1fr);
        align-items: stretch;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-console {
        min-block-size: 0;
        max-block-size: 100%;
        grid-template-rows: auto auto auto clamp(112px, 20dvh, 168px) auto;
        align-content: start;
        overflow: hidden;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-log {
        min-block-size: 0;
        max-block-size: 100%;
        block-size: 100%;
        overflow: hidden;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running #autoPlanLog {
        min-block-size: 0;
        max-block-size: 100%;
        overflow: hidden auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v85-theatre ol {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }

    @media (min-width: 821px) and (max-height: 700px) {
      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-console {
        gap: 6px;
        padding: 8px;
        grid-template-rows: auto auto auto clamp(84px, 16dvh, 112px) auto;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-phase {
        padding: 4px 5px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v8-lanes {
        gap: 2px;
        margin-block: 2px 0;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v85-theatre {
        padding: 6px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v85-theatre ol {
        gap: 5px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v85-theatre li {
        min-block-size: 46px;
        padding: 5px 6px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v85-theatre li small {
        -webkit-line-clamp: 1;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-v9-exact-meter {
        gap: 4px;
        margin-top: 5px;
        padding: 5px 6px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-live-metrics {
        gap: 4px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-live-metrics > div {
        padding: 4px 6px;
      }

      .auto-plan-dialog[data-v9-engine-revision="9"].is-running .auto-plan-live-metrics strong {
        font-size: .82rem;
      }
    }
  `;
  document.head.append(style);
}

if (typeof document !== 'undefined') installAutoPlanV9LayoutGuards();
