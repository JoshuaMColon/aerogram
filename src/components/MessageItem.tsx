import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy, FileText, Pencil, RotateCw, SmilePlus, Trash2, X, Download } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileUrl } from '../lib/api'
import { clock, formatBytes, isEmojiOnly, isImage, linkify } from '../lib/logic'
import type { Message, Profile } from '../lib/types'
import { EmojiGrid } from './Emoji'
import { QUICK } from '../lib/emoji'
import { Btn, Stamp, Tip, inkDot } from './ui'

interface Props {
  db: SupabaseClient
  msg: Message
  author: Profile | undefined
  me: string
  first: boolean
  online: boolean
  profiles: Record<string, Profile>
  selected: boolean
  onSelect: (id: string | null) => void
  onReact: (m: Message, emoji: string) => void
  onEdit: (m: Message, body: string) => Promise<boolean>
  onDelete: (m: Message) => void
  onRetry: (m: Message) => void
  onDiscard: (m: Message) => void
}

function Attachment({ db, m }: { db: SupabaseClient; m: Message }) {
  const a = m.attachment!
  const [url, setUrl] = useState<string | null>(m.localUrl ?? null)
  const [dl, setDl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (m.pending || m.failed) return
    let live = true
    fileUrl(db, a.path)
      .then((u) => live && setUrl(u))
      .catch(() => live && setErr(true))
    fileUrl(db, a.path, a.name)
      .then((u) => live && setDl(u))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [db, a.path, a.name, m.pending, m.failed])

  if (isImage(a.mime)) {
    const ratio = a.w && a.h ? `${a.w} / ${a.h}` : '4 / 3'
    const w = a.w && a.h ? Math.min(320, Math.round((a.w / a.h) * 240)) : 280
    return (
      <Tip tip={m.pending ? 'Uploading…' : 'Open the full image in a new tab'}>
        {(d) => (
          <a
            {...d}
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className={`press mt-1 block max-w-full overflow-hidden rounded-lg border border-line bg-sunk ${m.pending ? 'opacity-70' : ''}`}
            style={{ width: w, aspectRatio: ratio }}
            aria-label={`Image: ${a.name}`}
          >
            {url && !err ? (
              <img src={url} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="grid h-full place-items-center p-3 text-xs text-muted">{err ? 'Image unavailable' : 'Loading…'}</span>
            )}
          </a>
        )}
      </Tip>
    )
  }
  return (
    <div className="mt-1 flex w-72 max-w-full items-center gap-3 rounded-lg border border-line bg-paper-hi p-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue text-on-accent">
        <FileText size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{a.name}</span>
        <span className="block font-mono text-xs text-muted">
          {formatBytes(a.size)}
          {m.pending ? ' · uploading…' : ''}
        </span>
      </span>
      {dl && (
        <Tip tip={`Download ${a.name}`}>
          {(d) => (
            <a
              {...d}
              href={dl}
              aria-label={`Download ${a.name}`}
              className="press relative grid h-8 w-8 place-items-center overflow-hidden rounded-md border border-line bg-card hover:border-edge"
              onPointerDown={inkDot}
            >
              <Download size={16} aria-hidden="true" />
            </a>
          )}
        </Tip>
      )}
    </div>
  )
}

function names(ids: string[], profiles: Record<string, Profile>, me: string) {
  const list = ids.map((id) => (id === me ? 'You' : (profiles[id]?.display_name ?? 'Someone')))
  return list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(', ')
}

export const MessageItem = memo(function MessageItem({ db, msg: m, author, me, first, online, profiles, selected, onSelect, onReact, onEdit, onDelete, onRetry, onDiscard }: Props) {
  const mine = m.user_id === me
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.body)
  const [picker, setPicker] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const deleted = !!m.deleted_at
  const name = author?.display_name ?? '…'
  const big = !m.attachment && isEmojiOnly(m.body)
  const reactions = Object.entries(m.reactions ?? {}).filter(([, u]) => u.length)

  useEffect(() => {
    if (editing) {
      const t = editRef.current
      t?.focus()
      t?.setSelectionRange(t.value.length, t.value.length)
    }
  }, [editing])

  async function save() {
    const body = draft.trim()
    if (!body || body === m.body) return setEditing(false)
    if (await onEdit(m, body)) setEditing(false)
  }

  const showBar = !deleted && !editing && !m.pending && !m.failed
  return (
    <div
      data-msg={m.id}
      className={`group relative flex gap-3 px-3 sm:px-5 ${first ? 'mt-3' : 'mt-0.5'} ${mine ? 'flex-row-reverse' : ''} ${m.pending ? '' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,a,textarea')) return
        if (matchMedia('(hover: none)').matches) onSelect(selected ? null : m.id)
      }}
    >
      <div className="w-9 shrink-0">{first && !mine && <Stamp name={name} stamp={author?.stamp ?? 0} size={36} online={online} bot={author?.is_bot} />}</div>
      <div className={`flex min-w-0 max-w-[min(36rem,82%)] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {first && (
          <div className={`mb-0.5 flex items-baseline gap-2 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
            <span className="text-sm font-semibold">{mine ? 'You' : name}</span>
            <time dateTime={m.created_at} className="font-mono text-[11px] text-muted">
              {clock(m.created_at)}
            </time>
          </div>
        )}
        <div
          data-first={first}
          className={`${big || (m.attachment && !m.body && !deleted) ? '' : mine ? 'letter-mine' : 'letter-theirs'} ${big ? '' : 'rounded-lg px-3 py-1.5'} ${!big && first ? (mine ? 'rounded-tr-sm' : 'rounded-tl-sm') : ''} ${m.pending && !m.attachment ? 'opacity-75' : ''} ${m.failed ? '!border-bad' : ''} relative max-w-full`}
        >
          {deleted ? (
            <p className="font-display text-sm italic text-muted">✉ This letter was withdrawn.</p>
          ) : editing ? (
            <div className="w-[min(30rem,70vw)]">
              <label className="sr-only" htmlFor={`edit-${m.id}`}>
                Edit message
              </label>
              <textarea
                id={`edit-${m.id}`}
                ref={editRef}
                value={draft}
                maxLength={4000}
                rows={Math.min(8, Math.max(2, draft.split('\n').length))}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    save()
                  } else if (e.key === 'Escape') {
                    e.stopPropagation()
                    setEditing(false)
                    setDraft(m.body)
                  }
                }}
                className="w-full resize-none rounded-md border border-edge bg-card p-2 text-[0.95rem] outline-none focus:border-blue"
              />
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className="mr-auto text-xs text-muted">Enter to save · Esc to cancel</span>
                <Btn tip="Discard changes" size="xs" variant="plain" onClick={() => (setEditing(false), setDraft(m.body))}>
                  <X size={14} aria-hidden="true" /> Cancel
                </Btn>
                <Btn tip="Save the edited message" size="xs" variant="blue" onClick={save}>
                  <Check size={14} aria-hidden="true" /> Save
                </Btn>
              </div>
            </div>
          ) : (
            <>
              {m.body && (
                <p className={`whitespace-pre-wrap break-words ${big ? 'text-4xl leading-tight' : 'text-[0.95rem] leading-relaxed'}`}>
                  {linkify(m.body).map((p, i) =>
                    p.href ? (
                      <a key={i} href={p.href} target="_blank" rel="noreferrer noopener nofollow" className="font-medium text-blue underline decoration-1 underline-offset-2">
                        {p.text}
                      </a>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                  {m.edited_at && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">(edited)</span>}
                </p>
              )}
              {m.attachment && <Attachment db={db} m={m} />}
            </>
          )}
        </div>

        {m.pending && <span className="mt-0.5 px-1 font-mono text-[10px] uppercase tracking-wider text-muted">Sending…</span>}
        {m.failed && (
          <span className="mt-1 flex items-center gap-1.5 px-1 text-xs text-bad" role="alert">
            Not sent: {m.failed}
            <Btn tip="Try sending this again" size="xs" variant="danger" onClick={() => onRetry(m)}>
              <RotateCw size={12} aria-hidden="true" /> Retry
            </Btn>
            <Btn tip="Remove this unsent message" size="xs" variant="plain" onClick={() => onDiscard(m)}>
              Discard
            </Btn>
          </span>
        )}

        {reactions.length > 0 && !deleted && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
            {reactions.map(([e, users]) => {
              const on = users.includes(me)
              return (
                <Btn
                  key={e}
                  tip={`${names(users, profiles, me)} reacted ${e}${on ? ' · click to remove yours' : ''}`}
                  size="xs"
                  variant="plain"
                  aria-pressed={on}
                  aria-label={`${e} ${users.length}, ${on ? 'remove your reaction' : 'add your reaction'}`}
                  onClick={() => onReact(m, e)}
                  className={`pop !h-6 !rounded-full !border px-2 ${on ? '!border-blue bg-mine text-blue' : '!border-line bg-card'}`}
                >
                  <span className="text-sm">{e}</span>
                  <span className="font-mono text-[11px] font-semibold">{users.length}</span>
                </Btn>
              )
            })}
          </div>
        )}
      </div>

      {showBar && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={`absolute -top-4 z-20 items-center gap-0.5 rounded-lg border border-line bg-card p-0.5 shadow-md ${mine ? 'left-3 sm:left-auto sm:right-[calc(min(36rem,82%)+4.5rem)]' : 'right-3'} ${selected || picker || confirm ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}
        >
          {QUICK.slice(0, 3).map((e) => (
            <Btn key={e} tip={`React with ${e}`} iconOnly size="sm" variant="plain" onClick={() => onReact(m, e)} className="!h-7 text-base">
              <span aria-hidden="true">{e}</span>
            </Btn>
          ))}
          <div className="relative">
            <Btn tip="More reactions" iconOnly size="sm" variant="plain" className="!h-7" aria-expanded={picker} onClick={() => setPicker((p) => !p)}>
              <SmilePlus size={16} aria-hidden="true" />
            </Btn>
            {picker && <EmojiGrid label="React with an emoji" className={`top-9 ${mine ? 'left-0' : 'right-0'}`} onClose={() => setPicker(false)} onPick={(e) => (onReact(m, e), setPicker(false))} />}
          </div>
          {m.body && (
            <Btn tip="Copy text" iconOnly size="sm" variant="plain" className="!h-7" onClick={() => navigator.clipboard?.writeText(m.body)}>
              <Copy size={15} aria-hidden="true" />
            </Btn>
          )}
          {mine && m.body && (
            <Btn tip="Edit message" iconOnly size="sm" variant="plain" className="!h-7" onClick={() => (setDraft(m.body), setEditing(true), onSelect(null))}>
              <Pencil size={15} aria-hidden="true" />
            </Btn>
          )}
          {mine && (
            <div className="relative">
              <Btn tip="Delete message" iconOnly size="sm" variant="plain" className="!h-7 text-bad" aria-expanded={confirm} onClick={() => setConfirm((c) => !c)}>
                <Trash2 size={15} aria-hidden="true" />
              </Btn>
              {confirm && (
                <div role="alertdialog" aria-label="Delete this message?" className="stamp-in absolute right-0 top-9 z-40 w-56 rounded-lg border border-line bg-card p-3 shadow-xl">
                  <p className="text-sm font-semibold">Withdraw this letter?</p>
                  <p className="mt-0.5 text-xs text-muted">Everyone will see that it was deleted.{m.attachment ? ' The file is removed too.' : ''}</p>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <Btn tip="Keep the message" size="xs" variant="plain" onClick={() => setConfirm(false)}>
                      Keep
                    </Btn>
                    <Btn tip="Delete it for everyone" size="xs" variant="red" onClick={() => (setConfirm(false), onDelete(m))}>
                      Delete
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
