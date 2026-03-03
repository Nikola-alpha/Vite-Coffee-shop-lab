# Supabase setup

1. Open your [Supabase project](https://supabase.com/dashboard) → **SQL Editor**.
2. Run migrations in order:
   - `migrations/001_initial_schema.sql`
   - `migrations/002_friends_and_activity.sql`
   - `migrations/003_mvp_policies_and_triggers.sql`
   - `migrations/004_sessions.sql`
3. In **Authentication → Providers**, ensure **Email** is enabled so users can sign up/sign in.

Optional seed:
- Run `seed.sql` to set display names + starter books for the two test users.
