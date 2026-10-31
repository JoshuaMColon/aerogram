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
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('buddyline:skin'))) ?? '{}').preset).toBe('midnight')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

const PRESETS = ['chrome', 'midnight', 'terminal', 'arcade', 'classic', 'ocean', 'sunset', 'daydream']
for (const id of PRESETS) {
  test(`skin "${id}" is accessible with the customizer open`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /appearance/i }).click()
    const panel = page.getByTestId('skin-panel')
    await expect(panel).toBeVisible()
    await panel.locator(`[data-preset="${id}"]`).click()
    await expect(panel.locator(`[data-preset="${id}"]`)).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(250)
    await expectAxeClean(page)
  })
}

test('customizer: custom choices apply live, persist, and reset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /appearance/i }).click()
  const panel = page.getByTestId('skin-panel')
  await panel.getByRole('button', { name: 'Bevel' }).click()
  await panel.getByRole('button', { name: 'Bubbles' }).click()
  await panel.getByRole('button', { name: 'Circle' }).click()
  await panel.getByRole('button', { name: 'Plex Mono' }).click()
  await panel.getByTestId('accent-input').fill('#ffee00')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-chrome', 'bevel')
  await expect(html).toHaveAttribute('data-bubble', 'bubbles')
  await expect(html).toHaveAttribute('data-icons', 'circle')
  await expect(panel.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  // A very light accent is darkened for text automatically.
  await expect(panel.getByText(/Tuned to #/)).toBeVisible()
  await expectAxeClean(page)
  await page.reload()
  await expect(html).toHaveAttribute('data-chrome', 'bevel')
  await page.getByRole('button', { name: /appearance/i }).click()
  await page.getByTestId('skin-panel').getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(html).toHaveAttribute('data-chrome', 'glossy')
  await page.getByTestId('skin-random').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('skin-panel')).toBeHidden()
})

test('sign-up tab is reachable from the URL', async ({ page }) => {
  await page.goto('/login?mode=signup')
  await expect(page.getByRole('tab', { name: /create account|sign up/i })).toHaveAttribute('aria-selected', 'true')
})

test('demo explains a missing backend instead of crashing', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('alert')).toContainText(/no Supabase configuration/i)
})
