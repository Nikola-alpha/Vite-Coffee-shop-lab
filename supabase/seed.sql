-- Seed data for two known users (by email).
-- Run this in Supabase SQL Editor (requires access to auth schema).
--
-- It will:
-- - Ensure each user has a profile row
-- - Update their display_name
-- - Insert starter books into public.user_books

do $$
declare
  u1 uuid;
  u2 uuid;
begin
  select id into u1 from auth.users where email = 'yekhaung2223@gmail.com';
  select id into u2 from auth.users where email = 'yekhaung131313@gmail.com';

  if u1 is null then
    raise exception 'User not found: yekhaung2223@gmail.com';
  end if;
  if u2 is null then
    raise exception 'User not found: yekhaung131313@gmail.com';
  end if;

  insert into public.profiles (id, display_name)
  values (u1, 'Ye Khaung (2223)'), (u2, 'Ye Khaung (131313)')
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  -- Clear existing seed books for repeatable runs (optional)
  delete from public.user_books
   where user_id in (u1, u2)
     and title in (
       'Project Hail Mary',
       'Atomic Habits',
       'The Midnight Library',
       'Tomorrow, and Tomorrow, and Tomorrow',
       'Deep Work',
       'Clean Code'
     );

  insert into public.user_books (user_id, title, author, status)
  values
    (u1, 'Atomic Habits', 'James Clear', 'reading'),
    (u1, 'Deep Work', 'Cal Newport', 'want_to_read'),
    (u1, 'Project Hail Mary', 'Andy Weir', 'finished'),

    (u2, 'The Midnight Library', 'Matt Haig', 'reading'),
    (u2, 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'want_to_read'),
    (u2, 'Clean Code', 'Robert C. Martin', 'finished');
end $$;

