-- 夢の一歩を予定にして To-Do になった行の、元の夢 tasks.dream_id（#430）。
--
-- - 夢の進み具合・次の一歩に数え、To-Do の行に夢の名前を添える（数えるのはアプリ）
-- - 夢を消した・かなえた・やりたいへ移しても外さない（アプリが数えない・出さないだけ）。外部キーは付けない
-- - 列を含まない古いアプリの upsert は列に触れないので、つながりは消えない。既存の行は null
--
-- 何度流しても同じ形になる。

alter table public.tasks add column if not exists dream_id text;

alter table public.tasks drop constraint if exists tasks_dream_id_check;
alter table public.tasks add constraint tasks_dream_id_check
  check (dream_id is null or char_length(dream_id) between 1 and 128);
