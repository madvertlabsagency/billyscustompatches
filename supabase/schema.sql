-- Markhor Patches quote funnel schema. Run once in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done', 'synced', 'failed', 'needs_setup')),
  attempts int not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  -- sync checkpoints so a retry resumes where it stopped and never duplicates
  ghl_contact_id text,
  ghl_opportunity_id text,
  ghl_note_done boolean not null default false,
  ghl_assigned_user_id text,
  is_repeat boolean,
  email_sent boolean not null default false,
  owner_alert_sent boolean not null default false,
  nudge_sent_at timestamptz,
  -- owner's sales status, changed on /admin
  lead_status text not null default 'new' check (lead_status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  owner_notes text,
  qualified_event_sent boolean not null default false,
  -- whatsapp verification
  verify_code text not null unique,
  whatsapp_verified_at timestamptz,
  whatsapp_from text,
  welcome_sent boolean not null default false,
  pdf_path text,
  -- submission
  event_id uuid not null unique,
  first_name text not null,
  last_name text not null,
  business text,
  email text not null,
  phone_e164 text not null,
  contact_method text not null,
  patch_type text not null,
  quantity text not null,
  width text,
  height text,
  size_unsure boolean not null,
  backing text not null,
  deadline text not null,
  deadline_date date,
  notes text,
  files jsonb not null default '[]',
  no_artwork boolean not null,
  lead_score int,
  lead_grade text,
  tags text[] not null default '{}',
  tracking jsonb not null default '{}',
  client_ip text,
  user_agent text
);

create index if not exists quote_requests_retry_idx on quote_requests (status, next_attempt_at);
create index if not exists quote_requests_phone_idx on quote_requests (phone_e164);
create index if not exists quote_requests_created_idx on quote_requests (created_at desc);

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

create table if not exists app_state (
  key text primary key,
  value jsonb not null
);

-- Atomic fixed window rate limiter. Returns true when the request is allowed.
create or replace function hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql as $$
declare cur rate_limits;
begin
  insert into rate_limits(key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning * into cur;
  return cur.count <= p_limit;
end $$;

-- Atomic round robin pointer.
create or replace function next_round_robin(p_size int)
returns int language plpgsql as $$
declare v int;
begin
  insert into app_state(key, value) values ('round_robin', '0'::jsonb)
  on conflict (key) do update set value = to_jsonb(((app_state.value)::text::int + 1))
  returning (value)::text::int into v;
  return v % p_size;
end $$;

-- Everything is accessed with the service role from server routes only.
-- Only the server (service role) may call the helper functions.
revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function next_round_robin(int) from public, anon, authenticated;
alter table quote_requests enable row level security;
alter table rate_limits enable row level security;
alter table app_state enable row level security;

-- Private storage bucket for artwork and quote PDFs.
insert into storage.buckets (id, name, public) values ('rfq-artwork', 'rfq-artwork', false)
on conflict (id) do nothing;

-- Server side size and type limits for the bucket (25 MB default; keep in sync with ARTWORK_MAX_MB).
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/png','image/jpeg','application/pdf','application/postscript','application/illustrator','image/svg+xml','application/octet-stream']
where id = 'rfq-artwork';

-- Upgrade for databases created before welcome_sent existed (safe to run again).
alter table quote_requests add column if not exists welcome_sent boolean not null default false;

-- ---------- Funnel analytics (docs/FUNNEL-ANALYTICS.md) ----------
-- First party funnel events. Written only by the server route /api/fe with the service role;
-- RLS is on with no policies, so the public (anon) key can neither read nor insert.
create table if not exists funnel_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  visitor_id text not null,
  event text not null,
  step int,
  meta jsonb not null default '{}',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbclid text,
  campaign_id text,
  adset_id text,
  ad_id text,
  device text check (device in ('mobile', 'tablet', 'desktop')),
  referrer text,
  created_at timestamptz not null default now()
);
create index if not exists funnel_events_created_idx on funnel_events (created_at desc);
create index if not exists funnel_events_event_idx on funnel_events (event);
create index if not exists funnel_events_campaign_idx on funnel_events (utm_campaign);
create index if not exists funnel_events_session_idx on funnel_events (session_id);
alter table funnel_events enable row level security;

-- Meta Marketing API responses, cached 10 minutes to respect rate limits.
create table if not exists meta_insights_cache (
  key text primary key,
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);
alter table meta_insights_cache enable row level security;
