-- Huesy backend on Supabase. Run once in the SQL editor, or with scripts/db-migrate.js.
--
-- Auth needs no tables of its own. Three tables carry everything else:
--   user_state        one row per signed in user, the whole app state as JSON
--   waitlist          emails from the landing page
--   contact_messages  the contact form
--
-- Row level security is on everywhere. user_state is readable and writable only
-- by its owner. waitlist and contact_messages have NO policies at all, so the
-- browser can never touch them; the two API routes write with the secret key.

create table if not exists public.user_state (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  source      text,
  created_at  timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  company     text,
  message     text not null,
  created_at  timestamptz not null default now()
);

alter table public.user_state       enable row level security;
alter table public.waitlist         enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "owner reads own state"  on public.user_state;
drop policy if exists "owner writes own state" on public.user_state;
drop policy if exists "owner updates own state" on public.user_state;

create policy "owner reads own state"
  on public.user_state for select to authenticated using (auth.uid() = user_id);
create policy "owner writes own state"
  on public.user_state for insert to authenticated with check (auth.uid() = user_id);
create policy "owner updates own state"
  on public.user_state for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at honest on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before update on public.user_state
  for each row execute function public.touch_updated_at();

-- Google sign in: Authentication > Providers > Google, paste a Google OAuth
-- client id and secret. Then Authentication > URL configuration:
--   Site URL:      https://<your-domain>
--   Redirect URLs: https://<your-domain>/auth/callback
--                  http://localhost:3000/auth/callback
--                  http://localhost:4311/auth/callback

-- ------------------------------------------------------------------ v3 --
-- Added 2026-10-18 for the waitlist site and the cost ledger. Additive only:
-- new nullable columns and new tables, safe to run on a live project.

-- The waitlist keeps where a join came from, and the one optional answer
-- asked after joining ("What should Huesy watch for you?"). The answer is
-- written with edit_token, handed back once on insert, never looked up by
-- email, so nobody can change someone else's row by knowing their address.
alter table public.waitlist add column if not exists watch      text;
alter table public.waitlist add column if not exists referrer   text;
alter table public.waitlist add column if not exists utm        jsonb;
alter table public.waitlist add column if not exists edit_token uuid default gen_random_uuid();
alter table public.waitlist add column if not exists updated_at timestamptz;

-- One row per model call: who, what job, which model, tokens and estimated
-- dollars. Written and read only by the server with the secret key.
create table if not exists public.ai_usage (
  id                 bigint generated always as identity primary key,
  user_id            uuid references auth.users (id) on delete set null,
  kind               text not null,
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  web_searches       integer not null default 0,
  usd                numeric(10, 5) not null default 0,
  mock               boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;

-- Anonymous page events for the waitlist site: views, form focus, joins,
-- sample runs. No IP address, no user agent, no cookie, nothing personal.
create table if not exists public.site_events (
  id         bigint generated always as identity primary key,
  name       text not null,
  source     text,
  path       text,
  referrer   text,
  utm        jsonb,
  created_at timestamptz not null default now()
);
create index if not exists site_events_time on public.site_events (created_at desc);
alter table public.site_events enable row level security;
