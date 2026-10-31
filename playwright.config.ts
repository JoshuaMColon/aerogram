import { defineConfig, devices } from '@playwright/test'
import { MOCK_SUPABASE_URL } from './e2e/mock-supabase'

const PORT = 4174
/** Second build pointed at a fake Supabase origin that e2e/mock-supabase.ts answers in the browser. */
const MOCK_PORT = 4175

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'desktop', testIgnore: /(mobile|demo-flow)\.spec\.ts/ },
    { name: 'demo-flow', testMatch: /demo-flow\.spec\.ts/, use: { baseURL: `http://localhost:${MOCK_PORT}` } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Built without Supabase env: the landing and sign-in pages render; nothing touches a backend.
      command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
    {
      // Built against a fake Supabase origin; the demo-flow tests mock every request to it.
      command: `npx vite build --outDir dist-e2e-mock && npx vite preview --outDir dist-e2e-mock --port ${MOCK_PORT} --strictPort`,
      url: `http://localhost:${MOCK_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_SUPABASE_URL: MOCK_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'e2e-mock-anon-key' },
    },
  ],
})
