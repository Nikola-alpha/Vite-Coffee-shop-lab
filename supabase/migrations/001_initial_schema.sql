-- Profiles: one row per auth user (optional display name / avatar)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- User books: each row is a book on a user's shelf with a status
create table if not exists public.user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  author text,
  status text not null check (status in ('reading', 'want_to_read', 'finished')),
  created_at timestamptz default now()
);

create index if not exists user_books_user_id_idx on public.user_books (user_id);
create index if not exists user_books_status_idx on public.user_books (user_id, status);

-- RLS
alter table public.profiles enable row level security;
alter table public.user_books enable row level security;

-- Profiles: users can read/update own row
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- User books: users can only access their own rows
drop policy if exists "Users can view own books" on public.user_books;
create policy "Users can view own books"
  on public.user_books for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own books" on public.user_books;
create policy "Users can insert own books"
  on public.user_books for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own books" on public.user_books;
create policy "Users can update own books"
  on public.user_books for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own books" on public.user_books;
create policy "Users can delete own books"
  on public.user_books for delete
  using (auth.uid() = user_id);

-- Create profile on signup (optional trigger)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
