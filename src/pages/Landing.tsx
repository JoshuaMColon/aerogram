import { Eye, Image as ImageIcon, MessagesSquare, Moon, PenLine, Radio, ShieldCheck, Smile, Sun, Zap } from 'lucide-react'
import { Btn, LinkBtn, Stamp, Wordmark } from '../components/ui'
import { useAuth } from '../state/auth'
import { navigate } from '../router'

const go = (to: string) => (e: React.MouseEvent<HTMLAnchorElement>) => (e.preventDefault(), navigate(to))

const FEATURES = [
  { icon: Radio, title: 'Live delivery', body: 'Messages, edits and reactions arrive instantly over Supabase Realtime, filtered by row-level security.' },
  { icon: Eye, title: 'Presence & receipts', body: 'See who is online, who is writing, and a “Read” postmark when your letter has been seen.' },
  { icon: MessagesSquare, title: 'Rooms & direct letters', body: 'Open or join public rooms, or write 1:1 to anyone, including a friendly bot named Pip.' },
  { icon: ImageIcon, title: 'Images & files', body: 'Attach up to 5 MB. Files live in private storage that only room members can read.' },
  { icon: Smile, title: 'Reactions & edits', body: 'React with emoji, edit or withdraw your own letters, and copy anything with a tap.' },
  { icon: Zap, title: 'Optimistic & paged', body: 'Sends appear instantly, history scrolls back forever, and it all fits a phone.' },
]

function Letter({ mine, name, stamp, text, time, bot }: { mine?: boolean; name: string; stamp: number; text: string; time: string; bot?: boolean }) {
  return (
    <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && <Stamp name={name} stamp={stamp} size={32} online bot={bot} />}
      <div className={`max-w-[78%] ${mine ? 'items-end' : ''} flex flex-col`}>
        <span className={`mb-0.5 flex gap-2 px-1 text-xs ${mine ? 'flex-row-reverse' : ''}`}>
          <b>{mine ? 'You' : name}</b>
          <span className="font-mono text-muted">{time}</span>
        </span>
        <p data-first="true" className={`${mine ? 'letter-mine rounded-tr-sm' : 'letter-theirs rounded-tl-sm'} rounded-lg px-3 py-1.5 text-sm leading-relaxed`}>
          {text}
        </p>
      </div>
    </div>
  )
}

export function Landing() {
  const { session, theme, toggleTheme } = useAuth()
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="airmail h-2" aria-hidden="true" />
      <header className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-4">
        <span className="text-2xl">
          <Wordmark />
        </span>
        <span className="ml-auto" />
        <Btn tip={theme === 'dark' ? 'Switch to light (Airmail)' : 'Switch to dark (Night Mail)'} iconOnly variant="plain" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
        </Btn>
        {session ? (
          <LinkBtn href="/app" tip="Open your rooms" variant="blue" size="sm" onClick={go('/app')}>
            Open Aerogram
          </LinkBtn>
        ) : (
          <LinkBtn href="/login" tip="Sign in or create an account" variant="ghost" size="sm" onClick={go('/login')}>
            Sign in
          </LinkBtn>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
          <div>
            <p className="postmark inline-block px-3 py-0.5 font-mono text-xs font-semibold uppercase tracking-widest text-red">Par avion · real-time</p>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Letters, <em className="text-red">delivered</em> the moment you write them.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Aerogram is a real-time chat app dressed as airmail: rooms, direct letters, live presence, typing, read receipts, reactions and file sharing, built on Supabase.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkBtn href="/demo" tip="Jump in with a guest pass: no sign-up, cleared after a day" variant="red" size="lg" onClick={go('/demo')}>
                <PenLine size={18} aria-hidden="true" /> Try the demo
              </LinkBtn>
              <LinkBtn href="/login?mode=signup" tip="Create a free account with your email" variant="ghost" size="lg" onClick={go('/login?mode=signup')}>
                Create an account
              </LinkBtn>
            </div>
            <p className="mt-4 text-sm text-muted">No sign-up needed for the demo. Open it in two windows to watch letters fly.</p>
          </div>

          <div className="relative">
            <div className="absolute -right-2 -top-6 z-10 rotate-6 sm:-right-6" aria-hidden="true">
              <div className="stamp stamp-lg h-24 w-20">
                <div className="flex h-full w-full flex-col items-center justify-center bg-red text-on-accent">
                  <span className="font-display text-3xl font-bold">✈</span>
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-widest">Air mail</span>
                </div>
              </div>
            </div>
            <div
              className="absolute -left-4 top-10 z-10 -rotate-12 rounded-full border-2 border-brass/70 px-4 py-3 text-center font-mono text-[10px] font-bold uppercase leading-tight tracking-widest text-brass sm:-left-10"
              aria-hidden="true"
            >
              Delivered
              <br />
              live
              <br />
              {new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
            </div>
            <div className="airmail-edge rounded-2xl p-2 shadow-[var(--shadow-hover)]">
              <div className="rounded-xl bg-card" role="img" aria-label="Preview of an Aerogram conversation">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <span className="font-display text-lg font-semibold"># the-lobby</span>
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-good">
                    <span className="h-1.5 w-1.5 rounded-full bg-online" />4 online
                  </span>
                </div>
                <div className="space-y-3 px-4 py-4">
                  <Letter name="Marguerite" stamp={0} time="9:41" text="Morning! Anyone else testing the new room?" />
                  <Letter name="Pip" stamp={3} bot time="9:42" text="Beep. Letters arrive here the instant they’re posted ✉️" />
                  <Letter mine name="You" stamp={1} time="9:43" text="Watching it happen in two tabs. Delightful." />
                  <div className="flex items-center justify-end gap-1 pr-1">
                    <span className="postmark px-2 font-mono text-[10px] font-bold uppercase tracking-widest text-good">Read ✓</span>
                  </div>
                  <p className="text-xs italic text-muted">
                    <span className="typing-dots mr-1.5 inline-flex align-middle">
                      <i />
                      <i />
                      <i />
                    </span>
                    Hana is writing…
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-paper-hi" aria-labelledby="features">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 id="features" className="font-display text-3xl font-semibold">
              What’s in the mailbag
            </h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="lift rounded-xl border border-line bg-card p-5">
                  <div className="stamp h-12 w-11">
                    <div className={`flex h-full w-full items-center justify-center text-on-accent ${i % 2 ? 'bg-blue' : 'bg-red'}`}>
                      <Icon size={20} aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14" aria-labelledby="how">
          <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 id="how" className="font-display text-3xl font-semibold">
                How it’s built
              </h2>
              <p className="mt-3 text-muted">
                React, TypeScript, Vite and Tailwind on Vercel; Supabase for auth, Postgres, Realtime and Storage. Every table sits behind strict row-level security: you only ever receive rows for
                rooms you belong to.
              </p>
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-good">
                <ShieldCheck size={16} aria-hidden="true" /> Members-only RLS on messages, channels and files
              </p>
            </div>
            <ol className="grid gap-3 font-mono text-sm">
              {[
                ['Write', 'Optimistic letter with a client UUID appears instantly'],
                ['Post', 'Insert via a security-invoker view; triggers stamp the time and rate-limit'],
                ['Sort', 'Postgres changes stream through Realtime, filtered by RLS'],
                ['Deliver', 'Every member’s tab merges it by id: no duplicates, no reloads'],
              ].map(([k, v], i) => (
                <li key={k} className="flex items-start gap-3 rounded-lg border border-line bg-card p-3">
                  <span className="postmark grid h-8 w-8 shrink-0 place-items-center text-xs font-bold text-red">{i + 1}</span>
                  <span>
                    <b className="font-sans">{k}.</b> <span className="text-muted">{v}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-6 text-sm text-muted">
          <Wordmark className="text-base text-ink" />
          <span>A portfolio project by Joshua M. Colon.</span>
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
        <div className="airmail h-2" aria-hidden="true" />
      </footer>
    </div>
  )
}
