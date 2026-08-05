/**
 * Einstiegspunkt des Auto-Plan Studios und der v9.5-Anwendungsschicht.
 *
 * Die Reihenfolge ist verbindlich: Erst entsteht das bewährte Studio, danach
 * ergänzt v9 die vorhandenen exakten Bedienelemente, anschließend korrigiert
 * und erweitert v9.5 Modellnachweis, LNS, Tooltips und Animation. Die letzte
 * additive Schicht härtet ausschließlich die Geometrie kleiner Viewports.
 */
import './ui-v8-5.js?v=20260803.4';
import './auto-plan-studio-v8-5.js?v=20260803.4';
import './auto-plan-studio-v9.js?v=20260803.4';
import './auto-plan-studio-v9-5.js?v=20260805.1';
import './auto-plan-studio-v9-5-layout-fix.js?v=20260805.1';
