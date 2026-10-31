import { useEffect, useRef } from 'react'
import { inkDot } from './ui'
import { ALL } from '../lib/emoji'

/** A small grid of emoji, as a popover anchored to its trigger. Closes on outside click or Escape. */
export function EmojiGrid({ onPick, onClose, label = 'Pick an emoji', className = '' }: { onPick: (e: string) => void; onClose: () => void; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [onClose])
  return (
    <div ref={ref} role="dialog" aria-label={label} className={`stamp-in absolute z-40 w-[17.5rem] rounded-xl border border-line bg-card p-2 shadow-xl ${className}`}>
      <div className="airmail -mx-2 -mt-2 mb-2 h-1 rounded-t-xl" />
      <div className="grid grid-cols-8 gap-0.5">
        {ALL.map((e) => (
          <button
            key={e}
            type="button"
            title={`Choose ${e}`}
            aria-label={`Choose ${e}`}
            className="press relative grid h-8 w-8 place-items-center overflow-hidden rounded-md text-lg hover:bg-sunk"
            onPointerDown={inkDot}
            onClick={() => onPick(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
