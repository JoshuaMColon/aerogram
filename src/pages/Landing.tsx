import { BellRing, Clock3, Moon, MessageSquare, Paintbrush, Palette, ShieldCheck, Sun, Users, Volume2, Zap } from 'lucide-react'
import { Btn, LinkBtn, Logo, Stamp, Wordmark } from '../components/ui'
import { Smiley } from '../components/Smiley'
import { useAuth } from '../state/auth'
import { useSkin } from '../state/skin'
import { navigate } from '../router'

const go = (to: string) => (e: React.MouseEvent<HTMLAnchorElement>) => (e.preventDefault(), navigate(to))

const FEATURES = [
  { icon: Users, title: 'A real Buddy List', body: 'Groups you can collapse, rename and drag buddies between, with online, away, idle and offline counts.' },
  { icon: Clock3, title: 'Away messages', body: 'Pick a classic or write your own. Buddies see it on hover, and your first IM back is an auto response.' },
  { icon: MessageSquare, title: 'IM windows', body: 'Every conversation is a window: drag, stack, minimize and keep five going at once. Full-screen tabs on phones.' },
  { icon: BellRing, title: 'Buzz!', body: 'Shake a buddy’s window to get their attention (politely: once every ten seconds, and gentler with reduced motion).' },
  { icon: Palette, title: 'Fonts, colors, smileys', body: 'Bold, italic, color and size, smileys that animate, emoji reactions, plus files and images up to 5 MB.' },
  { icon: Paintbrush, title: 'Skins', body: 'Eight built-in looks from brushed Chrome to green-screen Terminal, or mix your own accent, wallpaper, fonts and chat style.' },
  { icon: Volume2, title: 'Door sounds', body: 'Original sign-on and sign-off chimes synthesized in your browser. One click mutes them.' },
]

function Line({ name, mine, text, time, color }: { name: string; mine?: boolean; text: React.ReactNode; time: string; color?: string }) {
  return (
    <p className="text-[0.82rem] leading-snug">
      <b style={{ color: mine ? 'var(--red)' : 'var(--blue)' }}>{name}</b> <span className="font-mono text-[10px] text-muted">({time})</span>: <span style={color ? { color } : undefined}>{text}</span>
    </p>
  )
}

function Row({ name, stamp, state, line, bot }: { name: string; stamp: number; state: 'online' | 'away' | 'idle' | 'offline'; line: string; bot?: boolean }) {
  return (
    <li className="flex items-center gap-2 py-0.5 pl-4">
      <Stamp name={name} stamp={stamp} size={22} state={state} bot={bot} />
      <span className="min-w-0 leading-tight">
        <span className={`block truncate text-xs ${state === 'offline' ? 'italic text-muted' : 'font-bold'}`}>{name}</span>
        <span className={`block truncate text-[10px] ${state === 'away' ? 'italic text-brass' : 'text-muted'}`}>{line}</span>
      </span>
    </li>
  )
}

export function Landing() {
  const { session } = useAuth()
  const { resolved, toggleMode, setPanelOpen } = useSkin()
  const theme = resolved.mode
  return (
    <div className="wall min-h-dvh text-ink">
      <header className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-4">
        <span className="text-2xl">
          <Wordmark />
        </span>
        <span className="ml-auto" />
        <Btn tip="Appearance: try the skins" iconOnly variant="plain" onClick={() => setPanelOpen(true)}>
          <Palette size={19} aria-hidden="true" />
        </Btn>
        <Btn tip={theme === 'dark' ? 'Switch to light (Chrome)' : 'Switch to dark (Midnight)'} iconOnly variant="plain" onClick={toggleMode}>
          {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
        </Btn>
        {session ? (
          <LinkBtn href="/app" tip="Open your Buddy List" variant="blue" size="sm" onClick={go('/app')}>
            Open Buddyline
          </LinkBtn>
        ) : (
          <LinkBtn href="/login" tip="Sign on or claim a screen name" variant="ghost" size="sm" onClick={go('/login')}>
            Sign on
          </LinkBtn>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 lg:grid-cols-[1fr_1.05fr] lg:pt-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-hi px-3 py-1 font-pixel text-[10px] uppercase text-blue">
              <span className="h-2 w-2 animate-pulse rounded-full bg-online" aria-hidden="true" /> 3 buddies online
            </p>
            <h1 className="mt-5 font-display text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              Your buddies are <span className="text-red">online.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Buddyline is instant messaging the way it felt after school in 2002 (screen names, away messages, the Buddy List, a window for every chat) rebuilt fast, private and real-time on
              Supabase.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkBtn href="/demo" tip="Sign on with a guest screen name: no sign-up, cleared after a day" variant="red" size="lg" onClick={go('/demo')}>
                <Zap size={18} aria-hidden="true" /> Try the demo
              </LinkBtn>
              <LinkBtn href="/login?mode=signup" tip="Create a free account and pick your screen name" variant="ghost" size="lg" onClick={go('/login?mode=signup')}>
                Create an account
              </LinkBtn>
            </div>
            <p className="mt-4 text-sm text-muted">Guests get a screen name like xXSkaterHeronXx. Open two windows and IM yourself.</p>
          </div>

          <div className="relative min-h-[23rem]" role="img" aria-label="Preview: a Buddy List beside an IM window">
            <div className="window absolute left-0 top-0 w-[13.5rem] sm:w-56">
              <div className="titlebar flex h-8 items-center gap-1.5 px-2.5 text-xs font-extrabold" data-active="true">
                <Logo size="1.2em" /> Buddy List
              </div>
              <div className="bg-paper-hi px-1.5 py-2">
                <p className="px-1 text-[11px] font-extrabold">
                  ▾ Buddies <span className="font-mono font-normal text-muted">(2/3)</span>
                </p>
                <ul>
                  <Row name="MargueriteKerns" stamp={0} state="online" line="Online" />
                  <Row name="TeoShipsFriday" stamp={4} state="away" line="brb, deploying 🚀" />
                  <Row name="HanaClicks" stamp={7} state="idle" line="Idle 17m" />
                </ul>
                <p className="mt-1 px-1 text-[11px] font-extrabold">
                  ▾ Co-Workers <span className="font-mono font-normal text-muted">(1/1)</span>
                </p>
                <ul>
                  <Row name="PipTheBot" stamp={3} state="online" line="Always here" bot />
                </ul>
                <p className="mt-1 px-1 text-[11px] font-extrabold text-muted">▸ Offline (4)</p>
              </div>
            </div>
            <div className="window absolute right-0 top-14 w-[min(22rem,calc(100%-4rem))] sm:top-10">
              <div className="titlebar flex h-8 items-center gap-1.5 px-2.5 text-xs font-extrabold" data-active="true">
                <Stamp name="MargueriteKerns" stamp={0} size={18} state="online" /> MargueriteKerns – Instant Message
              </div>
              <div className="space-y-1.5 bg-paper-hi px-3 py-3">
                <Line
                  name="MargueriteKerns"
                  time="3:14 PM"
                  text={
                    <>
                      did you see the new font picker?? <Smiley id="grin" title=":D" />
                    </>
                  }
                />
                <Line name="you" mine time="3:14 PM" text={<b>YES. bold is back.</b>} color="var(--s-purple)" />
                <Line name="MargueriteKerns" time="3:15 PM" text="BUZZ!" color="var(--red)" />
                <p className="pt-1 text-[11px] italic text-muted">MargueriteKerns is typing…</p>
              </div>
              <div className="border-t border-line bg-paper px-2 py-1.5 font-pixel text-[9px] uppercase text-muted">B · I · U · A- A+ · ☺ · Buzz!</div>
            </div>
            <div className="window pop absolute bottom-0 left-8 flex w-56 items-center gap-2 p-2 sm:left-24">
              <Stamp name="TeoShipsFriday" stamp={4} size={28} state="online" />
              <span className="text-xs">
                <b className="block">TeoShipsFriday</b>
                <span className="font-pixel text-[9px] uppercase text-good">signed on</span>
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-paper-hi/80" aria-labelledby="features">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 id="features" className="font-display text-3xl font-black">
              Everything you remember
            </h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="window lift p-5">
                  <div className={`gloss grid h-11 w-11 place-items-center rounded-xl text-on-accent ${i % 2 ? 'bg-blue' : 'bg-red'}`}>
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14" aria-labelledby="how">
          <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 id="how" className="font-display text-3xl font-black">
                Modern under the hood
              </h2>
              <p className="mt-3 text-muted">
                React, TypeScript, Vite and Tailwind on Vercel; Supabase for auth, Postgres, Realtime and Storage. Buddy lists, away messages and presence live in Postgres behind row-level security:
                you only ever receive rows for conversations you’re in.
              </p>
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-good">
                <ShieldCheck size={16} aria-hidden="true" /> Members-only RLS on messages, buddy lists and files
              </p>
            </div>
            <ol className="grid gap-3 text-sm">
              {[
                ['Sign on', 'Presence tracks you across tabs; idle after 5 minutes without input'],
                ['Type', 'Your buddy sees “is typing…”, then “has entered text” if you pause'],
                ['Send', 'Optimistic IM with a client id; Postgres stamps it and rate-limits'],
                ['Deliver', 'Realtime streams it to the other window, filtered by RLS, no duplicates'],
              ].map(([k, v], i) => (
                <li key={k} className="window flex items-start gap-3 p-3">
                  <span className="gloss grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue font-pixel text-xs text-on-accent">{i + 1}</span>
                  <span>
                    <b>{k}.</b> <span className="text-muted">{v}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className="border-t border-line bg-paper-hi/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-6 text-sm text-muted">
          <Wordmark className="text-base text-ink" />
          <span>A portfolio project by Joshua M. Colon. Not affiliated with any classic messenger.</span>
          <a
            className="ml-auto underline underline-offset-2 hover:text-ink"
            href="https://github.com/JoshuaMColon/aerogram"
            title="View the source on GitHub"
            target="_blank"
            rel="noreferrer noopener"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
