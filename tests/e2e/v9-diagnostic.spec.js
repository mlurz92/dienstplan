import { test, expect } from '@playwright/test';

test.describe('v9 diagnostic', () => {
  test('theme button icon-only, v9 layout applied, studio phases visible, run completes', async ({ page }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));

    await page.goto('/');
    await page.waitForSelector('#autoPlanBtn', { timeout: 30000 });

    // 1. Theme button: icon-only, no visible text.
    const themeText = await page.locator('#themeModeBtn').innerText();
    expect(themeText.trim()).toBe('');
    const themeHtml = await page.locator('#themeModeBtn').innerHTML();
    expect(themeHtml).not.toContain('Hell');
    expect(themeHtml).not.toContain('Dunkel');
    const themeBox = await page.locator('#themeModeBtn').boundingBox();
    expect(themeBox.width).toBeLessThanOrEqual(42);

    // 2. Open studio, check v9 layout flag and controls.
    await page.click('#autoPlanBtn');
    await page.waitForSelector('#autoPlanDialog[open]');
    await page.waitForTimeout(900);
    await expect(page.locator('#autoPlanDialog')).toHaveAttribute('data-v9-layout', '1');
    await expect(page.locator('#autoPlanV9SolverBackend')).toBeVisible();

    // 3. Config: footer visible without modal scroll; settings reachable.
    const dialogBox = await page.locator('#autoPlanDialog').boundingBox();
    const footer = await page.locator('.auto-plan-footer').boundingBox();
    expect(footer.y + footer.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);

    // 4. Run the planner and verify phase cards are fully visible and complete.
    await page.selectOption('#autoPlanSearchIntensity', 'standard');
    await page.locator('#autoPlanTimeBudget').fill('15');
    await page.click('#autoPlanStartBtn');
    await page.waitForSelector('#autoPlanStage:not([hidden])', { timeout: 15000 });

    // v10.5: Die sechsteilige Phasenliste der Laufansicht ist entfallen — sie
    // stand doppelt neben der Stufenleiste, die die acht Stufen der Engine
    // selbst führt, und trug zu der Enge bei, in der sich Zeilen überlagerten.
    // Geprüft wird deshalb die Stufenleiste: gleiche Zusage, eine Quelle.
    const phaseCards = page.locator('#autoPlanV85Theatre ol > li');
    const count = await phaseCards.count();
    expect(count).toBeGreaterThanOrEqual(8);
    const dialogBox2 = await page.locator('#autoPlanDialog').boundingBox();
    for (let index = 0; index < count; index += 1) {
      await expect(phaseCards.nth(index)).toBeVisible();
      const box = await phaseCards.nth(index).boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(dialogBox2.x + dialogBox2.width + 1);
      expect(box.y).toBeGreaterThanOrEqual(dialogBox2.y - 1);
    }

    await page.waitForSelector('#autoPlanDialog.show-result', { timeout: 120000 });
    const resultTitle = await page.locator('#autoPlanResultTitle').innerText();
    expect(resultTitle.length).toBeGreaterThan(0);
    const states = await page.locator('#autoPlanV85Theatre ol > li > span').allInnerTexts();
    const doneCount = states.filter(text => /fertig|erledigt/i.test(text)).length;
    expect(doneCount).toBeGreaterThanOrEqual(4);

    // 5. Dark mode: switch and verify no console errors.
    await page.click('#autoPlanCloseBtn');
    await page.waitForSelector('#autoPlanDialog:not([open])', { state: 'attached' });
    await page.click('#themeModeBtn');
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
    expect(errors).toEqual([]);
  });
});
