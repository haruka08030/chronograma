-- 通知の送信（Edge Function `daily-reminders`）の実行の記録。1 行だけ（id = 1）。
-- - last_ok_at: 最後に全部うまくいった回の時刻。次の回はこの時刻から今まで（上限 60 分）の通知を送る
--   （読み込みの失敗・デプロイ中・タイムアウトに当たった回の分を、次の回で送る）
-- - running_since: 今走っている回が始まった時刻（null は走っていない）。前の回が終わらないうちに次の回が
--   始まっても、同じ時間の通知を同時に送らないための目印。古すぎる目印（落ちた回の残り）は次の回が取り直す
-- 読み書きするのは service_role（Edge Function）だけ。端末からは読めず、書けない（ポリシーなし）。
-- 何度流しても同じ形になる。

create table if not exists public.reminder_runs (
  id            integer primary key check (id = 1),
  last_ok_at    timestamptz,
  running_since timestamptz
);

insert into public.reminder_runs (id) values (1) on conflict (id) do nothing;

alter table public.reminder_runs enable row level security;
revoke all on public.reminder_runs from anon, authenticated;
