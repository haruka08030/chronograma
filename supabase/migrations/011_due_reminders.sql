-- 締切の通知を Web Push でも送る（アプリを閉じていても届く）。
-- これまで締切の通知はタブを開いている間の 60 秒ポーリングだけで、
-- しかも締切時刻（due_time）を見ずにアプリを開いた瞬間にまとめて出ていた。
-- Run after 005_event_reminders.sql.

alter table public.push_subscriptions
  add column if not exists due_reminders boolean not null default false;

-- { "date": "yyyy-mm-dd", "ids": ["task id", ...] } — その日に通知済みの締切タスク
alter table public.push_subscriptions
  add column if not exists due_notified jsonb;
