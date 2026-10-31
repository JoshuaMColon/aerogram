import type { SupabaseClient } from '@supabase/supabase-js'
import { normMember, normMessage, normRoom, storagePath } from './logic'
import type { Attachment, Member, Message, Profile, PublicRoom, Reactions, RoomSummary } from './types'

export const PAGE = 40
const BUCKET = 'chat-files'

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export async function ensureProfile(db: SupabaseClient, name?: string | null): Promise<Profile> {
  return check(await db.rpc('chat_ensure_profile', { p_name: name ?? null })) as Profile
}

export async function myRooms(db: SupabaseClient): Promise<RoomSummary[]> {
  return ((check(await db.rpc('chat_my_rooms')) ?? []) as RoomSummary[]).map(normRoom)
}

export async function publicRooms(db: SupabaseClient): Promise<PublicRoom[]> {
  return check(await db.rpc('chat_public_rooms')) ?? []
}

export async function createRoom(db: SupabaseClient, name: string, topic: string): Promise<string> {
  return check(await db.rpc('chat_create_room', { p_name: name, p_topic: topic }))
}

export async function openDm(db: SupabaseClient, other: string): Promise<string> {
  return check(await db.rpc('chat_open_dm', { p_other: other }))
}

export async function joinRoom(db: SupabaseClient, room: string, me: string) {
  const r = await db.from('chat_members').insert({ room_id: room, user_id: me })
  if (r.error && r.error.code !== '23505') throw new Error(r.error.message)
}

export async function leaveRoom(db: SupabaseClient, room: string, me: string) {
  check(await db.from('chat_members').delete().eq('room_id', room).eq('user_id', me))
}

export async function getProfiles(db: SupabaseClient, ids: string[]): Promise<Profile[]> {
  if (!ids.length) return []
  return check(await db.from('chat_profiles').select('*').in('id', ids)) ?? []
}

export async function searchPeople(db: SupabaseClient, q: string, me: string): Promise<Profile[]> {
  let query = db.from('chat_profiles').select('*').neq('id', me).order('is_bot', { ascending: false }).order('created_at', { ascending: false }).limit(30)
  const t = q.trim().replace(/[%_,()]/g, '')
  if (t) query = query.ilike('display_name', `%${t}%`)
  return check(await query) ?? []
}

export async function updateProfile(db: SupabaseClient, me: string, patch: Partial<Pick<Profile, 'display_name' | 'stamp' | 'bio'>>): Promise<Profile> {
  return check(await db.from('chat_profiles').update(patch).eq('id', me).select('*').single())
}

export async function members(db: SupabaseClient, room: string): Promise<Member[]> {
  return ((check(await db.from('chat_members').select('*').eq('room_id', room).limit(500)) ?? []) as Member[]).map(normMember)
}

/** Newest page, or the page before `before` (keyset on created_at, id). Returned oldest first. */
export async function messages(db: SupabaseClient, room: string, before?: Pick<Message, 'created_at' | 'id'>): Promise<Message[]> {
  let q = db.from('chat_messages').select('*').eq('room_id', room).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE)
  if (before) q = q.or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`)
  const rows = (check(await q) ?? []) as Message[]
  return rows.reverse().map(normMessage)
}

export async function sendMessage(db: SupabaseClient, m: Pick<Message, 'id' | 'room_id' | 'user_id' | 'body' | 'attachment'>): Promise<Message> {
  return normMessage(check(await db.from('chat_messages').insert(m).select('*').single()))
}

export async function editMessage(db: SupabaseClient, id: string, body: string): Promise<Message> {
  return normMessage(check(await db.from('chat_messages').update({ body }).eq('id', id).select('*').single()))
}

export async function deleteMessage(db: SupabaseClient, m: Message): Promise<Message> {
  const row = check(await db.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id).select('*').single()) as Message
  if (m.attachment) await db.storage.from(BUCKET).remove([m.attachment.path])
  return normMessage(row)
}

export async function toggleReaction(db: SupabaseClient, id: string, emoji: string): Promise<Reactions> {
  return check(await db.rpc('chat_toggle_reaction', { p_message: id, p_emoji: emoji }))
}

export async function markRead(db: SupabaseClient, room: string, me: string, at: string) {
  check(await db.from('chat_members').update({ last_read_at: at }).eq('room_id', room).eq('user_id', me))
}

export async function uploadFile(db: SupabaseClient, room: string, me: string, file: File, dims?: { w: number; h: number }): Promise<Attachment> {
  const path = storagePath(room, me, crypto.randomUUID(), file.name)
  check(await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' }))
  return { path, name: file.name.slice(0, 120), mime: file.type, size: file.size, ...(dims ?? {}) }
}

const signed = new Map<string, { url: string; exp: number }>()

/** Short-lived signed URL for a private file, cached until shortly before it expires. */
export async function fileUrl(db: SupabaseClient, path: string, download?: string): Promise<string> {
  const key = download ? `${path}#dl` : path
  const hit = signed.get(key)
  if (hit && hit.exp > Date.now() + 60_000) return hit.url
  const r = check(await db.storage.from(BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined))
  signed.set(key, { url: r.signedUrl, exp: Date.now() + 3600_000 })
  return r.signedUrl
}

export function imageSize(file: File): Promise<{ w: number; h: number } | undefined> {
  return new Promise((res) => {
    if (!file.type.startsWith('image/')) return res(undefined)
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      res({ w: img.naturalWidth, h: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      res(undefined)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
