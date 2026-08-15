// ============================================================
// Playwright E2E — Appsheet Accounting Journal
// Menjalankan skenario regresi RG-01..RG-12 (QA Test Plan)
// terhadap MOCK API (localhost:4000) + prototipe Vite (:5173).
//
//   npm test            → jalankan semua (chromium + firefox)
//   npm run test:rg9    → cepat: hanya RG-09 di chromium
// ============================================================
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: '.',
  // Satu worker: state mock API (in-memory) dibagi antar test;
  // setiap test me-reset state di beforeEach.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // RG-11: suite berjalan di Chrome + Firefox
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'npm start',
      cwd: '../mock-api',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: '../prototype-accounting',
      url: 'http://localhost:5173',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
})
