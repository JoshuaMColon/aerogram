/**
 * Buddyline skins: built-in presets plus per-user overrides, resolved into CSS custom properties.
 * Every text color is pushed until it meets WCAG AA (4.5:1) against the surfaces it sits on, so any
 * accent or wallpaper a person picks stays readable.
 */

/* ------------------------------------------------------------------ color math */

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function rgbToHex([r, g, b]: RGB) {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
/** Mix `a` toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const minContrast = (fg: string, bgs: string[]) => Math.min(...bgs.map((b) => contrast(fg, b)))

/** Nudge `fg` toward black or white (whichever the backgrounds call for) until it reads at `ratio` on all of them. */
export function readable(fg: string, bgs: string[], ratio = 4.5) {
  if (minContrast(fg, bgs) >= ratio) return fg
  const avg = bgs.reduce((n, b) => n + luminance(b), 0) / bgs.length
  const target = avg > 0.18 ? '#000000' : '#ffffff'
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(fg, target, t)
    if (minContrast(c, bgs) >= ratio) return c
  }
  // Unreachable on these backgrounds: take whichever extreme reads best.
  return minContrast('#000000', bgs) >= minContrast('#ffffff', bgs) ? '#000000' : '#ffffff'
}
/** Black-ish or white ink, whichever reads better on every background. */
export function inkOn(bgs: string[]) {
  const dark = '#0b0f14'
  return minContrast('#ffffff', bgs) >= minContrast(dark, bgs) ? '#ffffff' : dark
}
export function hslToHex(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255])
}

/* ------------------------------------------------------------------ options */

export const BACKGROUNDS = [
  { id: 'solid', label: 'Solid', tip: 'A single flat wallpaper color' },
  { id: 'gradient', label: 'Gradient', tip: 'Soft glows blended across the desktop' },
  { id: 'dots', label: 'Dots', tip: 'A fine dot grid over the wallpaper' },
  { id: 'grid', label: 'Grid', tip: 'Graph-paper lines over the wallpaper' },
  { id: 'stripes', label: 'Stripes', tip: 'Diagonal pinstripes' },
  { id: 'scanlines', label: 'Scanlines', tip: 'CRT-style horizontal scanlines' },
] as const
export const CHROMES = [
  { id: 'glossy', label: 'Glossy', tip: 'Gel title bars and jelly buttons with a shine' },
  { id: 'flat', label: 'Flat', tip: 'Clean flat surfaces, no shine' },
  { id: 'bevel', label: 'Bevel', tip: 'Chunky 3D edges like a 90s desktop' },
] as const
export const FONTS = [
  { id: 'clean', label: 'Inter', stack: "'Inter Variable', system-ui, sans-serif", tip: 'Crisp and neutral' },
  { id: 'rounded', label: 'Nunito', stack: "'Nunito Variable', system-ui, sans-serif", tip: 'Soft and friendly' },
  { id: 'grotesk', label: 'Space Grotesk', stack: "'Space Grotesk Variable', system-ui, sans-serif", tip: 'Quirky geometric' },
  { id: 'tech', label: 'Chakra Petch', stack: "'Chakra Petch', system-ui, sans-serif", tip: 'Angular, Y2K techno' },
  { id: 'mono', label: 'Plex Mono', stack: "'IBM Plex Mono', ui-monospace, monospace", tip: 'Monospaced terminal type' },
  { id: 'system', label: 'System', stack: "Tahoma, Verdana, 'Segoe UI', system-ui, sans-serif", tip: 'Your device’s own UI font' },
] as const
export const SIZES = [
  { id: 'sm', label: 'S', px: 14, tip: 'Small text' },
  { id: 'md', label: 'M', px: 16, tip: 'Medium text (default)' },
  { id: 'lg', label: 'L', px: 17.5, tip: 'Large text' },
  { id: 'xl', label: 'XL', px: 19, tip: 'Extra large text' },
] as const
export const DENSITIES = [
  { id: 'compact', label: 'Compact', tip: 'Tighter rows: more buddies and messages on screen' },
  { id: 'cozy', label: 'Cozy', tip: 'Balanced spacing (default)' },
  { id: 'roomy', label: 'Roomy', tip: 'Extra breathing room between rows' },
] as const
export const BUBBLES = [
  { id: 'classic', label: 'Classic', tip: 'Transcript lines: “Name (time): message”' },
  { id: 'bubbles', label: 'Bubbles', tip: 'Chat bubbles, yours on the right' },
  { id: 'cards', label: 'Cards', tip: 'Each message in a card with a colored edge' },
] as const
export const ICON_SHAPES = [
  { id: 'rounded', label: 'Rounded', tip: 'Rounded-square buddy icons' },
  { id: 'circle', label: 'Circle', tip: 'Round buddy icons' },
  { id: 'square', label: 'Square', tip: 'Square buddy icons' },
] as const

type Ids<T extends readonly { id: string }[]> = T[number]['id']
export type Bg = Ids<typeof BACKGROUNDS>
export type Chrome = Ids<typeof CHROMES>
export type Font = Ids<typeof FONTS>
export type Size = Ids<typeof SIZES>
export type Density = Ids<typeof DENSITIES>
export type Bubble = Ids<typeof BUBBLES>
export type IconShape = Ids<typeof ICON_SHAPES>

export interface Look {
  accent: string
  wall: string
  bg: Bg
  chrome: Chrome
  /** Corner roundness multiplier, 0 (square) to 2 (extra round). */
  radius: number
  font: Font
  size: Size
  density: Density
  bubble: Bubble
  icon: IconShape
}

interface Palette {
  mode: 'light' | 'dark'
  paper: string
  paperHi: string
  card: string
  sunk: string
  ink: string
  muted: string
  line: string
  edge: string
  accent2: string
  /** Wallpaper stops for the gradient (the middle one is the base color). */
  wall: [string, string, string]
  /** Title bar gradient; when omitted it is made from the accent. */
  title?: [string, string]
}

export interface Preset {
  id: string
  name: string
  blurb: string
  palette: Palette
  look: Look
}

const base = { size: 'md', density: 'cozy' } as const

export const PRESETS: Preset[] = [
  {
    id: 'chrome',
    name: 'Chrome',
    blurb: 'Brushed graphite and steel with a crisp electric blue. The default.',
    palette: {
      mode: 'light',
      paper: '#e2e6eb',
      paperHi: '#fbfcfd',
      card: '#f2f4f7',
      sunk: '#e7eaef',
      ink: '#11161d',
      muted: '#4a5463',
      line: '#c8cfd8',
      edge: '#8a94a2',
      accent2: '#0a7f86',
      wall: ['#eef1f4', '#cdd4dc', '#b7c0cb'],
      title: ['#f6f8fa', '#b9c2cd'],
    },
    look: { ...base, accent: '#1767db', wall: '#cdd4dc', bg: 'gradient', chrome: 'glossy', radius: 0.85, font: 'clean', bubble: 'classic', icon: 'rounded' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Gunmetal glass after dark, with an ice-blue glow. The dark default.',
    palette: {
      mode: 'dark',
      paper: '#0d1117',
      paperHi: '#151b23',
      card: '#1b222c',
      sunk: '#10151c',
      ink: '#e8edf3',
      muted: '#9ba7b5',
      line: '#29323e',
      edge: '#4c5868',
      accent2: '#2fd2bd',
      wall: ['#1a2430', '#0e141b', '#070a0f'],
      title: ['#3b4757', '#1b232e'],
    },
    look: { ...base, accent: '#4aa3ff', wall: '#0e141b', bg: 'gradient', chrome: 'glossy', radius: 0.85, font: 'clean', bubble: 'classic', icon: 'rounded' },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    blurb: 'Phosphor green on black. Scanlines included, mouse optional.',
    palette: {
      mode: 'dark',
      paper: '#040805',
      paperHi: '#08100a',
      card: '#0c160f',
      sunk: '#060c07',
      ink: '#c9ffd6',
      muted: '#79c58f',
      line: '#173a22',
      edge: '#2e6c40',
      accent2: '#ffcc33',
      wall: ['#031006', '#010402', '#000000'],
      title: ['#123a1d', '#0a2211'],
    },
    look: { ...base, accent: '#39ff6a', wall: '#010402', bg: 'scanlines', chrome: 'flat', radius: 0, font: 'mono', bubble: 'classic', icon: 'square' },
  },
  {
    id: 'arcade',
    name: 'Arcade',
    blurb: 'Neon cyan and hot magenta over a synthwave grid.',
    palette: {
      mode: 'dark',
      paper: '#110626',
      paperHi: '#190b33',
      card: '#210f42',
      sunk: '#13072b',
      ink: '#f7eeff',
      muted: '#c3abe8',
      line: '#3b1f6b',
      edge: '#6b40b4',
      accent2: '#ff3fcf',
      wall: ['#2b0b4d', '#14052e', '#04122a'],
      title: ['#ff5fd8', '#7a1fd1'],
    },
    look: { ...base, accent: '#00e1ff', wall: '#14052e', bg: 'grid', chrome: 'glossy', radius: 0.5, font: 'tech', bubble: 'bubbles', icon: 'circle' },
  },
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Battleship-gray bevels and a teal desktop, straight out of 1998.',
    palette: {
      mode: 'light',
      paper: '#c0c0c0',
      paperHi: '#ffffff',
      card: '#d4d0c8',
      sunk: '#e6e6e6',
      ink: '#000000',
      muted: '#3a3a3a',
      line: '#808080',
      edge: '#404040',
      accent2: '#006a6a',
      wall: ['#139a9a', '#008080', '#006b6b'],
      title: ['#1084d0', '#000080'],
    },
    look: { ...base, accent: '#000080', wall: '#008080', bg: 'solid', chrome: 'bevel', radius: 0, font: 'system', bubble: 'classic', icon: 'square' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    blurb: 'Sea glass and deep teal, calm as a screensaver aquarium.',
    palette: {
      mode: 'light',
      paper: '#d9e9ee',
      paperHi: '#fbfeff',
      card: '#edf6f9',
      sunk: '#e0eef3',
      ink: '#0a232d',
      muted: '#3b5d69',
      line: '#b9d4dd',
      edge: '#6b94a3',
      accent2: '#0b8a77',
      wall: ['#c6ecf4', '#8fcfe0', '#4fa7c2'],
    },
    look: { ...base, accent: '#0a78a0', wall: '#8fcfe0', bg: 'gradient', chrome: 'glossy', radius: 1.25, font: 'rounded', bubble: 'bubbles', icon: 'circle' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    blurb: 'Burnt orange into dusky violet, warm like a summer evening.',
    palette: {
      mode: 'light',
      paper: '#f5e5d8',
      paperHi: '#fffaf6',
      card: '#fcf0e6',
      sunk: '#f6e5d9',
      ink: '#2a140f',
      muted: '#6b473b',
      line: '#e9cbb8',
      edge: '#b38672',
      accent2: '#8a35b8',
      wall: ['#ffd8ad', '#ff9f86', '#b98ae0'],
    },
    look: { ...base, accent: '#d2460e', wall: '#ff9f86', bg: 'gradient', chrome: 'glossy', radius: 1, font: 'grotesk', bubble: 'cards', icon: 'rounded' },
  },
  {
    id: 'daydream',
    name: 'Daydream',
    blurb: 'The original Y2K pastel: sky, lilac and bubblegum.',
    palette: {
      mode: 'light',
      paper: '#e4ecff',
      paperHi: '#ffffff',
      card: '#f6f8ff',
      sunk: '#e9eefc',
      ink: '#171c38',
      muted: '#4f577c',
      line: '#ccd5f0',
      edge: '#8892bd',
      accent2: '#b8146f',
      wall: ['#bfe3ff', '#e4e4ff', '#f3d4ff'],
      title: ['#7cc0ff', '#2a66e8'],
    },
    look: { ...base, accent: '#1d5bd0', wall: '#e4e4ff', bg: 'gradient', chrome: 'glossy', radius: 1.25, font: 'rounded', bubble: 'classic', icon: 'rounded' },
  },
]

export const DEFAULT_LIGHT = 'chrome'
export const DEFAULT_DARK = 'midnight'
export const presetById = (id: string | undefined) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]

/* ------------------------------------------------------------------ stored skin */

/** What is saved: the preset plus only the fields the person changed. */
export interface Skin extends Partial<Look> {
  v: 1
  preset: string
}

const HEX = /^#[0-9a-f]{6}$/i
const oneOf = <T extends readonly { id: string }[]>(list: T, v: unknown): Ids<T> | undefined => (list.some((o) => o.id === v) ? (v as Ids<T>) : undefined)

/** Accept anything (localStorage, the database, a URL) and keep only safe, known values. */
export function sanitizeSkin(raw: unknown): Skin | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.preset !== 'string' || !PRESETS.some((p) => p.id === r.preset)) return null
  const s: Skin = { v: 1, preset: r.preset }
  if (typeof r.accent === 'string' && HEX.test(r.accent)) s.accent = r.accent.toLowerCase()
  if (typeof r.wall === 'string' && HEX.test(r.wall)) s.wall = r.wall.toLowerCase()
  if (typeof r.radius === 'number' && Number.isFinite(r.radius)) s.radius = Math.max(0, Math.min(2, Math.round(r.radius * 4) / 4))
  const pick = <K extends keyof Look>(k: K, v: Look[K] | undefined) => {
    if (v !== undefined) (s as unknown as Record<string, unknown>)[k] = v
  }
  pick('bg', oneOf(BACKGROUNDS, r.bg))
  pick('chrome', oneOf(CHROMES, r.chrome))
  pick('font', oneOf(FONTS, r.font))
  pick('size', oneOf(SIZES, r.size))
  pick('density', oneOf(DENSITIES, r.density))
  pick('bubble', oneOf(BUBBLES, r.bubble))
  pick('icon', oneOf(ICON_SHAPES, r.icon))
  return s
}

export function resolveLook(skin: Skin): Look {
  const p = presetById(skin.preset)
  const out = { ...p.look }
  for (const k of Object.keys(out) as (keyof Look)[]) if (skin[k] !== undefined) (out as Record<string, unknown>)[k] = skin[k]
  return out
}

/** Store only what differs from the preset, so presets can improve later without stomping choices. */
export function withChange(skin: Skin, change: Partial<Look>): Skin {
  const p = presetById(skin.preset).look
  const next: Skin = { ...skin, ...change }
  for (const k of Object.keys(change) as (keyof Look)[]) if (next[k] === p[k]) delete next[k]
  return next
}

/** Switch preset but keep personal comfort settings (text size and density). */
export function switchPreset(skin: Skin, id: string): Skin {
  const s: Skin = { v: 1, preset: presetById(id).id }
  if (skin.size) s.size = skin.size
  if (skin.density) s.density = skin.density
  return s
}

export function isCustomized(skin: Skin) {
  return Object.keys(skin).some((k) => k !== 'v' && k !== 'preset' && k !== 'size' && k !== 'density')
}

/** A surprise combination; keeps the person's text size and density for comfort. */
export function randomSkin(current: Skin, rand: () => number = Math.random): Skin {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const p = pick(PRESETS)
  const dark = p.palette.mode === 'dark'
  const hue = Math.floor(rand() * 360)
  const s: Skin = {
    v: 1,
    preset: p.id,
    accent: hslToHex(hue, 70 + rand() * 25, dark ? 58 + rand() * 12 : 38 + rand() * 12),
    wall: hslToHex((hue + 150 + rand() * 60) % 360, 25 + rand() * 45, dark ? 8 + rand() * 10 : 72 + rand() * 16),
    bg: pick(BACKGROUNDS).id,
    chrome: pick(CHROMES).id,
    radius: pick([0, 0.5, 0.75, 1, 1.25, 1.5, 2]),
    font: pick(FONTS).id,
    bubble: pick(BUBBLES).id,
    icon: pick(ICON_SHAPES).id,
  }
  if (current.size) s.size = current.size
  if (current.density) s.density = current.density
  return s
}

/* ------------------------------------------------------------------ CSS variables */

const SWATCH_LIGHT = { red: '#c81e3a', orange: '#b34a0a', green: '#12813f', teal: '#0c7a86', blue: '#1d5bd0', purple: '#7a2fd0', pink: '#c0177a' }
const SWATCH_DARK = { red: '#ff8a9a', orange: '#ffad6b', green: '#72eaa6', teal: '#5fe3e6', blue: '#7ccaff', purple: '#c4a2ff', pink: '#ff85cf' }

export interface Resolved {
  mode: 'light' | 'dark'
  look: Look
  vars: Record<string, string>
  /** Contrast of text on the accent color, for the customizer's readout. */
  accentInk: number
}

function wallpaper(look: Look, pal: Palette, mode: 'light' | 'dark', custom: boolean) {
  const w = look.wall
  const [a, b, c] = custom ? [mix(w, mode === 'dark' ? '#ffffff' : '#ffffff', mode === 'dark' ? 0.1 : 0.35), w, mix(w, '#000000', mode === 'dark' ? 0.35 : 0.18)] : pal.wall
  const stops = [a, b, c]
  const lineC = mix(b, mode === 'dark' ? '#ffffff' : '#000000', mode === 'dark' ? 0.09 : 0.08)
  const glow = `radial-gradient(60rem 40rem at 10% -10%, ${a} 0, transparent 60%), radial-gradient(50rem 36rem at 100% 10%, ${mix(look.accent, b, 0.75)} 0, transparent 60%), radial-gradient(60rem 40rem at 50% 120%, ${c} 0, transparent 60%), linear-gradient(160deg, ${a}, ${b} 55%, ${c})`
  const flat = `linear-gradient(${b}, ${b})`
  const soft = `linear-gradient(160deg, ${a}, ${b} 50%, ${c})`
  let image = soft
  if (look.bg === 'solid') image = flat
  else if (look.bg === 'gradient') image = glow
  else if (look.bg === 'dots') image = `radial-gradient(${lineC} 1.2px, transparent 1.6px) 0 0 / 16px 16px, ${soft}`
  else if (look.bg === 'grid') image = `linear-gradient(${lineC} 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, ${lineC} 1px, transparent 1px) 0 0 / 28px 28px, ${soft}`
  else if (look.bg === 'stripes') image = `repeating-linear-gradient(135deg, ${lineC} 0 2px, transparent 2px 14px), ${soft}`
  else if (look.bg === 'scanlines') image = `repeating-linear-gradient(0deg, ${lineC} 0 1px, transparent 1px 3px), ${soft}`
  return { image, stops, base: b }
}

export function resolveSkin(skin: Skin): Resolved {
  const p = presetById(skin.preset)
  const pal = p.palette
  const look = resolveLook(skin)
  const mode = pal.mode
  const dark = mode === 'dark'
  const surfaces = [pal.paperHi, pal.card, pal.sunk, pal.paper]

  const mine = mix(look.accent, pal.paperHi, dark ? 0.8 : 0.9)
  const mineLine = mix(look.accent, pal.paperHi, dark ? 0.6 : 0.72)
  const textBgs = [...surfaces, mine]
  const blue = readable(look.accent, textBgs)
  const red = readable(pal.accent2, textBgs)
  const onAccent = inkOn([blue, red])
  const accentInk = Math.min(contrast(onAccent, blue), contrast(onAccent, red))

  const sw = dark ? SWATCH_DARK : SWATCH_LIGHT
  const good = readable(dark ? '#72eaa6' : '#11743a', textBgs)
  const badBase = readable(dark ? '#ff9d94' : '#b3261e', textBgs)
  const badBg = mix(badBase, pal.paperHi, dark ? 0.82 : 0.9)
  const bad = readable(badBase, [...textBgs, badBg])
  const brass = readable(dark ? '#ffcb66' : '#955500', textBgs)

  // Title bars: the preset's own, or a glossy gradient made from the accent. Ink picks itself.
  let [ta, tb] = pal.title ?? [mix(look.accent, '#ffffff', 0.35), look.accent]
  const titleInk = inkOn([ta, tb])
  for (let i = 0; i < 20 && minContrast(titleInk, [ta, tb]) < 4.5; i++) {
    const toward = titleInk === '#ffffff' ? '#000000' : '#ffffff'
    ta = mix(ta, toward, 0.08)
    tb = mix(tb, toward, 0.08)
  }
  // When the title bar is neutral (steel/gunmetal), the active window gets an accent underline.
  const titleAccent = pal.title && !pal.title.includes(look.accent) ? look.accent : 'transparent'

  const custom = skin.wall !== undefined
  const wall = wallpaper(look, pal, mode, custom)
  const wallInk = readable(pal.ink, wall.stops)
  const wallMuted = readable(pal.muted, wall.stops)

  const shadowTint = dark ? '0 0 0' : hexToRgb(pal.ink).join(' ')
  const accentRgb = hexToRgb(look.accent).join(' ')
  const r = look.radius

  const vars: Record<string, string> = {
    '--paper': pal.paper,
    '--paper-hi': pal.paperHi,
    '--card': pal.card,
    '--sunk': pal.sunk,
    '--ink': readable(pal.ink, textBgs, 7),
    '--muted': readable(pal.muted, textBgs),
    '--line': pal.line,
    '--edge': pal.edge,
    '--red': red,
    '--blue': blue,
    '--accent-raw': look.accent,
    '--on-accent': onAccent,
    '--brass': brass,
    '--mine': mine,
    '--mine-line': mineLine,
    '--good': good,
    '--bad': bad,
    '--bad-bg': badBg,
    '--online': dark ? '#44e391' : '#1fa653',
    '--idle': dark ? '#f4d35e' : '#8a6d00',
    '--tip-bg': pal.ink,
    '--tip-ink': pal.paperHi,
    '--title-a': ta,
    '--title-b': tb,
    '--title-ink': titleInk,
    '--title-accent': titleAccent,
    '--wall': wall.image,
    '--wall-base': wall.base,
    '--wall-ink': wallInk,
    '--wall-muted': wallMuted,
    '--logo-a': mix(look.accent, '#ffffff', 0.45),
    '--logo-b': look.accent,
    '--logo-c': mix(pal.accent2, '#ffffff', 0.35),
    '--logo-d': pal.accent2,
    '--bevel-hi': dark ? mix(pal.card, '#ffffff', 0.25) : '#ffffff',
    '--bevel-lo': dark ? '#000000' : mix(pal.edge, '#000000', 0.2),
    '--shadow': dark
      ? `0 1px 0 rgb(255 255 255 / 0.1) inset, 0 0 0 1px rgb(${accentRgb} / 0.08), 0 8px 18px -10px rgb(0 0 0 / 0.8)`
      : `0 1px 0 rgb(255 255 255 / 0.8) inset, 0 1px 2px rgb(${shadowTint} / 0.12), 0 6px 14px -8px rgb(${shadowTint} / 0.3)`,
    '--shadow-hover': dark
      ? `0 1px 0 rgb(255 255 255 / 0.14) inset, 0 0 0 1px rgb(${accentRgb} / 0.22), 0 10px 22px -10px rgb(0 0 0 / 0.9)`
      : `0 1px 0 rgb(255 255 255 / 0.8) inset, 0 2px 3px rgb(${shadowTint} / 0.14), 0 10px 20px -8px rgb(${accentRgb} / 0.35)`,
    '--win-shadow': dark
      ? `0 0 0 1px rgb(${accentRgb} / 0.28), 0 0 28px -10px rgb(${accentRgb} / 0.4), 0 20px 44px -18px rgb(0 0 0 / 0.9)`
      : `0 0 0 1px rgb(${shadowTint} / 0.16), 0 18px 40px -18px rgb(${shadowTint} / 0.45), 0 4px 10px -4px rgb(${shadowTint} / 0.15)`,
    '--ui-font': FONTS.find((f) => f.id === look.font)!.stack,
    '--win-r': `${Math.round(14 * r)}px`,
    '--radius-xs': `${0.125 * r}rem`,
    '--radius-sm': `${0.25 * r}rem`,
    '--radius-md': `${0.375 * r}rem`,
    '--radius-lg': `${0.5 * r}rem`,
    '--radius-xl': `${0.75 * r}rem`,
    '--radius-2xl': `${1 * r}rem`,
    '--radius-3xl': `${1.5 * r}rem`,
  }
  for (const [k, v] of Object.entries(sw)) vars[`--s-${k}`] = readable(v, textBgs)
  return { mode, look, vars, accentInk }
}

/** Attributes the stylesheet keys off (chrome style, density, icon shape, chat style). */
export function skinAttrs(r: Resolved) {
  return { theme: r.mode, chrome: r.look.chrome, density: r.look.density, icons: r.look.icon, bubble: r.look.bubble, bg: r.look.bg }
}
export const fontPx = (size: Size) => SIZES.find((s) => s.id === size)!.px

/** Small, inline-able summary for the pre-paint script (public/theme-init.js). */
export function paintCache(r: Resolved) {
  return { vars: r.vars, attrs: skinAttrs(r), px: fontPx(r.look.size), meta: r.vars['--paper'] }
}
