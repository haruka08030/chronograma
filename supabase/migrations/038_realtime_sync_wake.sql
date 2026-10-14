-- 他の端末の変更をすぐ届ける（#410）。同期する表を Realtime の publication `supabase_realtime` に足す。
-- - 端末は通知を「同期を起こす合図」にだけ使い、中身はこれまでどおり sync_changes_since（035）の差分で取る
-- - 端末が購読するのは本人の行（user_id=eq.<自分>）の INSERT と UPDATE だけ。DELETE の通知は RLS が効かず、
--   他の人の主キーが届きうるので購読しない。行を消したことは sync_tombstones（008）の INSERT / UPDATE で知る
-- - INSERT / UPDATE の通知は、表の select の RLS（本人の行だけ）を満たす購読者にだけ届く
-- 何度流しても同じ形になる。
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'lists', 'list_sections', 'tasks', 'habits', 'sync_tombstones',
    'user_settings', 'user_extra_time_zones', 'user_active_timer', 'user_event_templates', 'user_course_links', 'user_timetable',
    'day_moods'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
