// Paint the saved skin before first render (external file so the CSP needs no inline hash).
// The app writes `buddyline:paint` (resolved CSS variables); without it, fall back to the default light/dark preset.
try {
  var d = document.documentElement
  var p = JSON.parse(localStorage.getItem('buddyline:paint') || 'null')
  if (p && p.vars && p.attrs) {
    for (var k in p.vars) if (/^--[a-z0-9-]+$/.test(k)) d.style.setProperty(k, String(p.vars[k]))
    for (var a in p.attrs) if (/^[a-z]+$/.test(a)) d.dataset[a] = String(p.attrs[a])
    if (typeof p.px === 'number') d.style.fontSize = p.px + 'px'
  } else {
    var t = localStorage.getItem('buddyline:theme')
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    d.dataset.theme = t
  }
} catch (e) {
  document.documentElement.dataset.theme = 'light'
}
