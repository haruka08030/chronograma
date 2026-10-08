-- 通知の送信（Edge Function `daily-reminders`、5 分ごと）が読む未完了のタスクの部分索引（#263）。
-- 購読のある人ごとに、未完了・消していない・アーカイブしていない・ルートの・記録でない、予定日か締切のある行だけを
-- id の順に読む（`daily-reminders/index.ts` の openTasks:
--   where user_id = … and completed is false and is_time_log is false and parent_id is null and deleted_at is null
--     and archived_at is null and (scheduled_date is not null or due_date is not null) and id > … order by id limit 1000）。
-- 主キー (user_id, id) だけでは、完了・削除・記録の行も含めて 1 人分を全部なめる。
-- 条件は関数の問い合わせと同じ形で書く（completed / is_time_log は `is false`。PostgREST の `is.false` は値を引数にしないので、
-- 準備された文の汎用の計画でもこの索引を使える）。
-- 何度流しても同じ形になる。

create index if not exists tasks_reminder_open_idx on public.tasks (user_id, id)
  where completed is false
    and is_time_log is false
    and parent_id is null
    and deleted_at is null
    and archived_at is null
    and (scheduled_date is not null or due_date is not null);
