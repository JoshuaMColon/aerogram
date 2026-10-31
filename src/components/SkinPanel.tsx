import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Cloud, HardDrive, Palette, RotateCcw, Shuffle, Undo2, X } from 'lucide-react'
import {
  BACKGROUNDS,
  BUBBLES,
  CHROMES,
  DENSITIES,
  FONTS,
  ICON_SHAPES,
  PRESETS,
  SIZES,
  isCustomized,
  presetById,
  randomSkin,
  resolveSkin,
  switchPreset,
  withChange,
  type Look,
  type Skin,
} from '../lib/skins'
import { useSkin } from '../state/skin'
import { Btn, Stamp, Tip, inkDot } from './ui'

const QUICK_ACCENTS = ['#1767db', '#0a7f86', '#12813f', '#6d3fd6', '#d2460e', '#c81e3a', '#c0177a', '#3d4b5c']

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <h3 className="mb-2 flex items-baseline justify-between gap-2 font-pixel text-[10px] uppercase tracking-wide text-muted">
        {title}
        {hint && <span className="font-sans text-[11px] normal-case tracking-normal">{hint}</span>}
      </h3>
      {children}
    </section>
  )
}

/** A row of toggle buttons for one option, every choice with its own tooltip. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string
  options: readonly { id: T; label: string; tip: string }[]
  value: T
  onChange: (v: T) => void
  render?: (o: { id: T; label: string }) => ReactNode
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = o.id === value
        return (
          <Btn
            key={o.id}
            tip={o.tip}
            size="sm"
            variant="plain"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`!border px-2.5 ${on ? '!border-blue bg-mine text-blue' : '!border-line bg-card hover:!border-edge'}`}
          >
            {on && <Check size={13} aria-hidden="true" />}
            {render ? render(o) : o.label}
          </Btn>
        )
      })}
    </div>
  )
}

function PresetCard({ id, active, onPick }: { id: string; active: boolean; onPick: () => void }) {
  const p = presetById(id)
  const v = useMemo(() => resolveSkin({ v: 1, preset: id }).vars, [id])
  return (
    <Tip tip={p.blurb} block>
      {(d) => (
        <button
          {...d}
          type="button"
          aria-pressed={active}
          data-preset={id}
          onClick={onPick}
          onPointerDown={inkDot}
          className={`press lift relative flex w-full flex-col overflow-hidden rounded-lg border-2 text-left ${active ? 'border-blue' : 'border-line hover:border-edge'}`}
        >
          <span className="relative block h-14 w-full" style={{ background: v['--wall'] }}>
            <span
              className="absolute inset-x-3 bottom-0 top-2.5 overflow-hidden border border-b-0"
              style={{ background: v['--paper-hi'], borderColor: v['--line'], borderRadius: `${parseInt(v['--win-r']) / 2}px ${parseInt(v['--win-r']) / 2}px 0 0` }}
            >
              <span className="block h-2.5" style={{ background: `linear-gradient(${v['--title-a']}, ${v['--title-b']})` }} />
              <span className="mx-1.5 mt-1 block h-1 w-3/5 rounded-full" style={{ background: v['--blue'] }} />
              <span className="mx-1.5 mt-1 block h-1 w-2/5 rounded-full" style={{ background: v['--red'] }} />
            </span>
          </span>
          <span className="flex items-center justify-between gap-1 bg-card px-2 py-1 text-xs font-bold" style={{ fontFamily: FONTS.find((f) => f.id === p.look.font)!.stack }}>
            {p.name}
            <span className="font-sans text-[10px] font-semibold text-muted">{p.palette.mode === 'dark' ? 'Dark' : 'Light'}</span>
          </span>
          {active && (
            <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-blue text-on-accent">
              <Check size={12} aria-hidden="true" />
            </span>
          )}
        </button>
      )}
    </Tip>
  )
}

function Preview({ look }: { look: Look }) {
  const line = (mine: boolean, who: string, text: string, first = true) =>
    look.bubble === 'classic' ? (
      <p data-msg className="px-2 text-[0.8rem] leading-snug">
        <b className={mine ? 'text-red' : 'text-blue'}>{who}</b> <span className="text-[10px] text-muted">(9:41)</span>: {text}
      </p>
    ) : look.bubble === 'bubbles' ? (
      <div data-msg className={`flex flex-col px-2 text-[0.8rem] ${mine ? 'items-end' : 'items-start'}`}>
        {first && <span className={`px-1 text-[10px] font-bold ${mine ? 'text-red' : 'text-blue'}`}>{who}</span>}
        <span className={`bubble ${mine ? 'mine tail-mine' : 'tail-them'}`}>{text}</span>
      </div>
    ) : (
      <div data-msg className="px-2 text-[0.8rem]">
        <div className={`msg-card ${mine ? 'mine' : ''}`}>
          <b className={`block text-[10px] ${mine ? 'text-red' : 'text-blue'}`}>{who}</b>
          {text}
        </div>
      </div>
    )
  return (
    <div aria-hidden="true" className="wall overflow-hidden rounded-lg border border-line p-3">
      <div className="window overflow-hidden">
        <div className="titlebar flex h-7 items-center gap-1.5 px-2 text-xs font-bold" data-active="true">
          <span className="truncate">Instant Message: Teo</span>
          <span className="chrome-btn ml-auto grid h-4 w-4 place-items-center rounded text-[9px]">×</span>
        </div>
        <div className="flex gap-2 bg-paper-hi py-2">
          <div className="hidden w-24 shrink-0 border-r border-line px-1.5 sm:block">
            {[
              ['Teo', 'online'],
              ['Mara', 'away'],
            ].map(([n, st]) => (
              <div key={n} data-row className="flex items-center gap-1.5 py-1 text-[11px] font-bold">
                <Stamp name={n} stamp={n === 'Teo' ? 3 : 6} size={18} state={st as 'online'} />
                {n}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            {line(false, 'Teo', 'did you see the new skins?')}
            {line(true, 'You', 'yes!! switching to Terminal')}
            {line(true, 'You', 'brb', false)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkinPanel() {
  return useSkin().panelOpen ? <Panel /> : null
}

function Panel() {
  const { skin, setSkin, resolved, setPanelOpen, sync } = useSkin()
  // The look when the panel opened, for Revert.
  const [opened] = useState<Skin>(skin)
  const back = useRef<HTMLElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [announce, setAnnounce] = useState('')
  const look = resolved.look
  const preset = presetById(skin.preset)
  const change = (c: Partial<Look>) => setSkin(withChange(skin, c))

  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus())
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && setPanelOpen(false)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('keydown', esc)
      back.current?.focus?.()
    }
  }, [setPanelOpen])

  const adjusted = resolved.vars['--blue'] !== look.accent
  const ratio = resolved.accentInk

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby="skins-title"
      data-testid="skin-panel"
      className="window drawer-in fixed inset-0 z-[70] flex flex-col !rounded-none sm:inset-y-3 sm:left-auto sm:right-3 sm:w-[23rem] sm:!rounded-[var(--win-r)]"
    >
      <div className="titlebar flex h-10 shrink-0 items-center gap-2 px-3 font-bold" data-active="true">
        <Palette size={16} aria-hidden="true" />
        <h2 id="skins-title" className="text-sm">
          Appearance
        </h2>
        <span className="truncate text-xs font-semibold opacity-80">
          · {preset.name}
          {isCustomized(skin) ? ' (custom)' : ''}
        </span>
        <Btn tip="Close Appearance (Esc)" iconOnly size="xs" variant="plain" className="chrome-btn ml-auto !h-6" onClick={() => setPanelOpen(false)}>
          <X size={14} aria-hidden="true" />
        </Btn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-paper-hi">
        <div className="px-4 py-3">
          <Preview look={look} />
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted" data-testid="skin-sync">
            {sync === 'local' ? <HardDrive size={12} aria-hidden="true" /> : <Cloud size={12} aria-hidden="true" />}
            {sync === 'local'
              ? 'Saved on this device. Sign in with an account to sync it everywhere.'
              : sync === 'saving'
                ? 'Saving to your account…'
                : sync === 'error'
                  ? 'Could not sync. Saved on this device for now.'
                  : 'Synced to your account across devices.'}
          </p>
        </div>

        <Section title="Skins" hint="Hover a skin for its story">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <PresetCard key={p.id} id={p.id} active={p.id === skin.preset && !isCustomized(skin)} onPick={() => (setSkin(switchPreset(skin, p.id)), setAnnounce(`${p.name} skin applied`))} />
            ))}
          </div>
        </Section>

        <Section title="Accent color" hint={`Text on accent ${ratio.toFixed(1)}:1 ${ratio >= 4.5 ? '✓ AA' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tip tip="Pick any accent color">
              {(d) => (
                <label
                  {...d}
                  className="press lift relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-md border border-edge"
                  style={{ background: look.accent }}
                  onPointerDown={inkDot}
                >
                  <span className="sr-only">Accent color</span>
                  <input type="color" value={look.accent} onChange={(e) => change({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" data-testid="accent-input" />
                </label>
              )}
            </Tip>
            {QUICK_ACCENTS.map((c) => (
              <Btn
                key={c}
                tip={`Use ${c}`}
                iconOnly
                size="xs"
                variant="plain"
                aria-pressed={look.accent === c}
                aria-label={`Accent ${c}`}
                onClick={() => change({ accent: c })}
                className={`!h-6 !rounded-full border-2 ${look.accent === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              >
                <span />
              </Btn>
            ))}
            <Btn tip={`Back to ${preset.name}'s accent`} size="xs" variant="plain" onClick={() => change({ accent: preset.look.accent })} disabled={!skin.accent}>
              <RotateCcw size={12} aria-hidden="true" /> Preset
            </Btn>
          </div>
          {adjusted && <p className="mt-1.5 text-[11px] text-muted">Tuned to {resolved.vars['--blue']} for text so it stays readable on this skin.</p>}
        </Section>

        <Section title="Wallpaper">
          <Segmented label="Wallpaper pattern" options={BACKGROUNDS} value={look.bg} onChange={(bg) => change({ bg })} />
          <div className="mt-2 flex items-center gap-2">
            <Tip tip="Pick the wallpaper color">
              {(d) => (
                <label
                  {...d}
                  className="press lift relative flex h-8 cursor-pointer items-center gap-2 overflow-hidden rounded-md border border-edge bg-card pl-1 pr-2.5 text-xs font-bold"
                  onPointerDown={inkDot}
                >
                  <span className="h-6 w-6 rounded" style={{ background: resolved.vars['--wall-base'] }} />
                  Color
                  <input type="color" value={look.wall} onChange={(e) => change({ wall: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Wallpaper color" />
                </label>
              )}
            </Tip>
            <Btn tip={`Back to ${preset.name}'s wallpaper`} size="xs" variant="plain" onClick={() => change({ wall: preset.look.wall })} disabled={!skin.wall}>
              <RotateCcw size={12} aria-hidden="true" /> Preset
            </Btn>
          </div>
        </Section>

        <Section title="Window chrome">
          <Segmented label="Window chrome" options={CHROMES} value={look.chrome} onChange={(chrome) => change({ chrome })} />
          <Tip tip={`Corner roundness: ${look.radius === 0 ? 'square' : `${Math.round(look.radius * 100)}%`}`} block>
            {(d) => (
              <label {...d} className="mt-3 flex items-center gap-3 text-xs font-bold">
                Corners
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.25}
                  value={look.radius}
                  onChange={(e) => change({ radius: Number(e.target.value) })}
                  className="flex-1 accent-[var(--blue)]"
                  aria-valuetext={look.radius === 0 ? 'square' : `${Math.round(look.radius * 100)} percent`}
                />
                <span className="w-10 text-right font-mono text-muted">{look.radius === 0 ? 'sq' : `${Math.round(look.radius * 100)}%`}</span>
              </label>
            )}
          </Tip>
        </Section>

        <Section title="Font">
          <Segmented
            label="Font"
            options={FONTS}
            value={look.font}
            onChange={(font) => change({ font })}
            render={(o) => <span style={{ fontFamily: FONTS.find((f) => f.id === o.id)!.stack }}>{o.label}</span>}
          />
          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs font-bold">
            <span>Size</span>
            <Segmented label="Text size" options={SIZES} value={look.size} onChange={(size) => change({ size })} />
            <span>Density</span>
            <Segmented label="Density" options={DENSITIES} value={look.density} onChange={(density) => change({ density })} />
          </div>
        </Section>

        <Section title="Chat style">
          <Segmented label="Chat style" options={BUBBLES} value={look.bubble} onChange={(bubble) => change({ bubble })} />
        </Section>

        <Section title="Buddy icons">
          <Segmented
            label="Buddy icon shape"
            options={ICON_SHAPES}
            value={look.icon}
            onChange={(icon) => change({ icon })}
            render={(o) => (
              <>
                <span aria-hidden="true" className="inline-block h-3.5 w-3.5 bg-current opacity-70" style={{ borderRadius: o.id === 'circle' ? '50%' : o.id === 'square' ? 2 : '28%' }} />
                {o.label}
              </>
            )}
          />
        </Section>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-line bg-paper px-3 py-2.5">
        <Btn
          tip="Surprise me: a random skin, accent and style (keeps your text size)"
          size="sm"
          variant="plain"
          data-testid="skin-random"
          onClick={() => (setSkin(randomSkin(skin)), setAnnounce('Random skin applied'))}
        >
          <Shuffle size={14} aria-hidden="true" /> Randomize
        </Btn>
        <Btn tip={`Clear your tweaks and go back to plain ${preset.name}`} size="sm" variant="plain" onClick={() => setSkin({ v: 1, preset: skin.preset })} disabled={Object.keys(skin).length <= 2}>
          <RotateCcw size={14} aria-hidden="true" /> Reset
        </Btn>
        <Btn tip="Undo everything since you opened this panel" size="sm" variant="plain" onClick={() => setSkin(opened)} disabled={JSON.stringify(opened) === JSON.stringify(skin)}>
          <Undo2 size={14} aria-hidden="true" /> Revert
        </Btn>
        <Btn tip="Keep this look and close" size="sm" variant="blue" className="ml-auto" onClick={() => setPanelOpen(false)}>
          Done
        </Btn>
      </div>
    </aside>
  )
}
