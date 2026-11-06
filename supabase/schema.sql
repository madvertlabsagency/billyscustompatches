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

-- Partner CRM: team members, lead owner and followers, activity timeline.
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  email text,
  role text,
  color text not null default '#4F46E5',
  active boolean not null default true
);
alter table team_members enable row level security;

alter table quote_requests add column if not exists assignee_id uuid references team_members(id) on delete set null;
alter table quote_requests add column if not exists follower_ids uuid[] not null default '{}';
create index if not exists quote_requests_assignee_idx on quote_requests (assignee_id);

create table if not exists lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references quote_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null,
  text text not null
);
create index if not exists lead_activity_lead_idx on lead_activity (lead_id, created_at desc);
alter table lead_activity enable row level security;

-- CRM 2: opportunity value, lead source, stage dates for ratios, lost reason, tasks.
alter table quote_requests add column if not exists opportunity_value numeric(12, 2) check (opportunity_value is null or opportunity_value >= 0);
alter table quote_requests add column if not exists source text not null default 'funnel';
alter table quote_requests add column if not exists lost_reason text;
alter table quote_requests add column if not exists quoted_at timestamptz;
alter table quote_requests add column if not exists won_at timestamptz;
alter table quote_requests add column if not exists lost_at timestamptz;
update quote_requests set quoted_at = coalesce(quoted_at, updated_at) where lead_status in ('quoted', 'won') and quoted_at is null;
update quote_requests set won_at = coalesce(won_at, updated_at) where lead_status = 'won' and won_at is null;
update quote_requests set lost_at = coalesce(lost_at, updated_at) where lead_status = 'lost' and lost_at is null;

create table if not exists lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references quote_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 200),
  due_on date,
  assignee_id uuid references team_members(id) on delete set null,
  done_at timestamptz
);
create index if not exists lead_tasks_lead_idx on lead_tasks (lead_id);
create index if not exists lead_tasks_open_idx on lead_tasks (done_at, due_on);
alter table lead_tasks enable row level security;

-- CRM 3: multi account Madvert Labs Patches CRM, user logins, push notifications.
create table if not exists crm_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#0084ff'
);
alter table crm_accounts enable row level security;
insert into crm_accounts (slug, name, color) values ('billys', 'Billys Custom Patches', '#d9262c') on conflict (slug) do nothing;

alter table team_members add column if not exists password_hash text;
alter table team_members add column if not exists last_login_at timestamptz;
create unique index if not exists team_members_email_key on team_members (lower(email)) where email is not null;

create table if not exists account_members (
  account_id uuid not null references crm_accounts(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'manager')),
  created_at timestamptz not null default now(),
  primary key (account_id, member_id)
);
alter table account_members enable row level security;
insert into account_members (account_id, member_id)
  select a.id, m.id from crm_accounts a cross join team_members m where a.slug = 'billys'
  on conflict do nothing;

alter table quote_requests add column if not exists account_id uuid references crm_accounts(id);
update quote_requests set account_id = (select id from crm_accounts where slug = 'billys') where account_id is null;
create index if not exists quote_requests_account_idx on quote_requests (account_id, created_at desc);

do $$
declare billys uuid := (select id from crm_accounts where slug = 'billys');
begin
  execute format('alter table quote_requests alter column account_id set default %L', billys);
end $$;

alter table lead_activity add column if not exists actor text;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id uuid references team_members(id) on delete cascade,
  is_owner boolean not null default false,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text
);
alter table push_subscriptions enable row level security;

alter table lead_tasks add column if not exists account_id uuid references crm_accounts(id);
update lead_tasks t set account_id = q.account_id from quote_requests q where q.id = t.lead_id and t.account_id is null;
create index if not exists lead_tasks_account_idx on lead_tasks (account_id, done_at, due_on);
update team_members set email = lower(trim(email)) where email is not null and email <> lower(trim(email));
