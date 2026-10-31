import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import { cascade, clampBox, type WinBox } from '../lib/im'
import { play } from '../lib/sounds'
import { navigate } from '../router'
import { useChat } from './chat'

export interface Win {
  id: string
  box: WinBox
  min: boolean
  z: number
  /** Bumped on every Buzz so the frame can replay the shake. */
  buzz: number
}

interface WindowsState {
  wins: Win[]
  focused: string | null
  mobile: boolean
  /** Open (or restore) a room's window. `quiet` opens it without taking focus (incoming IMs). */
  open: (id: string, opts?: { quiet?: boolean }) => void
  openDm: (userId: string) => Promise<void>
  close: (id: string) => void
  minimize: (id: string, min?: boolean) => void
  focus: (id: string | null) => void
  place: (id: string, box: WinBox) => void
  buzz: (id: string) => void
}

const Ctx = createContext<WindowsState | null>(null)
const MOBILE = '(max-width: 767px)'
/** Width reserved on the left for the Buddy List on desktop. */
export const LIST_W = 300

function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

function viewport() {
  // The desk is the area between the guest banner and the taskbar; windows live inside it.
  const desk = document.querySelector<HTMLElement>('[data-desk]')
  return desk ? { w: desk.clientWidth, h: desk.clientHeight } : { w: window.innerWidth, h: window.innerHeight - 52 }
}

export function WindowProvider({ roomId, children }: { roomId: string | null; children: ReactNode }) {
  const { db, me, rooms, roomsLoaded, refreshRooms, subscribe, setVisible } = useChat()
  const mobile = useMedia(MOBILE)
  const key = `buddyline:windows:${me.id}`
  const [wins, setWins] = useState<Win[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]') as Win[]
      return Array.isArray(raw) ? raw.slice(0, 8).map((w, i) => ({ ...w, z: i + 1, buzz: 0, box: clampBox(w.box, viewport()) })) : []
    } catch {
      return []
    }
  })
  const [focused, setFocused] = useState<string | null>(null)
  const zTop = useRef(wins.length + 1)
  const winsRef = useRef(wins)
  useEffect(() => {
    winsRef.current = wins
    try {
      localStorage.setItem(key, JSON.stringify(wins.map(({ id, box, min }) => ({ id, box, min }))))
    } catch {
      /* private mode */
    }
  }, [wins, key])

  // Drop restored windows whose room is gone (left a room, or a guest pass expired).
  const pruned = useRef(false)
  useEffect(() => {
    if (!roomsLoaded || pruned.current) return
    pruned.current = true
    const ids = new Set(rooms.map((r) => r.id))
    if (winsRef.current.some((w) => !ids.has(w.id))) setWins((ws) => ws.filter((w) => ids.has(w.id)))
  }, [roomsLoaded, rooms])

  const focus = useCallback((id: string | null) => {
    setFocused(id)
    if (id) {
      zTop.current += 1
      const z = zTop.current
      setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z, min: false } : w)))
    }
    const want = id ? `/app/r/${id}` : '/app'
    if (location.pathname !== want) navigate(want, true)
  }, [])

  const open = useCallback(
    (id: string, opts?: { quiet?: boolean }) => {
      zTop.current += 1
      const z = zTop.current
      setWins((ws) => {
        const cur = ws.find((w) => w.id === id)
        if (cur) return opts?.quiet ? ws : ws.map((w) => (w.id === id ? { ...w, min: false, z } : w))
        const v = viewport()
        const box = clampBox(cascade(ws.length, { x: LIST_W + 8, w: v.w - LIST_W - 8, h: v.h }), v)
        return [...ws.slice(-7), { id, box, min: false, z, buzz: 0 }]
      })
      if (!opts?.quiet) focus(id)
    },
    [focus],
  )

  const close = useCallback(
    (id: string) => {
      const rest = winsRef.current.filter((w) => w.id !== id)
      setWins(rest)
      if (focused === id || !focused) {
        const next = [...rest].filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]
        focus(next?.id ?? null)
      }
    },
    [focus, focused],
  )

  const minimize = useCallback(
    (id: string, min = true) => {
      setWins((ws) => ws.map((w) => (w.id === id ? { ...w, min } : w)))
      if (min && focused === id) {
        const next = winsRef.current.filter((w) => w.id !== id && !w.min).sort((a, b) => b.z - a.z)[0]
        focus(next?.id ?? null)
      } else if (!min) focus(id)
    },
    [focus, focused],
  )

  const place = useCallback((id: string, box: WinBox) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, box: clampBox(box, viewport()) } : w))), [])

  const buzz = useCallback((id: string) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, buzz: w.buzz + 1 } : w))), [])

  const openDm = useCallback(
    async (userId: string) => {
      const existing = rooms.find((r) => r.kind === 'dm' && r.dm_user === userId)
      if (existing) return open(existing.id)
      const id = await api.openDm(db, userId)
      await refreshRooms()
      open(id)
    },
    [db, rooms, refreshRooms, open],
  )

  // The URL (/app/r/:id) opens and focuses that window, so links and reloads land in the right IM.
  useEffect(() => {
    if (!roomId || !roomsLoaded) return
    if (!rooms.some((r) => r.id === roomId)) {
      navigate('/app', true)
      return
    }
    if (focused !== roomId) {
      const t = window.setTimeout(() => open(roomId), 0)
      return () => window.clearTimeout(t)
    }
  }, [roomId, roomsLoaded, rooms, focused, open])

  // Keep the window size sane when the browser is resized.
  useEffect(() => {
    const on = () => setWins((ws) => ws.map((w) => ({ ...w, box: clampBox(w.box, viewport()) })))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // Which rooms are "being read": every open window on desktop, the front tab on mobile.
  useEffect(() => {
    setVisible(mobile ? (focused ? [focused] : []) : wins.filter((w) => !w.min).map((w) => w.id))
  }, [mobile, focused, wins, setVisible])
  useEffect(() => () => setVisible([]), [setVisible])

  // Incoming IMs pop a window (desktop) and blip; a Buzz also shakes it.
  const seen = useRef(new Set<string>())
  const roomsRef = useRef(rooms)
  const focusedRef = useRef(focused)
  const mobileRef = useRef(mobile)
  useEffect(() => {
    roomsRef.current = rooms
    focusedRef.current = focused
    mobileRef.current = mobile
  }, [rooms, focused, mobile])
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type !== 'msg') return
        const m = e.msg
        if (m.user_id === me.id || m.deleted_at || seen.current.has(m.id)) return
        if (Date.now() - +new Date(m.created_at) > 30_000) return
        seen.current.add(m.id)
        const room = roomsRef.current.find((r) => r.id === m.room_id)
        // A room we haven't listed yet can only be a brand-new DM (public rooms are joined explicitly).
        const isDm = room ? room.kind === 'dm' : true
        if (!isDm) return
        const front = focusedRef.current === m.room_id && document.visibilityState === 'visible'
        if (m.kind === 'buzz') {
          if (!mobileRef.current) open(m.room_id, { quiet: focusedRef.current !== null && focusedRef.current !== m.room_id })
          buzz(m.room_id)
          play('buzz')
          if (navigator.vibrate && mobileRef.current) navigator.vibrate([60, 40, 60])
          return
        }
        if (!mobileRef.current && !winsRef.current.some((w) => w.id === m.room_id)) open(m.room_id, { quiet: true })
        if (!front) play('message')
      }),
    [subscribe, me.id, open, buzz],
  )

  const value = useMemo<WindowsState>(() => ({ wins, focused, mobile, open, openDm, close, minimize, focus, place, buzz }), [wins, focused, mobile, open, openDm, close, minimize, focus, place, buzz])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWindows() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useWindows outside provider')
  return c
}
