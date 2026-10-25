-- 習慣の前の日の設定（habits.past_rules）。作った日・頻度や時間を変えた日より前の日を、その日の設定のまま数える。
-- [ { "until": "yyyy-MM-dd", "off": true } | { "until": "yyyy-MM-dd", "timeMode", "startTime", "endTime", "frequency", "weekdayTimes"?, "goalMinutes"? } ]（古い順）
-- until より前の日はその設定、off は作る前（予定の日にしない）。null は無し（どの日も今の設定）
-- 列を含まない古いアプリの upsert は列に触れないので消えない
-- 何度流しても同じ形になる。
alter table public.habits add column if not exists past_rules jsonb;

alter table public.habits drop constraint if exists habits_past_rules_check;
alter table public.habits add constraint habits_past_rules_check
  check (past_rules is null or (jsonb_typeof(past_rules) = 'array' and pg_column_size(past_rules) <= 262144));
