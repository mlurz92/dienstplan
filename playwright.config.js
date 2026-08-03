import { defineConfig } from '@playwright/test';

/**
 * In abgeschotteten Umgebungen liegt bereits ein Chromium bereit, das nicht der
 * von Playwright erwarteten Revision entspricht. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
 * erlaubt es, genau dieses zu verwenden, statt einen Download zu erzwingen.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI
  }
});
