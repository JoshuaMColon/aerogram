// Apply the saved or system theme before first paint (external file so the CSP needs no inline hash).
try {
  var t = localStorage.getItem('buddyline:theme')
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
} catch (e) {
  document.documentElement.dataset.theme = 'light'
}
