// Live end-to-end check against a real backend: two separate guest sessions on Buddyline.
// Usage: BASE_URL=https://… [SHOTS_DIR=…] node scripts/two-sessions.mjs   (prints the guest user ids it created)
// Covers: presence, add buddy, sign-off/sign-on toasts, IM window, typing + "has entered text",
// delivery, read receipt, away message + one-time auto response, and Buzz.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4317'
const SHOTS = process.env.SHOTS_DIR
const VIDEO = process.env.VIDEO_DIR
const step = (s) => console.log(`✓ ${s}`)
const shot = async (p, name) => SHOTS && (await p.screenshot({ path: `${SHOTS}/${name}.png` }))

const browser = await chromium.launch()
const ids = []
let a, b, mp
try {
  const ctxOpts = (o = {}) => ({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } } } : {}), ...o })
  const boot = async (ctx) => {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror:', e.message))
    return page
  }
  const open = async () => {
    const ctx = await browser.newContext(ctxOpts())
    await ctx.addInitScript(() => localStorage.setItem('buddyline:muted', '1'))
    const page = await boot(ctx)
    await page.goto(`${BASE}/demo`)
    await page.waitForURL(/\/app/, { timeout: 30_000 })
    await page.getByTestId('buddy-list').waitFor({ timeout: 30_000 })
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('aerogram:auth') ?? '{}')?.user?.id)
    const name = (await page.getByTestId('my-screen-name').textContent()).trim()
    ids.push(id)
    console.log('guest id:', id)
    return { ctx, page, id, name }
  }
  a = await open()
  b = await open()
  step(`two guest sessions: A=${a.name}, B=${b.name}`)

  // Add B as a buddy on A's list; B shows up online.
  await a.page.getByRole('button', { name: 'Add a buddy by screen name' }).click()
  await a.page.getByPlaceholder('e.g. TeoShipsFriday').fill(b.name)
  await a.page.getByPlaceholder('e.g. TeoShipsFriday').press('Enter')
  const bRow = a.page.locator(`[data-buddy="${b.name}"]`)
  await a.page.locator(`[data-buddy="${b.name}"][data-state="online"]`).waitFor({ timeout: 20_000 })
  step(`buddy list: A added ${b.name}, shown online`)
  await shot(a.page, 'buddy-list-light')

  // Sign off / sign on: B leaves (toast after the 5 s grace) and comes back.
  const state = await b.ctx.storageState()
  await b.ctx.close()
  await a.page.getByTestId('door-toast').filter({ hasText: b.name }).filter({ hasText: 'signed off' }).waitFor({ timeout: 30_000 })
  await a.page.locator(`[data-buddy="${b.name}"][data-state="offline"]`).waitFor({ timeout: 10_000 })
  step('sign-off toast + buddy moved to Offline')
  b.ctx = await browser.newContext(ctxOpts({ storageState: state }))
  await b.ctx.addInitScript(() => localStorage.setItem('buddyline:muted', '1'))
  b.page = await boot(b.ctx)
  await b.page.goto(`${BASE}/app`)
  await b.page.getByTestId('buddy-list').waitFor({ timeout: 30_000 })
  await a.page.getByTestId('door-toast').filter({ hasText: b.name }).filter({ hasText: 'signed on' }).waitFor({ timeout: 30_000 })
  step('sign-on toast when B returns')
  await shot(a.page, 'sign-on-toast')

  // A opens an IM window with B and sends; B's window pops up on its own.
  await bRow.locator('button').first().click()
  const aWin = a.page.locator('[role="dialog"][data-window]').filter({ has: a.page.getByPlaceholder(`Send an IM to ${b.name}…`) })
  await aWin.waitFor({ timeout: 15_000 })
  const aBox = aWin.getByPlaceholder(`Send an IM to ${b.name}…`)
  const hello = `hi from A ${Date.now()}`
  await aBox.fill(hello)
  await aBox.press('Enter')
  const t0 = Date.now()
  const bWin = b.page.locator('[role="dialog"][data-window]').filter({ has: b.page.getByPlaceholder(`Send an IM to ${a.name}…`) })
  await bWin.getByText(hello, { exact: true }).waitFor({ timeout: 15_000 })
  step(`IM: B's window opened by itself and got the message in ${Date.now() - t0} ms`)

  // Read receipt once B focuses the window.
  await bWin.locator('h2').click()
  await aWin.locator('[aria-label="Read"]').last().waitFor({ timeout: 15_000 })
  step('read receipt: A sees "Read"')

  // Typing states.
  await aBox.click()
  await aBox.pressSequentially('typing a thing', { delay: 40 })
  await bWin
    .getByTestId('typing')
    .filter({ hasText: `${a.name} is typing...` })
    .waitFor({ timeout: 10_000 })
  step(`typing: B sees "${a.name} is typing..."`)
  await bWin
    .getByTestId('typing')
    .filter({ hasText: `${a.name} has entered text.` })
    .waitFor({ timeout: 15_000 })
  step(`typing: B sees "${a.name} has entered text." after a pause`)
  await aBox.fill('')

  // Away: B goes away; A's first IM gets one auto response, the second doesn't.
  await b.page.getByRole('button', { name: 'Set your status or away message' }).click()
  await b.page.getByRole('menuitem', { name: /brb, microwaving/ }).click()
  await b.page.getByTestId('away-banner').waitFor()
  await a.page.locator(`[data-buddy="${b.name}"][data-state="away"]`).waitFor({ timeout: 15_000 })
  await aWin
    .getByTestId('im-status')
    .filter({ hasText: /microwaving/ })
    .waitFor({ timeout: 10_000 })
  step('away: A sees B as away with the message')
  await aBox.fill('you there?')
  await aBox.press('Enter')
  await aWin
    .getByText(/Auto response from/)
    .first()
    .waitFor({ timeout: 15_000 })
  await aBox.fill('hello??')
  await aBox.press('Enter')
  await bWin.getByText('hello??', { exact: true }).waitFor({ timeout: 10_000 })
  await a.page.waitForTimeout(2500)
  const autos = await aWin.getByText(/Auto response from/).count()
  if (autos !== 1) throw new Error(`expected 1 auto response, saw ${autos}`)
  step('away: exactly one auto response')
  await bRow.hover()
  await a.page
    .getByRole('tooltip')
    .filter({ hasText: /microwaving/ })
    .waitFor({ timeout: 5_000 })
  await shot(a.page, 'away-message')
  await a.page.mouse.move(900, 700)

  // Buzz: B's window shakes.
  await aWin.getByRole('button', { name: /Buzz/ }).first().click()
  await b.page.locator('[role="dialog"][data-window].buzz').waitFor({ timeout: 10_000 })
  await aWin.getByText('BUZZ!').first().waitFor({ timeout: 10_000 })
  step('buzz: B’s IM window shook')
  await b.page.getByRole('button', { name: /I.m back/ }).click()

  // B replies the other way.
  const bBox = bWin.getByPlaceholder(`Send an IM to ${a.name}…`)
  const reply = `reply from B ${Date.now()}`
  await bBox.fill(reply)
  await bBox.press('Enter')
  await aWin.getByText(reply, { exact: true }).waitFor({ timeout: 10_000 })
  step('reply: A received B’s IM')

  // A second window: the lobby, so screenshots show several IM windows at once.
  await a.page.getByRole('tab', { name: /Rooms/ }).click()
  await a.page.getByRole('button', { name: /#the-lobby/ }).click()
  await a.page.locator('[role="dialog"][data-window]').nth(1).waitFor({ timeout: 10_000 })
  await a.page.locator('[data-window] .animate-pulse').first().waitFor({ state: 'detached', timeout: 15_000 })
  // Drag the lobby window by its title bar so both windows show side by side.
  const bar = a.page.locator('[data-window]').nth(1).locator('h2')
  const bb = await bar.boundingBox()
  await a.page.mouse.move(bb.x + 40, bb.y + bb.height / 2)
  await a.page.mouse.down()
  await a.page.mouse.move(bb.x + 480, bb.y + bb.height / 2 + 60, { steps: 12 })
  await a.page.mouse.up()
  await a.page.waitForTimeout(600)
  await shot(a.page, 'multiple-im-windows')
  await shot(b.page, 'session-b')

  // Midnight (dark) theme on A's Buddy List.
  await a.page.getByRole('tab', { name: /Buddies/ }).click()
  await a.page.getByRole('button', { name: 'Switch to dark (Midnight)' }).click()
  await a.page.waitForTimeout(500)
  await shot(a.page, 'buddy-list-dark')
  await a.page.getByRole('button', { name: 'Switch to light (Chrome)' }).click()
  step('theme toggle: Midnight and back')

  // B on a phone: tabbed, full-screen IMs.
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light', storageState: await b.ctx.storageState() })
  mp = await boot(m)
  await mp.goto(`${BASE}/app`)
  await mp.getByTestId('buddy-list').waitFor({ timeout: 30_000 })
  await mp.waitForTimeout(800)
  await shot(mp, 'mobile-buddy-list')
  await mp.getByRole('tab', { name: /Rooms/ }).click()
  await mp.locator(`button[title="Open your IM with ${a.name}"]`).click()
  await mp.getByPlaceholder(`Send an IM to ${a.name}…`).waitFor({ timeout: 15_000 })
  await mp.waitForTimeout(800)
  await shot(mp, 'mobile-im')
  step('mobile: Buddy List and a full-screen IM tab')
  await m.close()
  console.log('ALL CHECKS PASSED')
  await a.ctx.close()
  await b.ctx.close()
} catch (e) {
  console.error('FAILED:', e.message)
  for (const [k, s] of [
    ['a', a],
    ['b', b],
    ['m', { page: mp }],
  ])
    await s?.page?.screenshot({ path: `/tmp/fail-${k}.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  console.log('guest ids:', JSON.stringify(ids))
  await browser.close()
}
