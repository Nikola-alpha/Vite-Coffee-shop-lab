import { useCallback, useEffect, useState } from 'react'
import type { UserBook, UserBookInsert } from '../types/database'
import { supabase } from '../lib/supabase'

export function useUserBooks(userId: string | undefined) {
  const [books, setBooks] = useState<UserBook[]>([])
  const [loading, setLoading] = useState(!!userId)
  const [error, setError] = useState<Error | null>(null)

  const fetchBooks = useCallback(async () => {
    if (!userId) {
      setBooks([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('user_books')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (e) {
      setError(e)
      setBooks([])
    } else {
      setBooks((data as UserBook[]) ?? [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  const addBook = useCallback(
    async (insert: UserBookInsert) => {
      if (!userId) return { error: new Error('Not signed in') }
      const { error: e } = await supabase.from('user_books').insert({
        ...insert,
        user_id: userId,
      })
      if (e) return { error: e }
      await fetchBooks()
      return { error: null }
    },
    [userId, fetchBooks]
  )

  const updateBookStatus = useCallback(
    async (id: string, status: UserBook['status']) => {
      const { error: e } = await supabase
        .from('user_books')
        .update({ status })
        .eq('id', id)
      if (e) return { error: e }
      await fetchBooks()
      return { error: null }
    },
    [fetchBooks]
  )

  const removeBook = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('user_books').delete().eq('id', id)
      if (e) return { error: e }
      await fetchBooks()
      return { error: null }
    },
    [fetchBooks]
  )

  return {
    books,
    loading,
    error,
    refetch: fetchBooks,
    addBook,
    updateBookStatus,
    removeBook,
  }
}
