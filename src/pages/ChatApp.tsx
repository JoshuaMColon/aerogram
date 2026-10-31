import { useEffect, useState } from 'react'
import { LogIn, LogOut, MessageSquare, Users, X } from 'lucide-react'
import { BuddyList, type DialogKind } from '../components/BuddyList'
import { AddBuddyDialog, AwayDialog, BrowseDialog, GroupDialog, NewDmDialog, NewRoomDialog, PeopleDialog, ProfileDialog } from '../components/Dialogs'
import { ImWindow } from '../components/ImWindow'
import { RoomView } from '../components/RoomView'
import { Btn, LinkBtn, Logo, RoomStamp, Stamp, inkDot } from '../components/ui'
import { buddyLive } from '../lib/im'
import { isUuid } from '../lib/logic'
import { unlockAudio } from '../lib/sounds'
import type { Member, RoomSummary } from '../lib/types'
import { useAuth } from '../state/auth'
import { BuddyProvider, useBuddies } from '../state/buddies'
import { ChatProvider, roomTitle, useChat } from '../state/chat'
import { LIST_W, WindowProvider, useWindows } from '../state/windows'
import { supabase } from '../lib/supabase'
import { navigate } from '../router'

function RoomIcon({ r, size = 22 }: { r: RoomSummary; size?: number }) {
  const { profiles, presence } = useChat()
  if (r.kind !== 'dm') return <RoomStamp size={size} />
  const p = r.dm_user ? profiles[r.dm_user] : undefined
  return <Stamp name={p?.display_name ?? '?'} stamp={p?.stamp ?? 0} size={size} state={buddyLive(p, r.dm_user ? presence[r.dm_user] : undefined).state} bot={p?.is_bot} />
}

function label(r: RoomSummary, profiles: ReturnType<typeof useChat>['profiles']) {
  return r.kind === 'dm' ? roomTitle(r, profiles) : `#${r.slug ?? roomTitle(r, profiles)}`
}

/** Sign-on / sign-off toasts, bottom-right like the old door chimes. */
function DoorToasts() {
  const { toasts, dismiss } = useBuddies()
  const { profiles } = useChat()
  const { openDm } = useWindows()
  return (
    <div className="pointer-events-none fixed bottom-14 right-3 z-[80] flex flex-col items-end gap-2 md:bottom-14" aria-live="polite">
      {toasts.map((t) => {
        const p = profiles[t.user]
        const name = p?.display_name ?? 'A buddy'
        return (
          <div key={t.id} className="window pop pointer-events-auto flex w-64 items-center gap-2.5 p-2.5" role="status" data-testid="door-toast">
            <Stamp name={name} stamp={p?.stamp ?? 0} size={34} state={t.on ? 'online' : 'offline'} bot={p?.is_bot} />
            <button type="button" className="press min-w-0 flex-1 text-left text-xs" title={`Send ${name} an IM`} onClick={() => (dismiss(t.id), openDm(t.user))}>
              <b className="block truncate text-[0.85rem]">{name}</b>
              <span className={`inline-flex items-center gap-1 font-pixel text-[9px] uppercase ${t.on ? 'text-good' : 'text-muted'}`}>
                {t.on ? <LogIn size={11} aria-hidden="true" /> : <LogOut size={11} aria-hidden="true" />}
                {t.on ? 'signed on' : 'signed off'}
              </span>
            </button>
            <Btn tip="Dismiss" iconOnly size="xs" variant="plain" onClick={() => dismiss(t.id)}>
              <X size={14} aria-hidden="true" />
            </Btn>
          </div>
        )
      })}
    </div>
  )
}

function Shell() {
  const { isGuest } = useAuth()
  const { rooms, profiles } = useChat()
  const { wins, focused, mobile, close, minimize, focus, place, buzz } = useWindows()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [group, setGroup] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null)
  const [people, setPeople] = useState<{ room: RoomSummary; members: Member[] } | null>(null)
  const openDialog = (d: DialogKind, arg?: { group?: string | null; edit?: { id: string; name: string } | null }) => {
    if (arg && 'group' in arg) setGroup(arg.group ?? null)
    if (arg && 'edit' in arg) setEdit(arg.edit ?? null)
    setDialog(d)
  }
  const closeDialog = () => setDialog(null)

  // Browsers only allow audio after a gesture; prime the synth on the first one.
  useEffect(() => {
    const on = () => unlockAudio()
    window.addEventListener('pointerdown', on, { once: true })
    window.addEventListener('keydown', on, { once: true })
    return () => (window.removeEventListener('pointerdown', on), window.removeEventListener('keydown', on))
  }, [])

  const roomOf = (id: string) => rooms.find((r) => r.id === id)
  const live = wins.filter((w) => roomOf(w.id))
  const view = (r: RoomSummary, active: boolean) => (
    <RoomView key={r.id} room={r} active={active} onPeople={(room, members) => setPeople({ room, members })} onLeft={() => close(r.id)} onBuzzed={() => buzz(r.id)} />
  )

  const banner = isGuest && (
    <div className="relative z-[60] flex shrink-0 items-center justify-center gap-3 bg-ink px-3 py-1.5 text-center text-xs text-paper">
      <span>
        You’re signed on with a <b>guest screen name</b>: it’s cleared after a day.
      </span>
      <a href="/login?mode=signup" className="press font-semibold underline underline-offset-2" title="Create a free account and pick your own screen name">
        Claim a screen name →
      </a>
    </div>
  )

  const dialogs = (
    <>
      <NewRoomDialog open={dialog === 'new-room'} onClose={closeDialog} />
      <BrowseDialog open={dialog === 'browse'} onClose={closeDialog} onCreate={() => setDialog('new-room')} />
      <NewDmDialog open={dialog === 'new-dm'} onClose={closeDialog} />
      <ProfileDialog open={dialog === 'profile'} onClose={closeDialog} />
      <AddBuddyDialog open={dialog === 'add-buddy'} onClose={closeDialog} group={group} />
      <GroupDialog open={dialog === 'group'} onClose={closeDialog} edit={edit} />
      <AwayDialog open={dialog === 'away'} onClose={closeDialog} />
      <PeopleDialog room={people?.room ?? null} members={people?.members ?? []} onClose={() => setPeople(null)} />
      <DoorToasts />
    </>
  )

  if (mobile) {
    const front = focused ? roomOf(focused) : undefined
    return (
      <div className="wall flex h-dvh flex-col text-ink">
        {banner}
        <nav aria-label="Open windows" className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-paper px-1.5 pt-1.5">
          <button
            type="button"
            role="tab"
            aria-selected={!front}
            title="Your Buddy List"
            onClick={() => focus(null)}
            onPointerDown={inkDot}
            className={`press relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-extrabold ${!front ? 'border-line bg-paper-hi' : 'border-transparent text-muted'}`}
          >
            <Users size={14} aria-hidden="true" /> Buddies
          </button>
          {live.map((w) => {
            const r = roomOf(w.id)!
            const on = front?.id === r.id
            return (
              <span key={w.id} className={`flex shrink-0 items-center rounded-t-lg border border-b-0 ${on ? 'border-line bg-paper-hi' : 'border-transparent'}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={`Open ${label(r, profiles)}`}
                  onClick={() => focus(r.id)}
                  className={`press flex max-w-36 items-center gap-1.5 py-1.5 pl-2 text-xs font-bold ${w.buzz ? '' : ''} ${r.unread && !on ? 'text-red' : on ? '' : 'text-muted'}`}
                >
                  <RoomIcon r={r} size={18} />
                  <span className="truncate">{label(r, profiles)}</span>
                  {r.unread > 0 && !on && <span className="seal grid h-4 min-w-4 place-items-center px-1 font-mono text-[9px]">{r.unread}</span>}
                </button>
                <Btn tip={`Close ${label(r, profiles)}`} iconOnly size="xs" variant="plain" onClick={() => close(r.id)}>
                  <X size={13} aria-hidden="true" />
                </Btn>
              </span>
            )
          })}
        </nav>
        <main className="flex min-h-0 flex-1 flex-col bg-paper-hi">
          {front ? (
            <div key={`${front.id}-${wins.find((w) => w.id === front.id)?.buzz ?? 0}`} className={`flex min-h-0 flex-1 flex-col ${wins.find((w) => w.id === front.id)?.buzz ? 'buzz' : ''}`}>
              {view(front, true)}
            </div>
          ) : (
            <BuddyList open={openDialog} />
          )}
        </main>
        {dialogs}
      </div>
    )
  }

  return (
    <div className="wall relative flex h-dvh flex-col overflow-hidden text-ink">
      {banner}
      <div className="relative min-h-0 flex-1" data-desk>
        <div className="absolute bottom-3 left-3 top-3" style={{ width: LIST_W - 16 }}>
          <BuddyList open={openDialog} />
        </div>
        {!live.length && (
          <div className="pointer-events-none absolute inset-y-0 right-0 grid place-items-center p-8 text-center" style={{ left: LIST_W }}>
            <div className="opacity-80">
              <Logo size={72} />
              <p className="mt-3 text-xl font-extrabold">Double-click… well, just click a buddy.</p>
              <p className="mt-1 text-sm text-muted">IMs open here as windows you can drag, stack and minimize.</p>
            </div>
          </div>
        )}
        {/* Floating IM windows live in desk coordinates (below the banner, above the taskbar). */}
        <div className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto">
          {live
            .filter((w) => !w.min)
            .map((w) => {
              const r = roomOf(w.id)!
              return (
                <ImWindow
                  key={w.id}
                  id={w.id}
                  title={r.kind === 'dm' ? `${label(r, profiles)} – Instant Message` : `${label(r, profiles)} – Chat room`}
                  icon={<RoomIcon r={r} size={22} />}
                  box={w.box}
                  z={w.z}
                  active={focused === w.id}
                  buzz={w.buzz}
                  onFocus={() => focus(w.id)}
                  onMove={(b) => place(w.id, b)}
                  onMinimize={() => minimize(w.id)}
                  onClose={() => close(w.id)}
                >
                  {view(r, focused === w.id)}
                </ImWindow>
              )
            })}
        </div>
      </div>
      <nav aria-label="Taskbar" className="taskbar relative z-[70] flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto px-2" style={{ paddingLeft: LIST_W - 4 }}>
        {live.map((w) => {
          const r = roomOf(w.id)!
          const on = focused === w.id && !w.min
          return (
            <button
              key={w.id}
              type="button"
              aria-pressed={on}
              title={w.min ? `Restore ${label(r, profiles)}` : on ? `Minimize ${label(r, profiles)}` : `Bring ${label(r, profiles)} to front`}
              onClick={() => (w.min ? minimize(w.id, false) : on ? minimize(w.id) : focus(w.id))}
              onPointerDown={inkDot}
              className={`press gloss relative flex h-8 max-w-48 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-xs font-bold ${on ? 'border-blue bg-paper-hi' : 'border-line bg-paper'} ${w.min ? 'opacity-75' : ''} ${r.unread && !on ? 'text-red' : ''}`}
            >
              <RoomIcon r={r} size={18} />
              <span className="truncate">{label(r, profiles)}</span>
              {r.unread > 0 && !on && <span className="seal grid h-4 min-w-4 place-items-center px-1 font-mono text-[9px]">{r.unread}</span>}
            </button>
          )
        })}
        {!live.length && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <MessageSquare size={13} aria-hidden="true" /> No windows open
          </span>
        )}
        <span className="ml-auto shrink-0 font-pixel text-[9px] uppercase text-muted">Buddyline</span>
      </nav>
      {dialogs}
    </div>
  )
}

export function ChatApp({ roomId }: { roomId: string | null }) {
  const { ready, session, profile, profileError, signOut } = useAuth()
  useEffect(() => {
    if (ready && !session) navigate('/login', true)
  }, [ready, session])
  if (!supabase) return <Center title="Not connected" body="This build has no Supabase configuration." />
  if (profileError)
    return (
      <Center title="Couldn’t sign on" body={profileError}>
        <Btn tip="Sign off and start again" variant="ghost" onClick={() => signOut().then(() => navigate('/'))}>
          Sign off
        </Btn>
      </Center>
    )
  if (!ready || !session || !profile) return <Center title="Signing on…" body="Connecting to Buddyline." spinner />
  return (
    <ChatProvider db={supabase} me={profile}>
      <BuddyProvider>
        <WindowProvider roomId={isUuid(roomId) ? roomId : null}>
          <Shell />
        </WindowProvider>
      </BuddyProvider>
    </ChatProvider>
  )
}

function Center({ title, body, spinner, children }: { title: string; body: string; spinner?: boolean; children?: React.ReactNode }) {
  return (
    <div className="wall grid min-h-dvh place-items-center p-6 text-center text-ink">
      <div className="window w-full max-w-sm p-6">
        {spinner && (
          <div className="mx-auto mb-4 w-fit animate-pulse" aria-hidden="true">
            <Logo size={48} />
          </div>
        )}
        <p className="text-xl font-extrabold" role={spinner ? 'status' : 'alert'}>
          {title}
        </p>
        <p className="mt-1 text-sm text-muted">{body}</p>
        <div className="mt-4 flex justify-center gap-2">
          {children ??
            (!spinner && (
              <LinkBtn href="/" tip="Back to the start">
                Home
              </LinkBtn>
            ))}
        </div>
      </div>
    </div>
  )
}
