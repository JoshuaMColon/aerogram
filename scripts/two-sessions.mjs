// Live end-to-end check against a real deployment: two separate guest sessions in the Lobby.
// Usage: BASE_URL=https://… node scripts/two-sessions.mjs   (prints the guest user ids it created)
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4317'
const SHOTS = process.env.SHOTS_DIR
const step = (s) => console.log(`✓ ${s}`)

const browser = await chromium.launch()
const ids = []
try {
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror:', e.message))
    await page.goto(`${BASE}/demo`)
    await page.waitForURL(/\/app\/r\//, { timeout: 30_000 })
    await page.getByPlaceholder(/^Write to /).waitFor()
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('aerogram:auth') ?? '{}')?.user?.id)
    ids.push(id)
    return { ctx, page, id }
  }
  const a = await open()
  const b = await open()
  step(`two guest sessions in ${a.page.url().split('/app')[1]}`)

  // Presence: each sees at least 2 online.
  const onlineCount = async (p) => Number((await p.getByText(/\d+ online/).first().textContent()).match(/(\d+) online/)[1])
  for (const p of [a.page, b.page]) await p.waitForFunction(() => /([2-9]|\d\d+) online/.test(document.body.innerText), null, { timeout: 40_000 })
  step(`presence: A sees ${await onlineCount(a.page)} online, B sees ${await onlineCount(b.page)} online`)

  // Typing.
  const box = a.page.getByPlaceholder(/^Write to /)
  await box.click()
  await box.pressSequentially('hello from session A', { delay: 30 })
  await b.page.getByTestId('typing').filter({ hasText: /writing|typing/i }).waitFor({ timeout: 10_000 })
  step(`typing: B sees "${(await b.page.getByTestId('typing').textContent()).trim()}"`)

  // Message.
  const text = `Two-session check ${Date.now()}`
  await box.fill(text)
  await box.press('Enter')
  const t0 = Date.now()
  await b.page.getByText(text, { exact: true }).waitFor({ timeout: 10_000 })
  step(`message: B received it in ${Date.now() - t0} ms`)
  await b.page.getByTestId('typing').filter({ hasText: /^\s*$/ }).waitFor({ timeout: 10_000 })
  step('typing line clears after send')

  // Read receipt: B is at the bottom with the tab visible, so it marks read; A sees "Seen".
  await a.page.locator('[aria-label^="Seen by"]').filter({ hasNotText: 'zzz' }).last().waitFor({ timeout: 15_000 })
  await a.page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="Seen by"]')].some((e) => Number(e.getAttribute('aria-label').match(/\d+/)[0]) >= 1), null, { timeout: 15_000 })
  step(`read receipt: A sees "${await a.page.locator('[aria-label^="Seen by"]').last().getAttribute('aria-label')}"`)

  // Reply back the other way.
  const reply = `Reply from B ${Date.now()}`
  const bbox = b.page.getByPlaceholder(/^Write to /)
  await bbox.fill(reply)
  await bbox.press('Enter')
  await a.page.getByText(reply, { exact: true }).waitFor({ timeout: 10_000 })
  step('reply: A received B’s message')

  if (SHOTS) {
    await a.page.screenshot({ path: `${SHOTS}/live-session-a.png` })
    await b.page.screenshot({ path: `${SHOTS}/live-session-b.png` })
  }
  // Presence drop: closing B lowers A's count.
  const before = await onlineCount(a.page)
  await b.ctx.close()
  await a.page.waitForFunction((n) => { const m = document.body.innerText.match(/(\d+) online/); return m && Number(m[1]) < n }, before, { timeout: 20_000 })
  step(`presence: A sees ${await onlineCount(a.page)} online after B leaves`)
  console.log('ALL CHECKS PASSED')
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  console.log('guest ids:', JSON.stringify(ids))
  await browser.close()
}
