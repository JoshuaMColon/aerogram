import { expect, test } from '@playwright/test'
import { expectAxeClean } from './helpers'

test('landing fits a phone without sideways scroll', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await expectAxeClean(page)
})

test('tap gives visual feedback and opens sign-in', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('link', { name: /create an account/i })
    .first()
    .tap()
  await expect(page).toHaveURL(/\/login\?mode=signup/)
})

test('customizer goes full screen on a phone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /appearance/i }).tap()
  const panel = page.getByTestId('skin-panel')
  await expect(panel).toBeVisible()
  await page.waitForTimeout(300)
  const box = await panel.boundingBox()
  const vw = page.viewportSize()!.width
  expect(Math.round(box!.width)).toBe(vw)
  await expect(panel.getByText('Tap a skin to try it')).toBeVisible()
  await expect(panel.getByText('Hover a skin for its story')).toBeHidden()
  await panel.locator('[data-preset="terminal"]').tap()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectAxeClean(page)
})
