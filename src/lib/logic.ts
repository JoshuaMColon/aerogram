import type { Member, Message, Reactions, RoomSummary } from './types'

/* ------------------------------------------------------------------ timestamps */

/** PostgREST and Realtime format timestamps differently; normalise to ms ISO so strings compare. */
export function iso(t: string | null | undefined): string {
  return t ? new Date(t).toISOString() : (t as unknown as string)
}
export function normMessage(m: Message): Message {
  return { ...m, created_at: iso(m.created_at), edited_at: m.edited_at && iso(m.edited_at), deleted_at: m.deleted_at && iso(m.deleted_at), reactions: m.reactions ?? {} }
}
export function normMember(m: Member): Member {
  return { ...m, joined_at: iso(m.joined_at), last_read_at: iso(m.last_read_at) }
}
export function normRoom(r: RoomSummary): RoomSummary {
  return { ...r, last_message_at: iso(r.last_message_at), last_read_at: iso(r.last_read_at) }
}
/** Read marker for a message: 1 ms past it, since server times have microseconds. */
export function readMark(m: Pick<Message, 'created_at'>) {
  return new Date(+new Date(m.created_at) + 1).toISOString()
}

/* ------------------------------------------------------------------ messages */

export function byTime(a: Pick<Message, 'created_at' | 'id'>, b: Pick<Message, 'created_at' | 'id'>) {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Merge server rows into the local list. Rows are keyed by id, and ids are generated on the client
 * for sends, so the realtime echo of an optimistic message replaces it instead of duplicating it.
 * A local image preview is kept until the signed URL takes over.
 */
export function mergeMessages(list: Message[], incoming: Message[]): Message[] {
  if (!incoming.length) return list
  const map = new Map(list.map((m) => [m.id, m]))
  for (const m of incoming) {
    const prev = map.get(m.id)
    map.set(m.id, prev ? { ...prev, ...m, pending: false, failed: undefined, localUrl: prev.localUrl } : m)
  }
  return [...map.values()].sort(byTime)
}

export function markFailed(list: Message[], id: string, error: string): Message[] {
  return list.map((m) => (m.id === id ? { ...m, pending: false, failed: error } : m))
}

export function removeMessage(list: Message[], id: string): Message[] {
  return list.filter((m) => m.id !== id)
}

/** Toggle my reaction locally (optimistic); the server returns the authoritative map. */
export function toggleReaction(r: Reactions, emoji: string, me: string): Reactions {
  const users = r[emoji] ?? []
  const next = { ...r }
  if (users.includes(me)) {
    const left = users.filter((u) => u !== me)
    if (left.length) next[emoji] = left
    else delete next[emoji]
  } else next[emoji] = [...users, me]
  return next
}

export type Row = { type: 'day'; key: string; label: string } | { type: 'msg'; key: string; msg: Message; first: boolean; last: boolean }

const GROUP_GAP_MS = 5 * 60 * 1000

/** Insert day dividers and mark runs of messages from the same person (within 5 minutes). */
export function groupMessages(list: Message[], now = new Date()): Row[] {
  const rows: Row[] = []
  let prev: Message | null = null
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    const d = new Date(m.created_at)
    const dayKey = localDay(d)
    if (!prev || localDay(new Date(prev.created_at)) !== dayKey) {
      const tail = rows[rows.length - 1]
      if (tail?.type === 'msg') tail.last = true
      rows.push({ type: 'day', key: `day-${dayKey}`, label: dayLabel(d, now) })
      prev = null
    }
    const first = !prev || prev.user_id !== m.user_id || +d - +new Date(prev.created_at) > GROUP_GAP_MS
    if (first && rows.length) {
      const last = rows[rows.length - 1]
      if (last.type === 'msg') last.last = true
    }
    rows.push({ type: 'msg', key: m.id, msg: m, first, last: false })
    prev = m
  }
  const tail = rows[rows.length - 1]
  if (tail?.type === 'msg') tail.last = true
  return rows
}

export function localDay(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function dayLabel(d: Date, now = new Date()) {
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (localDay(d) === localDay(now)) return 'Today'
  if (localDay(d) === localDay(y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

/** "10:42" style postmark time. */
export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Short relative time for the sidebar: "now", "5m", "3h", "Tue", "Oct 2". */
export function shortAgo(iso: string, now = new Date()) {
  const d = new Date(iso)
  const s = (+now - +d) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 6 * 86400) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ------------------------------------------------------------------ unread + receipts */

export function totalUnread(rooms: Pick<RoomSummary, 'unread'>[]) {
  return rooms.reduce((n, r) => n + r.unread, 0)
}

/** Bump a room for a newly arrived message: preview, ordering and (if it isn't open) unread. */
export function bumpRoom(rooms: RoomSummary[], m: Message, me: string, openRoom: string | null): RoomSummary[] {
  const i = rooms.findIndex((r) => r.id === m.room_id)
  if (i < 0) return rooms
  const r = rooms[i]
  if (m.created_at < r.last_message_at && r.last_user !== null) return rooms
  const mine = m.user_id === me
  const next: RoomSummary = {
    ...r,
    last_message_at: m.created_at,
    last_body: m.body.slice(0, 140),
    last_user: m.user_id,
    last_has_file: !!m.attachment,
    last_deleted: !!m.deleted_at,
    unread: mine || openRoom === m.room_id ? r.unread : Math.min(99, r.unread + 1),
    last_read_at: mine ? m.created_at : r.last_read_at,
  }
  return [next, ...rooms.slice(0, i), ...rooms.slice(i + 1)]
}

/** Other members who have read up to (or past) this message. */
export function readersOf(members: Member[], msg: Pick<Message, 'created_at' | 'user_id'>, me: string) {
  return members.filter((m) => m.user_id !== me && m.user_id !== msg.user_id && m.last_read_at >= msg.created_at)
}

/** My last delivered message (the one the receipt line hangs under). */
export function lastOwnMessage(list: Message[], me: string) {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (m.user_id === me && !m.pending && !m.failed && !m.deleted_at) return m
  }
  return null
}

/* ------------------------------------------------------------------ typing */

export function typingText(names: string[]) {
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is writing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are writing…`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more are writing…`
}

/** Drop typists we haven't heard from recently (broadcasts repeat every ~2 s while typing). */
export function liveTypists(map: Record<string, { name: string; at: number }>, now = Date.now(), ttl = 4000) {
  return Object.entries(map)
    .filter(([, v]) => now - v.at < ttl)
    .map(([id, v]) => ({ id, name: v.name }))
}

/* ------------------------------------------------------------------ files */

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const FILE_TYPES = [...IMAGE_TYPES, 'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/zip', 'application/json']
export const ACCEPT = FILE_TYPES.join(',')

export function validateFile(f: { name: string; size: number; type: string }): string | null {
  if (!f.size) return 'That file is empty.'
  if (f.size > MAX_FILE_BYTES) return `“${f.name}” is ${formatBytes(f.size)}. The limit is 5 MB.`
  if (!FILE_TYPES.includes(f.type)) return `“${f.name}” isn’t a supported type. Images, PDF, text, CSV, Markdown, JSON or ZIP only.`
  return null
}

export function isImage(mime: string) {
  return IMAGE_TYPES.includes(mime)
}

export function safeFileName(raw: string) {
  const name = raw.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  const stem =
    (dot > 0 ? name.slice(0, dot) : name)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file'
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 8)
      : ''
  return ext ? `${stem}.${ext}` : stem
}

export function storagePath(room: string, user: string, id: string, name: string) {
  return `${room}/${user}/${id}-${safeFileName(name)}`
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/* ------------------------------------------------------------------ misc */

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const a = [...parts[0]][0] ?? ''
  const b = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : ([...parts[0]][1] ?? '')
  return (a + b).toUpperCase()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isUuid(s: string | null | undefined): s is string {
  return !!s && UUID.test(s)
}

/** Realtime topic for a room's private typing channel (mirrors chat.can_use_topic in SQL). */
export function roomTopic(roomId: string) {
  if (!isUuid(roomId)) throw new Error('Bad room id')
  return `chat:room:${roomId}`
}

export function roomIdFromTopic(topic: string) {
  const m = /^(?:realtime:)?chat:room:(.+)$/.exec(topic)
  return m && isUuid(m[1]) ? m[1] : null
}

/** Split text into plain runs and http(s) links (rendered as anchors, never as HTML). */
export function linkify(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = []
  const re = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’]/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], href: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** Messages that are only 1 to 3 emoji are shown large. */
export function isEmojiOnly(s: string) {
  const t = s.trim()
  if (!t || t.length > 24) return false
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const parts = [...seg.segment(t)].map((p) => p.segment).filter((p) => p.trim())
  return parts.length <= 3 && parts.every((p) => /\p{Extended_Pictographic}/u.test(p))
}
