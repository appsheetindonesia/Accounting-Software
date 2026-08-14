import app from './src/server.js'

// Jangan ikuti env PORT global agar port mock API stabil di 4000
const PORT = Number(process.env.MOCK_API_PORT) || 4000

app.listen(PORT, () => {
  console.log(`✅ Mock API BukuWarung Akuntansi berjalan di http://localhost:${PORT}`)
  console.log(`   Health check : http://localhost:${PORT}/health`)
  console.log(`   Login demo   : rina@bukuwarung.com / password123`)
  console.log(`   Token        : dapatkan lewat POST /auth/login, kirim via "Authorization: Bearer mock.<userId>"`)
})
