import { useEffect, useState } from 'react'
import { Check, LogOut, MessageSquare, Trash2, UserPlus } from 'lucide-react'
import * as api from '../lib/api'
import { shortAgo } from '../lib/logic'
import { DEFAULT_AWAYS, buddyLive, screenNameError, statusLine } from '../lib/im'
import type { Member, Profile, PublicRoom, RoomSummary } from '../lib/types'
import { useAuth } from '../state/auth'
import { useChat } from '../state/chat'
import { useBuddies } from '../state/buddies'
import { navigate } from '../router'
import { Btn, Dialog, ICONS, LinkBtn, RoomStamp, Stamp, useToast } from './ui'

const field = 'h-10 w-full rounded-xl border border-line bg-paper-hi px-3 text-[0.95rem] outline-none placeholder:text-muted focus:border-blue'

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
    <Dialog open={open} onClose={onClose} title="Send an Instant Message">
      <PeoplePicker onClose={onClose} />
    </Dialog>
  )
}

function PeoplePicker({ onClose }: { onClose: () => void }) {
  const { db, me, online, presence, refreshRooms, putProfile } = useChat()
  const { buddies, add } = useBuddies()
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
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search screen names" className={field} />
      </label>
      <ul className="mt-2 divide-y divide-line">
        {!sorted && [0, 1, 2].map((i) => <li key={i} className="my-2 h-12 animate-pulse rounded-lg bg-sunk" />)}
        {sorted?.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <Stamp name={p.display_name} stamp={p.stamp} size={36} state={buddyLive(p, presence[p.id]).state} bot={p.is_bot} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.display_name}</p>
              <p className="truncate text-xs text-muted">{statusLine(buddyLive(p, presence[p.id]), p, undefined, me.display_name)}</p>
            </div>
            {!buddies.has(p.id) && (
              <Btn
                tip={`Add ${p.display_name} to your Buddy List`}
                iconOnly
                size="sm"
                variant="ghost"
                onClick={() =>
                  add(p.display_name, null).then(
                    () => toast(`${p.display_name} added`, 'good'),
                    (e: Error) => toast(e.message),
                  )
                }
              >
                <UserPlus size={15} aria-hidden="true" />
              </Btn>
            )}
            <Btn tip={`Send ${p.display_name} an IM`} size="sm" variant="blue" disabled={busy === p.id} onClick={() => write(p)}>
              <MessageSquare size={14} aria-hidden="true" /> IM
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
                <Btn tip={`Send ${p?.display_name ?? 'them'} an IM`} iconOnly size="sm" variant="ghost" onClick={() => write(m.user_id)}>
                  <MessageSquare size={15} aria-hidden="true" />
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
    <Dialog open={open} onClose={onClose} title="My profile">
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
      const bad = screenNameError(name)
      if (bad) throw new Error(bad)
      const p = await api.updateProfile(db, me.id, { display_name: name.trim(), bio: bio.trim(), stamp })
      setProfile(p)
      putProfile(p)
      toast('Profile saved', 'good')
      onClose()
    } catch (err) {
      const m = (err as Error).message
      toast(/duplicate|unique|taken/i.test(m) ? 'That screen name is taken. Try another!' : m)
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
          <p className="text-xs text-muted">{isGuest ? 'Guest messages and files are cleared after a day.' : 'Signed in with email.'}</p>
        </div>
      </div>
      <label className="block text-sm font-semibold">
        Screen name
        <input required maxLength={20} value={name} aria-describedby="sn-help" onChange={(e) => setName(e.target.value)} className={`${field} mt-1 font-normal`} />
      </label>
      <p id="sn-help" className={`-mt-3 text-xs ${screenNameError(name) ? 'text-bad' : 'text-muted'}`}>
        {screenNameError(name) ?? '3–20 letters, numbers, spaces, dots, dashes or underscores.'}
      </p>
      <fieldset>
        <legend className="text-sm font-semibold">Buddy icon</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ICONS.map(([a, b], i) => (
            <button
              key={b}
              type="button"
              title={`Buddy icon ${i + 1}`}
              aria-label={`Buddy icon ${i + 1}`}
              aria-pressed={stamp === i}
              onClick={() => setStamp(i)}
              className={`press stamp h-9 w-9 border-2 ${stamp === i ? 'scale-110 border-ink' : 'border-transparent'}`}
              style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
            />
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold">
        Profile <span className="font-normal text-muted">(a short bio, optional)</span>
        <input maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="likes: skating, pixel art, mixtapes" className={`${field} mt-1 font-normal`} />
      </label>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Btn tip="Sign off Buddyline" variant="plain" onClick={() => (onClose(), signOut().then(() => navigate('/')))}>
          <LogOut size={15} aria-hidden="true" /> Sign off
        </Btn>
        {isGuest && (
          <LinkBtn
            href="/login?mode=signup"
            tip="Create a free account to keep your screen name"
            variant="ghost"
            size="md"
            onClick={(e) => (e.preventDefault(), onClose(), signOut().then(() => navigate('/login?mode=signup')))}
          >
            <UserPlus size={15} aria-hidden="true" /> Get an account
          </LinkBtn>
        )}
        <span className="ml-auto" />
        <Btn tip="Save your profile" type="submit" variant="red" disabled={busy || !!screenNameError(name)}>
          {busy ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ buddy list dialogs */

export function AddBuddyDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group: string | null }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a Buddy">
      <AddBuddyForm onClose={onClose} group={group} />
    </Dialog>
  )
}

function AddBuddyForm({ onClose, group }: { onClose: () => void; group: string | null }) {
  const { list, add } = useBuddies()
  const toast = useToast()
  const [name, setName] = useState('')
  const [gid, setGid] = useState(group ?? list.groups[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await add(name.trim(), gid || null)
      toast(`${name.trim()} added to your Buddy List`, 'good')
      onClose()
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-semibold">
        Screen name
        <input autoFocus required maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TeoShipsFriday" className={`${field} mt-1 font-normal`} />
      </label>
      <label className="block text-sm font-semibold">
        Group
        <select value={gid} onChange={(e) => setGid(e.target.value)} className={`${field} mt-1 font-normal`}>
          {list.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Btn tip="Close without adding" variant="plain" onClick={onClose}>
          Cancel
        </Btn>
        <Btn tip="Add this screen name" type="submit" variant="red" disabled={busy || !name.trim()}>
          <UserPlus size={15} aria-hidden="true" /> {busy ? 'Adding…' : 'Add buddy'}
        </Btn>
      </div>
    </form>
  )
}

export function GroupDialog({ open, onClose, edit }: { open: boolean; onClose: () => void; edit: { id: string; name: string } | null }) {
  return (
    <Dialog open={open} onClose={onClose} title={edit ? `Rename “${edit.name}”` : 'New group'}>
      <GroupForm key={edit?.id ?? 'new'} onClose={onClose} edit={edit} />
    </Dialog>
  )
}

function GroupForm({ onClose, edit }: { onClose: () => void; edit: { id: string; name: string } | null }) {
  const { saveGroup, deleteGroup, list } = useBuddies()
  const toast = useToast()
  const [name, setName] = useState(edit?.name ?? '')
  const [busy, setBusy] = useState(false)
  const count = edit ? list.buddies.filter((b) => b.group_id === edit.id).length : 0
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveGroup(name.trim(), edit?.id ?? null)
      onClose()
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function del() {
    if (!edit) return
    setBusy(true)
    try {
      await deleteGroup(edit.id)
      toast(`Deleted “${edit.name}”${count ? `; its buddies moved to another group` : ''}`)
      onClose()
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-semibold">
        Group name
        <input autoFocus required maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skate Crew" className={`${field} mt-1 font-normal`} />
      </label>
      <div className="flex items-center gap-2 pt-1">
        {edit && list.groups.length > 1 && (
          <Btn tip={count ? `Delete the group; its ${count} buddies move to another group` : 'Delete this group'} variant="plain" className="text-bad" disabled={busy} onClick={del}>
            <Trash2 size={15} aria-hidden="true" /> Delete
          </Btn>
        )}
        <span className="ml-auto" />
        <Btn tip="Close without saving" variant="plain" onClick={onClose}>
          Cancel
        </Btn>
        <Btn tip="Save the group" type="submit" variant="red" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </form>
  )
}

export function AwayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Away message">
      <AwayForm onClose={onClose} />
    </Dialog>
  )
}

function AwayForm({ onClose }: { onClose: () => void }) {
  const { db, away, setAway } = useChat()
  const toast = useToast()
  const [msg, setMsg] = useState(away ?? '')
  const [saved, setSaved] = useState<string[]>([])
  const [save, setSave] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.awayPresets(db).then(setSaved, () => {})
  }, [db])
  const presets = [...saved, ...DEFAULT_AWAYS.filter((d) => !saved.includes(d))]
  async function go(text: string) {
    setBusy(true)
    try {
      if (save && text.trim() && !saved.includes(text.trim())) setSaved(await api.saveAwayPresets(db, [text.trim(), ...saved].slice(0, 12)))
      await setAway(text)
      toast('You are now away. Buddies who IM you get your message once.', 'good')
      onClose()
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function forget(p: string) {
    try {
      setSaved(
        await api.saveAwayPresets(
          db,
          saved.filter((x) => x !== p),
        ),
      )
    } catch (err) {
      toast((err as Error).message)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        go(msg)
      }}
      className="space-y-3"
    >
      <p className="text-sm text-muted">
        Shown on your buddy hover card and sent once as an auto response when someone IMs you. <code className="font-mono text-xs">%n</code> becomes their screen name,{' '}
        <code className="font-mono text-xs">%t</code> the time.
      </p>
      <label className="block text-sm font-semibold">
        Message
        <textarea
          autoFocus
          maxLength={240}
          rows={3}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="brb, feeding my virtual pet"
          className={`${field} mt-1 h-auto py-2 font-normal`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-[var(--red)]" /> Save as a preset
      </label>
      <div>
        <p className="font-pixel text-[10px] uppercase text-blue">Presets</p>
        <ul className="scroll-thin mt-1 max-h-44 space-y-1 overflow-y-auto">
          {presets.map((p) => (
            <li key={p} className="flex items-center gap-1">
              <button
                type="button"
                title="Use this away message"
                onClick={() => setMsg(p)}
                className="press min-w-0 flex-1 truncate rounded-lg border border-line bg-paper-hi px-2.5 py-1.5 text-left text-sm italic hover:border-blue"
              >
                {p}
              </button>
              {saved.includes(p) && (
                <Btn tip="Forget this preset" iconOnly size="xs" variant="plain" onClick={() => forget(p)}>
                  <Trash2 size={13} aria-hidden="true" />
                </Btn>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2 pt-1">
        {away !== null && (
          <Btn tip="Clear your away message and come back" variant="ghost" disabled={busy} onClick={() => setAway(null).then(onClose)}>
            I’m back
          </Btn>
        )}
        <span className="ml-auto" />
        <Btn tip="Close without changing" variant="plain" onClick={onClose}>
          Cancel
        </Btn>
        <Btn tip="Go away with this message" type="submit" variant="red" disabled={busy}>
          {busy ? 'Saving…' : 'Go away'}
        </Btn>
      </div>
    </form>
  )
}
