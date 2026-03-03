-- Friends + Activity MVP

-- Invite codes (human-shareable) so users can add friends without email lookup.
alter table public.profiles
  add column if not exists invite_code text;

create unique index if not exists profiles_invite_code_unique
  on public.profiles (invite_code)
  where invite_code is not null;

create or replace function public.ensure_invite_code()
returns trigger
language plpgsql
as $$
begin
  if new.invite_code is null or length(new.invite_code) < 8 then
    -- 10-char hex-ish code; low collision risk for MVP.
    new.invite_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_invite_code on public.profiles;
create trigger profiles_set_invite_code
  before insert or update on public.profiles
  for each row execute function public.ensure_invite_code();

-- Friend requests/relationships
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair
  on public.friendships (requester_id, addressee_id);

create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status, created_at desc);

create index if not exists friendships_requester_status_idx
  on public.friendships (requester_id, status, created_at desc);

alter table public.friendships enable row level security;

drop policy if exists "Users can view own friendships" on public.friendships;
create policy "Users can view own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "Users can create friend requests as self" on public.friendships;
create policy "Users can create friend requests as self"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

drop policy if exists "Requester can update request" on public.friendships;
create policy "Requester can update request"
  on public.friendships for update
  using (auth.uid() = requester_id);

drop policy if exists "Addressee can respond to request" on public.friendships;
create policy "Addressee can respond to request"
  on public.friendships for update
  using (auth.uid() = addressee_id);

drop policy if exists "Users can delete own friendships" on public.friendships;
create policy "Users can delete own friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists friendships_touch_updated_at on public.friendships;
create trigger friendships_touch_updated_at
  before update on public.friendships
  for each row execute function public.touch_updated_at();

-- Activity feed (denormalized)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  verb text not null, -- e.g. 'book_added', 'book_status_changed', 'friend_accepted'
  object_type text not null, -- e.g. 'user_book', 'friendship'
  object_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists activities_actor_created_idx
  on public.activities (actor_id, created_at desc);

alter table public.activities enable row level security;

-- MVP privacy: users can only see their own activities.
-- (Later: expand to include friends.)
drop policy if exists "Users can view own activities" on public.activities;
create policy "Users can view own activities"
  on public.activities for select
  using (auth.uid() = actor_id);

drop policy if exists "Users can insert own activities" on public.activities;
create policy "Users can insert own activities"
  on public.activities for insert
  with check (auth.uid() = actor_id);

