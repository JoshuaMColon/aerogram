import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { initials } from '../lib/logic'
import type { BuddyState } from '../lib/types'

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
  red: 'gloss bg-red text-on-accent border border-red lift',
  blue: 'gloss bg-blue text-on-accent border border-blue lift',
  ghost: 'bg-card text-ink border border-line hover:border-edge lift',
  plain: 'bg-transparent text-ink border border-transparent hover:bg-sunk',
  danger: 'bg-card text-bad border border-bad lift',
}
const SIZE = { xs: 'h-7 px-2 text-xs gap-1 rounded-lg', sm: 'h-8 px-2.5 text-sm gap-1.5 rounded-lg', md: 'h-10 px-4 text-[0.95rem] gap-2 rounded-xl', lg: 'h-12 px-6 text-base gap-2.5 rounded-2xl' }

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
          className={`press relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-bold ${SIZE[size]} ${VARIANT[variant]} ${block ? 'w-full' : ''} ${iconOnly ? 'aspect-square !px-0' : ''} ${className}`}
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

/* ------------------------------------------------------------------ buddy icons */

/** Twelve glossy buddy-icon palettes (top, bottom). */
export const ICONS: [string, string][] = [
  ['#7cc8ff', '#2a66e8'],
  ['#ff9ad5', '#d61f86'],
  ['#9ff0b4', '#18a454'],
  ['#ffd27a', '#f07b12'],
  ['#c9a6ff', '#7238e0'],
  ['#7ff0ea', '#0c98a6'],
  ['#ffb3a1', '#e0412b'],
  ['#b6c3ff', '#4253d6'],
  ['#e6f58a', '#86a80f'],
  ['#ffc2e8', '#a43ccf'],
  ['#9fe3ff', '#1688b8'],
  ['#ffd0a0', '#c26a1a'],
]
/** Kept for older imports: the bottom colour of each icon. */
export const STAMP_COLORS = ICONS.map((c) => c[1])

const DOT: Record<BuddyState, string> = { online: 'bg-online', idle: 'bg-idle', away: 'bg-brass', offline: 'bg-edge' }

export function Stamp({
  name,
  stamp,
  size = 36,
  online,
  state,
  bot,
  className = '',
}: {
  name: string
  stamp: number
  size?: number
  online?: boolean
  state?: BuddyState
  bot?: boolean
  className?: string
}) {
  const [a, b] = ICONS[((stamp % 12) + 12) % 12]
  const st: BuddyState | undefined = state ?? (online === undefined ? undefined : online ? 'online' : 'offline')
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className={`stamp block h-full w-full ${st === 'offline' ? 'opacity-55 grayscale-[0.6]' : ''}`}>
        <span
          className="flex h-full w-full items-center justify-center font-extrabold text-white"
          style={{ background: `linear-gradient(160deg, ${a}, ${b})`, fontSize: size * 0.4, textShadow: '0 1px 1px rgb(0 0 0 / 0.3)' }}
        >
          {initials(name)}
        </span>
      </span>
      {st && <span className={`absolute -bottom-0.5 -right-0.5 block rounded-full border-2 border-paper-hi ${DOT[st]}`} style={{ width: Math.max(9, size * 0.3), height: Math.max(9, size * 0.3) }} />}
      {bot && <span className="absolute -left-1 -top-1 rounded-sm bg-brass px-0.5 font-pixel text-[7px] leading-tight text-paper-hi">BOT</span>}
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
      className="window m-auto max-h-[85vh] border-0 p-0 text-ink backdrop:bg-[#0b1020]/45 backdrop:backdrop-blur-[2px]"
      style={{ width: `min(92vw, ${wide ? '40rem' : '28rem'})` }}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="titlebar flex h-10 shrink-0 items-center justify-between gap-3 pl-4 pr-1.5">
            <h2 id={titleId} className="truncate text-[0.95rem] font-extrabold">
              {title}
            </h2>
            <Btn tip="Close" iconOnly variant="plain" size="xs" className="chrome-btn close !h-6 !rounded-full" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </Btn>
          </div>
          <div className="scroll-thin overflow-y-auto px-5 pb-5 pt-4">{children}</div>
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
            className={`stamp-in pointer-events-auto max-w-md rounded-xl border px-4 py-2 text-sm font-semibold shadow-lg ${t.tone === 'bad' ? 'border-bad bg-bad-bg text-bad' : 'border-good bg-card text-good'}`}
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

/** Buddyline's mark: two overlapping glossy chat bubbles with a spark. Original artwork. */
export function Logo({ size = '1.5em' }: { size?: string | number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="bl-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-a, #8fd3ff)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-b, #2a66e8)' }} />
        </linearGradient>
        <linearGradient id="bl-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-c, #9fe3e6)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-d, #0a7f86)' }} />
        </linearGradient>
      </defs>
      <path d="M26 14h24a10 10 0 0 1 10 10v10a10 10 0 0 1-10 10h-2l1 8-9-8H26a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10z" fill="url(#bl-b)" />
      <path d="M14 6h22a10 10 0 0 1 10 10v10a10 10 0 0 1-10 10H22l-9 8 1-8a10 10 0 0 1-10-10V16A10 10 0 0 1 14 6z" fill="url(#bl-a)" stroke="#fff" strokeWidth="2" />
      <path d="M10 13a6 6 0 0 1 6-4h18a6 6 0 0 1 6 4" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="18" cy="21" r="2.6" fill="#fff" />
      <circle cx="26" cy="21" r="2.6" fill="#fff" />
      <circle cx="34" cy="21" r="2.6" fill="#fff" />
      <path d="M54 2l1.6 4.4L60 8l-4.4 1.6L54 14l-1.6-4.4L48 8l4.4-1.6z" fill="#ffd23f" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <Logo />
      <span>
        Buddy<span className="text-red">line</span>
      </span>
    </span>
  )
}

/** Round "#" badge for public rooms. */
export function RoomStamp({ size = 36, active = true }: { size?: number; active?: boolean }) {
  return (
    <span className="stamp block shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span
        className={`flex h-full w-full items-center justify-center font-extrabold ${active ? 'text-on-accent' : 'bg-sunk text-blue'}`}
        style={{ fontSize: size * 0.48, background: active ? 'linear-gradient(160deg, color-mix(in srgb, var(--red) 60%, #fff), var(--red))' : undefined }}
      >
        #
      </span>
    </span>
  )
}
