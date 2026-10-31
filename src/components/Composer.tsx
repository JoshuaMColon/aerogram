import { useEffect, useRef, useState } from 'react'
import { FileText, Paperclip, Send, Smile, X } from 'lucide-react'
import { ACCEPT, formatBytes, isImage, validateFile } from '../lib/logic'
import { EmojiGrid } from './Emoji'
import { Btn, useToast } from './ui'

interface Props {
  roomName: string
  disabled?: boolean
  onSend: (body: string, file: File | null) => void
  onTyping: (on: boolean) => void
}

/** The writing desk: autosizing textarea, emoji, attachments (button, paste, drop), Enter to send. */
export function Composer({ roomName, disabled, onSend, onTyping }: Props) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<{ file: File; url: string | null } | null>(null)
  const file = picked?.file ?? null
  const preview = picked?.url ?? null
  const [emoji, setEmoji] = useState(false)
  const [drag, setDrag] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const lastPing = useRef(0)
  const toast = useToast()

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
    if (v.trim() && now - lastPing.current > 2000) {
      lastPing.current = now
      onTyping(true)
    } else if (!v.trim() && lastPing.current) {
      lastPing.current = 0
      onTyping(false)
    }
  }

  function send() {
    const body = text.trim()
    if ((!body && !file) || disabled) return
    onSend(body, file)
    setText('')
    setFile(null)
    lastPing.current = 0
    onTyping(false)
    ta.current?.focus()
  }

  const canSend = (!!text.trim() || !!file) && !disabled
  return (
    <div
      className={`relative border-t border-line bg-paper-hi px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 ${drag ? 'ring-2 ring-inset ring-blue' : ''}`}
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
      <div className="flex items-end gap-1.5">
        <input ref={input} type="file" accept={ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
        <Btn tip="Attach an image or file (5 MB max)" iconOnly variant="plain" disabled={disabled} onClick={() => input.current?.click()}>
          <Paperclip size={19} aria-hidden="true" />
        </Btn>
        <div className="relative">
          <Btn tip="Insert an emoji" iconOnly variant="plain" disabled={disabled} aria-expanded={emoji} onClick={() => setEmoji((v) => !v)}>
            <Smile size={19} aria-hidden="true" />
          </Btn>
          {emoji && (
            <EmojiGrid
              label="Insert an emoji"
              className="bottom-12 left-0"
              onClose={() => setEmoji(false)}
              onPick={(e) => {
                const t = ta.current
                const at = t?.selectionStart ?? text.length
                change(text.slice(0, at) + e + text.slice(t?.selectionEnd ?? at))
                setEmoji(false)
                requestAnimationFrame(() => (t?.focus(), t?.setSelectionRange(at + e.length, at + e.length)))
              }}
            />
          )}
        </div>
        <label htmlFor="composer" className="sr-only">
          Message {roomName}
        </label>
        <textarea
          id="composer"
          ref={ta}
          rows={1}
          value={text}
          maxLength={4000}
          disabled={disabled}
          placeholder={`Write to ${roomName}…`}
          onChange={(e) => change(e.target.value)}
          onBlur={() => lastPing.current && (onTyping(false), (lastPing.current = 0))}
          onPaste={(e) => {
            const f = [...e.clipboardData.files][0]
            if (!f) return
            e.preventDefault()
            pick(f)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            send()
          }}
          className="scroll-thin min-h-10 flex-1 resize-none rounded-lg border border-line bg-card px-3 py-2 text-[0.95rem] leading-snug outline-none transition-colors placeholder:text-muted focus:border-blue disabled:opacity-60"
        />
        <Btn tip={canSend ? 'Send (Enter) · Shift+Enter for a new line' : 'Write something to send'} iconOnly variant="red" disabled={!canSend} onClick={send} className="disabled:opacity-50">
          <Send size={18} aria-hidden="true" />
        </Btn>
      </div>
    </div>
  )
}
