import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Session,
  SessionMember,
  SessionMessage,
  SessionReaction,
} from '../types/database'

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false })
    if (e) {
      setError(e)
      setSessions([])
    } else {
      setSessions((data as Session[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const createSession = useCallback(
    async (input: {
      host_id: string
      book_title: string
      book_author?: string
      total_chapters: number
      is_public: boolean
    }) => {
      const { error: e } = await supabase.from('sessions').insert(input)
      if (e) return { error: e }
      await fetchSessions()
      return { error: null }
    },
    [fetchSessions]
  )

  return { sessions, loading, error, refetch: fetchSessions, createSession }
}

export function useSessionDetail(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null)
  const [members, setMembers] = useState<SessionMember[]>([])
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [reactions, setReactions] = useState<SessionReaction[]>([])
  const [loading, setLoading] = useState(!!sessionId)
  const [error, setError] = useState<Error | null>(null)

  const fetchAll = useCallback(async () => {
    if (!sessionId) {
      setSession(null)
      setMembers([])
      setMessages([])
      setReactions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const [{ data: s, error: e1 }, { data: m, error: e2 }, { data: msg, error: e3 }] =
      await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase.from('session_members').select('*').eq('session_id', sessionId),
        supabase
          .from('session_messages')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true }),
      ])

    if (e1 || e2 || e3) {
      setError(e1 ?? e2 ?? e3 ?? null)
      setLoading(false)
      return
    }

    const messageIds = ((msg as SessionMessage[]) ?? []).map((m2) => m2.id)
    let allReactions: SessionReaction[] = []
    if (messageIds.length > 0) {
      const { data: r, error: e4 } = await supabase
        .from('session_reactions')
        .select('*')
        .in('message_id', messageIds)
      if (e4) {
        setError(e4)
        setLoading(false)
        return
      }
      allReactions = (r as SessionReaction[]) ?? []
    }

    setSession((s as Session) ?? null)
    setMembers((m as SessionMember[]) ?? [])
    setMessages((msg as SessionMessage[]) ?? [])
    setReactions(allReactions)
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return {
    session,
    members,
    messages,
    reactions,
    loading,
    error,
    refetch: fetchAll,
  }
}

