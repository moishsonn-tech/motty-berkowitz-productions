-- Motty Berkowitz Productions — Supabase schema
-- Run once in the Supabase project's SQL editor (Dashboard → SQL Editor → New query → paste →
-- Run), then run policies.sql. Same layout/pattern as ensautogroup's supabase/schema.sql.

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text,
  address text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  role text,
  rate text,               -- display string, e.g. "$400/day" or "$75/hr" — parsed client-side
  phone text,
  avail text not null default 'available',   -- 'available' | 'booked' | 'unavailable'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text,
  client text,
  type text,
  stage text not null default 'inquiry',     -- 'inquiry' | 'pre' | 'post' | 'delivered'
  shoot_date date,
  call_time text,
  wrap_time text,
  budget text,              -- display string, e.g. "$4,200"
  script_mode text,
  location_ids jsonb not null default '[]'::jsonb,   -- array of location ids
  crew jsonb not null default '[]'::jsonb,            -- array of contact ids
  crew_pay jsonb not null default '{}'::jsonb,        -- {contactId: {amount, paid}}
  scenes jsonb not null default '[]'::jsonb,          -- regular-mode top-level scenes
  song_parts jsonb not null default '[]'::jsonb,      -- music-video mode (nested scenes inside)
  invoice jsonb,                                       -- lazily created, nullable
  notes text,
  callsheet_doc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists extra_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  type text,
  label text,
  date date,
  call_time text,
  wrap_time text,
  crew jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current on every write.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists locations_set_updated_at on locations;
create trigger locations_set_updated_at before update on locations
  for each row execute function set_updated_at();
drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at before update on contacts
  for each row execute function set_updated_at();
drop trigger if exists projects_set_updated_at on projects;
create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
drop trigger if exists extra_events_set_updated_at on extra_events;
create trigger extra_events_set_updated_at before update on extra_events
  for each row execute function set_updated_at();

-- Required for Supabase Realtime (live sync across everyone signed in).
alter publication supabase_realtime add table locations, contacts, projects, extra_events;

-- Row Level Security policies live in policies.sql — run that file next.
alter table locations enable row level security;
alter table contacts enable row level security;
alter table projects enable row level security;
alter table extra_events enable row level security;
