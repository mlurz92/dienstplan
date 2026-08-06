import { test, expect } from '@playwright/test';
import { collectContrast } from './helpers/contrast.js';

/**
 * Lesekontrast im Dunkelmodus — auch hinter den Dialogen.
 *
 * `layout-contrast-v10-5.spec.js` misst die Hauptansicht in beiden
 * Erscheinungsbildern und meldete nichts, während in den Dialogen dunkle
 * Schrift auf dunklem Grund stand: Die Messung kannte nur
 * `background-color`, und die Flächen der Bedienelemente sind Verläufe.
 * Beides ist behoben — die Messung liest jetzt auch Verläufe, und dieser Test
 * führt sie über die Flächen, die zuvor niemand geprüft hat.
 *
 * Der Umschalter wird angeklickt statt das Attribut gesetzt: Nur der Klick
 * löst die Neuberechnung der Monatstoken für das dunkle Erscheinungsbild aus,
 * und genau die war der Kern des Fehlers.
 */
test('Dunkelmodus: lesbarer Kontrast in Hauptansicht, Dialogen und Studio', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#autoPlanBtn', { timeout: 30000 });
  await page.click('.tool-action--theme');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await page.waitForTimeout(500);

  const findings = [];
  const measure = async surface => {
    findings.push(...(await collectContrast(page)).map(entry => ({ ...entry, surface })));
  };

  await measure('Hauptansicht');

  for (const [surface, open] of [
    ['Einstellungen', '#settingsBtn'],
    ['Abwesenheiten', '#absenceManagerBtn'],
    ['Wünsche', '#preferenceManagerBtn'],
    ['Auswahldialog', '#planTableBody .assignment-btn']
  ]) {
    await page.click(open);
    await page.waitForTimeout(600);
    await measure(surface);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  await page.click('#autoPlanBtn');
  await page.waitForTimeout(2500);
  await measure('Auto-Plan Studio');

  expect(findings, `Zu geringer Lesekontrast: ${JSON.stringify(findings.slice(0, 10), null, 2)}`).toEqual([]);
});
