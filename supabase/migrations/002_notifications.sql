-- 通知の見直し（2026-10）。001 を 2026-10-02 より前に適用した DB に足す。
-- - tasks.reminders: タスクごとの通知（null = 設定の既定）
-- - push_subscriptions: 予定のあとの記録の確認、送った通知の鍵、タイマーの止め忘れ
-- 夕方の締め（wrap_up_*）と event_notified / due_notified は使わなくなったが、古い版のアプリが送っても
-- 失敗しないよう列は残す。
alter table public.tasks
  add column if not exists reminders jsonb;

alter table public.push_subscriptions
  add column if not exists record_prompts     boolean not null default false,
  add column if not exists reminder_sent      jsonb,
  add column if not exists timer_started_at   timestamptz,
  add column if not exists timer_title        text,
  add column if not exists timer_notified_for timestamptz;
