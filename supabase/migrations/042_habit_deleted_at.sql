-- 習慣のゴミ箱（habits.deleted_at）。null はゴミ箱に無い。
-- - ゴミ箱に入れた習慣はどの画面・統計にも出さず、達成日（completed_dates）は残る。ゴミ箱から戻せ、30 日たつとアプリが行ごと消す
-- - 列を含まない古いアプリの upsert は列に触れないので、ゴミ箱から外れない。既存の行は null
-- 何度流しても同じ形になる。
alter table public.habits add column if not exists deleted_at timestamptz;
