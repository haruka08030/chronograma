-- 同期の差分を 1 回の問い合わせで返す sync_changes_since(p_since, p_mood_since, p_limit)（#258）。
-- 端末は 1 分ごとに、サーバーの時刻 → 4 表 → 消えた行の印 → 上限で消した印 → 版の下限 → 設定の表を 1 つずつ順に待っていた（9 往復以上）。
-- 1 つの文で読むので、どれも同じ時点の内容（行と印が食い違わない）。RLS はそのまま効く（security invoker。読めるのは本人の行だけ）。
-- 返すもの（jsonb）:
-- - now: サーバーの時刻（sync_server_now() と同じ now()）。次の差分の目印
-- - min_sync_version: app_config の同期の取り決めの版の下限（017）
-- - lists / list_sections / tasks / habits: p_since より後に変わった行（select * と同じ形、updated_at・id の順）。
--   表ごとに p_limit + 1 行まで。p_limit を超えた表があれば、端末はページに分けた取得に切り替える
-- - tombstones: p_since より後に消えた行の印（008）。p_limit + 1 件まで
-- - tombstones_trimmed: p_since より後の印を上限で消した（010）。端末は全部を取り直す
-- - has_rows: 4 表のどれかに本人の行が 1 つでもあるか。前に取った内容があるのに無ければ、端末は全部を取り直す
--   （別の端末でアカウントごと消されると印も消えるので、差分では分からない）
-- - settings: 利用者ごとに 1 行の設定の表の updated_at（行が無ければ null）。端末は手元のもとにした版と同じなら取りに行かない
-- - day_moods: p_mood_since より後に変わった 1 日の気分の行（day・mood・note・updated_at、日付の順、p_limit + 1 行まで）。
--   p_mood_since が null なら null（端末は全部をページに分けて取る）
-- 何度流しても同じ形になる。

create or replace function public.sync_changes_since(
  p_since timestamptz,
  p_mood_since timestamptz default null,
  p_limit integer default 1000
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    'now', pg_catalog.now(),
    'min_sync_version', (select c.value from public.app_config c where c.key = 'min_sync_version'),
    'lists', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.updated_at, r.id) from (
        select t.* from public.lists t, me where t.user_id = me.id and t.updated_at > p_since order by t.updated_at, t.id limit p_limit + 1
      ) r), '[]'::jsonb),
    'list_sections', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.updated_at, r.id) from (
        select t.* from public.list_sections t, me where t.user_id = me.id and t.updated_at > p_since order by t.updated_at, t.id limit p_limit + 1
      ) r), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.updated_at, r.id) from (
        select t.* from public.tasks t, me where t.user_id = me.id and t.updated_at > p_since order by t.updated_at, t.id limit p_limit + 1
      ) r), '[]'::jsonb),
    'habits', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.updated_at, r.id) from (
        select t.* from public.habits t, me where t.user_id = me.id and t.updated_at > p_since order by t.updated_at, t.id limit p_limit + 1
      ) r), '[]'::jsonb),
    'tombstones', coalesce((
      select jsonb_agg(jsonb_build_object('table_name', r.table_name, 'row_id', r.row_id, 'deleted_at', r.deleted_at)
        order by r.deleted_at, r.table_name, r.row_id) from (
        select s.table_name, s.row_id, s.deleted_at from public.sync_tombstones s, me
        where s.user_id = me.id and s.deleted_at > p_since order by s.deleted_at, s.table_name, s.row_id limit p_limit + 1
      ) r), '[]'::jsonb),
    'tombstones_trimmed', exists (
      select 1 from public.sync_tombstone_purges p, me where p.user_id = me.id and p.last_deleted_at > p_since),
    'has_rows', exists (select 1 from public.lists t, me where t.user_id = me.id)
      or exists (select 1 from public.list_sections t, me where t.user_id = me.id)
      or exists (select 1 from public.tasks t, me where t.user_id = me.id)
      or exists (select 1 from public.habits t, me where t.user_id = me.id),
    'settings', jsonb_build_object(
      'user_settings', (select s.updated_at from public.user_settings s, me where s.user_id = me.id),
      'user_extra_time_zones', (select s.updated_at from public.user_extra_time_zones s, me where s.user_id = me.id),
      'user_active_timer', (select s.updated_at from public.user_active_timer s, me where s.user_id = me.id),
      'user_event_templates', (select s.updated_at from public.user_event_templates s, me where s.user_id = me.id),
      'user_course_links', (select s.updated_at from public.user_course_links s, me where s.user_id = me.id),
      'user_timetable', (select s.updated_at from public.user_timetable s, me where s.user_id = me.id)
    ),
    'day_moods', case when p_mood_since is null then null else coalesce((
      select jsonb_agg(jsonb_build_object('day', r.day, 'mood', r.mood, 'note', r.note, 'updated_at', r.updated_at) order by r.day) from (
        select d.day, d.mood, d.note, d.updated_at from public.day_moods d, me
        where d.user_id = me.id and d.updated_at > p_mood_since order by d.day limit p_limit + 1
      ) r), '[]'::jsonb) end
  )
$$;

revoke all on function public.sync_changes_since(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.sync_changes_since(timestamptz, timestamptz, integer) to authenticated;
