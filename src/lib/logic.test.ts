import { describe, expect, it } from 'vitest'
import {
  bumpRoom,
  groupMessages,
  initials,
  isEmojiOnly,
  lastOwnMessage,
  linkify,
  liveTypists,
  markFailed,
  mergeMessages,
  readersOf,
  roomIdFromTopic,
  roomTopic,
  safeFileName,
  storagePath,
  toggleReaction,
  totalUnread,
  typingText,
  validateFile,
} from './logic'
import type { Member, Message, RoomSummary } from './types'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const ROOM = '33333333-3333-4333-8333-333333333333'

function msg(id: string, user: string, at: string, extra: Partial<Message> = {}): Message {
  return { id, room_id: ROOM, user_id: user, body: id, attachment: null, reactions: {}, created_at: at, edited_at: null, deleted_at: null, ...extra }
}

describe('mergeMessages', () => {
  it('replaces an optimistic message with its server echo instead of duplicating it', () => {
    const local = [msg('a', A, '2026-10-31T10:00:00.000Z'), msg('b', A, '2026-10-31T10:00:05.000Z', { pending: true, localUrl: 'blob:x' })]
    const out = mergeMessages(local, [msg('b', A, '2026-10-31T10:00:04.500Z')])
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
    expect(out[1].pending).toBe(false)
    expect(out[1].created_at).toBe('2026-10-31T10:00:04.500Z')
    expect(out[1].localUrl).toBe('blob:x')
  })
  it('keeps history sorted when older pages arrive', () => {
    const out = mergeMessages([msg('c', A, '2026-10-31T10:00:00Z')], [msg('a', B, '2026-10-30T09:00:00Z'), msg('b', B, '2026-10-30T09:01:00Z')])
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
  it('marks a failed send', () => {
    const out = markFailed([msg('a', A, '2026-10-31T10:00:00Z', { pending: true })], 'a', 'offline')
    expect(out[0]).toMatchObject({ pending: false, failed: 'offline' })
  })
})

describe('groupMessages', () => {
  it('adds day dividers and groups runs by author within five minutes', () => {
    const now = new Date('2026-10-31T15:00:00')
    const rows = groupMessages(
      [
        msg('1', A, new Date('2026-10-30T09:00:00').toISOString()),
        msg('2', A, new Date('2026-10-31T09:00:00').toISOString()),
        msg('3', A, new Date('2026-10-31T09:02:00').toISOString()),
        msg('4', A, new Date('2026-10-31T09:20:00').toISOString()),
        msg('5', B, new Date('2026-10-31T09:21:00').toISOString()),
      ],
      now,
    )
    expect(rows.map((r) => (r.type === 'day' ? r.label : `${r.msg.id}${r.first ? 'F' : ''}${r.last ? 'L' : ''}`))).toEqual(['Yesterday', '1FL', 'Today', '2F', '3L', '4FL', '5FL'])
  })
})

describe('reactions', () => {
  it('toggles my reaction on and off and drops empty emoji', () => {
    const on = toggleReaction({ '👍': [B] }, '👍', A)
    expect(on['👍']).toEqual([B, A])
    expect(toggleReaction(on, '👍', A)).toEqual({ '👍': [B] })
    expect(toggleReaction({ '🎉': [A] }, '🎉', A)).toEqual({})
  })
})

describe('unread + receipts', () => {
  const room: RoomSummary = {
    id: ROOM,
    kind: 'public',
    slug: 'x',
    name: 'X',
    topic: '',
    is_seed: false,
    last_message_at: '2026-10-31T09:00:00Z',
    last_read_at: '2026-10-31T09:00:00Z',
    unread: 0,
    last_body: 'hi',
    last_user: B,
    last_has_file: false,
    last_deleted: false,
    dm_user: null,
  }
  it('counts messages from others in rooms that are not open', () => {
    const m = msg('n', B, '2026-10-31T10:00:00Z')
    expect(bumpRoom([room], m, A, null)[0].unread).toBe(1)
    expect(bumpRoom([room], m, A, ROOM)[0].unread).toBe(0)
    expect(bumpRoom([room], { ...m, user_id: A }, A, null)[0].unread).toBe(0)
    expect(totalUnread([{ unread: 2 }, { unread: 5 }])).toBe(7)
  })
  it('moves the room to the top', () => {
    const other = { ...room, id: 'other' }
    expect(bumpRoom([other, room], msg('n', B, '2026-10-31T10:00:00Z'), A, null).map((r) => r.id)).toEqual([ROOM, 'other'])
  })
  it('finds who has read my last message', () => {
    const members: Member[] = [
      { id: 1, room_id: ROOM, user_id: A, joined_at: '', last_read_at: '2026-10-31T10:00:00Z' },
      { id: 2, room_id: ROOM, user_id: B, joined_at: '', last_read_at: '2026-10-31T10:00:01Z' },
    ]
    const mine = lastOwnMessage([msg('x', A, '2026-10-31T10:00:00Z'), msg('y', B, '2026-10-31T10:00:02Z')], A)!
    expect(mine.id).toBe('x')
    expect(readersOf(members, mine, A).map((m) => m.user_id)).toEqual([B])
    expect(readersOf(members, { ...mine, created_at: '2026-10-31T10:00:05Z' }, A)).toEqual([])
  })
})

describe('typing', () => {
  it('describes who is writing', () => {
    expect(typingText([])).toBe('')
    expect(typingText(['Pip'])).toBe('Pip is writing…')
    expect(typingText(['Pip', 'Hana'])).toBe('Pip and Hana are writing…')
    expect(typingText(['a', 'b', 'c', 'd'])).toBe('a, b and 2 more are writing…')
  })
  it('expires stale typists', () => {
    expect(liveTypists({ a: { name: 'A', at: 1000 }, b: { name: 'B', at: 4500 } }, 6000)).toEqual([{ id: 'b', name: 'B' }])
  })
})

describe('files', () => {
  it('enforces size and type limits', () => {
    expect(validateFile({ name: 'a.png', size: 1000, type: 'image/png' })).toBeNull()
    expect(validateFile({ name: 'big.png', size: 6 * 1024 * 1024, type: 'image/png' })).toMatch(/5 MB/)
    expect(validateFile({ name: 'x.exe', size: 10, type: 'application/x-msdownload' })).toMatch(/supported/)
    expect(validateFile({ name: 'e.txt', size: 0, type: 'text/plain' })).toMatch(/empty/)
  })
  it('builds safe storage paths scoped to room and user', () => {
    expect(safeFileName('My Résumé (final).PDF')).toBe('My-Resume-final.pdf')
    expect(safeFileName('../../etc/passwd')).toBe('passwd')
    expect(storagePath(ROOM, A, 'id', 'a b.png')).toBe(`${ROOM}/${A}/id-a-b.png`)
  })
})

describe('misc', () => {
  it('maps room ids to realtime topics and back', () => {
    expect(roomTopic(ROOM)).toBe(`chat:room:${ROOM}`)
    expect(roomIdFromTopic(`realtime:chat:room:${ROOM}`)).toBe(ROOM)
    expect(roomIdFromTopic('chat:room:nope')).toBeNull()
    expect(() => roomTopic('x')).toThrow()
  })
  it('makes initials', () => {
    expect(initials('Guest Kestrel')).toBe('GK')
    expect(initials('Pip')).toBe('PI')
    expect(initials('  ')).toBe('?')
  })
  it('linkifies without trailing punctuation', () => {
    expect(linkify('see https://example.com/a. ok')).toEqual([{ text: 'see ' }, { text: 'https://example.com/a', href: 'https://example.com/a' }, { text: '. ok' }])
  })
  it('detects emoji-only messages', () => {
    expect(isEmojiOnly('🎉')).toBe(true)
    expect(isEmojiOnly('👍🏽 ❤️')).toBe(true)
    expect(isEmojiOnly('ok 👍')).toBe(false)
  })
})
