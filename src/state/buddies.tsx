import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import { presenceDiff } from '../lib/im'
import { play } from '../lib/sounds'
import type { BuddyListData } from '../lib/types'
import { useChat } from './chat'

export interface DoorToast {
  id: number
  user: string
  on: boolean
}

interface BuddyState {
  list: BuddyListData
  loaded: boolean
  buddies: ReadonlySet<string>
  reload: () => Promise<void>
  add: (screenName: string, group: string | null) => Promise<string>
  remove: (id: string) => Promise<void>
  move: (id: string, group: string) => Promise<void>
  saveGroup: (name: string, id: string | null) => Promise<string>
  deleteGroup: (id: string) => Promise<void>
  toasts: DoorToast[]
  dismiss: (id: number) => void
}

const Ctx = createContext<BuddyState | null>(null)
const SIGN_OFF_GRACE = 5000

export function BuddyProvider({ children }: { children: ReactNode }) {
  const { db, me, online, presenceReady, ensureProfiles } = useChat()
  const [list, setList] = useState<BuddyListData>({ groups: [], buddies: [] })
  const [loaded, setLoaded] = useState(false)
  const [toasts, setToasts] = useState<DoorToast[]>([])

  const reload = useCallback(async () => {
    try {
      const l = await api.buddyList(db)
      setList(l)
      ensureProfiles(l.buddies.map((b) => b.buddy))
    } finally {
      setLoaded(true)
    }
  }, [db, ensureProfiles])

  useEffect(() => {
    const t = window.setTimeout(() => reload().catch(() => {}), 0)
    return () => window.clearTimeout(t)
  }, [reload])

  const buddies = useMemo(() => new Set(list.buddies.map((b) => b.buddy)), [list])

  const add = useCallback(
    async (name: string, group: string | null) => {
      const id = await api.addBuddy(db, name, group)
      await reload()
      return id
    },
    [db, reload],
  )
  const remove = useCallback(
    async (id: string) => {
      setList((l) => ({ ...l, buddies: l.buddies.filter((b) => b.buddy !== id) }))
      try {
        await api.removeBuddy(db, id)
      } finally {
        await reload()
      }
    },
    [db, reload],
  )
  const move = useCallback(
    async (id: string, group: string) => {
      setList((l) => ({ ...l, buddies: l.buddies.map((b) => (b.buddy === id ? { ...b, group_id: group } : b)) }))
      try {
        await api.moveBuddy(db, id, group)
      } finally {
        await reload()
      }
    },
    [db, reload],
  )
  const saveGroup = useCallback(
    async (name: string, id: string | null) => {
      const gid = await api.saveGroup(db, name, id)
      await reload()
      return gid
    },
    [db, reload],
  )
  const deleteGroup = useCallback(
    async (id: string) => {
      await api.deleteGroup(db, id)
      await reload()
    },
    [db, reload],
  )

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((user: string, on: boolean) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.filter((x) => x.user !== user).slice(-3), { id, user, on }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200)
    play(on ? 'open' : 'close')
  }, [])

  // Sign-on / sign-off: diff presence snapshots after the first sync, buddies only. A sign-off is
  // held for a few seconds so a page refresh (leave + rejoin) doesn't slam the door.
  const prev = useRef<Set<string> | null>(null)
  const leaving = useRef(new Map<string, number>())
  const buddiesRef = useRef(buddies)
  useEffect(() => {
    buddiesRef.current = buddies
  }, [buddies])
  useEffect(() => {
    if (!presenceReady || !loaded) return
    const now = new Set([...online].filter((id) => id !== me.id))
    if (!prev.current) {
      prev.current = now
      return
    }
    const { on, off } = presenceDiff(prev.current, now, buddiesRef.current)
    prev.current = now
    for (const id of on) {
      const t = leaving.current.get(id)
      if (t) {
        window.clearTimeout(t)
        leaving.current.delete(id)
        continue
      }
      toast(id, true)
    }
    for (const id of off) {
      if (leaving.current.has(id)) continue
      leaving.current.set(
        id,
        window.setTimeout(() => {
          leaving.current.delete(id)
          if (!prev.current?.has(id)) toast(id, false)
        }, SIGN_OFF_GRACE),
      )
    }
  }, [online, presenceReady, loaded, me.id, toast])
  useEffect(() => {
    const m = leaving.current
    return () => m.forEach((t) => window.clearTimeout(t))
  }, [])

  const value = useMemo<BuddyState>(
    () => ({ list, loaded, buddies, reload, add, remove, move, saveGroup, deleteGroup, toasts, dismiss }),
    [list, loaded, buddies, reload, add, remove, move, saveGroup, deleteGroup, toasts, dismiss],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBuddies() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useBuddies outside provider')
  return c
}
