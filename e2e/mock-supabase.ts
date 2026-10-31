import type { Page, Route } from '@playwright/test'

/** The fake Supabase origin the demo-flow build points at (see playwright.config.ts). */
export const MOCK_SUPABASE_URL = 'https://mock-project.supabase.test'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/**
 * Answers every Supabase request the app makes with just enough data for the Buddy List to
 * render: anonymous sign-up, sign-out, a profile, and empty rooms/buddies. Realtime is left
 * unanswered (channels simply never join), which the app tolerates.
 */
export async function mockSupabase(page: Page, opts: { stallSignups?: number } = {}) {
  const guests: string[] = []
  let stalled = 0
  let current: { id: string; name: string } | null = null

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

  const user = (id: string) => ({
    id,
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: true,
    email: '',
    phone: '',
    app_metadata: { provider: 'anonymous', providers: [] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  })
  const session = (id: string) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: true })}.sig`
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `refresh-${id}`, user: user(id) }
  }
  const profile = () => ({
    id: current!.id,
    display_name: current!.name,
    stamp: 3,
    bio: '',
    is_bot: false,
    is_guest: true,
    created_at: new Date().toISOString(),
    status: 'online',
    away_message: null,
    last_seen_at: null,
  })

  await page.routeWebSocket(/mock-project\.supabase\.test/, () => {})
  await page.route(`${MOCK_SUPABASE_URL}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })

    if (path === '/auth/v1/signup') {
      // Leave the first N sign-ups hanging, like a request lost on flaky mobile data.
      if (stalled < (opts.stallSignups ?? 0)) {
        stalled++
        return
      }
      const id = crypto.randomUUID()
      current = { id, name: `mock_guest_${guests.length + 1}` }
      guests.push(id)
      return json(route, session(id))
    }
    if (path === '/auth/v1/logout') {
      current = null
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    }
    if (path === '/auth/v1/user') return current ? json(route, user(current.id)) : json(route, { message: 'no session' }, 401)
    if (path === '/auth/v1/token') return current ? json(route, session(current.id)) : json(route, { error: 'invalid_grant' }, 400)

    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length)
      if (!current) return json(route, { message: 'not signed in' }, 401)
      if (fn === 'chat_ensure_profile' || fn === 'chat_set_presence') return json(route, profile())
      if (fn === 'chat_my_rooms' || fn === 'chat_public_rooms' || fn === 'chat_away_presets') return json(route, [])
      return json(route, null)
    }
    if (path.startsWith('/rest/v1/')) return json(route, [])
    if (path.startsWith('/storage/v1/')) return json(route, [])
    return json(route, { message: `unmocked ${path}` }, 404)
  })

  return {
    /** Ids of every anonymous sign-up the page made, in order. */
    guests,
  }
}
