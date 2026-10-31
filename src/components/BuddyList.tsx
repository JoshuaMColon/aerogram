import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Compass, FolderPlus, LogOut, MessageSquare, Moon, MoreHorizontal, Plus, Sun, UserPlus, UserRound, Volume2, VolumeX } from 'lucide-react'
import { DEFAULT_AWAYS, buddyLive, buildSections, statusLine, type Live, type Section } from '../lib/im'
import { shortAgo } from '../lib/logic'
import { isMuted, onMuted, play, setMuted, unlockAudio } from '../lib/sounds'
import type { RoomSummary } from '../lib/types'
import { useAuth } from '../state/auth'
import { useBuddies } from '../state/buddies'
import { roomTitle, useChat } from '../state/chat'
import { useWindows } from '../state/windows'
import { navigate } from '../router'
import { Btn, Logo, RoomStamp, Stamp, inkDot, useToast } from './ui'

export type DialogKind = 'new-room' | 'browse' | 'new-dm' | 'profile' | 'add-buddy' | 'group' | 'away' | null
export type OpenDialog = (d: DialogKind, arg?: { group?: string | null; edit?: { id: string; name: string } | null }) => void

/* ------------------------------------------------------------------ tiny popover menu */

function Menu({
  label,
  tip,
  button,
  children,
  align = 'right',
  wide,
}: {
  label: string
  tip: string
  button: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('pointerdown', off), document.removeEventListener('keydown', esc))
  }, [open])
  return (
    <span ref={box} className="relative inline-flex">
      <Btn
        tip={tip}
        iconOnly={!wide}
        size="xs"
        variant="plain"
        className={wide ? '!h-6 !px-1.5 -ml-1.5' : ''}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={wide ? tip : label}
        onClick={() => setOpen((v) => !v)}
      >
        {button}
      </Btn>
      {open && (
        <div role="menu" aria-label={label} className={`pop absolute top-8 z-40 min-w-48 rounded-xl border border-line bg-card p-1 text-sm shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  )
}

function Item({ children, onClick, tip, danger }: { children: ReactNode; onClick: () => void; tip: string; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      type="button"
      title={tip}
      onClick={onClick}
      onPointerDown={inkDot}
      className={`press relative flex w-full items-center gap-2 overflow-hidden rounded-lg px-2.5 py-1.5 text-left hover:bg-sunk ${danger ? 'text-bad' : ''}`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ hover card */

function HoverCard({ at, name, stamp, bot, live, line, bio }: { at: DOMRect; name: string; stamp: number; bot?: boolean; live: Live; line: string; bio?: string }) {
  const left = Math.min(at.right + 8, window.innerWidth - 268)
  const top = Math.min(at.top, window.innerHeight - 170)
  return (
    <div role="tooltip" className="window pop pointer-events-none fixed z-[90] w-64" style={{ left, top }}>
      <div className="titlebar flex h-7 items-center px-2.5 text-xs font-extrabold">{name}</div>
      <div className="flex gap-3 p-3">
        <Stamp name={name} stamp={stamp} size={44} state={live.state} bot={bot} />
        <div className="min-w-0 text-xs">
          <p className={`font-pixel text-[10px] uppercase ${live.state === 'away' ? 'text-brass' : live.state === 'idle' ? 'text-muted' : live.state === 'online' ? 'text-good' : 'text-muted'}`}>
            {live.state === 'online' ? 'Online' : live.state}
          </p>
          {live.away !== null ? <p className="mt-1 whitespace-pre-wrap break-words italic">{live.away || 'Away'}</p> : <p className="mt-1 text-muted">{line}</p>}
          {bio && live.away !== null && <p className="mt-1.5 border-t border-line pt-1.5 text-muted">{bio}</p>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ rows */

function BuddyRow({ id, live, section }: { id: string; live: Live; section: Section }) {
  const { profiles, rooms, visible } = useChat()
  const { list, move, remove } = useBuddies()
  const { openDm } = useWindows()
  const toast = useToast()
  const p = profiles[id]
  const name = p?.display_name ?? '…'
  const dm = rooms.find((r) => r.kind === 'dm' && r.dm_user === id)
  const unread = dm && !visible.has(dm.id) ? dm.unread : 0
  const [card, setCard] = useState<DOMRect | null>(null)
  const timer = useRef(0)
  const row = useRef<HTMLLIElement>(null)
  const line = statusLine(live, p)
  const off = live.state === 'offline'
  const current = list.buddies.find((b) => b.buddy === id)?.group_id
  const im = () => openDm(id).catch((e: Error) => toast(e.message))
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <li
      ref={row}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-buddy', id)
        e.dataTransfer.effectAllowed = 'move'
        setCard(null)
      }}
      onMouseEnter={() => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => row.current && setCard(row.current.getBoundingClientRect()), 450)
      }}
      onMouseLeave={() => {
        window.clearTimeout(timer.current)
        setCard(null)
      }}
      className="group/row relative flex items-center"
      data-buddy={name}
      data-state={live.state}
    >
      <button
        type="button"
        onClick={() => {
          window.clearTimeout(timer.current)
          setCard(null)
          void im()
        }}
        onPointerDown={inkDot}
        title={`Send ${name} an IM`}
        className="press relative flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-lg py-1 pl-6 pr-8 text-left transition-colors hover:bg-sunk"
      >
        <Stamp name={name} stamp={p?.stamp ?? 0} size={28} state={live.state} bot={p?.is_bot} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className={`block truncate text-[0.85rem] ${off ? 'font-semibold italic text-muted' : 'font-bold'} ${unread ? 'text-red' : ''}`}>{name}</span>
          <span className={`block truncate text-[11px] ${live.state === 'away' ? 'italic text-brass' : 'text-muted'}`}>{line}</span>
        </span>
        {unread > 0 && (
          <span className="seal pop grid h-5 min-w-5 shrink-0 place-items-center px-1 font-mono text-[10px] font-bold" aria-label={`${unread} unread`}>
            {unread >= 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <span className="absolute right-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100">
        <Menu label={`Actions for ${name}`} tip={`More for ${name}`} button={<MoreHorizontal size={15} aria-hidden="true" />}>
          {(close) => (
            <>
              <Item tip={`Send ${name} an IM`} onClick={() => (close(), im())}>
                <MessageSquare size={14} aria-hidden="true" /> Send IM
              </Item>
              <p className="px-2.5 pb-0.5 pt-1.5 font-pixel text-[9px] uppercase text-muted">Move to</p>
              {list.groups
                .filter((g) => g.id !== current)
                .map((g) => (
                  <Item key={g.id} tip={`Move ${name} to ${g.name}`} onClick={() => (close(), move(id, g.id).catch((e: Error) => toast(e.message)))}>
                    <ChevronRight size={14} aria-hidden="true" /> {g.name}
                  </Item>
                ))}
              <div className="my-1 h-px bg-line" />
              <Item
                tip={`Remove ${name} from your Buddy List`}
                danger
                onClick={() => (
                  close(),
                  remove(id).then(
                    () => toast(`${name} removed`),
                    (e: Error) => toast(e.message),
                  )
                )}
              >
                Remove buddy
              </Item>
            </>
          )}
        </Menu>
      </span>
      {card && p && <HoverCard at={card} name={name} stamp={p.stamp} bot={p.is_bot} live={live} line={line} bio={p.bio} />}
      <span className="sr-only">{section.name}</span>
    </li>
  )
}

function GroupBlock({ s, open }: { s: Section; open: OpenDialog }) {
  const { me } = useChat()
  const { move } = useBuddies()
  const toast = useToast()
  const key = `buddyline:collapsed:${me.id}`
  const [closed, setClosed] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem(key) || '[]') as string[]).includes(s.id)
    } catch {
      return false
    }
  })
  const [over, setOver] = useState(false)
  function toggle() {
    const next = !closed
    setClosed(next)
    try {
      const cur = new Set(JSON.parse(localStorage.getItem(key) || '[]') as string[])
      if (next) cur.add(s.id)
      else cur.delete(s.id)
      localStorage.setItem(key, JSON.stringify([...cur]))
    } catch {
      /* ignore */
    }
  }
  const g = s.group
  return (
    <section
      aria-label={`${s.name} (${s.online}/${s.total})`}
      className={`rounded-xl transition-colors ${over ? 'bg-sunk ring-2 ring-blue' : ''}`}
      onDragOver={(e) => {
        if (!g || !e.dataTransfer.types.includes('application/x-buddy')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('application/x-buddy')
        if (g && id) {
          e.preventDefault()
          move(id, g.id).catch((err: Error) => toast(err.message))
        }
      }}
    >
      <div className="group/hd relative flex items-center">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!closed}
          title={closed ? `Expand ${s.name}` : `Collapse ${s.name}`}
          className="press flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-sunk"
        >
          <ChevronRight size={14} className={`shrink-0 text-muted transition-transform ${closed ? '' : 'rotate-90'}`} aria-hidden="true" />
          <span className="truncate text-[0.8rem] font-extrabold">{s.name}</span>
          <span className="font-mono text-[11px] text-muted">({g ? `${s.online}/${s.total}` : s.total})</span>
        </button>
        {g && (
          <span className="absolute right-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/hd:opacity-100 [@media(hover:none)]:opacity-60">
            <Menu label={`Group ${s.name}`} tip={`Options for ${s.name}`} button={<MoreHorizontal size={15} aria-hidden="true" />}>
              {(close) => (
                <>
                  <Item tip={`Add a buddy to ${s.name}`} onClick={() => (close(), open('add-buddy', { group: g.id }))}>
                    <UserPlus size={14} aria-hidden="true" /> Add buddy here
                  </Item>
                  <Item tip={`Rename or delete ${s.name}`} onClick={() => (close(), open('group', { edit: { id: g.id, name: g.name } }))}>
                    Rename / delete…
                  </Item>
                  <Item tip="Create a new group" onClick={() => (close(), open('group', { edit: null }))}>
                    <FolderPlus size={14} aria-hidden="true" /> New group
                  </Item>
                </>
              )}
            </Menu>
          </span>
        )}
      </div>
      {!closed && (
        <ul className="pb-1">
          {s.people.map((x) => (
            <BuddyRow key={x.id} id={x.id} live={x.live} section={s} />
          ))}
          {g && !s.total && <li className="py-1 pl-7 text-[11px] text-muted">Drag buddies here, or use ⋯ → Add buddy.</li>}
        </ul>
      )}
    </section>
  )
}

function RoomRow({ r }: { r: RoomSummary }) {
  const { me, profiles, presence, visible } = useChat()
  const { open } = useWindows()
  const title = roomTitle(r, profiles)
  const other = r.dm_user ? profiles[r.dm_user] : undefined
  const unread = r.unread > 0 && !visible.has(r.id)
  const who = r.last_user === me.id ? 'You: ' : ''
  const body = r.last_deleted ? 'message deleted' : r.last_body || (r.last_has_file ? '📎 file' : r.topic || '')
  return (
    <li>
      <button
        type="button"
        onClick={() => open(r.id)}
        onPointerDown={inkDot}
        title={r.kind === 'dm' ? `Open your IM with ${title}` : `Open #${r.slug ?? title}`}
        className="press relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2 py-1.5 text-left hover:bg-sunk"
      >
        {r.kind === 'dm' ? (
          <Stamp name={title} stamp={other?.stamp ?? 0} size={28} state={buddyLive(other, r.dm_user ? presence[r.dm_user] : undefined).state} bot={other?.is_bot} />
        ) : (
          <RoomStamp size={28} />
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-[0.85rem] ${unread ? 'font-extrabold text-red' : 'font-bold'}`}>{r.kind === 'dm' ? title : `#${r.slug ?? title}`}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{r.last_user ? shortAgo(r.last_message_at) : ''}</span>
          </span>
          <span className="block truncate text-[11px] text-muted">{who + body}</span>
        </span>
        {unread && (
          <span className="seal pop grid h-5 min-w-5 shrink-0 place-items-center px-1 font-mono text-[10px] font-bold" aria-label={`${r.unread} unread`}>
            {r.unread >= 99 ? '99+' : r.unread}
          </span>
        )}
      </button>
    </li>
  )
}

/* ------------------------------------------------------------------ the list */

export function BuddyList({ open }: { open: OpenDialog }) {
  const { theme, toggleTheme, isGuest, signOut } = useAuth()
  const { me, rooms, roomsLoaded, presence, profiles, status, away, idleSince, setAway } = useChat()
  const { list, loaded } = useBuddies()
  const toast = useToast()
  const [tab, setTab] = useState<'buddies' | 'rooms'>('buddies')
  const [muted, setMutedState] = useState(isMuted)
  const [, tick] = useState(0)
  useEffect(() => onMuted(setMutedState), [])
  // Idle timers and "signed off 5m ago" tick over once a minute.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const sections = useMemo(
    () =>
      buildSections(
        list,
        (id) => buddyLive(profiles[id], presence[id]),
        (id) => profiles[id]?.display_name ?? '',
      ),
    [list, profiles, presence],
  )
  const onlineCount = sections.reduce((n, s) => n + (s.group ? s.online : 0), 0)
  const total = list.buddies.length
  const pub = rooms.filter((r) => r.kind === 'public')
  const dms = rooms.filter((r) => r.kind === 'dm')
  const unreadDms = dms.reduce((n, r) => n + r.unread, 0)
  const unreadRooms = pub.reduce((n, r) => n + r.unread, 0)
  const myState = away !== null ? 'away' : idleSince ? 'idle' : 'online'

  const goAway = (msg: string) => setAway(msg).then(() => toast('Away message set', 'good'))

  return (
    <aside className="window flex h-full min-h-0 w-full flex-col md:rounded-[var(--win-r,14px)]" aria-label="Buddy List">
      <div className="titlebar flex h-10 shrink-0 items-center gap-2 pl-3 pr-1.5" data-active="true">
        <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} title="Buddyline home" className="press inline-flex items-center gap-1.5 rounded-md text-[0.95rem] font-extrabold">
          <Logo size="1.35em" /> Buddy List
        </a>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 font-pixel text-[9px] uppercase"
          title={status === 'live' ? 'Connected to Supabase Realtime' : 'Reconnecting to Realtime…'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'live' ? 'bg-online' : 'animate-pulse bg-brass'}`} aria-hidden="true" />
          {status === 'live' ? 'Live' : status === 'connecting' ? '…' : 'Retry'}
        </span>
      </div>

      {/* me */}
      <div className="flex items-center gap-2.5 border-b border-line bg-paper px-3 py-2.5">
        <Btn tip="Edit my profile and buddy icon" iconOnly variant="plain" size="md" className="!h-12 !w-12 !p-0" onClick={() => open('profile')}>
          <Stamp name={me.display_name} stamp={me.stamp} size={44} state={myState} />
        </Btn>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-extrabold" data-testid="my-screen-name">
            {me.display_name}
          </p>
          <Menu
            align="left"
            wide
            label="My status"
            tip="Set your status or away message"
            button={
              <span className={`flex items-center gap-1 text-[11px] font-bold ${myState === 'away' ? 'text-brass' : myState === 'idle' ? 'text-muted' : 'text-good'}`}>
                {myState === 'away' ? 'Away' : myState === 'idle' ? 'Idle' : 'Available'} <ChevronRight size={12} className="rotate-90" aria-hidden="true" />
              </span>
            }
          >
            {(close) => (
              <>
                <Item tip="Show as available" onClick={() => (close(), away !== null && setAway(null))}>
                  <span className="h-2.5 w-2.5 rounded-full bg-online" aria-hidden="true" /> Available
                </Item>
                <p className="px-2.5 pb-0.5 pt-1.5 font-pixel text-[9px] uppercase text-muted">Away</p>
                {DEFAULT_AWAYS.slice(0, 4).map((m) => (
                  <Item key={m} tip={`Go away: ${m}`} onClick={() => (close(), goAway(m))}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brass" aria-hidden="true" />
                    <span className="truncate italic">{m}</span>
                  </Item>
                ))}
                <Item tip="Write a custom away message or pick a saved one" onClick={() => (close(), open('away'))}>
                  <Plus size={14} aria-hidden="true" /> Custom away message…
                </Item>
              </>
            )}
          </Menu>
        </div>
      </div>

      {away !== null && (
        <div className="flash flex items-start gap-2 border-b border-line bg-[color-mix(in_srgb,var(--brass)_14%,var(--paper-hi))] px-3 py-2 text-xs" role="status" data-testid="away-banner">
          <span className="min-w-0 flex-1">
            <b className="font-pixel text-[9px] uppercase text-brass">You’re away</b>
            <span className="mt-0.5 block truncate italic" title={away}>
              {away}
            </span>
          </span>
          <Btn tip="Clear your away message" size="xs" variant="blue" onClick={() => setAway(null)}>
            I’m back
          </Btn>
        </div>
      )}

      <div role="tablist" aria-label="Lists" className="flex gap-1 border-b border-line bg-paper px-2 pt-1.5">
        {(
          [
            ['buddies', `Buddies ${loaded ? `${onlineCount}/${total}` : ''}`, unreadDms],
            ['rooms', 'Rooms & IMs', unreadRooms + unreadDms],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            title={k === 'buddies' ? 'Your Buddy List' : 'Chat rooms and recent IMs'}
            onClick={() => setTab(k)}
            className={`press relative -mb-px rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-extrabold ${tab === k ? 'border-line bg-paper-hi' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
            {k === 'rooms' && n > 0 && tab !== 'rooms' && <span className="seal ml-1.5 inline-grid h-4 min-w-4 place-items-center px-1 align-middle font-mono text-[9px]">{n}</span>}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper-hi px-1.5 py-2">
        {tab === 'buddies' ? (
          !loaded ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="mx-1 my-1.5 h-9 animate-pulse rounded-lg bg-sunk" />)
          ) : (
            <div className="space-y-1" data-testid="buddy-list">
              {sections.map((s) => (
                <GroupBlock key={s.id} s={s} open={open} />
              ))}
            </div>
          )
        ) : (
          <div>
            <div className="flex items-center px-2 pb-1">
              <h2 className="font-pixel text-[10px] uppercase text-blue">Chat rooms</h2>
              <span className="ml-auto flex gap-0.5">
                <Btn tip="Browse public rooms" iconOnly size="xs" variant="plain" onClick={() => open('browse')}>
                  <Compass size={15} aria-hidden="true" />
                </Btn>
                <Btn tip="Start a new chat room" iconOnly size="xs" variant="plain" onClick={() => open('new-room')}>
                  <Plus size={16} aria-hidden="true" />
                </Btn>
              </span>
            </div>
            <ul>
              {!roomsLoaded && [0, 1].map((i) => <li key={i} className="mx-1 my-1 h-10 animate-pulse rounded-lg bg-sunk" />)}
              {pub.map((r) => (
                <RoomRow key={r.id} r={r} />
              ))}
              {roomsLoaded && !pub.length && <li className="px-3 py-1 text-xs text-muted">No rooms joined. Browse to find one.</li>}
            </ul>
            <div className="flex items-center px-2 pb-1 pt-3">
              <h2 className="font-pixel text-[10px] uppercase text-blue">Recent IMs</h2>
              <span className="ml-auto">
                <Btn tip="Send an IM to any screen name" iconOnly size="xs" variant="plain" onClick={() => open('new-dm')}>
                  <MessageSquare size={15} aria-hidden="true" />
                </Btn>
              </span>
            </div>
            <ul>
              {dms.map((r) => (
                <RoomRow key={r.id} r={r} />
              ))}
              {roomsLoaded && !dms.length && <li className="px-3 py-1 text-xs text-muted">No IMs yet.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 border-t border-line bg-paper px-1.5 py-1.5">
        <Btn tip="Send an IM to any screen name" size="sm" variant="red" onClick={() => open('new-dm')}>
          <MessageSquare size={15} aria-hidden="true" /> IM
        </Btn>
        <Btn tip="Add a buddy by screen name" iconOnly size="sm" variant="plain" onClick={() => open('add-buddy', { group: null })}>
          <UserPlus size={17} aria-hidden="true" />
        </Btn>
        <Btn tip="Create a buddy group" iconOnly size="sm" variant="plain" onClick={() => open('group', { edit: null })}>
          <FolderPlus size={17} aria-hidden="true" />
        </Btn>
        <span className="ml-auto" />
        <Btn
          tip={muted ? 'Sounds are off: turn on door and message sounds' : 'Sounds are on: mute them'}
          iconOnly
          size="sm"
          variant="plain"
          aria-pressed={muted}
          onClick={() => {
            unlockAudio()
            setMuted(!muted)
            if (muted) play('message')
          }}
        >
          {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
        </Btn>
        <Btn tip={theme === 'dark' ? 'Switch to light (Daydream)' : 'Switch to dark (Midnight)'} iconOnly size="sm" variant="plain" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        </Btn>
        <Btn tip="My profile" iconOnly size="sm" variant="plain" onClick={() => open('profile')}>
          <UserRound size={17} aria-hidden="true" />
        </Btn>
        <Btn tip={isGuest ? 'Sign off (guest data is cleared after a day)' : 'Sign off'} iconOnly size="sm" variant="plain" onClick={() => signOut().then(() => navigate('/'))}>
          <LogOut size={16} aria-hidden="true" />
        </Btn>
      </div>
    </aside>
  )
}
