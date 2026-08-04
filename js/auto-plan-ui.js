/**
 * Einstiegspunkt des Auto-Plan Studios und der v9-Anwendungsschicht.
 *
 * Die Startüberwachung wird zuerst ausgewertet, damit Fehler aus async
 * DOMContentLoaded-Initialisierungen nicht mehr als unbehandelte Rejection im
 * Ladezustand verschwinden. Danach folgen robuste Shell und v9-Studio.
 */
import './startup-health-v9.js?v=20260803.4';
import './ui-v8-5.js?v=20260803.4';
import './auto-plan-studio-v9.js?v=20260803.4';
