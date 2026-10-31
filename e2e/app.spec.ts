import { expect, test } from '@playwright/test'
import { expectAxeClean, setTheme } from './helpers'

for (const theme of ['light', 'dark'] as const) {
  test(`landing is accessible in ${theme}`, async ({ page }) => {
    await setTheme(page, theme)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('buddies are online')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expectAxeClean(page)
  })

  test(`sign-in is accessible in ${theme}`, async ({ page }) => {
    await setTheme(page, theme)
    await page.goto('/login')
    await expect(page.getByRole('tab', { name: 'Sign on' })).toBeVisible()
    await expectAxeClean(page)
  })
}

test('buttons show a styled tooltip on hover', async ({ page }) => {
  await page.goto('/')
  const demo = page.getByRole('link', { name: /try the demo/i })
  await demo.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('guest screen name')
  await expect(demo).toHaveAttribute('aria-describedby', /.+/)
})

test('theme toggle switches and persists', async ({ page }) => {
  await setTheme(page, 'light')
  await page.goto('/')
  await page.getByRole('button', { name: /switch to dark/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('buddyline:theme'))).toBe('dark')
})

test('sign-up tab is reachable from the URL', async ({ page }) => {
  await page.goto('/login?mode=signup')
  await expect(page.getByRole('tab', { name: /create account|sign up/i })).toHaveAttribute('aria-selected', 'true')
})

test('demo explains a missing backend instead of crashing', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('alert')).toContainText(/no Supabase configuration/i)
})
