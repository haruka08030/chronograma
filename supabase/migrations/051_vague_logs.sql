-- 「なんとなく」の記録（#657）。行き来・雑用・スマホ・何をしたか分からない時間を、ふつうのラベルとは別の選択肢 1 つで記録する。
-- - tasks.is_vague: 「なんとなく」の記録。記録の行（is_time_log かつ睡眠でない）だけ true にでき、ラベル・色は持たない（アプリがそろえる）。
--   列を知らない前の版のアプリの upsert は列に触れないので印は消えない
-- - user_active_timer.vague_for: 「なんとなく」にしたタイマーの始めた時刻。started_at と同じときだけ「なんとなく」。
--   列を知らない前の版のアプリが別のタイマーを始めると started_at が変わって合わなくなるので、前の印は残らない
-- 既にある行の値は変えない。何度流しても同じ形になる。

alter table public.tasks add column if not exists is_vague boolean not null default false;

alter table public.tasks drop constraint if exists tasks_is_vague_check;
alter table public.tasks add constraint tasks_is_vague_check check (not is_vague or (is_time_log and not is_sleep));

alter table public.user_active_timer add column if not exists vague_for timestamptz;
