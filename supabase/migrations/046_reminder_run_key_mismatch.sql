-- 通知の送信の実行の記録 `reminder_runs`（`012` / `021`）に、鍵が合わずに消した購読の数を足す。
-- - last_key_mismatch: 最後の回で、プッシュサービスが 403（購読を作った VAPID の公開鍵と送るときの鍵が合わない）を返して消した購読の数。
--   `last_removed` に含まれる（失効と一緒に消す）。VAPID の鍵を替えたあと・secret の入れ間違いで増える
-- 書くのは Edge Function `daily-reminders`（service_role）だけ。端末からは読めず、書けない（`012` のまま）。
-- 運用で見る SQL は `supabase/metrics/health.sql` の 4。
-- 何度流しても同じ形になる。

alter table public.reminder_runs add column if not exists last_key_mismatch integer;
