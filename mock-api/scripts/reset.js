// ============================================================
// Reset state mock API ke seed tanpa restart server.
//
//   npm run reset       → seed awal (Maret 2026)
//   npm run seed:extra  → seed + jurnal lintas bulan (Jan–Feb 2026)
//
// Catatan: state server in-memory — restart juga mengembalikan
// ke seed awal; script ini berguna saat server sedang berjalan
// (mis. setelah pengujian QA lewat API, tanpa mau restart).
// ============================================================

const PORT = Number(process.env.MOCK_API_PORT) || 4000
const withExtra = process.argv.includes('--extra')

async function main() {
  const url = `http://localhost:${PORT}/admin/reset`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withExtra }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    const { data } = await res.json()
    console.log(`✅ ${data.message}`)
    console.log(`   Seed    : ${data.seed}`)
    console.log(`   Jurnal  : ${data.journals}`)
    console.log(`   Akun    : ${data.accounts}`)
    console.log(`   Periode : ${data.periods}`)
  } catch (err) {
    console.error(`❌ Tidak dapat menghubungi mock API di ${url}`)
    console.error(`   ${err.message}`)
    console.error('')
    console.error('   Pastikan server berjalan:  cd mock-api && npm start')
    console.error('   Catatan: state in-memory — me-restart server juga mengembalikan ke seed awal.')
    process.exit(1)
  }
}

main()
