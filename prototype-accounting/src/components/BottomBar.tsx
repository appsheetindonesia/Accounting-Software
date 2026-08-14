import { useStore } from '../store/useStore'

export default function BottomBar() {
  const activePeriod = useStore((s) => s.activePeriod)
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 text-[11px] text-ink-soft">
      <span>© 2026 BukuWarung Akuntansi · v1.0.0</span>
      <span className="hidden sm:inline">Periode: {activePeriod}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ok" />
        Online
      </span>
    </footer>
  )
}
