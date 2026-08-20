import app from './src/server.js'
import { isEnabled as persistEnabled, getFilePath as persistFilePath } from './src/persistence.js'
import { destroyPool, getPool, getConfigFromEnv } from './src/db.js'

// Prioritas: MOCK_API_PORT > PORT > default 4000
// Nixpacks/Easypanel set PORT, jadi harus dihormati.
const PORT = Number(process.env.MOCK_API_PORT) || Number(process.env.PORT) || 4000
const PERSIST = persistEnabled()

// Auto-connect PostgreSQL jika DATABASE_URL diset di environment
const envConfig = getConfigFromEnv()
if (envConfig) {
  console.log(`[DB] DATABASE_URL terdeteksi — menghubungkan ke ${envConfig.host}:${envConfig.port}/${envConfig.database}`)
  getPool(envConfig)
}

const server = app.listen(PORT, () => {
  console.log(`✅ Mock API Appsheet Accounting Journal berjalan di http://localhost:${PORT}`)
  console.log(`   Health check : http://localhost:${PORT}/health`)
  console.log(`   Login demo   : rina@estetikakreasi.co.id / password123`)
  console.log(`   Token        : dapatkan lewat POST /auth/login, kirim via "Authorization: Bearer mock.<userId>"`)
  console.log(`   Persist      : ${PERSIST ? `AKTIF → ${persistFilePath()}` : 'nonaktif (in-memory, reset saat restart) — aktifkan: MOCK_API_PERSIST=1'}`)
})

// Graceful shutdown — destroy PostgreSQL pool before exit
const shutdown = () => {
  console.log('\n[SERVER] Shutting down...')
  destroyPool()
  server.close(() => process.exit(0))
  // Force exit after 3s if server.close hangs
  setTimeout(() => process.exit(1), 3000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
