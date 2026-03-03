import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!!userId)
  const [error, setError] = useState<Error | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, invite_code, updated_at')
      .eq('id', userId)
      .single()

    if (e) {
      setError(e)
      setProfile(null)
      setLoading(false)
      return
    }

    setProfile((data as Profile) ?? null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!userId) return { error: new Error('Not signed in') }
      const { error: e } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' })
      if (e) return { error: e }
      await fetchProfile()
      return { error: null }
    },
    [userId, fetchProfile]
  )

  return { profile, loading, error, refetch: fetchProfile, updateDisplayName }
}

