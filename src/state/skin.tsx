import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_DARK, DEFAULT_LIGHT, paintCache, presetById, resolveSkin, sanitizeSkin, skinAttrs, fontPx, switchPreset, type Resolved, type Skin } from '../lib/skins'
import { useAuth } from './auth'

const KEY = 'buddyline:skin'
const PAINT = 'buddyline:paint'

interface SkinState {
  skin: Skin
  resolved: Resolved
  setSkin: (s: Skin) => void
  /** Quick light/dark flip between the two default presets. */
  toggleMode: () => void
  panelOpen: boolean
  setPanelOpen: (o: boolean) => void
  /** 'local' for guests and signed-out visitors, 'synced'/'saving'/'error' for accounts. */
  sync: 'local' | 'saving' | 'synced' | 'error'
}

const Ctx = createContext<SkinState | null>(null)

function initial(): Skin {
  try {
    const s = sanitizeSkin(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    if (s) return s
    const legacy = localStorage.getItem('buddyline:theme')
    if (legacy === 'dark' || legacy === 'light') return { v: 1, preset: legacy === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT }
  } catch {
    /* private mode */
  }
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  return { v: 1, preset: dark ? DEFAULT_DARK : DEFAULT_LIGHT }
}

export function applySkin(r: Resolved, el: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(r.vars)) el.style.setProperty(k, v)
  for (const [k, v] of Object.entries(skinAttrs(r))) el.dataset[k] = v
  el.style.fontSize = `${fontPx(r.look.size)}px`
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', r.vars['--paper'])
}

export function SkinProvider({ children }: { children: ReactNode }) {
  const { session, isGuest } = useAuth()
  const [skin, setSkinState] = useState<Skin>(initial)
  const [panelOpen, setPanelOpen] = useState(false)
  const [sync, setSync] = useState<SkinState['sync']>('local')
  const resolved = useMemo(() => resolveSkin(skin), [skin])
  const uid = session && !isGuest ? session.user.id : null
  // The account's saved skin has been read (so local edits may now be written back).
  const pulled = useRef<string | null>(null)
  const dirty = useRef(false)

  useLayoutEffect(() => {
    applySkin(resolved)
    try {
      localStorage.setItem(KEY, JSON.stringify(skin))
      localStorage.setItem(PAINT, JSON.stringify(paintCache(resolved)))
    } catch {
      /* private mode */
    }
  }, [skin, resolved])

  // Accounts: load the saved skin once per sign-in; if there is none yet, adopt this device's.
  useEffect(() => {
    if (!supabase || !uid) {
      pulled.current = null
      return
    }
    let live = true
    supabase.rpc('chat_my_skin').then(({ data, error }) => {
      if (!live) return
      if (error) return setSync('error')
      const remote = sanitizeSkin(data)
      pulled.current = uid
      if (remote && !dirty.current) {
        setSkinState(remote)
        setSync('synced')
      } else {
        dirty.current = true
        setSkinState((s) => ({ ...s }))
      }
    })
    return () => {
      live = false
    }
  }, [uid])

  // Write changes back (debounced) once the remote copy has been read.
  useEffect(() => {
    if (!supabase || !uid || pulled.current !== uid || !dirty.current) return
    const db = supabase
    const t = window.setTimeout(() => {
      setSync('saving')
      db.rpc('chat_save_skin', { p_skin: skin }).then(({ error }) => {
        if (!error) dirty.current = false
        setSync(error ? 'error' : 'synced')
      })
    }, 700)
    return () => window.clearTimeout(t)
  }, [skin, uid])

  const setSkin = useCallback((s: Skin) => {
    dirty.current = true
    setSkinState(s)
  }, [])

  const toggleMode = useCallback(() => {
    setSkinState((s) => {
      dirty.current = true
      return switchPreset(s, presetById(s.preset).palette.mode === 'dark' ? DEFAULT_LIGHT : DEFAULT_DARK)
    })
  }, [])

  const value = useMemo<SkinState>(() => ({ skin, resolved, setSkin, toggleMode, panelOpen, setPanelOpen, sync: uid ? sync : 'local' }), [skin, resolved, setSkin, toggleMode, panelOpen, uid, sync])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSkin() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSkin outside provider')
  return c
}
