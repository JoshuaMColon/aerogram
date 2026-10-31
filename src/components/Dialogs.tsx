import { useEffect, useState } from 'react'
import { Check, LogOut, PenLine, UserPlus } from 'lucide-react'
import * as api from '../lib/api'
import { shortAgo } from '../lib/logic'
import type { Member, Profile, PublicRoom, RoomSummary } from '../lib/types'
import { useAuth } from '../state/auth'
import { useChat } from '../state/chat'
import { navigate } from '../router'
import { Btn, Dialog, LinkBtn, RoomStamp, STAMP_COLORS, Stamp, useToast } from './ui'

const field = 'h-10 w-full rounded-lg border border-line bg-paper-hi px-3 text-[0.95rem] outline-none placeholder:text-muted focus:border-blue'

export function NewRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Open a new room">
      <NewRoomForm onClose={onClose} />
    </Dialog>
  )
}

function NewRoomForm({ onClose }: { onClose: () => void }) {
  const { db, refreshRooms } = useChat()
  const toast = useToast()
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await api.createRoom(db, name.trim(), topic.trim())
      await refreshRooms()
      onClose()
      navigate(`/app/r/${id}`)
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted">Public rooms are visible to everyone signed in; anyone can join.</p>
      <label className="block text-sm font-semibold">
        Name
        <input autoFocus required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Book club" className={`${field} mt-1 font-normal`} />
      </label>
      <label className="block text-sm font-semibold">
        Topic <span className="font-normal text-muted">(optional)</span>
        <input maxLength={140} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this room for?" className={`${field} mt-1 font-normal`} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Btn tip="Close without creating" variant="plain" onClick={onClose}>
          Cancel
        </Btn>
        <Btn tip="Create the room and open it" type="submit" variant="red" disabled={busy || !name.trim()}>
          {busy ? 'Opening…' : 'Open room'}
        </Btn>
      </div>
    </form>
  )
}

export function BrowseDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Public rooms" wide>
      <BrowseList onClose={onClose} onCreate={onCreate} />
    </Dialog>
  )
}

function BrowseList({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const { db, me, refreshRooms } = useChat()
  const toast = useToast()
  const [list, setList] = useState<PublicRoom[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    api
      .publicRooms(db)
      .then(setList)
      .catch((e: Error) => {
        toast(e.message)
        setList([])
      })
  }, [db, toast])
  async function join(r: PublicRoom) {
    if (r.joined) return (onClose(), navigate(`/app/r/${r.id}`))
    setBusy(r.id)
    try {
      await api.joinRoom(db, r.id, me.id)
      await refreshRooms()
      onClose()
      navigate(`/app/r/${r.id}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {!list && [0, 1, 2].map((i) => <li key={i} className="my-2 h-14 animate-pulse rounded-lg bg-sunk" />)}
        {list?.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <RoomStamp size={36} active={r.joined} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                #{r.slug} {r.is_seed && <span className="ml-1 rounded bg-sunk px-1 font-mono text-[10px] uppercase tracking-wider text-brass">featured</span>}
              </p>
              <p className="truncate text-xs text-muted">
                {r.topic || 'No topic'} · {r.members} {r.members === 1 ? 'member' : 'members'} · active {shortAgo(r.last_message_at)}
              </p>
            </div>
            <Btn tip={r.joined ? `Open #${r.slug}` : `Join #${r.slug}`} size="sm" variant={r.joined ? 'ghost' : 'blue'} disabled={busy === r.id} onClick={() => join(r)}>
              {r.joined ? (
                <>
                  <Check size={14} aria-hidden="true" /> Open
                </>
              ) : busy === r.id ? (
                'Joining…'
              ) : (
                'Join'
              )}
            </Btn>
          </li>
        ))}
        {list && !list.length && <li className="py-6 text-center text-sm text-muted">No public rooms yet.</li>}
      </ul>
      <div className="mt-3 flex justify-end">
        <Btn tip="Open a new public room" variant="red" size="sm" onClick={onCreate}>
          New room
        </Btn>
      </div>
    </>
  )
}

export function NewDmDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Write a direct letter">
      <PeoplePicker onClose={onClose} />
    </Dialog>
  )
}

function PeoplePicker({ onClose }: { onClose: () => void }) {
  const { db, me, online, refreshRooms, putProfile } = useChat()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [list, setList] = useState<Profile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    const t = window.setTimeout(
      () => {
        api
          .searchPeople(db, q, me.id)
          .then((l) => {
            l.forEach(putProfile)
            setList(l)
          })
          .catch((e: Error) => {
            toast(e.message)
            setList([])
          })
      },
      q ? 200 : 0,
    )
    return () => window.clearTimeout(t)
  }, [q, db, me.id, toast, putProfile])
  const sorted = list ? [...list].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id))) : null
  async function write(p: Profile) {
    setBusy(p.id)
    try {
      const id = await api.openDm(db, p.id)
      await refreshRooms()
      onClose()
      navigate(`/app/r/${id}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <label className="block">
        <span className="sr-only">Search people</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={field} />
      </label>
      <ul className="mt-2 divide-y divide-line">
        {!sorted && [0, 1, 2].map((i) => <li key={i} className="my-2 h-12 animate-pulse rounded-lg bg-sunk" />)}
        {sorted?.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <Stamp name={p.display_name} stamp={p.stamp} size={36} online={online.has(p.id)} bot={p.is_bot} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.display_name}</p>
              <p className="truncate text-xs text-muted">
                {p.bio || (p.is_bot ? 'Seed bot' : p.is_guest ? 'Guest' : 'Member')}
                {online.has(p.id) ? ' · online' : ''}
              </p>
            </div>
            <Btn tip={`Open letters with ${p.display_name}`} size="sm" variant="blue" disabled={busy === p.id} onClick={() => write(p)}>
              <PenLine size={14} aria-hidden="true" /> Write
            </Btn>
          </li>
        ))}
        {sorted && !sorted.length && <li className="py-6 text-center text-sm text-muted">Nobody by that name.</li>}
      </ul>
    </>
  )
}

export function PeopleDialog({ room, members, onClose }: { room: RoomSummary | null; members: Member[]; onClose: () => void }) {
  const { db, me, profiles, online, refreshRooms } = useChat()
  const toast = useToast()
  const list = [...members].sort((a, b) => Number(online.has(b.user_id)) - Number(online.has(a.user_id)))
  async function write(id: string) {
    try {
      const rid = await api.openDm(db, id)
      await refreshRooms()
      onClose()
      navigate(`/app/r/${rid}`)
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <Dialog open={!!room} onClose={onClose} title={room ? `People in #${room.slug ?? room.name}` : 'People'}>
      <ul className="divide-y divide-line">
        {list.map((m) => {
          const p = profiles[m.user_id]
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Stamp name={p?.display_name ?? '…'} stamp={p?.stamp ?? 0} size={34} online={online.has(m.user_id) || m.user_id === me.id} bot={p?.is_bot} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.user_id === me.id ? `${p?.display_name ?? 'You'} (you)` : (p?.display_name ?? '…')}</span>
              {m.user_id !== me.id && (
                <Btn tip={`Write a direct letter to ${p?.display_name ?? 'them'}`} iconOnly size="sm" variant="ghost" onClick={() => write(m.user_id)}>
                  <PenLine size={15} aria-hidden="true" />
                </Btn>
              )}
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Your stamp">
      <ProfileForm onClose={onClose} />
    </Dialog>
  )
}

function ProfileForm({ onClose }: { onClose: () => void }) {
  const { setProfile, signOut, isGuest, session } = useAuth()
  const { db, me, putProfile } = useChat()
  const toast = useToast()
  const [name, setName] = useState(me.display_name)
  const [bio, setBio] = useState(me.bio)
  const [stamp, setStamp] = useState(me.stamp)
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const p = await api.updateProfile(db, me.id, { display_name: name.trim(), bio: bio.trim(), stamp })
      setProfile(p)
      putProfile(p)
      toast('Profile saved', 'good')
      onClose()
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-4">
        <Stamp name={name || '?'} stamp={stamp} size={64} />
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold">{isGuest ? 'Guest pass' : session?.user.email}</p>
          <p className="text-xs text-muted">{isGuest ? 'Guest letters and files are cleared after a day.' : 'Signed in with email.'}</p>
        </div>
      </div>
      <label className="block text-sm font-semibold">
        Display name
        <input required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1 font-normal`} />
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">Stamp colour</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {STAMP_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              title={`Stamp colour ${i + 1}`}
              aria-label={`Stamp colour ${i + 1}`}
              aria-pressed={stamp === i}
              onClick={() => setStamp(i)}
              className={`press h-8 w-8 rounded-md border-2 ${stamp === i ? 'border-ink scale-110' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold">
        About <span className="font-normal text-muted">(optional)</span>
        <input maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line for your stamp" className={`${field} mt-1 font-normal`} />
      </label>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Btn tip="Sign out of Aerogram" variant="plain" onClick={() => (onClose(), signOut().then(() => navigate('/')))}>
          <LogOut size={15} aria-hidden="true" /> Sign out
        </Btn>
        {isGuest && (
          <LinkBtn
            href="/login?mode=signup"
            tip="Create a free account to keep your letters"
            variant="ghost"
            size="md"
            onClick={(e) => (e.preventDefault(), onClose(), signOut().then(() => navigate('/login?mode=signup')))}
          >
            <UserPlus size={15} aria-hidden="true" /> Get an account
          </LinkBtn>
        )}
        <span className="ml-auto" />
        <Btn tip="Save your profile" type="submit" variant="red" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </form>
  )
}
