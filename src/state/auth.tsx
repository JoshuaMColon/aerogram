import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ensureProfile } from '../lib/api'
import type { Profile } from '../lib/types'

type Theme = 'light' | 'dark'

interface AuthState {
  ready: boolean
  session: Session | null
  isGuest: boolean
  profile: Profile | null
  profileError: string | null
  setProfile: (p: Profile) => void
  signOut: () => Promise<void>
  theme: Theme
  toggleTheme: () => void
}

const Ctx = createContext<AuthState | null>(null)

let ensuring: { uid: string; p: Promise<Profile> } | null = null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null
  useEffect(() => {
    if (!supabase || !uid || !session) return
    let live = true
    const name = (session.user.user_metadata?.display_name as string | undefined) ?? null
    if (!ensuring || ensuring.uid !== uid) ensuring = { uid, p: ensureProfile(supabase, name) }
    ensuring.p
      .then((p) => live && (setProfile(p), setProfileError(null)))
      .catch((e: Error) => {
        ensuring = null
        if (live) setProfileError(e.message)
      })
    return () => {
      live = false
    }
    // Only re-run when the user changes, not on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d1424' : '#f3ecdc')
    try {
      localStorage.setItem('aerogram:theme', theme)
    } catch {
      /* private mode */
    }
  }, [theme])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
    ensuring = null
    setProfile(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      isGuest: !!session?.user.is_anonymous,
      profile: profile && profile.id === uid ? profile : null,
      profileError,
      setProfile,
      signOut,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [ready, session, uid, profile, profileError, signOut, theme],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside provider')
  return c
}
