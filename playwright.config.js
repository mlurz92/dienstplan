import { defineConfig } from '@playwright/test';

/**
 * In abgeschotteten Umgebungen liegt bereits ein Chromium bereit, das nicht der
 * von Playwright erwarteten Revision entspricht. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
 * erlaubt es, genau dieses zu verwenden, statt einen Download zu erzwingen.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  globalTimeout: isCi ? 180_000 : undefined,
  expect: {
    timeout: 20_000
  },
  reporter: isCi
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }]
      ]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    timeout: 30_000,
    reuseExistingServer: !isCi
  }
});
