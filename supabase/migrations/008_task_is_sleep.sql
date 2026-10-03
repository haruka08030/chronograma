-- ===========================================================================
-- 睡眠の印（tasks.is_sleep）。`001` は表が既にあると列を足さないので、古い DB にはここで足す。
-- 列が無い間はアプリが is_sleep を外して保存していたので、睡眠の記録は印の無いまま残っている。
-- `src/lib/sleep.ts` の looksLikeSleep と同じく、タイトルかラベルが「睡眠」の記録に印を付け直す。
-- updated_at を進めて、各端末が印の付いた方を読み込むようにする。何度流しても同じ形になる。
-- ===========================================================================
alter table public.tasks add column if not exists is_sleep boolean not null default false;

update public.tasks
set is_sleep = true, updated_at = now()
where is_time_log
  and not is_sleep
  and (
    lower(btrim(normalize(title, NFKC))) in ('睡眠', 'すいみん', '就寝', '寝る', 'ねる', 'sleep', 'sleeping')
    or lower(btrim(normalize(tags ->> 0, NFKC))) in ('睡眠', 'すいみん', '就寝', '寝る', 'ねる', 'sleep', 'sleeping')
  );
