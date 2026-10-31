/**
 * Every sound is synthesized on the fly with the Web Audio API: no audio files, nothing copied.
 *  - door open:  a rising, wobbly "creak" (filtered sawtooth with vibrato) then a latch click
 *  - door close: a short creak down into a soft low thump
 *  - message:    two quick sine blips
 *  - buzz:       a low square-wave rattle
 */
export type SoundName = 'open' | 'close' | 'message' | 'buzz' | 'send'

const KEY = 'buddyline:muted'
let ctx: AudioContext | null = null
const subs = new Set<(m: boolean) => void>()

export function isMuted() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
export function setMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? '1' : '0')
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f(m))
}
export function onMuted(f: (m: boolean) => void) {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Browsers only allow audio after a user gesture; call this from one to warm the context up. */
export function unlockAudio() {
  audio()
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, t + attack + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
}

function creak(a: AudioContext, out: AudioNode, t: number, from: number, to: number, dur: number) {
  const o = a.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const lfo = a.createOscillator()
  lfo.frequency.value = 23
  const depth = a.createGain()
  depth.gain.value = from * 0.18
  lfo.connect(depth).connect(o.frequency)
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1100
  bp.Q.value = 3
  const g = a.createGain()
  env(g, t, 0.18, 0.03, dur * 0.6, dur * 0.4)
  o.connect(bp).connect(g).connect(out)
  o.start(t)
  lfo.start(t)
  o.stop(t + dur + 0.05)
  lfo.stop(t + dur + 0.05)
}

function noiseBurst(a: AudioContext, out: AudioNode, t: number, dur: number, freq: number, peak: number) {
  const n = a.createBufferSource()
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  n.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = freq
  const g = a.createGain()
  env(g, t, peak, 0.004, 0, dur)
  n.connect(f).connect(g).connect(out)
  n.start(t)
}

function tone(a: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number) {
  const o = a.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const g = a.createGain()
  env(g, t, peak, 0.01, dur * 0.3, dur * 0.7)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

export function play(name: SoundName) {
  if (isMuted()) return
  const a = audio()
  if (!a || a.state !== 'running') return
  const out = a.createGain()
  out.gain.value = 0.6
  out.connect(a.destination)
  const t = a.currentTime + 0.01
  switch (name) {
    case 'open':
      creak(a, out, t, 180, 420, 0.42)
      noiseBurst(a, out, t + 0.44, 0.05, 3200, 0.35)
      tone(a, out, t + 0.45, 'triangle', 1400, 900, 0.06, 0.12)
      break
    case 'close':
      creak(a, out, t, 360, 160, 0.22)
      tone(a, out, t + 0.22, 'sine', 120, 48, 0.22, 0.6)
      noiseBurst(a, out, t + 0.22, 0.12, 420, 0.5)
      break
    case 'message':
      tone(a, out, t, 'sine', 880, 880, 0.07, 0.22)
      tone(a, out, t + 0.085, 'sine', 1320, 1320, 0.1, 0.2)
      break
    case 'send':
      tone(a, out, t, 'sine', 600, 980, 0.09, 0.12)
      break
    case 'buzz':
      for (let i = 0; i < 5; i++) tone(a, out, t + i * 0.09, 'square', 95, 80, 0.07, 0.12)
      break
  }
}
