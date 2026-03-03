import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Friendship, Profile } from '../types/database'

type FriendRow = Friendship & {
  otherProfile: Pick<Profile, 'id' | 'display_name' | 'invite_code'> | null
  direction: 'incoming' | 'outgoing'
}

function otherUserId(f: Friendship, me: string) {
  return f.requester_id === me ? f.addressee_id : f.requester_id
}

export function useFriends(userId: string | undefined) {
  const [rows, setRows] = useState<FriendRow[]>([])
  const [loading, setLoading] = useState(!!userId)
  const [error, setError] = useState<Error | null>(null)

  const fetchFriends = useCallback(async () => {
    if (!userId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const { data: friendships, error: e1 } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (e1) {
      setError(e1)
      setRows([])
      setLoading(false)
      return
    }

    const fs = ((friendships as Friendship[]) ?? []).slice()
    const otherIds = Array.from(new Set(fs.map((f) => otherUserId(f, userId))))
    const { data: profiles, error: e2 } = await supabase
      .from('profiles')
      .select('id, display_name, invite_code')
      .in('id', otherIds)

    if (e2) {
      setError(e2)
      setRows([])
      setLoading(false)
      return
    }

    const map = new Map<string, Pick<Profile, 'id' | 'display_name' | 'invite_code'>>(
      ((profiles as Array<Pick<Profile, 'id' | 'display_name' | 'invite_code'>>) ?? []).map(
        (p) => [p.id, p]
      )
    )

    const merged: FriendRow[] = fs.map((f) => {
      const otherId = otherUserId(f, userId)
      return {
        ...f,
        otherProfile: map.get(otherId) ?? null,
        direction: f.addressee_id === userId ? 'incoming' : 'outgoing',
      }
    })

    setRows(merged)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  const accepted = useMemo(() => rows.filter((r) => r.status === 'accepted'), [rows])
  const incoming = useMemo(
    () => rows.filter((r) => r.status === 'pending' && r.direction === 'incoming'),
    [rows]
  )
  const outgoing = useMemo(
    () => rows.filter((r) => r.status === 'pending' && r.direction === 'outgoing'),
    [rows]
  )

  const requestByInviteCode = useCallback(
    async (inviteCode: string) => {
      if (!userId) return { error: new Error('Not signed in') }
      const code = inviteCode.trim()
      if (!code) return { error: new Error('Invite code required') }

      const { data: profile, error: e1 } = await supabase
        .from('profiles')
        .select('id')
        .eq('invite_code', code)
        .single()

      if (e1) return { error: e1 }
      const addresseeId = (profile as { id: string }).id
      if (addresseeId === userId) return { error: new Error('You cannot add yourself') }

      const { error: e2 } = await supabase.from('friendships').insert({
        requester_id: userId,
        addressee_id: addresseeId,
        status: 'pending',
      })
      if (e2) return { error: e2 }
      await fetchFriends()
      return { error: null }
    },
    [userId, fetchFriends]
  )

  const accept = useCallback(
    async (friendshipId: string) => {
      const { error: e } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId)
      if (e) return { error: e }
      await fetchFriends()
      return { error: null }
    },
    [fetchFriends]
  )

  const reject = useCallback(
    async (friendshipId: string) => {
      const { error: e } = await supabase
        .from('friendships')
        .update({ status: 'rejected' })
        .eq('id', friendshipId)
      if (e) return { error: e }
      await fetchFriends()
      return { error: null }
    },
    [fetchFriends]
  )

  const remove = useCallback(
    async (friendshipId: string) => {
      const { error: e } = await supabase.from('friendships').delete().eq('id', friendshipId)
      if (e) return { error: e }
      await fetchFriends()
      return { error: null }
    },
    [fetchFriends]
  )

  return {
    rows,
    accepted,
    incoming,
    outgoing,
    loading,
    error,
    refetch: fetchFriends,
    requestByInviteCode,
    accept,
    reject,
    remove,
  }
}

