// Live check + screenshots for skins and the customizer against a real backend (two guest sessions).
// Usage: BASE_URL=http://localhost:4318 SHOTS_DIR=… [VIDEO_DIR=…] node scripts/skins-shots.mjs
// Also verifies the away-message %n fix end to end. Prints the guest ids it created.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4318'
const SHOTS = process.env.SHOTS_DIR
const VIDEO = process.env.VIDEO_DIR
const step = (s) => console.log(`✓ ${s}`)
const shot = async (p, name) => SHOTS && (await p.screenshot({ path: `${SHOTS}/${name}.png` }))

const browser = await chromium.launch()
const ids = []
try {
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...opts })
    await ctx.addInitScript(() => localStorage.setItem('buddyline:muted', '1'))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror:', e.message))
    await page.goto(`${BASE}/demo`)
    await page.waitForURL(/\/app/, { timeout: 30_000 })
    await page.getByTestId('buddy-list').waitFor({ timeout: 30_000 })
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('aerogram:auth') ?? '{}')?.user?.id)
    const name = (await page.getByTestId('my-screen-name').textContent()).trim()
    ids.push(id)
    console.log('guest id:', id)
    return { ctx, page, id, name }
  }
  const a = await open(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } } } : {})
  const b = await open()
  step(`guests A=${a.name}, B=${b.name}`)
  const html = a.page.locator('html')
  if ((await html.getAttribute('data-theme')) !== 'light') throw new Error('default should be light Chrome')

  await a.page.getByRole('button', { name: 'Add a buddy by screen name' }).click()
  await a.page.getByPlaceholder('e.g. TeoShipsFriday').fill(b.name)
  await a.page.getByPlaceholder('e.g. TeoShipsFriday').press('Enter')
  const bRow = a.page.locator(`[data-buddy="${b.name}"]`)
  await a.page.locator(`[data-buddy="${b.name}"][data-state="online"]`).waitFor({ timeout: 20_000 })

  // A short conversation so every skin has something to show.
  await bRow.locator('button').first().click()
  const aWin = a.page.locator('[role="dialog"][data-window]').filter({ has: a.page.getByPlaceholder(`Send an IM to ${b.name}…`) })
  const aBox = aWin.getByPlaceholder(`Send an IM to ${b.name}…`)
  const bWin = b.page.locator('[role="dialog"][data-window]').filter({ has: b.page.getByPlaceholder(`Send an IM to ${a.name}…`) })
  const bBox = bWin.getByPlaceholder(`Send an IM to ${a.name}…`)
  const say = async (box, win, text) => {
    await box.fill(text)
    await box.press('Enter')
    await win.getByText(text, { exact: true }).waitFor({ timeout: 15_000 })
  }
  await say(aBox, aWin, 'hey! did you see the new skins?')
  await bWin.waitFor({ timeout: 15_000 })
  await say(bBox, bWin, 'yes!! I went full Terminal')
  await aWin.getByText('yes!! I went full Terminal', { exact: true }).waitFor({ timeout: 15_000 })
  await say(aBox, aWin, 'classic. Chrome is growing on me though')

  // %n fix: B's away message names the person who IMs, on both sides.
  await b.page.getByRole('button', { name: 'Set your status or away message' }).click()
  await b.page.getByRole('menuitem', { name: /Custom away message/ }).click()
  await b.page.getByPlaceholder('brb, feeding my virtual pet').fill('Hi %n! Out skinning my buddy list, back soon.')
  await b.page.getByRole('button', { name: 'Go away' }).click()
  await a.page.locator(`[data-buddy="${b.name}"][data-state="away"]`).waitFor({ timeout: 15_000 })
  await aBox.fill('you there?')
  await aBox.press('Enter')
  const expected = `Hi ${a.name}! Out skinning`
  await aWin.getByText(expected).waitFor({ timeout: 15_000 })
  await bWin.getByText(expected).waitFor({ timeout: 15_000 })
  if (await bWin.getByText(`Hi ${b.name}!`).count()) throw new Error('away person sees their own name')
  step(`%n: both sides read "${expected}…" (the away person never sees their own name)`)
  await b.page.getByRole('button', { name: 'Set your status or away message' }).click()
  await b.page
    .getByRole('menuitem', { name: /I.m back|Available/ })
    .first()
    .click()
  await a.page.mouse.move(1200, 820)
  await a.page.waitForTimeout(600)
  await shot(a.page, 'default-light-chrome')

  await a.page.getByRole('button', { name: 'Switch to dark (Midnight)' }).click()
  await a.page.waitForTimeout(500)
  if ((await html.getAttribute('data-theme')) !== 'dark') throw new Error('dark toggle failed')
  await shot(a.page, 'default-dark-midnight')
  step('defaults: Chrome (light) and Midnight (dark)')
  await a.page.getByRole('button', { name: 'Switch to light (Chrome)' }).click()

  // Customizer open over the live app.
  await a.page.getByTestId('open-skins').click()
  const panel = a.page.getByTestId('skin-panel')
  await panel.waitFor()
  await a.page.waitForTimeout(400)
  await shot(a.page, 'customizer-panel-open')
  for (const id of ['terminal', 'arcade', 'classic', 'ocean', 'sunset', 'daydream', 'midnight', 'chrome']) {
    await panel.locator(`[data-preset="${id}"]`).click()
    await a.page.waitForTimeout(VIDEO ? 1100 : 350)
    await shot(a.page, `preset-${id}-panel`)
  }
  step('switched through all 8 presets live')
  await a.page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  for (const id of ['terminal', 'arcade', 'classic', 'ocean', 'sunset', 'daydream']) {
    await a.page.evaluate((p) => localStorage.setItem('buddyline:skin', JSON.stringify({ v: 1, preset: p })), id)
    await a.page.reload()
    await aWin.waitFor({ timeout: 20_000 }).catch(() => {})
    await a.page.waitForTimeout(700)
    await shot(a.page, `preset-${id}`)
  }
  step('6 presets captured full screen (persisted across reloads)')

  // A custom combo built through the controls.
  await a.page.evaluate(() => localStorage.setItem('buddyline:skin', JSON.stringify({ v: 1, preset: 'midnight' })))
  await a.page.reload()
  await a.page.getByTestId('buddy-list').waitFor()
  await a.page.getByTestId('open-skins').click()
  await panel.waitFor()
  await panel.getByTestId('accent-input').fill('#ff8a00')
  await panel.getByRole('button', { name: 'Stripes' }).click()
  await panel.getByLabel('Wallpaper color').fill('#1d2a3a')
  await panel.getByRole('button', { name: 'Flat' }).click()
  await panel.getByRole('button', { name: 'Space Grotesk' }).click()
  await panel.getByRole('button', { name: 'Bubbles' }).click()
  await panel.getByRole('button', { name: 'Circle' }).click()
  await panel.getByRole('slider').fill('1.5')
  await a.page.waitForTimeout(400)
  await shot(a.page, 'custom-combo-panel')
  await a.page.keyboard.press('Escape')
  await a.page.waitForTimeout(400)
  await shot(a.page, 'custom-combo')
  const saved = await a.page.evaluate(() => localStorage.getItem('buddyline:skin'))
  step(`custom combo saved locally for the guest: ${saved}`)

  // Phone: full-screen customizer.
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light', storageState: await b.ctx.storageState() })
  const mp = await m.newPage()
  await mp.goto(`${BASE}/app`)
  await mp.getByTestId('buddy-list').waitFor({ timeout: 30_000 })
  await mp.waitForTimeout(500)
  await shot(mp, 'mobile-buddy-list-chrome')
  await mp.getByTestId('open-skins').tap()
  await mp.getByTestId('skin-panel').waitFor()
  await mp.waitForTimeout(400)
  await shot(mp, 'mobile-customizer')
  await mp.getByTestId('skin-panel').locator('[data-preset="arcade"]').tap()
  await mp.waitForTimeout(400)
  await shot(mp, 'mobile-customizer-arcade')
  await mp.getByTestId('skin-panel').locator('[data-preset="classic"]').scrollIntoViewIfNeeded()
  await mp.getByTestId('skin-panel').locator('[data-preset="classic"]').tap()
  await mp.getByRole('button', { name: 'Done' }).tap()
  await mp.waitForTimeout(400)
  await shot(mp, 'mobile-classic')
  await m.close()
  step('mobile customizer')
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  console.log('created guest ids:', ids.join(' '))
}
