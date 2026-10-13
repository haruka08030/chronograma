-- 移した予定の控え tasks.moved_plans（#158）。
--
--   [{ "date": "2026-10-03", "startTime": "13:00" | null, "endTime": "14:00" | null, "to": "2026-10-05" }, …]
--   （date は元の予定日、startTime / endTime は元の時刻で時刻の無い予定は null、to は移した先の日）
-- - その日が来てから To-Do の予定日を別の日へ移したとき、アプリが元の予定を足す。過ぎた日のタイムラインに控えを出し、
--   「計画どおり実行」の分母に入れる。1 つの To-Do に 30 件まで（アプリが古いものから捨てる）
-- - null は移していない To-Do。予定・記録では使わない
-- - 列を含まない古いアプリの upsert は列に触れないので、控えは消えない。既存の行は null
--
-- 既にある行の値は変えない。何度流しても同じ形になる。

alter table public.tasks add column if not exists moved_plans jsonb;

-- 形と大きさ（配列。アプリでは 1 件 80 バイトほど × 30 件まで）
alter table public.tasks drop constraint if exists tasks_moved_plans_check;
alter table public.tasks add constraint tasks_moved_plans_check
  check (
    moved_plans is null
    or (jsonb_typeof(moved_plans) = 'array' and octet_length(moved_plans::text) <= 8192)
  );
