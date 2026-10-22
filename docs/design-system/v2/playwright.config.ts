import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './checks',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:3046',
    channel: process.env.DESIGN_BROWSER === 'chromium' ? undefined : 'chrome',
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3046',
    reuseExistingServer: !process.env.CI,
  },
})
