-- 習慣のアーカイブ（habits.archived_at）。null は使用中。
-- - アーカイブした習慣は今日の計画・習慣の一覧・タイムライン・統計から外れ、達成日（completed_dates）は残る
-- - 列を含まない古いアプリの upsert は列に触れないので、アーカイブは外れない。既存の行は null（使用中）
-- 何度流しても同じ形になる。
alter table public.habits add column if not exists archived_at timestamptz;
