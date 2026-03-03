import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Activity } from '../types/database'

export function useActivities(userId: string | undefined) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(!!userId)
  const [error, setError] = useState<Error | null>(null)

  const fetchActivities = useCallback(async () => {
    if (!userId) {
      setActivities([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (e) {
      setError(e)
      setActivities([])
    } else {
      setActivities((data as Activity[]) ?? [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  return { activities, loading, error, refetch: fetchActivities }
}

