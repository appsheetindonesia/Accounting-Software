import { defineConfig } from 'vitest/config'

// Test memakai state in-memory murni (seed di-reset tiap test via
// POST /admin/reset). Persistence file dinonaktifkan agar test tidak
// menulis mock-api/.data/db.json dan baseline tidak tercemar.
export default defineConfig({
  test: {
    env: {
      MOCK_API_PERSIST: '0',
    },
  },
})
