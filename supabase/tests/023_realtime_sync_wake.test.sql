-- 038: 同期する表が Realtime の publication に入っている（端末は通知で同期を起こす）。通知に使う表はどれも本人の行だけ読める
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select ok(exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'publication supabase_realtime がある');

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t),
  t || ' が publication に入っている'
)
from unnest(array[
  'lists', 'list_sections', 'tasks', 'habits', 'sync_tombstones',
  'user_settings', 'user_extra_time_zones', 'user_active_timer', 'user_event_templates', 'user_course_links', 'user_timetable',
  'day_moods'
]) as t;

-- 通知は select の RLS を満たす購読者にだけ届く: どの表も RLS が有効
select ok(
  (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
  t || ' は RLS が有効'
)
from unnest(array[
  'lists', 'list_sections', 'tasks', 'habits', 'sync_tombstones',
  'user_settings', 'user_extra_time_zones', 'user_active_timer', 'user_event_templates', 'user_course_links', 'user_timetable',
  'day_moods'
]) as t;

select * from finish();
rollback;
