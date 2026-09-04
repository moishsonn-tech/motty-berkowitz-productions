-- Motty Berkowitz Productions — Row Level Security policy
-- Run once in the Supabase SQL editor, after schema.sql. Same layout/pattern as
-- ensautogroup's supabase/policies.sql.

-- RLS policies only control ROW visibility — Postgres also needs table-level GRANTs before the
-- anon/authenticated roles can touch the tables at all. If the project was created with
-- "Automatically expose new tables" unchecked (recommended), this step is required or every
-- query fails with "permission denied for table X" even though a policy allows it.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on locations, contacts, projects, extra_events
  to anon, authenticated;

-- ── Allowlist table ───────────────────────────────────────────────────────
-- Who's allowed to sign in and touch data. Email-based (not user_id) so an admin can add
-- someone before they've ever signed up — Supabase Auth account creation itself stays open
-- (any email can request a magic link), but DATA ACCESS is gated by this table, checked in
-- every RLS policy below. Self-referential policy: only an already-allowed user can
-- read/add/remove rows — this is also what the in-app Settings "Manage users" screen calls
-- directly (no service_role key, no custom backend needed).
create table if not exists allowed_emails (
  email text primary key,
  added_by text,
  created_at timestamptz not null default now()
);
alter table allowed_emails enable row level security;
grant usage on schema public to authenticated;
grant select, insert, delete on allowed_emails to authenticated;

-- A policy that queries the SAME table it protects causes "infinite recursion detected in
-- policy" — Postgres re-applies the policy to the inner SELECT too. Wrap the lookup in a
-- SECURITY DEFINER function instead; it runs with the function owner's privileges, bypassing
-- RLS for its own internal query, which breaks the recursion.
create or replace function is_allowed_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from allowed_emails where lower(email) = lower(check_email));
$$;

drop policy if exists "allowed_emails_self" on allowed_emails;
create policy "allowed_emails_self" on allowed_emails
  for all
  using (is_allowed_email(auth.jwt()->>'email'))
  with check (is_allowed_email(auth.jwt()->>'email'));

-- Bootstrap the first allowed user (run once — replace with Motty's real email):
-- insert into allowed_emails (email, added_by) values ('motty@example.com', 'bootstrap')
--   on conflict (email) do nothing;

-- ── Data tables: locked down to the allowlist ─────────────────────────────
drop policy if exists "locations_allowed_users" on locations;
create policy "locations_allowed_users" on locations
  for all
  using (is_allowed_email(auth.jwt()->>'email'))
  with check (is_allowed_email(auth.jwt()->>'email'));

drop policy if exists "contacts_allowed_users" on contacts;
create policy "contacts_allowed_users" on contacts
  for all
  using (is_allowed_email(auth.jwt()->>'email'))
  with check (is_allowed_email(auth.jwt()->>'email'));

drop policy if exists "projects_allowed_users" on projects;
create policy "projects_allowed_users" on projects
  for all
  using (is_allowed_email(auth.jwt()->>'email'))
  with check (is_allowed_email(auth.jwt()->>'email'));

drop policy if exists "extra_events_allowed_users" on extra_events;
create policy "extra_events_allowed_users" on extra_events
  for all
  using (is_allowed_email(auth.jwt()->>'email'))
  with check (is_allowed_email(auth.jwt()->>'email'));
