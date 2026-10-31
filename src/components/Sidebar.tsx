import { useState } from 'react'
import { Compass, Moon, PenLine, Plus, Search, Sun } from 'lucide-react'
import { shortAgo } from '../lib/logic'
import type { RoomSummary } from '../lib/types'
import { useAuth } from '../state/auth'
import { roomTitle, useChat } from '../state/chat'
import { navigate } from '../router'
import { Btn, RoomStamp, Stamp, Wordmark, inkDot } from './ui'

export type DialogKind = 'new-room' | 'browse' | 'new-dm' | 'profile' | null

function preview(r: RoomSummary, me: string, name: (id: string) => string) {
  if (!r.last_user) return r.topic || 'No letters yet'
  const who = r.last_user === me ? 'You' : name(r.last_user)
  const body = r.last_deleted ? 'withdrew a letter' : r.last_body || (r.last_has_file ? '📎 sent a file' : '')
  return r.kind === 'dm' && r.last_user !== me ? body : `${who}: ${body}`
}

function RoomRow({ r, active }: { r: RoomSummary; active: boolean }) {
  const { me, profiles, online } = useChat()
  const title = roomTitle(r, profiles)
  const other = r.dm_user ? profiles[r.dm_user] : undefined
  const unread = r.unread > 0 && !active
  return (
    <li>
      <a
        href={`/app/r/${r.id}`}
        aria-current={active ? 'page' : undefined}
        title={r.kind === 'dm' ? `Open letters with ${title}` : `Open #${r.slug ?? title}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return
          e.preventDefault()
          navigate(`/app/r/${r.id}`)
        }}
        onPointerDown={inkDot}
        className={`press relative flex items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2 transition-colors ${active ? 'bg-card shadow-[var(--shadow)] ring-1 ring-line' : 'hover:bg-sunk'}`}
      >
        {active && <span className="airmail absolute inset-y-1 left-0 w-1 rounded-full" aria-hidden="true" />}
        {r.kind === 'dm' ? <Stamp name={title} stamp={other?.stamp ?? 0} size={34} online={!!r.dm_user && online.has(r.dm_user)} bot={other?.is_bot} /> : <RoomStamp size={34} active={active} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-sm ${unread ? 'font-bold' : 'font-semibold'}`}>{r.kind === 'dm' ? title : (r.slug ?? title)}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{r.last_user ? shortAgo(r.last_message_at) : ''}</span>
          </span>
          <span className={`block truncate text-xs ${unread ? 'text-ink' : 'text-muted'}`}>{preview(r, me.id, (id) => profiles[id]?.display_name ?? 'Someone')}</span>
        </span>
        {unread && (
          <span className="seal pop grid h-6 min-w-6 shrink-0 place-items-center px-1 font-mono text-[11px] font-bold" aria-label={`${r.unread} unread`}>
            {r.unread >= 99 ? '99+' : r.unread}
          </span>
        )}
      </a>
    </li>
  )
}

export function Sidebar({ activeId, open }: { activeId: string | null; open: (d: DialogKind) => void }) {
  const { theme, toggleTheme, isGuest } = useAuth()
  const { me, rooms, roomsLoaded, online, status, profiles } = useChat()
  const [q, setQ] = useState('')
  const match = (r: RoomSummary) => !q.trim() || roomTitle(r, profiles).toLowerCase().includes(q.trim().toLowerCase()) || (r.slug ?? '').includes(q.trim().toLowerCase())
  const pub = rooms.filter((r) => r.kind === 'public' && match(r))
  const dms = rooms.filter((r) => r.kind === 'dm' && match(r))
  const others = online.size - (online.has(me.id) ? 1 : 0)

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-paper md:w-80 md:border-r md:border-line" aria-label="Rooms and letters">
      <div className="airmail h-1.5 shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} title="Aerogram home" className="press rounded-md px-1 text-xl">
          <Wordmark />
        </a>
        <span
          className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${status === 'live' ? 'text-good' : 'text-brass'}`}
          title={status === 'live' ? 'Connected to Supabase Realtime' : 'Reconnecting to Realtime…'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'live' ? 'bg-online' : 'animate-pulse bg-brass'}`} aria-hidden="true" />
          {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Reconnecting'}
        </span>
        <span className="ml-auto" />
        <Btn tip={theme === 'dark' ? 'Switch to light (Airmail)' : 'Switch to dark (Night Mail)'} iconOnly variant="plain" size="sm" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </Btn>
        <Btn tip="Edit your profile and stamp" iconOnly variant="plain" size="sm" onClick={() => open('profile')} className="!px-1">
          <Stamp name={me.display_name} stamp={me.stamp} size={28} online />
        </Btn>
      </div>

      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Filter rooms and letters</span>
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter rooms & letters"
            className="h-9 w-full rounded-lg border border-line bg-card pl-8 pr-3 text-sm outline-none placeholder:text-muted focus:border-blue"
          />
        </label>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex items-center px-2 pb-1 pt-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-brass">Rooms</h2>
          <span className="ml-auto flex gap-0.5">
            <Btn tip="Browse public rooms" iconOnly size="xs" variant="plain" onClick={() => open('browse')}>
              <Compass size={15} aria-hidden="true" />
            </Btn>
            <Btn tip="Open a new public room" iconOnly size="xs" variant="plain" onClick={() => open('new-room')}>
              <Plus size={16} aria-hidden="true" />
            </Btn>
          </span>
        </div>
        <ul className="space-y-0.5">
          {!roomsLoaded && [0, 1, 2].map((i) => <li key={i} className="mx-1 h-12 animate-pulse rounded-lg bg-sunk" />)}
          {pub.map((r) => (
            <RoomRow key={r.id} r={r} active={r.id === activeId} />
          ))}
          {roomsLoaded && !pub.length && <li className="px-3 py-2 text-xs text-muted">{q ? 'No rooms match.' : 'You haven’t joined any rooms.'}</li>}
        </ul>

        <div className="flex items-center px-2 pb-1 pt-4">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-brass">Direct letters</h2>
          <span className="ml-auto">
            <Btn tip="Write a direct letter to someone" iconOnly size="xs" variant="plain" onClick={() => open('new-dm')}>
              <PenLine size={15} aria-hidden="true" />
            </Btn>
          </span>
        </div>
        <ul className="space-y-0.5">
          {dms.map((r) => (
            <RoomRow key={r.id} r={r} active={r.id === activeId} />
          ))}
          {roomsLoaded && !dms.length && <li className="px-3 py-2 text-xs text-muted">{q ? 'No letters match.' : 'No direct letters yet.'}</li>}
        </ul>
      </nav>

      <div className="border-t border-line px-3 py-2.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-online" aria-hidden="true" />
          {others > 0 ? `${others} other ${others === 1 ? 'person' : 'people'} online` : 'Just you online right now'}
        </span>
        {isGuest && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-brass">· guest pass</span>}
      </div>
    </aside>
  )
}
