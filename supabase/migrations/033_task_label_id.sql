-- ラベルに id を持たせ、記録・To-Do・予定は id でラベルを指す（#365）。ラベルの名前・色を変えても行を書き直さない。
-- - tasks.label_id: 指しているラベルの id（user_settings.log_labels の行の id）。null はラベルなし（か、まだ付けていない）。外部キーは無い
-- - 行は今までどおり、前の版のアプリが読む名前（記録の category）・色（To-Do・予定の color）も持つ。名前・色を変えても行は書き直さないので、
--   古い名前・色のことがある（アプリは id から今の名前・色で読む）
-- - tasks.label_id_sent: この版のアプリが label_id を送った印。行には残さない（null にしてから書く）。
--   印の無い書き込み（label_id を知らない前の版のアプリ）が名前・色を変えたら、label_id を外す（id と名前・色が食い違わない。アプリは名前・色から付け直す）
-- - 埋め戻し: id の無いラベル（前の版のアプリが送った表）に名前から決まる id（md5('chronograma-label:' || 名前)。アプリの legacyLabelId と同じ）を付け、
--   label_id の無い行を、記録は category、To-Do・予定は色で埋める。updated_at は変えない（端末は同じ id を名前・色から付けるので、取り直さなくてよい）。
--   何度流してもよい（id の無い表・label_id の無い行だけを埋める）
-- 何度流しても同じ形になる。

alter table public.tasks add column if not exists label_id uuid;
alter table public.tasks add column if not exists label_id_sent boolean;

create or replace function public.tasks_label_id_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing boolean;
begin
  if tg_op = 'INSERT' then
    -- upsert で行があるときは、この後の更新側で確かめる。ここで印を消すと更新側（excluded）に届かない
    if new.label_id_sent is true then
      select exists (select 1 from public.tasks where user_id = new.user_id and id = new.id) into existing;
      if existing then
        return new;
      end if;
    end if;
    new.label_id_sent := null;
    return new;
  end if;

  -- UPDATE
  if new.label_id_sent is true then
    new.label_id_sent := null;
    return new;
  end if;
  new.label_id_sent := null;
  -- 前の版のアプリ（label_id を送らない）が名前・色を変えた: 残っている label_id は前のラベルを指しているので外す
  if new.label_id is not null and (new.category is distinct from old.category or new.color is distinct from old.color) then
    new.label_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_label_id_guard on public.tasks;
create trigger tasks_label_id_guard before insert or update on public.tasks
  for each row execute function public.tasks_label_id_guard();

-- 埋め戻し 1: ラベル表の id。名前から決まる id が、名前を変えたラベルの id と重なるときは番号を付けて決め直す（アプリの effectiveLabelIds と同じ）
update public.user_settings s
   set log_labels = (
     select jsonb_agg(
       case
         when l.value ? 'id' or jsonb_typeof(l.value -> 'name') is distinct from 'string' then l.value
         when md5('chronograma-label:' || (l.value ->> 'name'))::uuid::text in (
           select x.value ->> 'id' from jsonb_array_elements(s.log_labels) x where x.value ? 'id'
         ) then l.value || jsonb_build_object('id', md5('chronograma-label:' || (l.value ->> 'name') || chr(1) || '1')::uuid::text)
         else l.value || jsonb_build_object('id', md5('chronograma-label:' || (l.value ->> 'name'))::uuid::text)
       end
       order by l.ordinality)
     from jsonb_array_elements(s.log_labels) with ordinality l
   )
 where jsonb_typeof(s.log_labels) = 'array'
   and exists (
     select 1 from jsonb_array_elements(s.log_labels) x
      where not (x.value ? 'id') and jsonb_typeof(x.value -> 'name') = 'string'
   );

-- 埋め戻し 2: label_id の無い行。同じ名前・同じ色のラベルが 2 つあれば並びの先（アプリと同じ）
drop table if exists pg_temp.label_backfill;
create temporary table label_backfill as
select s.user_id,
       l.value ->> 'name' as name,
       (l.value ->> 'id')::uuid as id,
       l.ordinality as ord,
       case
         when (l.value ->> 'color') ~* '^#[0-9a-f]{6}$' then upper(l.value ->> 'color')
         else (select k.hex from (values
           ('radicchio', '#AD1457'), ('cherryBlossom', '#D81B60'), ('flamingo', '#E67C73'), ('tomato', '#D50000'),
           ('tangerine', '#F4511E'), ('pumpkin', '#EF6C00'), ('mango', '#F09300'), ('banana', '#F6BF26'),
           ('citron', '#E4C441'), ('avocado', '#C0CA33'), ('pistachio', '#7CB342'), ('basil', '#0B8043'),
           ('sage', '#33B679'), ('eucalyptus', '#009688'), ('peacock', '#039BE5'), ('cobalt', '#4285F4'),
           ('lavender', '#7986CB'), ('blueberry', '#3F51B5'), ('wisteria', '#B39DDB'), ('amethyst', '#9E69AF'),
           ('grape', '#8E24AA'), ('cocoa', '#795548'), ('graphite', '#616161'), ('birch', '#A79B8E'),
           -- 以前の色のキー（logCategoryColors.ts の LEGACY_KEYS）
           ('blue', '#3F51B5'), ('emerald', '#33B679'), ('violet', '#7986CB'), ('amber', '#F6BF26'), ('rose', '#E67C73'),
           ('cyan', '#039BE5'), ('orange', '#F4511E'), ('lime', '#0B8043'), ('fuchsia', '#8E24AA'), ('slate', '#616161')
         ) k(key, hex) where k.key = l.value ->> 'color')
       end as hex
  from public.user_settings s
 cross join lateral jsonb_array_elements(case when jsonb_typeof(s.log_labels) = 'array' then s.log_labels else '[]'::jsonb end)
       with ordinality l
 where jsonb_typeof(l.value -> 'name') = 'string'
   and (l.value ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.tasks t
   set label_id = b.id
  from (select distinct on (user_id, name) user_id, name, id from label_backfill order by user_id, name, ord) b
 where t.label_id is null
   and t.is_time_log
   and t.user_id = b.user_id
   and t.category = b.name;

-- 色を保存していないラベル（名前から色を決める古いラベル）は色で引けないので埋めない（アプリが名前・色から付ける）
update public.tasks t
   set label_id = b.id
  from (select distinct on (user_id, hex) user_id, hex, id from label_backfill where hex is not null order by user_id, hex, ord) b
 where t.label_id is null
   and not t.is_time_log
   and t.color is not null
   and t.user_id = b.user_id
   and upper(t.color) = b.hex;

drop table if exists pg_temp.label_backfill;
