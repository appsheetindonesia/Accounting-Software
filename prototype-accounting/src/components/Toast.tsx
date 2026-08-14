import { useEffect } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function Toast() {
  const toast = useStore((s) => s.toast)
  const showToast = useStore((s) => s.showToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => showToast(null as never), 4000)
    return () => clearTimeout(timer)
  }, [toast, showToast])

  if (!toast) return null

  const Icon = toast.kind === 'success' ? CheckCircle2 : XCircle
  const color = toast.kind === 'success' ? 'text-ok' : 'text-bad'

  return (
    <div
      role="status"
      className="fixed bottom-14 right-4 z-50 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-modal animate-[fadein_0.2s_ease-out]"
    >
      <Icon size={18} className={color} />
      {toast.message}
    </div>
  )
}
