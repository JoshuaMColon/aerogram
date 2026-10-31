import { describe, expect, it } from 'vitest'
import {
  buddyLive,
  buildSections,
  cascade,
  clampBox,
  cleanStyle,
  expandAway,
  idleText,
  imTypingText,
  lastSeenText,
  presenceDiff,
  screenNameError,
  splitSmileys,
  statusLine,
  styleClass,
  typingStateFor,
  type Live,
} from './im'
import type { BuddyListData } from './types'

const NOW = Date.parse('2026-10-31T16:00:00Z')
const meta = (o: object = {}) => ({ user_id: 'u', name: 'u', stamp: 0, online_at: '', ...o })

describe('screen names', () => {
  it('validates length and characters', () => {
    expect(screenNameError('ab')).toMatch(/3/)
    expect(screenNameError('x'.repeat(21))).toMatch(/20/)
    expect(screenNameError('_lead')).toMatch(/Start/)
    expect(screenNameError('xXSkaterHeronXx')).toBeNull()
    expect(screenNameError('  Sunset Rider.04 ')).toBeNull()
  })
})

describe('buddy state', () => {
  it('is offline without presence (unless a bot)', () => {
    expect(buddyLive({ is_bot: false, status: 'online', away_message: null, idle_since: null }, undefined).state).toBe('offline')
    expect(buddyLive({ is_bot: true, status: 'away', away_message: 'brb', idle_since: null }, undefined)).toEqual({ state: 'away', away: 'brb', idleSince: null })
  })
  it('prefers live meta: away beats idle beats online', () => {
    expect(buddyLive(undefined, meta()).state).toBe('online')
    expect(buddyLive(undefined, meta({ idle_since: '2026-10-31T15:48:00Z' })).state).toBe('idle')
    expect(buddyLive(undefined, meta({ status: 'away', away: 'lunch', idle_since: '2026-10-31T15:48:00Z' })).state).toBe('away')
  })
  it('formats idle and last-seen timers', () => {
    expect(idleText('2026-10-31T15:48:00Z', NOW)).toBe('Idle 12m')
    expect(idleText('2026-10-31T13:30:00Z', NOW)).toBe('Idle 2h 30m')
    expect(lastSeenText(null, NOW)).toBe('Signed off')
    expect(lastSeenText('2026-10-31T15:55:00Z', NOW)).toBe('Signed off 5m ago')
  })
  it('builds the status line', () => {
    const on: Live = { state: 'online', away: null, idleSince: null }
    expect(statusLine(on, { bio: 'hi\nthere', last_seen_at: null }, NOW)).toBe('hi')
    expect(statusLine({ state: 'away', away: 'at lunch', idleSince: null }, undefined, NOW)).toBe('Away: at lunch')
    expect(statusLine({ state: 'away', away: 'Hi %n!', idleSince: null }, undefined, NOW, 'Mara')).toBe('Away: Hi Mara!')
    expect(statusLine({ state: 'away', away: 'Hi %n!', idleSince: null }, undefined, NOW)).toBe('Away: Hi there!')
    expect(statusLine({ state: 'idle', away: null, idleSince: '2026-10-31T15:48:00Z' }, undefined, NOW)).toBe('Idle 12m')
  })
})

describe('buddy list sections', () => {
  const list: BuddyListData = {
    groups: [
      { id: 'g2', name: 'Family', sort: 2 },
      { id: 'g1', name: 'Buddies', sort: 1 },
    ],
    buddies: [
      { buddy: 'zed', group_id: 'g1' },
      { buddy: 'amy', group_id: 'g1' },
      { buddy: 'bob', group_id: 'g1' },
      { buddy: 'mom', group_id: 'g2' },
    ],
  }
  const states: Record<string, Live['state']> = { zed: 'online', amy: 'away', bob: 'offline', mom: 'offline' }
  const s = buildSections(
    list,
    (id) => ({ state: states[id], away: null, idleSince: null }),
    (id) => id,
  )
  it('orders groups, counts online/total, and collects offline', () => {
    expect(s.map((x) => [x.name, x.online, x.total])).toEqual([
      ['Buddies', 2, 3],
      ['Family', 0, 1],
      ['Offline', 0, 2],
    ])
    expect(s[0].people.map((p) => p.id)).toEqual(['zed', 'amy'])
    expect(s[2].people.map((p) => p.id)).toEqual(['bob', 'mom'])
    expect(s[2].group).toBeNull()
  })
  it('diffs sign-ons for buddies only', () => {
    expect(presenceDiff(new Set(['a', 'b']), new Set(['b', 'c', 'x']), new Set(['a', 'c']))).toEqual({ on: ['c'], off: ['a'] })
  })
})

describe('away + typing', () => {
  it('expands %n and %t', () => {
    expect(expandAway('Hi %n!', 'Teo')).toBe('Hi Teo!')
    expect(expandAway('Hi %n!', null)).toBe('Hi there!')
    expect(expandAway('back at %t', 'x', new Date(NOW))).not.toContain('%t')
  })
  it('words typing like the classics', () => {
    expect(imTypingText([])).toBe('')
    expect(imTypingText([{ name: 'Teo', state: 'typing' }])).toBe('Teo is typing...')
    expect(imTypingText([{ name: 'Teo', state: 'entered' }])).toBe('Teo has entered text.')
    expect(
      imTypingText([
        { name: 'A', state: 'entered' },
        { name: 'B', state: 'typing' },
      ]),
    ).toBe('B and A are typing...')
    expect(typingStateFor('  ', 0)).toBeNull()
    expect(typingStateFor('hi', 500)).toBe('typing')
    expect(typingStateFor('hi', 3500)).toBe('entered')
  })
})

describe('formatting + smileys', () => {
  it('keeps only real styles', () => {
    expect(cleanStyle({})).toBeNull()
    expect(cleanStyle({ b: true, color: 'nope' as never, size: 'l' })).toEqual({ b: true, size: 'l' })
    expect(styleClass({ i: true, color: 'blue' })).toBe('italic fmt-blue')
  })
  it('splits smiley codes, longest first', () => {
    expect(splitSmileys('hi :-) ok :D')).toEqual([{ text: 'hi ' }, { smiley: 'smile', code: ':-)' }, { text: ' ok ' }, { smiley: 'grin', code: ':D' }])
    expect(splitSmileys('http://x.y')).toEqual([{ text: 'http://x.y' }])
  })
})

describe('windows', () => {
  it('cascades and wraps', () => {
    const a = cascade(0, { x: 300, w: 1000, h: 800 })
    const b = cascade(1, { x: 300, w: 1000, h: 800 })
    expect([b.x - a.x, b.y - a.y]).toEqual([30, 30])
    expect(cascade(8, { x: 300, w: 1000, h: 800 }).y).toBe(a.y)
  })
  it('keeps the title bar reachable', () => {
    const c = clampBox({ x: 5000, y: -50, w: 2000, h: 400 }, { w: 1200, h: 800 })
    expect(c.w).toBe(1192)
    expect(c.x).toBeLessThanOrEqual(1080)
    expect(c.y).toBe(4)
  })
})
