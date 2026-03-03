import { useMemo, useState } from 'react'
import './App.css'
import { useAuth } from './contexts/AuthContext.tsx'
import { useUserBooks } from './hooks/useUserBooks.ts'
import { useProfile } from './hooks/useProfile.ts'
import { useFriends } from './hooks/useFriends.ts'
import { useActivities } from './hooks/useActivities.ts'
import { useSessions, useSessionDetail } from './hooks/useSessions.ts'
import { supabase } from './lib/supabase.ts'
import type { BookStatus } from './types/database.ts'

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: 'Reading',
  want_to_read: 'Want to read',
  finished: 'Finished',
}

function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const { books, loading: booksLoading, addBook } = useUserBooks(user?.id)
  const { profile, loading: profileLoading, updateDisplayName } = useProfile(user?.id)
  const friends = useFriends(user?.id)
  const activity = useActivities(user?.id)
  const sessions = useSessions()
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const sessionDetail = useSessionDetail(activeSessionId)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newStatus, setNewStatus] = useState<BookStatus>('want_to_read')
  const [profileOpen, setProfileOpen] = useState(false)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [inviteDraft, setInviteDraft] = useState('')
  const [friendsError, setFriendsError] = useState<string | null>(null)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')
  const [sessionAuthor, setSessionAuthor] = useState('')
  const [sessionChapters, setSessionChapters] = useState(10)
  const [sessionIsPublic, setSessionIsPublic] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [messageBody, setMessageBody] = useState('')
  const [messageChapter, setMessageChapter] = useState<number | ''>('')

  const booksByStatus = {
    reading: books.filter((b) => b.status === 'reading'),
    want_to_read: books.filter((b) => b.status === 'want_to_read'),
    finished: books.filter((b) => b.status === 'finished'),
  }

  const shelfPreview = useMemo(() => {
    const list = [
      ...booksByStatus.reading,
      ...booksByStatus.want_to_read,
      ...booksByStatus.finished,
    ]
    return list.slice(0, 6)
  }, [booksByStatus.finished, booksByStatus.reading, booksByStatus.want_to_read])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    const fn = authMode === 'in' ? signIn : signUp
    const { error } = await fn(email, password)
    if (error) {
      setAuthError(error.message)
      return
    }
    setAuthOpen(false)
    setEmail('')
    setPassword('')
  }

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await addBook({
      user_id: user!.id,
      title: newTitle.trim(),
      author: newAuthor.trim() || null,
      status: newStatus,
    })
    setNewTitle('')
    setNewAuthor('')
    setNewStatus('want_to_read')
    setAddOpen(false)
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const name = displayNameDraft.trim()
    if (!name) return
    await updateDisplayName(name)
    setProfileOpen(false)
  }

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setFriendsError(null)
    const { error } = await friends.requestByInviteCode(inviteDraft)
    if (error) setFriendsError(error.message)
    else setInviteDraft('')
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSessionError(null)
    const title = sessionTitle.trim()
    const chapters = Number(sessionChapters)
    if (!title || !Number.isFinite(chapters) || chapters <= 0) {
      setSessionError('Title and positive chapter count are required.')
      return
    }
    const { error } = await sessions.createSession({
      host_id: user.id,
      book_title: title,
      book_author: sessionAuthor.trim() || undefined,
      total_chapters: chapters,
      is_public: sessionIsPublic,
    })
    if (error) {
      setSessionError(error.message)
      return
    }
    setSessionTitle('')
    setSessionAuthor('')
    setSessionChapters(10)
    setSessionIsPublic(true)
    setSessionModalOpen(false)
  }

  const handleJoinSession = async (sessionId: string) => {
    if (!user) return
    await supabase.from('session_members').insert({
      session_id: sessionId,
      user_id: user.id,
    })
    await sessions.refetch()
    if (activeSessionId === sessionId) {
      await sessionDetail.refetch()
    }
  }

  const handleUpdateProgress = async (sessionId: string, newChapter: number) => {
    if (!user) return
    await supabase
      .from('session_members')
      .update({ current_chapter: newChapter, last_seen_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
    await sessionDetail.refetch()
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !activeSessionId) return
    const body = messageBody.trim()
    if (!body) return
    await supabase.from('session_messages').insert({
      session_id: activeSessionId,
      author_id: user.id,
      body,
      chapter_number:
        messageChapter === '' || Number.isNaN(Number(messageChapter))
          ? null
          : Number(messageChapter),
    })
    setMessageBody('')
    setMessageChapter('')
    await sessionDetail.refetch()
  }

  const handleReact = async (messageId: string, emoji: string) => {
    if (!user) return
    await supabase.from('session_reactions').insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    })
    await sessionDetail.refetch()
  }

  const memberProgressByUser = useMemo(() => {
    const map = new Map<string, number>()
    sessionDetail.members.forEach((m) => {
      map.set(m.user_id, m.current_chapter)
    })
    return map
  }, [sessionDetail.members])

  const reactionsByMessage = useMemo(() => {
    const grouped = new Map<
      string,
      {
        [emoji: string]: number
      }
    >()
    sessionDetail.reactions.forEach((r) => {
      const key = r.message_id
      if (!grouped.has(key)) grouped.set(key, {})
      const bucket = grouped.get(key)!
      bucket[r.emoji] = (bucket[r.emoji] ?? 0) + 1
    })
    return grouped
  }, [sessionDetail.reactions])

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-text">Books &amp; Friends</div>
        <nav className="nav">
          <a href="#library">My library</a>
          <a href="#friends">Friends</a>
          <a href="#activity">Activity</a>
          <a href="#sessions">Sessions</a>
          {user ? (
            <span className="nav-user">
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setDisplayNameDraft(profile?.display_name ?? '')
                  setProfileOpen(true)
                }}
              >
                {profile?.display_name ?? user.email}
              </button>
              <button type="button" className="btn-text" onClick={() => signOut()}>
                Sign out
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn-text primary"
              onClick={() => setAuthOpen(true)}
            >
              Sign in
            </button>
          )}
        </nav>
      </header>

      <main className="app-main">
        <section className="hero">
          <div className="hero-content">
            <h1>Share what you read with the people you love.</h1>
            <p>
              Books &amp; Friends helps you track your books, swap
              recommendations, and see what your friends are reading — all in
              one simple place.
            </p>
            <div className="hero-actions">
              {user ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setAddOpen(true)}
                >
                  Add a book
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setAuthMode('up')
                      setAuthOpen(true)
                    }}
                  >
                    Get started
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setAuthOpen(false)}
                  >
                    Browse as guest
                  </button>
                </>
              )}
            </div>
            {!user && (
              <p className="hint">
                Sign in to save your shelf to Supabase and sync across devices.
              </p>
            )}
          </div>
          <div className="hero-panel">
            <div className="shelf-card">
              <h2>Today&apos;s shelf</h2>
              {authLoading || (user && booksLoading) ? (
                <p className="shelf-loading">Loading…</p>
              ) : user && shelfPreview.length > 0 ? (
                <ul>
                  {shelfPreview.map((b) => (
                    <li key={b.id}>
                      <span className="pill">{STATUS_LABEL[b.status]}</span>
                      <span>
                        {b.title}
                        {b.author ? ` · ${b.author}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : user ? (
                <p className="shelf-empty">
                  No books yet. Click &quot;Add a book&quot; to start.
                </p>
              ) : (
                <ul>
                  <li>
                    <span className="pill">Reading</span>
                    <span>The Midnight Library</span>
                  </li>
                  <li>
                    <span className="pill">Want to read</span>
                    <span>Tomorrow, and Tomorrow, and Tomorrow</span>
                  </li>
                  <li>
                    <span className="pill">Finished</span>
                    <span>Project Hail Mary</span>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="features">
          <div className="feature-card">
            <h3>Track your library</h3>
            <p>Organise books into shelves like Reading, Finished, and Wishlist.</p>
          </div>
          <div className="feature-card">
            <h3>See friends&apos; activity</h3>
            <p>Follow what your friends are reading and loving in real time.</p>
          </div>
          <div className="feature-card">
            <h3>Smart recommendations</h3>
            <p>Discover new books based on your tastes and your circle.</p>
          </div>
        </section>

        <section id="library" className="section">
          <div className="section-header">
            <h2>My library</h2>
            {user && (
              <button type="button" className="secondary" onClick={() => setAddOpen(true)}>
                Add book
              </button>
            )}
          </div>

          {!user ? (
            <p className="muted">Sign in to manage your library.</p>
          ) : booksLoading ? (
            <p className="muted">Loading your books…</p>
          ) : books.length === 0 ? (
            <p className="muted">No books yet.</p>
          ) : (
            <div className="grid-3">
              {(['reading', 'want_to_read', 'finished'] as const).map((status) => (
                <div key={status} className="panel">
                  <h3>{STATUS_LABEL[status]}</h3>
                  <ul className="list">
                    {booksByStatus[status].map((b) => (
                      <li key={b.id} className="list-row">
                        <div className="row-main">
                          <div className="row-title">{b.title}</div>
                          {b.author && <div className="row-sub">{b.author}</div>}
                        </div>
                        <span className="row-meta">{new Date(b.created_at).toLocaleDateString()}</span>
                      </li>
                    ))}
                    {booksByStatus[status].length === 0 && (
                      <li className="muted">Empty</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="friends" className="section">
          <div className="section-header">
            <h2>Friends</h2>
          </div>

          {!user ? (
            <p className="muted">Sign in to add friends.</p>
          ) : (
            <>
              <div className="panel">
                <h3>Your invite code</h3>
                {profileLoading ? (
                  <p className="muted">Loading profile…</p>
                ) : (
                  <p className="code">{profile?.invite_code ?? '—'}</p>
                )}
                <p className="muted">Share this code with a friend so they can add you.</p>
              </div>

              <div className="panel">
                <h3>Add friend</h3>
                <form className="row" onSubmit={handleSendInvite}>
                  <input
                    value={inviteDraft}
                    onChange={(e) => setInviteDraft(e.target.value)}
                    placeholder="Friend invite code"
                  />
                  <button type="submit" className="primary">
                    Send request
                  </button>
                </form>
                {friendsError && <p className="form-error">{friendsError}</p>}
              </div>

              <div className="grid-2">
                <div className="panel">
                  <h3>Incoming</h3>
                  {friends.loading ? (
                    <p className="muted">Loading…</p>
                  ) : friends.incoming.length === 0 ? (
                    <p className="muted">None</p>
                  ) : (
                    <ul className="list">
                      {friends.incoming.map((r) => (
                        <li key={r.id} className="list-row">
                          <div className="row-main">
                            <div className="row-title">
                              {r.otherProfile?.display_name ?? r.otherProfile?.id ?? 'Unknown user'}
                            </div>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => friends.accept(r.id)}
                            >
                              Accept
                            </button>
                            <button type="button" className="btn-text" onClick={() => friends.reject(r.id)}>
                              Reject
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel">
                  <h3>Outgoing</h3>
                  {friends.loading ? (
                    <p className="muted">Loading…</p>
                  ) : friends.outgoing.length === 0 ? (
                    <p className="muted">None</p>
                  ) : (
                    <ul className="list">
                      {friends.outgoing.map((r) => (
                        <li key={r.id} className="list-row">
                          <div className="row-main">
                            <div className="row-title">
                              {r.otherProfile?.display_name ?? r.otherProfile?.id ?? 'Unknown user'}
                            </div>
                            <div className="row-sub">Pending</div>
                          </div>
                          <button type="button" className="btn-text" onClick={() => friends.remove(r.id)}>
                            Cancel
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="panel">
                <h3>Friends</h3>
                {friends.loading ? (
                  <p className="muted">Loading…</p>
                ) : friends.accepted.length === 0 ? (
                  <p className="muted">No friends yet.</p>
                ) : (
                  <ul className="list">
                    {friends.accepted.map((r) => (
                      <li key={r.id} className="list-row">
                        <div className="row-main">
                          <div className="row-title">
                            {r.otherProfile?.display_name ?? r.otherProfile?.id ?? 'Unknown user'}
                          </div>
                        </div>
                        <button type="button" className="btn-text" onClick={() => friends.remove(r.id)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>

        <section id="activity" className="section">
          <div className="section-header">
            <h2>Activity</h2>
            {user && (
              <button type="button" className="btn-text" onClick={() => activity.refetch()}>
                Refresh
              </button>
            )}
          </div>

          {!user ? (
            <p className="muted">Sign in to see your activity feed.</p>
          ) : activity.loading ? (
            <p className="muted">Loading activity…</p>
          ) : activity.activities.length === 0 ? (
            <p className="muted">No activity yet. Add a book or add a friend.</p>
          ) : (
            <ul className="list">
              {activity.activities.map((a) => (
                <li key={a.id} className="list-row">
                  <div className="row-main">
                    <div className="row-title">{a.verb.replaceAll('_', ' ')}</div>
                    <div className="row-sub">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <span className="row-meta">{a.object_type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="sessions" className="section">
          <div className="section-header">
            <h2>Sessions</h2>
            {user && (
              <button
                type="button"
                className="secondary"
                onClick={() => setSessionModalOpen(true)}
              >
                Create session
              </button>
            )}
          </div>

          {!user ? (
            <p className="muted">Sign in to create and join sessions.</p>
          ) : sessions.loading ? (
            <p className="muted">Loading sessions…</p>
          ) : sessions.sessions.length === 0 ? (
            <p className="muted">No sessions yet. Create one to start reading together.</p>
          ) : (
            <div className="grid-2">
              <div className="panel">
                <h3>All sessions</h3>
                <ul className="list">
                  {sessions.sessions.map((s) => {
                    const mine = sessionDetail.members.some((m) => m.user_id === user.id)
                    const isActive = activeSessionId === s.id
                    return (
                      <li key={s.id} className="list-row">
                        <div className="row-main">
                          <div className="row-title">{s.book_title}</div>
                          {s.book_author && <div className="row-sub">{s.book_author}</div>}
                          <div className="row-sub">
                            {s.is_public ? 'Public session' : 'Private session'} ·{' '}
                            {s.total_chapters} chapters
                          </div>
                        </div>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() => setActiveSessionId(s.id)}
                          >
                            {isActive ? 'Viewing' : 'View'}
                          </button>
                          {!mine && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => handleJoinSession(s.id)}
                            >
                              Join
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="panel">
                <h3>Session detail</h3>
                {!activeSessionId ? (
                  <p className="muted">Select a session from the list.</p>
                ) : sessionDetail.loading || !sessionDetail.session ? (
                  <p className="muted">Loading session…</p>
                ) : (
                  <>
                    <div className="session-header">
                      <div>
                        <div className="row-title">{sessionDetail.session.book_title}</div>
                        {sessionDetail.session.book_author && (
                          <div className="row-sub">{sessionDetail.session.book_author}</div>
                        )}
                        <div className="row-sub">
                          {sessionDetail.session.total_chapters} chapters ·{' '}
                          {sessionDetail.session.is_public ? 'Public' : 'Private'}
                        </div>
                      </div>
                    </div>

                    <h4>Members</h4>
                    {sessionDetail.members.length === 0 ? (
                      <p className="muted">No members yet.</p>
                    ) : (
                      <ul className="list">
                        {sessionDetail.members.map((m) => {
                          const progress =
                            (m.current_chapter /
                              (sessionDetail.session?.total_chapters || 1)) *
                            100
                          const isMe = m.user_id === user.id
                          return (
                            <li key={m.id} className="list-row">
                              <div className="row-main">
                                <div className="row-title">
                                  {m.user_id === user.id ? 'You' : m.user_id}
                                </div>
                                <div className="progress-row">
                                  <div className="progress-bar">
                                    <div
                                      className="progress-bar-fill"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                  <span className="row-meta">
                                    chapter {m.current_chapter} of{' '}
                                    {sessionDetail.session?.total_chapters}
                                  </span>
                                </div>
                              </div>
                              {isMe && (
                                <input
                                  type="number"
                                  min={0}
                                  max={sessionDetail.session?.total_chapters || 1}
                                  value={memberProgressByUser.get(user.id) ?? m.current_chapter}
                                  onChange={(e) =>
                                    handleUpdateProgress(
                                      m.session_id,
                                      Number(e.target.value || 0),
                                    )
                                  }
                                  className="chapter-input"
                                />
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    <h4>Discussion</h4>
                    {sessionDetail.messages.length === 0 ? (
                      <p className="muted">No messages yet. Start the conversation.</p>
                    ) : (
                      <ul className="list">
                        {sessionDetail.messages.map((msg) => {
                          const grouped = reactionsByMessage.get(msg.id) ?? {}
                          return (
                            <li key={msg.id} className="list-row">
                              <div className="row-main">
                                <div className="row-title">
                                  {msg.body}
                                </div>
                                <div className="row-sub">
                                  {new Date(msg.created_at).toLocaleString()}
                                  {msg.chapter_number != null &&
                                    ` · Ch. ${msg.chapter_number}`}
                                </div>
                                <div className="reactions-row">
                                  {Object.entries(grouped).map(([emoji, count]) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      className="reaction-chip"
                                      onClick={() => handleReact(msg.id, emoji)}
                                    >
                                      <span>{emoji}</span>
                                      <span>{count}</span>
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className="reaction-chip"
                                    onClick={() => handleReact(msg.id, '👍')}
                                  >
                                    👍
                                  </button>
                                  <button
                                    type="button"
                                    className="reaction-chip"
                                    onClick={() => handleReact(msg.id, '❤️')}
                                  >
                                    ❤️
                                  </button>
                                  <button
                                    type="button"
                                    className="reaction-chip"
                                    onClick={() => handleReact(msg.id, '😂')}
                                  >
                                    😂
                                  </button>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    <form className="session-message-form" onSubmit={handleSendMessage}>
                      <textarea
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        placeholder="Write a message…"
                        rows={3}
                      />
                      <div className="session-message-footer">
                        <input
                          type="number"
                          min={1}
                          max={sessionDetail.session?.total_chapters || 1}
                          value={messageChapter}
                          onChange={(e) =>
                            setMessageChapter(
                              e.target.value === '' ? '' : Number(e.target.value),
                            )
                          }
                          className="chapter-input"
                          placeholder="Chapter"
                        />
                        <button type="submit" className="primary">
                          Send
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <span>Books &amp; Friends · Powered by Supabase</span>
      </footer>

      {authOpen && (
        <div className="modal-backdrop" onClick={() => setAuthOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{authMode === 'in' ? 'Sign in' : 'Sign up'}</h2>
            <form onSubmit={handleAuth}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={authMode === 'up' ? 'new-password' : 'current-password'}
              />
              {authError && <p className="form-error">{authError}</p>}
              <button type="submit" className="primary">
                {authMode === 'in' ? 'Sign in' : 'Sign up'}
              </button>
            </form>
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setAuthMode(authMode === 'in' ? 'up' : 'in')
                setAuthError(null)
              }}
            >
              {authMode === 'in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
            </button>
            <button type="button" className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
        </div>
      )}

      {addOpen && user && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add a book</h2>
            <form onSubmit={handleAddBook}>
              <input
                type="text"
                placeholder="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Author (optional)"
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
              />
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as BookStatus)}
              >
                <option value="reading">Reading</option>
                <option value="want_to_read">Want to read</option>
                <option value="finished">Finished</option>
              </select>
              <button type="submit" className="primary">
                Add book
              </button>
            </form>
            <button type="button" className="modal-close" onClick={() => setAddOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
        </div>
      )}

      {profileOpen && user && (
        <div className="modal-backdrop" onClick={() => setProfileOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Profile</h2>
            <form onSubmit={handleProfileSave}>
              <input
                type="text"
                placeholder="Display name"
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                required
              />
              <button type="submit" className="primary">
                Save
              </button>
            </form>
            <button
              type="button"
              className="modal-close"
              onClick={() => setProfileOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {sessionModalOpen && user && (
        <div className="modal-backdrop" onClick={() => setSessionModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create session</h2>
            <form onSubmit={handleCreateSession}>
              <input
                type="text"
                placeholder="Book title"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Author (optional)"
                value={sessionAuthor}
                onChange={(e) => setSessionAuthor(e.target.value)}
              />
              <input
                type="number"
                min={1}
                placeholder="Total chapters"
                value={sessionChapters}
                onChange={(e) => setSessionChapters(Number(e.target.value || 1))}
              />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={sessionIsPublic}
                  onChange={(e) => setSessionIsPublic(e.target.checked)}
                />
                <span>Public session</span>
              </label>
              {sessionError && <p className="form-error">{sessionError}</p>}
              <button type="submit" className="primary">
                Create
              </button>
            </form>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSessionModalOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
