import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { navigate, useLocation } from '../router'
import { useAuth } from '../state/auth'
import { Btn, LinkBtn, Logo, Wordmark } from '../components/ui'
import { screenNameError } from '../lib/im'

const field = 'mt-1 h-11 w-full rounded-lg border border-line bg-paper-hi px-3 text-[0.95rem] font-normal outline-none placeholder:text-muted focus:border-blue'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="wall min-h-dvh text-ink">
      <header className="mx-auto flex max-w-5xl items-center px-5 py-4">
        <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} className="press text-2xl" title="Buddyline home">
          <Wordmark />
        </a>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-4">{children}</main>
    </div>
  )
}

export function Login() {
  const { session, isGuest } = useAuth()
  const { search } = useLocation()
  const [mode, setMode] = useState<'in' | 'up'>(() => (new URLSearchParams(search).get('mode') === 'signup' ? 'up' : 'in'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)

  useEffect(() => {
    if (session && !isGuest) navigate('/app', true)
  }, [session, isGuest])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMsg(null)
    try {
      if (isGuest) await supabase.auth.signOut()
      if (mode === 'up') {
        const bad = name.trim() ? screenNameError(name) : null
        if (bad) throw new Error(bad)
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/app`, data: { display_name: name.trim() || undefined } } })
        if (error) throw error
        if (!data.session) setMsg({ tone: 'good', text: 'Almost there: open the confirmation link we just emailed you, then sign in.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setMsg({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame>
      <div className="grid items-start gap-10 md:grid-cols-[1fr_26rem]">
        <div className="pt-4">
          <p className="inline-block rounded-full border border-line bg-paper-hi px-3 py-1 font-pixel text-[10px] uppercase text-blue">{mode === 'in' ? 'Welcome back' : 'New screen name'}</p>
          <h1 className="mt-4 font-display text-4xl font-black leading-tight sm:text-5xl">{mode === 'in' ? 'Sign on. Your buddies missed you.' : 'Claim your screen name.'}</h1>
          <p className="mt-4 max-w-md text-muted">
            An account keeps your screen name, Buddy List, away messages and IMs. Just looking? The demo signs you on with a guest screen name that tidies itself away after a day.
          </p>
          {isGuest && (
            <p className="mt-4 max-w-md rounded-lg border border-dashed border-edge p-3 text-sm">
              You’re signed on as a guest. Signing in starts a separate account; guest IMs and buddies aren’t moved over.
            </p>
          )}
        </div>
        <div className="window relative overflow-hidden">
          <div className="titlebar flex h-9 items-center gap-2 px-3 text-sm font-extrabold" data-active="true">
            <Logo size="1.2em" /> {mode === 'in' ? 'Sign On' : 'Sign Up'}
          </div>
          <div className="p-6">
            <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-sunk p-1">
              {(['in', 'up'] as const).map((m) => (
                <Btn
                  key={m}
                  tip={m === 'in' ? 'I already have an account' : 'Create a new account'}
                  role="tab"
                  aria-selected={mode === m}
                  variant={mode === m ? 'ghost' : 'plain'}
                  size="sm"
                  block
                  onClick={() => (setMode(m), setMsg(null))}
                >
                  {m === 'in' ? 'Sign on' : 'Sign up'}
                </Btn>
              ))}
            </div>
            {!supabase ? (
              <p className="text-sm text-muted">Accounts are unavailable in this build (no Supabase configuration).</p>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {mode === 'up' && (
                  <label className="block text-sm font-semibold">
                    Screen name
                    <input
                      maxLength={20}
                      autoComplete="username"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. SunsetRider04"
                      className={field}
                      aria-describedby="sn-help"
                    />
                    <span id="sn-help" className={`mt-1 block text-xs font-normal ${name.trim() && screenNameError(name) ? 'text-bad' : 'text-muted'}`}>
                      {(name.trim() && screenNameError(name)) || '3–20 letters, numbers, spaces, dots, dashes or underscores. If it’s taken we’ll add a number.'}
                    </span>
                  </label>
                )}
                <label className="block text-sm font-semibold">
                  Email
                  <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
                </label>
                <label className="block text-sm font-semibold">
                  Password
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={field}
                  />
                  {mode === 'up' && <span className="mt-1 block text-xs font-normal text-muted">At least 8 characters.</span>}
                </label>
                {msg && (
                  <p role="alert" className={`rounded-lg border p-3 text-sm ${msg.tone === 'good' ? 'border-good text-good' : 'border-bad bg-bad-bg text-bad'}`}>
                    {msg.text}
                  </p>
                )}
                <Btn tip={mode === 'in' ? 'Sign in with this email and password' : 'Create the account'} type="submit" variant="red" size="lg" block disabled={busy}>
                  {busy && <Loader2 aria-hidden="true" className="animate-spin" size={18} />}
                  {mode === 'in' ? 'Sign on' : 'Create account'}
                </Btn>
              </form>
            )}
            <p className="mt-5 text-center text-sm text-muted">
              No account?{' '}
              <a
                href="/demo"
                title="Sign on with a guest screen name, no sign-up"
                className="font-semibold text-blue underline underline-offset-2"
                onClick={(e) => (e.preventDefault(), navigate('/demo'))}
              >
                Try the demo
              </a>
            </p>
          </div>
        </div>
      </div>
    </Frame>
  )
}

let demoStart: ReturnType<NonNullable<typeof supabase>['auth']['signInAnonymously']> | null = null

/** After this long without a guest session the page offers a retry instead of a silent spinner. */
export const DEMO_SLOW_MS = 8000

function demoErrorText(error: { message: string; status?: number; code?: string }) {
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'Lots of people are trying the demo right now. Please try again in a minute.'
  if (/fetch|network|load failed/i.test(error.message)) return 'Couldn’t reach Buddyline. Check your connection and try again.'
  return error.message
}

export function Demo() {
  const { session, ready } = useAuth()
  const [err, setErr] = useState<string | null>(supabase ? null : 'This build has no Supabase configuration.')
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // A guest that takes too long (slow mobile data, or an in-app browser that froze the tab
  // in the background) gets a visible way out instead of an endless "Picking…" screen.
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), DEMO_SLOW_MS)
    return () => clearTimeout(t)
  }, [attempt])

  useEffect(() => {
    if (!supabase || !ready) return
    if (session) return navigate('/app', true)
    let live = true
    // Shared so a StrictMode double-run makes one guest, but cleared once it settles:
    // after a sign-off, the next visit to /demo has to start a fresh guest.
    const start = (demoStart ??= supabase.auth.signInAnonymously())
    start
      .then(({ error }) => {
        if (demoStart === start) demoStart = null
        if (live && error) setErr(demoErrorText(error))
      })
      .catch((e: Error) => {
        if (demoStart === start) demoStart = null
        if (live) setErr(demoErrorText(e))
      })
    // Coming back to a tab the browser paused: pick up a session that landed meanwhile.
    const db = supabase
    const resume = () => {
      if (document.visibilityState !== 'visible') return
      void db.auth.getSession().then(({ data }) => {
        if (live && data.session) navigate('/app', true)
      })
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [session, ready, attempt])

  function retry() {
    demoStart = null
    setErr(null)
    setSlow(false)
    setAttempt((n) => n + 1)
  }

  return (
    <Frame>
      <div className="mx-auto max-w-md pt-16 text-center">
        {err ? (
          <>
            <h1 className="font-display text-3xl font-black">Couldn’t sign you on as a guest</h1>
            <p role="alert" className="mt-2 text-bad">
              {err}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {supabase && (
                <Btn tip="Ask for a new guest screen name" variant="red" onClick={retry}>
                  Try again
                </Btn>
              )}
              <LinkBtn href="/login" tip="Use an account instead" variant={supabase ? 'ghost' : 'red'} onClick={(e) => (e.preventDefault(), navigate('/login'))}>
                Sign in instead
              </LinkBtn>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 w-fit animate-pulse" aria-hidden="true">
              <Logo size={56} />
            </div>
            <h1 className="font-display text-3xl font-black" role="status">
              Picking your guest screen name…
            </h1>
            <p className="mt-2 text-sm text-muted">No sign-up. Your guest IMs and files are cleared after a day.</p>
            {slow && (
              <div className="mt-6">
                <p className="text-sm text-muted">This is taking longer than usual. A slow connection or an in-app browser can hold it up.</p>
                <div className="mt-3 flex justify-center">
                  <Btn tip="Ask for a new guest screen name" variant="red" onClick={retry}>
                    Try again
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Frame>
  )
}
