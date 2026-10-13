-- To-Do の「続けて持ち越した日数」（tasks.carried_days、#300）。今日の計画の行の「3日目」と、週のふりかえりの「持ち越しが多いタスク」に使う。
-- - 今日かそれより前に置いて終わっていない To-Do を後ろの日へ回した日数の合計。完了・実行日を外す・いつか / チェックリストへ移すと 0（数えるのはアプリ）
-- - 列を含まない古いアプリの upsert は列に触れないので、数は残る。既存の行は 0
-- 何度流しても同じ形になる。
alter table public.tasks add column if not exists carried_days integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_carried_days_range') then
    alter table public.tasks
      add constraint tasks_carried_days_range check (carried_days >= 0 and carried_days <= 3650);
  end if;
end $$;
