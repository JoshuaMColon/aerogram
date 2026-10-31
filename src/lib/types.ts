export interface Profile {
  id: string
  display_name: string
  stamp: number
  bio: string
  is_bot: boolean
  is_guest: boolean
  created_at: string
  status?: 'online' | 'away'
  away_message?: string | null
  away_since?: string | null
  idle_since?: string | null
  last_seen_at?: string | null
}

export interface Attachment {
  path: string
  name: string
  mime: string
  size: number
  w?: number
  h?: number
}

export type Reactions = Record<string, string[]>

export interface Message {
  id: string
  room_id: string
  user_id: string
  body: string
  attachment: Attachment | null
  reactions: Reactions
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  /** Whole-message formatting from the IM toolbar. */
  style?: MsgStyle | null
  /** 'buzz' shakes the window; 'away' is a server-sent auto-reply. */
  kind?: 'text' | 'buzz' | 'away'
  /** Client-only: optimistic send in flight / failed, and a local preview for images. */
  pending?: boolean
  failed?: string
  localUrl?: string
}

export interface RoomSummary {
  id: string
  kind: 'public' | 'dm'
  slug: string | null
  name: string | null
  topic: string
  is_seed: boolean
  last_message_at: string
  last_read_at: string
  unread: number
  last_body: string | null
  last_user: string | null
  last_has_file: boolean
  last_deleted: boolean
  dm_user: string | null
}

export interface PublicRoom {
  id: string
  slug: string
  name: string
  topic: string
  is_seed: boolean
  members: number
  last_message_at: string
  joined: boolean
}

export interface Member {
  id: number
  room_id: string
  user_id: string
  joined_at: string
  last_read_at: string
}

export interface PresenceMeta {
  user_id: string
  name: string
  stamp: number
  online_at: string
  status?: 'online' | 'away'
  away?: string | null
  idle_since?: string | null
}

export type StyleColor = 'red' | 'orange' | 'green' | 'teal' | 'blue' | 'purple' | 'pink'
export interface MsgStyle {
  b?: boolean
  i?: boolean
  u?: boolean
  color?: StyleColor
  size?: 's' | 'l'
}

export interface BuddyGroup {
  id: string
  name: string
  sort: number
}
export interface BuddyEntry {
  buddy: string
  group_id: string
}
export interface BuddyListData {
  groups: BuddyGroup[]
  buddies: BuddyEntry[]
}

/** Live + persisted state of one person, merged from presence meta and their profile row. */
export type BuddyState = 'online' | 'away' | 'idle' | 'offline'
