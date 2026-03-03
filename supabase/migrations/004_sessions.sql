-- Reading sessions MVP schema and RLS

-- Sessions (one book per session)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  book_title text not null,
  book_author text,
  total_chapters integer not null check (total_chapters > 0),
  is_public boolean not null default false,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create index if not exists sessions_is_public_created_idx
  on public.sessions (is_public, created_at desc);

alter table public.sessions enable row level security;

-- Helper: can current user view a given session?
create or replace function public.can_view_session(p_session_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.sessions s
     where s.id = p_session_id
       and (
         s.is_public
         or exists (
           select 1
             from public.session_members sm
            where sm.session_id = s.id
              and sm.user_id = auth.uid()
         )
       )
  );
$$;

-- Session members
create table if not exists public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz default now(),
  last_seen_at timestamptz,
  current_chapter integer not null default 0
);

create unique index if not exists session_members_unique
  on public.session_members (session_id, user_id);

create index if not exists session_members_session_idx
  on public.session_members (session_id);

alter table public.session_members enable row level security;

-- Session messages (flat discussion)
create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz default now(),
  chapter_number integer,
  parent_id uuid
);

create index if not exists session_messages_session_created_idx
  on public.session_messages (session_id, created_at desc);

alter table public.session_messages enable row level security;

-- Session reactions (multiple per user/message allowed)
create table if not exists public.session_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.session_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now()
);

create index if not exists session_reactions_message_idx
  on public.session_reactions (message_id);

alter table public.session_reactions enable row level security;

-- RLS policies

-- Sessions: authenticated users can see public sessions or sessions they are members of.
drop policy if exists "Sessions are visible to members and for public" on public.sessions;
create policy "Sessions are visible to members and for public"
  on public.sessions for select
  using (
    auth.uid() is not null
    and (
      is_public
      or exists (
        select 1
          from public.session_members sm
         where sm.session_id = sessions.id
           and sm.user_id = auth.uid()
      )
    )
  );

-- Any authenticated user can create sessions (host_id must be them).
drop policy if exists "Users can create sessions as host" on public.sessions;
create policy "Users can create sessions as host"
  on public.sessions for insert
  with check (
    auth.uid() is not null
    and host_id = auth.uid()
  );

-- Any member can update a session in v1 (no special host rules yet).
drop policy if exists "Members can update sessions" on public.sessions;
create policy "Members can update sessions"
  on public.sessions for update
  using (
    exists (
      select 1
        from public.session_members sm
       where sm.session_id = sessions.id
         and sm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.session_members sm
       where sm.session_id = sessions.id
         and sm.user_id = auth.uid()
    )
  );

-- Session members: visible only when user can see the session.
drop policy if exists "Members can view session member rows they can see" on public.session_members;
create policy "Members can view session member rows they can see"
  on public.session_members for select
  using (
    public.can_view_session(session_id)
  );

-- Join session: user can create a membership row for themselves.
drop policy if exists "Users can join sessions as themselves" on public.session_members;
create policy "Users can join sessions as themselves"
  on public.session_members for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and public.can_view_session(session_id)
  );

-- Update membership (progress / last_seen): only the member themselves.
drop policy if exists "Users can update own membership" on public.session_members;
create policy "Users can update own membership"
  on public.session_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optionally allow users to leave a session (delete own membership).
drop policy if exists "Users can delete own membership" on public.session_members;
create policy "Users can delete own membership"
  on public.session_members for delete
  using (auth.uid() = user_id);

-- Messages: only members can read/insert/update/delete.
drop policy if exists "Members can view session messages" on public.session_messages;
create policy "Members can view session messages"
  on public.session_messages for select
  using (
    public.can_view_session(session_id)
  );

drop policy if exists "Members can insert session messages" on public.session_messages;
create policy "Members can insert session messages"
  on public.session_messages for insert
  with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and public.can_view_session(session_id)
  );

-- Allow authors to delete their own messages.
drop policy if exists "Authors can delete own messages" on public.session_messages;
create policy "Authors can delete own messages"
  on public.session_messages for delete
  using (auth.uid() = author_id);

-- Reactions: only members can read/insert.
drop policy if exists "Members can view reactions" on public.session_reactions;
create policy "Members can view reactions"
  on public.session_reactions for select
  using (
    exists (
      select 1
        from public.session_messages m
       where m.id = session_reactions.message_id
         and public.can_view_session(m.session_id)
    )
  );

drop policy if exists "Members can react to messages" on public.session_reactions;
create policy "Members can react to messages"
  on public.session_reactions for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
        from public.session_messages m
        join public.session_members sm on sm.session_id = m.session_id
       where m.id = session_reactions.message_id
         and sm.user_id = auth.uid()
    )
  );

