## Reading sessions MVP specification

### 1. Concept

- **Goal**: Let a small group of friends read a single book “together” in a shared session with:
  - Shared progress (by chapters, not pages)
  - A flat discussion thread
  - Lightweight emoji reactions on messages
- **Scope**: Asynchronous, Supabase-backed feature. No notifications, no search, no real-time presence in v1.

### 2. Session model

- **Session**
  - **id**: UUID
  - **host_id**: `auth.users.id` who created the session
  - **book_title**: text (required)
  - **book_author**: text (optional)
  - **total_chapters**: integer > 0 (required)
  - **is_public**: boolean
    - `true`: any authenticated user can discover and join
    - `false`: only members can see; joining requires a direct link or an explicit add by a member (exact v1 UX decided in implementation)
  - **created_at**: timestamptz
  - **archived_at**: timestamptz (nullable) – for sessions no longer active

- **SessionMember**
  - **id**: UUID
  - **session_id**: references `sessions.id`
  - **user_id**: references `auth.users.id`
  - **joined_at**: timestamptz
  - **last_seen_at**: timestamptz (nullable)
  - **current_chapter**: integer (0..total_chapters) – per-member progress

- **SessionMessage**
  - **id**: UUID
  - **session_id**: references `sessions.id`
  - **author_id**: references `auth.users.id`
  - **body**: text (non-empty)
  - **created_at**: timestamptz
  - **chapter_number**: integer (nullable)
    - Optional, lets users tag a chapter that their comment refers to.
  - **parent_id**: always null in v1 (flat discussion; kept for future threading)

- **SessionReaction**
  - **id**: UUID
  - **message_id**: references `session_messages.id`
  - **user_id**: references `auth.users.id`
  - **emoji**: text (short string; e.g. Unicode emoji or colon-code)
  - **created_at**: timestamptz
  - **Constraint**: a user may react multiple times on the same message with the **same or different** emoji (no uniqueness requirement in v1).

### 3. Permissions and RLS (high level)

- **General**
  - Only authenticated users can create, join, or view sessions.
  - No extra host-only permissions in v1, beyond being recorded as `host_id`.

- **Sessions**
  - **Read**
    - Public sessions: visible to all authenticated users.
    - Private sessions: visible only to members (rows where `exists member(user_id = auth.uid())`).
  - **Write**
    - Create: any authenticated user.
    - Update / archive: v1 can allow any session member to edit core fields; host has no stricter rules yet.

- **SessionMember**
  - A user can only see membership rows for sessions they can see by the rules above.
  - A user can only create a member row where `user_id = auth.uid()` (joining a session).
  - A user can update their own membership row (`current_chapter`, `last_seen_at`).

- **SessionMessage**
  - Read:
    - Messages are visible only to users who are members of the same session.
  - Write:
    - Insert: only session members (`exists member(user_id = auth.uid())`).
    - Update / delete: v1 can allow authors to delete their own messages; editing can be omitted for now.

- **SessionReaction**
  - Read: visible to session members only.
  - Write: only session members; no uniqueness constraints per user+emoji.

### 4. Progress model and UI

- **Per-member progress**
  - Stored as `current_chapter` on `session_members`.
  - Range: `0` (not started) to `total_chapters`.
  - UI: allow member to pick their current chapter from a discrete selector or increment controls.

- **Progress bar**
  - For each member, display a horizontal progress bar:
    - `progress = current_chapter / total_chapters`.
    - Show numeric label: `"chapter X of Y"`.
  - Session view includes:
    - A compact list of members with avatar/initials, display name, and per-member chapter progress bar.

### 5. Discussion model and UI

- **Flat discussion**
  - Single chronological list of messages per session.
  - Messages show:
    - Author display name
    - Timestamp
    - Optional tagged chapter (e.g. “Ch. 7”)
    - Body text
    - Reactions summary

- **Reactions**
  - Under each message, show grouped reaction chips, e.g.:
    - [🔥 3] [❤️ 2] [😂 1]
  - Clicking an existing chip adds another reaction with that emoji from the current user.
  - A generic “Add reaction” control opens an emoji picker or a small fixed set.
  - Multiple reactions per user and per emoji are allowed; counts are a simple tally of rows.

### 6. Core flows

- **Create session**
  - Inputs:
    - Book title (required)
    - Author (optional)
    - Total chapters (required, positive integer)
    - Visibility: Public / Private
  - Effect:
    - Insert into `sessions` with `host_id = auth.uid()`.
    - Insert `session_members` row for host with `current_chapter = 0`.
    - Redirect to session detail view.

- **Join session**
  - Public:
    - From a “Public sessions” list or direct link, user clicks “Join session”.
  - Private:
    - Join from a shared link; server checks if joining private sessions is allowed in v1 (implementation detail).
  - Effect:
    - Upsert `session_members` row for the user; subsequent access allowed via RLS.

- **Update progress**
  - In the session detail view, user picks current chapter:
    - Either via a slider, stepper, or dropdown.
  - Effect:
    - Update `session_members.current_chapter` for that user.

- **Post message**
  - Inputs:
    - Message body (required)
    - Optional chapter selector (e.g. “this message is about chapter X”).
  - Effect:
    - Insert row into `session_messages`.

- **React to message**
  - Inputs:
    - Chosen emoji.
  - Effect:
    - Insert row into `session_reactions` with `user_id = auth.uid()`, no uniqueness requirement.

- **Leave session**
  - Optional v1 feature:
    - User can “Leave session” which deletes or marks their `session_members` row.
    - Messages and reactions remain; membership is only used for access and progress.

### 7. Non-goals for v1

- No notifications (email, push, in-app).
- No search or filtering across sessions, messages, or books.
- No host-only actions beyond setting initial `is_public`.
- No threaded replies; only flat discussion.
- No per-message editing; only creation (and optional deletion).

### 8. Supabase setup (current)

- **Environment**
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are defined in `.env` and consumed via `src/lib/supabase.ts`.
  - Type-safe access to env vars is declared in `src/vite-env.d.ts`.

- **Core tables**
  - `auth.users` (managed by Supabase) – email/password auth enabled.
  - `public.profiles`
    - Columns: `id (uuid, pk → auth.users.id)`, `display_name`, `avatar_url`, `invite_code`, `updated_at`.
    - Trigger `handle_new_user` creates a profile row on signup and sets a default display name.
    - Trigger `profiles_set_invite_code` keeps a unique `invite_code` (10-char token) per profile.
  - `public.user_books`
    - Per-user shelves with `status in ('reading', 'want_to_read', 'finished')`.
  - `public.friendships`
    - Friend requests and accepted/rejected relationships between users.
  - `public.activities`
    - Denormalised activity feed for books and friendships.
  - `public.sessions`, `public.session_members`, `public.session_messages`, `public.session_reactions`
    - Schema matches the session models in this spec (one book per session, per-member chapter progress, flat discussion, emoji reactions).

- **Row Level Security (RLS) overview**
  - RLS is enabled on: `profiles`, `user_books`, `friendships`, `activities`, `sessions`, `session_members`, `session_messages`, `session_reactions`.
  - Profiles:
    - Authenticated users can select any profile (`Authenticated can view profiles`).
    - Users can insert/update only their own profile rows.
  - User books:
    - Users can select/insert/update/delete only rows with `user_id = auth.uid()`.
  - Friendships:
    - Users can see friendships where they are requester or addressee.
    - Only requester can create/update their own requests; addressee can respond; both can delete their own friendships.
  - Activities:
    - Users can insert their own activities.
    - Users can view their own and accepted friends' activities (`Users can view own and friends activities`).
  - Sessions:
    - Select:
      - Any authenticated user can see public sessions.
      - Private sessions are visible only to members (`Sessions are visible to members and for public`).
    - Insert:
      - Any authenticated user can create a session where `host_id = auth.uid()` (`Users can create sessions as host`).
    - Update:
      - Any member can update a session in v1 (`Members can update sessions`).
  - Session members:
    - Users can join by inserting a row where `user_id = auth.uid()` for a session they are allowed to see.
    - Users can update/delete only their own membership rows.
  - Session messages:
    - Only members of the session can read or insert messages; authors can delete their own messages.
  - Session reactions:
    - Only members of the session can read or insert reactions.

- **Triggers and helpers**
  - `public.handle_new_user()` – creates profile for new `auth.users` row.
  - `public.ensure_invite_code()` – ensures `profiles.invite_code` is present and unique.
  - `public.log_user_book_activity()` – writes `activities` rows when a book is added or status changes.
  - `public.log_friendship_activity()` – writes `activities` rows on friend request / accept / reject.
  - `public.can_view_session(session_id uuid)` – helper used by RLS policies to centralise "can this user see this session?" logic.

