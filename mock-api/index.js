import app from './src/server.js'
import { isEnabled as persistEnabled, getFilePath as persistFilePath } from './src/persistence.js'
import { destroyPool } from './src/db.js'

// Jangan ikuti env PORT global agar port mock API stabil di 4000
const PORT = Number(process.env.MOCK_API_PORT) || 4000
const PERSIST = persistEnabled()

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
