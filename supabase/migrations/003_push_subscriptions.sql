-- Web Push subscriptions for the daily "plan your day" / "wrap up" reminders.
-- Run after 001_chronograma_schema.sql. One row per device (push endpoint).
-- The `daily-reminders` Edge Function (service_role) reads this table on a cron schedule.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  -- IANA timezone of the device (e.g. Asia/Tokyo); reminder times are local to it
  timezone text not null default 'UTC',
  lang text not null default 'ja',
  -- 'HH:mm' or null (off)
  plan_time text check (plan_time is null or plan_time ~ '^\d{2}:\d{2}$'),
  wrap_up_time text check (wrap_up_time is null or wrap_up_time ~ '^\d{2}:\d{2}$'),
  -- local date (yyyy-mm-dd) of the last reminder sent, so each fires once per day
  last_plan_sent date,
  last_wrap_up_sent date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using (auth.uid() = user_id);
