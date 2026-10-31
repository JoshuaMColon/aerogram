/** Pure helpers for the instant-messenger layer: buddy states, smileys, typing, windows. */
import type { BuddyGroup, BuddyListData, BuddyState, MsgStyle, PresenceMeta, Profile, StyleColor } from './types'

/* ------------------------------------------------------------------ screen names */

export const SCREEN_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,19}$/
export function screenNameError(raw: string): string | null {
  const s = raw.trim()
  if (s.length < 3) return 'At least 3 characters.'
  if (s.length > 20) return 'At most 20 characters.'
  if (!SCREEN_NAME_RE.test(s)) return 'Start with a letter or number; use letters, numbers, spaces, dots, dashes or underscores.'
  return null
}

/* ------------------------------------------------------------------ presence + idle */

export const IDLE_AFTER_MS = 5 * 60_000

export interface Live {
  state: BuddyState
  away: string | null
  idleSince: string | null
}

/**
 * Work out what a buddy is doing right now. Presence meta (live) wins over the stored profile;
 * bots are always signed on and keep whatever status their profile row says.
 */
export function buddyLive(p: Pick<Profile, 'is_bot' | 'status' | 'away_message' | 'idle_since'> | undefined, meta: PresenceMeta | undefined): Live {
  const src = meta ?? (p?.is_bot ? { status: p.status, away: p.away_message, idle_since: p.idle_since } : undefined)
  if (!src) return { state: 'offline', away: null, idleSince: null }
  const away = src.status === 'away' ? (src.away ?? '') : null
  const idleSince = src.idle_since ?? null
  return { state: away !== null ? 'away' : idleSince ? 'idle' : 'online', away, idleSince }
}

export function idleText(since: string, now = Date.now()) {
  const m = Math.max(1, Math.floor((now - new Date(since).getTime()) / 60_000))
  if (m < 60) return `Idle ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `Idle ${h}h ${m % 60}m`
  return `Idle ${Math.floor(h / 24)}d`
}

export function lastSeenText(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'Signed off'
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'Signed off just now'
  if (m < 60) return `Signed off ${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `Signed off ${h}h ago`
  return `Signed off ${Math.floor(h / 24)}d ago`
}

/** The little line under a screen name in the buddy list. */
/** `viewer` fills in %n/%t in an away message, the way AIM showed it to whoever was looking. */
export function statusLine(live: Live, p: Pick<Profile, 'bio' | 'last_seen_at'> | undefined, now = Date.now(), viewer: string | null = null) {
  if (live.state === 'away') return live.away ? `Away: ${firstLine(expandAway(live.away, viewer, new Date(now)))}` : 'Away'
  if (live.state === 'idle' && live.idleSince) return idleText(live.idleSince, now)
  if (live.state === 'offline') return lastSeenText(p?.last_seen_at, now)
  return p?.bio ? firstLine(p.bio) : 'Online'
}

function firstLine(s: string) {
  const l = s.split('\n')[0].trim()
  return l.length > 60 ? `${l.slice(0, 59)}…` : l
}

/* ------------------------------------------------------------------ buddy list */

export interface Section {
  id: string
  name: string
  online: number
  total: number
  people: { id: string; live: Live }[]
  /** Real groups can be renamed/deleted and accept drops; the Offline section can't. */
  group: BuddyGroup | null
}

const RANK: Record<BuddyState, number> = { online: 0, idle: 1, away: 2, offline: 3 }

/**
 * Turn the stored list into sections: each group shows its signed-on buddies (online, then idle,
 * then away, alphabetical within), and everyone signed off collects in a final Offline group.
 * Counts are "online/total" like the classics.
 */
export function buildSections(list: BuddyListData, liveOf: (id: string) => Live, nameOf: (id: string) => string): Section[] {
  const groups = [...list.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const offline: { id: string; live: Live }[] = []
  const sections: Section[] = groups.map((g) => {
    const members = list.buddies.filter((b) => b.group_id === g.id).map((b) => ({ id: b.buddy, live: liveOf(b.buddy) }))
    const on = members.filter((m) => m.live.state !== 'offline')
    offline.push(...members.filter((m) => m.live.state === 'offline'))
    on.sort((a, b) => RANK[a.live.state] - RANK[b.live.state] || nameOf(a.id).localeCompare(nameOf(b.id), undefined, { sensitivity: 'base' }))
    return { id: g.id, name: g.name, online: on.length, total: members.length, people: on, group: g }
  })
  offline.sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), undefined, { sensitivity: 'base' }))
  sections.push({ id: 'offline', name: 'Offline', online: 0, total: offline.length, people: offline, group: null })
  return sections
}

/** Sign-on / sign-off diff between two presence snapshots (buddies only). */
export function presenceDiff(prev: ReadonlySet<string>, next: ReadonlySet<string>, buddies: ReadonlySet<string>) {
  const on: string[] = []
  const off: string[] = []
  for (const id of next) if (!prev.has(id) && buddies.has(id)) on.push(id)
  for (const id of prev) if (!next.has(id) && buddies.has(id)) off.push(id)
  return { on, off }
}

/* ------------------------------------------------------------------ away messages */

export const DEFAULT_AWAYS = [
  "I'm away from my computer right now.",
  'brb, microwaving a burrito 🌯',
  'Out living my best life. Leave a msg!',
  'In class. Do not disturb unless it’s about snacks.',
  'Sleeping. Probably. zzz',
  "Can't talk, the dial-up is screaming.",
]

/**
 * Expand %n (the person being answered) and %t (time) like old clients did. New auto responses
 * already have %n filled in by the database; this covers older ones. Pass null when the viewer is the
 * away person themself, so they never see their own name in "Hi %n".
 */
export function expandAway(msg: string, toName: string | null, now = new Date()) {
  return msg.replaceAll('%n', toName ?? 'there').replaceAll('%t', now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
}

/* ------------------------------------------------------------------ typing */

export type TypingState = 'typing' | 'entered'

/** "Teo is typing..." beats "Teo has entered text" when several people are doing both. */
export function imTypingText(list: { name: string; state: TypingState }[]) {
  if (!list.length) return ''
  const typing = list.filter((t) => t.state === 'typing').map((t) => t.name)
  const entered = list.filter((t) => t.state === 'entered').map((t) => t.name)
  if (typing.length === 1 && !entered.length) return `${typing[0]} is typing...`
  if (!typing.length && entered.length === 1) return `${entered[0]} has entered text.`
  const names = [...typing, ...entered]
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more are typing...`
}

/** Composer: what to broadcast for the given text and time since the last keystroke. */
export function typingStateFor(text: string, sinceKeyMs: number): TypingState | null {
  if (!text.trim()) return null
  return sinceKeyMs >= 3000 ? 'entered' : 'typing'
}

/* ------------------------------------------------------------------ formatting + smileys */

export const STYLE_COLORS: StyleColor[] = ['red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink']

export function styleClass(s: MsgStyle | null | undefined) {
  if (!s) return ''
  return [s.b && 'font-bold', s.i && 'italic', s.u && 'underline underline-offset-2', s.color && `fmt-${s.color}`, s.size === 's' ? 'text-[0.8em]' : s.size === 'l' ? 'text-[1.3em] leading-snug' : '']
    .filter(Boolean)
    .join(' ')
}

/** Only send a style object when something is set, so plain messages stay plain. */
export function cleanStyle(s: MsgStyle): MsgStyle | null {
  const out: MsgStyle = {}
  if (s.b) out.b = true
  if (s.i) out.i = true
  if (s.u) out.u = true
  if (s.color && STYLE_COLORS.includes(s.color)) out.color = s.color
  if (s.size === 's' || s.size === 'l') out.size = s.size
  return Object.keys(out).length ? out : null
}

export type SmileyId = 'smile' | 'wink' | 'grin' | 'tongue' | 'frown' | 'gasp' | 'cool' | 'kiss' | 'heart' | 'cry' | 'angry' | 'meh' | 'blush' | 'angel'
export const SMILEYS: { id: SmileyId; code: string; alt: string[]; label: string }[] = [
  { id: 'smile', code: ':)', alt: [':-)'], label: 'Smile' },
  { id: 'wink', code: ';)', alt: [';-)'], label: 'Wink' },
  { id: 'grin', code: ':D', alt: [':-D'], label: 'Big grin' },
  { id: 'tongue', code: ':P', alt: [':-P', ':p', ':-p'], label: 'Sticking out tongue' },
  { id: 'frown', code: ':(', alt: [':-('], label: 'Frown' },
  { id: 'gasp', code: ':O', alt: [':-O', ':o', ':-o'], label: 'Surprised' },
  { id: 'cool', code: 'B)', alt: ['B-)', '8-)'], label: 'Cool' },
  { id: 'kiss', code: ':*', alt: [':-*'], label: 'Kiss' },
  { id: 'heart', code: '<3', alt: [], label: 'Heart' },
  { id: 'cry', code: ":'(", alt: [], label: 'Crying' },
  { id: 'angry', code: '>:(', alt: [], label: 'Angry' },
  { id: 'meh', code: ':/', alt: [':-/'], label: 'Undecided' },
  { id: 'blush', code: ':$', alt: [':-$'], label: 'Embarrassed' },
  { id: 'angel', code: 'O:)', alt: ['O:-)'], label: 'Innocent' },
]

const CODE_TO_ID = new Map<string, SmileyId>()
for (const s of SMILEYS) for (const c of [s.code, ...s.alt]) CODE_TO_ID.set(c, s.id)
const CODES = [...CODE_TO_ID.keys()].sort((a, b) => b.length - a.length)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A code counts only when it stands alone (start/space before, end/space/punctuation after), so
// URLs like http://x and times like 10:30 aren't turned into faces.
const SMILEY_RE = new RegExp(`(^|\\s)(${CODES.map(esc).join('|')})(?=$|\\s|[.,!?])`, 'g')

export type Piece = { text: string } | { smiley: SmileyId; code: string }

export function splitSmileys(text: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  for (const m of text.matchAll(SMILEY_RE)) {
    const start = m.index! + m[1].length
    if (start > last) out.push({ text: text.slice(last, start) })
    out.push({ smiley: CODE_TO_ID.get(m[2])!, code: m[2] })
    last = start + m[2].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/* ------------------------------------------------------------------ windows */

export interface WinBox {
  x: number
  y: number
  w: number
  h: number
}
export const WIN_W = 400
export const WIN_H = 540

/** Cascade new windows from the top-left of the free area, wrapping before they fall off-screen. */
export function cascade(index: number, area: { x: number; w: number; h: number }): WinBox {
  const w = Math.min(WIN_W, area.w - 16)
  const h = Math.min(WIN_H, area.h - 16)
  const n = index % 8
  const lane = Math.floor(index / 8) % 3
  return { x: Math.round(area.x + 16 + n * 30 + lane * 60), y: Math.round(16 + n * 30), w, h }
}

/** Keep a window's title bar reachable after a drag or a viewport resize. */
export function clampBox(b: WinBox, view: { w: number; h: number }): WinBox {
  const w = Math.min(b.w, view.w - 8)
  const h = Math.min(b.h, view.h - 8)
  return { w, h, x: Math.round(Math.max(4 - w + 120, Math.min(view.w - 120, b.x))), y: Math.round(Math.max(4, Math.min(view.h - 44, b.y))) }
}
