import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { navigate, useLocation } from '../router'
import { useAuth } from '../state/auth'
import { Btn, LinkBtn, Wordmark } from '../components/ui'

const field = 'mt-1 h-11 w-full rounded-lg border border-line bg-paper-hi px-3 text-[0.95rem] font-normal outline-none placeholder:text-muted focus:border-blue'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="airmail h-1.5" aria-hidden="true" />
      <header className="mx-auto flex max-w-5xl items-center px-5 py-4">
        <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} className="press text-2xl" title="Aerogram home">
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
          <p className="postmark inline-block px-3 py-0.5 font-mono text-xs font-semibold uppercase tracking-widest text-red">{mode === 'in' ? 'Return to sender' : 'First class'}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{mode === 'in' ? 'Welcome back to the post room.' : 'Get your own stamp.'}</h1>
          <p className="mt-4 max-w-md text-muted">An account keeps your rooms, letters and files. Just looking? The guest pass needs no sign-up and tidies itself away after a day.</p>
          {isGuest && (
            <p className="mt-4 max-w-md rounded-lg border border-dashed border-edge p-3 text-sm">You’re on a guest pass. Signing in starts a separate mailbox; guest letters aren’t moved over.</p>
          )}
        </div>
        <div className="letter-theirs relative overflow-hidden rounded-xl p-6 shadow-[var(--shadow)]">
          <div className="airmail-edge absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
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
                {m === 'in' ? 'Sign in' : 'Sign up'}
              </Btn>
            ))}
          </div>
          {!supabase ? (
            <p className="text-sm text-muted">Accounts are unavailable in this build (no Supabase configuration).</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode === 'up' && (
                <label className="block text-sm font-semibold">
                  Display name
                  <input maxLength={32} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder="How you’ll appear" className={field} />
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
                {mode === 'in' ? 'Sign in' : 'Create account'}
              </Btn>
            </form>
          )}
          <p className="mt-5 text-center text-sm text-muted">
            No account?{' '}
            <a href="/demo" title="Start a guest pass with no sign-up" className="font-semibold text-blue underline underline-offset-2" onClick={(e) => (e.preventDefault(), navigate('/demo'))}>
              Try the demo
            </a>
          </p>
        </div>
      </div>
    </Frame>
  )
}

let demoStart: ReturnType<NonNullable<typeof supabase>['auth']['signInAnonymously']> | null = null

export function Demo() {
  const { session, ready } = useAuth()
  const [err, setErr] = useState<string | null>(supabase ? null : 'This build has no Supabase configuration.')
  useEffect(() => {
    if (!supabase || !ready) return
    if (session) return navigate('/app', true)
    let live = true
    demoStart ??= supabase.auth.signInAnonymously()
    demoStart.then(({ error }) => {
      if (error) demoStart = null
      if (live && error) setErr(error.message)
    })
    return () => {
      live = false
    }
  }, [session, ready])
  return (
    <Frame>
      <div className="mx-auto max-w-md pt-16 text-center">
        {err ? (
          <>
            <h1 className="font-display text-3xl font-semibold">Couldn’t issue a guest pass</h1>
            <p role="alert" className="mt-2 text-bad">
              {err}
            </p>
            <div className="mt-5">
              <LinkBtn href="/login" tip="Use an account instead" variant="red" onClick={(e) => (e.preventDefault(), navigate('/login'))}>
                Sign in instead
              </LinkBtn>
            </div>
          </>
        ) : (
          <>
            <div className="airmail mx-auto mb-5 h-2 w-28 animate-pulse rounded-full" aria-hidden="true" />
            <h1 className="font-display text-3xl font-semibold" role="status">
              Stamping your guest pass…
            </h1>
            <p className="mt-2 text-sm text-muted">No sign-up. Your guest letters and files are cleared after a day.</p>
          </>
        )}
      </div>
    </Frame>
  )
}
