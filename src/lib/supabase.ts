import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

/** Null when the build has no Supabase env (CI e2e): the landing and sign-in pages still render. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'aerogram:auth' },
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null

export const CLOUD = supabase !== null
