-- 習慣の日ごとの時間（habits.time_overrides）。{ "yyyy-MM-dd": { "startTime": "HH:mm", "endTime": "HH:mm" | null } }。
-- - タイムラインで習慣の枠を動かした日だけ入る。null は無し（どの日も習慣の時間）
-- - 列を含まない古いアプリの upsert は列に触れないので、日ごとの時間は消えない
-- 何度流しても同じ形になる。
alter table public.habits add column if not exists time_overrides jsonb;

alter table public.habits drop constraint if exists habits_time_overrides_size_check;
alter table public.habits add constraint habits_time_overrides_size_check
  check (time_overrides is null or pg_column_size(time_overrides) <= 262144);
