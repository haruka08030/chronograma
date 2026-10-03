-- Canvas 連携の最初の版の id を、いまの形（学校名入り）に書き換える。何度流しても同じ形になる。
-- 各端末の手元のデータは、アプリが保存データの版 35 で同じ規則で書き換える（src/lib/canvasLegacyMigration.ts）。
--
--   最初の版: タスク canvas-<種類>-<ID>、セクション canvas-course-<コースID>
--   いま:     タスク canvas-<学校>-<種類>-<ID>、セクション canvas-course-<学校>-<コースID>
--
-- 学校名入りに変えたとき移し替えなかったので、同じ課題がいまの id でもう 1 つ取り込まれている。
--   - いまの id の課題（双子）があれば、古い方に利用者が書いたもの（色・メモ・予定・通知・完了・置き場所）を
--     双子に写し、サブタスクを双子の下へ付け替えてから、古い方を消す
--   - 双子が無ければ、古い方の id をいまの形に付け替える
--   - 未分類に落ちた Canvas の課題は、Canvas のリストの科目のセクションへ戻す
--   - Canvas の課題のサブタスクは、親と同じリストに置く
-- 学校は 双子 → 課題の URL（description）のホスト → その人の学校が 1 つだけならそれ、の順に決める。決まらないものは触らない。

drop table if exists pg_temp.canvas_task_map;
drop table if exists pg_temp.canvas_section_map;

-- 古いタスク → いまの id
create temp table canvas_task_map as
with legacy as (
  select t.user_id, t.id, t.deleted_at,
         (regexp_match(t.id, '^canvas-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$')) as k,
         lower(substring(t.description from '^https?://([^/[:space:]]+)')) as host
  from public.tasks t
  where t.id ~ '^canvas-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'
),
current_ids as (
  select user_id, id, deleted_at,
         (regexp_match(id, '^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-(\d+)$')) as m
  from public.tasks
  where id ~ '^canvas-[a-z0-9.-]+-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'
),
known as (
  select user_id, id as conn from public.canvas_connection
  union
  select user_id, m[1] from current_ids
),
resolved as (
  select l.user_id, l.id, l.k, l.deleted_at,
         coalesce(
           (select min(c.m[1]) from current_ids c
             where c.user_id = l.user_id and c.m[2] = l.k[1] and c.m[3] = l.k[2]
             having count(distinct c.m[1]) = 1),
           case when l.host in (select conn from known k where k.user_id = l.user_id)
                  or not exists (select 1 from known k where k.user_id = l.user_id)
                then l.host end,
           (select min(conn) from known k where k.user_id = l.user_id having count(*) = 1)
         ) as conn
  from legacy l
)
select r.user_id, r.id as old_id,
       'canvas-' || r.conn || '-' || r.k[1] || '-' || r.k[2] as new_id,
       r.deleted_at is not null as old_deleted
from resolved r
where r.conn is not null;

-- 1. 双子があるもの: 利用者が書いたものを写す（ゴミ箱に入れた古い方は写さない）
update public.tasks n set
  color          = coalesce(n.color, l.color),
  priority       = case when n.priority = 'none' then l.priority else n.priority end,
  tags           = case when jsonb_array_length(n.tags) = 0 then l.tags else n.tags end,
  scheduled_date = case when n.scheduled_date is null then l.scheduled_date else n.scheduled_date end,
  start_time     = case when n.scheduled_date is null and l.scheduled_date is not null then l.start_time else n.start_time end,
  end_time       = case when n.scheduled_date is null and l.scheduled_date is not null then l.end_time else n.end_time end,
  end_date       = case when n.scheduled_date is null and l.scheduled_date is not null then l.end_date else n.end_date end,
  location       = coalesce(n.location, l.location),
  reminders      = coalesce(n.reminders, l.reminders),
  description    = case when length(l.description) > length(n.description)
                         and left(l.description, length(n.description)) = n.description
                        then l.description else n.description end,
  completed      = n.completed or l.completed,
  completed_at   = case when l.completed and not n.completed then l.completed_at else n.completed_at end,
  archived_at    = coalesce(n.archived_at, l.archived_at),
  list_id        = case when l.list_id <> '__inbox__' and l.list_id !~ '^canvas-list(-|$)' then l.list_id else n.list_id end,
  section_id     = case when l.list_id <> '__inbox__' and l.list_id !~ '^canvas-list(-|$)' then l.section_id else n.section_id end,
  updated_at     = now()
from canvas_task_map m
join public.tasks l on l.user_id = m.user_id and l.id = m.old_id
where n.user_id = m.user_id and n.id = m.new_id
  and not m.old_deleted and n.deleted_at is null;

-- 双子だけをゴミ箱に入れていたなら、双子を消して古い方を残す（下の付け替えで双子の id になる）
delete from public.tasks n
using canvas_task_map m
where n.user_id = m.user_id and n.id = m.new_id
  and not m.old_deleted and n.deleted_at is not null;

-- サブタスクを付け替える
update public.tasks c set parent_id = m.new_id, updated_at = now()
from canvas_task_map m
where c.user_id = m.user_id and c.parent_id = m.old_id;

-- 写し終えた古い方を消す
delete from public.tasks l
using canvas_task_map m
where l.user_id = m.user_id and l.id = m.old_id
  and exists (select 1 from public.tasks n where n.user_id = m.user_id and n.id = m.new_id);

-- 2. 双子が無いもの: id を付け替える（tasks.id を指す外部キーは無い）
update public.tasks l set id = m.new_id, updated_at = now()
from canvas_task_map m
where l.user_id = m.user_id and l.id = m.old_id;

-- 3. 古い科目のセクション → いまの形
create temp table canvas_section_map as
with legacy as (
  select s.user_id, s.id, (regexp_match(s.id, '^canvas-course-(\d+)$'))[1] as course_id
  from public.list_sections s
  where s.id ~ '^canvas-course-\d+$'
),
canvas_tasks as (
  select user_id, section_id,
         (regexp_match(id, '^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'))[1] as conn,
         substring(description from '^https?://[^/[:space:]]+/courses/(\d+)') as course_id
  from public.tasks
  where id ~ '^canvas-[a-z0-9.-]+-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'
),
known as (
  select user_id, id as conn from public.canvas_connection
  union
  select user_id, conn from canvas_tasks
)
select l.user_id, l.id as old_id,
       'canvas-course-' || c.conn || '-' || l.course_id as new_id
from legacy l
cross join lateral (
  select coalesce(
    (select min(t.conn) from canvas_tasks t where t.user_id = l.user_id and t.section_id = l.id having count(distinct t.conn) = 1),
    (select min(t.conn) from canvas_tasks t where t.user_id = l.user_id and t.course_id = l.course_id having count(distinct t.conn) = 1),
    (select min(k.conn) from known k where k.user_id = l.user_id having count(*) = 1)
  ) as conn
) c
where c.conn is not null;

-- 無ければ作る（主キーを書き換えると tasks の外部キーに当たるので、作って付け替えてから消す）
insert into public.list_sections (user_id, id, list_id, name, sort_order, updated_at)
select s.user_id, m.new_id, s.list_id, s.name, s.sort_order, now()
from canvas_section_map m
join public.list_sections s on s.user_id = m.user_id and s.id = m.old_id
on conflict (user_id, id) do nothing;

update public.tasks t set section_id = m.new_id, updated_at = now()
from canvas_section_map m
where t.user_id = m.user_id and t.section_id = m.old_id;

delete from public.list_sections s
using canvas_section_map m
where s.user_id = m.user_id and s.id = m.old_id;

-- 4. 未分類に落ちた Canvas の課題を、科目のセクション（無ければ Canvas のリスト）へ戻す
update public.tasks t set
  list_id    = coalesce(s.list_id, 'canvas-list'),
  section_id = s.id,
  updated_at = now()
from public.tasks t2
left join public.list_sections s
  on s.user_id = t2.user_id
 and s.id = 'canvas-course-'
          || (regexp_match(t2.id, '^canvas-([a-z0-9.-]+)-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'))[1]
          || '-' || substring(t2.description from '^https?://[^/[:space:]]+/courses/(\d+)')
where t.user_id = t2.user_id and t.id = t2.id
  and t.id ~ '^canvas-[a-z0-9.-]+-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'
  and t.list_id = '__inbox__' and t.parent_id is null and t.deleted_at is null
  and (s.id is not null or exists (select 1 from public.lists l where l.user_id = t.user_id and l.id = 'canvas-list'));

-- 5. Canvas の課題のサブタスクを、いちばん上の課題と同じリストへ
with recursive tree as (
  select user_id, id, list_id as root_list from public.tasks
  where parent_id is null
    and id ~ '^canvas-[a-z0-9.-]+-(assignment|quiz|discussion_topic|wiki_page|planner_note)-\d+$'
  union all
  select c.user_id, c.id, tree.root_list
  from public.tasks c join tree on c.user_id = tree.user_id and c.parent_id = tree.id
)
update public.tasks t set list_id = tree.root_list, section_id = null, updated_at = now()
from tree
where t.user_id = tree.user_id and t.id = tree.id and t.parent_id is not null and t.list_id <> tree.root_list;

drop table if exists pg_temp.canvas_task_map;
drop table if exists pg_temp.canvas_section_map;
