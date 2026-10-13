-- 習慣の休みの日・曜日ごとの時間・時間の目標（habits.rest_dates / weekday_times / goal_minutes）。
-- - rest_dates: 休みの日 [ "yyyy-MM-dd", … ]。予定の日に数えない（連続・達成率・週のふりかえり）。null は無し
-- - weekday_times: 曜日を指定した習慣の曜日ごとの時間 { "1"〜"7": { "startTime": "HH:mm", "endTime": "HH:mm" | null } }（1=月）。null は無し（どの曜日も習慣の時間）
-- - goal_minutes: 1 回の時間の目標（分、1〜1440）。その日の記録の合計が届いたら達成。null は無し（チェックで達成）
-- - 列を含まない古いアプリの upsert は列に触れないので、どれも消えない
-- 何度流しても同じ形になる。
alter table public.habits add column if not exists rest_dates jsonb;
alter table public.habits add column if not exists weekday_times jsonb;
alter table public.habits add column if not exists goal_minutes integer;

alter table public.habits drop constraint if exists habits_rest_dates_check;
alter table public.habits add constraint habits_rest_dates_check
  check (rest_dates is null or (jsonb_typeof(rest_dates) = 'array' and pg_column_size(rest_dates) <= 262144));

alter table public.habits drop constraint if exists habits_weekday_times_check;
alter table public.habits add constraint habits_weekday_times_check
  check (weekday_times is null or (jsonb_typeof(weekday_times) = 'object' and pg_column_size(weekday_times) <= 4096));

alter table public.habits drop constraint if exists habits_goal_minutes_check;
alter table public.habits add constraint habits_goal_minutes_check
  check (goal_minutes is null or goal_minutes between 1 and 1440);
