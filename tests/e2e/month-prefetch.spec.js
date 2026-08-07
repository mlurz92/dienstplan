import { test, expect } from '@playwright/test';

/**
 * Vorladen heißt einmal laden.
 *
 * Der Vorabruf holt Nachbarmonate und Jahresverlauf, damit die Fairness über
 * Monatsgrenzen rechnen kann. Bis v10.6 filterte er nur nicht synchronisierte
 * Monate und holte alles Übrige bei **jeder** Navigation erneut: gemessen neun
 * Abrufe beim Blättern vorwärts, acht beim Zurückblättern auf einen Monat, der
 * Sekunden zuvor angekommen war, dreißig für drei Klicks. Jeder davon ist in
 * der Produktion ein KV-Lesen.
 *
 * Der Test misst die Abrufe, nicht die Absicht. Er braucht dafür einen
 * erreichbaren Server: Ohne gültige Antworten wird die Herkunft eines Monats nie
 * `server`, und der Übersprung, um den es geht, greift gar nicht — die Messung
 * wäre wertlos.
 */
test('der Vorabruf holt jeden Monat einmal, „Neu laden" holt alles', async ({ page }) => {
  test.setTimeout(90000);
  const calls = [];

  await page.route('**/api/month/**', route => {
    const match = new URL(route.request().url()).pathname.match(/\/api\/month\/(\d+)\/(\d+)/);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        month: { year: Number(match[1]), month: Number(match[2]), days: {}, absences: {}, preferences: {}, rbn: {} }
      })
    });
  });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/month/')) calls.push(path);
  });

  await page.goto('/');
  await page.waitForSelector('#autoPlanBtn', { timeout: 30000 });
  await page.waitForTimeout(1800);
  const nachStart = calls.length;
  expect(nachStart, 'der Start lädt den Jahresverlauf vor').toBeGreaterThan(0);

  // Vorwärts: nur der eine neu erreichbare Monat darf hinzukommen.
  await page.click('#nextMonthBtn');
  await page.waitForTimeout(1500);
  const beimBlättern = calls.length - nachStart;
  expect(beimBlättern, `ein Schritt vorwärts holt höchstens den neuen Nachbarn (waren ${beimBlättern})`).toBeLessThanOrEqual(2);

  // Zurück auf einen Monat, der bereits vom Server kam: kein einziger Abruf.
  const vorRückschritt = calls.length;
  await page.click('#prevMonthBtn');
  await page.waitForTimeout(1500);
  const beimZurück = calls.length - vorRückschritt;
  expect(beimZurück, `ein bereits geladener Monat wird nicht erneut geholt (waren ${beimZurück})`).toBe(0);

  // „Neu laden" ist die eine Stelle, die ausdrücklich alles erneuert — sonst
  // wäre es die einzige Schaltfläche, die nicht täte, was sie sagt.
  const vorNeuladen = calls.length;
  await page.click('#reloadBtn');
  await page.waitForTimeout(2000);
  expect(calls.length - vorNeuladen, 'Neu laden erneuert den ganzen Vorrat').toBeGreaterThan(2);
});
