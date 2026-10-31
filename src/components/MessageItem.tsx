import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy, FileText, Pencil, RotateCw, SmilePlus, Trash2, X, Download } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileUrl } from '../lib/api'
import { clock, formatBytes, isEmojiOnly, isImage, linkify } from '../lib/logic'
import { expandAway, splitSmileys, styleClass, SMILEYS } from '../lib/im'
import { Smiley } from './Smiley'
import type { Message, Profile } from '../lib/types'
import { EmojiGrid } from './Emoji'
import { QUICK } from '../lib/emoji'
import { Btn, Tip, inkDot } from './ui'
import { useSkin } from '../state/skin'

interface Props {
  db: SupabaseClient
  msg: Message
  author: Profile | undefined
  me: string
  first: boolean
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

const SMILEY_LABEL = Object.fromEntries(SMILEYS.map((s) => [s.id, s.label]))

/** Message text with links and :) style smileys rendered inline. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer noopener nofollow" className="font-semibold text-blue underline decoration-1 underline-offset-2">
            {p.text}
          </a>
        ) : (
          splitSmileys(p.text).map((q, j) => ('smiley' in q ? <Smiley key={`${i}-${j}`} id={q.smiley} title={`${SMILEY_LABEL[q.smiley]} ${q.code}`} /> : <span key={`${i}-${j}`}>{q.text}</span>))
        ),
      )}
    </>
  )
}

function names(ids: string[], profiles: Record<string, Profile>, me: string) {
  const list = ids.map((id) => (id === me ? 'You' : (profiles[id]?.display_name ?? 'Someone')))
  return list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(', ')
}

export const MessageItem = memo(function MessageItem({ db, msg: m, author, me, first, profiles, selected, onSelect, onReact, onEdit, onDelete, onRetry, onDiscard }: Props) {
  const mine = m.user_id === me
  const bubble = useSkin().resolved.look.bubble
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

  const showBar = !deleted && !editing && !m.pending && !m.failed && m.kind !== 'buzz'
  const nameCls = mine ? 'text-red' : 'text-blue'

  const dim = m.pending && !m.attachment ? 'opacity-70' : ''
  const header =
    m.kind === 'away' ? (
      <span className={`font-extrabold ${nameCls}`}>
        Auto response from {name}
        <span className="ml-1 font-normal text-muted">({clock(m.created_at)})</span>:{' '}
      </span>
    ) : (
      <span className={`font-extrabold ${nameCls}`}>
        {name}
        {author?.is_bot && <span className="ml-1 rounded bg-brass px-1 align-[0.15em] font-pixel text-[8px] font-normal text-paper-hi">BOT</span>}
        <time dateTime={m.created_at} className="ml-1 text-[11px] font-semibold text-muted">
          ({clock(m.created_at)})
        </time>
        :{' '}
      </span>
    )
  const content = (
    <>
      {deleted ? (
        <span className="italic text-muted">message deleted</span>
      ) : editing ? (
        <div className="mt-1">
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
            <span className={`whitespace-pre-wrap break-words ${big ? 'text-3xl leading-tight' : ''} ${m.kind === 'away' ? 'italic' : ''} ${styleClass(m.style)}`}>
              <RichText text={m.kind === 'away' ? expandAway(m.body, mine ? null : (profiles[me]?.display_name ?? null), new Date(m.created_at)) : m.body} />
            </span>
          )}
          {m.edited_at && <span className="ml-1.5 text-[11px] font-semibold text-muted">(edited)</span>}
          {m.attachment && <Attachment db={db} m={m} />}
        </>
      )}
    </>
  )
  const smallHeader = (
    <div className={`mb-0.5 px-1 text-[11px] ${mine && bubble === 'bubbles' ? 'text-right' : ''}`}>
      <span className={`font-extrabold ${nameCls}`}>{m.kind === 'away' ? `Auto response from ${name}` : name}</span>
      {author?.is_bot && <span className="ml-1 rounded bg-brass px-1 font-pixel text-[8px] text-paper-hi">BOT</span>}
      <time dateTime={m.created_at} className="ml-1.5 font-semibold text-muted">
        {clock(m.created_at)}
      </time>
    </div>
  )

  if (m.kind === 'buzz')
    return (
      <div data-msg={m.id} className="arrive my-1.5 flex justify-center px-3">
        <span className="postmark inline-flex items-center gap-1.5 px-3 py-0.5 text-[11px] text-red">
          <span aria-hidden="true">⚡</span> {mine ? 'You sent a Buzz!' : `${name} buzzed you!`}
          <time dateTime={m.created_at} className="text-muted">
            {clock(m.created_at)}
          </time>
        </span>
      </div>
    )

  return (
    <div
      data-msg={m.id}
      data-kind={m.kind}
      className={`group relative px-3 py-[3px] hover:bg-sunk/70 sm:px-4 ${first ? 'mt-1' : ''} ${selected ? 'bg-sunk/70' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,a,textarea')) return
        if (matchMedia('(hover: none)').matches) onSelect(selected ? null : m.id)
      }}
    >
      {bubble === 'classic' ? (
        <div className={`min-w-0 text-[0.95rem] leading-snug ${dim}`}>
          {header}
          {content}
        </div>
      ) : bubble === 'bubbles' ? (
        <div className={`flex min-w-0 flex-col text-[0.95rem] leading-snug ${mine ? 'items-end' : 'items-start'} ${dim}`}>
          {(first || m.kind === 'away') && smallHeader}
          <div className={`bubble ${mine ? 'mine' : ''} ${first ? (mine ? 'tail-mine' : 'tail-them') : ''} ${editing ? 'w-full' : ''}`}>{content}</div>
        </div>
      ) : (
        <div className={`msg-card min-w-0 text-[0.95rem] leading-snug ${mine ? 'mine' : ''} ${dim}`}>
          {smallHeader}
          {content}
        </div>
      )}

      {m.pending && <span className={`block text-[11px] font-semibold text-muted ${mine && bubble === 'bubbles' ? 'text-right' : ''}`}>Sending…</span>}
      {m.failed && (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-bad" role="alert">
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
        <div className={`mt-1 flex flex-wrap gap-1 ${mine && bubble === 'bubbles' ? 'justify-end' : ''}`}>
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
                <span className="text-[11px] font-bold">{users.length}</span>
              </Btn>
            )
          })}
        </div>
      )}

      {showBar && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={`absolute -top-3.5 right-2 z-20 items-center gap-0.5 rounded-lg border border-line bg-card p-0.5 shadow-md ${selected || picker || confirm ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}
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
            {picker && <EmojiGrid label="React with an emoji" className="right-0 top-9" onClose={() => setPicker(false)} onPick={(e) => (onReact(m, e), setPicker(false))} />}
          </div>
          {m.body && (
            <Btn tip="Copy text" iconOnly size="sm" variant="plain" className="!h-7" onClick={() => navigator.clipboard?.writeText(m.body)}>
              <Copy size={15} aria-hidden="true" />
            </Btn>
          )}
          {mine && m.body && m.kind === 'text' && (
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
                  <p className="text-sm font-bold">Delete this message?</p>
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
