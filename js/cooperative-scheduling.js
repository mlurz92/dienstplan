/**
 * Kooperative Taktung langer Rechenläufe.
 *
 * Der Auto-Plan rechnet je nach Zeitrahmen Sekunden bis Minuten. Ohne
 * regelmäßige Rückgabe an den Browser bliebe der Hauptthread durchgehend belegt:
 * Fortschrittsbalken, Animation und Abbruchschalter wären eingefroren, und das
 * Fenster gälte als nicht reagierend. Die Rechenschleifen geben deshalb in
 * kurzen, zeitgesteuerten Abständen ab.
 *
 * Gezählt wird bewusst nicht in Schleifendurchläufen: Ein Durchlauf kostet je
 * nach Nachbarschaft Mikrosekunden oder Millisekunden, ein fester Zähler führt
 * dadurch entweder zu unnötig vielen Unterbrechungen oder zu sekundenlangen
 * Blockaden. Maßgeblich ist allein die vergangene Zeit.
 */

export const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Einmal an den Browser abgeben.
 *
 * Abgegeben wird bewusst bis zum nächsten Bildaufbau. Nur so ist sichergestellt,
 * dass zwischen zwei Rechenabschnitten tatsächlich gezeichnet wird – ein reines
 * Einreihen als neue Aufgabe lässt den Bildaufbau bei durchgehender Last
 * verhungern, und Fortschrittsbalken wie Animation stehen still, obwohl der
 * Hauptthread formal reagiert.
 *
 * Der Wecker daneben ist die Rückfallebene: In einem verdeckten Tab ruft der
 * Browser keine Bildrückrufe mehr auf. Ohne ihn bliebe ein laufender Auto-Plan
 * dort für immer stehen.
 */
export function yieldToBrowser() {
  if (typeof requestAnimationFrame !== 'function') {
    if (typeof scheduler === 'object' && typeof scheduler?.yield === 'function') return scheduler.yield();
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 120);
  });
}

/**
 * Ein Taktgeber, der höchstens alle `intervalMs` tatsächlich abgibt.
 *
 * Der Aufruf ist damit an jeder beliebigen Stelle einer heißen Schleife
 * bezahlbar: Er kostet einen Zeitvergleich, solange das Intervall nicht
 * abgelaufen ist.
 */
export function createPacer(intervalMs = 34) {
  let last = now();
  return async () => {
    if (now() - last < intervalMs) return false;
    await yieldToBrowser();
    last = now();
    return true;
  };
}

/**
 * Ein Auslöser für Fortschrittsmeldungen in festem zeitlichem Abstand.
 * Verhindert, dass eine schnelle Schleife die Oberfläche mit Aktualisierungen
 * überflutet, und stellt zugleich sicher, dass eine langsame sie nicht
 * verstummen lässt.
 */
export function createTicker(intervalMs = 220) {
  let last = 0;
  return () => {
    const stamp = now();
    if (stamp - last < intervalMs) return false;
    last = stamp;
    return true;
  };
}
