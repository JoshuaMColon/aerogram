import { describe, expect, it } from 'vitest'
import { PRESETS, contrast, randomSkin, resolveSkin, sanitizeSkin, switchPreset, withChange, type Skin } from './skins'

const surfaces = (v: Record<string, string>) => [v['--paper'], v['--paper-hi'], v['--card'], v['--sunk'], v['--mine']]
const TEXT = ['--ink', '--muted', '--blue', '--red', '--brass', '--good', '--bad', '--s-red', '--s-blue', '--s-green']

function checkReadable(skin: Skin) {
  const r = resolveSkin(skin)
  const v = r.vars
  for (const t of TEXT) for (const bg of surfaces(v)) expect(contrast(v[t], bg), `${skin.preset} ${skin.accent} ${t} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  expect(contrast(v['--on-accent'], v['--blue'])).toBeGreaterThanOrEqual(4.5)
  expect(contrast(v['--title-ink'], v['--title-a'])).toBeGreaterThanOrEqual(4.5)
  expect(contrast(v['--title-ink'], v['--title-b'])).toBeGreaterThanOrEqual(4.5)
}

describe('skins', () => {
  it('ships eight presets with Chrome and Midnight as defaults', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['chrome', 'midnight', 'terminal', 'arcade', 'classic', 'ocean', 'sunset', 'daydream'])
    expect(PRESETS[0].palette.mode).toBe('light')
    expect(PRESETS[1].palette.mode).toBe('dark')
  })

  it('keeps every preset readable', () => {
    for (const p of PRESETS) checkReadable({ v: 1, preset: p.id })
  })

  it('keeps text readable whatever accent or wallpaper is picked', () => {
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 300; i++) checkReadable(randomSkin({ v: 1, preset: 'chrome' }, rand))
    for (const accent of ['#ffffff', '#000000', '#ffff00', '#00ff00', '#7f7f7f', '#ff00ff']) for (const p of PRESETS) checkReadable({ v: 1, preset: p.id, accent })
  })

  it('sanitizes untrusted input', () => {
    expect(sanitizeSkin(null)).toBeNull()
    expect(sanitizeSkin({ preset: 'nope' })).toBeNull()
    expect(sanitizeSkin({ v: 1, preset: 'arcade', accent: 'red;}body{', wall: '#ABCDEF', radius: 9, font: '<script>', bubble: 'cards', evil: 1 })).toEqual({
      v: 1,
      preset: 'arcade',
      wall: '#abcdef',
      radius: 2,
      bubble: 'cards',
    })
  })

  it('stores only overrides and keeps comfort settings across presets', () => {
    const s = withChange({ v: 1, preset: 'chrome' }, { accent: '#1767db', size: 'lg' })
    expect(s).toEqual({ v: 1, preset: 'chrome', size: 'lg' })
    expect(switchPreset({ ...s, accent: '#123456', density: 'roomy' }, 'terminal')).toEqual({ v: 1, preset: 'terminal', size: 'lg', density: 'roomy' })
  })

  it('randomize keeps text size and density', () => {
    const r = randomSkin({ v: 1, preset: 'chrome', size: 'xl', density: 'compact' })
    expect(r.size).toBe('xl')
    expect(r.density).toBe('compact')
    expect(sanitizeSkin(r)).toEqual(r)
  })
})
