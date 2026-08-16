// Setup Vitest global — di-register lewat `setupFiles` di vitest.config.ts.
// Cleanup otomatis Testing Library setelah tiap test: render()/renderHook()
// di-unmount tanpa tiap file test memanggil cleanup() manual — pola yang sama
// dipakai konsisten di semua test komponen.
//
// Aman untuk test environment Node (test store/lib tanpa DOM): cleanup() hanya
// no-op bila tidak ada komponen yang ter-render, tidak menyentuh document.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
