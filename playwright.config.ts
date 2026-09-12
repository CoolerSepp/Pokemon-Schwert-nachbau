import { defineConfig, devices } from '@playwright/test';

/**
 * End-zu-End-Tests laufen gegen die gebaute Anwendung.
 *
 * Chromium ist in dieser Umgebung vorinstalliert; der Browserpfad kommt aus
 * PLAYWRIGHT_BROWSERS_PATH.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Vorinstalliertes Chromium benutzen; die gepinnte Playwright-Version
      // erwartet einen anderen Build, laedt aber in dieser Umgebung nichts nach.
      executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
      // Software-Rasterisierung: der Container hat keine GPU.
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
