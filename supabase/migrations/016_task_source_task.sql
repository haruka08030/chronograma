-- ▶ で始めた記録の元の To-Do・予定（tasks.source_task_id）。予定と記録の突き合わせ（計画どおりか）で、
-- 題名を直しても元の予定と組にする。
-- - null は元なし（手で足した記録・To-Do・予定）
-- - 元のタスクを消しても記録は残すので外部キーは付けない（id は端末で作る文字列）
-- - 列を含まない古いアプリの upsert は列に触れないので、元の id は残る。既存の行は null
-- 何度流しても同じ形になる。
alter table public.tasks add column if not exists source_task_id text;
