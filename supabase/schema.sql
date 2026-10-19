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

-- ------------------------------------------------------------------ v4 --
-- Added 2026-10-18: plans and credits, intelligence (threads, findings,
-- reports, shared data cache), the studio and reel requests. Additive only.
-- Every user table is readable by its owner and written by the server with the
-- secret key; data_cache holds public data and is server only.

create table if not exists public.accounts (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  email                text,
  plan                 text check (plan in ('tier1', 'tier2')),
  credits              integer not null default 0 check (credits >= 0),
  period_start         timestamptz,
  period_end           timestamptz,
  welcome_report_used  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  delta          integer not null,
  balance_after  integer not null,
  reason         text not null,
  ref            text,
  meta           jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists credit_ledger_user_time on public.credit_ledger (user_id, created_at desc);

create table if not exists public.plan_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete cascade,
  email       text not null,
  plan        text not null check (plan in ('tier1', 'tier2')),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  note        text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists plan_requests_status on public.plan_requests (status, created_at);

create table if not exists public.intel_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'New question',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists intel_threads_user on public.intel_threads (user_id, updated_at desc);

create table if not exists public.intel_messages (
  id          bigint generated always as identity primary key,
  thread_id   uuid not null references public.intel_threads (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null default '',
  data        jsonb,
  credits     integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists intel_messages_thread on public.intel_messages (thread_id, id);

create table if not exists public.intel_findings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null,
  platform     text,
  statement    text not null,
  metrics      jsonb,
  evidence     jsonb,
  window_days  integer,
  fetched_at   timestamptz not null default now(),
  scope        jsonb,
  confidence   real,
  source       jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists intel_findings_user on public.intel_findings (user_id, platform, kind, fetched_at desc);

create table if not exists public.intel_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  title       text not null,
  params      jsonb,
  body        jsonb,
  credits     integer not null default 0,
  status      text not null default 'running' check (status in ('running', 'ready', 'failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists intel_reports_user on public.intel_reports (user_id, created_at desc);

create table if not exists public.data_cache (
  key         text primary key,
  capability  text not null,
  params      jsonb,
  payload     jsonb,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists data_cache_expiry on public.data_cache (expires_at);

create table if not exists public.content_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('creative', 'carousel', 'text')),
  status      text not null default 'draft' check (status in ('draft', 'ready')),
  title       text,
  counted     boolean not null default false,
  counted_at  timestamptz,
  grounding   jsonb,
  body        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists content_items_user on public.content_items (user_id, kind, created_at desc);

create table if not exists public.reel_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'draft'
                  check (status in ('draft', 'requested', 'in_production', 'delivered', 'revision_requested', 'cancelled')),
  counted         boolean not null default false,
  counted_at      timestamptz,
  request         jsonb,
  brief           jsonb,
  grounding       jsonb,
  brand           jsonb,
  history         jsonb,
  due_at          timestamptz,
  delivered_at    timestamptz,
  video_path      text,
  caption         text,
  revision_note   text,
  revisions_used  integer not null default 0,
  results         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists reel_requests_user on public.reel_requests (user_id, created_at desc);
create index if not exists reel_requests_queue on public.reel_requests (status, due_at);

do $$
declare t text;
begin
  foreach t in array array['accounts','credit_ledger','plan_requests','intel_threads','intel_messages',
                           'intel_findings','intel_reports','data_cache','content_items','reel_requests'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['accounts','credit_ledger','plan_requests','intel_threads','intel_messages',
                           'intel_findings','intel_reports','content_items','reel_requests'] loop
    execute format('drop policy if exists "owner reads own rows" on public.%I', t);
    execute format('create policy "owner reads own rows" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

drop trigger if exists accounts_touch on public.accounts;
create trigger accounts_touch before update on public.accounts for each row execute function public.touch_updated_at();
drop trigger if exists content_items_touch on public.content_items;
create trigger content_items_touch before update on public.content_items for each row execute function public.touch_updated_at();
drop trigger if exists reel_requests_touch on public.reel_requests;
create trigger reel_requests_touch before update on public.reel_requests for each row execute function public.touch_updated_at();
drop trigger if exists intel_reports_touch on public.intel_reports;
create trigger intel_reports_touch before update on public.intel_reports for each row execute function public.touch_updated_at();

-- Credits move only through these functions, each one statement under a row
-- lock, so two requests at once can never spend the same credits twice.
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null, p_meta jsonb default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount'; end if;
  update public.accounts set credits = credits - p_amount
   where user_id = p_user and credits >= p_amount
   returning credits into v_balance;
  if not found then raise exception 'insufficient_credits'; end if;
  insert into public.credit_ledger (user_id, delta, balance_after, reason, ref, meta)
  values (p_user, -p_amount, v_balance, p_reason, p_ref, p_meta);
  return v_balance;
end $$;

create or replace function public.add_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null, p_meta jsonb default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount'; end if;
  update public.accounts set credits = credits + p_amount where user_id = p_user returning credits into v_balance;
  if not found then raise exception 'no_account'; end if;
  insert into public.credit_ledger (user_id, delta, balance_after, reason, ref, meta)
  values (p_user, p_amount, v_balance, p_reason, p_ref, p_meta);
  return v_balance;
end $$;

-- Starts a fresh period when none is running: credits reset to the plan's
-- amount (no rollover). The where clause makes a second caller a no-op.
create or replace function public.start_period(p_user uuid, p_credits integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_old integer;
begin
  select credits into v_old from public.accounts
   where user_id = p_user and plan is not null and (period_end is null or period_end <= now())
   for update;
  if not found then return false; end if;
  update public.accounts
     set credits = p_credits, period_start = now(), period_end = now() + interval '1 month'
   where user_id = p_user;
  insert into public.credit_ledger (user_id, delta, balance_after, reason, meta)
  values (p_user, p_credits - v_old, p_credits, 'period_start', jsonb_build_object('previous', v_old));
  return true;
end $$;

-- Counts one studio item or reel against the period's allowance, under the
-- account's row lock, so the tenth carousel can't be claimed twice at once.
create or replace function public.claim_allowance(p_user uuid, p_kind text, p_limit integer, p_item uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_used integer;
begin
  select period_start into v_start from public.accounts where user_id = p_user for update;
  if v_start is null then raise exception 'no_plan'; end if;
  if p_kind = 'reel' then
    select count(*) into v_used from public.reel_requests
     where user_id = p_user and counted and counted_at >= v_start;
  else
    select count(*) into v_used from public.content_items
     where user_id = p_user and kind = p_kind and counted and counted_at >= v_start;
  end if;
  if v_used >= p_limit then raise exception 'allowance_used'; end if;
  if p_kind = 'reel' then
    update public.reel_requests set counted = true, counted_at = now() where id = p_item and user_id = p_user;
  else
    update public.content_items set counted = true, counted_at = now() where id = p_item and user_id = p_user;
  end if;
  if not found then raise exception 'no_item'; end if;
  return v_used + 1;
end $$;

revoke all on function public.spend_credits(uuid, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.add_credits(uuid, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_period(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_allowance(uuid, text, integer, uuid) from public, anon, authenticated;

-- Private buckets: delivered reels and customer uploads. Read through signed
-- URLs made on the server.
insert into storage.buckets (id, name, public) values ('reels', 'reels', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false) on conflict (id) do nothing;

-- v4.1: deleting a studio piece hides it but keeps it counted, so deleting
-- never gives a month's allowance back.
alter table public.content_items add column if not exists deleted_at timestamptz;

-- v4.2: hardening after the money and access review.

-- Claiming a month's allowance only ever counts a piece of the right kind,
-- once. A piece that's already counted is a no-op that returns -1, so a
-- second, parallel request can never count it again or release it.
create or replace function public.claim_allowance(p_user uuid, p_kind text, p_limit integer, p_item uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_used integer; v_counted boolean;
begin
  select period_start into v_start from public.accounts where user_id = p_user for update;
  if v_start is null then raise exception 'no_plan'; end if;
  if p_kind = 'reel' then
    select counted into v_counted from public.reel_requests where id = p_item and user_id = p_user;
  else
    select counted into v_counted from public.content_items where id = p_item and user_id = p_user and kind = p_kind and deleted_at is null;
  end if;
  if not found then raise exception 'no_item'; end if;
  if v_counted then return -1; end if;
  if p_kind = 'reel' then
    select count(*) into v_used from public.reel_requests
     where user_id = p_user and counted and counted_at >= v_start;
  else
    select count(*) into v_used from public.content_items
     where user_id = p_user and kind = p_kind and counted and counted_at >= v_start;
  end if;
  if v_used >= p_limit then raise exception 'allowance_used'; end if;
  if p_kind = 'reel' then
    update public.reel_requests set counted = true, counted_at = now() where id = p_item and user_id = p_user and not counted;
  else
    update public.content_items set counted = true, counted_at = now() where id = p_item and user_id = p_user and kind = p_kind and not counted;
  end if;
  return v_used + 1;
end $$;
revoke all on function public.claim_allowance(uuid, text, integer, uuid) from public, anon, authenticated;

-- One paid step at a time on a piece: a short lock taken before making a
-- picture or a carousel, so parallel requests can't each make one.
alter table public.content_items add column if not exists lock_until timestamptz;

-- Facts measured on the stand-in are marked, so real runs never use them.
alter table public.intel_findings add column if not exists sample boolean not null default false;

-- Today's spend for one account, summed in the database.
create or replace function public.spend_today(p_user uuid)
returns numeric language sql security definer set search_path = public as $$
  select coalesce(sum(usd), 0) from public.ai_usage
   where user_id = p_user and not mock and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.spend_today(uuid) from public, anon, authenticated;

-- Upload limits enforced by storage itself, whatever the browser declares.
update storage.buckets set file_size_limit = 209715200, allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'] where id = 'uploads';
update storage.buckets set file_size_limit = 209715200, allowed_mime_types = array['video/mp4','video/quicktime'] where id = 'reels';

-- ------------------------------------------------------------------ v5 --
-- Added 2026-10-19: watchlists kept on the server. A watchlist's settings and
-- every signal it finds are written here by the server as they are found, so
-- a closed tab, a second device or a sign-out can never lose a result.
-- Additive only.
create table if not exists public.watchlists (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  name       text,
  config     jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.watch_signals (
  user_id      uuid not null references auth.users (id) on delete cascade,
  search_id    text not null,
  signal_key   text not null,
  data         jsonb not null,
  found_at     timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (user_id, search_id, signal_key)
);
create index if not exists watch_signals_recent on public.watch_signals (user_id, search_id, found_at desc);

do $$
declare t text;
begin
  foreach t in array array['watchlists','watch_signals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner reads own rows" on public.%I', t);
    execute format('create policy "owner reads own rows" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;
