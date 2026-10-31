import { useEffect, useId, useRef, useState } from 'react'
import { Bold, FileText, Italic, Paperclip, Send, Smile, Sticker, Underline, X, Zap } from 'lucide-react'
import { ACCEPT, formatBytes, isImage, validateFile } from '../lib/logic'
import { SMILEYS, STYLE_COLORS, cleanStyle, styleClass, typingStateFor, type TypingState } from '../lib/im'
import type { MsgStyle, StyleColor } from '../lib/types'
import { EmojiGrid } from './Emoji'
import { Smiley } from './Smiley'
import { Btn, useToast } from './ui'

interface Props {
  roomName: string
  disabled?: boolean
  autoFocus?: boolean
  onSend: (body: string, file: File | null, style: MsgStyle | null) => void
  onTyping: (on: boolean, state?: TypingState) => void
  /** DMs only: send a Buzz that shakes the other person's window. */
  onBuzz?: () => void
}

const STYLE_KEY = 'buddyline:style'
const BUZZ_COOLDOWN = 10_000
const COLOR_NAME: Record<StyleColor, string> = { red: 'Cherry', orange: 'Tangerine', green: 'Lime', teal: 'Aqua', blue: 'Cobalt', purple: 'Grape', pink: 'Bubblegum' }

function loadStyle(): MsgStyle {
  try {
    return cleanStyle(JSON.parse(localStorage.getItem(STYLE_KEY) || '{}')) ?? {}
  } catch {
    return {}
  }
}

/** The IM box: formatting toolbar, smileys, emoji, attachments (button, paste, drop), Buzz, Enter to send. */
export function Composer({ roomName, disabled, autoFocus, onSend, onTyping, onBuzz }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [style, setStyle] = useState<MsgStyle>(loadStyle)
  const [pop, setPop] = useState<null | 'color' | 'smiley'>(null)
  const [buzzAt, setBuzzAt] = useState(0)
  const [, tick] = useState(0)
  const [picked, setPicked] = useState<{ file: File; url: string | null } | null>(null)
  const file = picked?.file ?? null
  const preview = picked?.url ?? null
  const [emoji, setEmoji] = useState(false)
  const [drag, setDrag] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const lastPing = useRef(0)
  const lastKey = useRef(0)
  const sentState = useRef<TypingState | null>(null)
  const toast = useToast()

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(cleanStyle(style) ?? {}))
    } catch {
      /* ignore */
    }
  }, [style])

  useEffect(() => {
    if (autoFocus && matchMedia('(pointer: fine)').matches) ta.current?.focus({ preventScroll: true })
  }, [autoFocus])

  // "has entered text": after a few seconds without keystrokes the state flips, and is re-sent
  // now and then so it doesn't expire on the other side while the draft sits there.
  useEffect(() => {
    if (!text.trim()) return
    const t = window.setInterval(() => {
      const now = Date.now()
      const st = typingStateFor(text, now - lastKey.current)
      if (!st) return
      const gap = st === 'typing' ? 2000 : 10_000
      if (st !== sentState.current || now - lastPing.current > gap) {
        sentState.current = st
        lastPing.current = now
        onTyping(true, st)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [text, onTyping])

  // Re-render while the Buzz cooldown runs so the button re-enables itself.
  useEffect(() => {
    if (!buzzAt) return
    const t = window.setTimeout(() => tick((n) => n + 1), BUZZ_COOLDOWN + 50)
    return () => window.clearTimeout(t)
  }, [buzzAt])

  useEffect(() => {
    const t = ta.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 180)}px`
  }, [text])

  useEffect(() => {
    const u = picked?.url
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [picked])

  const setFile = (f: File | null) => setPicked(f ? { file: f, url: isImage(f.type) ? URL.createObjectURL(f) : null } : null)

  function pick(f: File | null | undefined) {
    if (!f) return
    const err = validateFile(f)
    if (err) return toast(err)
    setFile(f)
    ta.current?.focus()
  }

  function change(v: string) {
    setText(v)
    const now = Date.now()
    lastKey.current = now
    if (v.trim() && (now - lastPing.current > 2000 || sentState.current !== 'typing')) {
      lastPing.current = now
      sentState.current = 'typing'
      onTyping(true, 'typing')
    } else if (!v.trim() && lastPing.current) {
      stopTyping()
    }
  }

  function stopTyping() {
    lastPing.current = 0
    sentState.current = null
    onTyping(false)
  }

  function insert(snippet: string) {
    const t = ta.current
    const at = t?.selectionStart ?? text.length
    const end = t?.selectionEnd ?? at
    const pre = text.slice(0, at)
    const add = (pre && !/\s$/.test(pre) ? ' ' : '') + snippet + ' '
    change(pre + add + text.slice(end))
    requestAnimationFrame(() => (t?.focus(), t?.setSelectionRange(at + add.length, at + add.length)))
  }

  const toggle = (k: 'b' | 'i' | 'u') => setStyle((s) => ({ ...s, [k]: !s[k] }))

  const buzzWait = buzzAt && Date.now() - buzzAt < BUZZ_COOLDOWN

  function send() {
    const body = text.trim()
    if ((!body && !file) || disabled) return
    onSend(body, file, body ? cleanStyle(style) : null)
    setText('')
    setFile(null)
    stopTyping()
    ta.current?.focus()
  }

  const canSend = (!!text.trim() || !!file) && !disabled
  return (
    <div
      className={`relative border-t border-line bg-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 ${drag ? 'ring-2 ring-inset ring-blue' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        pick(e.dataTransfer.files[0])
      }}
    >
      {drag && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-paper-hi/90 font-display text-lg font-semibold text-blue">Drop to attach (5 MB max)</div>}
      {file && (
        <div className="stamp-in mb-2 flex items-center gap-3 rounded-lg border border-line bg-card p-2">
          {preview ? (
            <img src={preview} alt="" className="h-12 w-12 rounded-md object-cover" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-md bg-blue text-on-accent">
              <FileText size={20} aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{file.name}</span>
            <span className="font-mono text-xs text-muted">{formatBytes(file.size)} · sends with your message</span>
          </span>
          <Btn tip="Remove attachment" iconOnly size="sm" variant="plain" onClick={() => setFile(null)}>
            <X size={16} aria-hidden="true" />
          </Btn>
        </div>
      )}
      <div className="relative mb-1 flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
        <Btn tip="Bold" iconOnly size="xs" variant={style.b ? 'blue' : 'plain'} aria-pressed={!!style.b} disabled={disabled} onClick={() => toggle('b')}>
          <Bold size={14} aria-hidden="true" />
        </Btn>
        <Btn tip="Italic" iconOnly size="xs" variant={style.i ? 'blue' : 'plain'} aria-pressed={!!style.i} disabled={disabled} onClick={() => toggle('i')}>
          <Italic size={14} aria-hidden="true" />
        </Btn>
        <Btn tip="Underline" iconOnly size="xs" variant={style.u ? 'blue' : 'plain'} aria-pressed={!!style.u} disabled={disabled} onClick={() => toggle('u')}>
          <Underline size={14} aria-hidden="true" />
        </Btn>
        <Btn tip="Text colour" iconOnly size="xs" variant="plain" aria-expanded={pop === 'color'} disabled={disabled} onClick={() => setPop((p) => (p === 'color' ? null : 'color'))}>
          <span className={`text-sm font-black ${style.color ? `fmt-${style.color}` : ''}`} aria-hidden="true">
            A
          </span>
          <span className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full" style={{ background: style.color ? `var(--s-${style.color})` : 'var(--ink)' }} aria-hidden="true" />
        </Btn>
        <Btn
          tip="Smaller text"
          iconOnly
          size="xs"
          variant={style.size === 's' ? 'blue' : 'plain'}
          aria-pressed={style.size === 's'}
          disabled={disabled}
          onClick={() => setStyle((s) => ({ ...s, size: s.size === 's' ? undefined : 's' }))}
        >
          <span className="text-[10px] font-black" aria-hidden="true">
            A-
          </span>
        </Btn>
        <Btn
          tip="Bigger text"
          iconOnly
          size="xs"
          variant={style.size === 'l' ? 'blue' : 'plain'}
          aria-pressed={style.size === 'l'}
          disabled={disabled}
          onClick={() => setStyle((s) => ({ ...s, size: s.size === 'l' ? undefined : 'l' }))}
        >
          <span className="text-[15px] font-black" aria-hidden="true">
            A+
          </span>
        </Btn>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <Btn tip="Smileys" iconOnly size="xs" variant="plain" aria-expanded={pop === 'smiley'} disabled={disabled} onClick={() => setPop((p) => (p === 'smiley' ? null : 'smiley'))}>
          <Sticker size={15} aria-hidden="true" />
        </Btn>
        <span className="relative">
          <Btn tip="Insert an emoji" iconOnly size="xs" variant="plain" disabled={disabled} aria-expanded={emoji} onClick={() => setEmoji((v) => !v)}>
            <Smile size={15} aria-hidden="true" />
          </Btn>
          {emoji && (
            <EmojiGrid
              label="Insert an emoji"
              className="bottom-9 left-0"
              onClose={() => setEmoji(false)}
              onPick={(e) => {
                insert(e)
                setEmoji(false)
              }}
            />
          )}
        </span>
        <Btn tip="Send an image or file (5 MB max)" iconOnly size="xs" variant="plain" disabled={disabled} onClick={() => input.current?.click()}>
          <Paperclip size={15} aria-hidden="true" />
        </Btn>
        {onBuzz && (
          <Btn
            tip={buzzWait ? 'Buzz is cooling down…' : 'Buzz! Shake their window'}
            size="xs"
            variant="plain"
            className="ml-auto !font-pixel !text-[10px] text-brass"
            disabled={disabled || !!buzzWait}
            onClick={() => {
              setBuzzAt(Date.now())
              onBuzz()
            }}
          >
            <Zap size={14} aria-hidden="true" /> Buzz
          </Btn>
        )}
        {pop === 'color' && (
          <div
            className="pop absolute bottom-9 left-16 z-20 flex gap-1 rounded-xl border border-line bg-card p-1.5 shadow-lg"
            role="group"
            aria-label="Text colour"
            onKeyDown={(e) => e.key === 'Escape' && setPop(null)}
          >
            <Btn tip="Default colour" iconOnly size="xs" variant={!style.color ? 'blue' : 'plain'} onClick={() => (setStyle((s) => ({ ...s, color: undefined })), setPop(null))}>
              <span className="h-4 w-4 rounded-full border border-edge bg-ink" aria-hidden="true" />
            </Btn>
            {STYLE_COLORS.map((c) => (
              <Btn key={c} tip={COLOR_NAME[c]} iconOnly size="xs" variant={style.color === c ? 'blue' : 'plain'} onClick={() => (setStyle((s) => ({ ...s, color: c })), setPop(null))}>
                <span className="h-4 w-4 rounded-full border border-white/60" style={{ background: `var(--s-${c})` }} aria-hidden="true" />
              </Btn>
            ))}
          </div>
        )}
        {pop === 'smiley' && (
          <div
            className="pop absolute bottom-9 left-0 z-20 grid w-[15.5rem] grid-cols-7 gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-lg"
            role="group"
            aria-label="Smileys"
            onKeyDown={(e) => e.key === 'Escape' && setPop(null)}
          >
            {SMILEYS.map((sm) => (
              <Btn
                key={sm.id}
                tip={`${sm.label}  ${sm.code}`}
                iconOnly
                size="sm"
                variant="plain"
                onClick={() => {
                  insert(sm.code)
                  setPop(null)
                }}
              >
                <Smiley id={sm.id} size={22} />
              </Btn>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <input ref={input} type="file" accept={ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
        <label htmlFor={id} className="sr-only">
          Message {roomName}
        </label>
        <textarea
          id={id}
          ref={ta}
          rows={2}
          value={text}
          maxLength={4000}
          disabled={disabled}
          placeholder={`Send an IM to ${roomName}…`}
          onChange={(e) => change(e.target.value)}
          onBlur={() => lastPing.current && !text.trim() && stopTyping()}
          onPaste={(e) => {
            const f = [...e.clipboardData.files][0]
            if (!f) return
            e.preventDefault()
            pick(f)
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
              e.preventDefault()
              return toggle(e.key.toLowerCase() as 'b' | 'i' | 'u')
            }
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            send()
          }}
          className={`scroll-thin min-h-12 flex-1 resize-none rounded-xl border border-line bg-card px-3 py-2 text-[0.95rem] leading-snug outline-none transition-colors placeholder:text-muted focus:border-blue disabled:opacity-60 ${styleClass(cleanStyle(style))}`}
        />
        <Btn tip={canSend ? 'Send (Enter) · Shift+Enter for a new line' : 'Type something to send'} variant="red" disabled={!canSend} onClick={send} className="!h-12 disabled:opacity-50">
          <Send size={16} aria-hidden="true" /> <span className="hidden sm:inline">Send</span>
        </Btn>
      </div>
    </div>
  )
}
