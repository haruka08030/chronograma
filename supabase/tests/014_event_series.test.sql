-- 027: 毎週の予定の印 tasks.event_series と時間割の設定 user_timetable
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public', 'tasks', 'event_series', 'tasks に event_series がある');
select has_table('public', 'user_timetable', 'user_timetable がある');
select has_trigger('public', 'user_timetable', 'settings_write_guard', 'user_timetable に settings_write_guard');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'series-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'series-b@example.test');
insert into public.lists (user_id, id, name, updated_at)
values ('00000000-0000-4000-8000-00000000000a', '__inbox__', '未分類', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 毎週の予定の 1 回分（新しい行は -infinity をもとにする）
insert into public.tasks (user_id, id, list_id, title, is_event, scheduled_date, start_time, end_time, event_series, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'c1', '__inbox__', '経済学入門', true, '2026-04-06', '09:00', '10:30',
  '{"id":"s1","weekdays":[1],"until":"2026-07-27","skipHolidays":false}', '-infinity');
select is((select event_series ->> 'id' from public.tasks where id = 'c1'), 's1', '毎週の予定の印を書ける');

-- 列を含まない書き込み（前の版のアプリ）は印に触れない
select set_config('test.v1', (select updated_at::text from public.tasks where id = 'c1'), true);
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'c1', '__inbox__', '経済学入門（教室変更）', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select title from public.tasks where id = 'c1'), '経済学入門（教室変更）', '前の版の書き込みは通る');
select is((select event_series ->> 'id' from public.tasks where id = 'c1'), 's1', '前の版の書き込みでも印は残る');

-- id の無い印・object でない印は入れられない
select throws_ok(
  $$update public.tasks set event_series = '{"weekdays":[1]}', base_updated_at = updated_at where id = 'c1'$$,
  '23514', null, '印には id が要る');
select throws_ok(
  $$update public.tasks set event_series = '[]', base_updated_at = updated_at where id = 'c1'$$,
  '23514', null, '印は object');

-- 時間割の設定（初めて = -infinity）
insert into public.user_timetable (user_id, timetable, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a',
  '{"periods":[{"start":"09:00","end":"10:30"}],"termStart":"2026-04-06","termEnd":"2026-07-31","skipHolidays":false}',
  '1999-01-01T00:00:00Z', '-infinity')
on conflict (user_id) do update set timetable = excluded.timetable, base_updated_at = excluded.base_updated_at;
select is((select updated_at from public.user_timetable), now(), '新しい行の updated_at はサーバーの時刻');

-- 古い版をもとにした書き込みは捨てる
update public.user_timetable set timetable = '{"periods":[]}', base_updated_at = '2000-01-01T00:00:00Z';
select is(jsonb_array_length((select timetable -> 'periods' from public.user_timetable)), 1, '古い版をもとにした書き込みは捨てる');
select throws_ok(
  $$update public.user_timetable set timetable = '[]', base_updated_at = updated_at$$,
  '23514', null, 'timetable は object');
reset role;

-- B からは A の時間割が見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_timetable), 0, 'ほかの人の時間割は読めない');
reset role;

select * from finish();
rollback;
