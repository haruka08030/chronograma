-- やらなかった予定（#528）を端末間で同期する。開始を過ぎてから消した Google の予定（行かなかった gym・休んだ授業など）を、
-- その日の予定の列に薄く・取り消し線で残す。Google は消された予定をいつまでも返さないので、アプリで持つ。
-- - user_skipped_events: 利用者ごとに 1 行。events は
--   [{ "id": Google の予定の ID, "summary", "start", "end", "startTime", "endTime", "date", "isAllDay", "colorId"?, "recurringEventId"?,
--      "skippedAt": 消された時刻, "removed"?: true（「削除」で本当に消した。Google が返す間にまた残さない印） }] の並び
-- - 書き込みは 007 / 017 の settings_write_guard で確かめる（base_updated_at の版が合うときだけ通し、updated_at はサーバーの時刻）
-- - sync_changes_since（035）の settings に版を足す。Realtime（038）の publication にも足す
-- 既にある行の値は変えない。何度流しても同じ形になる。

create table if not exists public.user_skipped_events (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  events           jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  base_updated_at  timestamptz
);

alter table public.user_skipped_events enable row level security;

drop policy if exists user_skipped_events_select_own on public.user_skipped_events;
create policy user_skipped_events_select_own on public.user_skipped_events for select using (auth.uid() = user_id);
drop policy if exists user_skipped_events_insert_own on public.user_skipped_events;
create policy user_skipped_events_insert_own on public.user_skipped_events for insert with check (auth.uid() = user_id);
drop policy if exists user_skipped_events_update_own on public.user_skipped_events;
create policy user_skipped_events_update_own on public.user_skipped_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_skipped_events_delete_own on public.user_skipped_events;
create policy user_skipped_events_delete_own on public.user_skipped_events for delete using (auth.uid() = user_id);

-- 大きさの上限（アプリでは 500 件・名前 200 字まで。それより十分大きく取る）。並びであること
alter table public.user_skipped_events drop constraint if exists user_skipped_events_size_check;
alter table public.user_skipped_events add constraint user_skipped_events_size_check
  check (jsonb_typeof(events) = 'array' and octet_length(events::text) <= 1048576);

-- 版の確かめ（007 / 017 の settings_write_guard。行は user_id だけで決まる）
drop trigger if exists settings_write_guard on public.user_skipped_events;
create trigger settings_write_guard before insert or update on public.user_skipped_events
  for each row execute function public.settings_write_guard();

-- 他の端末の変更をすぐ届ける（038 と同じ）
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_skipped_events'
     ) then
    alter publication supabase_realtime add table public.user_skipped_events;
  end if;
end $$;

-- 差分の 1 往復（035）の settings に user_skipped_events の版を足す（ほかは 043 と同じ）
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
      'user_timetable', (select s.updated_at from public.user_timetable s, me where s.user_id = me.id),
      'user_addons', (select s.updated_at from public.user_addons s, me where s.user_id = me.id),
      'user_sleep_timer', (select s.updated_at from public.user_sleep_timer s, me where s.user_id = me.id),
      'user_skipped_events', (select s.updated_at from public.user_skipped_events s, me where s.user_id = me.id)
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
