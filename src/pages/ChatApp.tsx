import { useEffect, useState } from 'react'
import { Compass, PenLine } from 'lucide-react'
import { BrowseDialog, NewDmDialog, NewRoomDialog, PeopleDialog, ProfileDialog } from '../components/Dialogs'
import { RoomView } from '../components/RoomView'
import { Sidebar, type DialogKind } from '../components/Sidebar'
import { Btn, LinkBtn } from '../components/ui'
import { isUuid } from '../lib/logic'
import type { Member, RoomSummary } from '../lib/types'
import { useAuth } from '../state/auth'
import { ChatProvider, useChat } from '../state/chat'
import { supabase } from '../lib/supabase'
import { navigate } from '../router'

function Shell({ roomId }: { roomId: string | null }) {
  const { isGuest } = useAuth()
  const { rooms, roomsLoaded, setOpenRoom } = useChat()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [people, setPeople] = useState<{ room: RoomSummary; members: Member[] } | null>(null)
  const room = rooms.find((r) => r.id === roomId) ?? null

  useEffect(() => {
    setOpenRoom(room ? room.id : null)
    return () => setOpenRoom(null)
  }, [room?.id, setOpenRoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: land in the lobby rather than an empty pane.
  useEffect(() => {
    if (!roomId && roomsLoaded && rooms.length && matchMedia('(min-width: 768px)').matches) navigate(`/app/r/${(rooms.find((r) => r.slug === 'the-lobby') ?? rooms[0]).id}`, true)
    if (roomId && roomsLoaded && !room) navigate('/app', true)
  }, [roomId, roomsLoaded, rooms, room])

  const close = () => setDialog(null)
  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      {isGuest && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-ink px-3 py-1.5 text-center text-xs text-paper">
          <span>
            You’re on a <b>guest pass</b>: everything here is cleared after a day.
          </span>
          <a href="/login?mode=signup" className="press font-semibold underline underline-offset-2" title="Create a free account">
            Keep your letters →
          </a>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className={`${room ? 'hidden md:flex' : 'flex'} min-h-0 w-full md:w-auto`}>
          <Sidebar activeId={room?.id ?? null} open={setDialog} />
        </div>
        <main className={`${room ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
          {room ? (
            <RoomView key={room.id} room={room} onPeople={(r, members) => setPeople({ room: r, members })} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <p className="font-display text-2xl font-semibold">Pick a room or write a letter</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Btn tip="Browse public rooms" variant="ghost" onClick={() => setDialog('browse')}>
                    <Compass size={16} aria-hidden="true" /> Browse rooms
                  </Btn>
                  <Btn tip="Write a direct letter" variant="red" onClick={() => setDialog('new-dm')}>
                    <PenLine size={16} aria-hidden="true" /> New letter
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      <NewRoomDialog open={dialog === 'new-room'} onClose={close} />
      <BrowseDialog open={dialog === 'browse'} onClose={close} onCreate={() => setDialog('new-room')} />
      <NewDmDialog open={dialog === 'new-dm'} onClose={close} />
      <ProfileDialog open={dialog === 'profile'} onClose={close} />
      <PeopleDialog room={people?.room ?? null} members={people?.members ?? []} onClose={() => setPeople(null)} />
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
      <Center title="Couldn’t open your mailbox" body={profileError}>
        <Btn tip="Sign out and start again" variant="ghost" onClick={() => signOut().then(() => navigate('/'))}>
          Sign out
        </Btn>
      </Center>
    )
  if (!ready || !session || !profile) return <Center title="Sorting the post…" body="Connecting to Aerogram." spinner />
  return (
    <ChatProvider db={supabase} me={profile}>
      <Shell roomId={isUuid(roomId) ? roomId : null} />
    </ChatProvider>
  )
}

function Center({ title, body, spinner, children }: { title: string; body: string; spinner?: boolean; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper p-6 text-center text-ink">
      <div>
        {spinner && <div className="airmail mx-auto mb-4 h-2 w-24 animate-pulse rounded-full" aria-hidden="true" />}
        <p className="font-display text-2xl font-semibold" role={spinner ? 'status' : 'alert'}>
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
