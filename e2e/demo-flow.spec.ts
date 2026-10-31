import { expect, test, type Page } from '@playwright/test'
import { mockSupabase } from './mock-supabase'

// Runs against a build pointed at a fake Supabase origin (see playwright.config.ts), so the
// guest flow is exercised in CI without a real backend or real guest accounts.

/** Marks the current document; if a later check still sees it, there was no full page reload. */
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))
const stillSamePage = (page: Page) => page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true)

async function expectSignedOn(page: Page, name: string) {
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

test('sign off from the demo, then Try the demo signs on a fresh guest', async ({ page }) => {
  const mock = await mockSupabase(page)
  await page.goto('/demo')
  await expectSignedOn(page, 'mock_guest_1')
  await mark(page)

  await page.getByRole('button', { name: /^Sign off/ }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Try the demo' }).first().click()

  await expectSignedOn(page, 'mock_guest_2')
  expect(mock.guests).toHaveLength(2)
  expect(await stillSamePage(page)).toBe(true)
})

test('logo to the landing page, then Try the demo returns to the same guest without a reload', async ({ page }) => {
  const mock = await mockSupabase(page)
  await page.goto('/demo')
  await expectSignedOn(page, 'mock_guest_1')
  await mark(page)

  await page
    .getByRole('link', { name: /Buddy List/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Try the demo' }).first().click()

  await expectSignedOn(page, 'mock_guest_1')
  expect(mock.guests).toHaveLength(1)
  expect(await stillSamePage(page)).toBe(true)
})

test('signing off twice in a row still gets a new guest each time', async ({ page }) => {
  const mock = await mockSupabase(page)
  await page.goto('/demo')
  for (const n of [1, 2, 3]) {
    await expectSignedOn(page, `mock_guest_${n}`)
    if (n === 3) break
    await page.getByRole('button', { name: /^Sign off/ }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('link', { name: 'Try the demo' }).first().click()
  }
  expect(mock.guests).toHaveLength(3)
})

test('a guest sign-up that hangs offers Try again, which signs on', async ({ page }) => {
  const mock = await mockSupabase(page, { stallSignups: 1 })
  await page.goto('/demo')
  await expect(page.getByRole('status')).toHaveText(/Picking your guest screen name/)
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeVisible({ timeout: 15_000 })
  await retry.click()
  await expectSignedOn(page, 'mock_guest_1')
  expect(mock.guests).toHaveLength(1)
})
