import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Minus, X } from 'lucide-react'
import type { WinBox } from '../lib/im'
import { Btn } from './ui'

interface Props {
  id: string
  title: string
  icon: ReactNode
  box: WinBox
  z: number
  active: boolean
  buzz: number
  onFocus: () => void
  onMove: (b: WinBox) => void
  onMinimize: () => void
  onClose: () => void
  children: ReactNode
}

/** A floating, draggable, resizable IM window (desktop). */
export function ImWindow({ id, title, icon, box, z, active, buzz, onFocus, onMove, onMinimize, onClose, children }: Props) {
  const [live, setLive] = useState<WinBox | null>(null)
  const drag = useRef<{ mode: 'move' | 'size'; sx: number; sy: number; start: WinBox } | null>(null)
  const el = useRef<HTMLDivElement>(null)
  const b = live ?? box

  // Replay the shake whenever a Buzz lands (CSS swaps it for a glow under reduced motion).
  const [shaking, setShaking] = useState(false)
  useEffect(() => {
    if (!buzz) return
    const a = window.setTimeout(() => setShaking(true), 0)
    const t = window.setTimeout(() => setShaking(false), 900)
    return () => (window.clearTimeout(a), window.clearTimeout(t))
  }, [buzz])

  function down(mode: 'move' | 'size', e: RPointerEvent<HTMLElement>) {
    if (e.button !== 0 || (mode === 'move' && (e.target as HTMLElement).closest('button'))) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: box }
    onFocus()
  }
  function moveP(e: RPointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    setLive(d.mode === 'move' ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: Math.max(300, d.start.w + dx), h: Math.max(300, d.start.h + dy) })
  }
  function up() {
    if (drag.current && live) onMove(live)
    drag.current = null
    setLive(null)
  }
  function keyMove(e: React.KeyboardEvent) {
    // Keyboard users can nudge the window with Alt+arrows while the title bar is focused.
    const step = e.shiftKey ? 40 : 12
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const v = m[e.key]
    if (!v || !e.altKey) return
    e.preventDefault()
    onMove({ ...box, x: box.x + v[0], y: box.y + v[1] })
  }

  return (
    <div
      ref={el}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`win-${id}`}
      data-window={id}
      data-active={active}
      onPointerDownCapture={() => !active && onFocus()}
      onFocusCapture={() => !active && onFocus()}
      className={`window absolute flex flex-col ${shaking ? 'buzz' : ''} ${active ? '' : 'opacity-[0.97]'}`}
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: 10 + z }}
    >
      <div
        className="titlebar flex h-9 shrink-0 cursor-grab touch-none select-none items-center gap-2 pl-2.5 pr-1 active:cursor-grabbing"
        data-active={active}
        onPointerDown={(e) => down('move', e)}
        onPointerMove={moveP}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && onMinimize()}
        onKeyDown={keyMove}
        tabIndex={-1}
        title="Drag to move · double-click to minimize · Alt+arrows to nudge"
      >
        {icon}
        <h2 id={`win-${id}`} className="min-w-0 flex-1 truncate text-[0.85rem] font-extrabold">
          {title}
        </h2>
        <Btn tip="Minimize" iconOnly size="xs" variant="plain" className="chrome-btn !h-6 !w-6 !rounded-full" onClick={onMinimize}>
          <Minus size={14} aria-hidden="true" />
        </Btn>
        <Btn tip="Close window" iconOnly size="xs" variant="plain" className="chrome-btn close !h-6 !w-6 !rounded-full" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </Btn>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-paper-hi">{children}</div>
      <span
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        style={{ background: 'linear-gradient(135deg, transparent 50%, var(--edge) 50%, var(--edge) 60%, transparent 60%, transparent 70%, var(--edge) 70%, var(--edge) 80%, transparent 80%)' }}
        title="Drag to resize"
        aria-hidden="true"
        onPointerDown={(e) => down('size', e)}
        onPointerMove={moveP}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </div>
  )
}
