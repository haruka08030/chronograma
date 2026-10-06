-- タスクの見積もり（かかりそうな時間、分）（tasks.estimate_minutes）。タイムラインに置く・時間を決めるときの長さに使う。
-- - null は見積もりなし（設定の既定の予定の長さで置く）
-- - 列を含まない古いアプリの upsert は列に触れないので、見積もりは残る。既存の行は null
-- 何度流しても同じ形になる。
alter table public.tasks add column if not exists estimate_minutes integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_estimate_minutes_range') then
    alter table public.tasks
      add constraint tasks_estimate_minutes_range check (estimate_minutes is null or (estimate_minutes > 0 and estimate_minutes <= 1440));
  end if;
end $$;
