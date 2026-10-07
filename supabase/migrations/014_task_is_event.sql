-- 予定（完了の丸の無い、時刻のある予定）の印（tasks.is_event）。To-Do（false）か予定（true）か。記録（is_time_log）の行では false。
-- - 予定は To-Do の一覧・今日の計画の To-Do・やり残し・完了数に入れない。カレンダー・予定の前の通知は To-Do の予定と同じ
-- - 列を含まない古いアプリの upsert は列に触れないので、予定は予定のまま。古いアプリの画面では To-Do に見える。既存の行は false（To-Do）
-- 何度流しても同じ形になる。
alter table public.tasks add column if not exists is_event boolean not null default false;
