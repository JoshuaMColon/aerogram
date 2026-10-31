import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { initials } from '../lib/logic'

/* ------------------------------------------------------------------ tap feedback */

export function inkDot(e: RPointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const dot = document.createElement('span')
  dot.className = 'ink-dot'
  dot.style.left = `${e.clientX - r.left}px`
  dot.style.top = `${e.clientY - r.top}px`
  el.appendChild(dot)
  dot.addEventListener('animationend', () => dot.remove())
}

/* ------------------------------------------------------------------ tooltip */

type Side = 'top' | 'bottom' | 'left' | 'right'

/**
 * Tooltip shown on hover, keyboard focus and long-press. It renders in a portal with fixed
 * positioning so scrolling panes never clip it, flips when there is no room, and describes
 * its trigger via aria-describedby.
 */
export function Tip({ tip, children, side = 'top', block = false }: { tip: string; children: (p: { 'aria-describedby': string | undefined }) => ReactNode; side?: Side; block?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [pos, setPos] = useState<{ x: number; y: number; side: Side } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const target = (anchor.current.firstElementChild as HTMLElement | null) ?? anchor.current
    const r = target.getBoundingClientRect()
    const t = tipRef.current?.getBoundingClientRect()
    const w = t?.width ?? 120
    const h = t?.height ?? 28
    let s = side
    if (s === 'top' && r.top < h + 12) s = 'bottom'
    else if (s === 'bottom' && innerHeight - r.bottom < h + 12) s = 'top'
    else if (s === 'left' && r.left < w + 12) s = 'right'
    else if (s === 'right' && innerWidth - r.right < w + 12) s = 'left'
    let x = s === 'left' ? r.left - w - 8 : s === 'right' ? r.right + 8 : r.left + r.width / 2 - w / 2
    const y = s === 'top' ? r.top - h - 8 : s === 'bottom' ? r.bottom + 8 : r.top + r.height / 2 - h / 2
    x = Math.max(6, Math.min(innerWidth - w - 6, x))
    setPos((p) => (p && p.x === x && p.y === y && p.side === s ? p : { x, y, side: s }))
  }, [open, side, tip, pos])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span
      ref={anchor}
      className={`${block ? 'flex' : 'inline-flex'}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onPointerDown={(e) => e.pointerType === 'mouse' && setOpen(false)}
      onTouchStart={() => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setOpen(true), 450)
      }}
      onTouchEnd={() => {
        window.clearTimeout(timer.current)
        window.setTimeout(() => setOpen(false), 1100)
      }}
      onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {children({ 'aria-describedby': open ? id : undefined })}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className="tooltip pointer-events-none fixed z-[100] w-max max-w-64 rounded-md px-2.5 pb-1.5 pt-2 text-center text-xs font-medium leading-snug shadow-lg"
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </span>
  )
}

/* ------------------------------------------------------------------ buttons */

type Variant = 'red' | 'blue' | 'ghost' | 'plain' | 'danger'
const VARIANT: Record<Variant, string> = {
  red: 'bg-red text-on-accent border border-red lift',
  blue: 'bg-blue text-on-accent border border-blue lift',
  ghost: 'bg-card text-ink border border-line hover:border-edge lift',
  plain: 'bg-transparent text-ink border border-transparent hover:bg-sunk',
  danger: 'bg-card text-bad border border-bad lift',
}
const SIZE = { xs: 'h-7 px-2 text-xs gap-1 rounded-md', sm: 'h-8 px-2.5 text-sm gap-1.5 rounded-lg', md: 'h-10 px-4 text-[0.95rem] gap-2 rounded-lg', lg: 'h-12 px-6 text-base gap-2.5 rounded-xl' }

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tip: string
  variant?: Variant
  size?: keyof typeof SIZE
  /** Icon-only buttons use the tooltip text as their accessible name. */
  iconOnly?: boolean
  side?: Side
  block?: boolean
}

export function Btn({ tip, variant = 'ghost', size = 'md', iconOnly, side, block, className = '', children, onPointerDown, type = 'button', ...rest }: BtnProps) {
  return (
    <Tip tip={tip} side={side} block={block}>
      {(d) => (
        <button
          type={type}
          {...d}
          aria-label={iconOnly ? tip : rest['aria-label']}
          className={`press relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold ${SIZE[size]} ${VARIANT[variant]} ${block ? 'w-full' : ''} ${iconOnly ? 'aspect-square !px-0' : ''} ${className}`}
          onPointerDown={(e) => {
            if (!rest.disabled) inkDot(e)
            onPointerDown?.(e)
          }}
          {...rest}
        >
          {children}
        </button>
      )}
    </Tip>
  )
}

export function LinkBtn({
  href,
  tip,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  onClick,
}: {
  href: string
  tip: string
  variant?: Variant
  size?: keyof typeof SIZE
  className?: string
  children: ReactNode
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <Tip tip={tip}>
      {(d) => (
        <a
          href={href}
          {...d}
          onPointerDown={inkDot}
          onClick={onClick}
          className={`press relative inline-flex select-none items-center justify-center overflow-hidden font-semibold no-underline ${SIZE[size]} ${VARIANT[variant]} ${className}`}
        >
          {children}
        </a>
      )}
    </Tip>
  )
}

/* ------------------------------------------------------------------ stamp avatars */

export const STAMP_COLORS = ['#a8322b', '#1d4b97', '#2d6a3e', '#7a4a12', '#6b3a8a', '#0f6670', '#9a3b62', '#3d4f7a', '#8a4a1c', '#4b6420', '#5a3d9a', '#7a2f3f']

export function Stamp({ name, stamp, size = 36, online, bot, className = '' }: { name: string; stamp: number; size?: number; online?: boolean; bot?: boolean; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className={`stamp ${size >= 44 ? 'stamp-lg' : ''} block h-full w-full`}>
        <span
          className="flex h-full w-full items-center justify-center font-display font-bold text-[#fffaf0]"
          style={{ background: STAMP_COLORS[((stamp % 12) + 12) % 12], fontSize: size * 0.36, letterSpacing: '0.02em' }}
        >
          {initials(name)}
        </span>
      </span>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 block rounded-full border-2 border-card ${online ? 'bg-online' : 'bg-edge'}`}
          style={{ width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3) }}
        />
      )}
      {bot && <span className="absolute -left-1 -top-1 rounded-sm bg-brass px-0.5 font-mono text-[8px] font-semibold leading-tight text-paper">BOT</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[min(92vw,${wide ? '40rem' : '28rem'})] max-h-[85vh] overflow-hidden rounded-xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-[#0b1020]/50 backdrop:backdrop-blur-[2px]`}
      style={{ width: `min(92vw, ${wide ? '40rem' : '28rem'})` }}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="airmail h-1.5 shrink-0" />
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 id={titleId} className="font-display text-xl font-semibold">
              {title}
            </h2>
            <Btn tip="Close" iconOnly variant="plain" size="sm" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </Btn>
          </div>
          <div className="scroll-thin overflow-y-auto px-5 pb-5">{children}</div>
        </div>
      )}
    </dialog>
  )
}

/* ------------------------------------------------------------------ toasts */

interface Toast {
  id: number
  text: string
  tone: 'bad' | 'good'
}
const ToastCtx = createContext<(text: string, tone?: 'bad' | 'good') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: 'bad' | 'good' = 'bad') => {
    const id = Date.now() + Math.random()
    setList((l) => [...l.slice(-2), { id, text, tone }])
    window.setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {list.map((t) => (
          <p
            key={t.id}
            role={t.tone === 'bad' ? 'alert' : 'status'}
            className={`stamp-in pointer-events-auto max-w-md rounded-lg border px-4 py-2 text-sm font-medium shadow-lg ${t.tone === 'bad' ? 'border-bad bg-bad-bg text-bad' : 'border-good bg-card text-good'}`}
          >
            {t.text}
          </p>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/* ------------------------------------------------------------------ misc */

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 64 64" width="1.4em" height="1.4em" aria-hidden="true">
        <rect x="4" y="12" width="56" height="40" rx="6" fill="var(--red)" />
        <rect x="4" y="12" width="56" height="40" rx="6" fill="url(#ag-stripe)" />
        <defs>
          <pattern id="ag-stripe" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="12" fill="var(--red)" />
            <rect x="4" width="2" height="12" fill="var(--paper-hi)" />
            <rect x="6" width="4" height="12" fill="var(--blue)" />
            <rect x="10" width="2" height="12" fill="var(--paper-hi)" />
          </pattern>
        </defs>
        <rect x="9" y="17" width="46" height="30" rx="3" fill="var(--paper-hi)" />
        <path d="M12 20l20 14 20-14" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      Aerogram
    </span>
  )
}

/** A perforated "#" stamp for public rooms. */
export function RoomStamp({ size = 36, active = true }: { size?: number; active?: boolean }) {
  return (
    <span className="stamp block shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span className={`flex h-full w-full items-center justify-center font-display font-bold ${active ? 'bg-blue text-on-accent' : 'bg-sunk text-blue'}`} style={{ fontSize: size * 0.45 }}>
        #
      </span>
    </span>
  )
}
