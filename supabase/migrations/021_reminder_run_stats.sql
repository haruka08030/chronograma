-- 通知の送信の実行の記録 `reminder_runs`（`012`）に、最後の回の数と最後の失敗の時刻を足す。
-- - last_run_at: 最後に終わった回の時刻（うまくいったかによらない）
-- - last_checked / last_sent / last_removed / last_failed: その回で見た購読・送った通知・消した購読・失敗の数
-- - last_failed_at: 失敗が 1 つでもあった最後の回の時刻
-- 書くのは Edge Function `daily-reminders`（service_role）だけ。端末からは読めず、書けない（`012` のまま）。
-- 運用で見る SQL は `supabase/metrics/health.sql`。
-- 何度流しても同じ形になる。

alter table public.reminder_runs add column if not exists last_run_at timestamptz;
alter table public.reminder_runs add column if not exists last_checked integer;
alter table public.reminder_runs add column if not exists last_sent integer;
alter table public.reminder_runs add column if not exists last_removed integer;
alter table public.reminder_runs add column if not exists last_failed integer;
alter table public.reminder_runs add column if not exists last_failed_at timestamptz;
