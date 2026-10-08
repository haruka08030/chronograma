-- 運用の確かめ（本番の SQL Editor で流す。service_role で読む）。数・段階・版だけを見る（利用者の中身は読まない）。
-- - 1〜3 は `client_errors`（`011`・種類は `020`）。送るのはログインしている端末だけ（ログインしていない間・オフラインの間の失敗は
--   端末に新しい 10 件までためて、ログイン・回線が戻ったときに送る。`created_at` は送った時刻、起きた時刻は `extra->>'occurred_at'`）。
--   同じエラーは 10 分に 1 回・1 時間に 20 件まで（`src/lib/errorReport.ts`）なので、数は起きた回数より少なく出る
-- - 4 は `reminder_runs`（`012`・最後の回の数は `021`）
-- - 5・6 は pg_cron、7 は pg_net（どちらも Database → Extensions で有効にしてあるとき）
-- 1 つずつ選んで流す。

-- 1. 直近 24 時間のエラーを 種類・段階・版 ごとに
select
  kind,
  extra->>'stage' as stage,
  app_version,
  count(*) as n,
  count(distinct user_id) as users,
  max(created_at) as last
from public.client_errors
where created_at > now() - interval '24 hours'
group by kind, extra->>'stage', app_version
order by n desc
limit 100;

-- 2. 直近 24 時間の、保存・連携・通知の購読・同期の失敗のメッセージ（多いものから）
select
  kind,
  extra->>'stage' as stage,
  left(message, 200) as message,
  count(*) as n,
  count(distinct user_id) as users,
  max(created_at) as last
from public.client_errors
where created_at > now() - interval '24 hours'
  and kind in ('storage', 'integration', 'push', 'sync')
group by kind, extra->>'stage', left(message, 200)
order by n desc
limit 50;

-- 3. 日ごとの種類別の数（直近 14 日）
select date_trunc('day', created_at) as day, kind, count(*) as n, count(distinct user_id) as users
from public.client_errors
where created_at > now() - interval '14 days'
group by 1, 2
order by 1 desc, n desc;

-- 4. 通知の送信（`daily-reminders`、5 分ごと）の最後の成功・最後の回の数・最後の失敗
select
  last_ok_at,
  now() - last_ok_at as since_last_ok,
  running_since,
  last_run_at,
  now() - last_run_at as since_last_run,
  last_checked,
  last_sent,
  last_removed,
  last_failed,
  last_failed_at
from public.reminder_runs
where id = 1;

-- 5. cron のジョブが 3 つあるか（印の削除・エラーの記録の削除・通知）。jobid が空なら無い
select expected.jobname, j.jobid, j.schedule, j.active
from (values ('purge-sync-tombstones'), ('chronograma-client-errors-purge'), ('chronograma-daily-reminders')) as expected (jobname)
left join cron.job j on j.jobname = expected.jobname
order by expected.jobname;

-- 6. cron の直近 24 時間の失敗（ジョブごと）
select
  j.jobname,
  d.status,
  count(*) as n,
  max(d.start_time) as last,
  left(max(d.return_message), 300) as message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where d.start_time > now() - interval '24 hours'
  and d.status <> 'succeeded'
group by j.jobname, d.status
order by last desc;

-- 7. daily-reminders の応答の status（pg_net の `net._http_response` は数時間で消える。URL は残らないので本文で見分ける。
--    成功は 200 と {"checked":…}、走っている回と重なったら {"skipped":"running"}、失敗があれば 500。
--    pg_net を呼ぶのは daily-reminders の cron だけなので、200 以外・タイムアウトもここに出す）
select
  status_code,
  timed_out,
  count(*) as n,
  max(created) as last,
  left(max(error_msg), 200) as error_msg
from net._http_response
where created > now() - interval '24 hours'
  and (content like '{"checked"%' or content like '{"skipped"%' or status_code is distinct from 200)
group by status_code, timed_out
order by last desc;
