// ============================================================
// Buat GitHub Release dari annotated tag — SATU PERINTAH.
//
//   node scripts/create-release.mjs                     # rilis tag terakhir (git describe)
//   node scripts/create-release.mjs v0.4.2              # rilis tag tertentu
//   node scripts/create-release.mjs v0.4.2 --draft      # draft (review dulu, baru publish)
//   node scripts/create-release.mjs v0.4.2 --prerelease # tandai sebagai prerelease
//   npm run release -- v0.4.2                           # lewat npm script root
//
// Catatan rilis diambil VERBATIM dari pesan annotated tag:
// %(contents:subject) → judul release, %(contents:body) → body catatan —
// konsisten dengan release.yml (workflow draft otomatis per tag v*) dan
// alur manual selama ini. Idempoten: bila release untuk tag sudah ada,
// catatan di-UPDATE (PATCH), bukan gagal.
//
// Auth berurutan: env GH_TOKEN/GITHUB_TOKEN → `gh auth token` → Git
// Credential Manager (token tersimpan untuk github.com). Repo dibaca dari
// `git remote get-url origin`. Tanpa argumen tag, tag terakhir yang bisa
// dijangkau HEAD dipakai (git describe --tags --abbrev=0).
// ============================================================

import { execFileSync } from 'node:child_process'

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()

const die = (msg) => {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

// ---------- Argumen ----------
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? (args.splice(i, 1), true) : false
}
const draft = flag('--draft')
const prerelease = flag('--prerelease')
const help = flag('--help') || flag('-h')
const positional = args.filter((a) => !a.startsWith('--'))

if (help) {
  console.log(`Pemakaian:
  node scripts/create-release.mjs [tag] [--draft] [--prerelease]

  tag          tag rilis (mis. v0.4.2). Kosong → tag terakhir yang
               bisa dijangkau HEAD (git describe --tags --abbrev=0)
  --draft      buat sebagai DRAFT (belum dipublikasikan)
  --prerelease tandai sebagai prerelease
`)
  process.exit(0)
}

// ---------- Resolusi tag ----------
const tag = positional[0] ?? git(['describe', '--tags', '--abbrev=0'])
try {
  git(['rev-parse', '--verify', `refs/tags/${tag}`])
} catch {
  die(`Tag "${tag}" tidak ditemukan di repo lokal.`)
}

// Tag di remote? (peringatan saja — API tetap jalan, tag otomatis dibuat
// GitHub di default branch bila belum ada, tapi push tag lebih aman.)
let remoteTagExists = false
try {
  const refs = execFileSync('git', ['ls-remote', '--tags', 'origin', tag], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  remoteTagExists = refs.length > 0
} catch {
  /* origin tidak terjangkau — lewati cek, biarkan API yang memutuskan */
}

// ---------- Catatan dari annotated tag ----------
const subject = git(['for-each-ref', `refs/tags/${tag}`, '--format=%(contents:subject)'])
const body = git(['for-each-ref', `refs/tags/${tag}`, '--format=%(contents:body)'])
if (!body) {
  console.warn(`⚠️  Tag "${tag}" tidak punya pesan (lightweight tag) — catatan rilis kosong.`)
}

// ---------- Repo (owner/name) dari remote ----------
const remote = git(['remote', 'get-url', 'origin'])
const m = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
if (!m) die(`Remote "${remote}" bukan repo github.com (pola https:// atau git@ tidak dikenali).`)
const repo = `${m[1]}/${m[2]}`
console.log(`Repo : ${repo}`)
console.log(`Tag  : ${tag}${remoteTagExists ? '' : '  ⚠️  belum terlihat di origin (push tag dulu agar menunjuk commit yang sama)'}`)

// ---------- Token ----------
const resolveToken = () => {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    /* gh tidak ada / belum login */
  }
  try {
    // stdio default (['pipe','pipe','pipe']) WAJIB — `input` hanya dikirim ke
    // stdin bila stdin = pipe; pakai ['ignore',...] membuat git baca stdin
    // kosong → "credential missing host field". GIT_TERMINAL_PROMPT=0: jangan
    // pernah hang menunggu input interaktif di CI/terminal non-TTY.
    const out = execFileSync('git', ['credential', 'fill'], {
      encoding: 'utf8',
      input: 'protocol=https\nhost=github.com\n\n',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    const pw = out.match(/^password=(.+)$/m)
    if (pw) return pw[1]
  } catch {
    /* tidak ada kredensial tersimpan */
  }
  return null
}
const token = resolveToken()
if (!token) die('Token tidak ditemukan. Set env GH_TOKEN/GITHUB_TOKEN, login `gh`, atau simpan kredensial git untuk github.com.')

// ---------- API GitHub ----------
const BASE = 'https://api.github.com'
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
}

const api = async (url, opts = {}) => {
  const res = await fetch(`${BASE}${url}`, { ...opts, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  return { status: res.status, data }
}

// Sudah ada release untuk tag ini? → PATCH (update), bukan POST (duplikat).
// Dua sumber: (1) release TERPUBLIKASI ter-asosiasi tag — GET
// /releases/tags/{tag}; (2) DRAFT belum ter-asosiasi tag (URL 'untagged-...')
// jadi cari di daftar release dengan tag_name yang sama. Tanpa cek ini,
// run kedua dengan --draft membuat draft duplikat.
const existing = await api(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`).catch(() => null)
let release = existing && existing.status === 200 ? existing.data : null
if (!release) {
  for (let page = 1; page <= 5; page++) {
    const { status, data } = await api(`/repos/${repo}/releases?per_page=100&page=${page}`)
    if (status !== 200 || !Array.isArray(data)) break
    release = data.find((r) => r.draft && r.tag_name === tag) ?? null
    if (release || data.length < 100) break
  }
}
const isExisting = Boolean(release)

const payload = {
  tag_name: tag,
  name: subject,
  body,
  draft,
  prerelease,
}
if (isExisting) {
  payload.id = release.id // PATCH path pakai id
  const { status, data } = await api(`/repos/${repo}/releases/${release.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (status >= 400) die(`Gagal UPDATE release: HTTP ${status} ${JSON.stringify(data)}`)
  console.log(`✅ Release ${tag} di-UPDATE (draft: ${draft}): ${data.html_url}`)
} else {
  const { status, data } = await api(`/repos/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (status >= 400) die(`Gagal buat release: HTTP ${status} ${JSON.stringify(data)}`)
  console.log(`✅ Release ${tag} dibuat (draft: ${draft}): ${data.html_url}`)
}
