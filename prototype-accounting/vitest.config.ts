import { defineConfig } from 'vitest/config'

// Coverage (badge/debug CI): reporter text (tabel cakupan di log), json-summary
// (angka total mudah di-parse) dan lcov (tooling). Laporan ditulis ke coverage/
// (di-ignore, tidak pernah di-commit) dan di-upload sebagai artifact di ci.yml.
// Provider v8 — tanpa native dependency tambahan.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
    },
  },
})
