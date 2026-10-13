-- いつかの段 tasks.someday_tier（#221）。
--
-- - 'dream' は「夢」（人生レベル。本体ではなく一歩＝子を To-Do にする）、null は「やりたい」（新しく入れたものもやりたい）
-- - いつかのリスト（lists.kind = 'someday'）のルートの行だけ。ほかのリストへ移す・予定にして To-Do にするとアプリが外す
-- - 列を含まない古いアプリの upsert は列に触れないので、段は消えない
-- - 既にある行: いつかのリストの、一歩（消していない子）を持つルートの行を夢にする（アプリも保存データの版 41 で同じ規則で直す）。
--   updated_at を進めて、差分で取る端末にも届ける
--
-- 何度流しても同じ形になる（夢にする行は null のものだけ）。

alter table public.tasks add column if not exists someday_tier text;

alter table public.tasks drop constraint if exists tasks_someday_tier_check;
alter table public.tasks add constraint tasks_someday_tier_check
  check (someday_tier is null or someday_tier = 'dream');

update public.tasks t
set someday_tier = 'dream', updated_at = now()
where t.someday_tier is null
  and t.parent_id is null
  and t.deleted_at is null
  and exists (
    select 1 from public.lists l
    where l.user_id = t.user_id and l.id = t.list_id and l.kind = 'someday'
  )
  and exists (
    select 1 from public.tasks c
    where c.user_id = t.user_id and c.parent_id = t.id and c.deleted_at is null
  );
