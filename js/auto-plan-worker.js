/**
 * Rechenkern des Auto-Plans als eigener Arbeitsstrang.
 *
 * Der Lauf wandert vollständig aus dem Anzeigestrang heraus. Das hat zwei
 * Wirkungen, die sich mit Taktung allein nicht erreichen lassen:
 *
 * 1. **Die Oberfläche bleibt frei.** Fortschrittsbalken, Animation und
 *    Abbruchschalter laufen im Anzeigestrang weiter, während hier gerechnet
 *    wird. Es gibt keinen Wettbewerb mehr um dieselbe Schleife.
 * 2. **Die Rechnung wird schneller.** Im Anzeigestrang musste sie regelmäßig
 *    bis zum nächsten Bildaufbau abgeben und verlor dadurch einen erheblichen
 *    Teil ihrer Zeit ans Warten. Hier gibt es nichts zu zeichnen; der Lauf
 *    nutzt seine Zeit vollständig zum Suchen.
 *
 * Fachlich ändert sich nichts: Es laufen dieselben Module mit derselben
 * Regelengine. Eine zweite, vereinfachte Regelfassung gibt es bewusst nicht.
 *
 * Abgebrochen wird von außen durch Beenden des Arbeitsstrangs; ein
 * Abbruchsignal lässt sich nicht über die Strangs hinweg reichen.
 */

import { constructAutoPlan, perfectAutoPlan } from './auto-planner.js?v=20260803.4';

/**
 * Fortschrittsmeldungen tragen am Ende das vollständige Ergebnis. Über die
 * Strangs hinweg wäre das eine unnötige zweite Kopie des gesamten Monats – die
 * Endmeldung liefert es ohnehin.
 */
function withoutResult(update) {
  if (!update || update.result === undefined) return update;
  const { result: _ignored, ...rest } = update;
  return rest;
}

/**
 * Zwei Aufträge, die der Anzeigestrang getrennt vergibt:
 *
 * - `construct` baut den Monat einmal auf. Das Ergebnis geht zurück und wird
 *   an alle Perfektionsläufe verteilt.
 * - `perfect` verbessert diesen Aufbau mit eigenem Startwert. Mehrere Stränge
 *   tun das gleichzeitig; der beste Vorschlag gewinnt.
 *
 * Die Trennung vermeidet, dass jeder Strang denselben Aufbau erneut rechnet.
 */
self.addEventListener('message', async event => {
  const request = event.data;
  if (!request) return;
  const { type, runId, state, monthData, year, month, runConfig, constructed, progressFloor } = request;
  const report = update => self.postMessage({ type: 'progress', runId, update: withoutResult(update) });

  try {
    if (type === 'construct') {
      const result = await constructAutoPlan({ state, monthData, year, month, runConfig, onProgress: report });
      self.postMessage({ type: 'constructed', runId, result });
      return;
    }
    if (type === 'perfect') {
      const result = await perfectAutoPlan({ state, runConfig, constructed, progressFloor, onProgress: report });
      self.postMessage({ type: 'done', runId, result });
      return;
    }
    // Ein unbekannter Auftrag darf nicht stillschweigend verschluckt werden:
    // der Anzeigestrang wartet sonst bis zum Zeitlimit auf eine Antwort, die
    // nie kommt. Lieber sofort und benennbar scheitern.
    throw new Error(`Unbekannter Auftrag "${String(type)}"`);
  } catch (error) {
    self.postMessage({
      type: 'error',
      runId,
      name: error?.name || 'Error',
      message: error?.message || 'Auto-Plan fehlgeschlagen'
    });
  }
});
