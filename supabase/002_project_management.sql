-- Motty Berkowitz Productions — project-management upgrade (run after schema.sql + policies.sql).
-- Purely additive: new nullable/defaulted columns + new tables, so an older frontend keeps working.

-- ── Projects: PM fields ──────────────────────────────────────────────────
alter table projects add column if not exists client_id uuid;
alter table projects add column if not exists priority text not null default 'normal';   -- low | normal | high | urgent
alter table projects add column if not exists due_date date;                              -- final delivery due
alter table projects add column if not exists release_date date;                          -- music-video release / premiere
alter table projects add column if not exists brief text;                                 -- what the client asked for
alter table projects add column if not exists tags jsonb not null default '[]'::jsonb;
alter table projects add column if not exists archived boolean not null default false;
alter table projects add column if not exists tasks jsonb not null default '[]'::jsonb;         -- [{id,title,status,due,priority,phase,assignee,notes,done_at}]
alter table projects add column if not exists deliverables jsonb not null default '[]'::jsonb;  -- [{id,name,format,due,status,versions:[{v,link,date,feedback}],revisionsAllowed}]
alter table projects add column if not exists links jsonb not null default '[]'::jsonb;         -- [{id,label,url,kind}]
alter table projects add column if not exists gear jsonb not null default '[]'::jsonb;          -- [{id,item,packed,rented,cost}]
alter table projects add column if not exists activity jsonb not null default '[]'::jsonb;      -- [{id,at,by,kind,text}]
alter table projects add column if not exists time_entries jsonb not null default '[]'::jsonb;  -- [{id,date,hours,phase,note}]
alter table projects add column if not exists expenses jsonb not null default '[]'::jsonb;      -- [{id,date,desc,amount,category}]
alter table projects add column if not exists proposal jsonb;                                   -- {status,html,updatedAt,sentAt,acceptedAt,total}

-- ── Events: meeting fields (Google Meet / Zoom / in person) ──────────────
alter table extra_events add column if not exists attendees jsonb not null default '[]'::jsonb;  -- emails
alter table extra_events add column if not exists meeting_kind text;                            -- meet | zoom | phone | in_person
alter table extra_events add column if not exists meeting_link text;
alter table extra_events add column if not exists gcal_event_id text;
alter table extra_events add column if not exists duration_min int;
alter table extra_events add column if not exists start_iso timestamptz;                        -- exact start, for calendar sync
alter table extra_events add column if not exists notes text;

-- ── Clients (CRM) ────────────────────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  email text,
  phone text,
  instagram text,
  source text,              -- referral, instagram, website…
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists clients_set_updated_at on clients;
create trigger clients_set_updated_at before update on clients for each row execute function set_updated_at();

-- ── Shared app settings (style guide, price list, task templates) ───────
create table if not exists app_settings (
  id text primary key,      -- e.g. 'style', 'templates'
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists app_settings_set_updated_at on app_settings;
create trigger app_settings_set_updated_at before update on app_settings for each row execute function set_updated_at();

-- ── Google tokens: server-only (edge functions use the service role; no client grants) ──
create table if not exists google_tokens (
  id text primary key default 'calendar',
  email text,
  refresh_token text,
  calendar_id text default 'primary',
  connected_at timestamptz not null default now()
);
alter table google_tokens enable row level security;
revoke all on google_tokens from anon, authenticated;

-- ── RLS + grants for the new shared tables ───────────────────────────────
alter table clients enable row level security;
alter table app_settings enable row level security;
grant select, insert, update, delete on clients, app_settings to authenticated;

drop policy if exists "clients_allowed_users" on clients;
create policy "clients_allowed_users" on clients for all
  using (is_allowed_email(auth.jwt()->>'email')) with check (is_allowed_email(auth.jwt()->>'email'));
drop policy if exists "app_settings_allowed_users" on app_settings;
create policy "app_settings_allowed_users" on app_settings for all
  using (is_allowed_email(auth.jwt()->>'email')) with check (is_allowed_email(auth.jwt()->>'email'));

-- Signed-out visitors never need these.
revoke all on locations, contacts, projects, extra_events from anon;

alter publication supabase_realtime add table clients, app_settings;
