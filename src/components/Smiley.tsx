import type { SmileyId } from '../lib/im'

/** Original glossy smiley faces, drawn as inline SVG so they scale with the text. */
export function Smiley({ id, size = '1.25em', title }: { id: SmileyId; size?: string | number; title?: string }) {
  const face = id === 'angry' ? '#ff9f43' : id === 'heart' ? 'none' : '#ffd23f'
  const stroke = '#7a4a00'
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={title ?? id} className="inline-block align-[-0.25em]" style={{ filter: 'drop-shadow(0 1px 0.5px rgb(0 0 0 / 0.25))' }}>
      {title && <title>{title}</title>}
      {id === 'heart' ? (
        <>
          <path d="M16 28 C6 21 2 15 2 10 a7 7 0 0 1 14-2 a7 7 0 0 1 14 2 c0 5-4 11-14 18z" fill="#ff4f8b" stroke="#a3124a" strokeWidth="1.2" />
          <ellipse cx="10" cy="9" rx="4" ry="2.4" fill="#fff" opacity="0.55" transform="rotate(-25 10 9)" />
        </>
      ) : (
        <>
          <defs>
            <radialGradient id={`sm-${id}`} cx="40%" cy="30%" r="75%">
              <stop offset="0" stopColor="#fff6c2" />
              <stop offset="0.45" stopColor={face} />
              <stop offset="1" stopColor={id === 'angry' ? '#e0661a' : '#f2a500'} />
            </radialGradient>
          </defs>
          {id === 'angel' && <ellipse cx="16" cy="3.6" rx="8" ry="2.4" fill="none" stroke="#f5c400" strokeWidth="1.8" />}
          <circle cx="16" cy="17" r="13" fill={`url(#sm-${id})`} stroke={stroke} strokeWidth="1.1" />
          <ellipse cx="12" cy="10.5" rx="6" ry="3" fill="#fff" opacity="0.5" />
          <Eyes id={id} />
          <Mouth id={id} />
          {id === 'blush' && (
            <>
              <ellipse cx="8.5" cy="20" rx="2.6" ry="1.6" fill="#ff6b8a" opacity="0.6" />
              <ellipse cx="23.5" cy="20" rx="2.6" ry="1.6" fill="#ff6b8a" opacity="0.6" />
            </>
          )}
        </>
      )}
    </svg>
  )
}

function Eyes({ id }: { id: SmileyId }) {
  const ink = '#3d2400'
  if (id === 'cool')
    return (
      <g>
        <path d="M5.5 13.5h21l-1 4.2a3 3 0 0 1-3 2.3h-3.2a3 3 0 0 1-2.9-2.2L16 15.6l-.4 2.2A3 3 0 0 1 12.7 20H9.5a3 3 0 0 1-3-2.3z" fill="#1b1f3b" />
        <path d="M8 15h3" stroke="#7cc8ff" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    )
  if (id === 'wink')
    return (
      <g fill={ink}>
        <ellipse cx="11.5" cy="14" rx="1.7" ry="2.4" />
        <path d="M18.5 14.5q2.5-2 5 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    )
  if (id === 'grin' || id === 'kiss' || id === 'blush')
    return (
      <g stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M9 14.5q2.5-2.6 5 0" />
        <path d="M18 14.5q2.5-2.6 5 0" />
      </g>
    )
  if (id === 'angry')
    return (
      <g fill={ink}>
        <path d="M8 11l5 2" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M24 11l-5 2" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="11.5" cy="15" r="1.6" />
        <circle cx="20.5" cy="15" r="1.6" />
      </g>
    )
  if (id === 'cry')
    return (
      <g>
        <ellipse cx="11.5" cy="14" rx="1.6" ry="2.2" fill={ink} />
        <ellipse cx="20.5" cy="14" rx="1.6" ry="2.2" fill={ink} />
        <path d="M10.5 17.5q-1.5 3 0 4.5q1.5-1.5 0-4.5z" fill="#4fb3ff" />
      </g>
    )
  if (id === 'gasp')
    return (
      <g fill={ink}>
        <ellipse cx="11.5" cy="13.5" rx="1.9" ry="2.6" />
        <ellipse cx="20.5" cy="13.5" rx="1.9" ry="2.6" />
      </g>
    )
  return (
    <g fill={ink}>
      <ellipse cx="11.5" cy="14" rx="1.7" ry="2.4" />
      <ellipse cx="20.5" cy="14" rx="1.7" ry="2.4" />
    </g>
  )
}

function Mouth({ id }: { id: SmileyId }) {
  const ink = '#3d2400'
  switch (id) {
    case 'grin':
      return <path d="M8.5 19.5h15a7.5 7 0 0 1-15 0z" fill="#7a1f1f" stroke={ink} strokeWidth="1.1" strokeLinejoin="round" />
    case 'tongue':
      return (
        <g>
          <path d="M10 20.5q6 3.5 12 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M14 21.6q0 4.4 2.8 4.4t2.6-4.8" fill="#ff5d7a" stroke="#9c1f3a" strokeWidth="0.9" />
        </g>
      )
    case 'frown':
    case 'cry':
    case 'angry':
      return <path d="M10.5 24q5.5-4.5 11 0" stroke={ink} strokeWidth="1.7" fill="none" strokeLinecap="round" />
    case 'gasp':
      return <ellipse cx="16" cy="22.5" rx="2.8" ry="3.4" fill="#5a1414" stroke={ink} strokeWidth="1" />
    case 'kiss':
      return <path d="M14.2 20.5q3.6 1 0 2.2q3.6 1.1 0 2.3" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    case 'meh':
      return <path d="M11 22.5l10-2" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
    case 'blush':
      return <path d="M12 21.5q4 2.2 8 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    case 'cool':
      return <path d="M10.5 22q5.5 3 11 -1" stroke={ink} strokeWidth="1.7" fill="none" strokeLinecap="round" />
    default:
      return <path d="M9.5 20q6.5 6 13 0" stroke={ink} strokeWidth="1.7" fill="none" strokeLinecap="round" />
  }
}
