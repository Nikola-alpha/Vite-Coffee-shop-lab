export type BookStatus = 'reading' | 'want_to_read' | 'finished'

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected'

export type UserBook = {
  id: string
  user_id: string
  title: string
  author: string | null
  status: BookStatus
  created_at: string
}

export type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  invite_code: string | null
  updated_at: string | null
}

export type UserBookInsert = {
  user_id: string
  title: string
  author?: string | null
  status: BookStatus
}

export type Friendship = {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
  updated_at: string
}

export type Activity = {
  id: string
  actor_id: string
  verb: string
  object_type: string
  object_id: string | null
  metadata: unknown
  created_at: string
}

export type Session = {
  id: string
  host_id: string
  book_title: string
  book_author: string | null
  total_chapters: number
  is_public: boolean
  created_at: string
  archived_at: string | null
}

export type SessionMember = {
  id: string
  session_id: string
  user_id: string
  joined_at: string
  last_seen_at: string | null
  current_chapter: number
}

export type SessionMessage = {
  id: string
  session_id: string
  author_id: string
  body: string
  created_at: string
  chapter_number: number | null
  parent_id: string | null
}

export type SessionReaction = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}
