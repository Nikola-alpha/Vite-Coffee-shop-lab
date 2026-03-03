-- MVP adjustments after initial setup:
-- - allow authenticated users to read profiles (for friends UI)
-- - allow viewing friends' activities
-- - backfill invite_code for existing profiles
-- - auto-log activities for books + friendships

-- Profiles: broaden select policy (keep update restricted to self)
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Authenticated can view profiles"
  on public.profiles for select
  using (auth.uid() is not null);

-- Backfill invite codes for existing rows (trigger will populate)
update public.profiles
   set updated_at = updated_at
 where invite_code is null;

-- Activities: allow viewing own + accepted friends
drop policy if exists "Users can view own activities" on public.activities;
create policy "Users can view own and friends activities"
  on public.activities for select
  using (
    auth.uid() = actor_id
    or exists (
      select 1
        from public.friendships f
       where f.status = 'accepted'
         and (
           (f.requester_id = auth.uid() and f.addressee_id = activities.actor_id)
           or (f.addressee_id = auth.uid() and f.requester_id = activities.actor_id)
         )
    )
  );

-- Activity triggers
create or replace function public.log_user_book_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activities (actor_id, verb, object_type, object_id, metadata)
    values (
      new.user_id,
      'book_added',
      'user_book',
      new.id,
      jsonb_build_object('title', new.title, 'author', new.author, 'status', new.status)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.activities (actor_id, verb, object_type, object_id, metadata)
    values (
      new.user_id,
      'book_status_changed',
      'user_book',
      new.id,
      jsonb_build_object(
        'title', new.title,
        'author', new.author,
        'from', old.status,
        'to', new.status
      )
    );
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists user_books_log_activity on public.user_books;
create trigger user_books_log_activity
  after insert or update on public.user_books
  for each row execute function public.log_user_book_activity();

create or replace function public.log_friendship_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activities (actor_id, verb, object_type, object_id, metadata)
    values (
      new.requester_id,
      'friend_requested',
      'friendship',
      new.id,
      jsonb_build_object('to', new.addressee_id)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      insert into public.activities (actor_id, verb, object_type, object_id, metadata)
      values (
        auth.uid(),
        'friend_accepted',
        'friendship',
        new.id,
        jsonb_build_object('requester_id', new.requester_id, 'addressee_id', new.addressee_id)
      );
    elsif new.status = 'rejected' then
      insert into public.activities (actor_id, verb, object_type, object_id, metadata)
      values (
        auth.uid(),
        'friend_rejected',
        'friendship',
        new.id,
        jsonb_build_object('requester_id', new.requester_id, 'addressee_id', new.addressee_id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_log_activity on public.friendships;
create trigger friendships_log_activity
  after insert or update on public.friendships
  for each row execute function public.log_friendship_activity();

