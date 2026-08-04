import { expect } from '@playwright/test';

/**
 * Navigiert bis zur DOM-Bereitschaft und wartet danach auf den fachlichen
 * Startvertrag der Anwendung. Das vollständige `load`-Ereignis ist kein
 * belastbares Bereitschaftssignal für eine modulare App mit externen und
 * optionalen Ressourcen.
 */
export async function openApp(page, { timeout = 30_000 } = {}) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#monthSelect option')).toHaveCount(12, { timeout });
  await expect(page.locator('#yearSelect option').first()).toBeAttached({ timeout });
  await expect(page.locator('#planTableBody tr').first()).toBeAttached({ timeout });
  await expect(page.locator('#saveStatus')).not.toHaveText(/^Lädt(?: …)?$/, { timeout });
  await expect(page.locator('#startupFailureV9')).toHaveCount(0);
}
