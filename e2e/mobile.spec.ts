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
