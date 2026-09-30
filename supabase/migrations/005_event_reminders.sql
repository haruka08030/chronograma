-- "N minutes before" reminders for time-blocked plans (Web Push, sent by the daily-reminders Edge Function).
-- Run after 003_push_subscriptions.sql.

alter table public.push_subscriptions
  add column if not exists event_reminder_minutes integer
    check (event_reminder_minutes is null or event_reminder_minutes between 1 and 120);

-- { "date": "yyyy-mm-dd", "ids": ["task id", ...] } — plans already notified on that local date
alter table public.push_subscriptions
  add column if not exists event_notified jsonb;
