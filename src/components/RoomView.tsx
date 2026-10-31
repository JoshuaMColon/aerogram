import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { ArrowDown, ArrowLeft, LogOut, Users } from 'lucide-react'
import * as api from '../lib/api'
import { groupMessages, lastOwnMessage, liveTypists, markFailed, mergeMessages, readMark, readersOf, removeMessage, roomTopic, toggleReaction, typingText } from '../lib/logic'
import type { Member, Message, RoomSummary } from '../lib/types'
import { roomTitle, useChat } from '../state/chat'
import { navigate } from '../router'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'
import { Btn, RoomStamp, Stamp, Tip, useToast } from './ui'

const BOTTOM_SLACK = 120

export function RoomView({ room, onPeople }: { room: RoomSummary; onPeople: (room: RoomSummary, members: Member[]) => void }) {
  const { db, me, profiles, ensureProfiles, online, subscribe, refreshRooms, patchRoom } = useChat()
  const toast = useToast()
  const [msgs, setMsgs] = useState<Message[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [older, setOlder] = useState(false)
  const [typists, setTypists] = useState<Record<string, { name: string; at: number }>>({})
  const [, tick] = useState(0)
  const [atBottom, setAtBottom] = useState(true)
  const [fresh, setFresh] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ h: number; top: number } | null>(null)
  const stick = useRef(true)
  const typingCh = useRef<RealtimeChannel | null>(null)
  const files = useRef(new Map<string, File>())
  const roomId = room.id
  const title = roomTitle(room, profiles)

  const load = useCallback(async () => {
    const [page, mem] = await Promise.all([api.messages(db, roomId), api.members(db, roomId)])
    setMsgs((cur) =>
      mergeMessages(
        cur.filter((m) => m.pending || m.failed),
        page,
      ),
    )
    setMembers(mem)
    setHasMore(page.length === api.PAGE)
    ensureProfiles([...page.map((m) => m.user_id), ...mem.map((m) => m.user_id)])
  }, [db, roomId, ensureProfiles])

  useEffect(() => {
    // The view is keyed by room id, so state starts fresh for each room.
    let live = true
    // load() only sets state after its first await; the rule can't see through the async call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch((e: Error) => live && toast(`Couldn't open the room: ${e.message}`))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [load, toast])

  // Live events from the shared Postgres-changes channel.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'msg' && e.msg.room_id === roomId) {
          setMsgs((cur) => mergeMessages(cur, [e.msg]))
          setTypists((t) => {
            if (!t[e.msg.user_id]) return t
            const n = { ...t }
            delete n[e.msg.user_id]
            return n
          })
          if (e.msg.user_id !== me.id && !stick.current) setFresh((f) => f + 1)
        } else if (e.type === 'member' && e.member.room_id === roomId) {
          setMembers((cur) => {
            const i = cur.findIndex((m) => m.id === e.member.id)
            return i < 0 ? [...cur, e.member] : cur.map((m) => (m.id === e.member.id ? e.member : m))
          })
        } else if (e.type === 'member-gone') {
          setMembers((cur) => cur.filter((m) => m.id !== e.id))
        } else if (e.type === 'resync') load().catch(() => {})
      }),
    [subscribe, roomId, me.id, load],
  )

  // Typing indicators: broadcast on a private per-room channel (members only, via RLS on realtime.messages).
  useEffect(() => {
    let dead = false
    let ch: RealtimeChannel | null = null
    db.realtime.setAuth().then(() => {
      if (dead) return
      ch = db.channel(roomTopic(roomId), { config: { private: true, broadcast: { self: false } } })
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { user_id: string; name: string; on: boolean }
        if (!p?.user_id || p.user_id === me.id) return
        setTypists((t) => {
          const n = { ...t }
          if (p.on) n[p.user_id] = { name: String(p.name).slice(0, 32), at: Date.now() }
          else delete n[p.user_id]
          return n
        })
      }).subscribe()
      typingCh.current = ch
    })
    return () => {
      dead = true
      typingCh.current = null
      if (ch) db.removeChannel(ch)
    }
  }, [db, roomId, me.id])

  const typingNow = liveTypists(typists)
  useEffect(() => {
    if (!Object.keys(typists).length) return
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [typists])

  const sendTyping = useCallback(
    (on: boolean) => {
      typingCh.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: me.id, name: me.display_name, on } })
    },
    [me.id, me.display_name],
  )

  // Scrolling: stick to the bottom for new letters, keep position when older history is prepended.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (anchor.current) {
      el.scrollTop = el.scrollHeight - anchor.current.h + anchor.current.top
      anchor.current = null
    } else if (stick.current) el.scrollTop = el.scrollHeight
  }, [msgs, typingNow.length])

  const loadOlder = useCallback(async () => {
    const el = scroller.current
    const first = msgs.find((m) => !m.pending && !m.failed)
    if (!el || older || !hasMore || !first) return
    setOlder(true)
    try {
      const page = await api.messages(db, roomId, first)
      anchor.current = { h: el.scrollHeight, top: el.scrollTop }
      setHasMore(page.length === api.PAGE)
      ensureProfiles(page.map((m) => m.user_id))
      setMsgs((cur) => mergeMessages(cur, page))
    } catch (e) {
      toast(`Couldn't load older letters: ${(e as Error).message}`)
    } finally {
      setOlder(false)
    }
  }, [db, roomId, msgs, older, hasMore, ensureProfiles, toast])

  function onScroll() {
    const el = scroller.current!
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK
    stick.current = bottom
    if (bottom !== atBottom) setAtBottom(bottom)
    if (bottom && fresh) setFresh(0)
    if (el.scrollTop < 200 && !loading) loadOlder()
  }

  // Read receipts: move my marker when the newest letter is on screen and the tab is visible.
  const myMember = members.find((m) => m.user_id === me.id)
  const newest = [...msgs].reverse().find((m) => !m.pending && !m.failed)
  useEffect(() => {
    if (!newest || !myMember || !atBottom) return
    const mark = readMark(newest)
    if (myMember.last_read_at >= mark) return
    const go = () => {
      if (document.visibilityState !== 'visible') return
      setMembers((cur) => cur.map((m) => (m.id === myMember.id ? { ...m, last_read_at: mark } : m)))
      patchRoom(roomId, { unread: 0, last_read_at: mark })
      api.markRead(db, roomId, me.id, mark).catch(() => {})
    }
    go()
    document.addEventListener('visibilitychange', go)
    return () => document.removeEventListener('visibilitychange', go)
  }, [newest, myMember, atBottom, db, roomId, me.id, patchRoom])

  // Sending: optimistic row with a client id; upload first, then insert; the realtime echo merges by id.
  const deliver = useCallback(
    async (draft: Message, file: File | null) => {
      try {
        let attachment = draft.attachment
        if (file) {
          const dims = await api.imageSize(file)
          attachment = await api.uploadFile(db, roomId, me.id, file, dims)
        }
        const row = await api.sendMessage(db, { id: draft.id, room_id: roomId, user_id: me.id, body: draft.body, attachment })
        files.current.delete(draft.id)
        setMsgs((cur) => mergeMessages(cur, [row]))
      } catch (e) {
        const msg = (e as Error).message
        setMsgs((cur) => markFailed(cur, draft.id, /rate|slow/i.test(msg) ? 'slow down a moment' : msg.slice(0, 80)))
      }
    },
    [db, roomId, me.id],
  )

  const onSend = useCallback(
    (body: string, file: File | null) => {
      const id = crypto.randomUUID()
      const draft: Message = {
        id,
        room_id: roomId,
        user_id: me.id,
        body,
        reactions: {},
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        pending: true,
        attachment: file ? { path: '', name: file.name, mime: file.type, size: file.size } : null,
        localUrl: file && file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }
      if (file) files.current.set(id, file)
      stick.current = true
      setMsgs((cur) => mergeMessages(cur, [draft]))
      deliver({ ...draft, attachment: null }, file)
    },
    [roomId, me.id, deliver],
  )

  const onRetry = useCallback(
    (m: Message) => {
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, pending: true, failed: undefined } : x)))
      deliver({ ...m, attachment: null }, files.current.get(m.id) ?? null)
    },
    [deliver],
  )
  const onDiscard = useCallback((m: Message) => {
    files.current.delete(m.id)
    if (m.localUrl) URL.revokeObjectURL(m.localUrl)
    setMsgs((cur) => removeMessage(cur, m.id))
  }, [])

  const onReact = useCallback(
    async (m: Message, emoji: string) => {
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions: toggleReaction(x.reactions, emoji, me.id) } : x)))
      try {
        const reactions = await api.toggleReaction(db, m.id, emoji)
        setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions } : x)))
      } catch (e) {
        setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions: m.reactions } : x)))
        toast(`Couldn't react: ${(e as Error).message}`)
      }
    },
    [db, me.id, toast],
  )

  const onEdit = useCallback(
    async (m: Message, body: string) => {
      try {
        const row = await api.editMessage(db, m.id, body)
        setMsgs((cur) => mergeMessages(cur, [row]))
        return true
      } catch (e) {
        toast(`Couldn't save: ${(e as Error).message}`)
        return false
      }
    },
    [db, toast],
  )

  const onDelete = useCallback(
    async (m: Message) => {
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), body: '', attachment: null, reactions: {} } : x)))
      try {
        const row = await api.deleteMessage(db, m)
        setMsgs((cur) => mergeMessages(cur, [row]))
      } catch (e) {
        setMsgs((cur) => mergeMessages(cur, [m]))
        toast(`Couldn't delete: ${(e as Error).message}`)
      }
    },
    [db, toast],
  )

  async function leave() {
    try {
      await api.leaveRoom(db, roomId, me.id)
      await refreshRooms()
      navigate('/app')
    } catch (e) {
      toast(`Couldn't leave: ${(e as Error).message}`)
    }
  }

  const rows = useMemo(() => groupMessages(msgs), [msgs])
  const ownLast = lastOwnMessage(msgs, me.id)
  const readers = ownLast ? readersOf(members, ownLast, me.id) : []
  const onlineHere = members.filter((m) => online.has(m.user_id) || m.user_id === me.id).length
  const dmOther = room.kind === 'dm' && room.dm_user ? profiles[room.dm_user] : undefined
  const typing = typingText(typingNow.map((t) => t.name))

  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-1 flex-col">
      <header className="relative flex items-center gap-2 border-b border-line bg-paper-hi px-2 py-2 sm:px-4">
        <div className="md:hidden">
          <Btn tip="Back to all rooms" iconOnly variant="plain" onClick={() => navigate('/app')}>
            <ArrowLeft size={20} aria-hidden="true" />
          </Btn>
        </div>
        {room.kind === 'dm' ? <Stamp name={title} stamp={dmOther?.stamp ?? 0} size={38} online={!!room.dm_user && online.has(room.dm_user)} bot={dmOther?.is_bot} /> : <RoomStamp size={38} />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold leading-tight">{title}</h1>
          <p className="truncate text-xs text-muted">
            {room.kind === 'dm' ? (
              dmOther?.is_bot ? (
                'Friendly bot · replies to a few keywords'
              ) : room.dm_user && online.has(room.dm_user) ? (
                'Online now'
              ) : (
                'Direct letter'
              )
            ) : (
              <>
                {members.length} {members.length === 1 ? 'member' : 'members'} · <span className="text-good">{onlineHere} online</span>
                {room.topic ? ` · ${room.topic}` : ''}
              </>
            )}
          </p>
        </div>
        {room.kind === 'public' && (
          <>
            <Btn tip="People in this room" iconOnly variant="plain" onClick={() => onPeople(room, members)}>
              <Users size={19} aria-hidden="true" />
            </Btn>
            <Btn tip="Leave this room" iconOnly variant="plain" onClick={leave}>
              <LogOut size={18} aria-hidden="true" />
            </Btn>
          </>
        )}
        <div className="airmail-edge absolute inset-x-0 -bottom-[3px] h-[3px]" aria-hidden="true" />
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Messages in ${title}`}
      >
        {loading ? (
          <div className="space-y-4 p-6" aria-label="Loading messages">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex gap-3 ${i % 2 ? 'flex-row-reverse' : ''}`}>
                <div className="h-9 w-9 animate-pulse rounded bg-sunk" />
                <div className="h-14 w-1/2 animate-pulse rounded-lg bg-sunk" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="px-5 pb-2 pt-6 text-center">
              {hasMore ? (
                <Btn tip="Load earlier messages" size="xs" variant="ghost" onClick={loadOlder} disabled={older}>
                  {older ? 'Fetching older letters…' : 'Load earlier letters'}
                </Btn>
              ) : (
                <div className="mx-auto max-w-sm">
                  <p className="font-display text-xl font-semibold">{room.kind === 'dm' ? `Letters with ${title}` : `Welcome to #${room.slug ?? title}`}</p>
                  <p className="mt-1 text-sm text-muted">{room.kind === 'dm' ? 'Only the two of you can read these.' : room.topic || 'The very first letter starts here.'}</p>
                </div>
              )}
            </div>
            {rows.map((r) =>
              r.type === 'day' ? (
                <div key={r.key} className="my-4 flex items-center gap-3 px-5" role="separator">
                  <span className="h-px flex-1 bg-line" />
                  <span className="postmark px-3 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-brass">{r.label}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              ) : (
                <div key={r.key}>
                  <MessageItem
                    db={db}
                    msg={r.msg}
                    author={profiles[r.msg.user_id]}
                    me={me.id}
                    first={r.first}
                    online={online.has(r.msg.user_id)}
                    profiles={profiles}
                    selected={selected === r.msg.id}
                    onSelect={setSelected}
                    onReact={onReact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRetry={onRetry}
                    onDiscard={onDiscard}
                  />
                  {ownLast?.id === r.msg.id && readers.length > 0 && (
                    <div className="mt-1 flex items-center justify-end gap-1 px-5" aria-label={room.kind === 'dm' ? 'Read' : `Seen by ${readers.length}`}>
                      {room.kind === 'dm' ? (
                        <Tip tip={`Read by ${title}`}>
                          {(d) => (
                            <span {...d} tabIndex={0} className="postmark arrive px-2 font-mono text-[10px] font-bold uppercase tracking-widest text-good">
                              Read ✓
                            </span>
                          )}
                        </Tip>
                      ) : (
                        <Tip
                          tip={`Seen by ${readers
                            .map((x) => profiles[x.user_id]?.display_name ?? 'someone')
                            .slice(0, 6)
                            .join(', ')}${readers.length > 6 ? '…' : ''}`}
                        >
                          {(d) => (
                            <span {...d} tabIndex={0} className="arrive flex items-center gap-1">
                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">Seen</span>
                              {readers.slice(0, 5).map((x) => (
                                <Stamp key={x.id} name={profiles[x.user_id]?.display_name ?? '?'} stamp={profiles[x.user_id]?.stamp ?? 0} size={16} />
                              ))}
                              {readers.length > 5 && <span className="font-mono text-[10px] text-muted">+{readers.length - 5}</span>}
                            </span>
                          )}
                        </Tip>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
          </>
        )}
      </div>

      <div className="relative">
        {fresh > 0 && !atBottom && (
          <div className="absolute -top-12 left-1/2 z-10 -translate-x-1/2">
            <Btn
              tip="Jump to the newest letters"
              size="sm"
              variant="blue"
              className="pop shadow-lg"
              onClick={() => {
                const el = scroller.current!
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                setFresh(0)
              }}
            >
              <ArrowDown size={15} aria-hidden="true" /> {fresh} new {fresh === 1 ? 'letter' : 'letters'}
            </Btn>
          </div>
        )}
        <p className="h-5 truncate px-5 text-xs italic text-muted" aria-live="polite" data-testid="typing">
          {typing && (
            <>
              <span className="typing-dots mr-1.5 inline-flex gap-0.5 align-middle" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {typing}
            </>
          )}
        </p>
        <Composer roomName={room.kind === 'dm' ? title : `#${room.slug ?? title}`} onSend={onSend} onTyping={sendTyping} />
      </div>
    </section>
  )
}
