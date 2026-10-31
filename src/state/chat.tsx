import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import * as api from '../lib/api'
import { bumpRoom, normMember, normMessage, totalUnread } from '../lib/logic'
import { IDLE_AFTER_MS } from '../lib/im'
import { useAuth } from './auth'
import type { Member, Message, PresenceMeta, Profile, RoomSummary } from '../lib/types'

export type ChatEvent = { type: 'msg'; msg: Message } | { type: 'member'; member: Member } | { type: 'member-gone'; id: number } | { type: 'resync' }

interface ChatState {
  db: SupabaseClient
  me: Profile
  rooms: RoomSummary[]
  roomsLoaded: boolean
  refreshRooms: () => Promise<void>
  patchRoom: (id: string, patch: Partial<RoomSummary>) => void
  profiles: Record<string, Profile>
  ensureProfiles: (ids: string[]) => void
  putProfile: (p: Profile) => void
  online: Set<string>
  /** Live presence meta per signed-on user (status, away message, idle). */
  presence: Record<string, PresenceMeta>
  /** True once the first presence sync arrived, so sign-on toasts skip the initial roster. */
  presenceReady: boolean
  status: 'connecting' | 'live' | 'reconnecting'
  /** Rooms whose window is open and on screen: they don't count unread and mark as read. */
  visible: ReadonlySet<string>
  setVisible: (ids: string[]) => void
  /** My own status. */
  away: string | null
  idleSince: string | null
  setAway: (msg: string | null) => Promise<void>
  subscribe: (fn: (e: ChatEvent) => void) => () => void
}

const Ctx = createContext<ChatState | null>(null)

export function ChatProvider({ db, me, children }: { db: SupabaseClient; me: Profile; children: ReactNode }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [roomsLoaded, setRoomsLoaded] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({ [me.id]: me })
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<ChatState['status']>('connecting')
  const [presence, setPresence] = useState<Record<string, PresenceMeta>>({})
  const [presenceReady, setPresenceReady] = useState(false)
  const [visible, setVisibleState] = useState<ReadonlySet<string>>(new Set())
  const openRef = useRef<ReadonlySet<string>>(new Set())
  const { setProfile } = useAuth()
  const [away, setAwayState] = useState<string | null>(me.status === 'away' ? (me.away_message ?? '') : null)
  const [idleSince, setIdleSince] = useState<string | null>(null)
  const listeners = useRef(new Set<(e: ChatEvent) => void>())
  const known = useRef(new Set<string>([me.id]))
  const pending = useRef(new Set<string>())
  const flushTimer = useRef<number | undefined>(undefined)
  const roomsRef = useRef<RoomSummary[]>([])
  useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])

  const emit = useCallback((e: ChatEvent) => listeners.current.forEach((l) => l(e)), [])
  const subscribe = useCallback((fn: (e: ChatEvent) => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const putProfile = useCallback((p: Profile) => {
    known.current.add(p.id)
    setProfiles((m) => ({ ...m, [p.id]: p }))
  }, [])

  const ensureProfiles = useCallback(
    (ids: string[]) => {
      let added = false
      for (const id of ids) {
        if (!id || known.current.has(id)) continue
        pending.current.add(id)
        known.current.add(id)
        added = true
      }
      if (!added) return
      window.clearTimeout(flushTimer.current)
      flushTimer.current = window.setTimeout(async () => {
        const batch = [...pending.current]
        pending.current.clear()
        try {
          const list = await api.getProfiles(db, batch)
          setProfiles((m) => {
            const next = { ...m }
            for (const p of list) next[p.id] = p
            return next
          })
        } catch {
          batch.forEach((id) => known.current.delete(id))
        }
      }, 30)
    },
    [db],
  )

  const refreshTimer = useRef<number | undefined>(undefined)
  const refreshRooms = useCallback(async () => {
    try {
      const list = await api.myRooms(db)
      const open = openRef.current
      setRooms(list.map((r) => (open.has(r.id) ? { ...r, unread: 0 } : r)))
      setRoomsLoaded(true)
      ensureProfiles(list.flatMap((r) => [r.dm_user ?? '', r.last_user ?? '']))
    } catch {
      setRoomsLoaded(true)
    }
  }, [db, ensureProfiles])
  const refreshSoon = useCallback(() => {
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(refreshRooms, 250)
  }, [refreshRooms])

  const patchRoom = useCallback((id: string, patch: Partial<RoomSummary>) => {
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  const setVisible = useCallback((ids: string[]) => {
    const cur = openRef.current
    if (ids.length === cur.size && ids.every((i) => cur.has(i))) return
    const next = new Set(ids)
    openRef.current = next
    setVisibleState(next)
    if (ids.length) setRooms((rs) => rs.map((r) => (next.has(r.id) && r.unread ? { ...r, unread: 0 } : r)))
  }, [])

  useEffect(() => {
    refreshRooms()
  }, [refreshRooms])

  // One Postgres-changes channel for everything I can see; RLS filters the events server-side.
  useEffect(() => {
    let first = true
    const ch: RealtimeChannel = db
      .channel(`chat-db:${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'chat', table: 'messages' }, (p) => {
        const m = normMessage(p.new as Message)
        if (!roomsRef.current.some((r) => r.id === m.room_id)) refreshSoon()
        else setRooms((rs) => bumpRoom(rs, m, me.id, openRef.current))
        ensureProfiles([m.user_id])
        emit({ type: 'msg', msg: m })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'chat', table: 'messages' }, (p) => {
        const m = normMessage(p.new as Message)
        setRooms((rs) => rs.map((r) => (r.id === m.room_id && r.last_message_at === m.created_at ? { ...r, last_body: m.body, last_deleted: !!m.deleted_at, last_has_file: !!m.attachment } : r)))
        emit({ type: 'msg', msg: m })
      })
      .on('postgres_changes', { event: '*', schema: 'chat', table: 'members' }, (p) => {
        if (p.eventType === 'DELETE') {
          refreshSoon()
          emit({ type: 'member-gone', id: (p.old as { id: number }).id })
          return
        }
        const m = normMember(p.new as Member)
        if (m.user_id === me.id) {
          if (p.eventType === 'INSERT') refreshSoon()
          else setRooms((rs) => rs.map((r) => (r.id === m.room_id ? { ...r, last_read_at: m.last_read_at, unread: m.last_read_at >= r.last_message_at ? 0 : r.unread } : r)))
        } else ensureProfiles([m.user_id])
        emit({ type: 'member', member: m })
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setStatus('live')
          if (!first) {
            refreshRooms()
            emit({ type: 'resync' })
          }
          first = false
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('reconnecting')
      })
    return () => {
      db.removeChannel(ch)
    }
  }, [db, me.id, emit, ensureProfiles, refreshRooms, refreshSoon])

  // Global presence: who is signed on anywhere in Buddyline (private channel, RLS on realtime.messages).
  // Meta carries status, away message and idle time so buddy lists update live.
  const lobby = useRef<RealtimeChannel | null>(null)
  const meta = useRef<PresenceMeta | null>(null)
  useEffect(() => {
    meta.current = {
      user_id: me.id,
      name: me.display_name,
      stamp: me.stamp,
      online_at: meta.current?.online_at ?? new Date().toISOString(),
      status: away !== null ? 'away' : 'online',
      away,
      idle_since: idleSince,
    }
    if (lobby.current?.state === 'joined') lobby.current.track(meta.current)
  }, [me.id, me.display_name, me.stamp, away, idleSince])
  useEffect(() => {
    let ch: RealtimeChannel | null = null
    let dead = false
    db.realtime.setAuth().then(() => {
      if (dead) return
      ch = db.channel('chat:lobby', { config: { private: true, presence: { key: me.id } } })
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch!.presenceState<PresenceMeta>()
        const next: Record<string, PresenceMeta> = {}
        for (const [id, metas] of Object.entries(state)) {
          // Several tabs: the most "present" one wins (online beats idle beats away).
          const best = [...metas].sort((a, b) => score(a) - score(b))[0]
          if (best) next[id] = { ...best, user_id: id }
        }
        setOnline(new Set(Object.keys(next)))
        setPresence(next)
        setPresenceReady(true)
      }).subscribe((s) => {
        if (s === 'SUBSCRIBED' && meta.current) ch!.track(meta.current)
      })
      lobby.current = ch
    })
    return () => {
      dead = true
      lobby.current = null
      if (ch) db.removeChannel(ch)
    }
  }, [db, me.id])

  // Persist status so people who sign on later (and the away auto-reply) see it.
  const persist = useCallback(
    (status: 'online' | 'away', msg: string | null, idle: boolean) =>
      api
        .setPresence(db, status, msg, idle)
        .then((p) => {
          putProfile(p)
          setProfile(p)
        })
        .catch(() => {}),
    [db, putProfile, setProfile],
  )
  const awayRef = useRef(away)
  const idleRef = useRef(idleSince)
  useEffect(() => {
    awayRef.current = away
    idleRef.current = idleSince
  }, [away, idleSince])

  const setAway = useCallback(
    async (msg: string | null) => {
      setAwayState(msg === null ? null : msg.trim() || "I'm away from my computer right now.")
      await persist(msg === null ? 'online' : 'away', msg, !!idleRef.current)
    },
    [persist],
  )

  // Idle: no pointer/keyboard/touch activity for a few minutes (or the tab hidden that long).
  useEffect(() => {
    let last = Date.now()
    const active = () => {
      last = Date.now()
      if (idleRef.current) {
        idleRef.current = null
        setIdleSince(null)
        persist(awayRef.current !== null ? 'away' : 'online', awayRef.current, false)
      }
    }
    const check = () => {
      if (!idleRef.current && Date.now() - last >= IDLE_AFTER_MS) {
        const since = new Date(last).toISOString()
        idleRef.current = since
        setIdleSince(since)
        persist(awayRef.current !== null ? 'away' : 'online', awayRef.current, true)
      }
    }
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    let moveT = 0
    const move = () => {
      const now = Date.now()
      if (now - moveT > 2000) {
        moveT = now
        active()
      }
    }
    evs.forEach((e) => window.addEventListener(e, active, { passive: true }))
    window.addEventListener('pointermove', move, { passive: true })
    const vis = () => document.visibilityState === 'visible' && active()
    document.addEventListener('visibilitychange', vis)
    const t = window.setInterval(check, 20_000)
    // Heartbeat keeps "last seen" fresh and clears a stale idle flag from a previous session.
    persist(awayRef.current !== null ? 'away' : 'online', awayRef.current, false)
    const hb = window.setInterval(() => persist(awayRef.current !== null ? 'away' : 'online', awayRef.current, !!idleRef.current), 120_000)
    return () => {
      evs.forEach((e) => window.removeEventListener(e, active))
      window.removeEventListener('pointermove', move)
      document.removeEventListener('visibilitychange', vis)
      window.clearInterval(t)
      window.clearInterval(hb)
    }
  }, [persist])

  const unread = totalUnread(rooms)
  useEffect(() => {
    document.title = unread ? `(${unread}) Buddyline` : 'Buddyline'
  }, [unread])

  const value = useMemo<ChatState>(
    () => ({
      db,
      me,
      rooms,
      roomsLoaded,
      refreshRooms,
      patchRoom,
      profiles,
      ensureProfiles,
      putProfile,
      online,
      presence,
      presenceReady,
      status,
      visible,
      setVisible,
      away,
      idleSince,
      setAway,
      subscribe,
    }),
    [db, me, rooms, roomsLoaded, refreshRooms, patchRoom, profiles, ensureProfiles, putProfile, online, presence, presenceReady, status, visible, setVisible, away, idleSince, setAway, subscribe],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChat() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useChat outside provider')
  return c
}

export function roomTitle(r: Pick<RoomSummary, 'kind' | 'name' | 'dm_user'>, profiles: Record<string, Profile>) {
  if (r.kind === 'public') return r.name ?? 'Room'
  return (r.dm_user && profiles[r.dm_user]?.display_name) || 'Buddy'
}

function score(m: PresenceMeta) {
  return (m.status === 'away' ? 2 : 0) + (m.idle_since ? 1 : 0)
}
